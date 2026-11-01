import { CyclePrediction, predictedPeriod } from './cycle';
import { addDays, DateKey, diffDays } from './date';

export type ZoneSettings = {
  /** 生理ヘビー期の日数（開始日を1日目とする） */
  heavyDays: number;
  /** PMS警戒期の日数（生理予定日の何日前から警戒するか） */
  pmsDays: number;
  /** 推定で日数が変わる前の日数。until より前に始まる帯はこの日数のまま描く（過去の帯を描き変えない） */
  pmsBefore?: { until: DateKey; days: number };
};

export const DEFAULT_ZONE_SETTINGS: ZoneSettings = { heavyDays: 3, pmsDays: 7 };

/** 予測の幅を過ぎても開始日の記録が無い時、遅れているだけかもしれない日として見続ける日数（2026-10-31 オーナー決定） */
export const LATE_DAYS = 14;

export type ZoneDay =
  | { zone: 'heavy'; predicted: boolean; periodDay?: number }
  | { zone: 'pms'; predicted: true; windowStart: DateKey };

/** 警戒ゾーンにあたる日だけを持つ。入っていない日は回復期・通常 */
export type ZoneMap = Map<DateKey, ZoneDay>;

export type DateRange = { from: DateKey; until: DateKey };

export function validateZoneSettings({ heavyDays, pmsDays }: ZoneSettings): void {
  if (!Number.isInteger(heavyDays) || heavyDays < 1 || heavyDays > 7) {
    throw new Error(`heavyDays must be 1-7: ${heavyDays}`);
  }
  if (!Number.isInteger(pmsDays) || pmsDays < 0 || pmsDays > 14) {
    throw new Error(`pmsDays must be 0-14: ${pmsDays}`);
  }
}

export function buildZones(
  prediction: CyclePrediction,
  range: DateRange,
  settings: ZoneSettings = DEFAULT_ZONE_SETTINGS,
  /** 記録した生理開始日。前の月を見た時もピンクにするため、最後の1件だけでなく全部塗る */
  recorded: DateKey[] = [prediction.lastStart],
  /** 渡すと、次の予測の幅を過ぎても記録が無い間、その後の LATE_DAYS 日も「生理かもしれない日」にする */
  today?: DateKey,
): ZoneMap {
  validateZoneSettings(settings);
  const { heavyDays, pmsDays, pmsBefore } = settings;
  // 前の日数でも今の日数でも、until より前に始まる帯は前の日数のまま。伸ばして過去の日が塗られることもない
  const pmsDaysFor = (earliest: DateKey) =>
    pmsBefore && addDays(earliest, -Math.max(pmsDays, pmsBefore.days)) < pmsBefore.until ? pmsBefore.days : pmsDays;

  const zones: ZoneMap = new Map();
  const inRange = (day: DateKey) => day >= range.from && day <= range.until;
  const setHeavy = (day: DateKey, value: ZoneDay) => {
    const current = zones.get(day);
    if (inRange(day) && !(current?.zone === 'heavy')) zones.set(day, value);
  };

  for (const start of recorded) {
    for (let i = 0; i < heavyDays; i++) {
      setHeavy(addDays(start, i), { zone: 'heavy', predicted: false, periodDay: i + 1 });
    }
  }

  for (let n = 1; ; n++) {
    const { expected, earliest, latest } = predictedPeriod(prediction, n);
    const windowStart = addDays(earliest, -pmsDaysFor(earliest));
    if (windowStart > range.until) break;

    for (let day = earliest; day <= addDays(latest, heavyDays - 1); day = addDays(day, 1)) {
      const periodDay = diffDays(expected, day) + 1;
      setHeavy(day, {
        zone: 'heavy',
        predicted: true,
        periodDay: periodDay >= 1 && periodDay <= heavyDays ? periodDay : undefined,
      });
    }
    for (let day = windowStart; day < latest; day = addDays(day, 1)) {
      if (inRange(day) && !zones.has(day)) zones.set(day, { zone: 'pms', predicted: true, windowStart });
    }
  }

  // 遅れている間。予測どおりの日（periodDay つき）は上で塗ったものを残し、次の PMS より優先する
  const { latest } = predictedPeriod(prediction, 1);
  if (today && today > latest) {
    for (let i = 1; i <= LATE_DAYS; i++) setHeavy(addDays(latest, i), { zone: 'heavy', predicted: true });
  }

  return zones;
}

/** ヘビー期の翌日から何日を「生理の終わりごろ〜直後」とみなすか */
export const AFTER_PERIOD_DAYS = 4;

/**
 * その日の時期。お知らせ・心の変化の目安・「どうだった？」・代わりの日・準備のすすめは、すべてこれで読む。
 * mostSevere は生理N日目の日（濃いピンク）、edge は生理かもしれない日（淡いピンク）
 */
export type Phase =
  | { kind: 'mostSevere'; periodDay: number; predicted: boolean }
  | { kind: 'edge'; predicted: true }
  | { kind: 'pms'; windowStart: DateKey; predicted: true }
  | { kind: 'after'; predicted: false }
  | { kind: 'other'; predicted: false };

/** 前の日のゾーンも見る（生理の終わりごろ）ので、zones は AFTER_PERIOD_DAYS 日前から作っておく */
export function phaseOn(day: DateKey, zones: ZoneMap): Phase {
  const zone = zones.get(day);
  if (zone?.zone === 'heavy') {
    return zone.periodDay
      ? { kind: 'mostSevere', periodDay: zone.periodDay, predicted: zone.predicted }
      : { kind: 'edge', predicted: true };
  }
  if (zone?.zone === 'pms') return { kind: 'pms', windowStart: zone.windowStart, predicted: true };
  for (let i = 1; i <= AFTER_PERIOD_DAYS; i++) {
    if (zones.get(addDays(day, -i))?.zone === 'heavy') return { kind: 'after', predicted: false };
  }
  return { kind: 'other', predicted: false };
}

/** 生理の時期（ヘビー期か、生理かもしれない日） */
export const inPeriod = (phase: Phase) => phase.kind === 'mostSevere' || phase.kind === 'edge';

export type PeriodPhase = 'before' | 'during' | 'after';

const PERIOD_PHASE: Record<Phase['kind'], PeriodPhase | undefined> = {
  mostSevere: 'during',
  edge: 'during',
  pms: 'before',
  after: 'after',
  other: undefined,
};

/** 心の変化の目安を出すための時期 */
export const periodPhase = (day: DateKey, zones: ZoneMap): PeriodPhase | undefined => PERIOD_PHASE[phaseOn(day, zones).kind];
