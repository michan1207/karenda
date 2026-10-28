# guardrails: 衝突判定の規則（src/engine）

入口は `computeGuard({starts, settings, keywords, events, range})`（`guard.ts`）→ `{prediction, zones, alerts}`

## 周期予測（cycle.ts）
- 直近6周期の平均。15〜45日以外の間隔は除外（記録漏れ扱い）
- 有効な周期が2未満なら28日±2日の仮予測（`provisional: true`）
- n回目の予測は `predictedPeriod`。ずれ幅は直近のmin/maxで固定（先に行くほど広げない）

## 警戒ゾーン（zones.ts）
- 既定 `heavyDays=3`（1〜7）, `pmsDays=7`（0〜14）。`validateZoneSettings` で検査
- heavy: 記録済み開始日から heavyDays 日 + 予測の earliest〜(latest+heavyDays-1)
- pms: (earliest − pmsDays) 〜 latest の前日。heavy が優先
- 含まれない日は「通常/回復期」で警告対象外

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

## パートナーに伝える（partner.ts）
- お知らせタブのボタン→ `Share.share` の共有メニューだけで送る（LINE SDK・URL・通信は入れない）
- 短い話し言葉の一言（2026-10-28 オーナー決定）。今がヘビー期なら「いま生理中だよ」＋いつまでか、それ以外は次のヘビー期。末尾に「予測なので前後するかも」。予定・記録の中身は入れない
- 言い方は8つ（生理／女の子の日／体調をぼかす／月のもの／あの日／お月さまの日／HPひくめ／おやすみモード。ぼかす・HPひくめ・おやすみは生理と書かない）。送る時に毎回選び、見本をその場で見せる（保存しない）。締めの一言も5つから選ぶ（気にかけて＝既定／やさしくして／ありがとう／ゆっくり過ごす／見守って）。最後の「予測なので前後するかも」は必ず付ける。見本は入力欄で、送る前に自由に書き換えられる（選び直すと見本に戻る）

## 変更するとき
- テストを先に書く（`*.test.ts` が同じ場所にある）。Expo を import しない
