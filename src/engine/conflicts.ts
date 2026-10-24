import { addDays, DateKey, fromDateKey } from './date';
import { classifyRisk, DEFAULT_KEYWORDS, Risk, RiskKeywords } from './risk';
import { ZoneDay, ZoneMap } from './zones';

export type CalendarEvent = {
  id: string;
  title: string;
  start: DateKey;
  /** 最終日（その日を含む） */
  end: DateKey;
  allDay: boolean;
};

export type AlertLevel = 'red' | 'yellow';

export type ConflictAlert = {
  eventId: string;
  title: string;
  /** いちばん重い判定になった日 */
  date: DateKey;
  level: AlertLevel;
  zone: ZoneDay['zone'];
  risk: Risk;
  message: string;
};

/** PMS期の中リスク予定は、同じ週（月〜日）にこの件数以上あるときだけ知らせる */
const BUSY_WEEK_COUNT = 3;

function weekStart(day: DateKey): DateKey {
  return addDays(day, -((fromDateKey(day).getDay() + 6) % 7));
}

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function judge(zone: ZoneDay, risk: Risk, busyWeek: boolean): AlertLevel | null {
  if (zone.zone === 'heavy') return risk === 'high' ? 'red' : risk === 'medium' ? 'yellow' : null;
  if (risk === 'high') return 'yellow';
  return risk === 'medium' && busyWeek ? 'yellow' : null;
}

function message(title: string, zone: ZoneDay, risk: Risk): string {
  if (zone.zone === 'heavy') {
    const period = zone.periodDay ? `生理${zone.periodDay}日目` : '生理の時期';
    return risk === 'high'
      ? `「${title}」は${period}と重なる見込みです。移動や持ち物の準備を前倒しするか、日程の調整を考えてみませんか。`
      : `「${title}」は${period}と重なる見込みです。無理のないペースで、鎮痛剤や着替えの準備をしておくと安心です。`;
  }
  return risk === 'high'
    ? `「${title}」はPMSで集中力が落ちやすい時期です。準備は${monthDay(addDays(zone.windowStart, -1))}までに終わらせておくのがおすすめです。`
    : `この週は予定が多めです。PMSの時期なので、詰め込みすぎていないか見直してみませんか。`;
}

export function detectConflicts(
  events: CalendarEvent[],
  zones: ZoneMap,
  keywords: RiskKeywords = DEFAULT_KEYWORDS,
): ConflictAlert[] {
  const risks = new Map(events.map((event) => [event.id, classifyRisk(event, keywords)]));

  const mediumPerWeek = new Map<DateKey, number>();
  for (const event of events) {
    if (risks.get(event.id) !== 'medium') continue;
    const week = weekStart(event.start);
    mediumPerWeek.set(week, (mediumPerWeek.get(week) ?? 0) + 1);
  }

  const alerts: ConflictAlert[] = [];
  for (const event of events) {
    const risk = risks.get(event.id)!;
    if (risk === 'low') continue;

    let found: ConflictAlert | null = null;
    for (let day = event.start; day <= event.end; day = addDays(day, 1)) {
      const zone = zones.get(day);
      if (!zone) continue;
      const busyWeek = (mediumPerWeek.get(weekStart(day)) ?? 0) >= BUSY_WEEK_COUNT;
      const level = judge(zone, risk, busyWeek);
      if (!level || (found && (found.level === 'red' || level === 'yellow'))) continue;
      found = { eventId: event.id, title: event.title, date: day, level, zone: zone.zone, risk, message: message(event.title, zone, risk) };
    }
    if (found) alerts.push(found);
  }

  return alerts.sort((a, b) => (a.level === b.level ? a.date.localeCompare(b.date) : a.level === 'red' ? -1 : 1));
}
