/**
 * Testes de integração do módulo da Proprietária:
 * HTTP → Route → Controller → Service → Repository → MySQL (com o login real).
 *
 * Usa um banco separado, marmitaria_test, recriado a cada execução com todos os
 * scripts de database/schema (os mesmos do npm run db:migrate).
 * O usuário do banco precisa poder criar esse banco. Se não puder, rode uma vez como root:
 *   CREATE DATABASE marmitaria_test; GRANT ALL ON marmitaria_test.* TO 'marmitaria'@'%';
 */
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

const DB = process.env.DB_NAME!; // marmitaria_test (vitest.config.ts)
const SCHEMA_DIR = path.resolve(__dirname, '../../../database/schema');

let admin: mysql.Connection;
let owner: { Authorization: string };
let customer: { Authorization: string };

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
});

afterAll(async () => {
  await db.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin?.end();
});

beforeEach(async () => {
  await admin.query('DELETE FROM business_hours');
  for (let weekday = 0; weekday < 7; weekday++) {
    await admin.query("INSERT INTO business_hours (weekday, opens_at, closes_at) VALUES (?, '00:00', '23:59')", [weekday]);
  }
  await admin.query('SET FOREIGN_KEY_CHECKS = 0');
  // menus antes de menu_items: assim o trigger de cardápio encerrado não barra a limpeza
  for (const t of ['menus', 'menu_items', 'product_variants', 'products', 'delivery_fee_ranges']) {
    await admin.query(`DELETE FROM ${t}`);
  }
  await admin.query('DROP TABLE IF EXISTS order_items');
  await admin.query('SET FOREIGN_KEY_CHECKS = 1');
});

const count = async (sql: string, params: unknown[] = []) => {
  const [rows] = await admin.query<mysql.RowDataPacket[]>(sql, params);
  return Number(rows[0].n);
};

async function createFrango() {
  const res = await request(app)
    .post('/owner/products')
    .set(owner)
    .send({
      name: 'Marmita de Frango',
      description: 'Frango grelhado com arroz, feijão e salada',
      category: 'Marmitas',
      variants: [
        { name: 'Média', price: 22 },
        { name: 'Grande', price: 26.5 },
      ],
    });
  expect(res.status).toBe(201);
  return res.body;
}

describe('acesso (login real do módulo base)', () => {
  it('duplica cardápio com itens e preço especial em rascunho', async () => {
    const product = await createFrango();
    const source = await request(app).post('/owner/menus').set(owner).send({ name: 'Original', menuDate: todayISODate() }).expect(201);
    await request(app).post(`/owner/menus/${source.body.id}/items`).set(owner).send({ variantId: product.variants[0].id, specialPrice: 19.9 }).expect(201);
    const copy = await request(app).post(`/owner/menus/${source.body.id}/duplicate`).set(owner).send({ name: 'Cardápio de Segunda-Feira', menuDate: todayISODate(), weekday: 1 }).expect(201);
    expect(copy.body).toMatchObject({ name: 'Cardápio de Segunda-Feira', status: 'DRAFT', weekday: 1, itemCount: 1 });
    const detail = await request(app).get(`/owner/menus/${copy.body.id}`).set(owner).expect(200);
    expect(detail.body.items[0]).toMatchObject({ variantId: product.variants[0].id, specialPrice: 19.9 });
  });
  it('salva horário como proprietária e disponibiliza para o cliente', async () => {
    const days = Array.from({ length: 7 }, (_, weekday) => ({ weekday, opensAt: weekday === 1 ? '11:00' : null, closesAt: weekday === 1 ? '14:00' : null }));
    await request(app).put('/owner/business-hours').set(customer).send({ days }).expect(403);
    await request(app).put('/owner/business-hours').set(owner).send({ days }).expect(200);
    const result = await request(app).get('/business-hours').expect(200);
    expect(result.body.configured).toBe(true);
    expect(result.body.days[1]).toMatchObject({ opensAt: '11:00', closesAt: '14:00' });
  });
  it('impede uma segunda proprietária mesmo via alteração de perfil', async () => {
    await admin.beginTransaction();
    try {
      await admin.query("INSERT INTO users (id, name, email, password_hash, role) VALUES (UUID(), 'Teste', 'limite-owner@teste.com', 'hash', 'CUSTOMER')");
      await expect(admin.query("UPDATE users SET role = 'OWNER' WHERE email = 'limite-owner@teste.com'")).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
      await expect(admin.query("INSERT INTO users (id, name, email, password_hash, role) VALUES (UUID(), 'Outra', 'outra-owner@teste.com', 'hash', 'OWNER')")).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    } finally {
      await admin.rollback();
    }
  });

  it('sem token: 401; cliente: 403; proprietária: 200', async () => {
    expect((await request(app).get('/owner/products')).status).toBe(401);
    expect((await request(app).get('/owner/products').set(customer)).status).toBe(403);
    expect((await request(app).get('/owner/products').set(owner)).status).toBe(200);
  });

  it('dados inválidos: 400 com os campos; id malformado: 404', async () => {
    const r = await request(app).post('/owner/products').set(owner).send({ name: '', variants: [] });
    expect(r.status).toBe(400);
    expect(r.body.issues.map((i: { field: string }) => i.field)).toEqual(expect.arrayContaining(['name', 'variants']));
    expect((await request(app).get('/owner/products/123').set(owner)).status).toBe(404);
  });
});

