# App Store Connect に貼る内容（下書き）

App Store Connect の各画面に、そのまま貼れる形にしています。主な言語は「日本語」です。

## アプリ情報

| 項目 | 内容 |
| --- | --- |
| 名前（30文字まで） | Cocomia - 体調と予定のカレンダー |
| サブタイトル（30文字まで） | 広告なし｜生理・PMSと大事な予定の重なりを先回り |
| バンドルID | com.cocomia.app |
| SKU | cocomia-ios |
| プライマリカテゴリ | ヘルスケア／フィットネス |
| セカンダリカテゴリ | 仕事効率化 |
| コンテンツ配信権 | 第三者のコンテンツは含まない |

## このバージョンの情報

### プロモーションテキスト（170文字まで）

生理やPMSの時期に、出張やプレゼンが重なっていませんか？Cocomiaは、体調の波とカレンダーの予定を照らし合わせて、ぶつかりそうな予定を前もってお知らせします。データはすべてこの端末の中だけ。広告もありません。

### 説明

```
Cocomia（ココミア）は、体調の波に合わせて予定を守るカレンダーです。

生理やPMSの時期に、大事なプレゼンや出張、旅行が重なってしまった経験はありませんか？Cocomiaは、記録した生理の開始日から次の時期を予測し、iPhoneのカレンダーの予定と照らし合わせて、重なりそうな予定を前もってお知らせします。

■ できること
・生理が始まった日をタップで記録
・次の「生理ヘビー期」と「PMSの時期」の目安をカレンダーに色で表示
・カレンダーの予定と重なる日に注意マーク
・重い予定（出張・プレゼン・旅行など）は7日前と3日前、少し注意の予定は3日前にお知らせ
・「重い予定」と判定する言葉を自分で追加・削除
・注意する日数を自分に合わせて調整
・記録と設定の書き出し、すべてのデータの削除

■ プライバシー
・記録も予定も、この端末の中だけで扱います
・サーバーへの送信、アカウント登録、広告、アクセス解析はありません
・カレンダーは読むだけで、書き換えません

■ ご注意
予測は目安で、医療や避妊の目的には使えません。体調が気になるときの判断は医師にご相談ください。
```

### キーワード（100文字まで、カンマ区切り）

```
生理,PMS,生理予測,生理日,カレンダー,予定,スケジュール,体調,周期,通知,出張,プレゼン,旅行,生理管理,手帳
```

### URL

| 項目 | URL |
| --- | --- |
| サポートURL | https://michan1207.github.io/karenda/ |
| マーケティングURL | （空欄でよい） |
| プライバシーポリシーURL | https://michan1207.github.io/karenda/privacy.html |

### 著作権

```
2026 Cocomia
```

## App のプライバシー

「データの収集」で **「いいえ、このAppからデータを収集しません」** を選びます。

理由：記録・設定・カレンダーの予定はすべて端末の中だけで扱い、開発者や第三者に送信しないため。カレンダーを読むのは端末の中での判定だけで、Appleの定義する「収集」（端末の外へ送ること）に当たりません。

## 年齢制限指定

すべての質問に「なし」または「いいえ」で答えます。健康やウェルネスの話題について聞かれたら「はい」にします（生理・PMSの時期を扱うため）。医療に関する情報の質問も「なし」です（医療の助言はせず、予測は目安と明記しているため）。

## 輸出コンプライアンス

`app.json` に「暗号化を使っていない」（ITSAppUsesNonExemptEncryption = false）と書いてあるため、提出時に質問は出ません。

## App Review に関する情報

| 項目 | 内容 |
| --- | --- |
| サインインが必要 | いいえ |
| 連絡先 | MIKUさんの名前・電話番号・メールアドレス |

### メモ（審査担当者向け、英語）

```
Cocomia is a calendar that warns users when important events overlap with their predicted period or PMS days.

- No account or sign-in is required.
- All data stays on the device. The app has no server, analytics, ads or crash reporting, and makes no network requests.
- Calendar access is read-only and optional. Events are only read on-device to find overlaps. The app works without it.
- Notifications are local notifications scheduled on the device.

How to try it:
1. Tap "はじめる" (Start) and allow calendar and notification access.
2. On the calendar tab, select a date in the past and tap "この日を生理開始日として記録" (Record this day as a period start date).
3. Predicted heavy days and PMS days are tinted on the calendar. Events whose titles contain words such as "出張" (business trip) or "プレゼン" (presentation), or all-day events, are marked with ⚠ when they overlap.
4. The Alerts tab lists overlaps in the next 30 days.

Predictions are estimates and the app states that it is not for medical diagnosis or contraception.
```

## スクリーンショット

「Dynamic Island搭載iPhone（中型ディスプレイ）」用に、1206×2622（透明なし）の4枚を `store/images/ios/` に用意しています。番号の順にアップロードしてください。画面の予定や記録は見本用の架空のものです。

説明文には絵文字（⚠ など）を入れられません（App Store Connectが「無効な文字」として保存を断ります）。
