import { partnerMessage } from './partner';
import { DEFAULT_ZONE_SETTINGS } from './zones';

const REGULAR = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28']; // 28 days every time
const CLOSING = 'やさしくしてくれたらうれしいな🍵\n（Cocomiaの予測なので、前後するかも）';

describe('partnerMessage', () => {
  it('says the period is on now and until when', () => {
    // 10-26 に記録 → ヘビー期は 10-28 まで
    expect(partnerMessage([...REGULAR, '2026-10-26'], DEFAULT_ZONE_SETTINGS, '2026-10-27')).toBe(
      `いま生理中だよ🌙\n10月28日ごろまで、ちょっとしんどいかも。\n${CLOSING}`,
    );
  });

  it('tells the next period before it comes', () => {
    // 次は 10-26〜28（今日 10-24 は PMS期の中）
    expect(partnerMessage(REGULAR, DEFAULT_ZONE_SETTINGS, '2026-10-24')).toBe(
      `次の生理は10月26日〜28日ごろの予定だよ🌙\nその前の数日は、ゆらぎやすいかも。\n${CLOSING}`,
    );
  });

  it('writes a span across months, and leaves out the days before when PMS is off', () => {
    // 29日周期（28〜30日）→ ヘビー期 10-30〜11-03
    const message = partnerMessage(['2026-08-05', '2026-09-02', '2026-10-02'], { heavyDays: 3, pmsDays: 0 }, '2026-10-10');
    expect(message).toBe(`次の生理は10月30日〜11月3日ごろの予定だよ🌙\n${CLOSING}`);
  });

  it('returns null without records', () => {
    expect(partnerMessage([], DEFAULT_ZONE_SETTINGS, '2026-10-24')).toBeNull();
  });
});
