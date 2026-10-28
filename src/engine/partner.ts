import { predictCycle } from './cycle';
import { addDays, DateKey, fromDateKey } from './date';
import { buildZones, ZoneSettings } from './zones';

// 本人がパートナーに送る文なので、話し言葉でやわらかく。予測であることは最後に必ず添える
const PREDICTION = '（Cocomiaの予測なので、前後するかも）';
// 周期は長くても45日なので、この先までに次のヘビー期が必ず入る
const LOOKAHEAD_DAYS = 60;

/** 生理の言い方。soft / lowHp / rest は生理のことを書かない */
export type PartnerWording = 'period' | 'girlsDay' | 'soft' | 'monthly' | 'thatDay' | 'moon' | 'lowHp' | 'rest';

const WORDINGS: Record<PartnerWording, { now: string; next: (span: string) => string }> = {
  period: { now: 'いま生理中だよ🌙', next: (span) => `次の生理は${span}ごろの予定だよ🌙` },
  girlsDay: { now: 'いま女の子の日だよ🌙', next: (span) => `次の女の子の日は${span}ごろの予定だよ🌙` },
  soft: { now: 'いま体調がゆらぎやすい時期だよ🌙', next: (span) => `次は${span}ごろ、ちょっと体調がゆらぎそう🌙` },
  monthly: { now: 'いま月のもの中だよ🌙', next: (span) => `次の月のものは${span}ごろの予定だよ🌙` },
  thatDay: { now: 'いまあの日だよ🌙', next: (span) => `次のあの日は${span}ごろの予定だよ🌙` },
  moon: { now: 'いまお月さまの日だよ🌙', next: (span) => `次のお月さまの日は${span}ごろの予定だよ🌙` },
  lowHp: { now: 'いまHPひくめモードだよ🥺', next: (span) => `次は${span}ごろ、HPひくめモードになりそう🥺` },
  rest: { now: 'いまおやすみモードだよ🧸', next: (span) => `次は${span}ごろ、おやすみモードになりそう🧸` },
};

/** 締めの一言 */
export type PartnerClosing = 'care' | 'gentle' | 'thanks' | 'slow' | 'watch';

const CLOSINGS: Record<PartnerClosing, string> = {
  care: 'ちょっと気にかけてくれたらうれしいな☺️',
  gentle: 'やさしくしてくれたらうれしいな🍵',
  thanks: 'いつもありがとう。よろしくね🍵',
  slow: 'ゆっくりめに過ごすね🍵',
  watch: 'そっと見守ってくれたら助かるな🌿',
};

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function span(from: DateKey, to: DateKey): string {
  if (from === to) return monthDay(from);
  const sameMonth = fromDateKey(from).getMonth() === fromDateKey(to).getMonth();
  return `${monthDay(from)}〜${sameMonth ? `${fromDateKey(to).getDate()}日` : monthDay(to)}`;
}

/**
 * パートナーに送る短い文。今がヘビー期ならいつまでか、そうでなければ次のヘビー期を伝える。
 * 予定や記録の中身は入れない。記録が無いときは null。
 */
export function partnerMessage(
  starts: DateKey[],
  settings: ZoneSettings,
  today: DateKey,
  wording: PartnerWording,
  closing: PartnerClosing,
): string | null {
  const prediction = predictCycle(starts);
  if (!prediction) return null;

  const last = addDays(today, LOOKAHEAD_DAYS);
  const zones = buildZones(prediction, { from: today, until: last }, settings);
  const isHeavy = (day: DateKey) => zones.get(day)?.zone === 'heavy';

  let start = today;
  while (start <= last && !isHeavy(start)) start = addDays(start, 1);
  if (start > last) return null;
  let end = start;
  while (isHeavy(addDays(end, 1))) end = addDays(end, 1);

  const words = WORDINGS[wording];
  const tail = `${CLOSINGS[closing]}\n${PREDICTION}`;
  if (start === today) return `${words.now}\n${monthDay(end)}ごろまで、ちょっとしんどいかも。\n${tail}`;
  const before = settings.pmsDays > 0 ? 'その前の数日は、ゆらぎやすいかも。\n' : '';
  return `${words.next(span(start, end))}\n${before}${tail}`;
}
