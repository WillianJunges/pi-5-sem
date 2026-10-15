/**
 * Aplica, em ordem, os scripts de database/schema que ainda não foram executados.
 * Uso: npm run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env';

const SCHEMA_DIR = path.resolve(__dirname, '../../database/schema');

async function main() {
  const conn = await mysql.createConnection({ ...env.db, multipleStatements: true });

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) NOT NULL PRIMARY KEY,
      applied_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [rows] = await conn.query<mysql.RowDataPacket[]>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name as string));

  const files = (await readdir(SCHEMA_DIR)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log('Banco já está atualizado.');
  }

  for (const file of pending) {
    const sql = await readFile(path.join(SCHEMA_DIR, file), 'utf8');
    console.log(`Aplicando ${file}...`);
    await conn.query(sql);
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
  }

  await conn.end();
}

main().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
