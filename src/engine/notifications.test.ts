import type { ConflictAlert } from './conflicts';
import type { ReviewTarget } from './learning';
import { planNotifications, planReviewNotifications } from './notifications';

const alert = (eventId: string, date: string, grade: 'A' | 'B', title = eventId): ConflictAlert => ({
  eventId,
  event: { id: eventId, title, start: date, end: date, allDay: false },
  title,
  date,
  grade,
  score: grade === 'A' ? 80 : 50,
  reasons: [grade === 'A' ? 'phaseMostSevere' : 'phasePms'],
  reasonText: `${title}の理由`,
  risk: 'high',
  impact: 'mitigable',
  message: `${title}のメッセージ`,
});

describe('planNotifications', () => {
  it('notifies 7 and 3 days before an A alert and 3 days before a B one', () => {
    const plans = planNotifications([alert('trip', '2026-11-20', 'A'), alert('talk', '2026-11-10', 'B')], '2026-10-24');
    expect(plans.map((plan) => plan.date)).toEqual(['2026-11-07', '2026-11-13', '2026-11-17']);
  });

  it('writes the event date and title, and a neutral nudge as the body', () => {
    const [plan] = planNotifications([alert('t', '2026-11-10', 'B', '企画プレゼン')], '2026-10-24');
    expect(plan).toEqual({
      id: 'guard-2026-11-07',
      date: '2026-11-07',
      title: '11/10「企画プレゼン」の前に',
      body: 'アプリを開いて、準備の予定を確かめてみませんか。',
    });
  });

  it('never mentions the period or PMS, since it shows on the lock screen', () => {
    const plans = planNotifications(
      [alert('a', '2026-11-12', 'B', '会議'), alert('b', '2026-11-12', 'A', '出張'), alert('c', '2026-11-20', 'A')],
      '2026-10-24',
    );
    for (const plan of plans) expect(plan.title + plan.body).not.toMatch(/生理|PMS|体調|メッセージ/);
  });

  it('skips reminders that would have been in the past', () => {
    // 5日後の予定：7日前は過ぎているので3日前だけ
    const plans = planNotifications([alert('trip', '2026-10-29', 'A')], '2026-10-24');
    expect(plans.map((plan) => plan.date)).toEqual(['2026-10-26']);
    expect(planNotifications([alert('trip', '2026-10-25', 'A')], '2026-10-24')).toEqual([]);
  });

  it('keeps a reminder due today', () => {
    expect(planNotifications([alert('trip', '2026-10-27', 'B')], '2026-10-24').map((p) => p.date)).toEqual([
      '2026-10-24',
    ]);
  });

  it('merges reminders on the same day into one, A first', () => {
    const plans = planNotifications(
      [alert('a', '2026-11-12', 'B', '会議'), alert('b', '2026-11-12', 'A', '出張')],
      '2026-10-24',
    );
    const sameDay = plans.find((plan) => plan.date === '2026-11-09')!;
    expect(sameDay.title).toBe('確かめたい予定が2件あります');
    expect(sameDay.body).toBe('11/12 出張、11/12 会議');
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(plans.length);
  });

  it('returns nothing without alerts', () => {
    expect(planNotifications([], '2026-10-24')).toEqual([]);
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
