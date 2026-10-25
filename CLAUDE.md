# karenda（Amiel）カーネル

生理・PMS周期と予定の衝突を端末内だけで知らせるiPhoneアプリ（Expo SDK 58 + TypeScript）。
オーナーはコードを書かない。実装→テスト→コミット→PR作成までClaudeが自走し、オーナーはiPhone（Expo Go）で確認してマージする。

## 絶対に守ること
- 外部通信をしない（サーバー・分析・広告SDKを入れない）
- 医療的な断定をしない（「予測」「目安」）
- 1PR=1目的。`npm run check` が通らないPRは出さない

## 必要な時だけ読む（全部は読まない）
| いつ | 読むファイル |
|---|---|
| DB・保存・カレンダー/通知の読み書き、`src/data` を触る時 | `.claude/memory/architecture.md` |
| リスク判定・警戒ゾーン・警告・通知の規則、`src/engine` を触る時 | `.claude/memory/guardrails.md` |
| 画面・色・文言、`src/ui` を触る時 | `.claude/memory/ui_rules.md` |
| ライブラリ追加・テスト・ブランチ/PRの手順 | `.claude/memory/workflow.md` |
| ストア提出・EAS・`docs/` の公開ページ | `.claude/memory/release.md` |

コードはまず Grep で場所を特定し、必要な範囲だけ読む。新しく決まったことは該当メモリーに1行で追記する。
