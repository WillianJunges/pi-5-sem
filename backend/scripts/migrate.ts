/**
 * Aplica, em ordem, os scripts de database/schema que ainda não foram executados.
 * Uso: npm run db:migrate
 *
 * Aceita a diretiva DELIMITER (como no MySQL Workbench), necessária para
 * procedures, functions e triggers.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env';

const SCHEMA_DIR = path.resolve(__dirname, '../../database/schema');

/** Divide o script em comandos, respeitando `DELIMITER $$ ... DELIMITER ;`. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let delimiter = ';';
  let current: string[] = [];

  for (const line of sql.split(/\r?\n/)) {
    const directive = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (directive) {
      delimiter = directive[1];
      continue;
    }

    current.push(line);
    if (line.trimEnd().endsWith(delimiter)) {
      const statement = current.join('\n').trimEnd().slice(0, -delimiter.length).trim();
      if (statement && !/^(--[^\n]*\s*)*$/.test(statement)) statements.push(statement);
      current = [];
    }
  }

  const rest = current.join('\n').trim();
  if (rest && !/^(--[^\n]*\s*)*$/.test(rest)) statements.push(rest);
  return statements;
}

async function main() {
  const conn = await mysql.createConnection(env.db);

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
    for (const statement of splitStatements(sql)) {
      await conn.query(statement);
    }
    await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file]);
  }

  await conn.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Falha na migração:', err);
    process.exit(1);
  });
}
