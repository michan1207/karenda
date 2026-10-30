import { DateKey, diffDays } from './date';
import type { Answer, ReviewPhase } from './learning';
import { DEFAULT_ZONE_SETTINGS, ZoneSettings } from './zones';

/** 「どうだった？」の答え1件（答えないは入れない） */
export type ReviewAnswer = { date: DateKey; answer: Answer; phase: ReviewPhase };

/** default は記録がたまるまでの7日前、auto は記録から推定、manual は自分で決めた日数 */
export type PmsSource = 'default' | 'auto' | 'manual';

/** PMS 警戒期を生理予定日の何日前からにするか */
export type PmsEstimate = {
  daysBefore: number;
  source: PmsSource;
  /** 体調の答えから PMS の始まりが読めた周期の数 */
  observations: number;
  /** daysBefore を使い始めた日。この日より前に始まっていた帯は before の日数のまま描く */
  appliedFrom: DateKey | null;
  before: number | null;
};

export const DEFAULT_PMS: PmsEstimate = {
  daysBefore: DEFAULT_ZONE_SETTINGS.pmsDays,
  source: 'default',
  observations: 0,
  appliedFrom: null,
  before: null,
};

/** 推定に使う周期の数。これだけそろうまでは既定の7日前のまま */
export const PMS_CYCLES = 6;
/** 周期ごとの始まりのばらつき（標準偏差）がこれより大きいと推定しない */
const MAX_SPREAD = 2;
const MIN_DAYS = 3;
const MAX_DAYS = 14;

/**
 * 生理開始日ごとに、直前14日の答えを開始日に近い順に見て、「きつかった」が途切れずに続いた一番遠い日をその周期の始まりとみなす。
 * 最近の6周期がそろい、ばらつきが2日以内のときだけ日数を返す
 */
export function estimatePmsDays(answers: ReviewAnswer[], starts: DateKey[]): { daysBefore: number | null; observations: number } {
  const onsets = starts.flatMap((start) => {
    const near = answers
      .filter((a) => a.phase !== 'period')
      .map((a) => ({ answer: a.answer, before: diffDays(a.date, start) }))
      .filter(({ before }) => before >= 1 && before <= MAX_DAYS)
      .sort((a, b) => a.before - b.before);
    let onset = 0;
    for (const { answer, before } of near) {
      if (answer !== 'hard') break;
      onset = before;
    }
    return onset ? [onset] : [];
  });
  const recent = onsets.slice(-PMS_CYCLES);
  if (recent.length < PMS_CYCLES) return { daysBefore: null, observations: onsets.length };
  const mean = recent.reduce((sum, days) => sum + days, 0) / recent.length;
  const sd = Math.sqrt(recent.reduce((sum, days) => sum + (days - mean) ** 2, 0) / recent.length);
  const daysBefore = sd <= MAX_SPREAD ? Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(mean))) : null;
  return { daysBefore, observations: onsets.length };
}

/** 記録を反映した PMS の日数。手動の時は変えない。日数が変わる時は今日から使う */
export function nextPmsEstimate(current: PmsEstimate, answers: ReviewAnswer[], starts: DateKey[], today: DateKey): PmsEstimate {
  const { daysBefore: learned, observations } = estimatePmsDays(answers, starts);
  if (current.source === 'manual') return { ...current, observations };
  const daysBefore = learned ?? DEFAULT_PMS.daysBefore;
  const source = learned === null ? 'default' : 'auto';
  if (daysBefore === current.daysBefore) return { ...current, source, observations };
  return { daysBefore, source, observations, appliedFrom: today, before: current.daysBefore };
}

/** 予測の帯を描くための設定。PMS の日数は推定（または手動）のもの */
export const pmsZoneSettings = (settings: ZoneSettings, pms: PmsEstimate): ZoneSettings => ({
  heavyDays: settings.heavyDays,
  pmsDays: pms.daysBefore,
  ...(pms.appliedFrom && pms.before !== null ? { pmsBefore: { until: pms.appliedFrom, days: pms.before } } : {}),
});
