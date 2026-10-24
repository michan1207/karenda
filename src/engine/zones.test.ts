import { predictCycle } from './cycle';
import { buildZones } from './zones';

const regular = predictCycle(['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'])!; // 28 days every time

describe('buildZones', () => {
  it('marks the recorded period as heavy for its first three days', () => {
    const zones = buildZones(regular, { from: '2026-09-28', until: '2026-10-02' });
    expect(zones.get('2026-09-28')).toMatchObject({ zone: 'heavy', periodDay: 1, predicted: false });
    expect(zones.get('2026-09-30')).toMatchObject({ zone: 'heavy', periodDay: 3 });
    expect(zones.get('2026-10-01')).toBeUndefined();
  });

  it('predicts the next period and the PMS week before it', () => {
    const zones = buildZones(regular, { from: '2026-10-01', until: '2026-11-30' });
    // next start 10-26
    expect(zones.get('2026-10-18')).toBeUndefined();
    expect(zones.get('2026-10-19')).toMatchObject({ zone: 'pms', windowStart: '2026-10-19', predicted: true });
    expect(zones.get('2026-10-25')).toMatchObject({ zone: 'pms' });
    expect(zones.get('2026-10-26')).toMatchObject({ zone: 'heavy', periodDay: 1, predicted: true });
    expect(zones.get('2026-10-28')).toMatchObject({ zone: 'heavy', periodDay: 3 });
    expect(zones.get('2026-10-29')).toBeUndefined();
    // the cycle after that, 11-23
    expect(zones.get('2026-11-23')).toMatchObject({ zone: 'heavy', periodDay: 1 });
  });

  it('widens both zones by the spread of past cycles', () => {
    const irregular = predictCycle(['2026-07-01', '2026-07-26', '2026-08-28', '2026-09-26'])!; // 25, 33, 29
    // average 29 → expected 10-25, earliest 10-21, latest 10-29
    const zones = buildZones(irregular, { from: '2026-10-01', until: '2026-11-05' });
    expect(zones.get('2026-10-14')).toMatchObject({ zone: 'pms', windowStart: '2026-10-14' });
    expect(zones.get('2026-10-13')).toBeUndefined();
    expect(zones.get('2026-10-21')).toMatchObject({ zone: 'heavy', periodDay: undefined });
    expect(zones.get('2026-10-26')).toMatchObject({ zone: 'heavy', periodDay: 2 });
    expect(zones.get('2026-10-31')).toMatchObject({ zone: 'heavy' });
    expect(zones.get('2026-11-01')).toBeUndefined();
  });

  it('respects custom heavy and PMS lengths', () => {
    const zones = buildZones(regular, { from: '2026-10-01', until: '2026-11-05' }, { heavyDays: 2, pmsDays: 3 });
    expect(zones.get('2026-10-22')).toBeUndefined();
    expect(zones.get('2026-10-23')).toMatchObject({ zone: 'pms' });
    expect(zones.get('2026-10-27')).toMatchObject({ zone: 'heavy' });
    expect(zones.get('2026-10-28')).toBeUndefined();
  });

  it('rejects settings outside a sensible range', () => {
    expect(() => buildZones(regular, { from: '2026-10-01', until: '2026-10-31' }, { heavyDays: 0, pmsDays: 7 })).toThrow();
    expect(() => buildZones(regular, { from: '2026-10-01', until: '2026-10-31' }, { heavyDays: 3, pmsDays: 20 })).toThrow();
  });
});
