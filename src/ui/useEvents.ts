import { useEffect, useState } from 'react';

import type { CalendarSource } from '../data';
import type { CalendarEvent, DateKey } from '../engine';
import type { Access } from './useKarenda';

/** 許可されているときだけ、期間内の予定を読み込む */
export function useEvents(calendar: CalendarSource, access: Access, from: DateKey, until: DateKey): CalendarEvent[] {
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

  return access === 'granted' ? events : [];
}
