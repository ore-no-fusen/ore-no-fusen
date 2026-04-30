---
phase: 19-300ms-pool-ctrl-n
plan: 04
type: execute
wave: 4
depends_on: ["19-03"]
files_modified:
  - src-tauri/src/lib.rs
  - src-tauri/src/settings.rs
  - app/components/StickyNote.tsx
  - app/page.tsx
  - lib/settings-store.test.ts
autonomous: true
requirements: [PERF-02, PERF-03, PERF-07, PERF-08]
must_haves:
  truths:
    - "Pool 窓は常時 3 個維持される（補充トリガ：T2_READY +5s、補充並列度 1）"
    - "アプリ起動時、付箋復元完了後（main window ready 後）に pool=3 を順次作成する（CPU 競合回避）"
    - "グローバル Ctrl+N が他アプリ focus 時に発火し、付箋が手前に表示される"
    - "ローカル Ctrl+N とグローバル Ctrl+N の競合解決：付箋に focus があればグローバル側は何もしない"
    - "settings.json の shortcut_new_note でショートカットをカスタマイズできる（無ければデフォルト ctrl+n）"
    - "Rust 500ms スロットル（fusen_create_pool_window）はセーフティネットとして残る"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      provides: "POOL_TARGET=3 補充オーケストレーション、起動時補充、tauri-plugin-global-shortcut 登録、競合解決、count_missing_pool 純粋関数"
      contains: "POOL_TARGET, fusen:request_create_global, count_missing_pool"
    - path: "src-tauri/src/settings.rs"
      provides: "Settings 構造体に shortcut_new_note: Option<String> 追加"
      contains: "shortcut_new_note"
    - path: "app/components/StickyNote.tsx"
      provides: "T2_READY +5s 後に補充トリガを発火する効果"
    - path: "app/page.tsx"
      provides: "fusen:request_create_global リスナー追加（グローバル shortcut 経由 createNewNote）"
  key_links:
    - from: "tauri-plugin-global-shortcut handler"
      to: "fusen:request_create_global emit"
      via: "is_focused チェック後の条件付き emit"
      pattern: "fusen:request_create_global"
    - from: "settings.json shortcut_new_note"
      to: "Shortcut::parse"
      via: "Settings load 時に parse、失敗時 ctrl+n フォールバック"
      pattern: "shortcut_new_note"
    - from: "StickyNote handleFirstChar"
      to: "5s 後の Pool 補充トリガ"
      via: "setTimeout 5000ms after T2_READY"
      pattern: "fusen_replenish_pool"
---

<objective>
Pool 補充オーケストレーション（常時 3 個維持・起動時補充）と、グローバル Ctrl+N（settings.json カスタマイズ可能）を Wave 4 で完成させる。

Purpose: PERF-02 連打耐性（pool=3 で 1.5s/3 回吸収）、PERF-03 17 付箋負荷耐性（webview 新規作成しない構造）、PERF-07 グローバルショートカット、PERF-08 settings.json カスタマイズの 4 要件を満たす。pitfall 4（local/global 二重発火）と pitfall 8（起動時 CPU 競合）を回避。

Output: lib.rs / settings.rs / StickyNote.tsx / page.tsx 改修 + settings-store.test.ts 拡張。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-CONTEXT.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-RESEARCH.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-02-SUMMARY.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-03-SUMMARY.md
@src-tauri/src/lib.rs
@src-tauri/src/settings.rs
@lib/settings-store.test.ts

<interfaces>
<!-- 既存パターン -->

From src-tauri/src/lib.rs:1937 (Ctrl+Shift+H 既存登録 — 参考実装):
```rust
use tauri_plugin_global_shortcut::{Builder, Shortcut, ShortcutState, GlobalShortcutExt, Code, Modifiers};
// 既に Ctrl+Shift+H で登録パターンあり、Ctrl+N も同パターンで追加
```

From src-tauri/src/settings.rs:
- `pub struct Settings { ... }` の serde Serialize/Deserialize
- `storage::load_settings() -> Settings`

From src-tauri/src/lib.rs:669-670:
- `LAST_POOL_CREATE_MS: AtomicU64` セーフティネット（Rust 500ms スロットル）
- 既存 `fusen_create_pool_window` (line 1146) はそのスロットル参照済み

