import type { Weight } from './learning';

export type Risk = 'high' | 'medium' | 'low';

export type RiskKeywords = {
  high: string[];
  medium: string[];
  /** 予定のあとの答えや設定で決まった、予定の名前（termOf）ごとの重さ。言葉より優先する */
  learned?: ReadonlyMap<string, Weight>;
};

export const DEFAULT_KEYWORDS: RiskKeywords = {
  high: ['出張', 'プレゼン', '発表', '面接', '旅行', 'ライブ', '遠征', '夜勤', '締め切り', '締切', '試験'],
  medium: ['会議', '打ち合わせ', '打合せ', 'ミーティング', '飲み会', '美容院', '残業', 'ワンオペ'],
};

export type RiskInput = { title: string; allDay: boolean; holiday?: boolean };

// 全角・半角や大文字・小文字の違いで取りこぼさないようにそろえる
export const normalizeTitle = (text: string) => text.normalize('NFKC').toLowerCase();

/** 重さを覚える単位。予定の名前全体から空白も除く（繰り返し予定は同じ名前になる） */
export const termOf = (title: string) => normalizeTitle(title).replace(/\s/g, '');

// 終日でも休みの予定は重くしない。off は office などに当たらないよう単語で見る
const DAY_OFF = /有給|休暇|代休|\boff\b/;

export function classifyRisk(event: RiskInput, keywords: RiskKeywords = DEFAULT_KEYWORDS): Risk {
  const learned = keywords.learned?.get(termOf(event.title));
  if (learned) return learned === 'heavy' ? 'high' : 'medium';
  const title = normalizeTitle(event.title);
  if (event.allDay && !event.holiday && !DAY_OFF.test(title)) return 'high';
  const matches = (words: string[]) => words.some((word) => word.trim() && title.includes(normalizeTitle(word.trim())));
  if (matches(keywords.high)) return 'high';
  if (matches(keywords.medium)) return 'medium';
  return 'low';
}
