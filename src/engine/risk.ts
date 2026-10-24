export type Risk = 'high' | 'medium' | 'low';

export type RiskKeywords = { high: string[]; medium: string[] };

export const DEFAULT_KEYWORDS: RiskKeywords = {
  high: ['出張', 'プレゼン', '発表', '面接', '旅行', 'ライブ', '遠征', '夜勤', '締め切り', '締切', '試験'],
  medium: ['会議', '打ち合わせ', '打合せ', 'ミーティング', '飲み会', '美容院', '残業', 'ワンオペ'],
};

export type RiskInput = { title: string; allDay: boolean };

// 全角・半角や大文字・小文字の違いで取りこぼさないようにそろえる
const normalize = (text: string) => text.normalize('NFKC').toLowerCase();

export function classifyRisk(event: RiskInput, keywords: RiskKeywords = DEFAULT_KEYWORDS): Risk {
  if (event.allDay) return 'high';
  const title = normalize(event.title);
  const matches = (words: string[]) => words.some((word) => word.trim() && title.includes(normalize(word.trim())));
  if (matches(keywords.high)) return 'high';
  if (matches(keywords.medium)) return 'medium';
  return 'low';
}
