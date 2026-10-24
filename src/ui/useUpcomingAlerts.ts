import { useMemo } from 'react';

import { addDays, computeGuard, ConflictAlert, DateKey, expandToWeeks } from '../engine';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

export const UPCOMING_DAYS = 30;

/** 今日から30日間の警告（閉じたものも含む） */
export function useUpcomingAlerts(k: Karenda, today: DateKey): ConflictAlert[] {
  const last = addDays(today, UPCOMING_DAYS);
  const range = useMemo(() => expandToWeeks(today, last), [today, last]);
  const events = useEvents(k.calendar, k.access, range.from, range.until);

  return useMemo(
    () =>
      computeGuard({ starts: k.starts, settings: k.settings, keywords: k.keywords, events, range }).alerts.filter(
        (alert) => alert.date >= today && alert.date <= last,
      ),
    [k.starts, k.settings, k.keywords, events, range, today, last],
  );
}
