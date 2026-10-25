import type { ConflictAlert } from './conflicts';
import { addDays, DateKey, fromDateKey } from './date';

export type NotificationPlan = {
  /** 同じ日の通知は1件にまとめるので、日付ごとに一意 */
  id: string;
  /** 通知を出す日 */
  date: DateKey;
  title: string;
  body: string;
};

/** 直前に言われても動かせないので、前もって知らせる */
const LEAD_DAYS = { red: [7, 3], yellow: [3] } as const;

/** ロック画面で人に見られても分からないよう、生理・PMS・体調の言葉は通知に入れない */
const NUDGE = 'アプリを開いて、準備の予定を確かめてみませんか。';

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 警告から通知の予定を作る。今日より前に出すはずだった分は作らない。
 * 同じ日に複数あるときは1件にまとめ、しっかり注意を先に書く。
 */
export function planNotifications(alerts: ConflictAlert[], today: DateKey): NotificationPlan[] {
  const byDay = new Map<DateKey, ConflictAlert[]>();
  for (const alert of alerts) {
    for (const lead of LEAD_DAYS[alert.level]) {
      const day = addDays(alert.date, -lead);
      if (day < today) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), alert]);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayAlerts]) => {
      const sorted = [...dayAlerts].sort((a, b) =>
        a.level === b.level ? a.date.localeCompare(b.date) : a.level === 'red' ? -1 : 1,
      );
      const [first] = sorted;
      if (sorted.length === 1) {
        return {
          id: `guard-${date}`,
          date,
          title: `${monthDay(first.date)}「${first.title}」の前に`,
          body: NUDGE,
        };
      }
      return {
        id: `guard-${date}`,
        date,
        title: `確かめたい予定が${sorted.length}件あります`,
        body: sorted.map((alert) => `${monthDay(alert.date)} ${alert.title}`).join('、'),
      };
    });
}
