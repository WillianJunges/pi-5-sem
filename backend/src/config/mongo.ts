import { type Db, MongoClient } from 'mongodb';
import { env } from './env';

/**
 * Conexão com o MongoDB (banco NÃO relacional, com dados desnormalizados).
 * Se MONGO_URL não estiver definido, os recursos que usam o Mongo ficam desligados
 * e o resto da API funciona normalmente.
 */
export const mongoEnabled = Boolean(env.mongoUrl);

let connecting: Promise<MongoClient> | null = null;

function connect(): Promise<MongoClient> {
  if (!env.mongoUrl) throw new Error('MONGO_URL não configurado');
  connecting ??= new MongoClient(env.mongoUrl, { serverSelectionTimeoutMS: 3000 }).connect().catch((err) => {
    connecting = null; // permite tentar de novo na próxima chamada
    throw err;
  });
  return connecting;
}

/** Banco definido na URL (ex.: mongodb://localhost:27017/marmitaria → "marmitaria"). */
export async function getMongoDb(): Promise<Db> {
  return (await connect()).db();
}

export async function checkMongoConnection(): Promise<'ok' | 'error' | 'disabled'> {
  if (!mongoEnabled) return 'disabled';
  try {
    await (await getMongoDb()).command({ ping: 1 });
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function closeMongo(): Promise<void> {
  if (connecting) {
    await (await connecting).close();
    connecting = null;
  }
}
