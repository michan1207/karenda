import { predictCycle } from './cycle';
import { buildZones, periodEndChoice, periodPhase, phaseOn } from './zones';

const regular = predictCycle(['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'])!; // 28 days every time

describe('buildZones', () => {
  it('marks the recorded period as heavy for its first three days', () => {
    const zones = buildZones(regular, { from: '2026-09-28', until: '2026-10-02' });
    expect(zones.get('2026-09-28')).toMatchObject({ zone: 'heavy', periodDay: 1, predicted: false });
    expect(zones.get('2026-09-30')).toMatchObject({ zone: 'heavy', periodDay: 3 });
    expect(zones.get('2026-10-01')).toBeUndefined();
  });

  it('marks every recorded period as heavy, not only the latest', () => {
    const zones = buildZones(regular, { from: '2026-07-01', until: '2026-09-30' }, undefined, [
      '2026-07-06',
      '2026-08-03',
      '2026-08-31',
      '2026-09-28',
    ]);
    expect(zones.get('2026-07-06')).toMatchObject({ zone: 'heavy', periodDay: 1, predicted: false });
    expect(zones.get('2026-08-05')).toMatchObject({ zone: 'heavy', periodDay: 3, predicted: false });
    expect(zones.get('2026-09-01')).toMatchObject({ zone: 'heavy', periodDay: 2, predicted: false });
    expect(zones.get('2026-08-06')).toBeUndefined();
  });

  it('uses the recorded end day instead of the fixed days, and the fixed days where no end is recorded', () => {
    const starts = ['2026-08-31', '2026-09-28'];
    const zones = buildZones(regular, { from: '2026-08-25', until: '2026-10-05' }, undefined, starts, undefined, new Map([['2026-08-31', '2026-09-05']]));
    expect(zones.get('2026-09-05')).toMatchObject({ zone: 'heavy', periodDay: 6, predicted: false });
    expect(zones.get('2026-09-06')).toBeUndefined();
    expect(zones.get('2026-09-30')).toMatchObject({ zone: 'heavy', periodDay: 3 });
    expect(zones.get('2026-10-01')).toBeUndefined();
    // a shorter period than the fixed days ends early
    const short = buildZones(regular, { from: '2026-09-25', until: '2026-10-05' }, undefined, starts, undefined, new Map([['2026-09-28', '2026-09-29']]));
    expect(short.get('2026-09-29')).toMatchObject({ zone: 'heavy', periodDay: 2 });
    expect(short.get('2026-09-30')).toBeUndefined();
    expect(phaseOn('2026-09-30', short)).toEqual({ kind: 'after', predicted: false });
  });

  it('predicts the next period and the PMS week before it', () => {
    const zones = buildZones(regular, { from: '2026-10-01', until: '2026-11-30' });
    // next start 10-26, give or take a day
    expect(zones.get('2026-10-17')).toBeUndefined();
    expect(zones.get('2026-10-18')).toMatchObject({ zone: 'pms', windowStart: '2026-10-18', predicted: true });
    expect(zones.get('2026-10-24')).toMatchObject({ zone: 'pms' });
    expect(zones.get('2026-10-25')).toMatchObject({ zone: 'heavy', periodDay: undefined, predicted: true });
    expect(zones.get('2026-10-26')).toMatchObject({ zone: 'heavy', periodDay: 1, predicted: true });
    expect(zones.get('2026-10-28')).toMatchObject({ zone: 'heavy', periodDay: 3 });
    expect(zones.get('2026-10-29')).toMatchObject({ zone: 'heavy', periodDay: undefined });
    expect(zones.get('2026-10-30')).toBeUndefined();
    // the cycle after that, 11-23
    expect(zones.get('2026-11-23')).toMatchObject({ zone: 'heavy', periodDay: 1 });
  });

  it('keeps 14 days after the predicted window as "maybe" while the period is late and not recorded', () => {
    const range = { from: '2026-10-01', until: '2026-11-30' };
    // 予測の幅（10-25〜10-27）の中なら、まだ遅れではない
    expect(buildZones(regular, range, undefined, undefined, '2026-10-27').get('2026-10-30')).toBeUndefined();
    const late = buildZones(regular, range, undefined, undefined, '2026-10-28');
    // 予測どおりの日はそのまま
    expect(late.get('2026-10-28')).toMatchObject({ zone: 'heavy', periodDay: 3 });
    expect(late.get('2026-10-30')).toEqual({ zone: 'heavy', predicted: true });
    expect(late.get('2026-11-10')).toEqual({ zone: 'heavy', predicted: true });
    expect(late.get('2026-11-11')).toBeUndefined();
    // その次の予測は今までどおり
    expect(late.get('2026-11-23')).toMatchObject({ zone: 'heavy', periodDay: 1 });
  });

  it('widens both zones by the spread of past cycles', () => {
    const irregular = predictCycle(['2026-07-01', '2026-07-26', '2026-08-28', '2026-09-26'])!; // 25, 33, 29
    // average 29, sd 3 → expected 10-25, earliest 10-22, latest 10-28
    const zones = buildZones(irregular, { from: '2026-10-01', until: '2026-11-05' });
    expect(zones.get('2026-10-15')).toMatchObject({ zone: 'pms', windowStart: '2026-10-15' });
    expect(zones.get('2026-10-14')).toBeUndefined();
    expect(zones.get('2026-10-22')).toMatchObject({ zone: 'heavy', periodDay: undefined });
    expect(zones.get('2026-10-26')).toMatchObject({ zone: 'heavy', periodDay: 2 });
    expect(zones.get('2026-10-30')).toMatchObject({ zone: 'heavy' });
    expect(zones.get('2026-10-31')).toBeUndefined();
  });

  it('respects custom heavy and PMS lengths', () => {
    const zones = buildZones(regular, { from: '2026-10-01', until: '2026-11-05' }, { heavyDays: 2, pmsDays: 3 });
    expect(zones.get('2026-10-21')).toBeUndefined();
    expect(zones.get('2026-10-22')).toMatchObject({ zone: 'pms' });
    expect(zones.get('2026-10-28')).toMatchObject({ zone: 'heavy' });
    expect(zones.get('2026-10-29')).toBeUndefined();
  });

  it('keeps the old PMS length for a band that would reach back before the day it changed', () => {
    // 10-17 から10日前に。10日前だと次の帯は 10-15 から始まり過去を塗るので、7日前（10-18 から）のまま
    const zones = buildZones(regular, { from: '2026-10-01', until: '2026-11-30' }, { heavyDays: 3, pmsDays: 10, pmsBefore: { until: '2026-10-17', days: 7 } });
    expect(zones.get('2026-10-17')).toBeUndefined();
    expect(zones.get('2026-10-18')).toMatchObject({ zone: 'pms', windowStart: '2026-10-18' });
    // その次（11-22 ごろ）の帯からは10日前
    expect(zones.get('2026-11-11')).toBeUndefined();
    expect(zones.get('2026-11-12')).toMatchObject({ zone: 'pms', windowStart: '2026-11-12' });
  });

  it('rejects settings outside a sensible range', () => {
    expect(() => buildZones(regular, { from: '2026-10-01', until: '2026-10-31' }, { heavyDays: 0, pmsDays: 7 })).toThrow();
    expect(() => buildZones(regular, { from: '2026-10-01', until: '2026-10-31' }, { heavyDays: 3, pmsDays: 20 })).toThrow();
  });
});

