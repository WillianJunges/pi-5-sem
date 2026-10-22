import * as SQLite from 'expo-sqlite';
import { SqliteCourierStorage } from './sqliteStorage';

/** Banco próprio: não altera o schema do carrinho, histórico do cliente ou os tokens seguros. */
export const courierStorage = new SqliteCourierStorage(() => SQLite.openDatabaseAsync('courier-deliveries.db'));
