import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { BANNED_PHRASES } from './engine/wording';

const ROOT = path.join(__dirname, '..');
// 画面に出る文は日本語。'100%' のようなスタイルの値は見ない
const JAPANESE = /[぀-ヿ一-鿿]/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** コードの中の文字列と JSX の文字。コメントは入れない */
function literals(file: string): string[] {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isJsxText(node)) found.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function jsonStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(jsonStrings);
  return [];
}

const read = (...parts: string[]) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const htmlText = (html: string) =>
  html.replace(/<!--[\s\S]*?-->|<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
const filesIn = (dir: string, ext: string) => fs.readdirSync(path.join(ROOT, dir)).filter((name) => name.endsWith(ext));

// 画面・通知・権限の文言・ストアの下書き・公開ページ
const texts: [string, string][] = [
  ...sourceFiles(path.join(ROOT, 'src')).flatMap((file) =>
    literals(file).map((text): [string, string] => [path.relative(ROOT, file), text]),
  ),
  ...['app.json', path.join('locales', 'ja.json')].flatMap((file) =>
    jsonStrings(JSON.parse(read(file))).map((text): [string, string] => [file, text]),
  ),
  ...filesIn('docs', '.html').flatMap((name) =>
    htmlText(read('docs', name)).split('\n').map((line): [string, string] => [`docs/${name}`, line.trim()]),
  ),
  ...filesIn('store', '.md').flatMap((name) => read('store', name).split('\n').map((line): [string, string] => [`store/${name}`, line])),
];

// 仕様 F18 / §6.2: 「警戒」「診断」「絶対」などを、ユーザーの目に入る文に使わない
it('uses none of the banned phrases in user-facing text', () => {
  expect(texts.length).toBeGreaterThan(100);
  const offenders = texts.flatMap(([file, text]) =>
    JAPANESE.test(text) ? BANNED_PHRASES.filter((rule) => rule.pattern.test(text)).map((rule) => `${file}: ${rule.pattern} in "${text.slice(0, 60)}"`) : [],
  );
  expect(offenders).toEqual([]);
});
