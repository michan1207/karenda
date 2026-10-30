import type { CalendarEvent } from './conflicts';
import { addDays } from './date';
import { normalizeTitle } from './risk';

/**
 * 同じ名前の予定が日をあけずに続く時（出張を1日ずつ入れている等）は、ひとつの予定にまとめる。
 * 名前が違う予定はまとめない。取り違えると、お知らせを信じてもらえなくなるため
 */
export function groupSeries(events: CalendarEvent[]): CalendarEvent[] {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const groups: CalendarEvent[] = [];
  for (const event of sorted) {
    const index = groups.findIndex(
      (group) => normalizeTitle(group.title) === normalizeTitle(event.title) && event.start <= addDays(group.end, 1),
    );
    if (index < 0) {
      groups.push(event);
      continue;
    }
    const group = groups[index];
    groups[index] = {
      ...group,
      end: event.end > group.end ? event.end : group.end,
      allDay: group.allDay && event.allDay,
      memberIds: [...(group.memberIds ?? [group.id]), event.id],
    };
  }
  return groups;
}
