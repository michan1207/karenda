import { openDatabaseAsync } from 'expo-sqlite';

import type { Database } from './database';
import { migrate } from './migrations';

let opening: Promise<Database> | null = null;

/** アプリ専用のデータベースを開く。何度呼んでも同じものを返す */
export function openKarendaDatabase(): Promise<Database> {
  opening ??= openDatabaseAsync('karenda.db').then(async (db) => {
    await migrate(db);
    return db;
  });
  // 失敗したら次の呼び出しでやり直せるようにする
  opening.catch(() => {
    opening = null;
  });
  return opening;
}
