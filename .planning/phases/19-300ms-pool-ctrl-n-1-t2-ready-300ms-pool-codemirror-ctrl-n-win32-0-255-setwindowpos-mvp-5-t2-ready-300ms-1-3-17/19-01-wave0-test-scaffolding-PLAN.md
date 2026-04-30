---
phase: 19-300ms-pool-ctrl-n
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - e2e/perf-300ms.spec.ts
  - e2e/perf-burst.spec.ts
  - e2e/perf-load.spec.ts
  - e2e/fixtures/seed-17-notes.ts
  - app/components/StickyNote.pool.test.tsx
  - scripts/perf-check.mjs
  - package.json
  - docs/manual-verify-phase19.md
  - src-tauri/src/perflog.rs
  - src-tauri/src/lib.rs
autonomous: true
requirements: [PERF-01, PERF-02, PERF-03, PERF-04, PERF-05, PERF-06, PERF-07]
must_haves:
  truths:
    - "Wave 0 のテストは存在し、実装前は RED で失敗する（実装フェーズの GREEN を測れる土台になる）"
    - "perflog.rs が JSON Lines 1 行を書き出せる（empty fixture でも parse 可能）"
    - "scripts/perf-check.mjs が JSON Lines を読み中央値を計算して exit 0/1 を返す"
    - "docs/manual-verify-phase19.md に PERF-05/PERF-07 の手順が再現可能な形で記述されている"
  artifacts:
    - path: "e2e/perf-300ms.spec.ts"
      provides: "PERF-01 計測 E2E（Ctrl+N→T2_READY 5サンプル中央値判定）"
    - path: "e2e/perf-burst.spec.ts"
      provides: "PERF-02 連打耐性 E2E（1.5s 3回）"
    - path: "e2e/perf-load.spec.ts"
      provides: "PERF-03 17付箋負荷 E2E"
    - path: "e2e/fixtures/seed-17-notes.ts"
      provides: "17付箋仕込みヘルパ"
    - path: "app/components/StickyNote.pool.test.tsx"
      provides: "Pool 専用挙動の Vitest 単体テスト（PERF-04）"
    - path: "scripts/perf-check.mjs"
      provides: "JSON Lines 解析・中央値判定スクリプト"
    - path: "src-tauri/src/perflog.rs"
      provides: "JSON Lines 構造化ログモジュール"
    - path: "docs/manual-verify-phase19.md"
      provides: "手動検証手順書（PERF-05, PERF-07）"
  key_links:
    - from: "scripts/perf-check.mjs"
      to: "%LOCALAPPDATA%/ore-no-fusen/perf.jsonl"
      via: "readFileSync + JSON.parse"
      pattern: "PERF_LOG.*perf\\.jsonl"
    - from: "package.json"
      to: "scripts/perf-check.mjs"
      via: "npm script"
      pattern: "perf:check.*node scripts/perf-check"
    - from: "src-tauri/src/lib.rs"
      to: "src-tauri/src/perflog.rs"
      via: "mod perflog"
      pattern: "mod perflog"
---

<objective>
Phase 19 の自動検証土台を全部 Wave 0 で先行作成する。実装より先にテスト・スクリプト・ログ基盤を整え、後続 Wave 1〜3 が「失敗→実装→GREEN」のリズムで進められるようにする。

Purpose: VALIDATION.md の Wave 0 リスト（10 項目）をすべて満たし、Nyquist サンプリング（task commit 毎・wave merge 毎・phase gate 前）の前提を作る。テストは RED で構わない（実装が無いから当然）。重要なのは **「実装後に GREEN になる正しい契約」を先に書く**こと。

Output: 8 つの新規ファイル + lib.rs への mod 追加 + package.json の perf:check スクリプト追加。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-CONTEXT.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-RESEARCH.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-VALIDATION.md
@playwright.config.ts
@vitest.config.ts
@e2e/sticky-note.spec.ts
@app/components/StickyNote.test.tsx
@src-tauri/src/logger.rs
@src-tauri/src/lib.rs

<interfaces>
<!-- 既存の logger.rs から踏襲するパターン（perflog.rs を作る際の参考） -->

From src-tauri/src/logger.rs:
- `chrono::Local::now().to_rfc3339()` でタイムスタンプ生成
- `OpenOptions::new().create(true).append(true).open(path)` でファイル append
- `sanitize_path` でパスから個人情報を除去

