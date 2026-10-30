import type { CyclePrediction } from './cycle';
import { addDays, DateKey, fromDateKey } from './date';
import { classifyRisk, DEFAULT_KEYWORDS, normalizeTitle, Risk, RiskKeywords } from './risk';
import { periodPhase, ZoneMap } from './zones';

export type CalendarEvent = {
  id: string;
  title: string;
  start: DateKey;
  /** 最終日（その日を含む） */
  end: DateKey;
  allDay: boolean;
  /** 時刻のある予定の開始時刻（0時からの分） */
  startMinutes?: number;
  /** 時刻のある予定の長さ（分） */
  durationMinutes?: number;
};

/** A=要注意 / B=注意 / C=参考。C はお知らせにも通知にも出さない */
export type Grade = 'A' | 'B' | 'C';

/** 動かせる / 動かせない / 準備で軽くできる */
export type Impact = 'moveable' | 'fixed' | 'mitigable';

export type ReasonCode =
  | 'phaseMostSevere'
  | 'phasePeriodEdge'
  | 'phaseAfter'
  | 'phasePms'
  | 'allDayMobility'
  | 'earlyMorning'
  | 'longDuration'
  | 'windowWide';

export type ConflictAlert = {
  eventId: string;
  /** 対処（別の日・期限）を出すのに使う、元の予定 */
  event: CalendarEvent;
  title: string;
  /** いちばん重い判定になった日 */
  date: DateKey;
  grade: Exclude<Grade, 'C'>;
  /** 0〜100 */
  score: number;
  reasons: ReasonCode[];
  /** なぜ気をつけたいかの1行 */
  reasonText: string;
  /** 予測の幅が広くて当てにしにくい時の注記 */
  confidenceNote?: string;
  risk: Risk;
  impact: Impact;
  /** どう備えるかの提案 */
  message: string;
};

// 点数の係数。設定画面には出さず、ここでだけ変える（境目はテストで固定している）
const PHASE_SEVERITY = { mostSevere: 1.0, edge: 0.6, after: 0.6, pms: 0.7, other: 0.1 } as const;
const EVENT_WEIGHT: Record<Risk, number> = { high: 1.0, medium: 0.4, low: 0 };
const ALL_DAY_BONUS = 0.2;
const MODIFIERS = { allDayMobility: 0.15, earlyMorning: 0.05 } as const;
export const GRADE_A = 70;
export const GRADE_B = 40;
/** 移動や泊まりを伴う予定の言葉 */
const MOBILITY = ['出張', '旅行', '遠征', '帰省', '合宿'];
const EARLY_MORNING_BEFORE = 8 * 60;
const LONG_DURATION = 4 * 60;

// 日をずらせない予定と、ずらしやすい予定の言葉。どちらでもない予定は「準備で軽くできる」として、別の日は勧めない
const FIXED_WORDS = ['面接', '試験', '締め切り', '締切', '夜勤', '結婚式', '葬儀', '本番'];
const MOVEABLE_WORDS = ['会議', '打ち合わせ', '打合せ', 'ミーティング', '飲み会', '美容院', 'ランチ', '旅行', '帰省', '買い物', '女子会', 'デート'];

export function impactOf(title: string): Impact {
  const normalized = normalizeTitle(title);
  if (FIXED_WORDS.some((word) => normalized.includes(word))) return 'fixed';
  if (MOVEABLE_WORDS.some((word) => normalized.includes(word))) return 'moveable';
  return 'mitigable';
}

export function gradeOf(score: number): Grade {
  return score >= GRADE_A ? 'A' : score >= GRADE_B ? 'B' : 'C';
}

type Phase =
  | { kind: 'mostSevere'; periodDay: number; predicted: boolean }
  | { kind: 'edge'; predicted: true }
  | { kind: 'pms'; windowStart: DateKey; predicted: true }
  | { kind: 'after'; predicted: false }
  | { kind: 'other'; predicted: false };

function phaseOn(day: DateKey, zones: ZoneMap): Phase {
  const zone = zones.get(day);
  if (zone?.zone === 'heavy') {
    return zone.periodDay
      ? { kind: 'mostSevere', periodDay: zone.periodDay, predicted: zone.predicted }
      : { kind: 'edge', predicted: true };
  }
  if (zone?.zone === 'pms') return { kind: 'pms', windowStart: zone.windowStart, predicted: true };
  return { kind: periodPhase(day, zones) === 'after' ? 'after' : 'other', predicted: false };
}

const PHASE_CODE: Record<Exclude<Phase['kind'], 'other'>, ReasonCode> = {
  mostSevere: 'phaseMostSevere',
  edge: 'phasePeriodEdge',
  after: 'phaseAfter',
  pms: 'phasePms',
};

