import { learnWeight, overrideWeight, TitleWeight } from './learning';
import { classifyRisk, DEFAULT_KEYWORDS, termOf } from './risk';

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
