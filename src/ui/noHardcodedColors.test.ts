import fs from 'node:fs';
import path from 'node:path';

// 色は theme.ts の useColors() だけで定義する（AMIEL_DESIGN_SYSTEM.md §10）
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

it('has no color literals outside theme.ts', () => {
  const offenders = fs
    .readdirSync(__dirname)
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== 'theme.ts')
    .flatMap((name) =>
      fs
        .readFileSync(path.join(__dirname, name), 'utf8')
        .split('\n')
        .flatMap((line, i) => (COLOR_LITERAL.test(line) ? [`${name}:${i + 1}: ${line.trim()}`] : [])),
    );
  expect(offenders).toEqual([]);
});
