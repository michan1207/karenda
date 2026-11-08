import { AccuracyReport, buildReport, evaluatePrediction, PredictionRecord, snapshotPrediction } from '../engine/accuracy';
import { advanceStatus, ConflictState, ConflictStatus, Resolution, statusOf } from '../engine/conflictState';
import { predictCycle } from '../engine/cycle';
import { DailyCheck, Symptom, SYMPTOMS } from '../engine/dailyCheck';
import { DateKey, diffDays, fromDateKey, toDateKey } from '../engine/date';
import { CalendarEvent, EVENT_COLORS, EventColor } from '../engine/conflicts';
import { Answer, learnWeight, ReviewPhase, ReviewTarget, TitleWeight, Weight } from '../engine/learning';
import { nextPmsEstimate, PmsEstimate, pmsZoneSettings, ReviewAnswer, withDailyChecks } from '../engine/pms';
import { termOf } from '../engine/risk';
import type { RiskKeywords } from '../engine/risk';
import { MAX_PERIOD_DAYS, validateZoneSettings, ZoneSettings } from '../engine/zones';
import type { Database } from './database';
import { SCHEMA_VERSION, seedDefaults } from './migrations';
import { STORED_DATA } from './privacy';
import {
  clearPmsEstimate,
  getConsultDismissed,
  getPmsEstimate,
  getZoneSettings,
  isCalendarSkipped,
  isHideMode,
  isLockEnabled,
  isMetricsEnabled,
  isNotifyEnabled,
  isOnboarded,
  isSoonEnabled,
  savePmsEstimate,
  setHideMode,
  setLockEnabled,
  setNotifyEnabled,
  setSoonEnabled,
  setZoneSettings,
} from './settings';

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

/** 記録した終わりの日（開始日→終わりの日） */
export async function listPeriodEnds(db: Database): Promise<Map<DateKey, DateKey>> {
  const rows = await db.getAllAsync<{ start: string; end_date: string }>('SELECT start, end_date FROM period_starts WHERE end_date IS NOT NULL');
  return new Map(rows.map((row) => [row.start, row.end_date]));
}

/** 生理の終わりの日を残す（null で消す）。開始日の翌日から MAX_PERIOD_DAYS 日目まで、次の開始日より前の日だけ */
export async function setPeriodEnd(db: Database, start: DateKey, end: DateKey | null): Promise<void> {
  if (end !== null) {
    const days = diffDays(start, end);
    const next = (await listPeriodStarts(db)).find((s) => s > start);
    if (days < 1 || days >= MAX_PERIOD_DAYS || (next && end >= next)) throw new Error(`period end out of range: ${start}..${end}`);
  }
  await db.runAsync('UPDATE period_starts SET end_date = ? WHERE start = ?', end, start);
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

/** その日の体調を残す（同じ日は書き換える）。answer が null は「答えない」 */
export async function saveDailyCheck(db: Database, check: DailyCheck, now: Date = new Date()): Promise<void> {
  fromDateKey(check.date);
  if (!isDailyCheck(check)) throw new Error(`broken daily check: ${JSON.stringify(check)}`);
  await db.runAsync(
    'INSERT OR REPLACE INTO daily_checks (date, answer, symptoms, answered_at) VALUES (?, ?, ?, ?)',
    check.date,
    check.answer,
    check.symptoms.join(','),
    now.toISOString(),
  );
}

export async function listDailyChecks(db: Database): Promise<DailyCheck[]> {
  const rows = await db.getAllAsync<{ date: string; answer: DailyCheck['answer']; symptoms: string }>(
    'SELECT date, answer, symptoms FROM daily_checks ORDER BY date',
  );
  return rows.map((row) => ({ date: row.date, answer: row.answer, symptoms: row.symptoms ? (row.symptoms.split(',') as Symptom[]) : [] }));
}

/** 答えた（答えないを選んだ）予定のID */
export async function listReviewed(db: Database): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string }>('SELECT event_id, date FROM event_reviews');
  return new Set(rows.map((row) => row.event_id));
}

/**
 * 「どうだった？」の答えを残し、答えならその予定の重さを学ぶ。answer が null は「答えない」（学ばない）。
 * 通知とホームの両方から来ても、1つの予定で数えるのは最初の1回だけ
 */
