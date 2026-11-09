import { addDays } from './date';
import type { Answer } from './learning';
import { DEFAULT_PMS, estimatePmsDays, nextPmsEstimate, pmsZoneSettings, ReviewAnswer, withDailyChecks } from './pms';

const STARTS = ['2026-05-04', '2026-06-01', '2026-06-29', '2026-07-27', '2026-08-24', '2026-09-21'];

/** 生理開始日の何日前にどう答えたか */
const before = (start: string, days: Record<number, Answer>, phase: ReviewAnswer['phase'] = 'pms'): ReviewAnswer[] =>
  Object.entries(days).map(([n, answer]) => ({ date: addDays(start, -Number(n)), answer, phase }));

const cycles = (onsets: number[]) => onsets.flatMap((onset, i) => before(STARTS[i], { 2: 'hard', [onset]: 'hard', [onset + 2]: 'easy' }));

describe('estimatePmsDays', () => {
  it('keeps the default until 6 cycles show when it starts', () => {
    expect(estimatePmsDays(cycles([9, 9, 10, 8, 9]), STARTS)).toEqual({ daysBefore: null, observations: 5 });
  });

  it('reads how many days before the period "hard" answers begin', () => {
    expect(estimatePmsDays(cycles([9, 9, 10, 8, 9, 9]), STARTS)).toEqual({ daysBefore: 9, observations: 6 });
  });

  it('stops at the first answer that was not hard, ignores period days and anything over 14 days before', () => {
    const answers = STARTS.flatMap((start) => [
      ...before(start, { 2: 'hard', 4: 'normal', 8: 'hard', 15: 'hard' }),
      ...before(start, { 1: 'easy' }, 'period'),
    ]);
    // 2日前が読めた始まり → 3日前より短くはしない
    expect(estimatePmsDays(answers, STARTS).daysBefore).toBe(3);
  });

  it('does not estimate when cycles disagree by more than 2 days', () => {
    expect(estimatePmsDays(cycles([4, 12, 4, 12, 4, 12]), STARTS)).toEqual({ daysBefore: null, observations: 6 });
  });

  it('uses the starts in any order and counts a repeated start once', () => {
    const shuffled = [STARTS[3], STARTS[0], STARTS[5], STARTS[1], STARTS[1], STARTS[4], STARTS[2]];
    expect(estimatePmsDays(cycles([9, 9, 10, 8, 9, 9]), shuffled)).toEqual({ daysBefore: 9, observations: 6 });
  });

  it('leaves out cycles from more than the last 12 starts (about a year)', () => {
    // 6周期読めたあと、答えの無い周期が続いた
    const later = Array.from({ length: 7 }, (_, i) => addDays(STARTS[5], 28 * (i + 1)));
    const answers = cycles([9, 9, 10, 8, 9, 9]);
    expect(estimatePmsDays(answers, [...STARTS, ...later.slice(0, 6)])).toEqual({ daysBefore: 9, observations: 6 });
    expect(estimatePmsDays(answers, [...STARTS, ...later])).toEqual({ daysBefore: null, observations: 5 });
  });

  it('does not count cycles without a hard answer', () => {
    expect(estimatePmsDays(STARTS.flatMap((start) => before(start, { 3: 'easy' })), STARTS).observations).toBe(0);
  });
});

describe('nextPmsEstimate', () => {
  const learned = cycles([10, 10, 10, 10, 10, 10]);

  it('switches to the estimate from today, remembering the old length for bands already begun', () => {
    expect(nextPmsEstimate(DEFAULT_PMS, learned, STARTS, '2026-10-01')).toEqual({
      daysBefore: 10,
      source: 'auto',
      observations: 6,
      appliedFrom: '2026-10-01',
      before: 7,
    });
  });

  it('keeps the day it switched while the estimate stays the same', () => {
    const auto = nextPmsEstimate(DEFAULT_PMS, learned, STARTS, '2026-10-01');
    expect(nextPmsEstimate(auto, learned, STARTS, '2026-10-20')).toEqual(auto);
  });

  it('goes back to 7 days when the records no longer support the estimate', () => {
    const auto = nextPmsEstimate(DEFAULT_PMS, learned, STARTS, '2026-10-01');
    expect(nextPmsEstimate(auto, [], STARTS, '2026-10-20')).toEqual({
      daysBefore: 7,
      source: 'default',
      observations: 0,
      appliedFrom: '2026-10-20',
      before: 10,
    });
  });

  it('never changes a length the user set', () => {
    const manual = { ...DEFAULT_PMS, daysBefore: 5, source: 'manual' as const };
    expect(nextPmsEstimate(manual, learned, STARTS, '2026-10-01')).toEqual({ ...manual, observations: 6 });
  });
});

describe('pmsZoneSettings', () => {
  it('uses the estimated length and keeps the old one before the day it switched', () => {
    const auto = nextPmsEstimate(DEFAULT_PMS, cycles([10, 10, 10, 10, 10, 10]), STARTS, '2026-10-01');
    expect(pmsZoneSettings({ heavyDays: 4, pmsDays: 7 }, auto)).toEqual({
      heavyDays: 4,
      pmsDays: 10,
      pmsBefore: { until: '2026-10-01', days: 7 },
    });
    expect(pmsZoneSettings({ heavyDays: 4, pmsDays: 7 }, DEFAULT_PMS)).toEqual({ heavyDays: 4, pmsDays: 7 });
  });
});

describe('withDailyChecks', () => {
  const periods = { starts: STARTS, ends: new Map([[STARTS[0], addDays(STARTS[0], 5)]]), heavyDays: 3 };

  it('lets daily conditions alone teach when PMS starts', () => {
    const checks = STARTS.flatMap((start) => [
      ...[1, 2, 3, 4, 5, 6].map((n) => ({ date: addDays(start, -n), answer: 'hard' as const, symptoms: [] })),
      { date: addDays(start, -7), answer: 'easy' as const, symptoms: [] },
    ]);
    expect(estimatePmsDays(withDailyChecks([], checks, periods), STARTS)).toEqual({ daysBefore: 6, observations: 6 });
  });

  it('prefers the condition of the whole day over an event answer on that day, and leaves out skipped days', () => {
    const day = addDays(STARTS[1], -3);
    const answers: ReviewAnswer[] = [
      { date: day, answer: 'hard', phase: 'pms' },
      { date: addDays(day, -1), answer: 'hard', phase: 'pms' },
    ];
    const checks = [
      { date: day, answer: 'easy' as const, symptoms: [] },
      { date: addDays(day, -1), answer: null, symptoms: [] },
    ];
    expect(withDailyChecks(answers, checks, periods)).toEqual([
      { date: addDays(day, -1), answer: 'hard', phase: 'pms' },
      { date: day, answer: 'easy', phase: 'other' },
    ]);
  });

  it('marks days inside a recorded period, up to its end day or the fixed days', () => {
    const check = (date: string) => ({ date, answer: 'hard' as const, symptoms: [] });
    const phases = withDailyChecks([], [check(addDays(STARTS[0], 5)), check(addDays(STARTS[0], 6)), check(addDays(STARTS[1], 2)), check(addDays(STARTS[1], 3))], periods).map((a) => a.phase);
    expect(phases).toEqual(['period', 'other', 'period', 'other']);
  });
});
