import { CalendarEvent, ConflictAlert, detectConflicts } from './conflicts';
import { CyclePrediction, predictCycle } from './cycle';
import { DateKey } from './date';
import { RiskKeywords } from './risk';
import { buildZones, DateRange, ZoneMap, ZoneSettings } from './zones';

export type GuardInput = {
  starts: DateKey[];
  settings: ZoneSettings;
  keywords: RiskKeywords;
  events: CalendarEvent[];
  range: DateRange;
};

export type Guard = {
  prediction: CyclePrediction | null;
  zones: ZoneMap;
  alerts: ConflictAlert[];
};

/** 記録・設定・予定から、表示する期間のゾーンと警告をまとめて出す */
export function computeGuard({ starts, settings, keywords, events, range }: GuardInput): Guard {
  const prediction = predictCycle(starts);
  const zones: ZoneMap = prediction ? buildZones(prediction, range, settings) : new Map();
  return { prediction, zones, alerts: detectConflicts(events, zones, keywords) };
}