From src-tauri/Cargo.toml:
- serde_json 1.0（既存依存）
- chrono 0.4（既存依存）
- uuid（既存依存）
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: perflog.rs（JSON Lines ログ基盤）と Rust 単体テストスケルトン作成</name>
  <files>src-tauri/src/perflog.rs, src-tauri/src/lib.rs</files>
  <behavior>
    - `perflog::log_event(run_id, event, label, elapsed_ms, meta)` を呼ぶと JSON Lines 1 行が `%LOCALAPPDATA%/ore-no-fusen/perf.jsonl` に append される
    - 同じ run_id で T0 / T1_RUST_ENTER / T2_READY を順に書くと、3 行とも parse 可能で run_id でグルーピングできる
    - `cfg!(debug_assertions)` 時は stdout にも出力する（CI で見える）
    - Mutex でファイル書き込みを排他する（並列書き込みで改行が混ざらない）
    - lib.rs 末尾に `#[cfg(test)] mod pool_tests { ... }` を追加し、空の test 関数 `pool_lazy_create()`, `pool_window_layered()`, `fusen_show_at_position_atomic()` を **`#[ignore]` 付き** で配置（後続 Wave 1〜3 で実装）
    - Test 1: `perflog::log_event` を 3 回呼んで perf.jsonl に 3 行書かれていることを tempfile で検証
    - Test 2: 同 run_id の 3 イベントを書いた後、parse して event 配列が 3 要素であることを検証
  </behavior>
  <action>
    1. `src-tauri/src/perflog.rs` を新規作成。RESEARCH.md Pattern 6 のコードをベースに以下を実装:
       - `pub struct PerfEvent`（serde::Serialize、ts/run_id/event/label/elapsed_ms/meta）
       - `pub fn log_event(run_id: &str, event: &str, label: Option<&str>, elapsed_ms: Option<u64>, meta: serde_json::Value)`
       - `fn perf_log_path() -> Result<PathBuf, String>` で `%LOCALAPPDATA%\ore-no-fusen\perf.jsonl` を返す（dirs クレート or std::env::var("LOCALAPPDATA")）
       - `static PERF_LOG_MUTEX: Mutex<()>` で書き込み排他（pitfall 9 対策）
       - PERF イベントに `path` を含めない（pitfall 10 / Sentry リーク対策）
       - 注意: `path` 受領時は `logger::sanitize_path` を経由する（meta に絶対パスを直書きしない）
    2. `src-tauri/src/lib.rs` 先頭の mod 宣言に `mod perflog;` を追加
    3. `src-tauri/src/lib.rs` 末尾に `#[cfg(test)] mod pool_tests` を追加。3 つの test 関数を `#[ignore]` でスタブ化:
       ```rust
       #[cfg(test)]
       mod pool_tests {
           #[test] #[ignore] fn pool_lazy_create() { unimplemented!("Wave 2 で実装") }
           #[test] #[ignore] fn pool_window_layered() { unimplemented!("Wave 2 で実装") }
           #[test] #[ignore] fn fusen_show_at_position_atomic() { unimplemented!("Wave 2 で実装") }
       }
       ```
    4. perflog.rs の `#[cfg(test)] mod tests` で上記 Test 1, Test 2 を実装（tempfile で一時ディレクトリ使用、`PERF_LOG` 環境変数で path 上書き可能にする）:
       - **tempfile 追加**: `src-tauri/Cargo.toml` の `[dev-dependencies]` セクションに `tempfile = "3"` が存在するか確認し、なければ追記する。既存の他 dev-deps（例: `tauri = { version = ..., features = ["test"] }`）は変更しない
    5. **理由**: ログ基盤を最初に作っておくと、Wave 1 で fusen_show_at_position に T2_READY 計測を埋め込む際に「ログ呼び出しはここに書く」という土台が既にある。並行実装可能。
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml perflog</automated>
  </verify>
  <done>
    perflog.rs の Test 1, Test 2 が GREEN。lib.rs の `mod pool_tests` 3 関数は `#[ignore]` のため cargo test で skip される（後続 Wave で `#[ignore]` を外して実装）。`src-tauri/Cargo.toml` に `tempfile = "3"` が dev-dependencies に存在する。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: scripts/perf-check.mjs と Vitest pool 単体テストスケルトン作成</name>
  <files>scripts/perf-check.mjs, package.json, app/components/StickyNote.pool.test.tsx</files>
  <behavior>
    - `node scripts/perf-check.mjs` を実行すると、JSON Lines を読み run_id 毎に T2_READY を集計、5 サンプル以上で中央値 ≤ 300ms なら exit 0、それ以外は exit 1
    - 環境変数 `PERF_LOG` で入力ファイルを上書き可能（テスト時に固定 fixture を使うため）
    - 0 サンプル時は exit 1 + メッセージ表示（無いまま GREEN を装わない）
    - `npm run perf:check` で起動できる（package.json scripts に追加）
    - StickyNote.pool.test.tsx は **describe.skip** または `it.todo` で 4 つのテストケースを宣言（実装は Wave 2）:
      1. "Pool 窓は isPool=true で初期マウント時に loadNote を呼ばない"（pitfall 7 対策）
      2. "1 文字目が入った時に onFirstChar コールバックが 1 回だけ呼ばれる"（firstCharFiredRef、pitfall 5）
      3. "2 文字目以降は onFirstChar を再発火しない"
      4. "promote 完了後に setEditBody('') を経由しても firstCharFiredRef が残る"
  </behavior>
  <action>
    1. `scripts/perf-check.mjs` を新規作成。RESEARCH.md Pattern 6 末尾のコードをベースに:
       ```javascript
       import { readFileSync, existsSync } from 'node:fs';
       import { join } from 'node:path';
       const path = process.env.PERF_LOG ?? join(process.env.LOCALAPPDATA ?? '', 'ore-no-fusen', 'perf.jsonl');
       if (!existsSync(path)) { console.error(`Not found: ${path}`); process.exit(1); }
       const lines = readFileSync(path, 'utf-8').trim().split('\n').filter(Boolean);
       const runs = new Map();
       for (const ln of lines) { const ev = JSON.parse(ln); if (!runs.has(ev.run_id)) runs.set(ev.run_id, {}); runs.get(ev.run_id)[ev.event] = ev.elapsed_ms; }
       const t2s = [...runs.values()].map(r => r.T2_READY).filter(x => x != null);
       if (t2s.length < 5) { console.error(`Need >= 5 samples, got ${t2s.length}`); process.exit(1); }
       t2s.sort((a, b) => a - b);
       const median = t2s[Math.floor(t2s.length / 2)];
       console.log(`Samples: ${t2s.length}, Median T2_READY: ${median}ms`);
       process.exit(median <= 300 ? 0 : 1);
       ```
    2. `package.json` の `scripts` に `"perf:check": "node scripts/perf-check.mjs"` を追加（既存 scripts は触らない）
    3. `app/components/StickyNote.pool.test.tsx` を新規作成。`describe.skip('Pool 窓挙動', () => { ... })` で 4 つの it ブロックを宣言（todo or skip）。`existing` StickyNote.test.tsx の import パターンを踏襲。
    4. **検証用 fixture**: scripts/perf-check.mjs が読める JSON Lines サンプルを作って手動で動作確認（コミット前のローカル確認のみ、ファイルとしてはコミットしない）
    5. **避けるべきこと**: vitest --watch / playwright --ui の使用（Nyquist 違反）
  </action>
  <verify>
    <automated>npm run perf:check 2>&1 | grep -q "Not found\|Need >= 5" && npx vitest run app/components/StickyNote.pool.test.tsx</automated>
  </verify>
  <done>
    perf:check が「ファイル無し or サンプル不足」で exit 1 + メッセージ表示。Vitest が StickyNote.pool.test.tsx を読み込み、skip された 4 ケースをレポートする。
  </done>
