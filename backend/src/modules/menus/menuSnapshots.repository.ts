import { getMongoDb, mongoEnabled } from '../../config/mongo';
import type { PublicMenu } from './menu.types';

/**
 * Cópia desnormalizada do cardápio no MongoDB (coleção "menus"), no formato
 * combinado em docs/banco-nao-relacional.md: o app do cliente lê o cardápio do dia
 * com uma única consulta, sem JOIN.
 *
 * O MySQL continua sendo a fonte da verdade. Se o Mongo falhar, nada quebra:
 * o backend lê do MySQL.
 */
export interface MenuSnapshotsRepository {
  save(menu: PublicMenu): Promise<void>;
  markClosed(menuId: string): Promise<void>;
  findActiveByDate(date: string): Promise<PublicMenu | null>;
}

const COLLECTION = 'menus';

type MenuDocument = PublicMenu & { updatedAt: Date };

export class MongoMenuSnapshotsRepository implements MenuSnapshotsRepository {
  private indexesReady: Promise<unknown> | null = null;

  private async collection() {
    const db = await getMongoDb();
    const collection = db.collection<MenuDocument>(COLLECTION);
    this.indexesReady ??= Promise.all([
      collection.createIndex({ menuId: 1 }, { unique: true }),
      collection.createIndex({ date: 1, status: 1 }),
    ]);
    await this.indexesReady;
    return collection;
  }

  async save(menu: PublicMenu) {
    await (await this.collection()).replaceOne({ menuId: menu.menuId }, { ...menu, updatedAt: new Date() }, { upsert: true });
  }

  async markClosed(menuId: string) {
    await (await this.collection()).updateOne({ menuId }, { $set: { status: 'CLOSED', updatedAt: new Date() } });
  }

  async findActiveByDate(date: string) {
    const doc = await (await this.collection()).findOne({ date, status: 'ACTIVE' }, { projection: { _id: 0, updatedAt: 0 } });
    return (doc as PublicMenu | null) ?? null;
  }
}

/** Usada quando o MongoDB não está configurado. */
export class DisabledMenuSnapshotsRepository implements MenuSnapshotsRepository {
  async save() {}
  async markClosed() {}
  async findActiveByDate() {
    return null;
  }
}

export const menuSnapshotsRepository: MenuSnapshotsRepository = mongoEnabled
  ? new MongoMenuSnapshotsRepository()
  : new DisabledMenuSnapshotsRepository();
