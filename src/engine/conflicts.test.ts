import { CalendarEvent, detectConflicts, gradeOf } from './conflicts';
import { predictCycle } from './cycle';
import { buildZones } from './zones';

// 記録 9/28（生理1〜3日目 9/28〜30）。次は 10/26 ごろ（10/25〜27、ヘビー期 10/25〜29）、PMS期 10/18〜24、
// 生理の終わりごろ 10/30〜11/2
const starts = ['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'];
const prediction = predictCycle(starts)!;
const zones = buildZones(prediction, { from: '2026-09-20', until: '2026-11-15' }, undefined, starts);

const ev = (id: string, title: string, start: string, more: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title,
  start,
  end: start,
  allDay: false,
  ...more,
});
const detect = (events: CalendarEvent[]) => detectConflicts(events, zones, undefined, prediction);

describe('detectConflicts', () => {
  it('grades an all-day trip on a recorded period day A, and says why', () => {
    const [alert] = detect([ev('1', '大阪出張', '2026-09-29', { allDay: true })]);
    expect(alert).toMatchObject({ eventId: '1', date: '2026-09-29', grade: 'A', score: 100, risk: 'high' });
    expect(alert.reasons).toEqual(['phaseMostSevere', 'allDayMobility']);
    expect(alert.reasonText).toBe('終日の移動を伴う予定で、生理2日目と重なる見込みです。');
  });

  it('leaves an ordinary meeting on a calm day out, as grade C', () => {
    expect(detect([ev('1', '会議', '2026-10-10')])).toEqual([]);
  });

  it.each([
    ['a heavy event on period day 2', '企画プレゼン', '2026-10-27', 'A', 100],
    ['a normal event on period day 1', '定例会議', '2026-10-26', 'B', 40],
    ['a heavy event in the PMS week', 'プレゼン', '2026-10-22', 'A', 70],
    ['a heavy event on a day the period may come', '発表', '2026-10-29', 'B', 60],
    ['a heavy event near the end of the period', '出張', '2026-10-31', 'B', 60],
  ])('grades %s', (_, title, day, grade, score) => {
    expect(detect([ev('1', title, day)])[0]).toMatchObject({ grade, score });
  });

  it.each([
    ['a normal event in the PMS week', '会議', '2026-10-20'],
    ['a normal event near the end of the period', '飲み会', '2026-10-31'],
    ['an event without weighty words', '買い物', '2026-10-27'],
  ])('only notes %s as C, so leaves it out', (_, title, day) => {
    expect(detect([ev('1', title, day)])).toEqual([]);
  });

  it('adds a little for an early start, and notes a long event', () => {
    const [early] = detect([ev('1', 'プレゼン', '2026-10-22', { startMinutes: 7 * 60 })]);
    expect(early).toMatchObject({ grade: 'A', score: 74 });
    expect(early.reasons).toContain('earlyMorning');
    expect(early.reasonText).toBe('朝早い予定で、PMSの時期と重なる見込みです。');
    const [long] = detect([ev('2', '試験', '2026-10-22', { durationMinutes: 300 })]);
    expect(long).toMatchObject({ score: 70 });
    expect(long.reasons).toContain('longDuration');
  });

  it('keeps the heaviest day of an event spanning several days', () => {
    const [alert] = detect([ev('1', '家族旅行', '2026-10-24', { end: '2026-10-27', allDay: true })]);
    expect(alert).toMatchObject({ date: '2026-10-26', grade: 'A', score: 100 });
  });

  it('makes one alert for a run of same-titled days, on the hardest day', () => {
    const alerts = detect([ev('a', '大阪出張', '2026-10-25'), ev('b', '大阪出張', '2026-10-26'), ev('c', '大阪出張', '2026-10-27')]);
    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert).toMatchObject({ date: '2026-10-26', grade: 'A', score: 100 });
    expect(alert.reasons).toContain('seriesPeak');
    expect(alert.reasonText).toBe('3日間の予定で、いちばんきついのは10月26日（2日目）。生理1日目と重なる見込みです。');
    expect(alert.series).toEqual({
      peakDate: '2026-10-26',
      days: [
        { date: '2026-10-25', score: 69, label: '生理かも' },
        { date: '2026-10-26', score: 100, label: '生理1日目' },
        { date: '2026-10-27', score: 100, label: '生理2日目' },
      ],
    });
  });

  it('finds the one hard day of a trip that touches the PMS days only at its end', () => {
    const [alert] = detect([ev('t', '家族旅行', '2026-10-14', { end: '2026-10-18', allDay: true })]);
    expect(alert).toMatchObject({ date: '2026-10-18', grade: 'A' });
    expect(alert.reasons).toContain('seriesPeak');
    expect(alert.series?.days.map((d) => d.label)).toEqual(['おだやか', 'おだやか', 'おだやか', 'おだやか', 'PMS']);
  });

  it('says when the prediction is too uncertain to rely on', () => {
    // 22, 35, 24, 36 日 → 確信度「低」
    const loose = ['2026-01-01', '2026-01-23', '2026-02-27', '2026-03-23', '2026-04-28'];
    const p = predictCycle(loose)!;
    const z = buildZones(p, { from: '2026-05-01', until: '2026-06-30' }, undefined, loose);
    const [alert] = detectConflicts([ev('1', '出張', '2026-05-27')], z, undefined, p);
    expect(alert.reasons).toContain('windowWide');
    expect(alert.confidenceNote).toBe('周期のばらつきが大きく、予測がずれることがあります。');
  });

  it('sorts A before B, then by date', () => {
    const alerts = detect([ev('a', '定例会議', '2026-10-26'), ev('b', '出張', '2026-10-28'), ev('c', 'プレゼン', '2026-10-22')]);
    expect(alerts.map((a) => a.eventId)).toEqual(['c', 'b', 'a']);
  });

  it('always says why, and keeps the suggestion naming the period day', () => {
    const alerts = detect([
      ev('1', '企画プレゼン', '2026-10-27'),
      ev('2', '定例会議', '2026-10-26'),
      ev('3', 'プレゼン', '2026-10-22'),
      ev('4', '出張', '2026-10-31'),
    ]);
    for (const alert of alerts) expect(alert.reasonText).not.toBe('');
    expect(alerts.find((a) => a.eventId === '1')!.message).toContain('生理2日目');
    expect(alerts.find((a) => a.eventId === '3')!.message).toContain('10月17日');
  });
});

describe('gradeOf', () => {
  it.each([
    [100, 'A'],
    [70, 'A'],
    [69, 'B'],
    [40, 'B'],
    [39, 'C'],
    [0, 'C'],
  ])('gives %i grade %s', (score, grade) => {
    expect(gradeOf(score)).toBe(grade);
  });
});