</task>

<task type="auto">
  <name>Task 3: E2E スペック 3 本 + 17 付箋 fixture + 手動検証手順書</name>
  <files>e2e/perf-300ms.spec.ts, e2e/perf-burst.spec.ts, e2e/perf-load.spec.ts, e2e/fixtures/seed-17-notes.ts, docs/manual-verify-phase19.md</files>
  <action>
    1. `e2e/fixtures/seed-17-notes.ts` を新規作成: テストフォルダに 17 個の `.md` ファイル（連番命名 `2026-04-30_001.md` 〜 `_017.md`）を fs で書き出すヘルパ関数 `seedNotes(folderPath: string, count: number)` を export。既存 `e2e/sticky-note.spec.ts` のフォルダ生成パターンを参照。
    2. `e2e/perf-300ms.spec.ts` を新規作成。`test('ctrl-n-300ms', ...)` 1 個:
       - dev サーバ起動済み前提（playwright.config の webServer が webview ではないため、E2E は Web ブラウザベース。Tauri ビルド実機での 300ms 計測は手動 + perf:check で行う）
       - **このテストの責務**: Ctrl+N が押された時に `fusen:request_create` イベント or createNewNote が呼ばれる、までの **JS レベル経路の検証** に留める（Tauri webview の Win32 計測はこの spec ではせず、`docs/manual-verify-phase19.md` で別途実機計測手順を記す）
       - test.skip もしくは test.fixme でスタブ化（Wave 2/3 でロジックが入った後に有効化）
    3. `e2e/perf-burst.spec.ts` を新規作成。`test('ctrl-n-burst', ...)`:
       - 1500ms 内に Ctrl+N を 3 回送る → 3 つのウィンドウ生成イベントが発火することを確認（Tauri 実機ビルドが必要なため test.fixme）
    4. `e2e/perf-load.spec.ts` を新規作成。`test('ctrl-n-loaded', ...)`:
       - seed-17-notes で 17 付箋を仕込む → 1 個 Ctrl+N → 想定経路通り（test.fixme）
    5. `docs/manual-verify-phase19.md` を新規作成。以下を記載:
       - **PERF-05 (Spy++ 確認)**: Spy++ 入手元、起動手順、`pool-window-*` 検索、Styles タブ → `WS_EX_LAYERED` (0x80000) フラグ存在の確認手順、画面外配置確認
       - **PERF-07 (グローバル Ctrl+N)**: メモ帳起動 → メモ帳 focus → Ctrl+N → 付箋手前表示の確認（5/5 成功必要）
       - **300ms 実機計測手順**: Tauri ビルド (`npm run tauri build` → 実行) → アプリ内で Ctrl+N を 5 回 → `%LOCALAPPDATA%\ore-no-fusen\perf.jsonl` を生成確認 → `npm run perf:check` 実行 → exit 0 確認
       - **連打耐性実機確認**: 起動完了後、1.5 秒で 3 回連打 → 3 個全部 300ms 以内、4 回目はトースト表示
    6. **理由**: E2E は実機 Tauri ビルドの Win32 を計測できないため、test.fixme でテスト形だけ用意し、実計測は手動 + perf:check に委ねる。CONTEXT.md の「妥協ルートを安易に採らない」を尊重し、E2E では JS 経路までを検証、Win32 部は実機検証で正面から計測。
  </action>
  <verify>
    <automated>npx playwright test --list e2e/perf-300ms.spec.ts e2e/perf-burst.spec.ts e2e/perf-load.spec.ts && test -f docs/manual-verify-phase19.md</automated>
  </verify>
  <done>
    Playwright が 3 spec を読み込んでテスト一覧を表示する（test.fixme で skip される）。docs/manual-verify-phase19.md に PERF-05, PERF-07, 300ms 実機計測, 連打耐性の 4 セクションが揃っている。
  </done>
