import { partnerMessage } from './partner';
import { DEFAULT_ZONE_SETTINGS } from './zones';

const REGULAR = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28']; // 28 days every time

describe('partnerMessage', () => {
  it('lists the coming windows as one span each, PMS and period joined', () => {
    // 今日 10-24 は PMS期の中。10-26〜28 がヘビー期、次は 11-16〜22 PMS・11-23〜25 ヘビー期
    expect(partnerMessage(REGULAR, DEFAULT_ZONE_SETTINGS, '2026-10-24', 30)).toBe(
      [
        '【Cocomia】体調に気をつけたい時期（予測）',
        '・10月24日〜28日ごろ',
        '・11月16日〜25日ごろ',
        'アプリの予測なので、前後することがあります。',
      ].join('\n'),
    );
  });

  it('writes a window to its end even past the coming days, across months', () => {
    // 29日周期（28〜30日）→ PMS 10-23〜29、ヘビー期 10-30〜11-03
    const starts = ['2026-08-05', '2026-09-02', '2026-10-02'];
    expect(partnerMessage(starts, DEFAULT_ZONE_SETTINGS, '2026-10-10', 15)).toContain('・10月23日〜11月3日ごろ\n');
  });

  it('never names the period or PMS, since it may show in a notification', () => {
    expect(partnerMessage(REGULAR, DEFAULT_ZONE_SETTINGS, '2026-10-24', 30)).not.toMatch(/生理|PMS/);
  });

  it('returns null without records or when nothing falls in the coming days', () => {
    expect(partnerMessage([], DEFAULT_ZONE_SETTINGS, '2026-10-24', 30)).toBeNull();
    // 1件だけの記録（10-20）→ 次の PMS期は 11-08 から
    expect(partnerMessage(['2026-10-20'], DEFAULT_ZONE_SETTINGS, '2026-10-23', 14)).toBeNull();
  });
});