Pool target:
- `const POOL_TARGET: usize = 3;` を lib.rs に追加
- `usedPoolWindowsRef` (page.tsx:520) と整合させる
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: settings.rs 拡張 + lib/settings-store.test.ts でカスタムショートカット parse</name>
  <files>src-tauri/src/settings.rs, lib/settings-store.test.ts</files>
  <behavior>
    - Settings 構造体に `shortcut_new_note: Option<String>` を追加（serde で `default` skip serialize）
    - 既存 settings.json は `shortcut_new_note` フィールド無しでも `None` で deserialize 成功（後方互換）
    - "ctrl+n" / "ctrl+shift+m" 等の文字列を `Shortcut::parse` で解釈できる前提（解釈は lib.rs 側、settings は文字列保持のみ）
    - Test (lib/settings-store.test.ts 既存): `shortcut_new_note` フィールド付き settings.json を読み込んでフィールドが正しく取れることを検証
  </behavior>
  <action>
    1. `src-tauri/src/settings.rs` の `pub struct Settings` に追加:
       ```rust
       #[serde(default, skip_serializing_if = "Option::is_none")]
       pub shortcut_new_note: Option<String>,
       ```
       (`default` 属性で field 欠落時 None になる)
    2. 既存の Default impl があれば `shortcut_new_note: None` を追加
    3. `lib/settings-store.test.ts` を拡張:
       - 既存テストパターンに合わせて `'shortcut_new_note: "ctrl+shift+m" を含む settings を読むと値が取れる'` ケースを追加
       - 既存のフィールドが消えていない（後方互換）ことも併せて検証
    4. **避けるべきこと**:
       - settings.rs 側で Shortcut::parse まで実装する（責務分離、parse は lib.rs グローバルショートカット登録時）
       - 既存 Default 値の変更（regression リスク）
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml settings && npx vitest run lib/settings-store.test.ts</automated>
  </verify>
  <done>
    Settings 構造体に shortcut_new_note フィールドが追加され、既存 settings.json は後方互換で読める。Vitest で文字列値が読める。
  </done>
</task>

