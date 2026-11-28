# release: ストア提出と公開ページ

- アプリ名「Cocomia」（2026-10-27 オーナー決定でAmielから戻した。1.0.0もCocomiaで審査）。ID `com.cocomia.app`・Expoの `owner: cocomia`・問い合わせ `cocomia.tokyo@gmail.com`。表示名・権限文言は `locales/ja.json` と `app.json`
- 配信は日本だけ。英語化はしない（2026-10-31 オーナー決定）
- ストア名は「Cocomia - 体調と予定のカレンダー」。Play Consoleの開発者名は「amicuna」
- ビルド/提出は EAS（Mac不要）: `npx eas-cli@latest build --platform ios|android`、`submit --platform ios --latest`
- iPhone の版を上げてビルドする時（TestFlight・審査に出す版）は、同じコミットから Android のリリースビルド（AAB）も並行して作り、同じ版番号でクローズドテストに出す。中身をいつも iPhone と Android でそろえる（2026-10-31 オーナー決定）
- ビルド番号は EAS が自動採番（`eas.json` の `appVersionSource: remote`）。証明書も EAS 管理
- Android の AAB は毎回 Play Console に手動アップロード（EAS に Google のサービスアカウント鍵が無く `eas submit -p android` は使えない。ファイルを選ぶのはオーナー）
- 有料プラン（サブスク・課金）は作らない（2026-10-25 オーナー決定）。「広告なし」はサブタイトル/簡単な説明の先頭に置く
- ストア文言の下書き `store/app-store.md`, `store/google-play.md`、スクショ `store/images/`
- サポート/プライバシーポリシーは `docs/`（GitHub Pages: https://michan1207.github.io/karenda/）
- 画面は縦横どちらでも使える（`app.json` の `orientation: "default"`、2026-11-20 オーナー「縦でも横でも」）。縦に固定すると Play が「縦向きの画面が必須」と注意を出す
- Play の本番アクセス申請・ストア審査の文（更新内容・whatsNew）には、テスター（オープンチャット）の声と、それに合わせて直したことを入れる。記録はClaudeのメモリー tester-feedback.md（2026-11-28 オーナー指示）
