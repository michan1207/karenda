import type { ConflictAlert } from './conflicts';
import { planNotifications } from './notifications';

const alert = (eventId: string, date: string, level: 'red' | 'yellow', title = eventId): ConflictAlert => ({
  eventId,
  title,
  date,
  level,
  zone: level === 'red' ? 'heavy' : 'pms',
  risk: 'high',
  message: `${title}のメッセージ`,
});

describe('planNotifications', () => {
  it('notifies 7 and 3 days before a red alert and 3 days before a yellow one', () => {
    const plans = planNotifications([alert('trip', '2026-11-20', 'red'), alert('talk', '2026-11-10', 'yellow')], '2026-10-24');
    expect(plans.map((plan) => plan.date)).toEqual(['2026-11-07', '2026-11-13', '2026-11-17']);
  });

  it('writes the event date and title, and the advice as the body', () => {
    const [plan] = planNotifications([alert('t', '2026-11-10', 'yellow', '企画プレゼン')], '2026-10-24');
    expect(plan).toEqual({
      id: 'guard-2026-11-07',
      date: '2026-11-07',
      title: '11/10「企画プレゼン」の前に',
      body: '企画プレゼンのメッセージ',
    });
  });

  it('skips reminders that would have been in the past', () => {
    // 5日後の予定：7日前は過ぎているので3日前だけ
    const plans = planNotifications([alert('trip', '2026-10-29', 'red')], '2026-10-24');
    expect(plans.map((plan) => plan.date)).toEqual(['2026-10-26']);
    expect(planNotifications([alert('trip', '2026-10-25', 'red')], '2026-10-24')).toEqual([]);
  });

  it('keeps a reminder due today', () => {
    expect(planNotifications([alert('trip', '2026-10-27', 'yellow')], '2026-10-24').map((p) => p.date)).toEqual([
      '2026-10-24',
    ]);
  });

  it('merges reminders on the same day into one, red first', () => {
    const plans = planNotifications(
      [alert('a', '2026-11-12', 'yellow', '会議'), alert('b', '2026-11-12', 'red', '出張')],
      '2026-10-24',
    );
    const sameDay = plans.find((plan) => plan.date === '2026-11-09')!;
    expect(sameDay.title).toBe('体調の時期と重なる予定が2件あります');
    expect(sameDay.body).toBe('11/12 出張、11/12 会議');
    expect(new Set(plans.map((plan) => plan.id)).size).toBe(plans.length);
  });

  it('returns nothing without alerts', () => {
    expect(planNotifications([], '2026-10-24')).toEqual([]);
  });
});
