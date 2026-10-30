# architecture: 端末内データとOS連携（src/data）

## 層
- `src/engine` 判定ロジック（純粋関数・Expo非依存）→ `src/data` 保存とOS連携 → `src/ui` 画面
- 画面は `src/data/index.ts` と `src/engine/index.ts` の公開口からだけ import する

## SQLite（expo-sqlite、`karenda.db`）
- 開く: `openKarendaDatabase()`（`open.ts`、1回だけ開いて `migrate` する）
- 表: `period_starts(start)` / `settings(key,value)` / `keywords(word,level: high|medium)` / `dismissed_alerts(event_id,date)`
- `settings` のキー: `zone`（JSON: heavyDays, pmsDays）, `onboarded`（'1'）, `notify`（'1'/'0'）, `review_asked`（'1'）
- 表の変更は `migrations.ts` の `MIGRATIONS` 配列に関数を足すだけ。既存の要素は書き換えない。版は `PRAGMA user_version`
- 読み書きは `store.ts` の関数に集める（export/全削除もここ）
- 書き出したファイルの読み込みは `readExport`（外から来た中身なので形と値をすべて検査し、理由 broken/notCocomia/newer を返す）→ `restoreData(db, data, 'replace'|'keepMine'|'preferFile')`（1トランザクション。閉じた警告・案内済み・通知の設定は触らない）
- テストは `createTestDatabase()`（`testDatabase.ts`、Node内蔵SQLite）

## カレンダー（expo-calendar）
- Expo Go では新APIが使えないので `expo-calendar/legacy` の読み取り関数だけ使う（`calendar.ts`）
- 読むだけ。予定の書き込みはしない
- Android: expo-calendar は読み取りでも READ_CALENDAR と WRITE_CALENDAR の両方を要求・確認する。`blockedPermissions` で WRITE を塞ぐと常に「許可なし」になる（10-28修正）
- `toCalendarEvent`: IDは `元ID@開始日`（繰り返し予定の区別）。0時ちょうど終わりは前日までに丸める
- `CalendarSource` 型で差し替え可能（画面テストは偽物を渡す）

## 通知（expo-notifications）
- ローカル通知のみ（`notifier.ts`）。`replaceAll` で全取消→再予約。毎朝 `NOTIFY_HOUR`=9時
- `Notifier` 型で差し替え可能

## レビュー依頼（expo-store-review）
- 開始日が3つそろい最新日を記録した直後に1回だけ（`shouldAskReview`）。`ReviewPrompt` 型で差し替え可能

## 日付
- すべて `DateKey`（"YYYY-MM-DD"、`src/engine/date.ts`）。`Date` は境界でだけ使う
