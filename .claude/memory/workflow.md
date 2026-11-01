# workflow: 自走の手順

## コマンド
- `npm run check`（型・lint・テスト）。CI（`.github/workflows/ci.yml`）も同じ内容
- `npx expo start`（iPhoneのExpo GoでQRを読む）
- Android の Expo Go ではこのアプリは起動しない（expo-notifications の一部 ExpoTopicSubscriptionModule が SDK 53 から Android の Expo Go に入っていない。2026-10-31 エミュレーターで確認）。Android の画面を確かめるには開発ビルド（`npx expo run:android`）か EAS のビルドを使う。エミュレーターは AVD `Medium_Phone_API_36.1`。USB で実機がつながっていることがあるので、adb は必ず `-s emulator-5554` を付ける
- テストはチリの時間帯で動く（`jest.timezone.js`。夏時間の切り替えで0時が無い日がある）。今の判定結果は `src/engine/regression.test.ts` に固定してあり、判定を変える時はここも意図して書き換える

## ライブラリを足す時
- Expo Go に入っているモジュールだけ使う。追加は `npx expo install`（ネットが無ければ `node_modules/expo/bundledNativeModules.json` の版で `npm install`）
- ネイティブの `expo-*` は `node_modules/expo/bundledNativeModules.json` の版に**固定**する（`npx expo install` はネットの最新を入れることがある）。新しすぎると iOS が起動直後に「DYLD Symbol missing」で落ちる（2026-10-29 expo-font 58.0.11）。`src/dependencies.test.ts` で検査
- 通信しないことを確かめ、`src/dependencies.test.ts` に追記（`src/noNetwork.test.ts` とESLintが通信を検出する）
- Expo API は SDK ごとに変わる。使う前に `AGENTS.md` の手順で v58 のドキュメントを確認

## 進め方
1. `claude/<目的>` ブランチを切る
2. engine はテストを先に書く
3. `npm run check` を通す
4. コミット → push → PR（本文: 目的 / 変更点 / iPhoneでの確認方法）
5. CI が赤なら直して再push。テストを消したり飛ばしたりしない
6. マージはオーナーが iPhone で確認してから
