// Expo Go では新しい expo-calendar API が使えないため、legacy の読み取り用関数だけを使う
import {
  EntityTypes,
  getCalendarPermissionsAsync,
  getCalendarsAsync,
  getEventsAsync,
  requestCalendarPermissionsAsync,
} from 'expo-calendar/legacy';

import type { CalendarEvent } from '../engine/conflicts';
import { addDays, DateKey, fromDateKey, toDateKey } from '../engine/date';

/** 予定の読み取り口。画面のテストでは偽物に差し替える */
export type CalendarSource = {
  requestAccess(): Promise<boolean>;
  /** 確認画面を出さずに、いまの許可だけを返す */
  hasAccess(): Promise<boolean>;
  getEvents(from: DateKey, until: DateKey): Promise<CalendarEvent[]>;
};

export type RawEvent = {
  id: string;
  title: string;
  startDate: string | Date;
  endDate: string | Date;
  allDay: boolean;
};

const isUtcMidnight = (date: Date) => date.getTime() % 86_400_000 === 0;
const utcDateKey = (date: Date) => toDateKey(new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export function toCalendarEvent(raw: RawEvent): CalendarEvent {
  const start = new Date(raw.startDate);
  const end = new Date(raw.endDate);
  // Android は終日予定を UTC の0時で持つ（日本では9時〜翌日9時になり、1日長く見える）ので、UTC の日付で読む。
  // iPhone の終日予定はその土地の0時なので、そのまま読む
  const dayOf = raw.allDay && isUtcMidnight(start) && isUtcMidnight(end) ? utcDateKey : toDateKey;
  const startKey = dayOf(start);
  // 終わりがちょうど0時の予定（終日予定や24時まで）は、その日を含めない
  const endKey = dayOf(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  return {
    // 繰り返し予定は回ごとに同じIDになるので、開始日を足して区別する
    id: `${raw.id}@${startKey}`,
    title: raw.title ?? '',
    start: startKey,
    end: endKey,
    allDay: raw.allDay,
    // 朝早い・長い予定を見分けるため、時刻のある予定だけ開始時刻と長さを持つ
    ...(raw.allDay
      ? {}
      : {
          startMinutes: start.getHours() * 60 + start.getMinutes(),
          durationMinutes: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)),
        }),
  };
}

export const deviceCalendar: CalendarSource = {
  async requestAccess() {
    const { granted } = await requestCalendarPermissionsAsync();
    return granted;
  },
  async hasAccess() {
    return (await getCalendarPermissionsAsync()).granted;
  },
  async getEvents(from, until) {
    const calendars = await getCalendarsAsync(EntityTypes.EVENT);
    if (calendars.length === 0) return [];
    const events = await getEventsAsync(
      calendars.map((calendar) => calendar.id),
      fromDateKey(from),
      fromDateKey(addDays(until, 1)),
    );
    return events.map((event) => toCalendarEvent(event)).filter((event) => event.end >= from && event.start <= until);
  },
};
