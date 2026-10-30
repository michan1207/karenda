import { buildReport, evaluatePrediction, PredictionRecord, snapshotPrediction } from './accuracy';
import { predictCycle } from './cycle';
import { addDays } from './date';

const regular = predictCycle(['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'])!; // 28 days every time

describe('snapshotPrediction', () => {
  it('keeps the next predicted start, its range and confidence', () => {
    expect(snapshotPrediction(regular, '2026-09-28')).toEqual({
      basedOn: '2026-09-28',
      predictedStart: '2026-10-26',
      earliest: '2026-10-25',
      latest: '2026-10-27',
      confidence: 'medium',
      actualStart: null,
      absErrorDays: null,
    });
  });

  it('keeps nothing when the predicted range has already passed, or there is no record', () => {
    expect(snapshotPrediction(regular, '2026-10-28')).toBeNull();
    expect(snapshotPrediction(null, '2026-10-01')).toBeNull();
  });
});

describe('evaluatePrediction', () => {
  const record = snapshotPrediction(regular, '2026-09-28')!;

  it('records how many days off the prediction was, either way', () => {
    expect(evaluatePrediction(record, '2026-10-28')).toMatchObject({ actualStart: '2026-10-28', absErrorDays: 2 });
    expect(evaluatePrediction(record, '2026-10-24')).toMatchObject({ absErrorDays: 2 });
    expect(evaluatePrediction(record, '2026-10-26')).toMatchObject({ absErrorDays: 0 });
  });

  it('does not judge when a period seems to have gone unrecorded in between', () => {
    expect(evaluatePrediction(record, '2026-11-23')).toBeNull();
    expect(evaluatePrediction(record, '2026-10-05')).toBeNull();
  });
});

describe('buildReport', () => {
  /** 予測の何日後に始まったか、の並び */
  const records = (errors: number[]): PredictionRecord[] =>
    errors.map((error, i) => {
      const basedOn = addDays('2026-01-05', i * 28);
      const predictedStart = addDays(basedOn, 28);
      return evaluatePrediction(
        { basedOn, predictedStart, earliest: predictedStart, latest: predictedStart, confidence: 'high', actualStart: null, absErrorDays: null },
        addDays(predictedStart, error),
      )!;
    });

  it('shows no average below 3 comparisons, but still the latest one', () => {
    expect(buildReport([])).toEqual({ n: 0, meanAbsErrorDays: null, within1DayRate: null, latest: null });
    expect(buildReport(records([1, -2]))).toEqual({
      n: 2,
      meanAbsErrorDays: null,
      within1DayRate: null,
      latest: { predictedStart: '2026-03-02', actualStart: '2026-02-28', errorDays: -2 },
    });
  });

  it('averages the last 6 comparisons and counts those within a day', () => {
    // 最初の 10 は直近6回に入らない
    const report = buildReport([...records([10, 0, 1, -1, 3, 0, -2])].reverse());
    expect(report).toMatchObject({ n: 6, within1DayRate: 4 / 6, latest: { errorDays: -2 } });
    expect(report.meanAbsErrorDays).toBeCloseTo(7 / 6);
  });

  it('ignores predictions still waiting for the period', () => {
    const waiting = snapshotPrediction(regular, '2026-09-28')!;
    expect(buildReport([...records([0, 0, 0]), waiting])).toMatchObject({ n: 3, meanAbsErrorDays: 0, within1DayRate: 1 });
  });
});