<task type="auto">
  <name>Task 2: tauri-plugin-global-shortcut で Ctrl+N 登録（競合解決込み）+ Pool 補充オーケストレーション</name>
  <files>src-tauri/src/lib.rs</files>
  <action>
    1. `lib.rs` 上部に定数追加: `const POOL_TARGET: usize = 3;`
    2. **補充判定ロジックを純粋関数として抽出**（テスト可能にするため）:
       ```rust
       /// 現在の pool 窓数と目標数から不足数を返す純粋関数。
       /// テスト可能な形に分離（ファイルシステム・OS API に依存しない）。
       pub(crate) fn count_missing_pool(current: usize, target: usize) -> usize {
           target.saturating_sub(current)
       }
       ```
       `fusen_replenish_pool` コマンド内でこの関数を呼んで補充数を決定する:
       ```rust
       let current_count = app.webview_windows().values()
           .filter(|w| w.label().starts_with("pool-window-"))
           .count();
       let missing = count_missing_pool(current_count, POOL_TARGET);
       ```
    3. `tauri::Builder::setup` 内で global_shortcut プラグイン登録（既存 Ctrl+Shift+H と並列）:
       - `storage::load_settings().shortcut_new_note` を取得 → 無ければデフォルト `"ctrl+n"`
       - `Shortcut::parse(&shortcut_str).unwrap_or_else(|_| Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN))` でフォールバック付き parse（pitfall: parse 失敗で起動失敗を回避）
       - handler 内で **競合解決**（pitfall 4 対策）:
         ```rust
         if event.state() != ShortcutState::Pressed { return; }
         if sc != &parsed { return; }
         // 付箋窓に focus があればローカルに任せる
         let focused = app.webview_windows().values()
             .any(|w| w.is_focused().unwrap_or(false));
         if focused { return; }
         // メインウィンドウ（または全付箋）へ create を要求
         let _ = app.emit("fusen:request_create_global", ());
         ```
       - **避けるべきこと**: 既存 Ctrl+Shift+H の登録ブロックを書き換える（regression）。既存とは別の Builder/別の register で並列追加する
    4. **Pool 補充コマンド** `fusen_replenish_pool` を新規追加:
       - 引数: `app: tauri::AppHandle`
       - 内部で `app.webview_windows()` を走査し `pool-window-*` で始まるラベルを数える（current_count）
       - `count_missing_pool(current_count, POOL_TARGET)` で不足数を計算
       - 不足数 N に対し **順次 1 個ずつ** create_pool_window_internal を呼ぶ（補充並列度 1、CONTEXT 決定事項）
       - `LAST_POOL_CREATE_MS` セーフティネット 500ms スロットルは既存通り尊重
       - `tauri::async_runtime::spawn` で非同期に処理（呼び出し側を block しない）
    5. **Rust unit test を追加** (`pool_tests` モジュールに):
       ```rust
       #[test]
       fn replenish_count_missing() {
           assert_eq!(count_missing_pool(0, 3), 3);
           assert_eq!(count_missing_pool(2, 3), 1);
           assert_eq!(count_missing_pool(3, 3), 0);
           assert_eq!(count_missing_pool(5, 3), 0); // 超過時は 0（saturating_sub）
       }
       ```
    6. **起動時補充**: tauri::Builder::setup 内、付箋復元完了後（既存の load_initial_notes 等の完了後 / main window ready event 後）に `tauri::async_runtime::spawn(async move { for _ in 0..POOL_TARGET { create_pool_window_internal(&app)?; sleep(500ms) } })` を呼ぶ（pitfall 8 対策、CPU 競合回避）。具体的なフックポイントは既存コード (line 1937 付近の setup) を読んで決定
    7. perflog: `POOL_REPLENISH_START`, `POOL_REPLENISH_DONE`, `POOL_EXHAUSTED`, `FALLBACK_OPEN_NOTE` イベントを記録
    8. **避けるべきこと**:
       - グローバル shortcut で `app.global_shortcut().register()` を **重複登録**（OS エラー）
       - 並列 N 個同時 create（CPU スパイクで 17 付箋ブラッキング）
       - 起動時 setup の同期ブロック内で create_pool_window_internal を呼ぶ（pitfall 8）
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml replenish 2>&1 | grep -E "ok|FAILED" && cargo build --manifest-path src-tauri/Cargo.toml --release 2>&1 | grep -E "^error" | head -5</automated>
  </verify>
  <done>
    `count_missing_pool` の replenish_count_missing テストが GREEN。cargo build 成功（エラーなし）。`grep -n "fusen_replenish_pool\|fusen:request_create_global\|POOL_TARGET\|count_missing_pool" src-tauri/src/lib.rs` で 4 箇所すべてヒット。手動: アプリ起動 → タスクマネージャで 3 個 pool-window プロセスが順次 500ms 間隔で生まれる。
  </done>
</task>

