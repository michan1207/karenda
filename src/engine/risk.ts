import type { Weight } from './learning';

export type Risk = 'high' | 'medium' | 'low';

export type RiskKeywords = {
  high: string[];
  medium: string[];
  /** 予定のあとの答えや設定で決まった、予定の名前（termOf）ごとの重さ。言葉より優先する */
  learned?: ReadonlyMap<string, Weight>;
};

/** 予定の名前に入る言葉ごとの性質 */
export type EventTrait = {
  /** 既定のキーワードとしての重さ（設定で直せる。直した後は keywords の表が使われる） */
  weight?: 'high' | 'medium';
  /** 終日なら移動や泊まりを伴う予定 */
  mobility?: true;
  /** 日をずらせない（fixed）／ずらしやすい（moveable）。無ければ「準備で軽くできる」として、別の日は勧めない */
  impact?: 'fixed' | 'moveable';
  /** 何日前までに決めれば間に合うか。無ければ3日前 */
  leadDays?: number;
};

/**
 * 予定の言葉の名簿。言葉を足す・直す時は、ここの1行だけを変える。
 * 並びは設定に出る既定のキーワードの並び（重い→ふつう）
 */
const EVENT_TRAITS: Record<string, EventTrait> = {
  出張: { weight: 'high', mobility: true, leadDays: 3 },
  プレゼン: { weight: 'high' },
  発表: { weight: 'high' },
  面接: { weight: 'high', impact: 'fixed', leadDays: 2 },
  旅行: { weight: 'high', mobility: true, impact: 'moveable', leadDays: 7 },
  ライブ: { weight: 'high' },
  遠征: { weight: 'high', mobility: true, leadDays: 3 },
  夜勤: { weight: 'high', impact: 'fixed' },
  締め切り: { weight: 'high', impact: 'fixed' },
  締切: { weight: 'high', impact: 'fixed' },
  試験: { weight: 'high', impact: 'fixed', leadDays: 2 },
  会議: { weight: 'medium', impact: 'moveable', leadDays: 1 },
  打ち合わせ: { weight: 'medium', impact: 'moveable', leadDays: 1 },
  打合せ: { weight: 'medium', impact: 'moveable', leadDays: 1 },
  ミーティング: { weight: 'medium', impact: 'moveable', leadDays: 1 },
  飲み会: { weight: 'medium', impact: 'moveable' },
  美容院: { weight: 'medium', impact: 'moveable' },
  残業: { weight: 'medium' },
  ワンオペ: { weight: 'medium' },
  帰省: { mobility: true, impact: 'moveable', leadDays: 7 },
  合宿: { mobility: true },
  結婚式: { impact: 'fixed' },
  葬儀: { impact: 'fixed' },
  本番: { impact: 'fixed' },
  ランチ: { impact: 'moveable' },
  買い物: { impact: 'moveable' },
  女子会: { impact: 'moveable' },
  デート: { impact: 'moveable' },
};

const wordsOf = (weight: EventTrait['weight']) => Object.keys(EVENT_TRAITS).filter((word) => EVENT_TRAITS[word].weight === weight);

export const DEFAULT_KEYWORDS: RiskKeywords = { high: wordsOf('high'), medium: wordsOf('medium') };

/** 予定の名前に入っている言葉の性質（名簿の並び順） */
export const traitsOf = (title: string): EventTrait[] => {
  const normalized = normalizeTitle(title);
  return Object.keys(EVENT_TRAITS)
    .filter((word) => normalized.includes(word))
    .map((word) => EVENT_TRAITS[word]);
};

export type RiskInput = { title: string; allDay: boolean; weight?: Weight };

// 全角・半角や大文字・小文字の違いで取りこぼさないようにそろえる
export const normalizeTitle = (text: string) => text.normalize('NFKC').toLowerCase();

/** 重さを覚える単位。予定の名前全体から空白も除く（繰り返し予定は同じ名前になる） */
export const termOf = (title: string) => normalizeTitle(title).replace(/\s/g, '');

// 終日でも休みの予定は重くしない。off は office などに当たらないよう単語で見る。
// 祝日は特別扱いしない（2026-10-31 オーナー決定: 祝日も終日ならほかの終日の予定と同じく重い）
const DAY_OFF = /有給|休暇|代休|休み|\boff\b/;

/** 終日のお休みの予定（有給・休暇・代休・休み・OFF）。ふだんは重くしないが、生理ヘビー期と重なる日だけ重い予定として見る（conflicts.ts） */
export const isDayOff = (event: RiskInput) => event.allDay && DAY_OFF.test(normalizeTitle(event.title));

export function classifyRisk(event: RiskInput, keywords: RiskKeywords = DEFAULT_KEYWORDS): Risk {
  if (event.weight) return event.weight === 'heavy' ? 'high' : 'medium';
  const learned = keywords.learned?.get(termOf(event.title));
  if (learned) return learned === 'heavy' ? 'high' : 'medium';
  const title = normalizeTitle(event.title);
  if (event.allDay && !DAY_OFF.test(title)) return 'high';
  const matches = (words: string[]) => words.some((word) => word.trim() && title.includes(normalizeTitle(word.trim())));
  if (matches(keywords.high)) return 'high';
  if (matches(keywords.medium)) return 'medium';
  return 'low';
}
