import { DateKey, fromDateKey, ZoneDay } from '../engine';

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export function dayTitle(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[(date.getDay() + 6) % 7]}）`;
}

export function zoneLabel(zone: ZoneDay | undefined): string {
  if (!zone) return '通常';
  if (zone.zone === 'pms') return 'PMS警戒期（予測）';
  const name = zone.periodDay ? `生理${zone.periodDay}日目` : '生理の時期';
  return zone.predicted ? `${name}（予測）` : name;
}
