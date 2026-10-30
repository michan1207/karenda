import type { Resolution } from './conflictState';
import { toDateKey } from './date';

/** 今月のふりかえり。お知らせで「何をしたか」を選んだ数 */
export type Reflection = {
  /** 'YYYY-MM' */
  month: string;
  total: number;
  /** 段取りできた数（ずらした・準備した・断った）。「そのまま迎えた」は数えない */
  actionCount: number;
  byResolution: Record<Resolution, number>;
};

const STEPS: Resolution[] = ['shifted', 'prepared', 'declined'];

/** at は保存した日時（ISO）。月は端末の日付で数える。日時の無い記録は数えない */
export function monthlyReflection(resolutions: { resolution: Resolution; at: string }[], month: string): Reflection {
  const byResolution: Record<Resolution, number> = { shifted: 0, prepared: 0, declined: 0, proceeded: 0 };
  for (const { resolution, at } of resolutions) {
    const date = new Date(at);
    if (Number.isNaN(date.getTime()) || !toDateKey(date).startsWith(`${month}-`)) continue;
    byResolution[resolution] += 1;
  }
  const total = Object.values(byResolution).reduce((sum, count) => sum + count, 0);
  const actionCount = STEPS.reduce((sum, resolution) => sum + byResolution[resolution], 0);
  return { month, total, actionCount, byResolution };
}
