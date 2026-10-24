import { CyclePrediction, predictedPeriod } from './cycle';
import { addDays, DateKey, diffDays } from './date';

export type ZoneSettings = {
  /** 生理ヘビー期の日数（開始日を1日目とする） */
  heavyDays: number;
  /** PMS警戒期の日数（生理予定日の何日前から警戒するか） */
  pmsDays: number;
};

export const DEFAULT_ZONE_SETTINGS: ZoneSettings = { heavyDays: 3, pmsDays: 7 };

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
): ZoneMap {
  validateZoneSettings(settings);
  const { heavyDays, pmsDays } = settings;

  const zones: ZoneMap = new Map();
  const inRange = (day: DateKey) => day >= range.from && day <= range.until;
  const setHeavy = (day: DateKey, value: ZoneDay) => {
    const current = zones.get(day);
    if (inRange(day) && !(current?.zone === 'heavy')) zones.set(day, value);
  };

  for (let i = 0; i < heavyDays; i++) {
    setHeavy(addDays(prediction.lastStart, i), { zone: 'heavy', predicted: false, periodDay: i + 1 });
  }

  for (let n = 1; ; n++) {
    const { expected, earliest, latest } = predictedPeriod(prediction, n);
    const windowStart = addDays(earliest, -pmsDays);
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

  return zones;
}
