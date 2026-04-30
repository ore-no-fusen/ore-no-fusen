---
phase: 19-300ms-pool-ctrl-n
plan: 02
type: execute
wave: 2
depends_on: ["19-01"]
files_modified:
  - src-tauri/src/lib.rs
  - src-tauri/src/perflog.rs
autonomous: true
requirements: [PERF-04, PERF-05, PERF-06]
must_haves:
  truths:
    - "Pool 窓は WS_EX_LAYERED + α=0 の状態で生成され、画面外負座標 (x=-10000, y=-10000) に配置される"
    - "fusen_show_at_position は 1 関数内で SetWindowPos → SetLayeredWindowAttributes(α=255) → SetForegroundWindow を連続実行する（中間に await 無し）"
    - "fusen_create_note_lazy が 1 文字目時に呼ばれ、連番計算 + ファイル作成を Mutex 1 トランザクションで実施"
    - "WS_EX_LAYERED は OR パターンで付与され、既存 EX style（WS_EX_TOOLWINDOW 等）が消えない"
    - "α=0 中はクリックスルー、画面外配置のため誤操作リスクなし"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      provides: "fusen_show_at_position 拡張、create_pool_window_internal LAYERED 化、fusen_create_note_lazy 新規"
      contains: "SetLayeredWindowAttributes, WS_EX_LAYERED, fusen_create_note_lazy"
    - path: "src-tauri/src/perflog.rs"
      provides: "T1_RUST_ENTER, T_PROMOTE_START, T2_READY ログ呼び出し追加"
  key_links:
    - from: "fusen_show_at_position"
      to: "SetLayeredWindowAttributes(α=255)"
      via: "windows crate Win32_UI_WindowsAndMessaging"
      pattern: "SetLayeredWindowAttributes.*255"
    - from: "create_pool_window_internal"
      to: "GetWindowLongPtrW | WS_EX_LAYERED"
      via: "OR パターン（pitfall 2 対策）"
      pattern: "GetWindowLongPtrW.*\\|.*WS_EX_LAYERED"
    - from: "fusen_create_note_lazy"
      to: "AppState Mutex"
      via: "既存 fusen_create_note と同じ排他"
      pattern: "state\\.lock\\(\\)"
---

<objective>
Rust 側のコア実装を Wave 2 で完成させる。Pool 窓を WS_EX_LAYERED + α=0 で透明状態に作り、Ctrl+N 時は 1 つの Rust 関数内で SetWindowPos + α=255 + SetForegroundWindow を連続実行する。さらに 1 文字目時に呼ぶ `fusen_create_note_lazy` を分離して空メモ.md のゴミを防ぐ。

Purpose: Phase 19 の物理基盤。Win32 標準 API のみで構成し、新ライブラリは入れない。Atomic Coordination Constraint（JS から複数 invoke await 禁止）を物理的に守るため、JS 側にビジネスロジックを置けない構造にする。

Output: lib.rs の 3 関数（拡張 fusen_show_at_position / 改修 create_pool_window_internal / 新規 fusen_create_note_lazy）+ perflog 呼び出し挿入 + Wave 0 で `#[ignore]` にしていた pool_tests 3 関数を有効化。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-CONTEXT.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-RESEARCH.md
@.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-01-SUMMARY.md
@src-tauri/src/lib.rs
@src-tauri/src/storage.rs
@src-tauri/src/logic.rs
@src-tauri/src/state.rs
@src-tauri/Cargo.toml

<interfaces>
<!-- 既存関数のシグネチャ — RESEARCH.md で確認済み -->

From src-tauri/src/lib.rs:1066 (fusen_show_at_position 既存):
```rust
#[tauri::command]
async fn fusen_show_at_position(
    label: String,
    phys_x: Option<i32>,
    phys_y: Option<i32>,
    phys_width: u32,
    phys_height: u32,
    app: tauri::AppHandle,
) -> Result<(), String>
```

From src-tauri/src/lib.rs:132 (fusen_create_note 既存):
```rust
#[tauri::command]
fn fusen_create_note(
    state: State<'_, Mutex<AppState>>,
    folder_path: String,
    context: String,
) -> Result<Note, String>
```

From src-tauri/src/lib.rs:1146 (fusen_create_pool_window 既存):
```rust
#[tauri::command]
async fn fusen_create_pool_window(app: tauri::AppHandle) -> Result<(), String>
```

From src-tauri/src/lib.rs:1166 (create_pool_window_internal):
```rust
fn create_pool_window_internal(app: &tauri::AppHandle) -> Result<(), String>
```

