/**
 * Testes de integração da administração de pedidos (item 5 do módulo da Proprietária):
 * HTTP → Route → Controller → Service → Repository → MySQL, com o login real e o
 * trigger de status do banco (script 019).
 *
 * Usa o mesmo banco separado dos outros testes de integração (marmitaria_test),
 * recriado no início deste arquivo com todos os scripts de database/schema.
 */
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { splitStatements } from '../../scripts/migrate';
import { app } from '../../src/app';
import { db } from '../../src/config/database';
import { usersRepository } from '../../src/modules/users/users.repository';
import { todayISODate } from '../../src/shared/utils/date';

const DB = process.env.DB_NAME!; // marmitaria_test (vitest.config.mts)
const SCHEMA_DIR = path.resolve(__dirname, '../../../database/schema');

let admin: mysql.Connection;
let owner: { Authorization: string };
let customer: { Authorization: string };
let customerId: string;
let variantId: string;
let menuId: string;
let addressId: string;

async function login(email: string, password: string) {
  const res = await request(app).post('/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return { Authorization: `Bearer ${res.body.accessToken}` };
}

beforeAll(async () => {
  admin = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.changeUser({ database: DB });
  for (const file of (await readdir(SCHEMA_DIR)).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of splitStatements(await readFile(path.join(SCHEMA_DIR, file), 'utf8'))) {
      await admin.query(statement);
    }
  }

  const passwordHash = await bcrypt.hash('123456', 4);
  await usersRepository.create({ name: 'Dona Maria', email: 'maria@teste.com', passwordHash, role: 'OWNER' });
  await usersRepository.create({ name: 'Ana Cliente', email: 'ana@teste.com', passwordHash, role: 'CUSTOMER' });
  owner = await login('maria@teste.com', '123456');
  customer = await login('ana@teste.com', '123456');

  // dados fixos: um produto, o cardápio de hoje e o endereço da cliente
  const [[ana]] = await admin.query<mysql.RowDataPacket[]>("SELECT id FROM users WHERE email = 'ana@teste.com'");
  customerId = ana.id;
  const productId = randomUUID();
  variantId = randomUUID();
  menuId = randomUUID();
  addressId = randomUUID();
  await admin.query('INSERT INTO products (id, name) VALUES (?, ?)', [productId, 'Marmita de Frango']);
  await admin.query('INSERT INTO product_variants (id, product_id, name, price) VALUES (?, ?, ?, 22)', [
    variantId,
    productId,
    'Média',
  ]);
  await admin.query('INSERT INTO menus (id, name, menu_date) VALUES (?, ?, ?)', [menuId, 'Hoje', todayISODate()]);
  await admin.query(
    `INSERT INTO addresses (id, user_id, label, cep, street, number, district, city, state, latitude, longitude)
     VALUES (?, ?, 'Casa', '13330010', 'Rua Prudente de Moraes', '100', 'Centro', 'Indaiatuba', 'SP', -23.088, -47.216)`,
    [addressId, customerId],
  );
});

afterAll(async () => {
  await db.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin?.end();
});

beforeEach(async () => {
  await admin.query('SET FOREIGN_KEY_CHECKS = 0');
  await admin.query('DELETE FROM order_items');
  await admin.query('DELETE FROM orders');
  await admin.query('SET FOREIGN_KEY_CHECKS = 1');
});