<task type="auto">
  <name>Task 3: JS 側の補充トリガ + グローバル shortcut リスナー連携</name>
  <files>app/components/StickyNote.tsx, app/page.tsx</files>
  <action>
    1. `app/components/StickyNote.tsx` の handleFirstChar 内（Wave 3 で実装済み）の **末尾**に、5 秒遅延の補充トリガを追加:
       ```typescript
       setTimeout(() => {
         invoke('fusen_replenish_pool').catch(e => console.warn('replenish failed:', e));
       }, 5000);
       ```
       注釈: 「1 文字目以降は 300ms 予算外なのでリソース消費 OK」（CONTEXT 補充トリガ）
    2. `app/page.tsx` に **グローバル shortcut リスナー**を追加（既存の `fusen:promote_from_pool` listener と同様のパターン）:
       ```typescript
       useEffect(() => {
         let unlisten: (() => void) | undefined;
         (async () => {
           const { listen } = await import('@tauri-apps/api/event');
           unlisten = await listen('fusen:request_create_global', () => {
             createNewNote(/* カーソル位置 or 画面中央 */);
           });
         })();
         return () => { unlisten?.(); };
       }, [createNewNote]);
       ```
       **createNewNote は useCallback でラップすること**（useCallback なしだと毎 render で listener が再登録され、古いクロージャが積み重なる）:
       ```typescript
       const createNewNote = useCallback(async (x?: number, y?: number) => {
         // ... 既存の createNewNote 実装
       }, [/* 依存 state/refs */]);
       ```
       **座標戦略**: グローバル Ctrl+N（他アプリ focus 時）での座標は以下の順で決定:
       - `invoke('get_cursor_position')` または Tauri の `cursorPosition()` API でマウス物理座標を取得（利用可能な場合）
       - 取得失敗・タイムアウト（50ms 以内）の場合は **プライマリモニタ中央**（`screen.width / 2`, `screen.height / 2` に dpr を掛けた物理座標）にフォールバック
       - 取得成功した場合はそのカーソル位置付近（オフセット +20px）に表示
    3. **Pool 枯渇時のフォールバック側スロットル**: page.tsx createNewNote のフォールバック分岐（`openNoteWindow` ルート、Wave 3 で残した部分）に **1.2s スロットル** を残す確認（Wave 3 で残してあれば触らない、消えていたら復活させる）
    4. **避けるべきこと**:
       - 連続 invoke await（Atomic Coordination Constraint 違反）
       - 5s 補充トリガを「promote 直後」「キー入力毎」などにする（CPU リソース無駄、CONTEXT「1 文字目入力後 5s」を厳守）
       - グローバル shortcut から複数経路で createNewNote を呼ぶ（pitfall 4 二重発火）
       - createNewNote を useCallback でラップせずに useEffect の依存配列に入れる（毎 render で listener 再登録）
  </action>
  <verify>
    <automated>npm run lint && npx vitest run</automated>
  </verify>
  <done>
    lint 通過 + 既存 vitest 全件 GREEN。createNewNote が useCallback でラップされている（grep "useCallback.*createNewNote\|createNewNote.*useCallback" app/page.tsx でヒット）。手動 (`npm run tauri dev`):
    - メモ帳に focus → Ctrl+N → 付箋手前表示（PERF-07 手動確認）
    - 付箋に focus → Ctrl+N → 通常通り（ローカル経路、二重発火なし）
    - 連打 3 回 → 全部 pool 経由で即表示
    - 1 文字打って 5 秒待つ → タスクマネージャで pool-window プロセス補充が走る
  </done>
</task>

</tasks>

<verification>
- `cargo test --manifest-path src-tauri/Cargo.toml replenish` で replenish_count_missing テスト GREEN
- `cargo test --manifest-path src-tauri/Cargo.toml` 全件 GREEN
- `npm test` 全件 GREEN
- `npm run lint` エラー無し
- 手動 (Tauri dev / build):
  - 起動後 5 秒以内に pool-window プロセスが 3 個（タスクマネージャで確認）
  - PERF-07: メモ帳 focus → Ctrl+N → 付箋表示
  - PERF-08: settings.json に `"shortcut_new_note": "ctrl+shift+m"` 追記 → 再起動 → Ctrl+Shift+M で付箋表示
  - 連打 1.5s で 3 回 Ctrl+N → 3 付箋全部即表示、4 回目はトースト + 通常生成
- grep `fusen:request_create_global` で Rust emit と JS listen が対応している
- grep `useCallback` が page.tsx の createNewNote 定義付近にヒットする
</verification>

<success_criteria>
- POOL_TARGET=3 の補充オーケストレーションが Rust 側で実装され、起動時 + T2_READY+5s 補充トリガで動作
- count_missing_pool 純粋関数が抽出され、replenish_count_missing Rust unit test が GREEN
- tauri-plugin-global-shortcut で Ctrl+N がグローバル登録され、is_focused 競合解決が効く
- settings.json shortcut_new_note でショートカットがカスタマイズ可能
- Wave 3 で実装した PoolWaitToast がフォールバック時に表示される（Wave 3 とつながる）
- 1.2s スロットルはフォールバック側のみ残存、Pool 経路は無し
- createNewNote が useCallback でラップされ、グローバル shortcut 時の座標戦略（カーソル位置→失敗時プライマリモニタ中央）が実装されている
</success_criteria>

<output>
After completion, create `.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-04-SUMMARY.md`
</output>
