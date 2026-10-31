/** 仕様 F18 / §6.2: 画面・通知・ストアの文言に使わない言い方。医療の断定・言い切り・不安をあおる言葉（src/wording.test.ts で確かめる） */
export type BannedPhraseRule = {
  pattern: RegExp;
  reason: 'medicalClaim' | 'absoluteClaim' | 'fearAppeal';
  replacement: string | null;
};

export const BANNED_PHRASES: BannedPhraseRule[] = [
  { pattern: /警戒/, reason: 'fearAppeal', replacement: '目安' },
  { pattern: /警告/, reason: 'fearAppeal', replacement: 'お知らせ' },
  { pattern: /危険/, reason: 'fearAppeal', replacement: null },
  // 「PMS」だけは時期の名前として使う。言い切りと推測の言い方だけを禁止する
  { pattern: /PMSです|PMSの可能性/, reason: 'medicalClaim', replacement: 'PMSの時期（予測）' },
  { pattern: /PMDD/, reason: 'medicalClaim', replacement: null },
  { pattern: /可能性が高い/, reason: 'medicalClaim', replacement: '記録の傾向' },
  { pattern: /診断/, reason: 'medicalClaim', replacement: '医療の判断' },
  { pattern: /治療/, reason: 'medicalClaim', replacement: null },
  { pattern: /絶対/, reason: 'absoluteClaim', replacement: null },
  { pattern: /100\s*[%％]/, reason: 'absoluteClaim', replacement: null },
  { pattern: /必ず/, reason: 'absoluteClaim', replacement: null },
  { pattern: /保証/, reason: 'absoluteClaim', replacement: null },
];
