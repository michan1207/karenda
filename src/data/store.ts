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
  await db.withTransactionAsync(() => writeKeywords(db, keywords));
}

/** トランザクションの中で呼ぶ */
async function writeKeywords(db: Database, keywords: RiskKeywords): Promise<void> {
  await db.runAsync('DELETE FROM keywords');
  // 同じ言葉が両方にあれば高リスクを優先する
  for (const level of ['high', 'medium'] as const) {
    for (const raw of keywords[level]) {
      const word = raw.trim();
      if (word) await db.runAsync('INSERT OR IGNORE INTO keywords (word, level) VALUES (?, ?)', word, level);
    }
  }
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

/** 画面が表示に使う保存内容。書き込みのたびにこれだけ読み直す */
export type StoredState = {
  onboarded: boolean;
  /** 設定でお知らせ通知を使うか */
  notifyEnabled: boolean;
  /** 隠すモード。カレンダーに生理の色や言葉を出さない */
  hideMode: boolean;
  starts: DateKey[];
  settings: ZoneSettings;
  keywords: RiskKeywords;
  dismissed: Set<string>;
};

export async function loadState(db: Database): Promise<StoredState> {
  const [onboarded, notifyEnabled, hideMode, starts, settings, keywords, dismissed] = await Promise.all([
    isOnboarded(db),
    isNotifyEnabled(db),
    isHideMode(db),
    listPeriodStarts(db),
    getZoneSettings(db),
    getKeywords(db),
    listDismissedAlerts(db),
  ]);
  return { onboarded, notifyEnabled, hideMode, starts, settings, keywords, dismissed };
}

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

export type ReadExport = { ok: true; data: ExportedData } | { ok: false; reason: 'broken' | 'notCocomia' | 'newer' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isWords = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');

/** 書き出したファイルを読む。外から来た中身なので、形と値をすべて確かめる */
export function readExport(text: string): ReadExport {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'broken' };
  }
  if (!isRecord(raw) || raw.app !== 'karenda') return { ok: false, reason: 'notCocomia' };
  const { schemaVersion, exportedAt, periodStarts, zoneSettings, keywords } = raw;
  if (typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) return { ok: false, reason: 'newer' };
  if (
    !Number.isInteger(schemaVersion) ||
    !isWords(periodStarts) ||
    !isRecord(zoneSettings) ||
    !isRecord(keywords) ||
    !isWords(keywords.high) ||
    !isWords(keywords.medium)
  ) {
    return { ok: false, reason: 'broken' };
  }
  const settings = { heavyDays: zoneSettings.heavyDays, pmsDays: zoneSettings.pmsDays } as ZoneSettings;
  try {
    periodStarts.forEach(fromDateKey);
    validateZoneSettings(settings);
  } catch {
    return { ok: false, reason: 'broken' };
  }
  return {
    ok: true,
    data: {
      app: 'karenda',
      schemaVersion: schemaVersion as number,
      exportedAt: typeof exportedAt === 'string' ? exportedAt : '',
      periodStarts,
      zoneSettings: settings,
      keywords: { high: keywords.high, medium: keywords.medium },
    },
  };
}

/** replace: ファイルの中身に置き換える / keepMine: 記録は足し、設定は今のまま / preferFile: 記録は足し、設定はファイルのもの */
export type RestoreMode = 'replace' | 'keepMine' | 'preferFile';

/** 読み込んだ記録を戻す。途中で失敗したら何も変えない */
export async function restoreData(db: Database, data: ExportedData, mode: RestoreMode): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (mode === 'replace') await db.runAsync('DELETE FROM period_starts');
    for (const start of data.periodStarts) await addPeriodStart(db, start);
    if (mode === 'keepMine') return;
    await setZoneSettings(db, data.zoneSettings);
    await writeKeywords(db, data.keywords);
  });
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

export async function isOnboarded(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'onboarded'");
  return row?.value === '1';
}

export async function setOnboarded(db: Database): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('onboarded', '1')");
}

/** レビューのお願いは一度だけ */
export async function isReviewAsked(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'review_asked'");
  return row?.value === '1';
}

export async function setReviewAsked(db: Database): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('review_asked', '1')");
}

/** お知らせ通知を使うか（はじめは使う） */
export async function isNotifyEnabled(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'notify'");
  return row?.value !== '0';
}

export async function setNotifyEnabled(db: Database, enabled: boolean): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('notify', ?)", enabled ? '1' : '0');
}

/** 隠すモード（はじめは使わない）。電車などで開いても、生理の記録だと分からないようにする */
export async function isHideMode(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'hide'");
  return row?.value === '1';
}

export async function setHideMode(db: Database, on: boolean): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('hide', ?)", on ? '1' : '0');
}