describe('produtos e variações', () => {
  it('cria com variações, preços em reais, e lê de volta', async () => {
    const p = await createFrango();
    expect(p).toMatchObject({ name: 'Marmita de Frango', category: 'marmitas', active: true });
    expect(p.variants.map((v: { name: string; price: number }) => [v.name, v.price])).toEqual([
      ['Média', 22],
      ['Grande', 26.5],
    ]);
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('nome repetido (maiúsculas/acentos diferentes) é recusado', async () => {
    await createFrango();
    const r = await request(app).post('/owner/products').set(owner).send({ name: 'MARMITA DE FRANGO', variants: [{ name: 'X', price: 1 }] });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Já existe/);
  });

  it('edita, adiciona e altera variação, desativa', async () => {
    const p = await createFrango();
    await request(app).put(`/owner/products/${p.id}`).set(owner).send({ name: 'Frango Grelhado', description: 'Com salada' }).expect(200);
    const v = await request(app).post(`/owner/products/${p.id}/variants`).set(owner).send({ name: 'Pequena', price: 18 });
    expect(v.status).toBe(201);
    await request(app).put(`/owner/variants/${v.body.id}`).set(owner).send({ name: 'Pequena', price: 19.9 }).expect(200);
    await request(app).patch(`/owner/products/${p.id}/active`).set(owner).send({ active: false }).expect(200);
    const got = await request(app).get(`/owner/products/${p.id}`).set(owner);
    expect(got.body).toMatchObject({ name: 'Frango Grelhado', active: false, category: null });
    expect(got.body.variants[0]).toMatchObject({ name: 'Pequena', price: 19.9 });
  });

  it('exclui produto sem uso; com pedido, pede para desativar', async () => {
    const a = await createFrango();
    await request(app).delete(`/owner/products/${a.id}`).set(owner).expect(204);
    expect(await count('SELECT COUNT(*) n FROM product_variants')).toBe(0);

    const b = await createFrango();
    // simula a tabela do módulo do Cliente com um pedido que usou a variação
    await admin.query('CREATE TABLE order_items (id CHAR(36) PRIMARY KEY, variant_id CHAR(36) NOT NULL)');
    await admin.query('INSERT INTO order_items VALUES (UUID(), ?)', [b.variants[0].id]);
    const r = await request(app).delete(`/owner/products/${b.id}`).set(owner);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/Desative/);
  });
});

