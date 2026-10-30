import { predictCycle, predictedPeriod } from './cycle';
import { diffDays } from './date';

describe('predictCycle', () => {
  it('returns null when there are no records', () => {
    expect(predictCycle([])).toBeNull();
  });

  it('assumes 28 days give or take 2 until three cycles are recorded', () => {
    const p = predictCycle(['2026-09-30'])!;
    expect(p).toEqual({
      lastStart: '2026-09-30',
      averageLength: 28,
      spread: 2,
      cyclesUsed: 0,
      excluded: [],
      provisional: true,
      confidence: 'low',
    });
    expect(predictedPeriod(p, 1)).toEqual({ expected: '2026-10-28', earliest: '2026-10-26', latest: '2026-10-30' });
    expect(predictCycle(['2026-06-01', '2026-06-29', '2026-07-29'])).toMatchObject({ cyclesUsed: 2, provisional: true, confidence: 'low' });
  });

  it('centres on the average and widens by the standard deviation', () => {
    // 28, 30, 26 days → sd 1.6
    expect(predictCycle(['2026-06-01', '2026-06-29', '2026-07-29', '2026-08-24'])).toEqual({
      lastStart: '2026-08-24',
      averageLength: 28,
      spread: 2,
      cyclesUsed: 3,
      excluded: [],
      provisional: false,
      confidence: 'medium',
    });
  });

  it('is confident about six regular cycles, keeping at least a day either side', () => {
    const p = predictCycle(['2026-01-05', '2026-02-02', '2026-03-02', '2026-03-30', '2026-04-27', '2026-05-25', '2026-06-22'])!;
    expect(p).toMatchObject({ averageLength: 28, spread: 1, cyclesUsed: 6, confidence: 'high' });
    const { earliest, latest } = predictedPeriod(p, 1);
    expect(diffDays(earliest, latest)).toBe(2);
  });

  it('is unsure when cycles vary a lot', () => {
    // 22, 35, 24, 36 days
    expect(predictCycle(['2026-01-01', '2026-01-23', '2026-02-27', '2026-03-23', '2026-04-28'])).toMatchObject({
      averageLength: 29,
      spread: 6,
      confidence: 'low',
    });
  });

  it('accepts unsorted and duplicate records', () => {
    const p = predictCycle(['2026-07-29', '2026-06-01', '2026-06-29', '2026-06-29']);
    expect(p).toMatchObject({ lastStart: '2026-07-29', cyclesUsed: 2 });
  });

  it('uses only the six most recent cycles', () => {
    // 40 days, then 28 days six times
    const p = predictCycle(['2025-12-27', '2026-02-05', '2026-03-05', '2026-04-02', '2026-04-30', '2026-05-28', '2026-06-25', '2026-07-23'])!;
    expect(p).toMatchObject({ averageLength: 28, spread: 1, cyclesUsed: 6, excluded: [] });
  });

  it('lists the gaps it leaves out, and why', () => {
    // 28, 14, 29, 46, 27 days
    const p = predictCycle(['2026-01-01', '2026-01-29', '2026-02-12', '2026-03-13', '2026-04-28', '2026-05-25'])!;
    expect(p.excluded).toEqual([
      { from: '2026-01-29', to: '2026-02-12', days: 14, reason: 'tooShort' },
      { from: '2026-03-13', to: '2026-04-28', days: 46, reason: 'tooLong' },
    ]);
    expect(p).toMatchObject({ averageLength: 28, cyclesUsed: 3 });
  });
});

describe('predictedPeriod', () => {
  it('keeps the same width for later cycles', () => {
    const p = predictCycle(['2026-06-01', '2026-06-29', '2026-07-29', '2026-08-24'])!;
    expect(predictedPeriod(p, 2)).toEqual({ expected: '2026-10-19', earliest: '2026-10-17', latest: '2026-10-21' });
  });
});