windows crate features required (確認のうえ Cargo.toml に追加):
- Win32_UI_WindowsAndMessaging（既存、SetLayeredWindowAttributes/WS_EX_LAYERED/GWL_EXSTYLE）
- Win32_Foundation（既存、HWND/COLORREF）
- Win32_Graphics_Gdi（必要なら）

LWA_ALPHA, COLORREF は windows crate で提供される定数。
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: create_pool_window_internal を WS_EX_LAYERED + α=0 化（pool=3 対応の準備）</name>
  <files>src-tauri/src/lib.rs</files>
  <behavior>
    - Pool 窓生成後に GetWindowLongPtrW で現 EX style を取得し、`current | (WS_EX_LAYERED.0 as isize)` で OR 付与
    - `SetLayeredWindowAttributes(hwnd, COLORREF(0), 0, LWA_ALPHA)` で α=0 に設定
    - `ShowWindow(hwnd, SW_SHOWNOACTIVATE)` で表示（α=0 のため見えない）
    - 事前配置座標は **画面外負座標 (x=-10000, y=-10000)** に SetWindowPos で移動（pitfall 3 対策）
    - WebviewWindowBuilder は `.transparent(false).visible(false).focused(false).skip_taskbar(true).build()` で作る（visible は後から SW_SHOWNOACTIVATE で立てる、pitfall 1 対策）
    - 既存の `LAST_POOL_CREATE_MS` 500ms スロットルは残す（セーフティネット）
    - perflog: pool 生成完了時に `log_event(run_id="pool-init-{uuid}", "POOL_CREATED", Some(label), None, json!({}))` を記録
    - Test (lib.rs `pool_tests::pool_window_layered`): Windows runner で実 HWND を取得し WS_EX_LAYERED フラグと画面外座標を確認する。非 Windows では skip。
  </behavior>
  <action>
    1. `src-tauri/src/lib.rs:1166` の `create_pool_window_internal` を RESEARCH.md Pattern 2 のコードに従って改修:
       - `.visible(false)` で build → 直後に SetWindowLongPtrW(OR) → SetLayeredWindowAttributes(α=0) → ShowWindow(SW_SHOWNOACTIVATE) の順序を厳守（pitfall 1）
       - SetWindowPos で `(-10000, -10000)` に配置（SWP_NOACTIVATE | SWP_NOSIZE フラグ使用）
       - HWND 取得は既存 lib.rs:1086-1093 の `raw_window_handle::HasWindowHandle` パターンを再利用
       - エラーハンドリングは既存と同じく `Result<(), String>` で format! map_err
    2. 必要な windows crate import を追加（既存パターンに準拠）:
       ```rust
       use windows::Win32::UI::WindowsAndMessaging::{
           GetWindowLongPtrW, SetWindowLongPtrW, SetLayeredWindowAttributes, ShowWindow,
           SetWindowPos, GWL_EXSTYLE, WS_EX_LAYERED, LWA_ALPHA, SW_SHOWNOACTIVATE,
           SWP_NOACTIVATE, SWP_NOSIZE, HWND_TOP,
       };
       use windows::Win32::Foundation::{HWND, COLORREF};
       ```
       Cargo.toml の `windows` features に不足があれば追加（基本 `Win32_UI_WindowsAndMessaging` だけで足りる想定）。
    3. perflog 呼び出しを追加（Pool 生成完了時の `POOL_CREATED` イベント）
    4. lib.rs 末尾の `#[cfg(test)] mod pool_tests` の `pool_window_layered` から `#[ignore]` を **外す**。テスト本体を以下のパターンで実装:
       ```rust
       #[cfg(test)]
       mod pool_tests {
           #[cfg(target_os = "windows")]
           #[test]
           #[ignore] // Windows runner のみ: cargo test -- --ignored pool_window_layered
           fn pool_window_layered() {
               // tauri::test::mock_app() でアプリを起動し create_pool_window_internal を呼ぶ
               // 直後に GetWindowLongPtrW で WS_EX_LAYERED.0 ビットが立っていることを assert
               // GetWindowRect で x/y が -10000 以下であることを assert
               // このテストは実 Win32 HWND を要するため CI Linux では skip、Windows runner でのみ動作
               todo!("Wave 2 で Windows runner 上に実装")
           }
       }
       ```
       **include_str! メタテストは書かない**。ソースを文字列スキャンするアプローチはコードが dead branch にあってもパスするため、実 HWND を使う `#[ignore]` テストに統一する（コメントに Windows runner でのみ動作と明記）。
    5. **避けるべきこと**:
       - `SetWindowLongPtrW(hwnd, GWL_EXSTYLE, WS_EX_LAYERED.0 as isize)` の上書き（pitfall 2、既存 EX style が消える）
       - α=0 中に SetForegroundWindow（pitfall 6 補完、見えない窓にフォーカスする意味なし）
       - 画面端 1px 配置（pitfall 3、クリックスルーだが UX 上避ける）
       - include_str!("lib.rs") で正規表現検査するメタテスト（dead branch でもパスするため信頼性ゼロ）
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml pool_window_layered 2>&1 | grep -E "ok|ignored"</automated>
  </verify>
  <done>
    pool_window_layered テストが Windows runner で GREEN（または `#[cfg(not(target_os="windows"))]` で skip）。create_pool_window_internal が WS_EX_LAYERED + α=0 + 画面外配置で完成。Pool 窓を 1 個作って画面に何も出ないことを手動でも確認（Pool 補充ロジック自体は Wave 3 の責務）。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: fusen_show_at_position に α=0→255 を追加（Pattern 1 Atomic Coordination）</name>
  <files>src-tauri/src/lib.rs, src-tauri/src/perflog.rs</files>
  <behavior>
    - 既存 fusen_show_at_position の SetWindowPos 直後に `SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)` を **同関数内で連続呼び出し**
    - 順序: SetWindowPos（位置移動）→ SetLayeredWindowAttributes(α=255) → SetForegroundWindow（pitfall 6: α=255 が先、見える状態で focus を取る）
    - `run_id` 引数を追加（オプション、Some(&str) なら perflog 記録）。シグネチャ拡張で既存呼び出し側も適合させる
    - perflog: `T1_RUST_ENTER`（関数突入時）と `T2_READY`（SetForegroundWindow 後）を記録
    - Test: `pool_tests::fusen_show_at_position_atomic` を Windows runner 限定・`#[ignore]` で実装。実際に mock_app + visible window を生成し、fusen_show_at_position を呼んだ後に GetLayeredWindowAttributes で alpha=255 を読み戻して assert する。
  </behavior>
  <action>
    1. `src-tauri/src/lib.rs:1066` の `fusen_show_at_position` を改修:
       - 引数に `run_id: Option<String>` を追加
       - SetWindowPos 直後・SetForegroundWindow 直前に `SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)` を挿入
       - エラーは既存と同じく `.map_err(|e| format!("SetLayeredWindowAttributes(255): {}", e))?`
       - 関数突入時に `if let Some(rid) = &run_id { perflog::log_event(rid, "T1_RUST_ENTER", Some(&label), None, serde_json::json!({})); }`
       - SetForegroundWindow 後に `T2_READY` を記録
    2. **既存 fusen_show_at_position の呼び出し側**を grep で全て洗い出し、`run_id: None` を追加して引数互換を保つ（pool 経由でない通常 show も継続動作）
    3. `pool_tests::fusen_show_at_position_atomic` の `#[ignore]` を外して実装:
       ```rust
       #[cfg(target_os = "windows")]
       #[test]
       #[ignore] // Windows runner でのみ実行: cargo test -- --ignored fusen_show_at_position_atomic
       fn fusen_show_at_position_atomic() {
           // tauri::test::mock_app() で可視ウィンドウを生成
           // fusen_show_at_position を呼んだ直後に GetLayeredWindowAttributes で alpha 値を読み戻す
           // assert_eq!(alpha, 255, "alpha must be 255 after fusen_show_at_position");
           // 実 HWND を要するため Linux CI では skip
           todo!("Wave 2 で Windows runner 上に実装")
       }
       ```
       **include_str!("lib.rs") を使った文字列スキャンテストは書かない**。dead branch にあるコードでもパスしてしまうため保証にならない。実 HWND を使うか、Windows runner がない場合は `#[ignore]` で明示的に skip する。
    4. **避けるべきこと**:
       - SetForegroundWindow → SetLayeredWindowAttributes(α=255) の順（pitfall 6: 透明な窓に focus が乗ると 1 文字目が消える）
       - JS 側で複数 invoke await（CONTEXT.md「Atomic Coordination Constraint」明示違反）
       - include_str! によるソーステキスト正規表現スキャン（動作保証にならない）
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml fusen_show_at_position_atomic 2>&1 | grep -E "ok|ignored" && cargo test --manifest-path src-tauri/Cargo.toml --no-run</automated>
  </verify>
  <done>
    fusen_show_at_position_atomic が Windows runner で GREEN（または ignored）。lib.rs 全体がコンパイル成功。既存 fusen_show_at_position 呼び出し箇所が `run_id: None` で適合済み。
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: fusen_create_note_lazy 新規（1 文字目 lazy ファイル作成）</name>
  <files>src-tauri/src/lib.rs</files>
  <behavior>
    - `fusen_create_note_lazy(state, folder_path, context) -> Result<Note, String>` 新規追加
    - 既存 fusen_create_note と同じ処理だが、明示的に「1 文字目時のみ呼ぶ」用途として分離
    - Mutex<AppState> lock を get_next_seq → write_note → apply_add_note の全区間で保持（既存と同じ排他、pool 窓間レース回避）
    - **フロントエンドからの呼び出し**: 既存 fusen_create_note との違いは name のみ。本体ロジックは同等。重複削減のために共通 helper 関数 `do_create_note(state, folder_path, context)` を作って両方から呼ぶのが望ましい
    - Test: `pool_tests::pool_lazy_create` を有効化。tempfile で空フォルダを作り、fusen_create_note_lazy を 2 回連続呼び出して連番が 001, 002 になることを assert（Mutex 排他の確認）
  </behavior>
  <action>
    1. lib.rs に `fn do_create_note(state: &Mutex<AppState>, folder_path: &str, context: &str) -> Result<Note, String>` を private helper として追加。既存 `fusen_create_note` の中身（lib.rs:132〜）を移動。
    2. 既存 `fusen_create_note` を `do_create_note` のシン薄ラッパに変更（後方互換維持）。
    3. 新規 `#[tauri::command] fn fusen_create_note_lazy(state, folder_path, context) -> Result<Note, String>` を追加し、`do_create_note` を呼ぶ。perflog: `T2_FIRST_CHAR_RUST_ENTER` イベントを記録（任意、計測強化用）
    4. tauri::Builder の invoke_handler に `fusen_create_note_lazy` を登録
    5. `pool_tests::pool_lazy_create` の `#[ignore]` を外して実装:
       ```rust
       #[test]
       fn pool_lazy_create() {
           let tmp = tempfile::tempdir().unwrap();
           let state = Mutex::new(AppState::default());
           let n1 = do_create_note(&state, tmp.path().to_str().unwrap(), "first").unwrap();
           let n2 = do_create_note(&state, tmp.path().to_str().unwrap(), "second").unwrap();
           assert_ne!(n1.meta.path, n2.meta.path);
           // 連番が衝突しない（Mutex 排他の効果）
       }
       ```
    6. **避けるべきこと**:
       - lock を 2 回取って間で別処理（レースが入る）
       - `fusen_create_note` を消すこと（既存 page.tsx の通常生成パスは残る）
  </action>
  <verify>
    <automated>cargo test --manifest-path src-tauri/Cargo.toml pool_lazy_create</automated>
  </verify>
  <done>
    pool_lazy_create テスト GREEN。fusen_create_note_lazy が invoke_handler に登録済み。do_create_note helper で重複コードゼロ。
  </done>
