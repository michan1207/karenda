import { addDays, DateKey, fromDateKey, toDateKey } from './date';

export type MonthGrid = {
  year: number;
  /** 1〜12 */
  month: number;
  /** 月曜はじまりの週ごとの日付。前後の月の日も含めて7日ずつ埋める */
  weeks: DateKey[][];
  from: DateKey;
  until: DateKey;
};

export function monthGrid(year: number, month: number): MonthGrid {
  const first = toDateKey(new Date(year, month - 1, 1));
  const last = toDateKey(new Date(year, month, 0));
  const from = addDays(first, -((fromDateKey(first).getDay() + 6) % 7));
  const until = addDays(last, 6 - ((fromDateKey(last).getDay() + 6) % 7));

  const weeks: DateKey[][] = [];
  for (let day = from; day <= until; day = addDays(day, 1)) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) weeks.push([]);
    weeks[weeks.length - 1].push(day);
  }
  return { year, month, weeks, from, until };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(year, month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

export function isInMonth(day: DateKey, year: number, month: number): boolean {
  return day.startsWith(`${year}-${String(month).padStart(2, '0')}-`);
}

/** 期間を、月曜はじまり・日曜おわりの週単位に広げる（週ごとの予定数を正しく数えるため） */
export function expandToWeeks(from: DateKey, until: DateKey): { from: DateKey; until: DateKey } {
  return {
    from: addDays(from, -((fromDateKey(from).getDay() + 6) % 7)),
    until: addDays(until, 6 - ((fromDateKey(until).getDay() + 6) % 7)),
  };
}
