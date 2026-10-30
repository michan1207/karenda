import { Confidence, CyclePrediction, MAX_PLAUSIBLE, MIN_PLAUSIBLE, predictedPeriod } from './cycle';
import { DateKey, diffDays } from './date';

/** 次の生理の予測を残したもの。実際の開始日を記録したら比べる。比べたあとは書き換えない */
export type PredictionRecord = {
  /** この開始日までの記録から予測した */
  basedOn: DateKey;
  predictedStart: DateKey;
  earliest: DateKey;
  latest: DateKey;
  confidence: Confidence;
  actualStart: DateKey | null;
  absErrorDays: number | null;
};

/** 今の予測を残す。予測の幅がもう過ぎている（昔の開始日をあとから入れた時など）なら、予測したことにならないので残さない */
export function snapshotPrediction(prediction: CyclePrediction | null, today: DateKey): PredictionRecord | null {
  if (!prediction) return null;
  const { expected, earliest, latest } = predictedPeriod(prediction, 1);
  if (latest < today) return null;
  return {
    basedOn: prediction.lastStart,
    predictedStart: expected,
    earliest,
    latest,
    confidence: prediction.confidence,
    actualStart: null,
    absErrorDays: null,
  };
}

/** 実際の開始日と比べる。前の開始日との間が15〜45日でなければ、記録漏れなどとみなして比べない（null） */
export function evaluatePrediction(record: PredictionRecord, actualStart: DateKey): PredictionRecord | null {
  const gap = diffDays(record.basedOn, actualStart);
  if (gap < MIN_PLAUSIBLE || gap > MAX_PLAUSIBLE) return null;
  return { ...record, actualStart, absErrorDays: Math.abs(diffDays(record.predictedStart, actualStart)) };
}

/** 成績に使う直近の回数 */
export const REPORT_CYCLES = 6;
/** これより少ないと平均などを出さない（0日と見せない） */
const MIN_REPORT = 3;

export type AccuracyReport = {
  /** 比べた回数（直近6回まで） */
  n: number;
  meanAbsErrorDays: number | null;
  /** ±1日以内だった割合（0〜1） */
  within1DayRate: number | null;
  /** 最後に比べた回。errorDays は + なら予測より遅く、− なら早く始まった */
  latest: { predictedStart: DateKey; actualStart: DateKey; errorDays: number } | null;
};

export function buildReport(records: PredictionRecord[]): AccuracyReport {
  const recent = records
    .filter((record) => record.actualStart)
    .sort((a, b) => a.basedOn.localeCompare(b.basedOn))
    .slice(-REPORT_CYCLES);
  const n = recent.length;
  const last = recent.at(-1);
  const latest = last
    ? { predictedStart: last.predictedStart, actualStart: last.actualStart!, errorDays: diffDays(last.predictedStart, last.actualStart!) }
    : null;
  if (n < MIN_REPORT) return { n, meanAbsErrorDays: null, within1DayRate: null, latest };
  const errors = recent.map((record) => record.absErrorDays!);
  return {
    n,
    meanAbsErrorDays: errors.reduce((sum, days) => sum + days, 0) / n,
    within1DayRate: errors.filter((days) => days <= 1).length / n,
    latest,
  };
}
