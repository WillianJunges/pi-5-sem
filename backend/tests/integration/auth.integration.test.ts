/**
 * Testes de integração da autenticação (módulo base): HTTP → Controller → Service →
 * Repository → MySQL, com as procedures reais do banco.
 *
 * Usa o mesmo banco separado dos outros testes de integração (marmitaria_test),
 * recriado no início deste arquivo com todos os scripts de database/schema.
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
const EMAIL = 'ana@teste.com';
const PASSWORD = 'senha-certa';

let admin: mysql.Connection;

const login = (password: string) => request(app).post('/auth/login').send({ email: EMAIL, password });
const userRow = async () => {
  const [[row]] = await admin.query<mysql.RowDataPacket[]>('SELECT * FROM users WHERE email = ?', [EMAIL]);
  return row;
};

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
  await admin.query("SET time_zone = '+00:00'");
  for (const file of (await readdir(SCHEMA_DIR)).filter((f) => f.endsWith('.sql')).sort()) {
    for (const statement of splitStatements(await readFile(path.join(SCHEMA_DIR, file), 'utf8'))) {
      await admin.query(statement);
    }
  }
});

afterAll(async () => {
  await db.end();
  await admin?.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  await admin?.end();
});

beforeEach(async () => {
  await admin.query('DELETE FROM refresh_tokens');
  await admin.query('DELETE FROM users');
  await usersRepository.create({
    name: 'Ana',
    email: EMAIL,
    phone: '(19) 99999-8888',
    passwordHash: await bcrypt.hash(PASSWORD, 4),
    role: 'CUSTOMER',
  });
});

describe('Limite de tentativas de login (script 023)', () => {
  it('conta as senhas erradas no banco e avisa a partir da 6ª', async () => {
    for (let i = 0; i < 5; i++) expect((await login('errada')).status).toBe(401);
    expect((await userRow()).failed_login_attempts).toBe(5);
    const sexta = await login('errada');
    expect(sexta.status).toBe(401);
    expect(sexta.body.error).toMatch(/Restam 4 tentativas/);
  });

  it('na 10ª bloqueia por 10 minutos e nem a senha certa entra', async () => {
    for (let i = 0; i < 9; i++) await login('errada');
    const decima = await login('errada');
    expect(decima.status).toBe(429);

    const row = await userRow();
    expect(row.failed_login_attempts).toBe(0);
    const minutes = (new Date(row.locked_until).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);

    const certa = await login(PASSWORD);
    expect(certa.status).toBe(429);
    expect(certa.body.error).toMatch(/Tente de novo em 10 minutos/);
  });

  it('bloqueio vencido libera; acertar zera o contador', async () => {
    await admin.query('UPDATE users SET failed_login_attempts = 3, locked_until = UTC_TIMESTAMP() - INTERVAL 1 MINUTE');
    const res = await login(PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body.user).not.toHaveProperty('failedLoginAttempts');
    const row = await userRow();
    expect(row.failed_login_attempts).toBe(0);
    expect(row.locked_until).toBeNull();
  });
});

describe('Esqueci minha senha (script 024)', () => {
  const forgot = () => request(app).post('/auth/forgot-password').send({ email: EMAIL });
  const reset = (code: string, password = 'senha-nova') =>
    request(app).post('/auth/reset-password').send({ email: EMAIL, code, password });

  it('gera o código (só o hash vai para o banco) e troca a senha', async () => {
    const res = await forgot();
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^\d{6}$/);
    const [[stored]] = await admin.query<mysql.RowDataPacket[]>('SELECT code_hash FROM password_resets');
    expect(stored.code_hash).not.toBe(res.body.code);

    expect((await reset(res.body.code)).status).toBe(204);
    expect((await login('senha-nova')).status).toBe(200);
    expect((await login(PASSWORD)).status).toBe(401);
  });

  it('a troca tira o bloqueio, encerra as sessões e registra na auditoria', async () => {
    const session = await login(PASSWORD);
    for (let i = 0; i < 10; i++) await login('errada');
    expect((await login(PASSWORD)).status).toBe(429);

    const { body } = await forgot();
    expect((await reset(body.code)).status).toBe(204);

    expect((await login('senha-nova')).status).toBe(200);
    const refresh = await request(app).post('/auth/refresh').send({ refreshToken: session.body.refreshToken });
    expect(refresh.status).toBe(401);
    const [audit] = await admin.query<mysql.RowDataPacket[]>(
      "SELECT new_value FROM user_audit WHERE field = 'password'",
    );
    expect(audit.map((a) => a.new_value)).toEqual(['reset']);
  });

  it('código usado, antigo ou errado não troca a senha', async () => {
    const first = (await forgot()).body.code as string;
    const second = (await forgot()).body.code as string;
    if (first !== second) expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(204);
    expect((await reset(second, 'outra-senha')).status).toBe(400);
  });

  it('código expirado: recusa', async () => {
    const { body } = await forgot();
    await admin.query('UPDATE password_resets SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE');
    const res = await reset(body.code);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expirado/);
  });
});
