/**
 * Testes de integração do cadastro de motoboys (item 4 do módulo da Proprietária):
 * HTTP → Route → Controller → Service → Repository → MySQL, com o login real,
 * a procedure sp_create_user e o trigger de usuários (scripts 004 e 007).
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

const DB = process.env.DB_NAME!; // marmitaria_test (vitest.config.mts)
const SCHEMA_DIR = path.resolve(__dirname, '../../../database/schema');

let admin: mysql.Connection;
let owner: { Authorization: string };
let customer: { Authorization: string };

async function login(email: string, password: string) {
  return request(app).post('/auth/login').send({ email, password });
}

async function auth(email: string, password: string) {
  const res = await login(email, password);
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
  owner = await auth('maria@teste.com', '123456');
  customer = await auth('ana@teste.com', '123456');
});

afterAll(async () => {
  await db.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin?.end();
});

beforeEach(async () => {
  await admin.query("DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE role = 'COURIER')");
  await admin.query("DELETE FROM user_audit WHERE user_id IN (SELECT id FROM users WHERE role = 'COURIER')");
  await admin.query("DELETE FROM users WHERE role = 'COURIER'");
});

const joao = { name: 'João Motoboy', email: ' Joao@Teste.com ', phone: '19999990000', password: 'moto123' };

async function createJoao() {
  const res = await request(app).post('/owner/couriers').set(owner).send(joao);
  expect(res.status).toBe(201);
  return res.body as { id: string };
}

describe('Motoboys (/owner/couriers)', () => {
  it('cria o motoboy com perfil COURIER, e-mail limpo e sem devolver a senha', async () => {
    const res = await request(app).post('/owner/couriers').set(owner).send(joao);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'João Motoboy', email: 'joao@teste.com', phone: '19999990000', active: true });
    expect(res.body.passwordHash).toBeUndefined();
    const [[row]] = await admin.query<mysql.RowDataPacket[]>('SELECT role FROM users WHERE id = ?', [res.body.id]);
    expect(row.role).toBe('COURIER');
  });

  it('o motoboy criado consegue entrar no app', async () => {
    await createJoao();
    const res = await login('joao@teste.com', 'moto123');
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('COURIER');
  });

  it('lista só motoboys (não mostra clientes nem a proprietária)', async () => {
    await createJoao();
    const res = await request(app).get('/owner/couriers').set(owner);
    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['João Motoboy']);
  });

  it('e-mail repetido: 409', async () => {
    await createJoao();
    const res = await request(app).post('/owner/couriers').set(owner).send({ ...joao, name: 'Outro' });
    expect(res.status).toBe(409);
    const conflito = await request(app).post('/owner/couriers').set(owner).send({ ...joao, email: 'ana@teste.com' });
    expect(conflito.status).toBe(409);
  });

  it.each([
    [{ ...joao, name: 'J' }, 'nome curto'],
    [{ ...joao, email: 'joao' }, 'e-mail inválido'],
    [{ ...joao, password: '123' }, 'senha curta'],
  ])('dados inválidos: 400 (%#)', async (body) => {
    expect((await request(app).post('/owner/couriers').set(owner).send(body)).status).toBe(400);
  });

  it('edita nome, e-mail e telefone', async () => {
    const { id } = await createJoao();
    const res = await request(app)
      .put(`/owner/couriers/${id}`)
      .set(owner)
      .send({ name: 'João Silva', email: 'joao.silva@teste.com', phone: '' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'João Silva', email: 'joao.silva@teste.com', phone: null });
    // e-mail de outra pessoa não pode
    const dup = await request(app).put(`/owner/couriers/${id}`).set(owner).send({ name: 'João', email: 'ana@teste.com' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('E-mail já cadastrado');
  });

  it('desativar bloqueia o login e encerra as sessões; reativar libera', async () => {
    const { id } = await createJoao();
    const sessao = await login('joao@teste.com', 'moto123');
    expect(sessao.status).toBe(200);

    const off = await request(app).patch(`/owner/couriers/${id}/active`).set(owner).send({ active: false });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ active: false, activeSessions: 0 });
    expect((await login('joao@teste.com', 'moto123')).status).not.toBe(200);
    // o refresh token antigo foi revogado pelo trigger do banco
    const refresh = await request(app).post('/auth/refresh').send({ refreshToken: sessao.body.refreshToken });
    expect(refresh.status).toBe(401);

    const on = await request(app).patch(`/owner/couriers/${id}/active`).set(owner).send({ active: true });
    expect(on.body.active).toBe(true);
    expect((await login('joao@teste.com', 'moto123')).status).toBe(200);
  });

  it('não altera clientes por esta rota', async () => {
    const [[ana]] = await admin.query<mysql.RowDataPacket[]>("SELECT id FROM users WHERE email = 'ana@teste.com'");
    expect((await request(app).put(`/owner/couriers/${ana.id}`).set(owner).send({ name: 'X Y', email: 'x@y.com' })).status).toBe(404);
    expect((await request(app).patch(`/owner/couriers/${ana.id}/active`).set(owner).send({ active: false })).status).toBe(404);
  });

  it('cliente não acessa', async () => {
    expect((await request(app).get('/owner/couriers').set(customer)).status).toBe(403);
    expect((await request(app).post('/owner/couriers').set(customer).send(joao)).status).toBe(403);
  });
});
