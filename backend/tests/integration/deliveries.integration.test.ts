/** Etapa 2: requisições HTTP e transações MySQL reais, sempre em marmitaria_test. */
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { splitStatements } from '../../scripts/migrate';
import { app } from '../../src/app';
import { db } from '../../src/config/database';
import { signAccessToken } from '../../src/modules/auth/tokens';
import type { DeliveryStatus } from '../../src/modules/deliveries/delivery.types';
import type { OrderStatus } from '../../src/modules/orders/order.types';
import type { Role } from '../../src/modules/users/user.types';

const identities = {
  owner: { id: randomUUID(), role: 'OWNER' },
  courier: { id: randomUUID(), role: 'COURIER' },
  otherCourier: { id: randomUUID(), role: 'COURIER' },
  customer: { id: randomUUID(), role: 'CUSTOMER' },
  otherCustomer: { id: randomUUID(), role: 'CUSTOMER' },
} satisfies Record<string, { id: string; role: Role }>;
type Identity = keyof typeof identities;
const auth = (who: Identity) => ({ Authorization: `Bearer ${signAccessToken({ sub: identities[who].id, role: identities[who].role })}` });
const menuId = randomUUID();
const addressId = randomUUID();
let admin: mysql.Connection;
let migrationResult: { recovered: string[]; preserved: string[]; countAfterRepeat: number };

async function sqlFile(file: string) {
  const sql = await readFile(path.resolve(__dirname, '../../../database/schema', file), 'utf8');
  for (const statement of splitStatements(sql)) await admin.query(statement);
}

/** O endereço referenciado existe de verdade: não desliga FKs para fabricar o cenário. */
async function createOrder(status: OrderStatus = 'PENDING', pickup = false): Promise<string> {
  const id = randomUUID();
  if (pickup) {
    await admin.query(`INSERT INTO orders (id, customer_id, menu_id, status, fulfillment, payment_method, subtotal, delivery_fee, total)
      VALUES (?, ?, ?, ?, 'PICKUP', 'PIX', 20, 0, 20)`, [id, identities.customer.id, menuId, status]);
  } else {
    await admin.query(`INSERT INTO orders (id, customer_id, menu_id, status, payment_method, change_for, notes,
      address_id, address_label, address_cep, address_street, address_number, address_complement, address_district,
      address_city, address_state, address_latitude, address_longitude, distance_meters, subtotal, delivery_fee, total)
      VALUES (?, ?, ?, ?, 'CASH', 50, 'Interfone 10', ?, 'Casa', '13330010', 'Rua Teste', '10', 'Casa azul',
      'Centro', 'Indaiatuba', 'SP', -23.088, -47.216, 3000, 20, 6, 26)`,
    [id, identities.customer.id, menuId, status, addressId]);
  }
  return id;
}

