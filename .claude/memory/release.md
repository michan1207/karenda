# release: ストア提出と公開ページ

- アプリ名「Amiel」（1.0.0は旧名「Cocomia」で審査に出した）。ID `com.cocomia.app`・Expoの `owner: cocomia`・問い合わせ `cocomia.tokyo@gmail.com` は変えない。表示名・権限文言は `locales/ja.json` と `app.json`
- ストア名は「Amiel - 体調と予定のカレンダー」。iOSは1.0.0合格後に1.0.1で改名。Play Consoleの開発者名は「amicuna」
- ビルド/提出は EAS（Mac不要）: `npx eas-cli@latest build --platform ios|android`、`submit --platform ios --latest`
- ビルド番号は EAS が自動採番（`eas.json` の `appVersionSource: remote`）。証明書も EAS 管理
- Android の最初の AAB は Play Console に手動アップロード
- ストア文言の下書き `store/app-store.md`, `store/google-play.md`、スクショ `store/images/`
- サポート/プライバシーポリシーは `docs/`（GitHub Pages: https://michan1207.github.io/karenda/）
