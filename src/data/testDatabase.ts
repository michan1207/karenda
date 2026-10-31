import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { type Database, oneTransactionAtATime } from './database';

/** テスト用：Node 内蔵の SQLite を expo-sqlite と同じ形で包む（アプリ本体からは使わない） */
export function createTestDatabase(): Database {
  const db = new DatabaseSync(':memory:');
  const bind = (params: unknown[]) =>
    params.map((value) => (typeof value === 'boolean' ? Number(value) : value)) as SQLInputValue[];

  return oneTransactionAtATime({
    async execAsync(source) {
      db.exec(source);
    },
    async runAsync(source, ...params) {
      return db.prepare(source).run(...bind(params));
    },
    async getAllAsync<T>(source: string, ...params: unknown[]) {
      return db.prepare(source).all(...bind(params)).map((row) => ({ ...row })) as T[];
    },
    async getFirstAsync<T>(source: string, ...params: unknown[]) {
      const row = db.prepare(source).get(...bind(params));
      return (row ? { ...row } : null) as T | null;
    },
    // expo-sqlite と同じく BEGIN も try の中。重なった時の壊れ方も同じになり、それを oneTransactionAtATime が防ぐ
    async withTransactionAsync(task) {
      try {
        db.exec('BEGIN');
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  });
}
