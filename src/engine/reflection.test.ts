import { monthlyReflection } from './reflection';

describe('monthlyReflection', () => {
  // 日時は ISO（UTC）で保存している。月は端末の日付で数える
  const local = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).toISOString();

  it('counts what was done this month, and how many were steps taken', () => {
    const reflection = monthlyReflection(
      [
        { resolution: 'shifted', at: local(2026, 10, 3) },
        { resolution: 'prepared', at: local(2026, 10, 10) },
        { resolution: 'prepared', at: local(2026, 10, 20) },
        { resolution: 'declined', at: local(2026, 10, 31) },
        { resolution: 'proceeded', at: local(2026, 10, 15) },
        { resolution: 'shifted', at: local(2026, 9, 30) },
        { resolution: 'shifted', at: local(2026, 11, 1) },
        // 前の版から引き継いだ記録は日時が無いので数えない
        { resolution: 'prepared', at: '' },
      ],
      '2026-10',
    );
    expect(reflection).toEqual({
      month: '2026-10',
      total: 5,
      actionCount: 4,
      byResolution: { shifted: 1, prepared: 2, declined: 1, proceeded: 1 },
    });
  });

  it('is all zero for a month with nothing done', () => {
    expect(monthlyReflection([], '2026-10')).toEqual({
      month: '2026-10',
      total: 0,
      actionCount: 0,
      byResolution: { shifted: 0, prepared: 0, declined: 0, proceeded: 0 },
    });
  });
});
