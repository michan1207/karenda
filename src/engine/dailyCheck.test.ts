import { dayToCheck } from './dailyCheck';

describe('dayToCheck', () => {
  it('asks about yesterday once, and not about older days', () => {
    expect(dayToCheck('2026-11-08', new Map())).toBe('2026-11-07');
    expect(dayToCheck('2026-11-08', new Map([['2026-11-07', { date: '2026-11-07', answer: null, symptoms: [] }]]))).toBeNull();
    expect(dayToCheck('2026-11-08', new Map([['2026-11-06', { date: '2026-11-06', answer: 'hard', symptoms: [] }]]))).toBe('2026-11-07');
  });
});
