# guardrails: 衝突判定の規則（src/engine）

入口は `computeGuard({starts, settings, keywords, events, range})`（`guard.ts`）→ `{prediction, zones, alerts}`

## 周期予測（cycle.ts）
- 直近6周期の平均。15〜45日以外の間隔は除外（記録漏れ扱い）し、`excluded` に理由（tooShort/tooLong）つきで返す
- 有効な周期が3未満なら28日±2日の仮予測（`provisional: true`、確信度 low）
- n回目の予測は `predictedPeriod`。幅は平均±標準偏差（`spread`、最低1日）で固定（先に行くほど広げない）
- 確信度: 周期4つ以上かつ幅4日以内→high／2つ以上かつ8日以内→medium／それ以外→low

## 警戒ゾーン（zones.ts）
- 既定 `heavyDays=3`（1〜7）, `pmsDays=7`（0〜14）。`validateZoneSettings` で検査
- heavy: 記録した開始日すべてから heavyDays 日（前の月を見ても塗る。2026-10-30）+ 予測の earliest〜(latest+heavyDays-1)
- pms: (earliest − pmsDays) 〜 latest の前日。heavy が優先
- 含まれない日は「通常/回復期」で警告対象外
- `periodPhase(day, zones)`: pms→before / heavy→during / ヘビー期の翌日から`AFTER_PERIOD_DAYS`(4)日→after。心の変化の目安表示用で、警告・通知には使わない

## 予定のリスク（risk.ts）
- 終日予定は常に high
- タイトルをNFKC＋小文字にしてキーワードを部分一致。high を先に判定
- 既定 high: 出張 プレゼン 発表 面接 旅行 ライブ 遠征 夜勤 締め切り 締切 試験
- 既定 medium: 会議 打ち合わせ 打合せ ミーティング 飲み会 美容院 残業 ワンオペ
- キーワードはユーザーが設定で編集できる（DB の `keywords`）

## 判定表（conflicts.ts）
| ゾーン | high | medium | low |
|---|---|---|---|
| heavy | red | yellow | なし |
| pms | yellow | 同じ週（月〜日）に medium が3件以上なら yellow | なし |
- 予定が複数日にまたがる時は、いちばん重い日を1件だけ出す
- 並び: red が先、同じ重さは日付順
- 文言は提案口調（「〜を考えてみませんか」）。断定しない

## 通知の予定（notifications.ts）
- red は7日前と3日前、yellow は3日前。今日より前の分は作らない
- 同じ日の通知は1件にまとめる（id `guard-YYYY-MM-DD`）
- 通知はロック画面に出るので、生理・PMS・体調の言葉を入れない（日付と予定名＋「アプリを開いて…」だけ）

## パートナーに伝える（AlertsScreen.tsx）
- お知らせタブのボタン→ `Share.share` の共有メニューだけで送る（LINE SDK・URL・通信は入れない）
- 見本はオーナー指定の8文（2026-10-28 差し替え。省エネモード／緊急速報／ポンコツ化／HPほぼゼロ／体調重め／イライラごめん／予定ゆっくり／マイペース）。日付・予測・予定・記録の中身は入れない。入力欄で自由に書き換えられ、見本を押すと元の文に戻る（保存しない）

## 変更するとき
- テストを先に書く（`*.test.ts` が同じ場所にある）。Expo を import しない
