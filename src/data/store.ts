import { DateKey, fromDateKey } from '../engine/date';
import type { RiskKeywords } from '../engine/risk';
import { validateZoneSettings, ZoneSettings } from '../engine/zones';
import type { Database } from './database';
import { SCHEMA_VERSION, seedDefaults } from './migrations';

export async function listPeriodStarts(db: Database): Promise<DateKey[]> {
  const rows = await db.getAllAsync<{ start: string }>('SELECT start FROM period_starts ORDER BY start');
  return rows.map((row) => row.start);
}

export async function addPeriodStart(db: Database, start: DateKey): Promise<void> {
  fromDateKey(start);
  await db.runAsync('INSERT OR IGNORE INTO period_starts (start) VALUES (?)', start);
}

export async function removePeriodStart(db: Database, start: DateKey): Promise<void> {
  await db.runAsync('DELETE FROM period_starts WHERE start = ?', start);
}

export async function getZoneSettings(db: Database): Promise<ZoneSettings> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'zone'");
  return JSON.parse(row!.value) as ZoneSettings;
}

export async function setZoneSettings(db: Database, settings: ZoneSettings): Promise<void> {
  validateZoneSettings(settings);
  const value = JSON.stringify({ heavyDays: settings.heavyDays, pmsDays: settings.pmsDays });
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('zone', ?)", value);
}

export async function getKeywords(db: Database): Promise<RiskKeywords> {
  const rows = await db.getAllAsync<{ word: string; level: 'high' | 'medium' }>(
    'SELECT word, level FROM keywords ORDER BY rowid',
  );
  return {
    high: rows.filter((row) => row.level === 'high').map((row) => row.word),
    medium: rows.filter((row) => row.level === 'medium').map((row) => row.word),
  };
}

export async function setKeywords(db: Database, keywords: RiskKeywords): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM keywords');
    // 同じ言葉が両方にあれば高リスクを優先する
    for (const level of ['high', 'medium'] as const) {
      for (const raw of keywords[level]) {
        const word = raw.trim();
        if (word) await db.runAsync('INSERT OR IGNORE INTO keywords (word, level) VALUES (?, ?)', word, level);
      }
    }
  });
}

const alertKey = (eventId: string, date: DateKey) => `${eventId}|${date}`;

export async function dismissAlert(db: Database, eventId: string, date: DateKey): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO dismissed_alerts (event_id, date) VALUES (?, ?)', eventId, date);
}

/** 「わかった」で閉じた警告。`isDismissed(set, eventId, date)` で調べる */
export async function listDismissedAlerts(db: Database): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string }>('SELECT event_id, date FROM dismissed_alerts');
  return new Set(rows.map((row) => alertKey(row.event_id, row.date)));
}

export const isDismissed = (dismissed: Set<string>, eventId: string, date: DateKey) =>
  dismissed.has(alertKey(eventId, date));

export type ExportedData = {
  app: 'karenda';
  schemaVersion: number;
  exportedAt: string;
  periodStarts: DateKey[];
  zoneSettings: ZoneSettings;
  keywords: RiskKeywords;
};

/** 機種変更などのための書き出し。閉じた警告は端末の予定IDに結びつくので含めない */
export async function exportData(db: Database, now: Date = new Date()): Promise<ExportedData> {
  return {
    app: 'karenda',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    periodStarts: await listPeriodStarts(db),
    zoneSettings: await getZoneSettings(db),
    keywords: await getKeywords(db),
  };
}

/** 記録・設定をすべて消して、はじめて開いたときの状態に戻す */
export async function deleteAllData(db: Database): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM period_starts;
      DELETE FROM settings;
      DELETE FROM keywords;
      DELETE FROM dismissed_alerts;
    `);
    await seedDefaults(db);
  });
}
