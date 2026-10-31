import { AccuracyReport, buildReport, evaluatePrediction, PredictionRecord, snapshotPrediction } from '../engine/accuracy';
import { ConflictState, ConflictStatus, Resolution, statusKey, statusOf } from '../engine/conflictState';
import { predictCycle } from '../engine/cycle';
import { DateKey, fromDateKey, toDateKey } from '../engine/date';
import { CalendarEvent, EVENT_COLORS, EventColor } from '../engine/conflicts';
import { Answer, learnWeight, ReviewTarget, TitleWeight, Weight } from '../engine/learning';
import { DEFAULT_PMS, nextPmsEstimate, PmsEstimate, pmsZoneSettings, ReviewAnswer } from '../engine/pms';
import { termOf } from '../engine/risk';
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
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM period_starts WHERE start = ?', start);
    // 間違えて記録した日なら、その日から出した予測は取り消し、その日と比べた予測は比べる前に戻す
    await db.runAsync('DELETE FROM prediction_records WHERE based_on = ?', start);
    await db.runAsync('UPDATE prediction_records SET actual_start = NULL, abs_error_days = NULL WHERE actual_start = ?', start);
  });
}

/** 画面から生理開始日を記録する。いちばん新しい開始日なら、前の開始日から出していた予測と比べる（同じ日をもう一度記録しても比べ直さない） */
export async function recordPeriodStart(db: Database, start: DateKey): Promise<void> {
  await db.withTransactionAsync(async () => {
    const last = (await listPeriodStarts(db)).at(-1);
    await addPeriodStart(db, start);
    if (!last || start <= last) return;
    const pending = await db.getFirstAsync<PredictionRecord>(
      `SELECT ${PREDICTION_COLUMNS} FROM prediction_records WHERE based_on = ? AND actual_start IS NULL`,
      last,
    );
    const evaluated = pending && evaluatePrediction(pending, start);
    if (evaluated) await savePrediction(db, evaluated);
    else await db.runAsync('DELETE FROM prediction_records WHERE based_on = ? AND actual_start IS NULL', last);
  });
}

const PREDICTION_COLUMNS =
  'based_on AS basedOn, predicted_start AS predictedStart, earliest, latest, confidence, actual_start AS actualStart, abs_error_days AS absErrorDays';

export async function listPredictionRecords(db: Database): Promise<PredictionRecord[]> {
  return db.getAllAsync<PredictionRecord>(`SELECT ${PREDICTION_COLUMNS} FROM prediction_records ORDER BY based_on`);
}

/** 比べたあとの予測は、予測のしかたが変わっても書き換えない */
async function savePrediction(db: Database, record: PredictionRecord): Promise<void> {
  await db.runAsync(
    `INSERT INTO prediction_records (based_on, predicted_start, earliest, latest, confidence, actual_start, abs_error_days)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (based_on) DO UPDATE SET
       predicted_start = excluded.predicted_start, earliest = excluded.earliest, latest = excluded.latest,
       confidence = excluded.confidence, actual_start = excluded.actual_start, abs_error_days = excluded.abs_error_days
     WHERE actual_start IS NULL`,
    record.basedOn,
    record.predictedStart,
    record.earliest,
    record.latest,
    record.confidence,
    record.actualStart,
    record.absErrorDays,
  );
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

/** PMS の日数の決め方。手動の時の日数は zone の pmsDays（書き出しにも入る） */
export async function getPmsEstimate(db: Database): Promise<PmsEstimate> {
  const [row, zone] = await Promise.all([
    db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'pms'"),
    getZoneSettings(db),
  ]);
  // 推定ができる前に日数を変えていた人（と、そういうバックアップを戻した時）は手動のまま
  const pms: PmsEstimate = row
    ? JSON.parse(row.value)
    : zone.pmsDays === DEFAULT_PMS.daysBefore
      ? DEFAULT_PMS
      : { ...DEFAULT_PMS, source: 'manual' };
  return pms.source === 'manual' ? { ...pms, daysBefore: zone.pmsDays, appliedFrom: null, before: null } : pms;
}

async function savePmsEstimate(db: Database, pms: PmsEstimate): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('pms', ?)", JSON.stringify(pms));
}

/** 手動にする時は今の日数から始める。自動に戻すと、次に読み直した時に推定（なければ7日前）へ移る */
export async function setPmsManual(db: Database, manual: boolean): Promise<void> {
  const pms = await getPmsEstimate(db);
  await db.withTransactionAsync(async () => {
    if (manual) await setZoneSettings(db, { ...(await getZoneSettings(db)), pmsDays: pms.daysBefore });
    await savePmsEstimate(db, { ...pms, source: manual ? 'manual' : 'default', appliedFrom: null, before: null });
  });
}

