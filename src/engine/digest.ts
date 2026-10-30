import type { ConflictAlert } from './conflicts';
import { ConflictStatus, statusOf } from './conflictState';

/** カレンダーのいちばん上に出す、その月の要注意のまとめ */
export type MonthlyDigest = {
  /** 'YYYY-MM' */
  month: string;
  /** その月の A/B（対応済みを除く）。点数の高い順、同じなら日付順 */
  conflicts: ConflictAlert[];
  topThree: ConflictAlert[];
  unreviewedCount: number;
  isEmpty: boolean;
};

export function monthlyDigest(alerts: ConflictAlert[], month: string, statuses: Map<string, ConflictStatus>): MonthlyDigest {
  const stateOf = (alert: ConflictAlert) => statusOf(statuses, alert.eventId, alert.date).state;
  const conflicts = alerts
    .filter((alert) => alert.date.startsWith(`${month}-`) && stateOf(alert) !== 'resolved')
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date));
  return {
    month,
    conflicts,
    topThree: conflicts.slice(0, 3),
    unreviewedCount: conflicts.filter((alert) => stateOf(alert) === 'unreviewed').length,
    isEmpty: conflicts.length === 0,
  };
}
