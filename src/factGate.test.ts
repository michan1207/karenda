import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOOK = path.join(__dirname, '..', '.claude', 'hooks', 'factGate.js');

function run(stdin: string) {
  const result = spawnSync('node', [HOOK], { input: stdin, encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout ? JSON.parse(result.stdout) : null;
}

function stop(text: string, stopHookActive = false) {
  return run(
    JSON.stringify({
      hook_event_name: 'Stop',
      stop_hook_active: stopHookActive,
      last_assistant_message: text,
    }),
  );
}

// 上の3件は過去のセッションの報告の言い回しから取った
it.each([
  ['原因', '開けなかった原因が分かったので、直しました。もう一度やってみてください。'],
  ['完了', 'もう設定済みなので、追加の作業はいりません。作成後に設定画面でも確認しました。'],
  ['手順', '黒い画面の中で右クリックして、Enter キーを押します。'],
  ['原因', '原因はフォントの版でした。'],
  ['完了', 'テストが全部通りました。'],
])('stops an unbacked %s claim', (kind, text) => {
  const output = stop(text);
  expect(output.decision).toBe('block');
  expect(output.reason).toContain(`- ${kind}:`);
});

it.each([
  'このテストはPCの負荷が原因と考えています。',
  '直しました。まだやっていないこと：iPhoneでの見た目の確認。',
  'テストが全部通りました。iPhone の画面は未確認です。',
  '「Reload」を押してください。違う画面なら、そのまま教えてください。',
  '#105 はマージされています。',
])('lets a backed or plain report through: %s', (text) => {
  expect(stop(text)).toBeNull();
});

it('names every missing point in one stop', () => {
  const { reason } = stop('原因が分かったので直しました。「Reload」を押してください。');
  expect(reason).toContain('- 原因:');
  expect(reason).toContain('- 完了:');
  expect(reason).toContain('- 手順:');
});

it('stops a report only once, so it can never loop', () => {
  expect(stop('原因が分かったので、直しました。', true)).toBeNull();
});

it('lets the session end when the report text is missing or the input is broken', () => {
  expect(run(JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false }))).toBeNull();
  expect(run('{not json')).toBeNull();
});

it('starts a session with the facts read from the repository', () => {
  const { hookSpecificOutput } = run(JSON.stringify({ hook_event_name: 'SessionStart' }));
  expect(hookSpecificOutput.hookEventName).toBe('SessionStart');
  expect(hookSpecificOutput.additionalContext).toMatch(/今の実物/);
  expect(hookSpecificOutput.additionalContext).toMatch(/HEAD [0-9a-f]{7}/);
  expect(hookSpecificOutput.additionalContext).toMatch(/app\.json \d+\.\d+\.\d+/);
});

it('says how far the memory index is behind the repository', () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'factGate-'));
  fs.mkdirSync(path.join(project, 'memory'));
  fs.writeFileSync(path.join(project, 'memory', 'MEMORY.md'), '');
  const { hookSpecificOutput } = run(
    JSON.stringify({
      hook_event_name: 'SessionStart',
      transcript_path: path.join(project, 'session.jsonl'),
    }),
  );
  fs.rmSync(project, { recursive: true });
  expect(hookSpecificOutput.additionalContext).toMatch(/メモリーの更新（\d{4}-\d{2}-\d{2}）のあと、このブランチに\d+件の変更/);
});
