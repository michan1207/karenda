import { useMemo } from 'react';

import { addDays, DateKey, DAY_REMINDER_DAYS, NotificationPlan, planDayReminders, planSoonReminders } from '../engine';
import { useEvents } from './useEvents';
import type { Karenda } from './useKarenda';

/**
 * 予定そのものの通知（今日から7日分）。朝の「今日の予定」と、設定がオンなら始まる30分前の分。
 * カレンダーとこのアプリの予定の両方から作る
 */
export function useEventReminders(k: Karenda, today: DateKey): NotificationPlan[] {
  const until = addDays(today, DAY_REMINDER_DAYS - 1);
  const events = useEvents(k.calendar, k.access, today, until, k.manualEvents, k.resumed);
  return useMemo(
    () => [...planDayReminders(events, today), ...(k.soonEnabled ? planSoonReminders(events, today) : [])],
    [events, today, k.soonEnabled],
  );
}
