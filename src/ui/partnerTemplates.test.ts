import { FUNNY_TEMPLATES, PARTNER_TEMPLATES, SERIOUS_TEMPLATES } from './partnerTemplates';

// 笑える・まじめの2つに分けた見本（guardrails.md「パートナーに伝える」）。日付や数字などの記録の中身は入れない
it('keeps the funny and the serious templates apart, with no numbers in them', () => {
  expect(FUNNY_TEMPLATES.map(([, label]) => label)).toEqual([
    '省エネモード',
    '緊急速報',
    'ポンコツ化',
    'HPほぼゼロ',
    '充電モード',
    'あったかいもの',
    '生理前かも',
    'イライラごめん',
  ]);
  expect(SERIOUS_TEMPLATES.map(([, label]) => label)).toEqual([
    '始まりました',
    '予定の相談',
    '体調重め',
    '予定ゆっくり',
    'マイペース',
    '家事おねがい',
    'そっとしておいて',
    'ありがとう',
    '終わったよ',
  ]);
  expect(new Set(PARTNER_TEMPLATES.map(([body]) => body)).size).toBe(PARTNER_TEMPLATES.length);
  for (const [body] of PARTNER_TEMPLATES) expect(body).not.toMatch(/[0-9０-９]/);
});