export async function answerReview(db: Database, target: ReviewTarget, answer: Answer | null, now: Date = new Date()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const done = await db.getFirstAsync('SELECT 1 FROM event_reviews WHERE event_id = ?', target.eventId);
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

/** 「今日は決めない」を押した予定（ID）と、もう一度知らせる日 */
export async function listDeferrals(db: Database): Promise<Map<string, DateKey>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string; remind_on: string }>('SELECT event_id, date, remind_on FROM deferred_alerts');
  return new Map(rows.map((row) => [row.event_id, row.remind_on]));
}

/** お知らせの状態。未確認は保存しない（行が無い） */
export async function getConflictStatuses(db: Database): Promise<Map<string, ConflictStatus>> {
  const rows = await db.getAllAsync<{ event_id: string; date: string; state: ConflictState; resolution: Resolution | null }>(
    'SELECT event_id, date, state, resolution FROM conflict_states',
  );
  return new Map(rows.map((row) => [row.event_id, { state: row.state, resolution: row.resolution }]));
}

/**
 * 進め方の決まり（advanceStatus）を通した状態を保存する。対応した月を数えられるよう、日時も残す。
 * 状態は予定ごとに1つ。date はその時のお知らせの日で、鍵にはしない（予測が動くとずれるため）
 */
export async function saveConflictStatus(
  db: Database,
  eventId: string,
  date: DateKey,
  status: ConflictStatus,
  now: Date = new Date(),
): Promise<void> {
  if (status.state === 'unreviewed') {
    await db.runAsync('DELETE FROM conflict_states WHERE event_id = ?', eventId);
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

/** お知らせへの答え。確認した / 対応した（何をしたか）/ 今日は決めない（もう一度知らせる日） */
export type AlertDecision = { kind: 'acknowledge' } | { kind: 'resolve'; resolution: Resolution } | { kind: 'defer'; remindOn: DateKey };

/**
 * 通知と画面のボタンの答えを、今の状態を読んでから1トランザクションで残す（途中で失敗しても半分だけ残らない）。
 * 状態は advanceStatus で前にだけ進め、対応済みへは確認済みを通って進む。状態を進めた予定があれば true
 */
export async function applyDecision(db: Database, conflicts: { eventId: string; date: DateKey }[], decision: AlertDecision): Promise<boolean> {
  let advanced = false;
  await db.withTransactionAsync(async () => {
    const statuses = await getConflictStatuses(db);
    for (const { eventId, date } of conflicts) {
      if (decision.kind === 'defer') {
        await deferAlert(db, eventId, date, decision.remindOn);
        continue;
      }
      let current = statusOf(statuses, eventId);
      if (decision.kind === 'acknowledge' && current.state !== 'unreviewed') continue;
      if (current.state === 'unreviewed') current = advanceStatus(current, 'acknowledged');
      if (decision.kind === 'resolve') current = advanceStatus(current, 'resolved', decision.resolution);
      await saveConflictStatus(db, eventId, date, current);
      advanced = true;
    }
  });
  return advanced;
}

/** 確認済み・対応済みのお知らせは、一覧と通知から外す */
export const isDismissed = (statuses: Map<string, ConflictStatus>, eventId: string) => statusOf(statuses, eventId).state !== 'unreviewed';

/** 画面が表示に使う保存内容。書き込みのたびにこれだけ読み直す */
export type StoredState = {
  onboarded: boolean;
  /** 設定でお知らせ通知を使うか */
  notifyEnabled: boolean;
  /** 予定の30分前にも知らせるか */
  soonEnabled: boolean;
  /** 隠すモード。カレンダーに生理の色や言葉を出さない */
  hideMode: boolean;
  /** 開く時と戻った時に Face ID（またはパスコード）を求めるか */
  lockEnabled: boolean;
  /** 利用状況をこの端末に記録するか */
  metricsEnabled: boolean;
  /** お知らせで何をしたかと、その日時（今月のふりかえり用） */
  resolutions: { resolution: Resolution; at: string }[];
  starts: DateKey[];
  /** 記録した生理の終わりの日（開始日→終わりの日） */
  ends: Map<DateKey, DateKey>;
  /** 予測の帯に使う設定。PMS の日数は pms のもの（設定画面の手動の日数は pms.daysBefore で読む） */
  settings: ZoneSettings;
  /** PMS を生理予定日の何日前からにするかと、その根拠 */
  pms: PmsEstimate;
  /** 予測の当たり具合（直近6回） */
  accuracy: AccuracyReport;
  /** 受診の目安カードを閉じた月（YYYY-MM） */
  consultDismissed: string | null;
  /** 通知で「今日は決めない」を押した予定（ID）と、もう一度知らせる日 */
  deferrals: Map<string, DateKey>;
  /** このアプリの中だけに入れた予定 */
  manualEvents: CalendarEvent[];
  /** カレンダーを「今はしない」にしている */
  calendarSkipped: boolean;
  /** 覚えた重さ（learned）も入れてある */
  keywords: RiskKeywords;
  /** 覚えた予定の重さ（設定の一覧用） */
  titleWeights: TitleWeight[];
  /** 「どうだった？」に答えた予定のID */
  reviewed: Set<string>;
  /** その日の体調（日付→記録） */
  checks: Map<DateKey, DailyCheck>;
  /** お知らせの状態（`statusOf` で読む） */
  statuses: Map<string, ConflictStatus>;
};

export async function loadState(db: Database, now: Date = new Date()): Promise<StoredState> {
  const [onboarded, notifyEnabled, soonEnabled, hideMode, lockEnabled, metricsEnabled, starts, settings, words, statuses, resolutions, titleWeights, reviewed] = await Promise.all([
    isOnboarded(db),
    isNotifyEnabled(db),
    isSoonEnabled(db),
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
  const checks = await listDailyChecks(db);
  const ends = await listPeriodEnds(db);
  const answers = withDailyChecks(await listReviewAnswers(db), checks, { starts, ends, heavyDays: settings.heavyDays });
  const pms = nextPmsEstimate(current, answers, starts, toDateKey(now));
  if (JSON.stringify(pms) !== JSON.stringify(current)) await savePmsEstimate(db, pms);
  // まだ比べていない予測は、今の記録からの予測に合わせておく（開始日を記録した時に、直前に出していた予測と比べる）
  const snapshot = snapshotPrediction(predictCycle(starts), toDateKey(now));
  if (snapshot) await savePrediction(db, snapshot);
  return {
    onboarded,
    notifyEnabled,
    soonEnabled,
    hideMode,
    lockEnabled,
    metricsEnabled,
    starts,
    ends,
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
    checks: new Map(checks.map((check) => [check.date, check])),
    statuses,
    resolutions,
  };
}

/** 書き出しの形の版。表の版（SCHEMA_VERSION）とは別に、書き出しの形を変えた時だけ上げる。これを持たない前のファイルは 0 */
export const EXPORT_VERSION = 3;

/** このアプリだけの予定。id は、戻した時に「どうだった？」の答えを付け直すために使う */
export type ExportedManualEvent = {
  id: string;
  title: string;
  date: DateKey;
  weight: Weight;
  color: EventColor;
  startMinutes: number | null;
  durationMinutes: number | null;
};
export type ExportedReview = { eventId: string; date: DateKey; phase: ReviewPhase; answer: Answer | null; answeredAt: string };
/** ロック・隠すモード・お知らせ通知の設定。soon（30分前の通知）は 1.0.3 までのファイルには無い（戻しても今のまま） */
export type ExportedFlags = { lock: boolean; hide: boolean; notify: boolean; soon?: boolean };

export type ExportedData = {
  app: 'karenda';
  exportVersion: number;
  /** 表の版。exportVersion を知らない前のアプリが「新しいアプリのファイル」と見分けられるよう、書き続ける */
  schemaVersion: number;
  exportedAt: string;
  periodStarts: DateKey[];
  /** 生理の終わりの日。版1までのファイルには無い */
  periodEnds: { start: DateKey; end: DateKey }[];
  zoneSettings: ZoneSettings;
  keywords: RiskKeywords;
  manualEvents: ExportedManualEvent[];
  titleWeights: TitleWeight[];
  reviews: ExportedReview[];
  predictionRecords: PredictionRecord[];
  /** その日の体調。版2までのファイルには無い */
  dailyChecks: DailyCheck[];
  /** 前のファイルには無い（戻しても今の設定のまま） */
  flags: ExportedFlags | null;
};

/** 機種変更などのための書き出し。お知らせの状態と「今日は決めない」は端末の予定IDに結びつくので含めない */
export async function exportData(db: Database, now: Date = new Date()): Promise<ExportedData> {
  return {
    app: 'karenda',
    exportVersion: EXPORT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    periodStarts: await listPeriodStarts(db),
    periodEnds: [...(await listPeriodEnds(db))].map(([start, end]) => ({ start, end })),
    zoneSettings: await getZoneSettings(db),
    keywords: await getKeywords(db),
    manualEvents: await db.getAllAsync<ExportedManualEvent>(
      `SELECT '${MANUAL_PREFIX}' || id AS id, title, date, weight, color, start_minutes AS startMinutes, duration_minutes AS durationMinutes
       FROM manual_events ORDER BY id`,
    ),
    titleWeights: await listTitleWeights(db),
    reviews: await db.getAllAsync<ExportedReview>(
      'SELECT event_id AS eventId, date, phase, answer, answered_at AS answeredAt FROM event_reviews ORDER BY date, event_id',
    ),
    predictionRecords: await listPredictionRecords(db),
    dailyChecks: await listDailyChecks(db),
    flags: { lock: await isLockEnabled(db), hide: await isHideMode(db), notify: await isNotifyEnabled(db), soon: await isSoonEnabled(db) },
  };
}

export type ReadExport = { ok: true; data: ExportedData } | { ok: false; reason: 'broken' | 'notCocomia' | 'newer' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isWords = (value: unknown): value is string[] => Array.isArray(value) && value.every((v) => typeof v === 'string');
const isListOf = <T>(value: unknown, check: (item: Record<string, unknown>) => boolean): value is T[] =>
  Array.isArray(value) && value.every((item) => isRecord(item) && check(item));
const isOneOf = (values: readonly unknown[], value: unknown) => values.includes(value);
const isWhole = (value: unknown, min = 0, max = Infinity): value is number =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const isDay = (value: unknown): value is DateKey => {
  if (typeof value !== 'string') return false;
  try {
    fromDateKey(value);
    return true;
  } catch {
    return false;
  }
};

const isManualEvent = (event: Record<string, unknown>) =>
  typeof event.id === 'string' &&
  typeof event.title === 'string' &&
  event.title.trim() !== '' &&
  isDay(event.date) &&
  isOneOf(['heavy', 'normal'], event.weight) &&
  isOneOf(EVENT_COLORS, event.color) &&
  (event.startMinutes === null || isWhole(event.startMinutes, 0, 24 * 60 - 1)) &&
  (event.durationMinutes === null || isWhole(event.durationMinutes, 1, 24 * 60));

const isTitleWeight = (entry: Record<string, unknown>) =>
  typeof entry.term === 'string' &&
  entry.term !== '' &&
  typeof entry.label === 'string' &&
  (entry.weight === null || isOneOf(['heavy', 'normal'], entry.weight)) &&
  isOneOf(['learned', 'user'], entry.source) &&
  isWhole(entry.observations) &&
  Number.isInteger(entry.lean);

const isReview = (review: Record<string, unknown>) =>
  typeof review.eventId === 'string' &&
  isDay(review.date) &&
  isOneOf(['period', 'pms', 'other'], review.phase) &&
  (review.answer === null || isOneOf(['hard', 'normal', 'easy'], review.answer)) &&
  typeof review.answeredAt === 'string';

const isPrediction = (record: Record<string, unknown>) =>
  isDay(record.basedOn) &&
  isDay(record.predictedStart) &&
  isDay(record.earliest) &&
  isDay(record.latest) &&
  isOneOf(['high', 'medium', 'low'], record.confidence) &&
  (record.actualStart === null || isDay(record.actualStart)) &&
  (record.absErrorDays === null || isWhole(record.absErrorDays));

const isDailyCheck = (check: Record<string, unknown>) =>
  isDay(check.date) &&
  (check.answer === null || isOneOf(['hard', 'normal', 'easy'], check.answer)) &&
  Array.isArray(check.symptoms) &&
  check.symptoms.every((symptom) => isOneOf(SYMPTOMS, symptom)) &&
  new Set(check.symptoms).size === check.symptoms.length;

const isFlags = (flags: unknown): flags is ExportedFlags =>
  isRecord(flags) &&
  typeof flags.lock === 'boolean' &&
  typeof flags.hide === 'boolean' &&
  typeof flags.notify === 'boolean' &&
  (flags.soon === undefined || typeof flags.soon === 'boolean');

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
  const version = raw.exportVersion ?? 0;
  if (typeof version === 'number' && version > EXPORT_VERSION) return { ok: false, reason: 'newer' };
  // exportVersion を持たない前のファイルは、表の版で新しさを見ていた
  if (version === 0 && typeof schemaVersion === 'number' && schemaVersion > SCHEMA_VERSION) return { ok: false, reason: 'newer' };
  const old = version === 0;
  const extra: Record<string, unknown> = old ? { manualEvents: [], titleWeights: [], reviews: [], predictionRecords: [] } : raw;
  const periodEnds = isWhole(version, 2) ? raw.periodEnds : [];
  const dailyChecks = isWhole(version, 3) ? raw.dailyChecks : [];
  if (
    !isWhole(version) ||
    !Number.isInteger(schemaVersion) ||
    !isWords(periodStarts) ||
    !isRecord(zoneSettings) ||
    !isRecord(keywords) ||
    !isWords(keywords.high) ||
    !isWords(keywords.medium) ||
    !isListOf<ExportedManualEvent>(extra.manualEvents, isManualEvent) ||
    !isListOf<TitleWeight>(extra.titleWeights, isTitleWeight) ||
    !isListOf<ExportedReview>(extra.reviews, isReview) ||
    !isListOf<PredictionRecord>(extra.predictionRecords, isPrediction) ||
    !isListOf<DailyCheck>(dailyChecks, isDailyCheck) ||
    !isListOf<{ start: DateKey; end: DateKey }>(periodEnds, (e) => isDay(e.start) && isDay(e.end) && periodStarts.includes(e.start)) ||
    !periodEnds.every(({ start, end }) => diffDays(start, end) >= 1 && diffDays(start, end) < MAX_PERIOD_DAYS) ||
    !(old || isFlags(raw.flags))
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
      exportVersion: version,
      schemaVersion: schemaVersion as number,
      exportedAt: typeof exportedAt === 'string' ? exportedAt : '',
      periodStarts,
      periodEnds,
      zoneSettings: settings,
      keywords: { high: keywords.high, medium: keywords.medium },
      manualEvents: extra.manualEvents,
      titleWeights: extra.titleWeights,
      reviews: extra.reviews,
      predictionRecords: extra.predictionRecords,
      dailyChecks,
      flags: old ? null : (raw.flags as ExportedFlags),
    },
  };
}

/** replace: ファイルの中身に置き換える / keepMine: 記録は足し、設定は今のまま / preferFile: 記録は足し、設定はファイルのもの */
export type RestoreMode = 'replace' | 'keepMine' | 'preferFile';

/**
 * 読み込んだ記録を戻す。途中で失敗したら何も変えない。
 * 覚えた重さは記録として足す（同じ名前があれば keepMine は今のもの、ほかはファイルのもの）。
 * ロック・隠すモード・通知は設定として扱い、keepMine では変えない
 */
export async function restoreData(db: Database, data: ExportedData, mode: RestoreMode): Promise<void> {
  await db.withTransactionAsync(async () => {
    if (mode === 'replace') {
      await db.execAsync(`
        DELETE FROM period_starts;
        DELETE FROM manual_events;
        DELETE FROM title_weights;
        DELETE FROM event_reviews;
        DELETE FROM prediction_records;
        DELETE FROM daily_checks;
      `);
    }
    for (const start of data.periodStarts) await addPeriodStart(db, start);
    for (const { start, end } of data.periodEnds) {
      // keepMine は、この端末に終わりの日がもうあれば変えない
      await db.runAsync('UPDATE period_starts SET end_date = ? WHERE start = ? AND (? OR end_date IS NULL)', end, start, mode !== 'keepMine');
    }
    // このアプリだけの予定は、戻すと ID が変わる。答えはその新しい ID に付け直す
    const movedIds = new Map<string, string>();
    for (const event of data.manualEvents) movedIds.set(event.id, await restoreManualEvent(db, event));
    for (const review of data.reviews) {
      await db.runAsync(
        'INSERT OR IGNORE INTO event_reviews (event_id, date, phase, answer, answered_at) VALUES (?, ?, ?, ?, ?)',
        movedIds.get(review.eventId) ?? review.eventId,
        review.date,
        review.phase,
        review.answer,
        review.answeredAt,
      );
    }
    for (const record of data.predictionRecords) await savePrediction(db, record);
    for (const check of data.dailyChecks) {
      await db.runAsync(
        `INSERT OR ${mode === 'keepMine' ? 'IGNORE' : 'REPLACE'} INTO daily_checks (date, answer, symptoms, answered_at) VALUES (?, ?, ?, ?)`,
        check.date,
        check.answer,
        check.symptoms.join(','),
        data.exportedAt,
      );
    }
    for (const entry of data.titleWeights) {
      await db.runAsync(
        `INSERT OR ${mode === 'keepMine' ? 'IGNORE' : 'REPLACE'} INTO title_weights (term, label, weight, source, observations, lean, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        entry.term,
        entry.label,
        entry.weight,
        entry.source,
        entry.observations,
        entry.lean,
        data.exportedAt,
      );
    }
    if (mode === 'keepMine') return;
    await setZoneSettings(db, data.zoneSettings);
    // ファイルの PMS の日数が7日前でなければ、手動で決めたものとして戻す
    await clearPmsEstimate(db);
    await writeKeywords(db, data.keywords);
    if (!data.flags) return;
    await setLockEnabled(db, data.flags.lock);
    await setHideMode(db, data.flags.hide);
    await setNotifyEnabled(db, data.flags.notify);
    if (data.flags.soon !== undefined) await setSoonEnabled(db, data.flags.soon);
  });
}

/** 同じ日・名前・時刻の予定がもうあれば足さない（同じファイルを2回戻しても増えない）。戻した先の ID を返す */
async function restoreManualEvent(db: Database, event: ExportedManualEvent): Promise<string> {
  const same = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM manual_events WHERE title = ? AND date = ? AND start_minutes IS ? AND duration_minutes IS ?',
    event.title.trim(),
    event.date,
    event.startMinutes,
    event.durationMinutes,
  );
  if (same) return `${MANUAL_PREFIX}${same.id}`;
  await addManualEvent(db, {
    title: event.title,
    date: event.date,
    weight: event.weight,
    color: event.color,
    startMinutes: event.startMinutes ?? undefined,
    durationMinutes: event.durationMinutes ?? undefined,
  });
  const added = await db.getFirstAsync<{ id: number }>('SELECT last_insert_rowid() AS id');
  return `${MANUAL_PREFIX}${added!.id}`;
}

/** 記録・設定をすべて消して、はじめて開いたときの状態に戻す */
export async function deleteAllData(db: Database): Promise<void> {
  await db.withTransactionAsync(async () => {
    // 残しているものの名簿（privacy.ts）の表を全部空にする。表を足しても消し忘れない（名簿と実際の表はテストで突き合わせる）
    for (const { table } of STORED_DATA) await db.execAsync(`DELETE FROM ${table}`);
    await seedDefaults(db);
  });
}

/** お知らせで何をしたかと、その日時。日時の無い（前の版から引き継いだ）ものも含む */
export async function listResolutions(db: Database): Promise<{ resolution: Resolution; at: string }[]> {
  const rows = await db.getAllAsync<{ resolution: Resolution; updated_at: string }>(
    "SELECT resolution, updated_at FROM conflict_states WHERE state = 'resolved' ORDER BY updated_at",
  );
  return rows.map((row) => ({ resolution: row.resolution, at: row.updated_at }));
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