</task>

</tasks>

<verification>
- `cargo test --manifest-path src-tauri/Cargo.toml pool_tests` で 3 関数すべて GREEN（Windows runner）または target_os 非 Windows で正しく skip
- `cargo build --manifest-path src-tauri/Cargo.toml --release` がコンパイル成功
- 手動: `npm run tauri dev` で起動 → アプリは正常起動 + Pool 関連の panic が無い（Pool 補充は Wave 3 で実装するため、本 Plan ではまだ pool 窓は作られない可能性あり。create_pool_window_internal を呼ぶ既存パスがあれば手動で 1 個作って透明であることを確認）
- 既存の他テスト（settings_store, lock_notification 等）が REGRESSION なし
- include_str! スキャン方式のテストが存在しない（grep "include_str" src-tauri/src/lib.rs で pool_tests 内に 0 件）
</verification>

<success_criteria>
- create_pool_window_internal が WS_EX_LAYERED + α=0 + 画面外配置（-10000, -10000）で完成
- fusen_show_at_position が SetWindowPos → α=255 → SetForegroundWindow を 1 関数で連続実行
- fusen_create_note_lazy が新規追加され、Mutex 排他で連番衝突しない
- perflog 呼び出しが T1_RUST_ENTER, T2_READY, POOL_CREATED 3 箇所に挿入されている
- pool_tests 3 関数すべてが `#[ignore]` を外して実 HWND テスト（Windows runner）または skip（非 Windows）に更新済み
- include_str! メタテストは存在しない
</success_criteria>

<output>
After completion, create `.planning/phases/19-300ms-pool-ctrl-n-1-t2-ready-300ms-pool-codemirror-ctrl-n-win32-0-255-setwindowpos-mvp-5-t2-ready-300ms-1-3-17/19-02-SUMMARY.md`
</output>
