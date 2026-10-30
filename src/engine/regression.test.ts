import { addDays, CalendarEvent, computeGuard, DEFAULT_KEYWORDS, DEFAULT_ZONE_SETTINGS, diffDays, planNotifications, predictCycle, buildZones, ZoneMap } from './index';

// 判定を作り直す前に、いまの結果をそのまま固定しておく。変わるときは意図した変更として、このテストも書き換える

const event = (id: string, title: string, start: string, end = start, allDay = false): CalendarEvent => ({ id, title, start, end, allDay });

const zoneList = (zones: ZoneMap) =>
  [...zones]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, zone]) => (zone.zone === 'heavy' ? `${day} heavy ${zone.periodDay ?? '-'}` : `${day} pms`));

describe('today’s guard results', () => {
  const guard = computeGuard({
    // 周期 28, 29, 27, 28, 29 日
    starts: ['2026-05-04', '2026-06-01', '2026-06-30', '2026-07-27', '2026-08-24', '2026-09-22'],
    settings: DEFAULT_ZONE_SETTINGS,
    keywords: DEFAULT_KEYWORDS,
    range: { from: '2026-10-01', until: '2026-11-30' },
    events: [
      event('trip', '大阪出張', '2026-10-20'),
      event('meet', '定例会議', '2026-10-21'),
      event('family', '家族旅行', '2026-10-17', '2026-10-19', true),
      event('lunch', 'ランチ', '2026-10-14'),
      event('talk', 'プレゼン', '2026-10-15'),
      event('m1', '打ち合わせ', '2026-10-12'),
      event('m2', '飲み会', '2026-10-13'),
      event('m3', '美容院', '2026-10-14'),
      event('off', '有給', '2026-11-02', '2026-11-02', true),
      event('job', '面接', '2026-11-17'),
      event('exam', '試験', '2026-11-17'),
    ],
  });

  it('predicts from the recorded cycles', () => {
    expect(guard.prediction).toEqual({
      lastStart: '2026-09-22',
      averageLength: 28,
      minLength: 27,
      maxLength: 29,
      cyclesUsed: 5,
      provisional: false,
    });
  });

  it('marks the same heavy and PMS days', () => {
    expect(zoneList(guard.zones)).toEqual([
      '2026-10-12 pms', '2026-10-13 pms', '2026-10-14 pms', '2026-10-15 pms', '2026-10-16 pms', '2026-10-17 pms', '2026-10-18 pms',
      '2026-10-19 heavy -', '2026-10-20 heavy 1', '2026-10-21 heavy 2', '2026-10-22 heavy 3', '2026-10-23 heavy -',
      '2026-11-09 pms', '2026-11-10 pms', '2026-11-11 pms', '2026-11-12 pms', '2026-11-13 pms', '2026-11-14 pms', '2026-11-15 pms',
      '2026-11-16 heavy -', '2026-11-17 heavy 1', '2026-11-18 heavy 2', '2026-11-19 heavy 3', '2026-11-20 heavy -',
    ]);
  });

  it('raises the same alerts in the same order', () => {
    expect(guard.alerts.map((a) => `${a.eventId} ${a.date} ${a.level} ${a.zone} ${a.risk}`)).toEqual([
      'family 2026-10-19 red heavy high',
      'trip 2026-10-20 red heavy high',
      'job 2026-11-17 red heavy high',
      'exam 2026-11-17 red heavy high',
      'm1 2026-10-12 yellow pms medium',
      'm2 2026-10-13 yellow pms medium',
      'm3 2026-10-14 yellow pms medium',
      'talk 2026-10-15 yellow pms high',
      'meet 2026-10-21 yellow heavy medium',
    ]);
  });

  it('plans the same notifications', () => {
    expect(planNotifications(guard.alerts, '2026-10-01').map((n) => `${n.date} | ${n.title} | ${n.body}`)).toEqual([
      '2026-10-09 | 10/12「打ち合わせ」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-10-10 | 10/13「飲み会」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-10-11 | 10/14「美容院」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-10-12 | 確かめたい予定が2件あります | 10/19 家族旅行、10/15 プレゼン',
      '2026-10-13 | 10/20「大阪出張」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-10-16 | 10/19「家族旅行」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-10-17 | 10/20「大阪出張」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-10-18 | 10/21「定例会議」の前に | アプリを開いて、準備の予定を確かめてみませんか。',
      '2026-11-10 | 確かめたい予定が2件あります | 11/17 面接、11/17 試験',
      '2026-11-14 | 確かめたい予定が2件あります | 11/17 面接、11/17 試験',
    ]);
  });
});