describe('phaseOn', () => {
  it('names each day once, for every part of the app to read', () => {
    const zones = buildZones(regular, { from: '2026-10-01', until: '2026-11-30' });
    const kinds = ['2026-10-17', '2026-10-18', '2026-10-25', '2026-10-26', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03'].map(
      (day) => phaseOn(day, zones).kind,
    );
    expect(kinds).toEqual(['other', 'pms', 'edge', 'mostSevere', 'edge', 'after', 'after', 'other']);
    expect(phaseOn('2026-10-27', zones)).toEqual({ kind: 'mostSevere', periodDay: 2, predicted: true });
    expect(phaseOn('2026-10-20', zones)).toEqual({ kind: 'pms', windowStart: '2026-10-18', predicted: true });
  });
});

describe('periodPhase', () => {
  const zones = buildZones(regular, { from: '2026-09-28', until: '2026-10-31' });

  it('names the days before, during and right after a period', () => {
    expect(periodPhase('2026-09-29', zones)).toBe('during');
    expect(periodPhase('2026-10-01', zones)).toBe('after');
    expect(periodPhase('2026-10-04', zones)).toBe('after');
    expect(periodPhase('2026-10-05', zones)).toBeUndefined();
    expect(periodPhase('2026-10-19', zones)).toBe('before');
    expect(periodPhase('2026-10-26', zones)).toBe('during');
  });
});

describe('periodEndChoice', () => {
  const starts = ['2026-08-31', '2026-09-28'];
  it('offers to record the end on a day after the latest start, up to day 45, up to today', () => {
    expect(periodEndChoice('2026-10-02', starts, new Map(), '2026-10-05')).toEqual({ start: '2026-09-28', recorded: false });
    expect(periodEndChoice('2026-09-28', starts, new Map(), '2026-10-05')).toBeNull();
    expect(periodEndChoice('2026-10-12', starts, new Map(), '2026-10-20')).toEqual({ start: '2026-09-28', recorded: false });
    expect(periodEndChoice('2026-11-11', starts, new Map(), '2026-12-01')).toEqual({ start: '2026-09-28', recorded: false });
    expect(periodEndChoice('2026-11-12', starts, new Map(), '2026-12-01')).toBeNull();
    expect(periodEndChoice('2026-10-06', starts, new Map(), '2026-10-05')).toBeNull();
  });
  it('belongs to an earlier start too, but not across a later start', () => {
    expect(periodEndChoice('2026-09-03', starts, new Map(), '2026-10-05')).toEqual({ start: '2026-08-31', recorded: false });
    expect(periodEndChoice('2026-09-28', ['2026-09-20', '2026-09-28'], new Map(), '2026-10-05')).toBeNull();
  });
  it('says when the day is the recorded end', () => {
    const ends = new Map([['2026-09-28', '2026-10-02']]);
    expect(periodEndChoice('2026-10-02', starts, ends, '2026-10-05')).toEqual({ start: '2026-09-28', recorded: true });
    expect(periodEndChoice('2026-10-01', starts, ends, '2026-10-05')).toEqual({ start: '2026-09-28', recorded: false });
  });
});
