import type { SQLiteBindValue } from 'expo-sqlite';

/**
 * expo-sqlite の SQLiteDatabase のうち、このアプリが使う部分だけ。
 * テストでは Node 内蔵の SQLite で同じ形を用意して差し替える。
 */
export type Database = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: SQLiteBindValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, ...params: SQLiteBindValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};
