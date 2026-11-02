# architecture: 端末内データとOS連携（src/data）

## 層
- `src/engine` 判定ロジック（純粋関数・Expo非依存）→ `src/data` 保存とOS連携 → `src/ui` 画面
- 画面は `src/data/index.ts` と `src/engine/index.ts` の公開口からだけ import する

## SQLite（expo-sqlite、`karenda.db`）
- 開く: `openKarendaDatabase()`（`open.ts`、1回だけ開いて `migrate` する）
- 表: `period_starts(start)` / `settings(key,value)` / `keywords(word,level: high|medium)` / `conflict_states(event_id,date,state,resolution,updated_at)`（版2。2026-10-30 に dismissed_alerts を「確認済み」として移した）
- `settings` のキー: `zone`（JSON: heavyDays, pmsDays）, `onboarded`（'1'）, `notify`（'1'/'0'）, `review_asked`（'1'）, `hide`（隠すモード）, `lock`（アプリのロック）
- settings 表の読み書きは `settings.ts` だけ（2026-11-01 B4。前は store.ts に同じ形のSQLが21本）。はい／いいえの項目は `FLAGS`（鍵と行が無い時の値）1つの表と getFlag/setFlag で、外へは今までの名前（isOnboarded・setHideMode など）で出す。壊れた値でもアプリが開けるよう、zone は無い・壊れている・範囲の外なら既定（3日・7日前）、pms は壊れている・日数が0〜14の外なら無い時と同じに読む。はい／いいえは既定が「はい」なら '0' の時だけ「いいえ」
- 利用状況の記録（版3の `metric_events(name, props, occurred_at)`、settings の `metrics`。はじめはオン）: `recordMetric` はオフなら何もしない。props に予定の名前・日付・本文は入れない。全削除で消える。外には送らない
- 覚えた予定の重さ（版4の `title_weights(term, label, weight, source, observations, lean, updated_at)`）: `listTitleWeights` / `saveTitleWeight` / `removeTitleWeight`。`loadState` が決まったものだけ `keywords.learned` に入れる。全削除で消える。バックアップに入る（2026-11-01）
- 「どうだった？」の答え（版5の `event_reviews(event_id, date, phase, answer, answered_at)`、answer NULL＝答えない）: `answerReview` が1トランザクションで残して学ぶ（同じ予定は最初の1回だけ）。`loadState` の `reviewed`。全削除で消える
- PMS の日数の決め方（settings の `pms` 行、PmsEstimate の JSON）: `loadState` が毎回 `nextPmsEstimate` で計算し直し、変われば保存。`loadState().settings` は推定を反映した帯用の設定、手動の日数は zone の pmsDays（書き出しに入る）。`pms` 行が無い時は zone の pmsDays が7なら自動、それ以外は手動。バックアップを設定ごと戻すと `pms` 行を消す
- 予測の当たり具合（版6の `prediction_records(based_on PK, predicted_start, earliest, latest, confidence, actual_start, abs_error_days)`）: `loadState` が毎回、まだ比べていない予測を今の予測に合わせる（幅が過ぎていたら残さない）。画面からの記録は `recordPeriodStart`（いちばん新しい開始日なら直前の予測と1回だけ比べる。復元は `addPeriodStart` で比べない）。比べた行は upsert の WHERE で書き換えない。`removePeriodStart` はその日から出した予測を消し、その日と比べた予測を待ちに戻す。全削除で消える。バックアップに入る（2026-11-01）
- 受診の目安カードを閉じた月: settings の `consult_dismissed`（YYYY-MM）。`loadState` の `consultDismissed`。全削除で消える
- カレンダーの「今はしない」: settings の `calendar_skipped`。そのあいだは起動時に許可を求めず `hasAccess` だけ見る。カレンダー画面の案内と設定の「カレンダーを使う」（`enableCalendar`）で外して許可を求める
- このアプリだけの予定（版8の `manual_events(id, title, date, weight)`、2026-10-31）: `listManualEvents` は CalendarEvent の形（id `manual:N`、`manual: true`、`weight`）。`useEvents` がカレンダーの予定（許可がある時だけ）と合わせて返すので、判定・通知・「どうだった？」は同じに動く。版9で `start_minutes`・`duration_minutes`（NULL＝時刻なし）・`color`（EVENT_COLORS、既定 blue）を足した。iPhone のカレンダーには書かない。全削除で消える。バックアップに入る（戻すと ID が変わるので、「どうだった？」の答えを新しい ID に付け直す。同じ日・名前・時刻の予定があれば足さない）
- 表を足したら `src/data/privacy.ts` の `STORED_DATA`（残しているものの名簿）にも足す。設定の「プライバシー」に出し、実際の表と一致するかテストで確かめる。「すべて削除」（`deleteAllData`）はこの名簿の表を全部空にするので、足せば消し忘れない。`backup` にバックアップに入るかを書く（書き出し→全削除→戻すテストが名簿どおりか確かめる。2026-11-01 B5）。テストの `fillEveryTable` にも1行足す
- 通信の件数（`network.ts`、2026-10-31）: `index.ts` で `watchNetwork()` が XMLHttpRequest.open と WebSocket を数える（開発中は LAN・localhost の開発用サーバーを除く）。通信のAPIに触れてよいのはこのファイルだけ（ESLint と `src/noNetwork.test.ts` の例外）
- お知らせの状態は engine の `advanceStatus`（未確認→確認済み→対応済みだけ）を通してから `saveConflictStatus` で保存。未確認は行を持たない。確認済み・対応済みは一覧と通知から外す。お知らせの状態・「今日は決めない」・「どうだった？」は予定のID（`元ID@開始日`）だけで引く（版10で表の鍵も event_id だけ。お知らせの日は予測が動くとずれ、日付も鍵にしていた頃は同じ予定が未確認に戻っていた。date 列はその時の日として残すだけ）
- お知らせへの答え（確認した／対応した／今日は決めない）は通知のボタンも画面のボタンも `applyDecision`（store.ts）1つで残す: 今の状態を読んでから1トランザクションで `advanceStatus`・`saveConflictStatus`・`deferAlert` を通す。途中で失敗したら何も残らない。状態を進めた予定があれば true（画面の「確認した」はこの時だけ数える）（2026-11-02 B6）
- 表の変更は `migrations.ts` の `MIGRATIONS` 配列に関数を足すだけ。既存の要素は書き換えない。版は `PRAGMA user_version`
- 読み書きは `store.ts` の関数に集める（export/全削除もここ）
- トランザクションは `oneTransactionAtATime`（`database.ts`）で1つずつ順番に行う（expo-sqlite の withTransactionAsync は割り込まれ、重なると片方の ROLLBACK がもう片方を消すため）。`open.ts` と `testDatabase.ts` の両方で包む。入れ子にしない（待ち続ける）。テスト用DBも BEGIN を try の中に置き、本物と同じ壊れ方にしてある（2026-10-31）
- 画面からの保存は `useKarenda` の `withDb`: 失敗しても読み直し、`saveFailed` で画面の上に「保存できませんでした」を出す（投げ返さない）。バックアップの読み込みだけは失敗を投げ返し、BackupPanel が自分で知らせる。数え上げ（metrics）は `track` で、失敗しても保存の失敗にしない
- 書き出したファイルの読み込みは `readExport`（外から来た中身なので形と値をすべて検査し、理由 broken/notCocomia/newer を返す）→ `restoreData(db, data, 'replace'|'keepMine'|'preferFile')`（1トランザクション。お知らせの状態・「今日は決めない」・案内済みは触らない。ロック・隠すモード・通知は keepMine 以外でファイルのもの）
- 2026-11-01 からバックアップは全部入り（書き出しの形の版 `EXPORT_VERSION`=1。表の版 `SCHEMA_VERSION` とは別で、書き出しの形を変えた時だけ上げる）: 生理の記録・設定・キーワードに加えて、このアプリだけの予定・覚えた重さ・「どうだった？」の答え・予測の当たり具合・ロック/隠すモード/通知（flags）。戻す時は flags も keepMine 以外でファイルのものにする。お知らせの状態と「今日は決めない」は端末の予定IDに結びつくので入れない。ファイルには schemaVersion も書く（exportVersion を知らない前のアプリが newer と言えるように）。exportVersion の無い前のファイル（版0）も読め、無い項目は空、flags は null で触らない
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
- `toCalendarEvent`: IDは `元ID@開始日`（繰り返し予定の区別）。0時ちょうど終わりは前日までに丸める
- Android の終日予定は UTC の0時〜翌日の UTC の0時で届く（expo-calendar が端末の値を UTC の文字にするため。日本では9時〜翌日9時になり1日長く見えていた）。終日で両端が UTC の0時なら UTC の日付で読む。iPhone の終日予定はその土地の0時なのでそのまま（2026-10-31）
- `CalendarSource` 型で差し替え可能（画面テストは偽物を渡す）
- アプリに戻るたびに（AppState が active、`useKarenda` の `resumed` が増える）`useEvents` が予定を読み直す。離れている間にカレンダーアプリで足した・動かした予定も、判定と通知に入る（2026-10-31）

