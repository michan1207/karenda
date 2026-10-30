import { addDays } from './date';
import type { Answer } from './learning';
import { DEFAULT_PMS, estimatePmsDays, nextPmsEstimate, pmsZoneSettings, ReviewAnswer } from './pms';

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