beforeAll(async () => {
  if (process.env.DB_NAME !== 'marmitaria_test') throw new Error('Os testes exigem banco isolado');
  admin = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  await admin.query('DROP DATABASE IF EXISTS `marmitaria_test`');
  await admin.query('CREATE DATABASE `marmitaria_test` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await admin.changeUser({ database: 'marmitaria_test' });
  await admin.query("SET time_zone = '+00:00'");
  const files = (await readdir(path.resolve(__dirname, '../../../database/schema'))).filter(f => f.endsWith('.sql')).sort();
  for (const file of files.filter(f => f < '026')) await sqlFile(file);
  for (const [name, identity] of Object.entries(identities)) {
    await admin.query('INSERT INTO users (id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [identity.id, name, `${name}@example.test`, '(19) 99999-8888', 'unused-in-this-suite', identity.role]);
  }
  await admin.query("INSERT INTO menus (id, name, menu_date) VALUES (?, 'Hoje', CURRENT_DATE())", [menuId]);
  await admin.query(`INSERT INTO addresses (id, user_id, label, cep, street, number, complement, district, city, state, latitude, longitude)
    VALUES (?, ?, 'Casa', '13330010', 'Rua Teste', '10', 'Casa azul', 'Centro', 'Indaiatuba', 'SP', -23.088, -47.216)`, [addressId, identities.customer.id]);

  // Verifica a migration também numa base com pedidos anteriores ao módulo.
  const oldOrders = new Map<string, string>();
  for (const status of ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const) {
    oldOrders.set(await createOrder(status), status);
  }
  oldOrders.set(await createOrder('CONFIRMED', true), 'PICKUP');
  await sqlFile('026_create_deliveries.sql');
  const [recovered] = await admin.query<RowDataPacket[]>('SELECT order_id FROM deliveries');
  const [preserved] = await admin.query<RowDataPacket[]>('SELECT id, status FROM orders');
  await sqlFile('026_create_deliveries.sql');
  const [[count]] = await admin.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM deliveries');
  migrationResult = {
    recovered: recovered.map(row => oldOrders.get(row.order_id)!).sort(),
    preserved: preserved.map(row => oldOrders.get(row.id) === 'PICKUP' ? 'PICKUP' : row.status).sort(),
    countAfterRepeat: count.n,
  };
});

beforeEach(async () => {
  await admin.query('DELETE FROM deliveries');
  await admin.query('DELETE FROM order_items');
  await admin.query('DELETE FROM orders');
  await admin.query('UPDATE users SET active = 1');
});
afterAll(async () => {
  await db.end();
  await admin?.query('DROP DATABASE IF EXISTS `marmitaria_test`');
  await admin?.end();
});

const ownerAction = (id: string, action: string) => request(app).post(`/owner/orders/${id}/${action}`).set(auth('owner'));
const assign = (id: string, courier: Identity = 'courier', by: Identity = 'owner') => request(app).post(`/owner/deliveries/${id}/assign`).set(auth(by)).send({ courierId: identities[courier].id });
const start = (id: string, by: Identity = 'courier') => request(app).patch(`/deliveries/${id}/start`).set(auth(by));
const completion = (): { operationId: string; completedAt: string } => ({ operationId: randomUUID(), completedAt: new Date().toISOString() });
const complete = (id: string, input = completion(), by: Identity = 'courier') => request(app).post(`/deliveries/${id}/complete`).set(auth(by)).send(input);

async function delivery(ready = true): Promise<{ id: string; orderId: string }> {
  const orderId = await createOrder();
  expect((await ownerAction(orderId, 'confirm')).status).toBe(200);
  if (ready) {
    expect((await ownerAction(orderId, 'prepare')).status).toBe(200);
    expect((await ownerAction(orderId, 'ready')).status).toBe(200);
  }
  const response = await request(app).get(`/deliveries/order/${orderId}`).set(auth('owner'));
  expect(response.status).toBe(200);
  return { id: response.body.id, orderId };
}

async function states(id: string): Promise<{ deliveryStatus: DeliveryStatus; orderStatus: OrderStatus }> {
  const [[row]] = await admin.query<RowDataPacket[]>(`SELECT d.status AS deliveryStatus, o.status AS orderStatus
    FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.id = ?`, [id]);
  return row as { deliveryStatus: DeliveryStatus; orderStatus: OrderStatus };
}

describe('Migration e integridade das entregas', () => {
  it('recupera apenas pedidos antigos não iniciados e pode repetir sem duplicar', () => {
    expect(migrationResult.recovered).toEqual(['CONFIRMED', 'PREPARING', 'READY']);
    expect(migrationResult.countAfterRepeat).toBe(3);
    expect(migrationResult.preserved).toEqual(['CANCELLED', 'CONFIRMED', 'DELIVERED', 'OUT_FOR_DELIVERY', 'PENDING', 'PICKUP', 'PREPARING', 'READY']);
  });
  it('cria a entrega ao confirmar, sem criá-la para pedido pendente ou retirada', async () => {
    const id = await createOrder();
    expect((await request(app).get(`/deliveries/order/${id}`).set(auth('owner'))).status).toBe(404);
    await ownerAction(id, 'confirm');
    const result = await request(app).get(`/deliveries/order/${id}`).set(auth('owner'));
    expect(result.body).toMatchObject({ status: 'WAITING_ASSIGNMENT', courierId: null, total: 26, changeFor: 50, notes: 'Interfone 10' });
    expect(result.body.customerId).toBeUndefined();
    expect(result.body.completionKey).toBeUndefined();
    const pickup = await createOrder('PENDING', true);
    await ownerAction(pickup, 'confirm');
    expect((await request(app).get(`/deliveries/order/${pickup}`).set(auth('owner'))).status).toBe(404);
  });
  it('preserva o snapshot mesmo depois da edição do cadastro', async () => {
    const d = await delivery();
    await admin.query("UPDATE addresses SET street = 'Rua Nova' WHERE id = ?", [addressId]);
    const result = await request(app).get(`/deliveries/${d.id}`).set(auth('owner'));
    expect(result.body.address).toMatchObject({ street: 'Rua Teste', complement: 'Casa azul', latitude: -23.088, longitude: -47.216 });
    await expect(admin.query("UPDATE deliveries SET address_snapshot = JSON_SET(address_snapshot, '$.street', 'Outra rua') WHERE id = ?", [d.id])).rejects.toThrow(/endereço/);
  });
  it('impede duas entregas para o mesmo pedido e mantém chaves estrangeiras', async () => {
    const d = await delivery();
    await expect(admin.query('INSERT INTO deliveries (id, order_id, address_snapshot) SELECT ?, order_id, address_snapshot FROM deliveries WHERE id = ?', [randomUUID(), d.id])).rejects.toThrow(/Duplicate/);
    await expect(admin.query("INSERT INTO deliveries (id, order_id, address_snapshot) VALUES (?, ?, JSON_OBJECT())", [randomUUID(), randomUUID()])).rejects.toThrow(/foreign key/);
  });
  it('desfaz a confirmação se a criação da entrega falhar', async () => {
    const id = await createOrder();
    await admin.query("CREATE TRIGGER test_fail_delivery_insert BEFORE INSERT ON deliveries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha simulada de criação'");
    try {
      expect((await ownerAction(id, 'confirm')).status).toBe(400);
      const [[row]] = await admin.query<RowDataPacket[]>('SELECT status FROM orders WHERE id = ?', [id]);
      expect(row.status).toBe('PENDING');
    } finally { await admin.query('DROP TRIGGER test_fail_delivery_insert'); }
  });
});

describe('Consulta e atribuição autorizadas', () => {
  it('exige sessão e perfil para listar, atribuir e executar ações', async () => {
    const d = await delivery();
    expect((await request(app).get('/deliveries/me')).status).toBe(401);
    expect((await request(app).get('/deliveries/me').set(auth('customer'))).status).toBe(403);
    expect((await assign(d.id, 'courier', 'customer')).status).toBe(403);
    expect((await assign(d.id, 'courier', 'courier')).status).toBe(403);
    expect((await start(d.id, 'owner')).status).toBe(403);
    expect((await complete(d.id, completion(), 'customer')).status).toBe(403);
  });
  it('lista somente entregas do motoboy autenticado, com paginação', async () => {
    const a = await delivery(); const b = await delivery(); const other = await delivery();
    await assign(a.id); await assign(b.id); await assign(other.id, 'otherCourier');
    const page = await request(app).get('/deliveries/me?limit=1').set(auth('courier'));
    expect(page.body.hasMore).toBe(true);
    const next = await request(app).get('/deliveries/me?limit=1&offset=1').set(auth('courier'));
    expect(next.body.hasMore).toBe(false);
    expect(new Set([page.body.deliveries[0].id, next.body.deliveries[0].id])).toEqual(new Set([a.id, b.id]));
    expect((await request(app).get('/deliveries/me').set(auth('otherCourier'))).body.deliveries.map((row: { id: string }) => row.id)).toEqual([other.id]);
  });
  it('oculta entregas alheias e permite consulta pelo próprio cliente ou proprietária', async () => {
    const d = await delivery(); await assign(d.id);
    for (const by of ['otherCourier', 'otherCustomer'] as const) {
      expect((await request(app).get(`/deliveries/${d.id}`).set(auth(by))).status).toBe(404);
      expect((await request(app).get(`/deliveries/order/${d.orderId}`).set(auth(by))).status).toBe(404);
    }
    for (const by of ['courier', 'customer', 'owner'] as const) {
      expect((await request(app).get(`/deliveries/${d.id}`).set(auth(by))).status).toBe(200);
    }
  });
  it('aceita troca antes do início e preserva a atribuição repetida', async () => {
    const d = await delivery(false);
    const assigned = await assign(d.id);
    expect(assigned.body.status).toBe('ASSIGNED');
    expect((await assign(d.id)).body.assignedAt).toBe(assigned.body.assignedAt);
    expect((await assign(d.id, 'otherCourier')).body.courierId).toBe(identities.otherCourier.id);
    expect((await request(app).get(`/deliveries/${d.id}`).set(auth('courier'))).status).toBe(404);
  });
  it('rejeita usuário de outro perfil ou motoboy desativado', async () => {
    const d = await delivery();
    expect((await assign(d.id, 'customer')).status).toBe(409);
    await admin.query('UPDATE users SET active = 0 WHERE id = ?', [identities.courier.id]);
    expect((await assign(d.id)).status).toBe(409);
    expect((await states(d.id)).deliveryStatus).toBe('WAITING_ASSIGNMENT');
  });
  it('revalida conta e perfil mesmo com token ainda válido', async () => {
    const d = await delivery(); await assign(d.id);
    await admin.query('UPDATE users SET active = 0 WHERE id IN (?, ?)', [identities.courier.id, identities.owner.id]);
    expect((await request(app).get('/deliveries/me').set(auth('courier'))).status).toBe(403);
    expect((await start(d.id)).status).toBe(403);
    expect((await assign(d.id)).status).toBe(403);
    await admin.query('UPDATE users SET active = 1 WHERE id = ?', [identities.courier.id]);
    const oldToken = auth('courier');
    await admin.query("UPDATE users SET role = 'CUSTOMER' WHERE id = ?", [identities.courier.id]);
    try { expect((await request(app).get('/deliveries/me').set(oldToken)).status).toBe(403); }
    finally { await admin.query("UPDATE users SET role = 'COURIER' WHERE id = ?", [identities.courier.id]); }
  });
  it('recusa UUID, query e corpo inválidos sem mudar a entrega', async () => {
    const d = await delivery();
    expect((await request(app).get('/deliveries/nao-e-uuid').set(auth('owner'))).status).toBe(404);
    expect((await request(app).get('/deliveries/me?active=talvez').set(auth('courier'))).status).toBe(400);
    expect((await request(app).get('/deliveries/me?limit=0').set(auth('courier'))).status).toBe(400);
    expect((await request(app).post(`/owner/deliveries/${d.id}/assign`).set(auth('owner')).send({ courierId: 'invalido' })).status).toBe(400);
    expect((await request(app).post(`/deliveries/${d.id}/complete`).set(auth('courier')).send({ operationId: randomUUID(), completedAt: '2026-10-21T12:00:00' })).status).toBe(400);
    expect((await request(app).post(`/deliveries/${d.id}/complete`).set(auth('courier')).send({ ...completion(), courierId: identities.otherCourier.id })).status).toBe(400);
  });
});

describe('Início, conclusão e concorrência', () => {
  it('exige pedido pronto e motoboy atribuído', async () => {
    const d = await delivery(false);
    expect((await start(d.id)).status).toBe(404);
    await assign(d.id);
    expect((await start(d.id)).status).toBe(409);
    await ownerAction(d.orderId, 'prepare'); await ownerAction(d.orderId, 'ready');
    expect((await start(d.id, 'otherCourier')).status).toBe(404);
    expect((await start(d.id)).body).toMatchObject({ status: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY' });
  });
  it('conclui uma vez e separa horário do aparelho do recebimento no servidor', async () => {
    const d = await delivery(); await assign(d.id); await start(d.id);
    const input = completion();
    const result = await complete(d.id, input);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: 'COMPLETED', orderStatus: 'DELIVERED', completedAt: input.completedAt });
    expect(result.body.completionReceivedAt).toBeTruthy();
    const repeat = await complete(d.id, { ...input, operationId: input.operationId.toUpperCase() });
    expect(repeat.status).toBe(200);
    expect(repeat.body.completionReceivedAt).toBe(result.body.completionReceivedAt);
    expect((await complete(d.id)).status).toBe(409);
    expect((await complete(d.id, { ...input, completedAt: new Date(new Date(input.completedAt).getTime() + 1000).toISOString() })).status).toBe(409);
  });
  it('serializa requisições simultâneas com a mesma operação', async () => {
    const d = await delivery(); await assign(d.id);
    const starts = await Promise.all([start(d.id), start(d.id)]);
    expect(starts.map(r => r.status)).toEqual([200, 200]);
    expect(starts[0].body.startedAt).toBe(starts[1].body.startedAt);
    const input = completion();
    const results = await Promise.all([complete(d.id, input), complete(d.id, input)]);
    expect(results.map(r => r.status)).toEqual([200, 200]);
    expect(results[0].body.completionReceivedAt).toBe(results[1].body.completionReceivedAt);
  });
  it('aceita apenas uma entre duas conclusões diferentes concorrentes', async () => {
    const d = await delivery(); await assign(d.id); await start(d.id);
    const results = await Promise.all([complete(d.id), complete(d.id)]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect(await states(d.id)).toEqual({ deliveryStatus: 'COMPLETED', orderStatus: 'DELIVERED' });
  });
  it('chave usada em outra entrega causa rollback do pedido', async () => {
    const a = await delivery(); const b = await delivery();
    await assign(a.id); await assign(b.id); await start(a.id); await start(b.id);
    const input = completion(); await complete(a.id, input);
    expect((await complete(b.id, input)).status).toBe(409);
    expect(await states(b.id)).toEqual({ deliveryStatus: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY' });
  });
  it('valida relógio futuro e conclusão anterior ao início', async () => {
    const d = await delivery(); await assign(d.id); await start(d.id);
    for (const offset of [120_000, -120_000]) {
      expect((await complete(d.id, { operationId: randomUUID(), completedAt: new Date(Date.now() + offset).toISOString() })).status).toBe(409);
    }
    expect(await states(d.id)).toEqual({ deliveryStatus: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY' });
  });
  it('permite finalizar muito depois do início, preparando a sincronização futura', async () => {
    const d = await delivery(); await assign(d.id); await start(d.id);
    await admin.query('UPDATE deliveries SET started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 DAY) WHERE id = ?', [d.id]);
    const input = { operationId: randomUUID(), completedAt: new Date(Date.now() - 86_400_000).toISOString() };
    expect((await complete(d.id, input)).status).toBe(200);
  });
  it('recusa troca ou cancelamento após o início e preserva outras entregas ativas', async () => {
    const a = await delivery(); const b = await delivery(); await assign(a.id); await assign(b.id);
    await start(a.id); await start(b.id);
    expect((await assign(a.id, 'otherCourier')).status).toBe(409);
    expect((await ownerAction(a.orderId, 'cancel')).status).toBe(409);
    await complete(a.id);
    const active = await request(app).get('/deliveries/me').set(auth('courier'));
    expect(active.body.deliveries.map((row: { id: string }) => row.id)).toEqual([b.id]);
    const history = await request(app).get('/deliveries/me?active=false').set(auth('courier'));
    expect(history.body.deliveries.map((row: { id: string }) => row.id)).toEqual([a.id]);
  });
  it.each(['start', 'complete'] as const)('desfaz os dois estados quando a gravação de %s falha', async action => {
    const d = await delivery(); await assign(d.id);
    if (action === 'complete') await start(d.id);
    const before = await states(d.id);
    await admin.query("CREATE TRIGGER test_fail_delivery_update BEFORE UPDATE ON deliveries FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha simulada de atualização'");
    try {
      expect((await (action === 'start' ? start(d.id) : complete(d.id))).status).toBe(400);
      expect(await states(d.id)).toEqual(before);
    } finally { await admin.query('DROP TRIGGER test_fail_delivery_update'); }
  });
});

describe('Cancelamento coordenado', () => {
  it.each([false, true])('cancela com ou sem atribuição: assigned=%s', async assigned => {
    const d = await delivery();
    if (assigned) await assign(d.id);
    expect((await ownerAction(d.orderId, 'cancel')).status).toBe(200);
    expect(await states(d.id)).toEqual({ deliveryStatus: 'CANCELLED', orderStatus: 'CANCELLED' });
    expect((await assign(d.id)).status).toBe(409);
    expect((await start(d.id)).status).toBe(assigned ? 409 : 404);
    expect((await complete(d.id)).status).toBe(assigned ? 409 : 404);
  });
  it('início concorrendo com cancelamento termina num único estado consistente', async () => {
    const d = await delivery(); await assign(d.id);
    const results = await Promise.all([start(d.id), ownerAction(d.orderId, 'cancel')]);
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
    expect([
      { deliveryStatus: 'CANCELLED', orderStatus: 'CANCELLED' },
      { deliveryStatus: 'IN_PROGRESS', orderStatus: 'OUT_FOR_DELIVERY' },
    ]).toContainEqual(await states(d.id));
  });
  it('cancelamento de pedido pendente não cria entrega', async () => {
    const id = await createOrder();
    expect((await ownerAction(id, 'cancel')).status).toBe(200);
    const [[row]] = await admin.query<RowDataPacket[]>('SELECT COUNT(*) AS n FROM deliveries WHERE order_id = ?', [id]);
    expect(row.n).toBe(0);
  });
});
