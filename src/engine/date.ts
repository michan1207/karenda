// 日付は時刻やタイムゾーンに左右されないよう、ローカル日付の "YYYY-MM-DD" で扱う
export type DateKey = string;

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateKey(date: Date): DateKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromDateKey(key: DateKey): Date {
  const match = DATE_KEY.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  if (toDateKey(date) !== key) throw new Error(`Invalid date key: ${key}`);
  return date;
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function diffDays(from: DateKey, to: DateKey): number {
  const a = fromDateKey(from);
  const b = fromDateKey(to);
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000);
}
