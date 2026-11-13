# tools: このアプリで使う道具と分量

2026-11-05 オーナー指示。役割が被る時の全体の決まりは `~/.claude/skills/appdev-bootstrap/LEDGER.md`。ここはこのアプリだけの差分で、グローバルの K3.2 より Superpowers を広げている。
起動するのは今いる場面の行の1本だけで、場面が変わったら次の行へ移る（不具合を直して PR を出すなら debugging → TDD → verification の順に1本ずつ）。画面なら加えて Impeccable。表に無い場面では何も起動しない。

## 場面で起動する
| 場面 | 起動するもの | 分量 |
|---|---|---|
| 不具合・CI の失敗・実機で落ちる | `superpowers:systematic-debugging` | 本文 10KB だけ。付属ファイルは詰まった時に読む |
| `src/engine` の判定を変える、不具合を直す | `superpowers:test-driven-development` | 文言・色だけの変更では使わない |
| コードを変えた PR を出す直前 | `superpowers:verification-before-completion` | 4KB。`npm run check` の結果行を見てから報告する |
| `src/data`（保存・通知・バックアップ）を変えた PR | `ponytail-review` | 画面だけの変更では使わない |
| 仕様が決まっていない新機能 | `superpowers:brainstorming` | オーナーにしか決められない点だけ聞く。仕様書があれば使わない |
| 2つ以上の PR にまたがる作業 | `superpowers:writing-plans` | 1 PR で終わるなら使わない |
| 画面の見た目・使い心地を変える | `impeccable` | 下の「Impeccable」 |

- brainstorming・writing-plans の保存先は既定の `docs/superpowers/` にしない。`docs/` はそのままサポートサイトに載る。自動メモリー（`refactor-plan-2026-10.md` と同じ場所）に置く
- 使わない Superpowers: subagent-driven-development（33KB）・executing-plans（20KB）・dispatching-parallel-agents（オーナーが頼んだ時だけ）、finishing-a-development-branch・using-git-worktrees・requesting-code-review（手順は workflow.md、レビューは ponytail-review にある）

## Impeccable
- 最初の `scripts/impeccable context` は `< /dev/null` を付ける。付けないと入力待ちで止まる（付ければ 2 秒、2026-11-05）
- 読むのは context（3KB）→ 使うコマンドの reference 1本 → `ios.md`・`android.md` → `craft-floor.md`。重い `critique`（46KB）・`new-work`（63KB）は画面を丸ごと作り直す時だけ
- `live`・`generate` はブラウザ用なので使わない。`init`・`document` も走らせず PRODUCT.md / DESIGN.md を作らない。デザインの正は `AMIEL_DESIGN_SYSTEM.md`（23KB、節を Grep）と `ui_rules.md`

## 探す
- まず Grep。`headroom sg` は起動に 10 秒以上かかり、同じ 37 件を Grep は 0 秒で返した（2026-11-05）。Grep で書けない構造の検索（部品の中の `try … finally` など）だけに使う

## 起動せずに効いている
- Ponytail: セッション開始時に自動で入る。文脈に「PONYTAIL MODE ACTIVE」が無い時だけ、最初のツールと一緒に起動する（全体の K1.3）
- headroom: 上の「探す」の `sg` だけ。圧縮の MCP は使わない（全体の K1.4）
- CLAUDE.md: 入口の表だけを置き、中身はこの `memory/` に分けて、場面が来た時に1本だけ読む

## このアプリでは切ってある
- `.claude/settings.json` で切った（一覧に出ない）: Taste Skill・Hallmark（Web 用）、genjutsu（Web・Compose・SwiftUI 用で React Native は対象外。中に UI/UX Pro Max を抱えていて、全体で切ったものが戻ってしまう。11-08）、Frontend Slides（スライドは Artifact）、Diagram Design（図は artifact-diagramming）、Last 30 Days（調査は deep-research）。Scrapling は `/scrapling` でだけ呼べる
- 全体で切ってある: UI/UX Pro Max（配色はデザインシステムで確定）、Humanizer・Stop Slop（英語用で配信は日本だけ）、Understand Anything（メモリーと Grep で足りる）
- 名指しされたら `~/.claude/plugins/cache/` の SKILL.md を直接読んで一度だけ使う。常用に戻すなら `.claude/settings.json` の行を消す
