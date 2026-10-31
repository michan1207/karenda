import { CalendarEvent, CyclePrediction, DateKey, fromDateKey, PredictedPeriod, ZoneDay } from '../engine';

export const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

export function dayTitle(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[(date.getDay() + 6) % 7]}）`;
}

export function fullDate(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function zoneLabel(zone: ZoneDay | undefined): string {
  if (!zone) return '通常';
  if (zone.zone === 'pms') return 'PMSの時期（予測）';
  const name = zone.periodDay ? `生理${zone.periodDay}日目` : '生理の時期';
  return zone.predicted ? `${name}（予測）` : name;
}

const CONFIDENCE = { high: '高', medium: '中', low: '低' } as const;

/** 0時からの分を「9:05」の形に */
export const clock = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

/** 時刻のある予定の「10:00〜11:30」。時刻が無ければ null */
export function timeRange({ startMinutes, durationMinutes }: CalendarEvent): string | null {
  if (startMinutes === undefined) return null;
  return `${clock(startMinutes)}〜${durationMinutes ? clock(Math.min(startMinutes + durationMinutes, 24 * 60)) : ''}`;
}

export const shortDate = (day: DateKey) => {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};

/** 予測の幅と確信度、その根拠の2行。幅が広い時は言い切らず、余裕を持つよう促す */
export function predictionLines(prediction: CyclePrediction, period: PredictedPeriod): [string, string] {
  const window = `次の生理は${shortDate(period.earliest)}〜${shortDate(period.latest)}ごろ（確信度：${CONFIDENCE[prediction.confidence]}）`;
  if (prediction.provisional) return [window, '記録がまだ少ないため、28日周期を仮定した目安です。'];
  if (prediction.confidence === 'low') {
    return [window, `直近${prediction.cyclesUsed}周期のばらつきが大きく、幅が広めです。予定は余裕をもって組んでください。`];
  }
  return [window, `直近${prediction.cyclesUsed}周期のばらつきから計算した目安です。`];
}
