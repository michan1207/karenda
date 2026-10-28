import { predictCycle } from './cycle';
import { addDays, DateKey, fromDateKey } from './date';
import { buildZones, ZoneSettings } from './zones';

// 生理・PMSの言葉は入れない。LINE の通知やトーク一覧で人に見られても分からないように
const HEADER = '【Cocomia】体調に気をつけたい時期（予測）';
const FOOTER = 'アプリの予測なので、前後することがあります。';
// 期間の終わりごろに始まる時期も最後まで書けるよう、その先まで見る（1つの時期は長くても50日ほど）
const LOOKAHEAD_DAYS = 60;

function span(from: DateKey, to: DateKey): string {
  const a = fromDateKey(from);
  const b = fromDateKey(to);
  const start = `${a.getMonth() + 1}月${a.getDate()}日`;
  if (from === to) return start;
  return `${start}〜${a.getMonth() === b.getMonth() ? '' : `${b.getMonth() + 1}月`}${b.getDate()}日`;
}

/**
 * パートナーに送る文。今日から days 日のうちにかかる警戒ゾーンを、続いている日をまとめて日付だけで書く。
 * 記録が無い・該当する時期が無いときは null。
 */
export function partnerMessage(starts: DateKey[], settings: ZoneSettings, today: DateKey, days: number): string | null {
  const prediction = predictCycle(starts);
  if (!prediction) return null;

  const until = addDays(today, days);
  const last = addDays(until, LOOKAHEAD_DAYS);
  const zones = buildZones(prediction, { from: today, until: last }, settings);

  const runs: [DateKey, DateKey][] = [];
  for (let day = today; day <= last; day = addDays(day, 1)) {
    if (!zones.has(day)) continue;
    const run = runs.at(-1);
    if (run && run[1] === addDays(day, -1)) run[1] = day;
    else if (day <= until) runs.push([day, day]);
    else break;
  }
  if (runs.length === 0) return null;

  return [HEADER, ...runs.map(([from, to]) => `・${span(from, to)}ごろ`), FOOTER].join('\n');
}
