import mysql from 'mysql2/promise';
import { env } from './env';

/**
 * Pool de conexões com o MySQL. Use apenas dentro dos repositories:
 * controllers e services não devem conhecer o banco.
 */
export const db = mysql.createPool({
  ...env.db,
  connectionLimit: 10,
  timezone: 'Z',
  // Tempo máximo para abrir uma conexão: com o banco fora do ar, a requisição falha
  // em poucos segundos (503) em vez de deixar o app esperando.
  connectTimeout: 5000,
});

// Datas sempre em UTC (inclusive NOW()/CURRENT_TIMESTAMP); o app converte para o fuso local.
db.pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await db.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