describe('cycle boundaries', () => {
  it.each([
    [['2026-01-01'], 0, true],
    [['2026-01-01', '2026-01-29'], 1, true],
    [['2026-01-01', '2026-01-29', '2026-02-26'], 2, false],
  ])('with %j uses %i cycles (provisional: %s)', (starts, cyclesUsed, provisional) => {
    expect(predictCycle(starts)).toMatchObject({ cyclesUsed, provisional });
  });

  it('keeps 15- and 45-day gaps and drops 14- and 46-day ones', () => {
    // 間隔 15, 45, 14, 46 日
    const p = predictCycle(['2026-01-01', '2026-01-16', '2026-03-02', '2026-03-16', '2026-05-01'])!;
    expect(p).toMatchObject({ cyclesUsed: 2, minLength: 15, maxLength: 45, averageLength: 30 });
  });
});

describe('calendar boundaries', () => {
  // jest.timezone.js でチリの時間帯にしている。この日は0時が無く、1時から始まる
  it('runs in a time zone that skips midnight', () => {
    expect(new Date(2026, 8, 6).getHours()).toBe(1);
  });

  it('counts days across the skipped midnight', () => {
    expect(addDays('2026-09-05', 1)).toBe('2026-09-06');
    expect(addDays('2026-09-06', 1)).toBe('2026-09-07');
    expect(diffDays('2026-09-01', '2026-09-30')).toBe(29);
  });

  it('keeps a predicted period whole across the skipped midnight', () => {
    // 周期 28, 29 日 → 9/5 ごろ（9/4〜9/5）
    const zones = buildZones(predictCycle(['2026-06-11', '2026-07-09', '2026-08-07'])!, { from: '2026-08-20', until: '2026-09-15' });
    expect(zoneList(zones).filter((z) => z.includes('heavy'))).toEqual([
      '2026-09-04 heavy -', '2026-09-05 heavy 1', '2026-09-06 heavy 2', '2026-09-07 heavy 3',
    ]);
  });

  it('predicts across February 29', () => {
    const zones = buildZones(predictCycle(['2027-12-06', '2028-01-03', '2028-01-31'])!, { from: '2028-02-20', until: '2028-03-05' });
    expect(zoneList(zones)).toEqual([
      '2028-02-21 pms', '2028-02-22 pms', '2028-02-23 pms', '2028-02-24 pms', '2028-02-25 pms', '2028-02-26 pms', '2028-02-27 pms',
      '2028-02-28 heavy 1', '2028-02-29 heavy 2', '2028-03-01 heavy 3',
    ]);
  });

  it('predicts across the new year', () => {
    const zones = buildZones(predictCycle(['2027-10-04', '2027-11-01', '2027-11-29'])!, { from: '2027-12-15', until: '2028-01-31' });
    const heavy = zoneList(zones).filter((z) => z.includes('heavy'));
    expect(heavy).toEqual([
      '2027-12-27 heavy 1', '2027-12-28 heavy 2', '2027-12-29 heavy 3',
      '2028-01-24 heavy 1', '2028-01-25 heavy 2', '2028-01-26 heavy 3',
    ]);
  });

  it('never marks days outside the requested month', () => {
    // 次の生理は 12/1 ごろで、PMS は 11 月末にかかる
    const zones = buildZones(predictCycle(['2026-09-08', '2026-10-06', '2026-11-03'])!, { from: '2026-11-01', until: '2026-11-30' });
    expect(zones.get('2026-11-30')?.zone).toBe('pms');
    expect([...zones.keys()].every((day) => day >= '2026-11-01' && day <= '2026-11-30')).toBe(true);
  });

  it('alerts once for an all-day trip over the new year, on its heaviest day', () => {
    const guard = computeGuard({
      starts: ['2027-10-04', '2027-11-01', '2027-11-29'],
      settings: DEFAULT_ZONE_SETTINGS,
      keywords: DEFAULT_KEYWORDS,
      range: { from: '2027-12-15', until: '2028-01-31' },
      events: [event('home', '帰省', '2027-12-25', '2028-01-02', true)],
    });
    expect(guard.alerts.map((a) => `${a.date} ${a.level}`)).toEqual(['2027-12-27 red']);
  });
});
