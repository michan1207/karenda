import { CalendarEvent, ConflictAlert, Impact, scoreOn } from './conflicts';
import { addDays, DateKey, diffDays, fromDateKey } from './date';
import { classifyRisk, DEFAULT_KEYWORDS, RiskKeywords, traitsOf } from './risk';
import { AFTER_PERIOD_DAYS, DateRange, inPeriod, phaseOn, ZoneMap } from './zones';

/** ぶつかりへの対処。画面のカードと、あとで通知に使う */
export type Action =
  | { kind: 'suggestAltDate'; date: DateKey; score: number }
  | { kind: 'deadline'; resolveBy: DateKey; text: string }
  | { kind: 'prepTask'; text: string; done: boolean }
  | { kind: 'declineTemplate'; text: string };

/** 別の日を探す範囲（前後の日数）と、出す数 */
const SEARCH_DAYS = 14;
const MAX_ALT_DATES = 3;
const DEFAULT_LEAD = 3;

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 何日前までに決めれば間に合うか。言葉が2つ入っていれば長い方（「旅行の打ち合わせ」は旅行の7日） */
function leadDays(title: string): number {
  const days = traitsOf(title).flatMap((trait) => (trait.leadDays ? [trait.leadDays] : []));
  return days.length ? Math.max(...days) : DEFAULT_LEAD;
}

const DEADLINE_TEXT: Record<Impact, (day: string) => string> = {
  moveable: (day) => `${day}までに日程を決めると、動かしやすいです`,
  mitigable: (day) => `${day}までに準備を始めておくと安心です`,
  fixed: (day) => `${day}までに準備を終えておくと安心です`,
};

/** 生理の時期でも、終わりごろでもない日 */
const isCalm = (day: DateKey, zones: ZoneMap) => phaseOn(day, zones).kind === 'other';

/** 何日も続く予定は、いちばんきつい日を軸に段取りを決める */
function seriesTask(alert: ConflictAlert): string | null {
  if (!alert.series) return null;
  const index = diffDays(alert.event.start, alert.date);
  if (index === 0) return 'いちばんきついのは初日。初日はゆっくりにして、予定は2日目以降に';
  const before = index === 1 ? '1日目' : `${index}日目まで`;
  return `いちばんきついのは${index + 1}日目。予定は${before}に寄せて、${index + 1}日目は移動や予定を少なめに`;
}

function prepTasks(alert: ConflictAlert, zones: ZoneMap, today: DateKey): string[] {
  const phase = phaseOn(alert.date, zones);
  // PMSの時期に入ってからは、過ぎた日を準備の目安にしない
  const prepBy = phase.kind === 'pms' ? addDays(phase.windowStart, -1) : null;
  const tasks: string[] = [];
  const series = seriesTask(alert);
  if (series) tasks.push(series);
  if (alert.reasons.includes('allDayMobility')) tasks.push('移動の時間にゆとりを持たせる');
  if (prepBy && prepBy >= today) tasks.push(`準備を${monthDay(prepBy)}までに終わらせる`);
  else if (inPeriod(phase)) tasks.push('鎮痛剤や着替えを用意しておく');
  else tasks.push('前後の予定をゆるめにする');
  tasks.push('前の日は早めに休む');
  return tasks;
}

/** 別の日を探すのに要る時期の範囲。予定の前後2週間と、その前の「生理の終わりごろ」を見る分 */
export const searchRange = (event: CalendarEvent): DateRange => ({
  from: addDays(event.start, -SEARCH_DAYS - AFTER_PERIOD_DAYS),
  until: addDays(event.end, SEARCH_DAYS),
});

/**
 * ぶつかりへの対処を出す。動かせない予定には別の日を勧めず、準備だけにする。
 * 別の日は、予定の全部の日が落ち着いている時期だけから、近い順に選ぶ（今日より前は出さない）。
 * zones は searchRange(alert.event) を覆っていること（範囲の外を「落ち着いている」と取り違えないため）。
 * 画面と通知は computeGuard の actionsOf から使う
 */
export function planActions({
  alert,
  zones,
  keywords = DEFAULT_KEYWORDS,
  today,
}: {
  alert: ConflictAlert;
  zones: ZoneMap;
  keywords?: RiskKeywords;
  today: DateKey;
}): Action[] {
  const { event } = alert;
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

  // 何日も続く予定は、いちばんきつい日ではなく初日までに決めないと間に合わない
  const resolveBy = addDays(event.start, -leadDays(event.title));
  actions.push({ kind: 'deadline', resolveBy, text: DEADLINE_TEXT[alert.impact](monthDay(resolveBy)) });
  for (const text of prepTasks(alert, zones, today)) actions.push({ kind: 'prepTask', text, done: false });

  if (alert.impact !== 'fixed') {
    // 相手に送る文なので、体調や生理のことは書かない
    const alt = actions.find((action) => action.kind === 'suggestAltDate');
    const ask = alt ? `${monthDay(alt.date)}ごろに変えていただくことはできますか？` : '別の日に変えていただくことはできますか？';
    actions.push({ kind: 'declineTemplate', text: `申し訳ありません、その日は都合が悪くなってしまいました。${ask}` });
  }
  return actions;
}
