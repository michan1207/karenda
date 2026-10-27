# release: ストア提出と公開ページ

- アプリ名「Cocomia」（2026-10-27 オーナー決定でAmielから戻した。1.0.0もCocomiaで審査）。ID `com.cocomia.app`・Expoの `owner: cocomia`・問い合わせ `cocomia.tokyo@gmail.com`。表示名・権限文言は `locales/ja.json` と `app.json`
- ストア名は「Cocomia - 体調と予定のカレンダー」。Play Consoleの開発者名は「amicuna」
- ビルド/提出は EAS（Mac不要）: `npx eas-cli@latest build --platform ios|android`、`submit --platform ios --latest`
- ビルド番号は EAS が自動採番（`eas.json` の `appVersionSource: remote`）。証明書も EAS 管理
- Android の最初の AAB は Play Console に手動アップロード
- 有料プラン（サブスク・課金）は作らない（2026-10-25 オーナー決定）。「広告なし」はサブタイトル/簡単な説明の先頭に置く
- ストア文言の下書き `store/app-store.md`, `store/google-play.md`、スクショ `store/images/`
- サポート/プライバシーポリシーは `docs/`（GitHub Pages: https://michan1207.github.io/karenda/）
