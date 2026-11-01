import { classifyRisk, DEFAULT_KEYWORDS, EventTrait, traitsOf } from './risk';

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

  it.each(['有給', '夏季休暇', '代休', '休み', '夏休み', 'OFF', 'ＯＦＦ日'])('does not treat an all-day day off (%s) as heavy', (title) => {
    expect(classifyRisk({ title, allDay: true })).toBe('low');
  });

  it('treats an all-day public holiday like any all-day event, and still reads the words of a day off', () => {
    // 2026-10-31 オーナー決定: 祝日も特別扱いしない（それまでは祝日カレンダーの予定を重くしなかった）
    expect(classifyRisk({ title: '文化の日', allDay: true })).toBe('high');
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

// B1（2026-11-01）: 4つに分かれていた言葉の表（既定のキーワード・移動・動かしやすさ・決める目安）を1つの名簿にした。
// 前の表と同じ言葉・同じ並び・同じ性質のままであることを、前の表をそのまま書いて確かめる
describe('the word list', () => {
  const HIGH = ['出張', 'プレゼン', '発表', '面接', '旅行', 'ライブ', '遠征', '夜勤', '締め切り', '締切', '試験'];
  const MEDIUM = ['会議', '打ち合わせ', '打合せ', 'ミーティング', '飲み会', '美容院', '残業', 'ワンオペ'];
  const ALL = [...HIGH, ...MEDIUM, '帰省', '合宿', '結婚式', '葬儀', '本番', 'ランチ', '買い物', '女子会', 'デート'];
  const withTrait = (has: (trait: EventTrait) => boolean) => ALL.filter((word) => traitsOf(word).some(has)).sort();
  const sorted = (words: string[]) => [...words].sort();

  it('keeps the default keywords in the same order', () => {
    expect(DEFAULT_KEYWORDS).toEqual({ high: HIGH, medium: MEDIUM });
  });

  it('keeps which words mean travel, a day that cannot move, and a day that can move', () => {
    expect(withTrait((trait) => !!trait.mobility)).toEqual(sorted(['出張', '旅行', '遠征', '帰省', '合宿']));
    expect(withTrait((trait) => trait.impact === 'fixed')).toEqual(sorted(['面接', '試験', '締め切り', '締切', '夜勤', '結婚式', '葬儀', '本番']));
    expect(withTrait((trait) => trait.impact === 'moveable')).toEqual(
      sorted(['会議', '打ち合わせ', '打合せ', 'ミーティング', '飲み会', '美容院', 'ランチ', '旅行', '帰省', '買い物', '女子会', 'デート']),
    );
  });

  it('keeps how many days ahead each kind of event should be decided', () => {
    const lead = (word: string) => traitsOf(word).find((trait) => trait.leadDays)?.leadDays;
    expect(['旅行', '帰省', '出張', '遠征', '面接', '試験', '会議', '打ち合わせ', '打合せ', 'ミーティング'].map(lead)).toEqual([7, 7, 3, 3, 2, 2, 1, 1, 1, 1]);
    expect(ALL.filter((word) => lead(word) !== undefined)).toHaveLength(10);
  });
});