/** Grava um pedido direto no banco, como o módulo do Cliente grava (2 marmitas + taxa de R$ 6). */
async function createOrder(status = 'PENDING') {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO orders
       (id, customer_id, menu_id, status, payment_method, address_id, address_label, address_cep, address_street,
        address_number, address_district, address_city, address_state, address_latitude, address_longitude,
        distance_meters, subtotal, delivery_fee, total)
     VALUES (?, ?, ?, ?, 'PIX', ?, 'Casa', '13330010', 'Rua Prudente de Moraes', '100', 'Centro', 'Indaiatuba', 'SP',
             -23.088, -47.216, 3200, 44, 6, 50)`,
    [id, customerId, menuId, status, addressId],
  );
  await admin.query(
    `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, variant_name, quantity, unit_price, subtotal)
     SELECT ?, ?, product_id, id, 'Marmita de Frango', name, 2, 22, 44 FROM product_variants WHERE id = ?`,
    [randomUUID(), id, variantId],
  );
  return id;
}

/** Pedido de retirada no local (script 022): sem endereço, sem distância e sem taxa. */
async function createPickupOrder(status = 'PENDING') {
  const id = randomUUID();
  await admin.query(
    `INSERT INTO orders (id, customer_id, menu_id, status, fulfillment, payment_method, subtotal, delivery_fee, total)
     VALUES (?, ?, ?, ?, 'PICKUP', 'PIX', 44, 0, 44)`,
    [id, customerId, menuId, status],
  );
  await admin.query(
    `INSERT INTO order_items (id, order_id, product_id, variant_id, product_name, variant_name, quantity, unit_price, subtotal)
     SELECT ?, ?, product_id, id, 'Marmita de Frango', name, 2, 22, 44 FROM product_variants WHERE id = ?`,
    [randomUUID(), id, variantId],
  );
  return id;
}

const statusOf = async (id: string) => {
  const [[row]] = await admin.query<mysql.RowDataPacket[]>('SELECT status, confirmed_at FROM orders WHERE id = ?', [id]);
  return row;
};

describe('Pedidos da proprietária (/owner/orders)', () => {
  it('lista os pedidos com o resumo e o nome da cliente', async () => {
    await createOrder();
    const res = await request(app).get('/owner/orders?active=true').set(owner);
    expect(res.status).toBe(200);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0]).toMatchObject({
      status: 'PENDING',
      isActive: true,
      total: 50,
      itemCount: 2,
      itemsSummary: '2x Marmita de Frango (Média)',
      customer: { name: 'Ana Cliente' },
    });
  });

  it('filtra em andamento e finalizados', async () => {
    await createOrder('PENDING');
    await createOrder('CANCELLED');
    const ativos = await request(app).get('/owner/orders?active=true').set(owner);
    const finalizados = await request(app).get('/owner/orders?active=false').set(owner);
    expect(ativos.body.orders.map((o: { status: string }) => o.status)).toEqual(['PENDING']);
    expect(finalizados.body.orders.map((o: { status: string }) => o.status)).toEqual(['CANCELLED']);
  });

  it('mostra o pedido completo com itens, endereço e cliente', async () => {
    const id = await createOrder();
    const res = await request(app).get(`/owner/orders/${id}`).set(owner);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      subtotal: 44,
      deliveryFee: 6,
      total: 50,
      address: { street: 'Rua Prudente de Moraes', number: '100' },
      customer: { name: 'Ana Cliente' },
    });
    expect(res.body.items[0]).toMatchObject({ variantName: 'Média', quantity: 2, unitPrice: 22 });
    expect(res.body.customerId).toBeUndefined();
  });

  it('confirma, inicia o preparo e marca como pronto; o banco grava o horário', async () => {
    const id = await createOrder();
    const confirmado = await request(app).post(`/owner/orders/${id}/confirm`).set(owner);
    expect(confirmado.status).toBe(200);
    expect(confirmado.body.status).toBe('CONFIRMED');
    expect((await statusOf(id)).confirmed_at).not.toBeNull();

    expect((await request(app).post(`/owner/orders/${id}/prepare`).set(owner)).body.status).toBe('PREPARING');
    expect((await request(app).post(`/owner/orders/${id}/ready`).set(owner)).body.status).toBe('READY');
  });

  it('recusa pular etapas', async () => {
    const id = await createOrder();
    const res = await request(app).post(`/owner/orders/${id}/ready`).set(owner);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/aguardando confirmação/);
    expect((await statusOf(id)).status).toBe('PENDING');
  });

  it('cancela até "pronto", mas não depois de sair para entrega', async () => {
    const pronto = await createOrder('READY');
    expect((await request(app).post(`/owner/orders/${pronto}/cancel`).set(owner)).body.status).toBe('CANCELLED');

    const saiu = await createOrder('OUT_FOR_DELIVERY');
    const res = await request(app).post(`/owner/orders/${saiu}/cancel`).set(owner);
    expect(res.status).toBe(409);
    expect((await statusOf(saiu)).status).toBe('OUT_FOR_DELIVERY');
  });

  it('pedido cancelado não muda mais', async () => {
    const id = await createOrder('CANCELLED');
    expect((await request(app).post(`/owner/orders/${id}/confirm`).set(owner)).status).toBe(409);
  });

  it('pedido inexistente: 404', async () => {
    expect((await request(app).get(`/owner/orders/${randomUUID()}`).set(owner)).status).toBe(404);
    expect((await request(app).post(`/owner/orders/${randomUUID()}/confirm`).set(owner)).status).toBe(404);
  });

  it('cliente não acessa as rotas da proprietária', async () => {
    const id = await createOrder();
    expect((await request(app).get('/owner/orders').set(customer)).status).toBe(403);
    expect((await request(app).post(`/owner/orders/${id}/confirm`).set(customer)).status).toBe(403);
    expect((await request(app).get('/owner/orders')).status).toBe(401);
  });

  describe('retirada no local', () => {
    it('mostra o pedido sem endereço e sem taxa', async () => {
      const id = await createPickupOrder();
      const res = await request(app).get(`/owner/orders/${id}`).set(owner);
      expect(res.body).toMatchObject({ fulfillment: 'PICKUP', address: null, distanceMeters: null, deliveryFee: 0, total: 44 });
      const lista = await request(app).get('/owner/orders?active=true').set(owner);
      expect(lista.body.orders[0]).toMatchObject({ fulfillment: 'PICKUP', addressStreet: null });
    });

    it('marca como retirado (READY → DELIVERED) e o pedido vai para os finalizados', async () => {
      const id = await createPickupOrder('READY');
      const res = await request(app).post(`/owner/orders/${id}/pickup`).set(owner);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DELIVERED');
      expect(res.body.deliveredAt).not.toBeNull();
      const finalizados = await request(app).get('/owner/orders?active=false').set(owner);
      expect(finalizados.body.orders.map((o: { id: string }) => o.id)).toEqual([id]);
    });

    it('recusa marcar como retirado antes de ficar pronto', async () => {
      const id = await createPickupOrder('PREPARING');
      expect((await request(app).post(`/owner/orders/${id}/pickup`).set(owner)).status).toBe(409);
      expect((await statusOf(id)).status).toBe('PREPARING');
    });

    it('pedido de entrega não pode ser marcado como retirado', async () => {
      const id = await createOrder('READY');
      const res = await request(app).post(`/owner/orders/${id}/pickup`).set(owner);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/entrega/);
      expect((await statusOf(id)).status).toBe('READY');
    });

    it('o banco recusa retirada saindo para entrega e entrega pulando a saída', async () => {
      const retirada = await createPickupOrder('READY');
      await expect(admin.query("UPDATE orders SET status = 'OUT_FOR_DELIVERY' WHERE id = ?", [retirada])).rejects.toThrow(
        /retirada/,
      );
      const entrega = await createOrder('READY');
      await expect(admin.query("UPDATE orders SET status = 'DELIVERED' WHERE id = ?", [entrega])).rejects.toThrow(
        /sair para entrega/,
      );
      await expect(admin.query("UPDATE orders SET fulfillment = 'PICKUP' WHERE id = ?", [entrega])).rejects.toThrow();
    });

    it('o banco recusa retirada com taxa ou entrega sem endereço', async () => {
      await expect(
        admin.query(
          `INSERT INTO orders (id, customer_id, menu_id, fulfillment, payment_method, subtotal, delivery_fee, total)
           VALUES (?, ?, ?, 'PICKUP', 'PIX', 44, 6, 50)`,
          [randomUUID(), customerId, menuId],
        ),
      ).rejects.toThrow(/chk_orders_fulfillment/);
      await expect(
        admin.query(
          `INSERT INTO orders (id, customer_id, menu_id, fulfillment, payment_method, subtotal, delivery_fee, total)
           VALUES (?, ?, ?, 'DELIVERY', 'PIX', 44, 0, 44)`,
          [randomUUID(), customerId, menuId],
        ),
      ).rejects.toThrow(/chk_orders_fulfillment/);
    });
  });
});