/** 「どうだった？」の答え（答えないは除く）。PMS の日数の推定に使う */
export async function listReviewAnswers(db: Database): Promise<ReviewAnswer[]> {
  return db.getAllAsync<ReviewAnswer>('SELECT date, answer, phase FROM event_reviews WHERE answer IS NOT NULL ORDER BY date');
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

/** 覚えた予定の重さ。まだ決まっていないもの（weight が null）も含む。新しい順 */
export async function listTitleWeights(db: Database): Promise<TitleWeight[]> {
  return db.getAllAsync<TitleWeight>(
    'SELECT term, label, weight, source, observations, lean FROM title_weights ORDER BY updated_at DESC, term',
  );
}

/** learnWeight / overrideWeight の結果を保存する */
export async function saveTitleWeight(db: Database, entry: TitleWeight, now: Date = new Date()): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO title_weights (term, label, weight, source, observations, lean, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    entry.term,
    entry.label,
    entry.weight,
    entry.source,
    entry.observations,
    entry.lean,
    now.toISOString(),
  );
}

/** 覚えた重さを忘れて、言葉の決まりに戻す */
export async function removeTitleWeight(db: Database, term: string): Promise<void> {
  await db.runAsync('DELETE FROM title_weights WHERE term = ?', term);
}

/** 答えた（答えないを選んだ）予定。`statusKey(予定ID, 最後の日)` の集まり */
export async function listReviewed(db: Database): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string }>('SELECT event_id, date FROM event_reviews');
  return new Set(rows.map((row) => statusKey(row.event_id, row.date)));
}

/**
 * 「どうだった？」の答えを残し、答えならその予定の重さを学ぶ。answer が null は「答えない」（学ばない）。
 * 通知とホームの両方から来ても、1つの予定で数えるのは最初の1回だけ
 */
export async function answerReview(db: Database, target: ReviewTarget, answer: Answer | null, now: Date = new Date()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const done = await db.getFirstAsync('SELECT 1 FROM event_reviews WHERE event_id = ? AND date = ?', target.eventId, target.date);
    if (done) return;
    await db.runAsync(
      'INSERT INTO event_reviews (event_id, date, phase, answer, answered_at) VALUES (?, ?, ?, ?, ?)',
      target.eventId,
      target.date,
      target.phase,
      answer,
      now.toISOString(),
    );
    if (!answer) return;
    const entry = await db.getFirstAsync<TitleWeight>(
      'SELECT term, label, weight, source, observations, lean FROM title_weights WHERE term = ?',
      termOf(target.title),
    );
    await saveTitleWeight(db, learnWeight(entry ?? undefined, target.title, answer, target.phase), now);
  });
}

const MANUAL_PREFIX = 'manual:';

/** このアプリの中だけに入れた予定。カレンダーの予定と同じ形で返し、ID の頭で見分ける */
export async function listManualEvents(db: Database): Promise<CalendarEvent[]> {
  const rows = await db.getAllAsync<{
    id: number;
    title: string;
    date: string;
    weight: Weight;
    color: EventColor;
    start_minutes: number | null;
    duration_minutes: number | null;
  }>('SELECT id, title, date, weight, color, start_minutes, duration_minutes FROM manual_events ORDER BY date, start_minutes, id');
  return rows.map((row) => ({
    id: `${MANUAL_PREFIX}${row.id}`,
    title: row.title,
    start: row.date,
    end: row.date,
    allDay: false,
    manual: true,
    weight: row.weight,
    color: row.color,
    ...(row.start_minutes === null ? {} : { startMinutes: row.start_minutes }),
    ...(row.duration_minutes === null ? {} : { durationMinutes: row.duration_minutes }),
  }));
}

export type ManualEventInput = {
  title: string;
  date: DateKey;
  weight: Weight;
  color: EventColor;
  /** 時刻を入れる時だけ。0時からの分 */
  startMinutes?: number;
  durationMinutes?: number;
};

const isMinutes = (value: number | undefined, min: number, max: number) =>
  value === undefined || (Number.isInteger(value) && value >= min && value <= max);

export async function addManualEvent(db: Database, event: ManualEventInput): Promise<void> {
  fromDateKey(event.date);
  const name = event.title.trim();
  if (!name) throw new Error('title is empty');
  if (!EVENT_COLORS.includes(event.color)) throw new Error(`unknown color: ${event.color}`);
  if (!isMinutes(event.startMinutes, 0, 24 * 60 - 1) || !isMinutes(event.durationMinutes, 1, 24 * 60)) throw new Error('bad time');
  await db.runAsync(
    'INSERT INTO manual_events (title, date, weight, color, start_minutes, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)',
    name,
    event.date,
    event.weight,
    event.color,
    event.startMinutes ?? null,
    event.durationMinutes ?? null,
  );
}

