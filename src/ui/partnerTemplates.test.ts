import { PARTNER_TEMPLATES } from './partnerTemplates';

// オーナー指定の8文（guardrails.md「パートナーに伝える」）。日付や数字などの記録の中身は入れない
it("keeps the owner's eight templates in order, with no numbers in them", () => {
  expect(PARTNER_TEMPLATES.map(([, label]) => label)).toEqual([
    '省エネモード',
    '緊急速報',
    'ポンコツ化',
    'HPほぼゼロ',
    '体調重め',
    'イライラごめん',
    '予定ゆっくり',
    'マイペース',
  ]);
  for (const [body] of PARTNER_TEMPLATES) expect(body).not.toMatch(/[0-9０-９]/);
});
