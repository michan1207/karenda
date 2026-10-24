# karenda

生理・PMS周期と予定の衝突を端末内だけで知らせるiPhoneアプリ（Expo SDK 58 + TypeScript）。
オーナーはコードを書かない。実装・テスト・PR作成までClaudeが自走し、オーナーはiPhone（Expo Go）で確認してマージする。

## 守ること
- 外部通信をしない。サーバー・分析・広告SDKを入れない（ESLintと `src/noNetwork.test.ts` が検出する）。ライブラリを足すときは通信しないことを確かめて `src/dependencies.test.ts` に追記
- Expo Goで動くモジュールだけ使う。追加は `npx expo install`（ネットが無ければ `node_modules/expo/bundledNativeModules.json` の版で `npm install`）
- 判定ロジックは `src/engine` に純粋関数で置き、画面から分ける。テストを先に書く
- 日付は `src/engine/date.ts` の `DateKey`（"YYYY-MM-DD"）で扱う
- 表の変更は `src/data/migrations.ts` に追記するだけ（既存の手順は書き換えない）。テストは `createTestDatabase()`（Node内蔵SQLite）で行う
- 医療的な断定をしない（「予測」「目安」）
- 1PR=1目的。`npm run check` が通らないPRは出さない

## 構成
- `src/engine` 判定ロジック / `src/data` 端末内保存・カレンダー読み取り / `src/ui` 画面（`useKarenda` が共有状態、`App.tsx` がタブ）
- Expo APIはSDKで変わる。詳細は `AGENTS.md`
- アプリ名は「体調ガード」、IDは `com.michan1207.karenda`。プライバシーポリシーとサポートページは `docs/`（GitHub Pages）

## コマンド
- `npm run check`（型・lint・テスト）
- `npx expo start`（iPhoneのExpo GoでQRを読む）