export async function removeManualEvent(db: Database, eventId: string): Promise<void> {
  if (eventId.startsWith(MANUAL_PREFIX)) await db.runAsync('DELETE FROM manual_events WHERE id = ?', Number(eventId.slice(MANUAL_PREFIX.length)));
}

/** 通知の「今日は決めない」。同じ予定は最初の1回だけ（もう一度押しても、知らせ直しは増やさない） */
export async function deferAlert(db: Database, eventId: string, date: DateKey, remindOn: DateKey): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO deferred_alerts (event_id, date, remind_on) VALUES (?, ?, ?)', eventId, date, remindOn);
}

/** 「今日は決めない」を押した予定（`statusKey`）と、もう一度知らせる日 */
export async function listDeferrals(db: Database): Promise<Map<string, DateKey>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string; remind_on: string }>('SELECT event_id, date, remind_on FROM deferred_alerts');
  return new Map(rows.map((row) => [statusKey(row.event_id, row.date), row.remind_on]));
}

/** お知らせの状態。未確認は保存しない（行が無い） */
export async function getConflictStatuses(db: Database): Promise<Map<string, ConflictStatus>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string; state: ConflictState; resolution: Resolution | null }>(
    'SELECT event_id, date, state, resolution FROM conflict_states',
  );
  return new Map(rows.map((row) => [statusKey(row.event_id, row.date), { state: row.state, resolution: row.resolution }]));
}

/** 進め方の決まり（advanceStatus）を通した状態を保存する。対応した月を数えられるよう、日時も残す */
export async function saveConflictStatus(
  db: Database,
  eventId: string,
  date: DateKey,
  status: ConflictStatus,
  now: Date = new Date(),
): Promise<void> {
  if (status.state === 'unreviewed') {
    await db.runAsync('DELETE FROM conflict_states WHERE event_id = ? AND date = ?', eventId, date);
    return;
  }
  await db.runAsync(
    'INSERT OR REPLACE INTO conflict_states (event_id, date, state, resolution, updated_at) VALUES (?, ?, ?, ?, ?)',
    eventId,
    date,
    status.state,
    status.resolution,
    now.toISOString(),
  );
}

/** 確認済み・対応済みのお知らせは、一覧と通知から外す */
export const isDismissed = (statuses: Map<string, ConflictStatus>, eventId: string, date: DateKey) =>
  statusOf(statuses, eventId, date).state !== 'unreviewed';

/** 画面が表示に使う保存内容。書き込みのたびにこれだけ読み直す */
export type StoredState = {
  onboarded: boolean;
  /** 設定でお知らせ通知を使うか */
  notifyEnabled: boolean;
  /** 隠すモード。カレンダーに生理の色や言葉を出さない */
  hideMode: boolean;
  /** 開く時と戻った時に Face ID（またはパスコード）を求めるか */
  lockEnabled: boolean;
  /** 利用状況をこの端末に記録するか */
  metricsEnabled: boolean;
  /** お知らせで何をしたかと、その日時（今月のふりかえり用） */
  resolutions: { resolution: Resolution; at: string }[];
  starts: DateKey[];
  /** 予測の帯に使う設定。PMS の日数は pms のもの（設定画面の手動の日数は pms.daysBefore で読む） */
  settings: ZoneSettings;
  /** PMS を生理予定日の何日前からにするかと、その根拠 */
  pms: PmsEstimate;
  /** 予測の当たり具合（直近6回） */
  accuracy: AccuracyReport;
  /** 受診の目安カードを閉じた月（YYYY-MM） */
  consultDismissed: string | null;
  /** 通知で「今日は決めない」を押した予定（`statusKey`）と、もう一度知らせる日 */
  deferrals: Map<string, DateKey>;
  /** このアプリの中だけに入れた予定 */
  manualEvents: CalendarEvent[];
  /** カレンダーを「今はしない」にしている */
  calendarSkipped: boolean;
  /** 覚えた重さ（learned）も入れてある */
  keywords: RiskKeywords;
  /** 覚えた予定の重さ（設定の一覧用） */
  titleWeights: TitleWeight[];
  /** 「どうだった？」に答えた予定（`statusKey`） */
  reviewed: Set<string>;
  /** お知らせの状態（`statusOf` で読む） */
  statuses: Map<string, ConflictStatus>;
};

