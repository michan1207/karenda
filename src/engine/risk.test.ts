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

  it.each(['有給', '夏季休暇', '代休', 'OFF', 'ＯＦＦ日'])('does not treat an all-day day off (%s) as heavy', (title) => {
    expect(classifyRisk({ title, allDay: true })).toBe('low');
  });

  it('does not treat public holidays as heavy, but still reads their words', () => {
    expect(classifyRisk({ title: '文化の日', allDay: true, holiday: true })).toBe('low');
    expect(classifyRisk({ title: 'office move', allDay: true })).toBe('high');
    expect(classifyRisk({ title: '有給で旅行', allDay: true })).toBe('high');
  });

  it('uses the weight chosen for an event put in this app, before words or learning', () => {
    const learned = new Map([['発表', 'normal' as const]]);
    expect(classifyRisk({ title: '買い物', allDay: false, weight: 'heavy' })).toBe('high');
    expect(classifyRisk({ title: '出張', allDay: true, weight: 'normal' })).toBe('medium');
    expect(classifyRisk({ title: '発表', allDay: false, weight: 'heavy' }, { ...DEFAULT_KEYWORDS, learned })).toBe('high');
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
