import { useMemo } from 'react';

import { addDays, DateKey, DAY_REMINDER_DAYS, NotificationPlan, planDayReminders } from '../engine';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

/** その日の予定の通知（今日から7日分）。カレンダーとこのアプリの予定の両方から作る */
export function useDayReminders(k: Karenda, today: DateKey): NotificationPlan[] {
  const until = addDays(today, DAY_REMINDER_DAYS - 1);
  const events = useEvents(k.calendar, k.access, today, until, k.manualEvents, k.resumed);
  return useMemo(() => planDayReminders(events, today), [events, today]);
}
