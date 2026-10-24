# workflow: 自走の手順

## コマンド
- `npm run check`（型・lint・テスト）。CI（`.github/workflows/ci.yml`）も同じ内容
- `npx expo start`（iPhoneのExpo GoでQRを読む）

## ライブラリを足す時
- Expo Go に入っているモジュールだけ使う。追加は `npx expo install`（ネットが無ければ `node_modules/expo/bundledNativeModules.json` の版で `npm install`）
- 通信しないことを確かめ、`src/dependencies.test.ts` に追記（`src/noNetwork.test.ts` とESLintが通信を検出する）
- Expo API は SDK ごとに変わる。使う前に `AGENTS.md` の手順で v58 のドキュメントを確認

## 進め方
1. `claude/<目的>` ブランチを切る
2. engine はテストを先に書く
3. `npm run check` を通す
4. コミット → push → PR（本文: 目的 / 変更点 / iPhoneでの確認方法）
5. CI が赤なら直して再push。テストを消したり飛ばしたりしない
6. マージはオーナーが iPhone で確認してから
