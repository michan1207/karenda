import { isInMonth, monthGrid, shiftMonth } from './month';

describe('monthGrid', () => {
  it('covers the month in Monday-to-Sunday weeks', () => {
    // 2026-10-01 is a Thursday, 2026-10-31 a Saturday
    const grid = monthGrid(2026, 10);
    expect(grid.from).toBe('2026-09-28');
    expect(grid.until).toBe('2026-11-01');
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    expect(grid.weeks[0][3]).toBe('2026-10-01');
  });

  it('starts on the 1st when the month begins on a Monday', () => {
    // 2027-02-01 is a Monday
    const grid = monthGrid(2027, 2);
    expect(grid.from).toBe('2027-02-01');
    expect(grid.until).toBe('2027-02-28');
    expect(grid.weeks).toHaveLength(4);
  });
});

it('moves between months across years', () => {
  expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
  expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
});

it('tells whether a day belongs to a month', () => {
  expect(isInMonth('2026-10-05', 2026, 10)).toBe(true);
  expect(isInMonth('2026-09-30', 2026, 10)).toBe(false);
});
