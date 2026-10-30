import { termOf } from './risk';

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