</task>

</tasks>

<verification>
- `cargo test --manifest-path src-tauri/Cargo.toml perflog` が GREEN（perflog.rs Test 1, 2）
- `cargo test --manifest-path src-tauri/Cargo.toml pool_tests` が `#[ignore]` で skip される（3 関数）
- `npx vitest run app/components/StickyNote.pool.test.tsx` が読み込み成功・skip レポート
- `npm run perf:check` が exit 1（fixture 無いため）+ 明確なメッセージ
- `npx playwright test --list e2e/perf-*.spec.ts` で 3 spec のテスト名が出る
- `docs/manual-verify-phase19.md` に 4 セクション（PERF-05/PERF-07/300ms 実機計測/連打耐性）あり
</verification>

<success_criteria>
- 8 つの Wave 0 ファイルが全部存在し、コミットされている
- 後続 Wave がこれら土台に「実装を入れる→test を un-skip する→GREEN」のフローで進められる
- VALIDATION.md の Wave 0 Requirements 10 項目のうち、本 Plan で 9 項目を満たす（残り 1 項目「lib.rs の test mod 追加」も本 Plan の Task 1 でカバー済み）
- nyquist_compliant: true に切り替えられる前提が整っている
- `src-tauri/Cargo.toml` に `tempfile = "3"` が dev-dependencies として存在する
</success_criteria>

<output>
After completion, create `.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-01-SUMMARY.md`
</output>
