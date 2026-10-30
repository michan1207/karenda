import pkg from '../package.json';

/**
 * アプリに入るライブラリの一覧。外部通信や分析・広告をしないことを確かめたものだけを並べる。
 * 増やすときは、そのライブラリが通信しないかを確認してから追記する。
 */
const ALLOWED = [
  '@noble/ciphers', // バックアップの暗号化（AES-GCM）。JavaScript だけで動き、通信も依存ライブラリも無い
  '@noble/hashes', // パスワードから鍵を作る（PBKDF2）。同上
  'expo',
  'expo-asset', // expo-font が使う。同梱ファイルを読むだけで、URLを渡さない限り通信しない
  'expo-calendar',
  'expo-crypto', // 暗号化に使う乱数だけ。通信しない
  'expo-document-picker', // 戻すときに、使う人が選んだファイルを読む。通信しない
  'expo-file-system', // バックアップを一時置き場に書いて共有メニューへ渡す。ダウンロード機能は使わない
  'expo-font', // 同梱の丸ゴシック（assets/fonts）を読むだけ
  'expo-notifications',
  'expo-sharing', // 共有メニューを出すだけ。どこへ送るかは使う人が選ぶ
  'expo-splash-screen',
  'expo-sqlite',
  'expo-status-bar',
  'expo-store-review',
  'expo-system-ui',
  'react',
  'react-native',
  'react-native-safe-area-context',
];

it('ships only libraries that were checked for network use', () => {
  expect(Object.keys(pkg.dependencies).sort()).toEqual([...ALLOWED].sort());
});

// あとから足したネイティブの expo-* は expo に組み込みの版と同じにする。新しい版は別の ExpoModulesCore 向けに作られていて、
// iPhone で起動直後に落ちた（2026-10-29、1.0.2 ビルド7〜9「DYLD Symbol missing」）
it('pins added native expo modules to the versions bundled with expo', () => {
  const bundled = require('expo/bundledNativeModules.json');
  for (const name of ['expo-font', 'expo-asset', 'expo-crypto', 'expo-document-picker', 'expo-file-system', 'expo-sharing'] as const) {
    expect(pkg.dependencies[name]).toBe(bundled[name].replace(/^~/, ''));
  }
});
