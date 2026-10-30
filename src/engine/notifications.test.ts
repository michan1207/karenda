import type { Action } from './actions';
import type { ConflictAlert, Impact } from './conflicts';
import { addDays } from './date';
import type { ReviewTarget } from './learning';
import { planNotifications, planReviewNotifications } from './notifications';

const alert = (eventId: string, date: string, grade: 'A' | 'B', title = eventId, impact: Impact = 'mitigable'): ConflictAlert => ({
  eventId,
  event: { id: eventId, title, start: date, end: date, allDay: false },
  title,
  date,
  grade,
  score: grade === 'A' ? 80 : 50,
  reasons: [grade === 'A' ? 'phaseMostSevere' : 'phasePms'],
  reasonText: `${title}の理由`,
  risk: 'high',
  impact,
  message: `${title}のメッセージ`,
});

/** 判断期限は lead 日前。対処のうち「鎮痛剤…」は通知に書かない */
const actionsWith =
  (lead = 3) =>
  (a: ConflictAlert): Action[] => [
    ...(a.impact === 'fixed' ? [] : [{ kind: 'suggestAltDate' as const, date: addDays(a.date, 9), score: 10 }]),
    { kind: 'deadline', resolveBy: addDays(a.date, -lead), text: '' },
    { kind: 'prepTask', text: '鎮痛剤や着替えを用意しておく', done: false },
    { kind: 'prepTask', text: '前後の予定をゆるめにする', done: false },
    { kind: 'prepTask', text: '前の日は早めに休む', done: false },
  ];
const plan = (alerts: ConflictAlert[], today = '2026-10-24', lead = 3, deferrals?: Map<string, string>) =>
  planNotifications(alerts, today, actionsWith(lead), deferrals);

