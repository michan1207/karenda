# karenda

体調（生理・PMS周期）と予定の衝突を、iPhoneの中だけで知らせるカレンダーアプリ。

## iPhoneで動かす

1. PCに Node.js（LTS）と Git を入れる
2. このリポジトリを取得して、フォルダの中で次を実行

   ```
   npm install
   npx expo start
   ```

3. 画面に出たQRコードを、iPhoneのカメラで読み取る（Expo Go が開きます）

PCとiPhoneは同じWi-Fiにつないでください。つながらないときは `npx expo start --tunnel` を試してください。

## 開発

- `npm run check` で型チェック・lint・テストをまとめて実行
- 外部通信はlintとテストで禁止しています
