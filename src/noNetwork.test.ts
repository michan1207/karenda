import fs from 'node:fs';
import path from 'node:path';

// ESLintをすり抜ける書き方（globalThis.fetch など）も含めて、通信コードが無いことを確かめる
const FORBIDDEN = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /from\s+['"](axios|expo-network|expo-updates)['"]/,
  /https?:\/\//,
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// 通信を数えるところ（設定の「プライバシー」の外部送信の件数）は、数えるために通信のAPIに触れる
const COUNTER = path.join('data', 'network.ts');

it('contains no network code in app sources', () => {
  const offenders = sourceFiles(__dirname).filter((file) => !file.endsWith(COUNTER)).flatMap((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return FORBIDDEN.filter((re) => re.test(text)).map((re) => `${path.relative(__dirname, file)}: ${re}`);
  });
  expect(offenders).toEqual([]);
});
