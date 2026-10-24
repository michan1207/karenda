import { detectConflicts } from './conflicts';
import { predictCycle } from './cycle';
import { buildZones } from './zones';

// 次の生理は 10-26（ヘビー期 10-26〜28）、PMS期 10-19〜25
const zones = buildZones(predictCycle(['2026-07-06', '2026-08-03', '2026-08-31', '2026-09-28'])!, {
  from: '2026-10-01',
  until: '2026-11-15',
});

const ev = (id: string, title: string, start: string, end = start, allDay = false) => ({ id, title, start, end, allDay });

describe('detectConflicts', () => {
  it('raises red for a heavy event on a heavy day, naming the period day', () => {
    const [alert] = detectConflicts([ev('1', '福岡出張', '2026-10-27')], zones);
    expect(alert).toMatchObject({ eventId: '1', date: '2026-10-27', level: 'red', zone: 'heavy', risk: 'high' });
    expect(alert.message).toContain('生理2日目');
  });

  it('raises yellow for a medium event on a heavy day', () => {
    const [alert] = detectConflicts([ev('1', '定例会議', '2026-10-26')], zones);
    expect(alert).toMatchObject({ level: 'yellow', zone: 'heavy', risk: 'medium' });
  });

  it('raises yellow for a heavy event in the PMS week and suggests finishing before it', () => {
    const [alert] = detectConflicts([ev('1', '企画プレゼン', '2026-10-22')], zones);
    expect(alert).toMatchObject({ level: 'yellow', zone: 'pms', risk: 'high' });
    expect(alert.message).toContain('10月18日');
  });

  it('flags medium events in the PMS week only when that week has three or more', () => {
    expect(detectConflicts([ev('1', '会議', '2026-10-20')], zones)).toEqual([]);
    const busy = detectConflicts(
      [ev('1', '会議', '2026-10-19'), ev('2', '飲み会', '2026-10-21'), ev('3', '美容院', '2026-10-24')],
      zones,
    );
    expect(busy.map((a) => a.eventId)).toEqual(['1', '2', '3']);
    expect(busy[0].message).toContain('詰め込み');
  });

  it('counts medium events per Monday-to-Sunday week', () => {
    // 10-25 is a Sunday, 10-19 a Monday; 10-18 belongs to the previous week
    const alerts = detectConflicts(
      [ev('1', '会議', '2026-10-18'), ev('2', '会議', '2026-10-19'), ev('3', '会議', '2026-10-25')],
      zones,
    );
    expect(alerts).toEqual([]);
  });

  it('ignores low-risk events and calm days', () => {
    expect(detectConflicts([ev('1', '買い物', '2026-10-27'), ev('2', '出張', '2026-10-05')], zones)).toEqual([]);
  });

  it('checks every day of a multi-day event and keeps the most severe', () => {
    const [alert] = detectConflicts([ev('1', '家族旅行', '2026-10-24', '2026-10-27')], zones);
    expect(alert).toMatchObject({ level: 'red', date: '2026-10-26' });
  });

  it('sorts red before yellow, then by date', () => {
    const alerts = detectConflicts(
      [ev('a', 'プレゼン', '2026-10-20'), ev('b', '出張', '2026-10-28'), ev('c', '会議', '2026-10-26')],
      zones,
    );
    expect(alerts.map((a) => a.eventId)).toEqual(['b', 'a', 'c']);
  });

  it('says "the period" instead of a day number when the day is uncertain', () => {
    const wide = buildZones(predictCycle(['2026-07-01', '2026-07-26', '2026-08-28', '2026-09-26'])!, {
      from: '2026-10-01',
      until: '2026-11-05',
    });
    const [alert] = detectConflicts([ev('1', '出張', '2026-10-22')], wide);
    expect(alert.level).toBe('red');
    expect(alert.message).toContain('生理の時期');
  });
});
