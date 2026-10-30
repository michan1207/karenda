import { useEffect, useMemo, useState } from 'react';

import type { CalendarSource } from '../data';
import type { CalendarEvent, DateKey } from '../engine';
import type { Access } from './useKarenda';

/** 期間内の予定。カレンダーは許可されているときだけ読み、このアプリの中だけに入れた予定はいつも足す */
export function useEvents(
  calendar: CalendarSource,
  access: Access,
  from: DateKey,
  until: DateKey,
  manual: CalendarEvent[],
): CalendarEvent[] {
  const [events, setEvents] = useState<CalendarEvent[]>([]);

  useEffect(() => {
    if (access !== 'granted') return;
    let active = true;
    calendar
      .getEvents(from, until)
      .then((loaded) => active && setEvents(loaded))
      .catch(() => active && setEvents([]));
    return () => {
      active = false;
    };
  }, [calendar, access, from, until]);

  return useMemo(
    () => [...(access === 'granted' ? events : []), ...manual.filter((event) => event.end >= from && event.start <= until)],
    [access, events, manual, from, until],
  );
}
