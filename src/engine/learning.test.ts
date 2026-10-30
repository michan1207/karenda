import type { CalendarEvent } from './conflicts';
import { learnWeight, overrideWeight, pendingReviews, reviewTargets, TitleWeight } from './learning';
import { classifyRisk, DEFAULT_KEYWORDS, termOf } from './risk';
import type { ZoneMap } from './zones';

const answer = (times: number, a: Parameters<typeof learnWeight>[2], phase: Parameters<typeof learnWeight>[3], start?: TitleWeight) => {
  let entry = start;
  for (let i = 0; i < times; i++) entry = learnWeight(entry, '役員会議', a, phase);
  return entry!;
};

describe('learnWeight', () => {
  it('does not decide from one answer, and learns "heavy" from two hard ones', () => {
    expect(answer(1, 'hard', 'pms')).toMatchObject({ term: '役員会議', weight: null, observations: 1 });
    expect(answer(2, 'hard', 'pms')).toMatchObject({ term: '役員会議', label: '役員会議', weight: 'heavy', source: 'learned', observations: 2 });
  });

  it('learns "normal" when it was easy during the period or PMS, but not from easy calm days', () => {
    expect(answer(2, 'easy', 'period').weight).toBe('normal');
    expect(answer(5, 'easy', 'other').weight).toBeNull();
  });

  it('needs more than one answer to turn back', () => {
    const heavy = answer(2, 'hard', 'other');
    expect(learnWeight(heavy, '役員会議', 'easy', 'pms').weight).toBe('heavy');
    expect(answer(2, 'normal', 'pms', heavy).weight).toBe('normal');
  });

  it('never changes a weight the user set', () => {
    const set = overrideWeight(undefined, '役員会議', 'normal');
    expect(answer(10, 'hard', 'period', set)).toEqual(set);
  });

  it('treats full-width letters and spaces as the same title', () => {
    expect(termOf('ＭＴＧ 定例')).toBe(termOf('mtg定例'));
  });
});

describe('classifyRisk with learned weights', () => {
  const learned = new Map([
    ['役員会議', 'heavy' as const],
    ['社員旅行', 'normal' as const],
  ]);

  it('lets a learned weight win over the word list and the all-day rule', () => {
    expect(classifyRisk({ title: '会議', allDay: false }, { ...DEFAULT_KEYWORDS, learned })).toBe('medium');
    expect(classifyRisk({ title: '役員会議', allDay: false }, { ...DEFAULT_KEYWORDS, learned })).toBe('high');
    expect(classifyRisk({ title: '社員旅行', allDay: true }, { ...DEFAULT_KEYWORDS, learned })).toBe('medium');
  });
});

describe('reviewTargets', () => {
  const event = (id: string, title: string, start: string, end = start): CalendarEvent => ({ id, title, start, end, allDay: false });
  const zones: ZoneMap = new Map([
    ['2026-10-19', { zone: 'pms', predicted: true, windowStart: '2026-10-26' }],
    ['2026-10-26', { zone: 'heavy', predicted: true, periodDay: 1 }],
  ]);
  const targets = (events: CalendarEvent[], starts: string[] = []) =>
    reviewTargets({ events, zones, starts, pmsDays: 7, keywords: DEFAULT_KEYWORDS });

  it('asks only about heavy and normal events, on their last day, with the phase they fell in', () => {
    expect(
      targets([
        event('a', '役員会議', '2026-10-19'),
        event('b', '大阪出張', '2026-10-25', '2026-10-26'),
        event('c', '買い物', '2026-10-26'),
        event('d', '飲み会', '2026-10-10'),
      ]),
    ).toEqual([
      { eventId: 'd', title: '飲み会', date: '2026-10-10', phase: 'other', risk: 'medium' },
      { eventId: 'a', title: '役員会議', date: '2026-10-19', phase: 'pms', risk: 'medium' },
      { eventId: 'b', title: '大阪出張', date: '2026-10-26', phase: 'period', risk: 'high' },
    ]);
  });

  it('still counts the days before a recorded period start as PMS after the prediction moved on', () => {
    expect(targets([event('d', '飲み会', '2026-10-10')], ['2026-10-14'])[0].phase).toBe('pms');
  });
});

describe('pendingReviews', () => {
  const target = (eventId: string, date: string) => ({ eventId, title: eventId, date, phase: 'other' as const, risk: 'high' as const });

  it('keeps at most 3 unanswered ones from the last 7 days, newest first', () => {
    const all = ['10-16', '10-17', '10-20', '10-21', '10-22', '10-23', '10-24'].map((day) => target(day, `2026-${day}`));
    const answered = new Set(['10-22|2026-10-22']);
    expect(pendingReviews(all, answered, '2026-10-24').map((t) => t.eventId)).toEqual(['10-23', '10-21', '10-20']);
    expect(pendingReviews(all, new Set(), '2026-10-25').map((t) => t.eventId)).toEqual(['10-24', '10-23', '10-22']);
    expect(pendingReviews(all.slice(0, 2), new Set(), '2026-10-24').map((t) => t.eventId)).toEqual(['10-17']);
  });
});
