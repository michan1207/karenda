import { addDays, DateKey, diffDays } from './date';

export type Confidence = 'high' | 'medium' | 'low';

/** 記録漏れなどとみなして、予測の計算から外した間隔。記録そのものは消さない */
export type ExcludedInterval = {
  from: DateKey;
  to: DateKey;
  days: number;
  /** pill: ピルを飲んでいない今は、飲んでいた間の間隔を使わない / offPill: 飲んでいる今は、飲んでいない間の間隔を使わない */
  reason: 'tooShort' | 'tooLong' | 'shifted' | 'pill' | 'offPill';
};

/** ピルを飲んでいた（いる）期間。end が null なら今も飲んでいる */
export type PillPeriod = { start: DateKey; end: DateKey | null };

/**
 * 開始日についての補足。shifted は薬で時期をずらした印をつけた生理の開始日、pill はピルを飲んでいた期間、
 * shift は月経移動の薬を飲んだ期間。どれも、ふだんの周期とは分けて扱う
 */
export type CycleNotes = { shifted?: ReadonlySet<DateKey>; pill?: readonly PillPeriod[]; shift?: readonly PillPeriod[] };

/** 月経移動の薬をやめた日から、この日数のうちに始まった生理を、ずらした生理とみなす */
export const SHIFT_AFTER_DAYS = 10;

/** 月経移動の薬を飲んでから（やめた日の SHIFT_AFTER_DAYS 日後まで）に始まった生理か */
export const afterShiftMedicine = (day: DateKey, notes: CycleNotes) =>
  notes.shift?.some(({ start, end }) => start <= day && (end === null || day <= addDays(end, SHIFT_AFTER_DAYS))) ?? false;

/** ずらした生理か（印をつけたか、月経移動の薬のあとに始まった） */
export const isShifted = (day: DateKey, notes: CycleNotes) => (notes.shifted?.has(day) ?? false) || afterShiftMedicine(day, notes);

/** 今、月経移動の薬を飲んでいるか */
export const takingShiftMedicine = (notes: CycleNotes) => notes.shift?.some(({ end }) => end === null) ?? false;

export const onPill = (day: DateKey, pill: readonly PillPeriod[] = []) =>
  pill.some(({ start, end }) => start <= day && (end === null || day <= end));

/** 今もピルを飲んでいるか（終わりの日の無い期間がある） */
export const takingPill = (notes: CycleNotes) => notes.pill?.some(({ end }) => end === null) ?? false;

/** その開始日で終わる間隔の種類。ずらした生理まで / ピルを飲んでいる間に始まった生理まで / ふだんの周期 */
export function gapKind(to: DateKey, notes: CycleNotes): 'shifted' | 'pill' | 'natural' {
  if (isShifted(to, notes)) return 'shifted';
  return onPill(to, notes.pill) ? 'pill' : 'natural';
}

export type CyclePrediction = {
  /** 記録されている最後の生理開始日 */
  lastStart: DateKey;
  averageLength: number;
  /** 予測の幅の片側の日数。直近の周期の標準偏差（最低1日） */
  spread: number;
  /** 計算に使った周期の数 */
  cyclesUsed: number;
  excluded: ExcludedInterval[];
  /** 周期が3つそろうまでは、28日±2日を仮定する */
  provisional: boolean;
  confidence: Confidence;
};

export const RECENT_CYCLES = 6;
export const MIN_PLAUSIBLE = 15;
// これより長い間隔は、途中の記録漏れとみなして計算から外す
export const MAX_PLAUSIBLE = 45;
const MIN_CYCLES = 3;
const DEFAULT_LENGTH = 28;
const DEFAULT_SPREAD = 2;

/** 周期の数と予測の幅（最も早い日〜最も遅い日の日数）から決める */
function confidenceOf(cyclesUsed: number, spreadDays: number): Confidence {
  if (cyclesUsed >= 4 && spreadDays <= 4) return 'high';
  if (cyclesUsed >= 2 && spreadDays <= 8) return 'medium';
  return 'low';
}

