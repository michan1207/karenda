import { classifyRisk, DEFAULT_KEYWORDS } from './risk';

describe('classifyRisk', () => {
  it.each([
    ['大阪出張', 'high'],
    ['新製品のプレゼン', 'high'],
    ['二次面接', 'high'],
    ['ライブ遠征', 'high'],
    ['定例会議', 'medium'],
    ['A社と打ち合わせ', 'medium'],
    ['部署の飲み会', 'medium'],
    ['美容院', 'medium'],
    ['買い物', 'low'],
    ['婦人科', 'low'],
    ['', 'low'],
  ])('%s → %s', (title, expected) => {
    expect(classifyRisk({ title, allDay: false })).toBe(expected);
  });

  it('treats all-day events as high risk', () => {
    expect(classifyRisk({ title: '買い物', allDay: true })).toBe('high');
  });

  it('prefers high when keywords of both levels appear', () => {
    expect(classifyRisk({ title: '会議でプレゼン', allDay: false })).toBe('high');
  });

  it('ignores width and letter case', () => {
    const keywords = { ...DEFAULT_KEYWORDS, high: [...DEFAULT_KEYWORDS.high, 'MTG'] };
    expect(classifyRisk({ title: 'ｍｔｇ', allDay: false }, keywords)).toBe('high');
  });

  it('uses custom keywords', () => {
    expect(classifyRisk({ title: 'ヨガ', allDay: false }, { high: [], medium: ['ヨガ'] })).toBe('medium');
  });
});
