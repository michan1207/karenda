# ui_rules: 画面と表示（src/ui）

## 構成
- `App.tsx` が3タブ（calendar / alerts / settings）＋初回は `OnboardingScreen`。Expo Router は使っていない（AGENTS.md の Router 節は当てはまらない）
- 共有状態は `useKarenda`（DB・許可・設定）。予定は `useEvents`、今後30日の警告は `useUpcomingAlerts`、通知の予約は `useNotificationSync`
- 部品は `components.tsx`（Card / PillHeading / Heart / AlertMark / Notice / Button / Section）。日付表示・ゾーン名は `format.ts`（`dayTitle`, `zoneLabel`）

## 色（theme.ts の `useColors()`、ライト/ダーク両対応）
- 生理ヘビー期のセル背景 `heavy`（淡いピンク）、PMS警戒期 `pms`（淡いパープル）
- 警告は `alertStrong`（くすみブルー）/ `alertMild`、カードの地は `alertStrongSoft` / `alertMildSoft`。削除は `danger`。強調 `accent`
- 色を直書きせず、必ず `useColors()` のトークンを使う。新しい色はライトとダーク両方に足す
- 文字は `components.tsx` の `Text` を使う（react-native の `Text` は直接使わない）。丸ゴシック Zen Maru Gothic を同梱し、太さ600/700はBold書体に切り替わる。入力欄は `fontFamily: fonts.regular`
- 2026-10-29 v1.3.0 パステル: 画面の地はグラデーション（`backdrop`）、見出しは `Ribbon`、上部に `Decorations`、女の子 `MascotSays`（`assets/mascot.png`、仮の絵）。値は AMIEL_DESIGN_SYSTEM.md §3.5
- 見た目はAmicuna流（2026-10-29）: カード状のものは `Card`（白・角丸16・プラム色の影）、見出しは `PillHeading`（ハート付きカプセル）、予定と重なる印は `AlertMark`（⚠絵文字は使わない）
- 値と役割の仕様は `AMIEL_DESIGN_SYSTEM.md`（2026-10-27決定: アイコンのローズ`#c44c74`=ブランド色、しっかり注意=くすみブルー`#4a5ead`（女性が好む・幅広い世代向けの色として選定。朱色・ミント・そらいろ等は見送り）、削除ボタンは`danger`（赤のまま）。実装は同書§9の順）

## 表示ルール
- 衝突のある日・予定には `AlertMark`（しっかり注意＝塗りの丸、少し注意＝枠の丸）。詳細に警告メッセージを alertStrong/alertMild で表示
- 予測には「（予測）」を付ける。医療的な断定をしない
- カレンダーで選んだ日の時期に応じ、詳細の下に「心の変化・関係する病名」カード（文言は `moodNotes.ts`、「と言われています」「目安」＋受診の提案）
- 警告は「ダメ出し」ではなくやさしい提案。閉じた警告は `dismissed_alerts` に保存
- 読み上げ用に `accessibilityLabel` を付ける（日付・ゾーン・重なりの有無）

## テスト
- `App.test.tsx` で偽の `loadDatabase` / `calendar` / `notifier` / `today` を渡して画面を検証
