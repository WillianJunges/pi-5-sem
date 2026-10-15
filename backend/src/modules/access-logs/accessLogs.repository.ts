import { getMongoDb, mongoEnabled } from '../../config/mongo';
import type { AccessLog } from './accessLog.types';

export interface AccessLogsRepository {
  record(log: AccessLog): Promise<void>;
  listByUser(userId: string, limit?: number): Promise<AccessLog[]>;
}

const COLLECTION = 'access_logs';
/** Histórico guardado por 180 dias; o próprio MongoDB apaga os mais antigos (índice TTL). */
const TTL_SECONDS = 180 * 24 * 60 * 60;

export class MongoAccessLogsRepository implements AccessLogsRepository {
  private indexesReady: Promise<unknown> | null = null;

  private async collection() {
    const db = await getMongoDb();
    const collection = db.collection<AccessLog>(COLLECTION);
    this.indexesReady ??= Promise.all([
      collection.createIndex({ 'user.id': 1, createdAt: -1 }),
      collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS }),
    ]);
    await this.indexesReady;
    return collection;
  }

  async record(log: AccessLog): Promise<void> {
    await (await this.collection()).insertOne({ ...log });
  }

  async listByUser(userId: string, limit = 20): Promise<AccessLog[]> {
    return (await this.collection())
      .find({ 'user.id': userId }, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
  }
}

/** Usada quando o MongoDB não está configurado: não grava nada. */
class DisabledAccessLogsRepository implements AccessLogsRepository {
  async record(): Promise<void> {}
  async listByUser(): Promise<AccessLog[]> {
    return [];
  }
}

export const accessLogsRepository: AccessLogsRepository = mongoEnabled
  ? new MongoAccessLogsRepository()
  : new DisabledAccessLogsRepository();
