# ui_rules: 画面と表示（src/ui）

## 構成
- `App.tsx` が3タブ（calendar / alerts / settings）＋初回は `OnboardingScreen`。Expo Router は使っていない（AGENTS.md の Router 節は当てはまらない）
- 共有状態は `useKarenda`（DB・許可・設定）。予定は `useEvents`、今後30日の警告は `useUpcomingAlerts`、通知の予約は `useNotificationSync`
- 部品は `components.tsx`（Card / PillHeading / Heart / AlertMark / Notice / Button / Section）。日付表示・ゾーン名は `format.ts`（`dayTitle`, `zoneLabel`）

## 色（theme.ts の `useColors()`、ライト/ダーク両対応）
- 生理ヘビー期のセル背景 `heavy`（淡いピンク）、PMS警戒期 `pms`（淡いパープル）。予測の幅のはし（periodDay の無い予測のヘビー期）は `heavyEdge`（もっと淡いピンク、凡例「生理かもしれない日」）
- 警告は `alertStrong`（くすみブルー）/ `alertMild`、カードの地は `alertStrongSoft` / `alertMildSoft`。削除は `danger`。強調 `accent`
- 色を直書きせず、必ず `useColors()` のトークンを使う。新しい色はライトとダーク両方に足す
- 文字は `components.tsx` の `Text` を使う（react-native の `Text` は直接使わない）。丸ゴシック Zen Maru Gothic を同梱し、太さ600/700はBold書体に切り替わる。入力欄は `fontFamily: fonts.regular`
- 2026-10-29 v1.3.0 パステル: 画面の地はグラデーション（`backdrop`）、見出しは `Ribbon`、上部に `Decorations`、案内役のクマ「ミア」`MascotSays`（`assets/mascot.png`＝アイコンの絵を丸く切り出したもの。名前は `MASCOT_NAME`）。値は AMIEL_DESIGN_SYSTEM.md §3.5
- 見た目はAmicuna流（2026-10-29）: カード状のものは `Card`（白・角丸16・プラム色の影）、見出しは `PillHeading`（ハート付きカプセル）、予定と重なる印は `AlertMark`（⚠絵文字は使わない）
- 値と役割の仕様は `AMIEL_DESIGN_SYSTEM.md`（2026-10-27決定: アイコンのローズ`#c44c74`=ブランド色、しっかり注意=くすみブルー`#4a5ead`（女性が好む・幅広い世代向けの色として選定。朱色・ミント・そらいろ等は見送り）、削除ボタンは`danger`（赤のまま）。実装は同書§9の順）

## 表示ルール
- 衝突のある日・予定には `AlertMark`（しっかり注意＝塗りの丸、少し注意＝枠の丸）。詳細に警告メッセージを alertStrong/alertMild で表示
- 予測には「（予測）」を付ける。医療的な断定をしない
- 予測の日を選ぶと、詳細に「次の生理は◯/◯〜◯/◯ごろ（確信度：高/中/低）」と根拠の1行（`format.ts` の `predictionLines`）
- カレンダーで選んだ日の時期に応じ、詳細の下に「心の変化・関係する病名」カード（文言は `moodNotes.ts`、「と言われています」「目安」＋受診の提案）
- お知らせのカード（AlertsScreen の AlertCard、2026-10-30）: A 要注意/B 注意・理由の1行・注記・動かせるか・期限・「ずらすなら：」・準備・「断りの文を送る」（Share）・「確認した」・何をしたか（ずらした/準備した/断った/そのまま迎えた）
- 一覧は対応済みを外し、確認済みは「確認済み」と出して残す。タブの数と通知は未確認だけ。カレンダーの詳細にも同じ A/B を出す
- ミアの口調は「段取り係＋少しのやさしさ」で、短く、やさしい言い回し（18文字以内、「〜しようね」「〜かな？」「〜大丈夫だよ」。「しよっ」「ちゃお」のような縮めた言い方はしない。頭は「生理のころかな。」のように短く、「今日は」は付けない。2026-10-30 オーナー決定）。一言は `CalendarScreen.tsx` の `MASCOT_LINES`（PMS・生理・生理のあと・ふつうの日ごとに8つ、日付で順番に変える）。「無理しないで」「つらいね」などのなぐさめだけの言葉は使わない
- 読み上げ用に `accessibilityLabel` を付ける（日付・ゾーン・重なりの有無）

## 今月の要注意（CalendarScreen の DigestCard、engine の monthlyDigest）
- カレンダーのいちばん上。表示中の月の A/B（対応済みを除く、点数の高い順）上位3件と件数・未確認の数。今月なら「今月」、ほかの月は「◯月」
- 行を押すとその日を開く。「お知らせで対処する」でお知らせタブへ。0件の今月は「今月、重なる予定はありません」と「来月を見る」
- 記録が無い時・カレンダーの許可が無い時・隠すモードの時は出さない

## 今月のふりかえり（AlertsScreen の ReflectionCard、engine の monthlyReflection）
- お知らせタブのいちばん下。今月（端末の日付）に対応済みにした数を、ずらした/準備した/断った/そのまま迎えた ごとに出し、「段取りできた予定」（そのまま迎えた以外）を目立たせる。責める言い方はしない

## 隠すモード（カレンダー右上の「かくす／みせる」、settings の `hide`）
- オンの時は `HIDDEN`（予測・ゾーン・警告なし）で描く。ミア・凡例・時期名・予測の2行・重なりの説明・記録ボタン・心の変化・注意書きを出さず、予定だけ見せる
- 通知は隠すモードと関係なく、いつも生理・PMSの言葉を出さない（guardrails の通知ルール）

## PMS の日数（設定の「気をつける時期」、2026-10-31）
- 「自動（推定）／手動で指定」を選ぶ。自動は「PMS は生理予定日のN日前から（あなたの記録から推定／記録がたまるまでの目安）」と根拠1行（過去6周期の体調評価から推定、またはそろった周期の数）。手動の時だけ日数の±を出す

## バックアップ（BackupPanel.tsx、設定の「データ」）
- 「暗号化して書き出す」: パスワード8文字以上を2回（12文字以上で「強い」）→ 共有メニュー。ファイル名 `cocomia-backup-YYYY-MM-DD.json`
- 「ファイルから戻す」: 選ぶ → 鍵つきならパスワード → 件数と期間を見せてから、足す（設定は今のまま／ファイルのもの）か置き換えるかを選ぶ

## テスト
- `App.test.tsx` で偽の `loadDatabase` / `calendar` / `notifier` / `today` を渡して画面を検証
