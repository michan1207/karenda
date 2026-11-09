import { addDays, DateKey } from './date';
import type { Answer } from './learning';

/** 体調の記録で選べる症状（いくつでも、選ばなくてもよい）。画面の言葉は ui 側 */
export const SYMPTOMS = ['cramps', 'headache', 'backache', 'tired', 'sleepy', 'irritable', 'low', 'bloating'] as const;
export type Symptom = (typeof SYMPTOMS)[number];

/** その日の体調。answer が null は「答えない」（その日はもう聞かない） */
export type DailyCheck = { date: DateKey; answer: Answer | null; symptoms: Symptom[] };

/** アプリを開いた時に聞く日。昨日の分がまだ無ければ昨日、あれば聞かない（溜まった分をさかのぼって聞かない） */
export function dayToCheck(today: DateKey, checks: ReadonlyMap<DateKey, DailyCheck>): DateKey | null {
  const yesterday = addDays(today, -1);
  return checks.has(yesterday) ? null : yesterday;
}
