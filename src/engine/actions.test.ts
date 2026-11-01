import { planActions } from './actions';
import { CalendarEvent, detectConflicts, impactOf } from './conflicts';
import { predictCycle } from './cycle';
import { buildZones, DEFAULT_ZONE_SETTINGS } from './zones';

// 記録 9/28。次は 10/26 ごろ（ヘビー期 10/25〜29）、PMS期 10/18〜24、生理の終わりごろ 10/30〜11/2。
// 落ち着いている日は 10/5〜17 と 11/3〜14
const starts = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'];
const prediction = predictCycle(starts)!;
const zones = buildZones(prediction, { from: '2026-09-20', until: '2026-11-15' }, undefined, starts);

const ev = (title: string, start: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e',
  title,
  start,
  end: start,
  allDay: false,
  ...more,
});

function actionsFor(event: CalendarEvent, today = '2026-10-01') {
  const [alert] = detectConflicts([event], zones, undefined, prediction);
  return { alert, actions: planActions({ alert, event, starts, settings: DEFAULT_ZONE_SETTINGS, today }) };
}

describe('impactOf', () => {
  it.each([
    ['一次面接', 'fixed'],
    ['資格試験', 'fixed'],
    ['友人の結婚式', 'fixed'],
    ['定例会議', 'moveable'],
    ['飲み会', 'moveable'],
    ['家族旅行', 'moveable'],
    ['大阪出張', 'mitigable'],
    ['展示会', 'mitigable'],
  ])('treats %s as %s', (title, impact) => {
    expect(impactOf(title)).toBe(impact);
  });
});

describe('planActions', () => {
  it('never offers another date for an event that cannot move, only preparation', () => {
    const { alert, actions } = actionsFor(ev('一次面接', '2026-10-27'));
    expect(alert.impact).toBe('fixed');
    expect(actions).toEqual([
      { kind: 'deadline', resolveBy: '2026-10-25', text: '10月25日までに準備を終えておくと安心です' },
      { kind: 'prepTask', text: '鎮痛剤や着替えを用意しておく', done: false },
      { kind: 'prepTask', text: '前の日は早めに休む', done: false },
    ]);
  });

  it('offers the nearest calm days for an event that can move, and a polite message', () => {
    const { actions } = actionsFor(ev('定例会議', '2026-10-26'));
    expect(actions.filter((a) => a.kind === 'suggestAltDate')).toEqual([
      { kind: 'suggestAltDate', date: '2026-11-03', score: 4 },
      { kind: 'suggestAltDate', date: '2026-10-17', score: 4 },
      { kind: 'suggestAltDate', date: '2026-11-04', score: 4 },
    ]);
    expect(actions).toContainEqual({ kind: 'deadline', resolveBy: '2026-10-25', text: '10月25日までに日程を決めると、動かしやすいです' });
    expect(actions).toContainEqual({
      kind: 'declineTemplate',
      text: '申し訳ありません、その日は都合が悪くなってしまいました。11月3日ごろに変えていただくことはできますか？',
    });
  });

  it('does not offer days that have already passed', () => {
    const { actions } = actionsFor(ev('定例会議', '2026-10-26'), '2026-10-20');
    expect(actions.filter((a) => a.kind === 'suggestAltDate').map((a) => a.kind === 'suggestAltDate' && a.date)).toEqual([
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
    ]);
  });

  it('moves a trip only to stretches where every day is calm, and leaves room for travel', () => {
    const { actions } = actionsFor(ev('家族旅行', '2026-10-24', { end: '2026-10-27', allDay: true }));
    expect(actions.filter((a) => a.kind === 'suggestAltDate').map((a) => a.kind === 'suggestAltDate' && a.date)).toEqual([
      '2026-10-14',
      '2026-11-03',
      '2026-10-13',
    ]);
    // 期限は、いちばんきつい日（3日目）ではなく出発の日から数える
    expect(actions).toContainEqual({ kind: 'deadline', resolveBy: '2026-10-17', text: '10月17日までに日程を決めると、動かしやすいです' });
    expect(actions.filter((a) => a.kind === 'prepTask').map((a) => a.kind === 'prepTask' && a.text)).toEqual([
      'いちばんきついのは3日目。予定は2日目までに寄せて、3日目は移動や予定を少なめに',
      '移動の時間にゆとりを持たせる',
      '鎮痛剤や着替えを用意しておく',
      '前の日は早めに休む',
    ]);
  });

  it('helps prepare for an event that is hard to move, without other dates', () => {
    const { alert, actions } = actionsFor(ev('大阪出張', '2026-10-27'));
    expect(alert.impact).toBe('mitigable');
    expect(actions.some((a) => a.kind === 'suggestAltDate')).toBe(false);
    expect(actions).toContainEqual({ kind: 'deadline', resolveBy: '2026-10-24', text: '10月24日までに準備を始めておくと安心です' });
    expect(actions).toContainEqual({
      kind: 'declineTemplate',
      text: '申し訳ありません、その日は都合が悪くなってしまいました。別の日に変えていただくことはできますか？',
    });
  });

  it('plans a multi-day event around its hardest day', () => {
    const event = { id: 'a', title: '大阪出張', start: '2026-10-25', end: '2026-10-27', allDay: false };
    const [alert] = detectConflicts([event], zones, undefined, prediction);
    const actions = planActions({ alert, event: alert.event, starts, settings: DEFAULT_ZONE_SETTINGS, today: '2026-10-01' });
    expect(actions.find((a) => a.kind === 'prepTask')).toEqual({
      kind: 'prepTask',
      text: 'いちばんきついのは2日目。予定は1日目に寄せて、2日目は移動や予定を少なめに',
      done: false,
    });
  });

  it('suggests finishing preparation before the PMS days', () => {
    const { actions } = actionsFor(ev('プレゼン', '2026-10-22'));
    expect(actions).toContainEqual({ kind: 'prepTask', text: '準備を10月17日までに終わらせる', done: false });
    // PMSの時期に入ってからは、過ぎた日を目安にしない
    const late = actionsFor(ev('プレゼン', '2026-10-22'), '2026-10-19').actions;
    expect(late.filter((a) => a.kind === 'prepTask').map((a) => a.kind === 'prepTask' && a.text)).toEqual(['前後の予定をゆるめにする', '前の日は早めに休む']);
  });

  it('never names the period or PMS in a message meant for others', () => {
    for (const [title, day] of [
      ['定例会議', '2026-10-26'],
      ['大阪出張', '2026-10-27'],
      ['プレゼン', '2026-10-22'],
    ]) {
      const { actions } = actionsFor(ev(title, day));
      for (const action of actions) if (action.kind === 'declineTemplate') expect(action.text).not.toMatch(/生理|PMS|体調/);
    }
  });
});