export async function loadState(db: Database, now: Date = new Date()): Promise<StoredState> {
  const [onboarded, notifyEnabled, hideMode, lockEnabled, metricsEnabled, starts, settings, words, statuses, resolutions, titleWeights, reviewed] = await Promise.all([
    isOnboarded(db),
    isNotifyEnabled(db),
    isHideMode(db),
    isLockEnabled(db),
    isMetricsEnabled(db),
    listPeriodStarts(db),
    getZoneSettings(db),
    getKeywords(db),
    getConflictStatuses(db),
    listResolutions(db),
    listTitleWeights(db),
    listReviewed(db),
  ]);
  const learned = new Map(titleWeights.flatMap(({ term, weight }) => (weight ? [[term, weight] as const] : [])));
  const keywords = { ...words, learned };
  const current = await getPmsEstimate(db);
  const pms = nextPmsEstimate(current, await listReviewAnswers(db), starts, toDateKey(now));
  if (JSON.stringify(pms) !== JSON.stringify(current)) await savePmsEstimate(db, pms);
  // まだ比べていない予測は、今の記録からの予測に合わせておく（開始日を記録した時に、直前に出していた予測と比べる）
  const snapshot = snapshotPrediction(predictCycle(starts), toDateKey(now));
  if (snapshot) await savePrediction(db, snapshot);
  return {
    onboarded,
    notifyEnabled,
    hideMode,
    lockEnabled,
    metricsEnabled,
    starts,
    settings: pmsZoneSettings(settings, pms),
    pms,
    accuracy: buildReport(await listPredictionRecords(db)),
    consultDismissed: await getConsultDismissed(db),
    deferrals: await listDeferrals(db),
    manualEvents: await listManualEvents(db),
    calendarSkipped: await isCalendarSkipped(db),
    keywords,
    titleWeights,
    reviewed,
    statuses,
    resolutions,
  };
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
    // ファイルの PMS の日数が7日前でなければ、手動で決めたものとして戻す
    await db.runAsync("DELETE FROM settings WHERE key = 'pms'");
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
      DELETE FROM conflict_states;
      DELETE FROM metric_events;
      DELETE FROM title_weights;
      DELETE FROM event_reviews;
      DELETE FROM prediction_records;
      DELETE FROM deferred_alerts;
      DELETE FROM manual_events;
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

/** はじめの案内でカレンダーを「今はしない」にしたか。そのあいだは、開くたびに許可を求めない */
export async function isCalendarSkipped(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'calendar_skipped'");
  return row?.value === '1';
}

export async function setCalendarSkipped(db: Database, on: boolean): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('calendar_skipped', ?)", on ? '1' : '0');
}

/** 隠すモード（はじめは使わない）。電車などで開いても、生理の記録だと分からないようにする */
export async function isHideMode(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'hide'");
  return row?.value === '1';
}

export async function setHideMode(db: Database, on: boolean): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('hide', ?)", on ? '1' : '0');
}

/** アプリのロック（はじめは使わない） */
export async function isLockEnabled(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'lock'");
  return row?.value === '1';
}

export async function setLockEnabled(db: Database, on: boolean): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('lock', ?)", on ? '1' : '0');
}

/** お知らせで何をしたかと、その日時。日時の無い（前の版から引き継いだ）ものも含む */
export async function listResolutions(db: Database): Promise<{ resolution: Resolution; at: string }[]> {
  const rows = await db.getAllAsync<{ resolution: Resolution; updated_at: string }>(
    "SELECT resolution, updated_at FROM conflict_states WHERE state = 'resolved' ORDER BY updated_at",
  );
  return rows.map((row) => ({ resolution: row.resolution, at: row.updated_at }));
}

/** 利用状況の記録（はじめは記録する）。この端末の中だけに残す */
export async function isMetricsEnabled(db: Database): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'metrics'");
  return row?.value !== '0';
}

export async function setMetricsEnabled(db: Database, on: boolean): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('metrics', ?)", on ? '1' : '0');
}

/** 受診の目安カードを閉じた月（YYYY-MM）。同じ月にはもう出さない */
export async function getConsultDismissed(db: Database): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = 'consult_dismissed'");
  return row?.value ?? null;
}

export async function dismissConsult(db: Database, month: string): Promise<void> {
  await db.runAsync("INSERT OR REPLACE INTO settings (key, value) VALUES ('consult_dismissed', ?)", month);
}

export type MetricProps = Record<string, string | number | boolean>;

/** オフの時は何もしない。中身には予定の名前や記録の日付を入れない */
export async function recordMetric(db: Database, name: string, props: MetricProps = {}, now: Date = new Date()): Promise<void> {
  if (!(await isMetricsEnabled(db))) return;
  await db.runAsync(
    'INSERT INTO metric_events (name, props, occurred_at) VALUES (?, ?, ?)',
    name,
    JSON.stringify(props),
    now.toISOString(),
  );
}

export async function listMetricEvents(db: Database): Promise<{ name: string; props: MetricProps; occurredAt: string }[]> {
  const rows = await db.getAllAsync<{ name: string; props: string; occurred_at: string }>(
    'SELECT name, props, occurred_at FROM metric_events ORDER BY id',
  );
  return rows.map((row) => ({ name: row.name, props: JSON.parse(row.props) as MetricProps, occurredAt: row.occurred_at }));
}
