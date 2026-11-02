import fs from 'node:fs';
import path from 'node:path';

// 色は theme.ts の useColors() だけで定義する（AMIEL_DESIGN_SYSTEM.md §10）
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
// 色は部品ごとに useColors() で受け取り、props で下へ回さない
const COLORS_PROP = /\bcolors=\{|\bcolors: Colors\b/;

const linesMatching = (pattern: RegExp) =>
  fs
    .readdirSync(__dirname)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'theme.ts')
    .flatMap((name) =>
      fs
        .readFileSync(path.join(__dirname, name), 'utf8')
        .split('\n')
        .flatMap((line, i) => (pattern.test(line) ? [`${name}:${i + 1}: ${line.trim()}`] : [])),
    );

it('has no color literals outside theme.ts', () => {
  expect(linesMatching(COLOR_LITERAL)).toEqual([]);
});

it('lets every part read the colors itself instead of passing them down', () => {
  expect(linesMatching(COLORS_PROP)).toEqual([]);
});
