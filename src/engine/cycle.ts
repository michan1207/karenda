import { addDays, DateKey, diffDays } from './date';

export type Confidence = 'high' | 'medium' | 'low';

/** 記録漏れなどとみなして、予測の計算から外した間隔。記録そのものは消さない */
export type ExcludedInterval = { from: DateKey; to: DateKey; days: number; reason: 'tooShort' | 'tooLong' };

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

const RECENT_CYCLES = 6;
const MIN_PLAUSIBLE = 15;
// これより長い間隔は、途中の記録漏れとみなして計算から外す
const MAX_PLAUSIBLE = 45;
const MIN_CYCLES = 3;
const DEFAULT_LENGTH = 28;
const DEFAULT_SPREAD = 2;

/** 周期の数と予測の幅（最も早い日〜最も遅い日の日数）から決める */
function confidenceOf(cyclesUsed: number, spreadDays: number): Confidence {
  if (cyclesUsed >= 4 && spreadDays <= 4) return 'high';
  if (cyclesUsed >= 2 && spreadDays <= 8) return 'medium';
  return 'low';
}

export function predictCycle(starts: DateKey[]): CyclePrediction | null {
  const sorted = [...new Set(starts)].sort();
  if (sorted.length === 0) return null;

  const gaps = sorted.slice(1).map((to, i) => ({ from: sorted[i], to, days: diffDays(sorted[i], to) }));
  const excluded = gaps.flatMap(({ from, to, days }): ExcludedInterval[] => {
    if (days < MIN_PLAUSIBLE) return [{ from, to, days, reason: 'tooShort' }];
    if (days > MAX_PLAUSIBLE) return [{ from, to, days, reason: 'tooLong' }];
    return [];
  });
  const lengths = gaps
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