describe('cardápio do dia: da proprietária ao cliente', () => {
  it('ciclo completo e GET /menus/today no formato do app do cliente', async () => {
    const p = await createFrango();
    const [media, grande] = p.variants;
    const coca = (
      await request(app).post('/owner/products').set(owner).send({ name: 'Coca-Cola', category: 'bebidas', variants: [{ name: 'Lata', price: 5 }] })
    ).body;

    const m = await request(app).post('/owner/menus').set(owner).send({ name: 'Cardápio do dia', menuDate: todayISODate() });
    expect(m.body).toMatchObject({ status: 'DRAFT', menuDate: todayISODate(), itemCount: 0 });

    const i1 = await request(app).post(`/owner/menus/${m.body.id}/items`).set(owner).send({ variantId: media.id, specialPrice: 19.9 });
    expect(i1.status).toBe(201);
    await request(app).post(`/owner/menus/${m.body.id}/items`).set(owner).send({ variantId: grande.id }).expect(201);
    await request(app).post(`/owner/menus/${m.body.id}/items`).set(owner).send({ variantId: coca.variants[0].id }).expect(201);
    expect((await request(app).post(`/owner/menus/${m.body.id}/items`).set(owner).send({ variantId: grande.id })).status).toBe(409);

    expect((await request(app).get('/menus/today')).status).toBe(404);
    const act = await request(app).post(`/owner/menus/${m.body.id}/activate`).set(owner);
    expect(act.status).toBe(200);
    expect(act.body.status).toBe('ACTIVE');

    const today = await request(app).get('/menus/today'); // público, sem login
    expect(today.status).toBe(200);
    expect(today.body).toMatchObject({ menuId: m.body.id, date: todayISODate(), status: 'ACTIVE' });
    expect(today.body.items.map((i: { name: string; price: number }) => [i.name, i.price])).toEqual([
      ['Coca-Cola', 5],
      ['Marmita de Frango', 19.9],
    ]);
    expect(today.body.items[1].variations).toEqual([
      { variantId: media.id, name: 'Média', price: 19.9, standardPrice: 22 },
      { variantId: grande.id, name: 'Grande', price: 26.5, standardPrice: 26.5 },
    ]);

    // tira o preço especial: volta ao padrão na hora
    await request(app).patch(`/owner/menus/${m.body.id}/items/${i1.body.itemId}`).set(owner).send({ specialPrice: null }).expect(200);
    expect((await request(app).get('/menus/today')).body.items[1].variations[0].price).toBe(22);

    // proprietária vê detalhes, incluindo disponibilidade
    await request(app).patch(`/owner/products/${coca.id}/active`).set(owner).send({ active: false }).expect(200);
    const detail = await request(app).get(`/owner/menus/${m.body.id}`).set(owner);
    expect(detail.body.items.find((i: { productName: string }) => i.productName === 'Coca-Cola').available).toBe(false);
    expect((await request(app).get('/menus/today')).body.items.map((i: { name: string }) => i.name)).toEqual(['Marmita de Frango']);

    await request(app).post(`/owner/menus/${m.body.id}/close`).set(owner).expect(200);
    expect((await request(app).get('/menus/today')).status).toBe(404);
    expect((await request(app).delete(`/owner/menus/${m.body.id}`).set(owner)).status).toBe(409);
  });

  it('prepara e aprova uma cópia do modelo semanal', async () => {
    const date = todayISODate();
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const p = await createFrango();
    const template = await request(app).post('/owner/menus').set(owner).send({ name: 'Modelo semanal', menuDate: date, weekday }).expect(201);
    await request(app).post(`/owner/menus/${template.body.id}/items`).set(owner).send({ variantId: p.variants[0].id, specialPrice: 19.9 }).expect(201);
    await request(app).post(`/owner/menus/${template.body.id}/activate`).set(owner).expect(409);
    const prepared = await request(app).post(`/owner/menus/${template.body.id}/prepare`).set(owner).expect(201);
    expect(prepared.body).toMatchObject({ weekday: null, status: 'DRAFT', menuDate: date, itemCount: 1 });
    await request(app).get('/menus/today').expect(404);
    await request(app).post(`/owner/menus/${prepared.body.id}/activate`).set(owner).expect(200);
    expect((await request(app).get('/menus/today')).body.menuId).toBe(prepared.body.id);
    expect((await request(app).get(`/owner/menus/${template.body.id}`).set(owner)).body.status).toBe('DRAFT');
  });

  it('só um ativo por vez (a procedure confere com bloqueio)', async () => {
    const p = await createFrango();
    const mk = async (name: string) => {
      const m = await request(app).post('/owner/menus').set(owner).send({ name, menuDate: todayISODate() });
      expect(m.status).toBe(201);
      await request(app).post(`/owner/menus/${m.body.id}/items`).set(owner).send({ variantId: p.variants[0].id }).expect(201);
      return m.body.id as string;
    };
    const a = await mk('Almoço');
    const b = await mk('Jantar');
    await request(app).post(`/owner/menus/${a}/activate`).set(owner).expect(200);
    const r = await request(app).post(`/owner/menus/${b}/activate`).set(owner);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/"Almoço" ainda está ativo/);
    expect(await count("SELECT COUNT(*) n FROM menus WHERE status = 'ACTIVE'")).toBe(1);
  });
});

