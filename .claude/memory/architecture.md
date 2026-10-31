# architecture: 端末内データとOS連携（src/data）

## 層
- `src/engine` 判定ロジック（純粋関数・Expo非依存）→ `src/data` 保存とOS連携 → `src/ui` 画面
- 画面は `src/data/index.ts` と `src/engine/index.ts` の公開口からだけ import する

## SQLite（expo-sqlite、`karenda.db`）
- 開く: `openKarendaDatabase()`（`open.ts`、1回だけ開いて `migrate` する）
- 表: `period_starts(start)` / `settings(key,value)` / `keywords(word,level: high|medium)` / `conflict_states(event_id,date,state,resolution,updated_at)`（版2。2026-10-30 に dismissed_alerts を「確認済み」として移した）
- `settings` のキー: `zone`（JSON: heavyDays, pmsDays）, `onboarded`（'1'）, `notify`（'1'/'0'）, `review_asked`（'1'）, `hide`（隠すモード）, `lock`（アプリのロック）
- 利用状況の記録（版3の `metric_events(name, props, occurred_at)`、settings の `metrics`。はじめはオン）: `recordMetric` はオフなら何もしない。props に予定の名前・日付・本文は入れない。全削除で消える。外には送らない
- 覚えた予定の重さ（版4の `title_weights(term, label, weight, source, observations, lean, updated_at)`）: `listTitleWeights` / `saveTitleWeight` / `removeTitleWeight`。`loadState` が決まったものだけ `keywords.learned` に入れる。全削除で消える。バックアップには入れていない
- 「どうだった？」の答え（版5の `event_reviews(event_id, date, phase, answer, answered_at)`、answer NULL＝答えない）: `answerReview` が1トランザクションで残して学ぶ（同じ予定は最初の1回だけ）。`loadState` の `reviewed`。全削除で消える
- PMS の日数の決め方（settings の `pms` 行、PmsEstimate の JSON）: `loadState` が毎回 `nextPmsEstimate` で計算し直し、変われば保存。`loadState().settings` は推定を反映した帯用の設定、手動の日数は zone の pmsDays（書き出しに入る）。`pms` 行が無い時は zone の pmsDays が7なら自動、それ以外は手動。バックアップを設定ごと戻すと `pms` 行を消す
- 予測の当たり具合（版6の `prediction_records(based_on PK, predicted_start, earliest, latest, confidence, actual_start, abs_error_days)`）: `loadState` が毎回、まだ比べていない予測を今の予測に合わせる（幅が過ぎていたら残さない）。画面からの記録は `recordPeriodStart`（いちばん新しい開始日なら直前の予測と1回だけ比べる。復元は `addPeriodStart` で比べない）。比べた行は upsert の WHERE で書き換えない。`removePeriodStart` はその日から出した予測を消し、その日と比べた予測を待ちに戻す。全削除で消える。バックアップには入れていない
- 受診の目安カードを閉じた月: settings の `consult_dismissed`（YYYY-MM）。`loadState` の `consultDismissed`。全削除で消える
- カレンダーの「今はしない」: settings の `calendar_skipped`。そのあいだは起動時に許可を求めず `hasAccess` だけ見る。カレンダー画面の案内と設定の「カレンダーを使う」（`enableCalendar`）で外して許可を求める
- このアプリだけの予定（版8の `manual_events(id, title, date, weight)`、2026-10-31）: `listManualEvents` は CalendarEvent の形（id `manual:N`、`manual: true`、`weight`）。`useEvents` がカレンダーの予定（許可がある時だけ）と合わせて返すので、判定・通知・「どうだった？」は同じに動く。版9で `start_minutes`・`duration_minutes`（NULL＝時刻なし）・`color`（EVENT_COLORS、既定 blue）を足した。iPhone のカレンダーには書かない。全削除で消える。バックアップにはまだ入れていない
- 表を足したら `src/data/privacy.ts` の `STORED_DATA` にも足す（設定の「プライバシー」に出す。実際の表と一致するかテストで確かめる）
- 通信の件数（`network.ts`、2026-10-31）: `index.ts` で `watchNetwork()` が XMLHttpRequest.open と WebSocket を数える（開発中は LAN・localhost の開発用サーバーを除く）。通信のAPIに触れてよいのはこのファイルだけ（ESLint と `src/noNetwork.test.ts` の例外）
- お知らせの状態は engine の `advanceStatus`（未確認→確認済み→対応済みだけ）を通してから `saveConflictStatus` で保存。未確認は行を持たない。確認済み・対応済みは一覧と通知から外す
- 表の変更は `migrations.ts` の `MIGRATIONS` 配列に関数を足すだけ。既存の要素は書き換えない。版は `PRAGMA user_version`
- 読み書きは `store.ts` の関数に集める（export/全削除もここ）
- トランザクションは `oneTransactionAtATime`（`database.ts`）で1つずつ順番に行う（expo-sqlite の withTransactionAsync は割り込まれ、重なると片方の ROLLBACK がもう片方を消すため）。`open.ts` と `testDatabase.ts` の両方で包む。入れ子にしない（待ち続ける）。テスト用DBも BEGIN を try の中に置き、本物と同じ壊れ方にしてある（2026-10-31）
- 画面からの保存は `useKarenda` の `withDb`: 失敗しても読み直し、`saveFailed` で画面の上に「保存できませんでした」を出す（投げ返さない）。バックアップの読み込みだけは失敗を投げ返し、BackupPanel が自分で知らせる。数え上げ（metrics）は `track` で、失敗しても保存の失敗にしない
- 書き出したファイルの読み込みは `readExport`（外から来た中身なので形と値をすべて検査し、理由 broken/notCocomia/newer を返す）→ `restoreData(db, data, 'replace'|'keepMine'|'preferFile')`（1トランザクション。閉じた警告・案内済み・通知の設定は触らない）
- テストは `createTestDatabase()`（`testDatabase.ts`、Node内蔵SQLite）

