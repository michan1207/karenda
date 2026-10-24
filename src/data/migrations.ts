import { DEFAULT_KEYWORDS } from '../engine/risk';
import { DEFAULT_ZONE_SETTINGS } from '../engine/zones';
import type { Database } from './database';

/**
 * 表の作り替えは、ここに追記するだけにする。すでに出したものは書き換えない。
 * 何番目まで適用したかは PRAGMA user_version に記録する。
 */
const MIGRATIONS: ((db: Database) => Promise<void>)[] = [
  async (db) => {
    await db.execAsync(`
      CREATE TABLE period_starts (
        start TEXT PRIMARY KEY NOT NULL
      );
      CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
      CREATE TABLE keywords (
        word TEXT PRIMARY KEY NOT NULL,
        level TEXT NOT NULL CHECK (level IN ('high', 'medium'))
      );
      CREATE TABLE dismissed_alerts (
        event_id TEXT NOT NULL,
        date TEXT NOT NULL,
        PRIMARY KEY (event_id, date)
      );
    `);
    await seedDefaults(db);
  },
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function seedDefaults(db: Database): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    'zone',
    JSON.stringify(DEFAULT_ZONE_SETTINGS),
  );
  for (const level of ['high', 'medium'] as const) {
    for (const word of DEFAULT_KEYWORDS[level]) {
      await db.runAsync('INSERT OR REPLACE INTO keywords (word, level) VALUES (?, ?)', word, level);
    }
  }
}

export async function migrate(db: Database): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database version ${current} is newer than this app (${SCHEMA_VERSION})`);
  }
  for (let version = current; version < SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await MIGRATIONS[version](db);
      await db.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
  }
}
