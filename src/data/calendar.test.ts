import app from '../../app.json';
import { deviceCalendar, toCalendarEvent } from './calendar';

jest.mock('expo-calendar/legacy', () => ({
  EntityTypes: { EVENT: 'event' },
  getCalendarsAsync: async () => [
    { id: 'work', title: '仕事' },
    { id: 'jp', title: '日本の祝日' },
  ],
  getEventsAsync: async () => [
    { id: 'h', calendarId: 'jp', title: '文化の日', startDate: new Date(2026, 10, 3), endDate: new Date(2026, 10, 4), allDay: true },
    { id: 'w', calendarId: 'work', title: '棚卸し', startDate: new Date(2026, 10, 3), endDate: new Date(2026, 10, 4), allDay: true },
  ],
}));

it('marks events from a holiday calendar so they are not treated as heavy', async () => {
  const events = await deviceCalendar.getEvents('2026-11-01', '2026-11-30');
  expect(events.map((event) => [event.title, event.holiday ?? false])).toEqual([
    ['文化の日', true],
    ['棚卸し', false],
  ]);
});

// expo-calendar は Android で読み取りにも READ と WRITE の両方の許可を求める。WRITE を塞ぐと許可が通らない
it('does not block calendar write permission on Android', () => {
  expect(JSON.stringify(app)).not.toContain('WRITE_CALENDAR');
});

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('toCalendarEvent', () => {
  it('keeps a timed event on its day', () => {
    expect(
      toCalendarEvent({ id: 'a', title: '会議', startDate: local(2026, 10, 27, 10), endDate: local(2026, 10, 27, 11), allDay: false }),
    ).toEqual({
      id: 'a@2026-10-27',
      title: '会議',
      start: '2026-10-27',
      end: '2026-10-27',
      allDay: false,
      startMinutes: 600,
      durationMinutes: 60,
    });
  });

  it('does not count the next day for an event ending at midnight', () => {
    const event = toCalendarEvent({
      id: 'b',
      title: '旅行',
      startDate: local(2026, 10, 24).toISOString(),
      endDate: local(2026, 10, 27).toISOString(),
      allDay: true,
    });
    expect(event).toMatchObject({ start: '2026-10-24', end: '2026-10-26', allDay: true });
    expect(event.startMinutes).toBeUndefined();
  });

  it('handles an iOS all-day event that ends at 23:59:59', () => {
    const event = toCalendarEvent({ id: 'c', title: '休み', startDate: local(2026, 10, 24), endDate: local(2026, 10, 24, 23, 59), allDay: true });
    expect(event).toMatchObject({ start: '2026-10-24', end: '2026-10-24' });
  });

  it('reads an Android all-day event, kept at midnight UTC, on its own days', () => {
    // Android は終日予定を UTC の0時で持ち、expo-calendar はその時刻を UTC の文字で返す（日本では9時〜翌日9時になる）
    const one = toCalendarEvent({ id: 'g', title: '休み', startDate: '2026-11-03T00:00:00.000Z', endDate: '2026-11-04T00:00:00.000Z', allDay: true });
    expect(one).toMatchObject({ id: 'g@2026-11-03', start: '2026-11-03', end: '2026-11-03' });
    const three = toCalendarEvent({ id: 'h', title: '旅行', startDate: '2026-11-03T00:00:00.000Z', endDate: '2026-11-06T00:00:00.000Z', allDay: true });
    expect(three).toMatchObject({ start: '2026-11-03', end: '2026-11-05' });
  });

  it('keeps an overnight event on both days', () => {
    const event = toCalendarEvent({ id: 'd', title: '夜勤', startDate: local(2026, 10, 24, 22), endDate: local(2026, 10, 25, 6), allDay: false });
    expect(event).toMatchObject({ start: '2026-10-24', end: '2026-10-25' });
  });

  // テストはチリの時間帯で動く（jest.timezone.js）。2026-09-06 は0時が無く、1時から始まる
  it('keeps all-day events on their days when midnight is skipped', () => {
    const before = toCalendarEvent({ id: 'e', title: '旅行', startDate: local(2026, 9, 5), endDate: local(2026, 9, 7), allDay: true });
    expect(before).toMatchObject({ start: '2026-09-05', end: '2026-09-06' });
    const on = toCalendarEvent({ id: 'f', title: '休み', startDate: local(2026, 9, 6), endDate: local(2026, 9, 7), allDay: true });
    expect(on).toMatchObject({ start: '2026-09-06', end: '2026-09-06' });
  });

  it('separates occurrences of a repeating event', () => {
    const first = toCalendarEvent({ id: 'r', title: '定例', startDate: local(2026, 10, 5, 9), endDate: local(2026, 10, 5, 10), allDay: false });
    const second = toCalendarEvent({ id: 'r', title: '定例', startDate: local(2026, 10, 12, 9), endDate: local(2026, 10, 12, 10), allDay: false });
    expect(first.id).not.toBe(second.id);
  });
});