describe('planNotifications', () => {
  it('notifies on the decision deadline and 7 and 3 days before an A alert, 3 days before a B one', () => {
    expect(plan([alert('trip', '2026-11-20', 'A'), alert('talk', '2026-11-10', 'B')]).map((p) => p.date)).toEqual([
      '2026-11-07',
      '2026-11-13',
      '2026-11-17',
    ]);
    // 期限が前日（会議など）なら、A は 7日前・3日前・前日の3回
    expect(plan([alert('meet', '2026-11-20', 'A')], '2026-10-24', 1).map((p) => p.date)).toEqual(['2026-11-13', '2026-11-17', '2026-11-19']);
  });

  it('writes the deadline and concrete steps, leaving out words about how the user feels', () => {
    expect(plan([alert('t', '2026-11-10', 'B', '企画プレゼン')])).toEqual([
      {
        id: 'guard-2026-11-07',
        date: '2026-11-07',
        title: '11/10「企画プレゼン」の前に',
        body: '今日中に準備を始めれば間に合います（11/19に変える／前後の予定をゆるめにする）',
        decide: { conflicts: [{ eventId: 't', date: '2026-11-10' }], fixed: false },
      },
    ]);
    const [early] = plan([alert('t', '2026-11-20', 'A', '出張', 'moveable')]);
    expect(early.body).toBe('11/17までに決めれば間に合います（11/29に変える／前後の予定をゆるめにする）');
    // 旅行のように期限が7日前なら、3日前の通知では期限が過ぎている
    const [, late] = plan([alert('t', '2026-11-20', 'A', '旅行', 'moveable')], '2026-10-24', 7);
    expect(late.body).toBe('決める目安の11/13は過ぎました。いまからでも：11/29に変える／前後の予定をゆるめにする');
  });

  it('never suggests another day for an event that cannot move, and offers preparation instead', () => {
    const [fixed] = plan([alert('exam', '2026-11-10', 'B', '試験', 'fixed')]);
    expect(fixed.body).toBe('今日中に準備を終えれば間に合います（前後の予定をゆるめにする／前の日は早めに休む）');
    expect(fixed.decide?.fixed).toBe(true);
  });

  it('never mentions the period or PMS, since it shows on the lock screen', () => {
    const plans = plan([alert('a', '2026-11-12', 'B', '会議'), alert('b', '2026-11-12', 'A', '出張'), alert('c', '2026-11-20', 'A')]);
    for (const p of plans) expect(p.title + p.body).not.toMatch(/生理|PMS|体調|鎮痛|メッセージ/);
  });

  it('skips reminders that would have been in the past', () => {
    // 5日後の予定：7日前は過ぎているので3日前だけ
    expect(plan([alert('trip', '2026-10-29', 'A')]).map((p) => p.date)).toEqual(['2026-10-26']);
    expect(plan([alert('trip', '2026-10-25', 'A')])).toEqual([]);
  });

  it('keeps a reminder due today', () => {
    expect(plan([alert('trip', '2026-10-27', 'B')]).map((p) => p.date)).toEqual(['2026-10-24']);
  });

  it('merges reminders on the same day into one, A first', () => {
    const plans = plan([alert('a', '2026-11-12', 'B', '会議'), alert('b', '2026-11-12', 'A', '出張')]);
    const sameDay = plans.find((p) => p.date === '2026-11-09')!;
    expect(sameDay.title).toBe('確かめたい予定が2件あります');
    expect(sameDay.body).toBe(
      [
        '11/12 出張：今日中に準備を始めれば間に合います（11/21に変える／前後の予定をゆるめにする）',
        '11/12 会議：今日中に準備を始めれば間に合います（11/21に変える／前後の予定をゆるめにする）',
      ].join('\n'),
    );
    expect(sameDay.decide?.conflicts.map((c) => c.eventId)).toEqual(['b', 'a']);
    expect(new Set(plans.map((p) => p.id)).size).toBe(plans.length);
  });

  it('reminds once the day after "今日は決めない", within 3 notifications for the event', () => {
    const deferred = new Map([['meet|2026-11-20', '2026-11-14']]);
    // 期限（前日）・決めない翌日・7日前が残り、3日前は出さない。日がたっても入れ替わらない
    expect(plan([alert('meet', '2026-11-20', 'A')], '2026-11-13', 1, deferred).map((p) => p.date)).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-19',
    ]);
    expect(plan([alert('meet', '2026-11-20', 'A')], '2026-11-14', 1, deferred).map((p) => p.date)).toEqual(['2026-11-14', '2026-11-19']);
    // 予定の当日以降に知らせ直しても遅いので出さない
    expect(plan([alert('b', '2026-11-12', 'B')], '2026-11-09', 3, new Map([['b|2026-11-12', '2026-11-12']])).map((p) => p.date)).toEqual([
      '2026-11-09',
    ]);
  });

  it('returns nothing without alerts', () => {
    expect(plan([])).toEqual([]);
  });
});

describe('planReviewNotifications', () => {
  const target = (eventId: string, date: string, risk: ReviewTarget['risk'] = 'medium'): ReviewTarget => ({
    eventId,
    title: eventId,
    date,
    phase: 'pms',
    risk,
  });

  it('asks once the next morning, one per morning with the heavy one first, and never about answered ones', () => {
    const plans = planReviewNotifications(
      [target('会議', '2026-10-24'), target('出張', '2026-10-24', 'high'), target('前日', '2026-10-22'), target('済み', '2026-10-26')],
      new Set(['済み|2026-10-26']),
      '2026-10-24',
    );
    expect(plans).toEqual([
      {
        id: 'review-2026-10-25',
        date: '2026-10-25',
        title: '昨日の「出張」、実際どうでした？',
        body: '長押しすると「きつかった・ふつう・平気だった」から選べます。',
        review: target('出張', '2026-10-24', 'high'),
      },
    ]);
  });

  it('keeps health words off the lock screen', () => {
    const [plan] = planReviewNotifications([target('会議', '2026-10-24')], new Set(), '2026-10-24');
    expect(`${plan.title}${plan.body}`).not.toMatch(/生理|PMS|体調/);
  });
});
