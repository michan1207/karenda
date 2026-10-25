import pkg from '../package.json';

/**
 * アプリに入るライブラリの一覧。外部通信や分析・広告をしないことを確かめたものだけを並べる。
 * 増やすときは、そのライブラリが通信しないかを確認してから追記する。
 */
const ALLOWED = [
  'expo',
  'expo-calendar',
  'expo-notifications',
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
