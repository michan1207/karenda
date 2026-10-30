import type { ConflictAlert } from './conflicts';
import { statusKey } from './conflictState';
import { addDays, DateKey, fromDateKey } from './date';
import type { ReviewTarget } from './learning';

export type NotificationPlan = {
  /** 同じ日の通知は1件にまとめるので、日付ごとに一意 */
  id: string;
  /** 通知を出す日 */
  date: DateKey;
  title: string;
  body: string;
  /** 「どうだった？」の通知。ボタンで答えると、この予定の答えとして保存する */
  review?: ReviewTarget;
};

/** 直前に言われても動かせないので、前もって知らせる。A（要注意）は2回、B（注意）は1回 */
const LEAD_DAYS = { A: [7, 3], B: [3] } as const;

/** ロック画面で人に見られても分からないよう、生理・PMS・体調の言葉は通知に入れない */
const NUDGE = 'アプリを開いて、準備の予定を確かめてみませんか。';

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 警告から通知の予定を作る。今日より前に出すはずだった分は作らない。
 * 同じ日に複数あるときは1件にまとめ、要注意（A）を先に書く。
 */
export function planNotifications(alerts: ConflictAlert[], today: DateKey): NotificationPlan[] {
  const byDay = new Map<DateKey, ConflictAlert[]>();
  for (const alert of alerts) {
    for (const lead of LEAD_DAYS[alert.grade]) {
      const day = addDays(alert.date, -lead);
      if (day < today) continue;
      byDay.set(day, [...(byDay.get(day) ?? []), alert]);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayAlerts]) => {
      const sorted = [...dayAlerts].sort((a, b) =>
        a.grade === b.grade ? a.date.localeCompare(b.date) : a.grade === 'A' ? -1 : 1,
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

/**
 * 予定の次の朝に「どうだった？」と聞く通知。朝は1件だけにして、重い予定を先に聞く。
 * 答えた予定は聞かない（ほかの予定はホームで聞く）
 */
export function planReviewNotifications(targets: ReviewTarget[], reviewed: Set<string>, today: DateKey): NotificationPlan[] {
  const byDay = new Map<DateKey, ReviewTarget>();
  for (const target of targets) {
    const day = addDays(target.date, 1);
    const kept = byDay.get(day);
    if (day < today || reviewed.has(statusKey(target.eventId, target.date))) continue;
    if (!kept || (kept.risk === 'medium' && target.risk === 'high')) byDay.set(day, target);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, target]) => ({
      id: `review-${date}`,
      date,
      title: `昨日の「${target.title}」、実際どうでした？`,
      body: '長押しすると「きつかった・ふつう・平気だった」から選べます。',
      review: target,
    }));
}
