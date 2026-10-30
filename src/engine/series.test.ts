import type { CalendarEvent } from './conflicts';
import { groupSeries } from './series';

const ev = (id: string, title: string, start: string, end = start, allDay = false): CalendarEvent => ({
  id,
  title,
  start,
  end,
  allDay,
});

describe('groupSeries', () => {
  it('joins events with the same title on consecutive days into one', () => {
    const groups = groupSeries([ev('a', '大阪出張', '2026-10-26'), ev('b', '大阪出張', '2026-10-25'), ev('c', '大阪出張', '2026-10-27')]);
    expect(groups).toEqual([
      { id: 'b', title: '大阪出張', start: '2026-10-25', end: '2026-10-27', allDay: false, memberIds: ['b', 'a', 'c'] },
    ]);
  });

  it('keeps an event that already spans several days as it is', () => {
    const trip = ev('t', '家族旅行', '2026-10-14', '2026-10-17', true);
    expect(groupSeries([trip])).toEqual([trip]);
  });

  it('does not join events across a gap, or with different titles', () => {
    const groups = groupSeries([ev('a', '旅行', '2026-10-14'), ev('b', '旅行', '2026-10-20'), ev('c', '会議', '2026-10-15')]);
    expect(groups.map((g) => g.id)).toEqual(['a', 'c', 'b']);
  });

  it('treats full-width and half-width titles alike', () => {
    const groups = groupSeries([ev('a', 'ＴＤＬ旅行', '2026-10-14', '2026-10-14', true), ev('b', 'TDL旅行', '2026-10-15', '2026-10-15', true)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ start: '2026-10-14', end: '2026-10-15', allDay: true });
  });
});
