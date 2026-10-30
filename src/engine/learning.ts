import type { CalendarEvent } from './conflicts';
import { statusKey } from './conflictState';
import { addDays, DateKey } from './date';
import { classifyRisk, RiskKeywords, termOf } from './risk';
import { groupSeries } from './series';
import type { ZoneMap } from './zones';

export type Weight = 'heavy' | 'normal';
/** 予定のあとの3択。答えない（スキップ）時は learnWeight を呼ばない */
export type Answer = 'hard' | 'normal' | 'easy';
/** 予定の日が生理・PMS の時期だったか */
export type ReviewPhase = 'period' | 'pms' | 'other';

/** 予定の名前ごとに覚えた重さ */
export type TitleWeight = {
  term: string;
  /** 一覧に出す名前（最後に答えた時の予定の名前） */
  label: string;
  /** まだ決まっていない時は null（判定には使わない） */
  weight: Weight | null;
  /** user は設定で決めたもの。学習では変えない */
  source: 'learned' | 'user';
  observations: number;
  /** 重い向きは +、ふつう向きは −。同じ向きが LEARN_AFTER 回続くと重さが決まる */
  lean: number;
};

/** 1回の答えでは決めない・ひっくり返さない */
const LEARN_AFTER = 2;

export function learnWeight(entry: TitleWeight | undefined, title: string, answer: Answer, phase: ReviewPhase): TitleWeight {
  const base: TitleWeight = entry ?? { term: termOf(title), label: title, weight: null, source: 'learned', observations: 0, lean: 0 };
  if (base.source === 'user') return base;
  let lean = base.lean;
  if (answer === 'hard') lean = Math.min(Math.max(lean, 0) + 1, LEARN_AFTER);
  // 落ち着いた時期に平気だったのは、時期と関係があるか分からないので向きを変えない
  else if (phase !== 'other') lean = Math.max(Math.min(lean, 0) - 1, -LEARN_AFTER);
  const weight = lean === LEARN_AFTER ? 'heavy' : lean === -LEARN_AFTER ? 'normal' : base.weight;
  return { ...base, label: title, weight, observations: base.observations + 1, lean };
}

/** 設定で直した重さ。以後の答えでは変えない */
export const overrideWeight = (entry: TitleWeight | undefined, title: string, weight: Weight): TitleWeight => ({
  term: termOf(title),
  label: entry?.label ?? title,
  weight,
  source: 'user',
  observations: entry?.observations ?? 0,
  lean: entry?.lean ?? 0,
});

/** 予定のあとに「どうだった？」と聞く予定。重い・ふつうの予定だけ */
export type ReviewTarget = {
  eventId: string;
  title: string;
  /** 予定の最後の日。次の朝から聞く */
  date: DateKey;
  phase: ReviewPhase;
  risk: 'high' | 'medium';
};

/** 聞くのは終わってから7日まで。それより前のことは、もう覚えていないことが多い */
export const REVIEW_DAYS = 7;
/** ホームにためるのは3件まで（無限に積まない） */
export const MAX_PENDING_REVIEWS = 3;

export function reviewTargets({
  events,
  zones,
  starts,
  pmsDays,
  keywords,
}: {
  events: CalendarEvent[];
  zones: ZoneMap;
  starts: DateKey[];
  pmsDays: number;
  keywords: RiskKeywords;
}): ReviewTarget[] {
  const targets: ReviewTarget[] = [];
  for (const event of groupSeries(events)) {
    const risk = classifyRisk(event, keywords);
    if (risk === 'low') continue;
    targets.push({ eventId: event.id, title: event.title, date: event.end, phase: phaseOf(event, zones, starts, pmsDays), risk });
  }
  return targets;
}

function phaseOf(event: CalendarEvent, zones: ZoneMap, starts: DateKey[], pmsDays: number): ReviewPhase {
  let phase: ReviewPhase = 'other';
  for (let day = event.start; day <= event.end; day = addDays(day, 1)) {
    const zone = zones.get(day)?.zone;
    if (zone === 'heavy') return 'period';
    // 生理を記録すると予測が次へ移り、その前の PMS は塗られなくなるので、記録した開始日からも見る
    if (zone === 'pms' || starts.some((start) => day < start && day >= addDays(start, -pmsDays))) phase = 'pms';
  }
  return phase;
}

/** ホームで聞く分。終わった翌日から7日まで、答えていないものを新しい順に3件 */
export const pendingReviews = (targets: ReviewTarget[], reviewed: Set<string>, today: DateKey) =>
  targets
    .filter((target) => target.date < today && target.date >= addDays(today, -REVIEW_DAYS))
    .filter((target) => !reviewed.has(statusKey(target.eventId, target.date)))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_PENDING_REVIEWS);
