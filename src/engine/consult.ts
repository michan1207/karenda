import { MAX_PLAUSIBLE, MIN_PLAUSIBLE } from './cycle';
import { DateKey, diffDays } from './date';

/** 受診の目安カードを出すわけ。病名や状態の判断ではなく、記録の傾向だけ */
export type ConsultReason = 'highSpread' | 'frequentExclusion' | 'longCycle' | 'shortCycle';

/** 見るのは直近6回の間隔。3回そろうまでは出さない */
const CONSULT_GAPS = 6;
const MIN_GAPS = 3;
/** 15日より短い・45日より長い間隔がこれだけあると出す（1回だけなら記録の抜けのことが多い） */
const MIN_EXTREMES = 2;
/** ふつうの長さの間隔どうしで、いちばん短いのと長いのがこれだけ違うと出す */
const WIDE_RANGE = 10;

export function consultReasons(starts: DateKey[]): ConsultReason[] {
  const sorted = [...new Set(starts)].sort();
  const gaps = sorted
    .slice(1)
    .map((to, i) => diffDays(sorted[i], to))
    .slice(-CONSULT_GAPS);
  if (gaps.length < MIN_GAPS) return [];
  const short = gaps.filter((days) => days < MIN_PLAUSIBLE).length;
  const long = gaps.filter((days) => days > MAX_PLAUSIBLE).length;
  const plausible = gaps.filter((days) => days >= MIN_PLAUSIBLE && days <= MAX_PLAUSIBLE);
  const reasons: ConsultReason[] = [];
  if (plausible.length >= MIN_GAPS && Math.max(...plausible) - Math.min(...plausible) >= WIDE_RANGE) reasons.push('highSpread');
  if (short + long >= MIN_EXTREMES) {
    reasons.push('frequentExclusion');
    if (short) reasons.push('shortCycle');
    if (long) reasons.push('longCycle');
  }
  return reasons;
}

/** カードの文。病名・「可能性が高い」・強い言葉は使わず、相談は医師に任せる */
export function consultText(reasons: ConsultReason[]): string {
  const leads: string[] = [];
  if (reasons.includes('highSpread')) leads.push('周期の長さのばらつきが大きめです。');
  if (reasons.includes('frequentExclusion')) {
    const kinds = [reasons.includes('shortCycle') && '15日より短い', reasons.includes('longCycle') && '45日より長い'].filter(Boolean);
    leads.push(`最近の記録に、${kinds.join('・')}間隔が何度かあります。`);
  }
  return `${leads.join('')}記録を続けるか、婦人科に相談するという目安もあります。判断は医師にご相談ください。`;
}