function monthDay(day: DateKey): string {
  const date = fromDateKey(day);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function phaseText(phase: Exclude<Phase, { kind: 'other' }>): string {
  if (phase.kind === 'mostSevere') return `生理${phase.periodDay}日目と重なる見込みです`;
  if (phase.kind === 'edge') return '生理の時期かもしれない日と重なります';
  if (phase.kind === 'after') return '生理の終わりごろと重なる見込みです';
  return 'PMSの時期と重なる見込みです';
}

const MODIFIER_TEXT: Partial<Record<ReasonCode, string>> = {
  allDayMobility: '終日の移動を伴う予定で、',
  earlyMorning: '朝早い予定で、',
  longDuration: '長時間の予定で、',
};

function suggestion(title: string, phase: Exclude<Phase, { kind: 'other' }>, risk: Risk): string {
  if (phase.kind === 'pms') {
    return `「${title}」はPMSで集中力が落ちやすい時期です。準備は${monthDay(addDays(phase.windowStart, -1))}までに終わらせておくのがおすすめです。`;
  }
  if (phase.kind === 'after') {
    return `「${title}」は生理の終わりごろと重なる見込みです。疲れが出やすいと言われているので、前後の予定をゆるめにしておくと安心です。`;
  }
  const period = phase.kind === 'mostSevere' ? `生理${phase.periodDay}日目` : '生理の時期';
  return risk === 'high'
    ? `「${title}」は${period}と重なる見込みです。移動や持ち物の準備を前倒しするか、日程の調整を考えてみませんか。`
    : `「${title}」は${period}と重なる見込みです。無理のないペースで、鎮痛剤や着替えの準備をしておくと安心です。`;
}

function measure(event: CalendarEvent, day: DateKey, risk: Risk, zones: ZoneMap) {
  const phase = phaseOn(day, zones);
  const modifiers: ReasonCode[] = [];
  if (event.allDay && MOBILITY.some((word) => normalizeTitle(event.title).includes(word))) modifiers.push('allDayMobility');
  if (day === event.start && event.startMinutes !== undefined && event.startMinutes < EARLY_MORNING_BEFORE) {
    modifiers.push('earlyMorning');
  }
  const weight = EVENT_WEIGHT[risk] + (event.allDay ? ALL_DAY_BONUS : 0);
  const bonus = modifiers.reduce((sum, code) => sum + (MODIFIERS as Partial<Record<ReasonCode, number>>)[code]!, 0);
  const score = Math.min(100, Math.max(0, Math.round(100 * PHASE_SEVERITY[phase.kind] * weight * (1 + bonus))));
  return { phase, modifiers, score };
}

/** その予定がこの日にあった時の点数（0〜100）。別の日を勧める時に使う */
export const scoreOn = (event: CalendarEvent, day: DateKey, risk: Risk, zones: ZoneMap) =>
  measure(event, day, risk, zones).score;

/** 1日ぶんの判定。C の日は null */
function judgeDay(
  event: CalendarEvent,
  day: DateKey,
  risk: Risk,
  zones: ZoneMap,
  prediction: CyclePrediction | null,
): ConflictAlert | null {
  const { phase, modifiers, score } = measure(event, day, risk, zones);
  if (phase.kind === 'other') return null;
  const grade = gradeOf(score);
  if (grade === 'C') return null;

  const notes: ReasonCode[] = [];
  if ((event.durationMinutes ?? 0) >= LONG_DURATION) notes.push('longDuration');
  const wide = phase.predicted && prediction?.confidence === 'low';
  if (wide) notes.push('windowWide');
  const reasons = [PHASE_CODE[phase.kind], ...modifiers, ...notes];

  return {
    eventId: event.id,
    event,
    title: event.title,
    date: day,
    grade,
    score,
    reasons,
    reasonText: `${reasons.map((code) => MODIFIER_TEXT[code] ?? '').join('')}${phaseText(phase)}。`,
    ...(wide ? { confidenceNote: '周期のばらつきが大きく、予測がずれることがあります。' } : {}),
    risk,
    impact: impactOf(event.title),
    message: suggestion(event.title, phase, risk),
  };
}

/** 予定ごとに、体調の時期と重なる日の点数を出し、A/B のものを返す。何日も続く予定は、いちばん重い日を1件だけ */
export function detectConflicts(
  events: CalendarEvent[],
  zones: ZoneMap,
  keywords: RiskKeywords = DEFAULT_KEYWORDS,
  prediction: CyclePrediction | null = null,
): ConflictAlert[] {
  const alerts: ConflictAlert[] = [];
  for (const event of events) {
    const risk = classifyRisk(event, keywords);
    if (risk === 'low') continue;
    let found: ConflictAlert | null = null;
    for (let day = event.start; day <= event.end; day = addDays(day, 1)) {
      const alert = judgeDay(event, day, risk, zones, prediction);
      if (alert && (!found || alert.score > found.score)) found = alert;
    }
    if (found) alerts.push(found);
  }
  return alerts.sort((a, b) => (a.grade === b.grade ? a.date.localeCompare(b.date) : a.grade === 'A' ? -1 : 1));
}
