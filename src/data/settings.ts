import { DEFAULT_PMS, PmsEstimate } from '../engine/pms';
import { DEFAULT_ZONE_SETTINGS, validateZoneSettings, ZoneSettings } from '../engine/zones';
import type { Database } from './database';

/*
 * settings 表の読み書きはここだけ（2026-11-01 B4）。鍵・行が無い時の値・壊れていた時の扱いをまとめる。
 * 壊れた値（古い版の名残など）があっても、アプリが開けなくならないよう、既定の値で読む
 */

/** 「はい／いいえ」の項目と、行が無い時の値 */
const FLAGS = {
  onboarded: false,
  /** レビューのお願いは一度だけ */
  review_asked: false,
  /** お知らせ通知（はじめは使う） */
  notify: true,
  /** はじめの案内でカレンダーを「今はしない」にした。そのあいだは、開くたびに許可を求めない */
  calendar_skipped: false,
  /** 隠すモード。電車などで開いても、生理の記録だと分からないようにする */
  hide: false,
  /** アプリのロック */
  lock: false,
  /** 利用状況の記録（はじめは記録する）。この端末の中だけに残す */
  metrics: true,
} as const;
type Flag = keyof typeof FLAGS;

async function read(db: Database, key: string): Promise<string | undefined> {
  return (await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', key))?.value;
}

async function write(db: Database, key: string, value: string): Promise<void> {
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
}

/** 既定が「はい」の項目は '0' の時だけ「いいえ」、既定が「いいえ」の項目は '1' の時だけ「はい」 */
async function getFlag(db: Database, flag: Flag): Promise<boolean> {
  const value = await read(db, flag);
  return FLAGS[flag] ? value !== '0' : value === '1';
}

const setFlag = (db: Database, flag: Flag, on: boolean) => write(db, flag, on ? '1' : '0');

export const isOnboarded = (db: Database) => getFlag(db, 'onboarded');
export const setOnboarded = (db: Database) => setFlag(db, 'onboarded', true);
export const isReviewAsked = (db: Database) => getFlag(db, 'review_asked');
export const setReviewAsked = (db: Database) => setFlag(db, 'review_asked', true);
export const isNotifyEnabled = (db: Database) => getFlag(db, 'notify');
export const setNotifyEnabled = (db: Database, on: boolean) => setFlag(db, 'notify', on);
export const isCalendarSkipped = (db: Database) => getFlag(db, 'calendar_skipped');
export const setCalendarSkipped = (db: Database, on: boolean) => setFlag(db, 'calendar_skipped', on);
export const isHideMode = (db: Database) => getFlag(db, 'hide');
export const setHideMode = (db: Database, on: boolean) => setFlag(db, 'hide', on);
export const isLockEnabled = (db: Database) => getFlag(db, 'lock');
export const setLockEnabled = (db: Database, on: boolean) => setFlag(db, 'lock', on);
export const isMetricsEnabled = (db: Database) => getFlag(db, 'metrics');
export const setMetricsEnabled = (db: Database, on: boolean) => setFlag(db, 'metrics', on);

/** 受診の目安カードを閉じた月（YYYY-MM）。同じ月にはもう出さない */
export const getConsultDismissed = async (db: Database): Promise<string | null> => (await read(db, 'consult_dismissed')) ?? null;
export const dismissConsult = (db: Database, month: string) => write(db, 'consult_dismissed', month);

function parseJson(text: string | undefined): Record<string, unknown> | null {
  if (text === undefined) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** 気をつける時期の日数。無い・壊れている・範囲の外なら既定（3日・7日前）で読む（そのままだとカレンダーを描けない） */
export async function getZoneSettings(db: Database): Promise<ZoneSettings> {
  const saved = parseJson(await read(db, 'zone'));
  const settings = { heavyDays: saved?.heavyDays, pmsDays: saved?.pmsDays } as ZoneSettings;
  try {
    validateZoneSettings(settings);
    return settings;
  } catch {
    return DEFAULT_ZONE_SETTINGS;
  }
}

export async function setZoneSettings(db: Database, settings: ZoneSettings): Promise<void> {
  validateZoneSettings(settings);
  await write(db, 'zone', JSON.stringify({ heavyDays: settings.heavyDays, pmsDays: settings.pmsDays }));
}

const isPmsEstimate = (value: Record<string, unknown> | null): value is PmsEstimate =>
  !!value &&
  ['default', 'auto', 'manual'].includes(value.source as string) &&
  // 帯を描けない日数は使わない（PMS の日数は 0〜14）
  Number.isInteger(value.daysBefore) &&
  (value.daysBefore as number) >= 0 &&
  (value.daysBefore as number) <= 14 &&
  Number.isInteger(value.observations) &&
  (value.appliedFrom === null || typeof value.appliedFrom === 'string') &&
  (value.before === null || Number.isInteger(value.before));

/** PMS の日数の決め方。手動の時の日数は zone の pmsDays（書き出しにも入る）。壊れていたら、無い時と同じに読む */
export async function getPmsEstimate(db: Database): Promise<PmsEstimate> {
  const [saved, zone] = await Promise.all([read(db, 'pms'), getZoneSettings(db)]);
  const parsed = parseJson(saved);
  // 推定ができる前に日数を変えていた人（と、そういうバックアップを戻した時）は手動のまま
  const pms: PmsEstimate = isPmsEstimate(parsed)
    ? parsed
    : zone.pmsDays === DEFAULT_PMS.daysBefore
      ? DEFAULT_PMS
      : { ...DEFAULT_PMS, source: 'manual' };
  return pms.source === 'manual' ? { ...pms, daysBefore: zone.pmsDays, appliedFrom: null, before: null } : pms;
}

export const savePmsEstimate = (db: Database, pms: PmsEstimate) => write(db, 'pms', JSON.stringify(pms));

/** PMS の日数の決め方を消す。次に読むと zone の日数から決め直す（バックアップを設定ごと戻した時） */
export async function clearPmsEstimate(db: Database): Promise<void> {
  await db.runAsync("DELETE FROM settings WHERE key = 'pms'");
}

/** 手動にする時は今の日数から始める。自動に戻すと、次に読み直した時に推定（なければ7日前）へ移る */
export async function setPmsManual(db: Database, manual: boolean): Promise<void> {
  const pms = await getPmsEstimate(db);
  await db.withTransactionAsync(async () => {
    if (manual) await setZoneSettings(db, { ...(await getZoneSettings(db)), pmsDays: pms.daysBefore });
    await savePmsEstimate(db, { ...pms, source: manual ? 'manual' : 'default', appliedFrom: null, before: null });
  });
}
