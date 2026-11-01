import { Action, planActions, searchRange } from './actions';
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
  /** 今日。生理が遅れている間の日を見る・過ぎた日を別の日として勧めない */
  today: DateKey;
};

export type Guard = {
  prediction: CyclePrediction | null;
  zones: ZoneMap;
  alerts: ConflictAlert[];
  /** お知らせへの対処（別の日・決める目安・準備・断りの文）。使う時に作り、同じお知らせは作り直さない */
  actionsOf: (alert: ConflictAlert) => Action[];
};

/** 記録・設定・予定から、表示する期間のゾーンと警告、その対処をまとめて出す。画面と通知はここだけを入り口にする */
export function computeGuard({ starts, settings, keywords, events, range, today }: GuardInput): Guard {
  const prediction = predictCycle(starts);
  const zones: ZoneMap = prediction ? buildZones(prediction, range, settings, starts, today) : new Map();
  const made = new Map<ConflictAlert, Action[]>();
  const actionsOf = (alert: ConflictAlert): Action[] => {
    let actions = made.get(alert);
    if (!actions) {
      // 別の日を探すので、表示する期間の外も、予定の前後の時期を作る
      const around: ZoneMap = prediction ? buildZones(prediction, searchRange(alert.event), settings, starts, today) : new Map();
      actions = planActions({ alert, zones: around, keywords, today });
      made.set(alert, actions);
    }
    return actions;
  };
  return { prediction, zones, alerts: detectConflicts(events, zones, keywords, prediction), actionsOf };
}