## 通知（expo-notifications）
- ローカル通知のみ（`notifier.ts`）。毎朝 `NOTIFY_HOUR`=9時
- `replaceAll` は全取消しない。要らない予約は取り消し、先の予約は毎回予約し直す（Android は強制停止などで目覚ましを消しても予約の一覧には残すため）。時刻を過ぎてまだ出ていない予約は、出す時刻と中身の印（`data.key`）が同じなら残す。Android は通知を時刻から最大1時間遅らせる（正確な時刻の許可が無い時）ので、取り消すと戻らない（2026-11-02、7時の「今日の予定」が7時3分にアプリを開いて消えた。実機の `dumpsys alarm` で確認）
- Android の「アラームとリマインダー」（`SCHEDULE_EXACT_ALARM`、2026-11-02 オーナー決定「入れる。オンかオフかは利用者次第」）: 設定の「時刻ちょうどに知らせる」（`Notifier.exactAlarm()` が null でない時＝Android だけ）。切り替えると設定アプリを開く（オフの時は許可の画面、オンの時はアプリの情報）。開いた時・戻った時に読み、変わったら予約し直す（時刻ちょうどに出すかは予約した時の許可で決まる）。オフだと最大1時間ほど遅れる
- `replaceAll` は前の組み直しが終わってから行う（重なると古い予約が後から入るため）。1件予約できなくても残りは予約する。はじめの設定（ボタンの種類・Android の通知チャンネル）は失敗したら次の呼び出しでやり直す。通知を切った時は、端末の許可が外れていても `replaceAll([])` で消す（2026-10-31）
- `Notifier` 型で差し替え可能。`onReviewAnswer` は「どうだった？」のボタン（カテゴリ `review`）、`onDecision` は重なる予定のボタン（`decide`: 確認した/代替日を見る/今日は決めない、動かせない予定だけなら `decideFixed` で代替日なし）。起動のきっかけになった分は `getLastNotificationResponse` で拾い、受け取った側だけが消す（`listen`）
- 確認した→確認済み、今日は決めない→版7の `deferred_alerts(event_id, date, remind_on)` に翌日を予定ごとに1回だけ（INSERT OR IGNORE）、代替日を見る→`alertsRequested` が増えて App がお知らせタブを開く
- タイムゾーンが変わったら、戻った時（AppState active）に `getTimezoneOffset` の変化で予約し直す
- Android の通知（2026-11-01、Q5 のあとオーナーが「文をやわらかくする」を選んだ）: `useNotificationSync` が `quietNotifications` で題名「Cocomia からのお知らせ」、本文「予定の確認があります」／「予定のふり返りがあります」だけにし、ボタンも付けない（見ないまま「確認した」で消したり、どの予定か分からずに答えたりしないため。押すとアプリが開く）。チャンネルは `guard-public`（`lockscreenVisibility` PUBLIC。文が中身を含まないので、鍵のかかったロック画面でも「内容を非表示」にせずこの文を出す）。チャンネルの見せ方は作ったあと変えられないため、前の `guard` は起動時の設定で消して作り直す。iPhone は今までどおり（本体の設定でロック中は中身を隠す）
- その日の予定の通知（2026-11-01 オーナー決定）: `planDayReminders` が時刻のある予定すべて（カレンダーとこのアプリの予定。終日・時刻なしは除く）を、その日1件「今日の予定」「今日は10時から会議、14時30分から歯医者の予定です。」にまとめる。朝7時、8時より前に始まる予定がある日はその1時間前（`NotificationPlan.minutes`、`fireTime` が使う。無ければ9時）。今日から7日分（`useDayReminders`）。予定の名前を出す決定なので、Android でも `quietNotifications` は変えない（変えるのは review/decide のある通知だけ）。iOS の64件は、全部そろうと少し超えるが近い順に残る

## レビュー依頼（expo-store-review）
- 開始日が3つそろい最新日を記録した直後に1回だけ（`shouldAskReview`）。`ReviewPrompt` 型で差し替え可能

## 日付
- すべて `DateKey`（"YYYY-MM-DD"、`src/engine/date.ts`）。`Date` は境界でだけ使う
