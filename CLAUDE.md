# karenda（Cocomia）カーネル

生理・PMS周期と予定の衝突を端末内だけで知らせるiPhoneアプリ（Expo SDK 58 + TypeScript）。
オーナーはコードを書かない。実装→テスト→コミット→PR作成までClaudeが自走し、オーナーはiPhone（Expo Go）で確認してマージする。

## 絶対に守ること
- 外部通信をしない（サーバー・分析・広告SDKを入れない）
- 医療的な断定をしない（「予測」「目安」）
- 1PR=1目的。`npm run check` が通らないPRは出さない
- 言い切る前に実物を見る。原因・完了の報告には未確認の行を、オーナーへの手順には「違う画面なら教えて」の行を入れる

## 必要な時だけ読む（全部は読まない）
| いつ | 読むファイル |
|---|---|
| DB・保存・カレンダー/通知の読み書き、`src/data` を触る時 | `.claude/memory/architecture.md` |
| リスク判定・警戒ゾーン・警告・通知の規則、`src/engine` を触る時 | `.claude/memory/guardrails.md` |
| 画面・色・文言、`src/ui` を触る時 | `.claude/memory/ui_rules.md` |
| ライブラリ追加・テスト・ブランチ/PRの手順 | `.claude/memory/workflow.md` |
| ストア提出・EAS・`docs/` の公開ページ | `.claude/memory/release.md` |
| スキルやプラグインを起動する前、調査・図・スライドを頼まれた時 | `.claude/memory/tools.md` |
| 状態・原因・仕様・完了を言い切る時、オーナーに手順を書く時、メモリーに書く時 | `.claude/memory/facts.md` |

コードもメモリーもまず Grep で場所を特定し、必要な範囲だけ読む。新しく決まったことは該当メモリーに1行で追記する。
