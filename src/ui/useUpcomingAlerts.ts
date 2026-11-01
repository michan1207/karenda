import { useMemo } from 'react';

import { addDays, computeGuard, ConflictAlert, DateKey, expandToWeeks, Guard } from '../engine';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

export const UPCOMING_DAYS = 30;

export type UpcomingAlerts = { alerts: ConflictAlert[]; actionsOf: Guard['actionsOf'] };

/** 今日から30日間の警告（閉じたものも含む）と、その対処 */
export function useUpcomingAlerts(k: Karenda, today: DateKey): UpcomingAlerts {
  const last = addDays(today, UPCOMING_DAYS);
  const range = useMemo(() => expandToWeeks(today, last), [today, last]);
  const events = useEvents(k.calendar, k.access, range.from, range.until, k.manualEvents, k.resumed);

  return useMemo(() => {
    const guard = computeGuard({ starts: k.starts, settings: k.settings, keywords: k.keywords, events, range, today });
    return { alerts: guard.alerts.filter((alert) => alert.date >= today && alert.date <= last), actionsOf: guard.actionsOf };
  }, [k.starts, k.settings, k.keywords, events, range, today, last]);
}
