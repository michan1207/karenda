import type { Action } from './actions';
import type { ConflictAlert } from './conflicts';
import { statusKey } from './conflictState';
import { addDays, DateKey, fromDateKey } from './date';
import type { ReviewTarget } from './learning';

/** 重なる予定の通知のボタン。確認した／代替日を見る／今日は決めない */
export type Decision = 'acknowledge' | 'alternatives' | 'defer';

export type NotificationPlan = {
  /** 同じ日の通知は1件にまとめるので、日付ごとに一意 */
  id: string;
  /** 通知を出す日 */
  date: DateKey;
  title: string;
  body: string;
  /** 「どうだった？」の通知。ボタンで答えると、この予定の答えとして保存する */
  review?: ReviewTarget;
  /** 重なる予定の通知。ボタン（確認した／代替日を見る／今日は決めない）はここの予定すべてに効く。fixed は全部動かせない予定（代替日のボタンを付けない） */
  decide?: { conflicts: { eventId: string; date: DateKey }[]; fixed: boolean };
};

/** 直前に言われても動かせないので、前もって知らせる。A（要注意）は7日前と3日前、B（注意）は3日前 */
const LEAD_DAYS = { A: [7, 3], B: [3] } as const;
/** 1つの予定の通知は、判断期限・「今日は決めない」の翌日・7日前・3日前の順に、違う日を3つまで */
const MAX_PER_ALERT = 3;
/** 具体策は2つまで */
const MAX_STEPS = 2;

/**
 * ロック画面で人に見られても分からないよう、生理・PMS・体調につながる言葉は通知に入れない。
 * 日付入りの準備（「準備を…までに終わらせる」）も、判断期限と食い違って見えるので入れない
 */
const NOT_IN_NOTIFICATIONS = /生理|PMS|体調|鎮痛|きつ|痛|までに/;

const DECIDE_WORDS = { moveable: '決めれば', mitigable: '準備を始めれば', fixed: '準備を終えれば' } as const;

/** 判断期限と具体策の1文。動かせない予定には別の日を勧めない。通知が届く日にもう過ぎている別の日も勧めない */
function decisionText(alert: ConflictAlert, day: DateKey, actions: Action[]): string {
  const deadline = actions.find((action) => action.kind === 'deadline')?.resolveBy ?? addDays(alert.date, -1);
  const [alt] = actions.flatMap((action) => (action.kind === 'suggestAltDate' && action.date > day ? [action.date] : []));
  const steps = [
    ...(alt && alert.impact !== 'fixed' ? [`${monthDay(alt)}に変える`] : alert.impact === 'moveable' ? ['別の日に変える'] : []),
    ...actions.flatMap((action) => (action.kind === 'prepTask' && !NOT_IN_NOTIFICATIONS.test(action.text) ? [action.text] : [])),
  ].slice(0, MAX_STEPS);
  if (steps.length === 0) steps.push('前後の予定をゆるめにする');
  if (day > deadline) return `決める目安の${monthDay(deadline)}は過ぎました。いまからでも：${steps.join('／')}`;
  const when = day === deadline ? '今日中に' : `${monthDay(deadline)}までに`;
  return `${when}${DECIDE_WORDS[alert.impact]}間に合います（${steps.join('／')}）`;
}

/** 優先の高い順に違う日を3つまで。過ぎた日も数えるので、日がたっても選ぶ日は入れ替わらない */
function alertDays(alert: ConflictAlert, actions: Action[], remindOn: DateKey | undefined): DateKey[] {
  const deadline = actions.find((action) => action.kind === 'deadline')?.resolveBy;
  const candidates = [
    deadline,
    remindOn && remindOn < alert.date ? remindOn : undefined,
    ...LEAD_DAYS[alert.grade].map((lead) => addDays(alert.date, -lead)),
  ];
  const days: DateKey[] = [];
  for (const day of candidates) if (day && !days.includes(day) && days.length < MAX_PER_ALERT) days.push(day);
  return days;
}

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * 警告から通知の予定を作る。本文は判断期限と具体策。今日より前に出すはずだった分は作らない。
 * 同じ日に複数あるときは1件にまとめ、要注意（A）を先に書く。
 * deferrals は「今日は決めない」を押した予定（`statusKey`）と、もう一度知らせる日
 */
export function planNotifications(
  alerts: ConflictAlert[],
  today: DateKey,
  actionsOf: (alert: ConflictAlert) => Action[],
  deferrals: ReadonlyMap<string, DateKey> = new Map(),
): NotificationPlan[] {
  const byDay = new Map<DateKey, ConflictAlert[]>();
  const actions = new Map(alerts.map((alert) => [alert, actionsOf(alert)]));
  for (const alert of alerts) {
    for (const day of alertDays(alert, actions.get(alert)!, deferrals.get(statusKey(alert.eventId, alert.date)))) {
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
      const decide = {
        conflicts: sorted.map(({ eventId, date: day }) => ({ eventId, date: day })),
        fixed: sorted.every((alert) => alert.impact === 'fixed'),
      };
      if (sorted.length === 1) {
        return {
          id: `guard-${date}`,
          date,
          title: `${monthDay(first.date)}「${first.title}」の前に`,
          body: decisionText(first, date, actions.get(first)!),
          decide,
        };
      }
      return {
        id: `guard-${date}`,
        date,
        title: `確かめたい予定が${sorted.length}件あります`,
        body: sorted.map((alert) => `${monthDay(alert.date)} ${alert.title}：${decisionText(alert, date, actions.get(alert)!)}`).join('\n'),
        decide,
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
