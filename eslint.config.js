// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// データを端末の外へ出さないため、通信に使えるAPIをまとめて禁止する
const networkGlobals = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource'].map((name) => ({
  name,
  message: 'karendaは外部通信をしません。データは端末内だけで扱ってください。',
}));

module.exports = defineConfig([
  expoConfig,
  {
    // .claude/worktrees には別の作業のコピーがあり、android/ios は作られたファイル。ここでは見ない
    ignores: ['dist/*', 'node_modules/*', '.claude/**', 'android/**', 'ios/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'index.ts'],
    rules: {
      'no-restricted-globals': ['error', ...networkGlobals],
      'no-restricted-imports': [
        'error',
        {
          paths: ['axios', 'expo-network', 'expo-updates'].map((name) => ({
            name,
            message: 'karendaは外部通信をしません。',
          })),
        },
      ],
      // 名前で探せるよう、書き出しはすべて名前つきにする
      'import/no-default-export': 'error',
    },
  },
  {
    // 通信を数えるところだけは通信のAPIに触れる（数えるだけで、通信はしない）
    files: ['src/data/network.ts', 'src/data/network.test.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
]);
