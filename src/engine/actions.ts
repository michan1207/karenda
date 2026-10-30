import { CalendarEvent, ConflictAlert, Impact, scoreOn } from './conflicts';
import { predictCycle } from './cycle';
import { addDays, DateKey, diffDays, fromDateKey } from './date';
import { classifyRisk, DEFAULT_KEYWORDS, normalizeTitle, RiskKeywords } from './risk';
import { AFTER_PERIOD_DAYS, buildZones, periodPhase, ZoneMap, ZoneSettings } from './zones';

/** ぶつかりへの対処。画面のカードと、あとで通知に使う */
export type Action =
  | { kind: 'suggestAltDate'; date: DateKey; score: number }
  | { kind: 'deadline'; resolveBy: DateKey; text: string }
  | { kind: 'prepTask'; text: string; done: boolean }
  | { kind: 'declineTemplate'; text: string };

/** 別の日を探す範囲（前後の日数）と、出す数 */
const SEARCH_DAYS = 14;
const MAX_ALT_DATES = 3;
/** 予定の種類ごとに、何日前までに決めれば間に合うか */
const LEAD_TIMES: [string[], number][] = [
  [['旅行', '帰省'], 7],
  [['出張', '遠征'], 3],
  [['面接', '試験'], 2],
  [['会議', '打ち合わせ', '打合せ', 'ミーティング'], 1],
];
const DEFAULT_LEAD = 3;

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function leadDays(title: string): number {
  const normalized = normalizeTitle(title);
  return LEAD_TIMES.find(([words]) => words.some((word) => normalized.includes(word)))?.[1] ?? DEFAULT_LEAD;
}

const DEADLINE_TEXT: Record<Impact, (day: string) => string> = {
  moveable: (day) => `${day}までに日程を決めると、動かしやすいです`,
  mitigable: (day) => `${day}までに準備を始めておくと安心です`,
  fixed: (day) => `${day}までに準備を終えておくと安心です`,
};

/** 生理の時期でも、終わりごろでもない日 */
const isCalm = (day: DateKey, zones: ZoneMap) => !zones.has(day) && periodPhase(day, zones) !== 'after';

function prepTasks(alert: ConflictAlert, zones: ZoneMap): string[] {
  const zone = zones.get(alert.date);
  const tasks: string[] = [];
  if (alert.reasons.includes('allDayMobility')) tasks.push('移動の時間にゆとりを持たせる');
  if (zone?.zone === 'pms') tasks.push(`準備を${monthDay(addDays(zone.windowStart, -1))}までに終わらせる`);
  else if (zone?.zone === 'heavy') tasks.push('鎮痛剤や着替えを用意しておく');
  else tasks.push('前後の予定をゆるめにする');
  tasks.push('前の日は早めに休む');
  return tasks;
}

/**
 * ぶつかりへの対処を出す。動かせない予定には別の日を勧めず、準備だけにする。
 * 別の日は、予定の全部の日が落ち着いている時期だけから、近い順に選ぶ（今日より前は出さない）。
 */
export function planActions({
  alert,
  event,
  starts,
  settings,
  keywords = DEFAULT_KEYWORDS,
  today,
}: {
  alert: ConflictAlert;
  event: CalendarEvent;
  starts: DateKey[];
  settings: ZoneSettings;
  keywords?: RiskKeywords;
  today: DateKey;
}): Action[] {
  const prediction = predictCycle(starts);
  // 探す範囲の外は「落ち着いている」と取り違えないよう、ここで広めに時期を作り直す
  const range = { from: addDays(event.start, -SEARCH_DAYS - AFTER_PERIOD_DAYS), until: addDays(event.end, SEARCH_DAYS) };
  const zones: ZoneMap = prediction ? buildZones(prediction, range, settings, starts) : new Map();
  const actions: Action[] = [];

  if (alert.impact === 'moveable') {
    const length = diffDays(event.start, event.end) + 1;
    const risk = classifyRisk(event, keywords);
    const candidates: { start: DateKey; shift: number; score: number }[] = [];
    for (let shift = -SEARCH_DAYS; shift <= SEARCH_DAYS; shift++) {
      const start = addDays(event.start, shift);
      if (shift === 0 || start < today) continue;
      const days = Array.from({ length }, (_, i) => addDays(start, i));
      if (!days.every((day) => isCalm(day, zones))) continue;
      const moved = { ...event, start, end: days[days.length - 1] };
      candidates.push({ start, shift, score: Math.max(...days.map((day) => scoreOn(moved, day, risk, zones))) });
    }
    candidates.sort((a, b) => Math.abs(a.shift) - Math.abs(b.shift) || a.start.localeCompare(b.start));
    for (const { start, score } of candidates.slice(0, MAX_ALT_DATES)) actions.push({ kind: 'suggestAltDate', date: start, score });
  }

  const resolveBy = addDays(alert.date, -leadDays(event.title));
  actions.push({ kind: 'deadline', resolveBy, text: DEADLINE_TEXT[alert.impact](monthDay(resolveBy)) });
  for (const text of prepTasks(alert, zones)) actions.push({ kind: 'prepTask', text, done: false });

  if (alert.impact !== 'fixed') {
    // 相手に送る文なので、体調や生理のことは書かない
    const alt = actions.find((action) => action.kind === 'suggestAltDate');
    const ask = alt ? `${monthDay(alt.date)}ごろに変えていただくことはできますか？` : '別の日に変えていただくことはできますか？';
    actions.push({ kind: 'declineTemplate', text: `申し訳ありません、その日は都合が悪くなってしまいました。${ask}` });
  }
  return actions;
}
