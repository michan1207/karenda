import { partnerMessage } from './partner';
import { DEFAULT_ZONE_SETTINGS } from './zones';

const REGULAR = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28']; // 28 days every time
const ON_PERIOD = [...REGULAR, '2026-10-26']; // 10-26 に記録 → ヘビー期は 10-28 まで
const PREDICTION = '（Cocomiaの予測なので、前後するかも）';
const CLOSING = `ちょっと気にかけてくれたらうれしいな☺️\n${PREDICTION}`;

describe('partnerMessage', () => {
  it('says the period is on now and until when', () => {
    expect(partnerMessage(ON_PERIOD, DEFAULT_ZONE_SETTINGS, '2026-10-27', 'period', 'care')).toBe(
      `いま生理中だよ🌙\n10月28日ごろまで、ちょっとしんどいかも。\n${CLOSING}`,
    );
  });

  it('tells the next period before it comes', () => {
    // 次は 10-26〜28（今日 10-24 は PMS期の中）
    expect(partnerMessage(REGULAR, DEFAULT_ZONE_SETTINGS, '2026-10-24', 'period', 'care')).toBe(
      `次の生理は10月26日〜28日ごろの予定だよ🌙\nその前の数日は、ゆらぎやすいかも。\n${CLOSING}`,
    );
  });

  it.each([
    ['girlsDay', 'いま女の子の日だよ🌙', '次の女の子の日は10月26日〜28日ごろの予定だよ🌙'],
    ['soft', 'いま体調がゆらぎやすい時期だよ🌙', '次は10月26日〜28日ごろ、ちょっと体調がゆらぎそう🌙'],
    ['monthly', 'いま月のもの中だよ🌙', '次の月のものは10月26日〜28日ごろの予定だよ🌙'],
    ['thatDay', 'いまあの日だよ🌙', '次のあの日は10月26日〜28日ごろの予定だよ🌙'],
    ['moon', 'いまお月さまの日だよ🌙', '次のお月さまの日は10月26日〜28日ごろの予定だよ🌙'],
    ['lowHp', 'いまHPひくめモードだよ🥺', '次は10月26日〜28日ごろ、HPひくめモードになりそう🥺'],
    ['rest', 'いまおやすみモードだよ🧸', '次は10月26日〜28日ごろ、おやすみモードになりそう🧸'],
  ] as const)('words it as %s', (wording, now, next) => {
    expect(partnerMessage(ON_PERIOD, DEFAULT_ZONE_SETTINGS, '2026-10-27', wording, 'care')).toMatch(new RegExp(`^${now}\n`));
    expect(partnerMessage(REGULAR, DEFAULT_ZONE_SETTINGS, '2026-10-24', wording, 'care')).toMatch(new RegExp(`^${next}\n`));
  });

  it.each(['soft', 'lowHp', 'rest'] as const)('never names the period when worded as %s', (wording) => {
    for (const [starts, today] of [[ON_PERIOD, '2026-10-27'], [REGULAR, '2026-10-24']] as const) {
      expect(partnerMessage([...starts], DEFAULT_ZONE_SETTINGS, today, wording, 'care')).not.toMatch(
        /生理|女の子|月のもの|あの日|お月さま/,
      );
    }
  });

  it.each([
    ['care', 'ちょっと気にかけてくれたらうれしいな☺️'],
    ['gentle', 'やさしくしてくれたらうれしいな🍵'],
    ['thanks', 'いつもありがとう。よろしくね🍵'],
    ['slow', 'ゆっくりめに過ごすね🍵'],
    ['watch', 'そっと見守ってくれたら助かるな🌿'],
  ] as const)('closes with %s, then the prediction note', (closing, line) => {
    expect(partnerMessage(REGULAR, DEFAULT_ZONE_SETTINGS, '2026-10-24', 'period', closing)).toMatch(
      new RegExp(`ゆらぎやすいかも。\n${line}\n${PREDICTION}$`),
    );
  });

  it('writes a span across months, and leaves out the days before when PMS is off', () => {
    // 29日周期（28〜30日）→ ヘビー期 10-30〜11-03
    const message = partnerMessage(
      ['2026-08-05', '2026-09-02', '2026-10-02'],
      { heavyDays: 3, pmsDays: 0 },
      '2026-10-10',
      'period',
      'care',
    );
    expect(message).toBe(`次の生理は10月30日〜11月3日ごろの予定だよ🌙\n${CLOSING}`);
  });

  it('returns null without records', () => {
    expect(partnerMessage([], DEFAULT_ZONE_SETTINGS, '2026-10-24', 'period', 'care')).toBeNull();
  });
});
