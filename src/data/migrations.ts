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
  // 2026-10-30: 「わかった」で閉じただけだった記録を、お知らせの状態（確認済み・対応済み）に移す
  async (db) => {
    await db.execAsync(`
      CREATE TABLE conflict_states (
        event_id TEXT NOT NULL,
        date TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('acknowledged', 'resolved')),
        resolution TEXT CHECK (resolution IN ('shifted', 'prepared', 'declined', 'proceeded')),
        updated_at TEXT NOT NULL,
        PRIMARY KEY (event_id, date)
      );
      INSERT INTO conflict_states (event_id, date, state, resolution, updated_at)
        SELECT event_id, date, 'acknowledged', NULL, '' FROM dismissed_alerts;
      DROP TABLE dismissed_alerts;
    `);
  },
  // 2026-10-30: 利用状況の記録。この端末の中だけに残し、外には送らない
  async (db) => {
    await db.execAsync(`
      CREATE TABLE metric_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        props TEXT NOT NULL,
        occurred_at TEXT NOT NULL
      );
    `);
  },
  // 2026-10-30: 予定のあとの答えから覚えた、予定の名前ごとの重さ
  async (db) => {
    await db.execAsync(`
      CREATE TABLE title_weights (
        term TEXT PRIMARY KEY NOT NULL,
        label TEXT NOT NULL,
        weight TEXT CHECK (weight IN ('heavy', 'normal')),
        source TEXT NOT NULL CHECK (source IN ('learned', 'user')),
        observations INTEGER NOT NULL,
        lean INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
  // 2026-10-30: 予定のあとの「どうだった？」の答え。answer が NULL なら「答えない」
  async (db) => {
    await db.execAsync(`
      CREATE TABLE event_reviews (
        event_id TEXT NOT NULL,
        date TEXT NOT NULL,
        phase TEXT NOT NULL CHECK (phase IN ('period', 'pms', 'other')),
        answer TEXT CHECK (answer IN ('hard', 'normal', 'easy')),
        answered_at TEXT NOT NULL,
        PRIMARY KEY (event_id, date)
      );
    `);
  },
  // 2026-10-31: 次の生理の予測を残し、実際の開始日と比べた結果（予測の当たり具合）
  async (db) => {
    await db.execAsync(`
      CREATE TABLE prediction_records (
        based_on TEXT PRIMARY KEY NOT NULL,
        predicted_start TEXT NOT NULL,
        earliest TEXT NOT NULL,
        latest TEXT NOT NULL,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
        actual_start TEXT,
        abs_error_days INTEGER
      );
    `);
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
