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
import { normalizeTitle } from '../engine/risk';

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

// iPhone の「日本の祝日」や Google の祝日カレンダー
const isHolidayCalendar = (title: string | undefined) => /祝日|holiday/.test(normalizeTitle(title ?? ''));

export function toCalendarEvent(raw: RawEvent, holiday = false): CalendarEvent {
  const start = new Date(raw.startDate);
  const end = new Date(raw.endDate);
  const startKey = toDateKey(start);
  // 終わりがちょうど0時の予定（終日予定や24時まで）は、その日を含めない
  const endKey = toDateKey(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  return {
    // 繰り返し予定は回ごとに同じIDになるので、開始日を足して区別する
    id: `${raw.id}@${startKey}`,
    title: raw.title ?? '',
    start: startKey,
    end: endKey,
    allDay: raw.allDay,
    ...(holiday ? { holiday } : {}),
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
    const holidays = new Set(calendars.filter((calendar) => isHolidayCalendar(calendar.title)).map((calendar) => calendar.id));
    return events.map((event) => toCalendarEvent(event, holidays.has(event.calendarId))).filter((event) => event.end >= from && event.start <= until);
  },
};
