import type { DateKey } from './date';

/** 2周期ぶん（開始日3つ）そろい、いちばん新しい開始日を記録した直後だけレビューをお願いする。過去の記録の入力中は頼まない */
export function shouldAskReview(starts: DateKey[], added: DateKey): boolean {
  return starts.length >= 3 && starts.every((start) => start <= added);
}