## 暗号化したバックアップ（backup.ts）
- `encryptBackup(text, passphrase)` → JSON（app/kind/version/kdf/iterations/salt/nonce/ciphertext、hex）。鍵は PBKDF2-SHA256（@noble/hashes、パスワードは NFKC でそろえる）、暗号は AES-256-GCM（@noble/ciphers）、乱数だけ expo-crypto
- `openBackup(fileText, passphrase)` は例外を投げず理由を返す（broken / notCocomia / notEncrypted / newer / wrongPassphrase）。回数はその端末で約2秒かかる回数を測って決める（1万〜60万。iPhone の Expo Go で10万回が約19秒だったため。ファイルに回数を書くので古いファイルも開ける）
- @noble は ESM だけなので、Jest の `transformIgnorePatterns` に `@noble` を足してある
- ファイルの受け渡しは `BackupFiles`（`backupFiles.ts`。share=一時置き場に書いて共有メニュー→消す、pick=ファイルを選んで中身を返す→消す）。画面テストは偽物を渡す
- 平文の書き出しは廃止（2026-10-30）。鍵のかかっていない古い書き出しは、読み込みだけできる

## アプリのロック（lock.ts、expo-local-authentication）
- `Authenticator`（isAvailable=Face ID かパスコードがある / authenticate=Face ID、だめならパスコード）。settings の `lock`
- `useKarenda`: 開いた時に一度だけ本人確認を出す。background に入ったら鍵をかけ、active に戻ったら出す（Face ID の画面は inactive だけなので繰り返さない）。パスコードが外された iPhone では締め出さずに開ける
- Face ID の説明文は app.json の expo-local-authentication プラグイン（新しいビルドで反映）。Expo Go ではパスコードになることがある

## カレンダー（expo-calendar）
- Expo Go では新APIが使えないので `expo-calendar/legacy` の読み取り関数だけ使う（`calendar.ts`）
- 読むだけ。予定の書き込みはしない
- Android: expo-calendar は読み取りでも READ_CALENDAR と WRITE_CALENDAR の両方を要求・確認する。`blockedPermissions` で WRITE を塞ぐと常に「許可なし」になる（10-28修正）
- 祝日カレンダー（名前に 祝日/holiday）の予定は `holiday: true` を付ける（終日でも重くしない）
- `toCalendarEvent`: IDは `元ID@開始日`（繰り返し予定の区別）。0時ちょうど終わりは前日までに丸める
- `CalendarSource` 型で差し替え可能（画面テストは偽物を渡す）

## 通知（expo-notifications）
- ローカル通知のみ（`notifier.ts`）。`replaceAll` で全取消→再予約。毎朝 `NOTIFY_HOUR`=9時
- `Notifier` 型で差し替え可能。`onReviewAnswer` は「どうだった？」のボタン（カテゴリ `review`）、`onDecision` は重なる予定のボタン（`decide`: 確認した/代替日を見る/今日は決めない、動かせない予定だけなら `decideFixed` で代替日なし）。起動のきっかけになった分は `getLastNotificationResponse` で拾い、受け取った側だけが消す（`listen`）
- 確認した→確認済み、今日は決めない→版7の `deferred_alerts(event_id, date, remind_on)` に翌日を1回だけ（INSERT OR IGNORE）、代替日を見る→`alertsRequested` が増えて App がお知らせタブを開く
- タイムゾーンが変わったら、戻った時（AppState active）に `getTimezoneOffset` の変化で予約し直す

## レビュー依頼（expo-store-review）
- 開始日が3つそろい最新日を記録した直後に1回だけ（`shouldAskReview`）。`ReviewPrompt` 型で差し替え可能

## 日付
- すべて `DateKey`（"YYYY-MM-DD"、`src/engine/date.ts`）。`Date` は境界でだけ使う
