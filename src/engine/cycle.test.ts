import { predictCycle } from './cycle';

describe('predictCycle', () => {
  it('returns null when there are no records', () => {
    expect(predictCycle([])).toBeNull();
  });

  it('assumes a provisional 28-day cycle with fewer than two recorded cycles', () => {
    const p = predictCycle(['2026-09-01', '2026-09-30']);
    expect(p).toMatchObject({
      lastStart: '2026-09-30',
      averageLength: 28,
      provisional: true,
    });
    expect(p!.minLength).toBeLessThan(28);
    expect(p!.maxLength).toBeGreaterThan(28);
  });

  it('averages recorded cycle lengths and keeps the shortest and longest', () => {
    // 28, 30, 26 days
    const p = predictCycle(['2026-06-01', '2026-06-29', '2026-07-29', '2026-08-24']);
    expect(p).toEqual({
      lastStart: '2026-08-24',
      averageLength: 28,
      minLength: 26,
      maxLength: 30,
      cyclesUsed: 3,
      provisional: false,
    });
  });

  it('accepts unsorted and duplicate records', () => {
    const p = predictCycle(['2026-07-29', '2026-06-01', '2026-06-29', '2026-06-29']);
    expect(p).toMatchObject({ lastStart: '2026-07-29', minLength: 28, maxLength: 30, cyclesUsed: 2 });
  });

  it('uses only the six most recent cycles', () => {
    const starts = ['2026-01-01', '2026-03-02']; // a 60-day gap that should fall out
    for (let i = 1; i <= 6; i++) starts.push(`2026-0${3 + i}-0${i}`);
    const p = predictCycle(starts)!;
    expect(p.cyclesUsed).toBe(6);
    expect(p.maxLength).toBeLessThan(60);
  });

  it('ignores gaps that look like a missed record', () => {
    // 28, 29, then 58 (a month was not recorded)
    const p = predictCycle(['2026-05-01', '2026-05-29', '2026-06-27', '2026-08-24'])!;
    expect(p).toMatchObject({ minLength: 28, maxLength: 29, cyclesUsed: 2 });
  });
});