describe('faixas de taxa', () => {
  it('cadastra em km/reais, simula, recusa sobreposição e desativa', async () => {
    await request(app).post('/owner/delivery-fees').set(owner).send({ minKm: 0, maxKm: 5, fee: 6 }).expect(201);
    await request(app).post('/owner/delivery-fees').set(owner).send({ minKm: 5, maxKm: 10, fee: 10 }).expect(201);
    expect((await request(app).get('/owner/delivery-fees/quote?distanceKm=5').set(owner)).body).toMatchObject({ covered: true, fee: 6 });
    expect((await request(app).get('/owner/delivery-fees/quote?distanceKm=12').set(owner)).body.covered).toBe(false);
    const clash = await request(app).post('/owner/delivery-fees').set(owner).send({ minKm: 4, maxKm: 6, fee: 1 });
    expect(clash.status).toBe(409);

    const list = await request(app).get('/owner/delivery-fees').set(owner);
    expect(list.body.map((r: { minKm: number; fee: number }) => [r.minKm, r.fee])).toEqual([
      [0, 6],
      [5, 10],
    ]);
    await request(app).delete(`/owner/delivery-fees/${list.body[0].id}`).set(owner).expect(204);
    expect(await count('SELECT COUNT(*) n FROM delivery_fee_ranges')).toBe(2); // desativada, não apagada
  });
});

describe('objetos do banco (view, functions, procedure, triggers)', () => {
  it('fn_delivery_fee usa a mesma regra de faixa do backend', async () => {
    await request(app).post('/owner/delivery-fees').set(owner).send({ minKm: 0, maxKm: 5, fee: 6 });
    await request(app).post('/owner/delivery-fees').set(owner).send({ minKm: 5, maxKm: 10, fee: 10 });
    const [rows] = await admin.query<mysql.RowDataPacket[]>(
      'SELECT fn_delivery_fee(0) a, fn_delivery_fee(5000) b, fn_delivery_fee(5001) c, fn_delivery_fee(10001) d',
    );
    expect(rows[0]).toEqual({ a: '6.00', b: '6.00', c: '10.00', d: null });
  });

  it('trigger barra faixa sobreposta inserida direto no banco', async () => {
    await admin.query('INSERT INTO delivery_fee_ranges (id, min_meters, max_meters, fee) VALUES (UUID(), 0, 5000, 6)');
    await expect(
      admin.query('INSERT INTO delivery_fee_ranges (id, min_meters, max_meters, fee) VALUES (UUID(), 4000, 6000, 1)'),
    ).rejects.toThrow('Essa faixa se sobrepõe a outra faixa ativa');
  });

  it('trigger barra mudança em cardápio encerrado; view calcula preço com CASE', async () => {
    const p = await createFrango();
    const m = await request(app).post('/owner/menus').set(owner).send({ name: 'Almoço', menuDate: todayISODate() });
    await request(app).post(`/owner/menus/${m.body.id}/items`).set(owner).send({ variantId: p.variants[0].id, specialPrice: 19.9 }).expect(201);
    const [view] = await admin.query<mysql.RowDataPacket[]>(
      'SELECT standard_price, special_price, effective_price, has_special_price, available FROM vw_menu_items WHERE menu_id = ?',
      [m.body.id],
    );
    expect(view[0]).toEqual({ standard_price: '22.00', special_price: '19.90', effective_price: '19.90', has_special_price: 1, available: 1 });

    await request(app).post(`/owner/menus/${m.body.id}/activate`).set(owner).expect(200);
    await request(app).post(`/owner/menus/${m.body.id}/close`).set(owner).expect(200);
    await expect(admin.query('DELETE FROM menu_items WHERE menu_id = ?', [m.body.id])).rejects.toThrow('Cardápios encerrados');
  });

  it('procedure sp_activate_menu valida direto no banco', async () => {
    const m = await request(app).post('/owner/menus').set(owner).send({ name: 'Vazio', menuDate: todayISODate() });
    await expect(admin.query('CALL sp_activate_menu(?)', [m.body.id])).rejects.toThrow('ao menos um item');
  });
});
