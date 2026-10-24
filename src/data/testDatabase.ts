import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import type { Database } from './database';

/** テスト用：Node 内蔵の SQLite を expo-sqlite と同じ形で包む（アプリ本体からは使わない） */
export function createTestDatabase(): Database {
  const db = new DatabaseSync(':memory:');
  const bind = (params: unknown[]) =>
    params.map((value) => (typeof value === 'boolean' ? Number(value) : value)) as SQLInputValue[];

  return {
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
    async withTransactionAsync(task) {
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}
