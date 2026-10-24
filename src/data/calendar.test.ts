import { toCalendarEvent } from './calendar';

jest.mock('expo-calendar/legacy', () => ({}));

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('toCalendarEvent', () => {
  it('keeps a timed event on its day', () => {
    expect(
      toCalendarEvent({ id: 'a', title: '会議', startDate: local(2026, 10, 27, 10), endDate: local(2026, 10, 27, 11), allDay: false }),
    ).toEqual({ id: 'a@2026-10-27', title: '会議', start: '2026-10-27', end: '2026-10-27', allDay: false });
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
  });

  it('handles an iOS all-day event that ends at 23:59:59', () => {
    const event = toCalendarEvent({ id: 'c', title: '休み', startDate: local(2026, 10, 24), endDate: local(2026, 10, 24, 23, 59), allDay: true });
    expect(event).toMatchObject({ start: '2026-10-24', end: '2026-10-24' });
  });

  it('keeps an overnight event on both days', () => {
    const event = toCalendarEvent({ id: 'd', title: '夜勤', startDate: local(2026, 10, 24, 22), endDate: local(2026, 10, 25, 6), allDay: false });
    expect(event).toMatchObject({ start: '2026-10-24', end: '2026-10-25' });
  });

  it('separates occurrences of a repeating event', () => {
    const first = toCalendarEvent({ id: 'r', title: '定例', startDate: local(2026, 10, 5, 9), endDate: local(2026, 10, 5, 10), allDay: false });
    const second = toCalendarEvent({ id: 'r', title: '定例', startDate: local(2026, 10, 12, 9), endDate: local(2026, 10, 12, 10), allDay: false });
    expect(first.id).not.toBe(second.id);
  });
});
