import { addDays, diffDays, fromDateKey, toDateKey } from './date';

describe('date keys', () => {
  it('round-trips a local date', () => {
    expect(toDateKey(fromDateKey('2026-10-24'))).toBe('2026-10-24');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => fromDateKey('2026-2-1')).toThrow();
    expect(() => fromDateKey('2026-02-30')).toThrow();
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('counts whole days between keys', () => {
    expect(diffDays('2026-10-01', '2026-10-29')).toBe(28);
    expect(diffDays('2026-10-29', '2026-10-01')).toBe(-28);
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1);
  });
});
