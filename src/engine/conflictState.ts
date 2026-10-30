import type { DateKey } from './date';

/** お知らせの状態。未確認 → 確認済み → 対応済み の順にだけ進む */
export type ConflictState = 'unreviewed' | 'acknowledged' | 'resolved';
/** 対応済みにした時に、何をしたか。ずらした / 準備した / 断った / そのまま迎えた */
export type Resolution = 'shifted' | 'prepared' | 'declined' | 'proceeded';
export type ConflictStatus = { state: ConflictState; resolution: Resolution | null };

export const UNREVIEWED: ConflictStatus = { state: 'unreviewed', resolution: null };

const NEXT: Record<ConflictState, ConflictState | null> = {
  unreviewed: 'acknowledged',
  acknowledged: 'resolved',
  resolved: null,
};

/** 次の状態へ進める。飛ばしたり戻したりはできない。何をしたかは対応済みにする時だけ付ける */
export function advanceStatus(current: ConflictStatus, to: ConflictState, resolution: Resolution | null = null): ConflictStatus {
  if (NEXT[current.state] !== to) throw new Error(`Cannot go from ${current.state} to ${to}`);
  if ((to === 'resolved') !== (resolution !== null)) throw new Error('A resolution is needed exactly when resolving');
  return { state: to, resolution };
}

export const statusKey = (eventId: string, date: DateKey) => `${eventId}|${date}`;

/** 保存されていないお知らせは未確認 */
export const statusOf = (statuses: Map<string, ConflictStatus>, eventId: string, date: DateKey): ConflictStatus =>
  statuses.get(statusKey(eventId, date)) ?? UNREVIEWED;
