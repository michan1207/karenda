#!/usr/bin/env node
// 言い切りの関門。SessionStart は今の実物を文脈に入れ、Stop は裏付けの無い言い切りを1回だけ止める。
// 規則の理由は .claude/memory/facts.md。ここが壊れても作業は止めない（例外はすべて素通り）。
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const UNVERIFIED =
  /未確認|(確認し|確かめ|見|試し|やっ)て(い)?(ません|ない)|不明|(分か|わか)りません|と見ています|と考えています|かもしれません|可能性/;
const FALLBACK = /違う画面|違っていたら|違ったら|出ないとき|出ない時|出なければ|止まったら|そのまま教えて/;

const CLAIMS = [
  {
    kind: '原因',
    says: /原因(は|が分か|が判明|が特定|でした)|理由が分かり/,
    needs: UNVERIFIED,
    ask: '再現か反証を通っていなければ「〜と見ている」に直し、未確認の点を1行書く',
  },
  {
    kind: '完了',
    says: /直しました|修正しました|動きます|動きました|できました|完了しました|確認済み|確かめました|確認しました|通りました/,
    needs: UNVERIFIED,
    ask: '実物で見た範囲と、見ていない範囲（iPhone の画面など）を分けて1行書く',
  },
  {
    kind: '手順',
    says: /(押して|開いて|タップして|読み取って)ください|(押し|開き|タップし|読み取り)ます/,
    needs: FALLBACK,
    ask: '読んだコードか見た画面に基づく手順か確かめ、「違う画面なら、そのまま教えてください」を足す',
  },
];

function checkReport(input) {
  const text = input.last_assistant_message;
  if (input.stop_hook_active || !text) return null;
  const missing = CLAIMS.filter((claim) => claim.says.test(text) && !claim.needs.test(text));
  if (missing.length === 0) return null;
  const lines = missing.map((claim) => `- ${claim.kind}: ${claim.ask}`);
  return {
    decision: 'block',
    reason: `言い切りの関門（.claude/memory/facts.md）。送る前に次を直してください。\n${lines.join('\n')}`,
  };
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function memoryAge(transcriptPath) {
  if (!transcriptPath) return '';
  const index = path.join(path.dirname(transcriptPath), 'memory', 'MEMORY.md');
  if (!fs.existsSync(index)) return '';
  const updated = fs.statSync(index).mtime;
  const commits = git('rev-list', '--count', '--first-parent', `--since=${updated.toISOString()}`, 'HEAD');
  return `\nメモリーの更新（${updated.toISOString().slice(0, 10)}）のあと、このブランチに${commits}件の変更。`;
}

function currentFacts(input) {
  const [branch, ...dirty] = git('status', '--porcelain', '--branch').split('\n');
  const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  const context = [
    `【今の実物 ${new Date().toISOString().slice(0, 10)}（手元の git。GitHub・ストアとは未照合）】`,
    `${branch.replace(/^## /, '')} / 未コミット ${dirty.length}件 / HEAD ${git('log', '-1', '--format=%h %s')}`,
    `app.json ${readJson('app.json').expo.version} / expo ${readJson('package.json').dependencies.expo}`,
    `版・PR・配信の状態はメモリーで答えず、その場で実物を見る。${memoryAge(input.transcript_path)}`,
  ].join('\n');
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } };
}

try {
  const raw = fs.readFileSync(0, 'utf8');
  const input = raw.trim() ? JSON.parse(raw) : {};
  const output = input.hook_event_name === 'Stop' ? checkReport(input) : currentFacts(input);
  if (output) process.stdout.write(JSON.stringify(output));
} catch (error) {
  console.error(`factGate: ${error.message}`);
}
