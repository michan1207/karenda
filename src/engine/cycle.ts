import { addDays, DateKey, diffDays } from './date';

export type CyclePrediction = {
  /** 記録されている最後の生理開始日 */
  lastStart: DateKey;
  averageLength: number;
  minLength: number;
  maxLength: number;
  /** 計算に使った周期の数 */
  cyclesUsed: number;
  /** 記録が少なく、28日周期を仮定しているとき true */
  provisional: boolean;
};

const RECENT_CYCLES = 6;
const MIN_PLAUSIBLE = 15;
// これより長い間隔は、途中の記録漏れとみなして計算から外す
const MAX_PLAUSIBLE = 45;
const DEFAULT_LENGTH = 28;
const DEFAULT_SPREAD = 2;

export function predictCycle(starts: DateKey[]): CyclePrediction | null {
  const sorted = [...new Set(starts)].sort();
  if (sorted.length === 0) return null;

  const lengths = sorted
    .slice(1)
    .map((start, i) => diffDays(sorted[i], start))
    .filter((days) => days >= MIN_PLAUSIBLE && days <= MAX_PLAUSIBLE)
    .slice(-RECENT_CYCLES);
  const lastStart = sorted[sorted.length - 1];

  if (lengths.length < 2) {
    return {
      lastStart,
      averageLength: DEFAULT_LENGTH,
      minLength: DEFAULT_LENGTH - DEFAULT_SPREAD,
      maxLength: DEFAULT_LENGTH + DEFAULT_SPREAD,
      cyclesUsed: lengths.length,
      provisional: true,
    };
  }

  return {
    lastStart,
    averageLength: Math.round(lengths.reduce((sum, days) => sum + days, 0) / lengths.length),
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    cyclesUsed: lengths.length,
    provisional: false,
  };
}

export type PredictedPeriod = { expected: DateKey; earliest: DateKey; latest: DateKey };

/** n回目（1始まり）の次の生理の予測。ずれの幅は周期ごとに増やさず、直近の周期のばらつきで固定する */
export function predictedPeriod(prediction: CyclePrediction, n: number): PredictedPeriod {
  const base = addDays(prediction.lastStart, (n - 1) * prediction.averageLength);
  return {
    expected: addDays(base, prediction.averageLength),
    earliest: addDays(base, prediction.minLength),
    latest: addDays(base, prediction.maxLength),
  };
}