export function predictCycle(starts: DateKey[], notes: CycleNotes = {}): CyclePrediction | null {
  const sorted = [...new Set(starts)].sort();
  if (sorted.length === 0) return null;

  // ピルを飲んでいる今は飲んでいる間の間隔だけ、飲んでいない今はふだんの間隔だけで予測する
  const want = takingPill(notes) ? 'pill' : 'natural';
  const gaps = sorted.slice(1).map((to, i) => ({ from: sorted[i], to, days: diffDays(sorted[i], to), kind: gapKind(to, notes) }));
  const excluded = gaps.flatMap(({ from, to, days, kind }): ExcludedInterval[] => {
    if (kind === 'shifted') return [{ from, to, days, reason: 'shifted' }];
    if (kind !== want) return [{ from, to, days, reason: kind === 'pill' ? 'pill' : 'offPill' }];
    if (days < MIN_PLAUSIBLE) return [{ from, to, days, reason: 'tooShort' }];
    if (days > MAX_PLAUSIBLE) return [{ from, to, days, reason: 'tooLong' }];
    return [];
  });
  const lengths = gaps
    .filter(({ kind }) => kind === want)
    .map(({ days }) => days)
    .filter((days) => days >= MIN_PLAUSIBLE && days <= MAX_PLAUSIBLE)
    .slice(-RECENT_CYCLES);
  const lastStart = sorted[sorted.length - 1];

  if (lengths.length < MIN_CYCLES) {
    return {
      lastStart,
      averageLength: DEFAULT_LENGTH,
      spread: DEFAULT_SPREAD,
      cyclesUsed: lengths.length,
      excluded,
      provisional: true,
      confidence: 'low',
    };
  }

  const mean = lengths.reduce((sum, days) => sum + days, 0) / lengths.length;
  const sd = Math.sqrt(lengths.reduce((sum, days) => sum + (days - mean) ** 2, 0) / lengths.length);
  const spread = Math.max(1, Math.round(sd));
  return {
    lastStart,
    averageLength: Math.round(mean),
    spread,
    cyclesUsed: lengths.length,
    excluded,
    provisional: false,
    confidence: confidenceOf(lengths.length, spread * 2),
  };
}

export type PredictedPeriod = { expected: DateKey; earliest: DateKey; latest: DateKey };

/** n回目（1始まり）の次の生理の予測。幅は周期ごとに増やさず、直近の周期のばらつきで固定する */
export function predictedPeriod(prediction: CyclePrediction, n: number): PredictedPeriod {
  const expected = addDays(prediction.lastStart, n * prediction.averageLength);
  return {
    expected,
    earliest: addDays(expected, -prediction.spread),
    latest: addDays(expected, prediction.spread),
  };
}

/** その日にいちばん近い、これからの生理の予測。日付の詳細で幅を見せるのに使う */
export function nearestPeriod(prediction: CyclePrediction, day: DateKey): PredictedPeriod {
  const n = Math.round(diffDays(prediction.lastStart, day) / prediction.averageLength);
  return predictedPeriod(prediction, Math.max(1, n));
}

export type CycleStats = { count: number; average: number; shortest: number; longest: number };

const statsOf = (days: number[]): CycleStats | null =>
  days.length === 0
    ? null
    : {
        count: days.length,
        average: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
        shortest: Math.min(...days),
        longest: Math.max(...days),
      };

/**
 * 記録全体の周期のまとめ（設定の「周期のまとめ」）。予測とちがい、最近の数回にしぼらない。
 * natural・pill は記録漏れとみなす長さの間隔を入れない。shifted はずらした生理までの間隔（長さで外さない）。
 * periodDays は記録した終わりの日までの日数（開始日を1日目）
 */
export function cycleSummary(starts: DateKey[], notes: CycleNotes, ends: ReadonlyMap<DateKey, DateKey>) {
  const sorted = [...new Set(starts)].sort();
  const gaps = sorted.slice(1).map((to, i) => ({ days: diffDays(sorted[i], to), kind: gapKind(to, notes) }));
  const plausible = (kind: string) =>
    gaps.filter((gap) => gap.kind === kind && gap.days >= MIN_PLAUSIBLE && gap.days <= MAX_PLAUSIBLE).map(({ days }) => days);
  return {
    natural: statsOf(plausible('natural')),
    pill: statsOf(plausible('pill')),
    shifted: statsOf(gaps.filter(({ kind }) => kind === 'shifted').map(({ days }) => days)),
    periodDays: statsOf([...ends].map(([start, end]) => diffDays(start, end) + 1)),
  };
}
