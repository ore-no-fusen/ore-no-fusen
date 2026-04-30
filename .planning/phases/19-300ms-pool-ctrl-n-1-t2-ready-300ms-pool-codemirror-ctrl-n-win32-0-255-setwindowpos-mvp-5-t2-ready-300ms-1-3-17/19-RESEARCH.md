# Phase 19: 起動性能300ms達成（Pool 透明→不透明アーキテクチャ） - Research

**Researched:** 2026-04-30
**Domain:** Win32 LAYERED window 制御 (Tauri v2 / Windows) + CodeMirror v6 ready 検出 + JSON Lines 構造化ログ + tauri-plugin-global-shortcut
**Confidence:** HIGH（Win32 API・CodeMirror API・既存コード構造）／ MEDIUM（実機 300ms 達成可能性は未実測）

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### α 遷移（透明→不透明）の実現方法
- **WS_EX_LAYERED + SetLayeredWindowAttributes(α=0→255)** で真の「色変え」を実現
- Pool 窓は最初から表示状態（visible）かつ α=0。OS コンポジットに乗せた状態で待機
- Ctrl+N 時は **1 つの Rust コマンド**で SetWindowPos(位置) → SetLayeredWindowAttributes(α=255) を連続実行
- α=255 はフェードなしの即適用
- Pool 窓の事前配置は **画面外を含む任意位置に原寸 (400×300)** で待機、Ctrl+N 時に SetWindowPos でジャンプ

#### Pool 窓の READY 判定
- CodeMirror EditorView マウント完了 + IME 準備完了を示すコールバックで `fusen:pool_window_ready` を emit
- 既存の `fusen:pool_window_ready` イベントを厳格化して再利用

#### Pool 窓数とリプレニッシュ戦略
- **常時 3 個**を維持（連打耐性 1.5s/3回 の最小ライン）
- **補充トリガ**: 「ユーザが 1 文字目を入力（T2_READY 達成）してから 5 秒後」
- **補充上限**: 3 個。足りない分だけ補充
- **補充並列度**: 1 個ずつ順次作成
- **アプリ起動時**: 付箋復元完了後に順次作成

#### Pool 窓ライフサイクル
- 生存期間無制限。アプリ終了まで close しない
- Promote 失敗時：その pool 窓を捨てて、現状の `openNoteWindow` で従来ルートで起動
- Pool 窓 URL は現状維持（`/?path=&isPool=true`）

#### Pool 枯渇時のフォールバック
- 4 個目以降の Ctrl+N は通常ウィンドウ生成（`openNoteWindow`）にフォールバック
- 同時に「少々お待ちください」トーストを Ctrl+N を押した付箋の近くに表示（1〜2秒で消える）

#### 空メモ.md のゴミ防止
- **ファイル作成タイミング**: CodeMirror に 1 文字目が input された瞬間（lazy 作成）
- **連番計算**: 1 文字目の瞬間にスキャン一回で連番計算 + ファイル作成を同時実施
- 「1 文字目」の定義: CodeMirror に input イベントが 0→1 文字に変化した瞬間（IME 未確定中含む）
- ファイル未作成のまま close された場合: pool 窓を close して何もせずに終わる

#### Ctrl+N 発火範囲
- ローカルショートカット（付箋フォーカス中）+ **グローバルショートカット**（どこからでも）
- デフォルトは Ctrl+N
- カスタマイズは settings.json への手動記述

#### スロットル方針
- **JS 1.2s スロットルを撤去**（webview 新規作成しないため過去のクラッシュ原因が構造的に消える）
- **Rust 500ms スロットル（fusen_create_pool_window）はセーフティネットとして残す**
- クラッシュ防止は「アーキテクチャで原因を消す」アプローチ

#### 計測ログ（300ms 検証）
- **JSON Lines 形式の構造化ログ**（既存 ad-hoc PERF ログを置き換え）
- 記録区間: **T0(keydown) → T1(rust受信) → T2_READY(α=255完了 + フォーカスOK)**
- 解析スクリプト（`npm run perf:check` 等）で 5 回中央値を自動計算 → 300ms 判定
- CI でも実行可能な形にする

#### 負荷耐性（17付箋同時起動下）
- 「17 付箋同時起動下」=「アプリ起動完了後・17付箋表示済みの定常状態」
- pool=3 アーキテクチャでは Ctrl+N が webview 新規作成しないため、付箋数に依存せず 300ms 達成
- 起動時シナリオ: 起動直後の単発 Ctrl+N は openNoteWindow 通常パス（300ms 超過許容）

#### 実装プロセス
- 修正 → テスト → NG なら自動修正のループは最大 3 回
- 3 回失敗したらユーザにエスカレート

### Claude's Discretion
- JSON Lines ログのスキーマ詳細
- 解析スクリプト（perf:check）の実装言語・出力形式
- 「少々お待ちください」トーストの具体的なデザイン
- Pool 窓の具体的な事前配置座標
- Rust 側「1 コマンドで SetWindowPos + SetLayeredWindowAttributes」の関数名・シグネチャ
- ローカル Ctrl+N とグローバル Ctrl+N の競合解決ロジック

### Deferred Ideas (OUT OF SCOPE)
- グローバルショートカットの設定 GUI
- mac/Linux 対応（WS_EX_LAYERED は Windows 固有）
- Pool 窓のリセット再利用（promote 失敗時 reset）
- 連打 4 個目以降の特別演出（プログレスバー等）
- pool 窓の DevTools 制御
- マルチモニタでの pool 窓事前配置最適化

---

## Phase Requirements

提案する PERF-XX 要件 ID と RESEARCH 内容との対応表（planner で REQUIREMENTS.md に追記する想定）。

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-01 | Ctrl+N → T2_READY が 5回中央値で 300ms 以下 | JSON Lines 計測ログ + 解析スクリプト（§Validation Architecture） |
| PERF-02 | 1.5秒間に 3 回 Ctrl+N で破綻しない（pool=3 維持・枯渇時フォールバック） | pool 補充戦略 + 「少々お待ちください」トースト（§Architecture Patterns） |
| PERF-03 | 17 付箋同時起動下でも 300ms 達成 | webview 新規作成しない設計（pool 事前準備）→ 付箋数非依存（§Don't Hand-Roll #1） |
| PERF-04 | 1 文字も入力されないまま閉じた場合 .md ファイルがゴミとして残らない | lazy ファイル作成（CodeMirror 0→1 文字遷移トリガ）（§Pattern 4） |
| PERF-05 | Pool 窓は透明状態で事前完全準備（描画完了・CodeMirror マウント済・編集モード待機） | WS_EX_LAYERED+α=0 で WM_PAINT 受信＝完全描画される（§Standard Stack #1） |
| PERF-06 | Ctrl+N 時は Win32 レベルで α=0→255 と SetWindowPos 位置移動のみで実現 | `fusen_show_at_position` 拡張：1 関数内で SetWindowPos+SetLayeredWindowAttributes 連続実行（§Pattern 1） |
| PERF-07 | グローバルショートカット Ctrl+N で動作 | tauri-plugin-global-shortcut（既に依存あり）（§Standard Stack #4） |
| PERF-08 | settings.json でショートカットをカスタマイズできる | `settings.rs` の `Settings` 構造体に `shortcut_new_note: Option<String>` 追加（§Pattern 5） |

---

## Summary

Phase 19 の核心は **「Ctrl+N の瞬間に新しい webview を作らない」** こと。Win32 の **WS_EX_LAYERED + SetLayeredWindowAttributes(α=0→255)** を使い、Pool 窓を「色だけ変えて表示」する。これにより付箋数（17 枚）や CPU 負荷に依存せず、300ms 予算内に「1 文字目を打てる状態」を達成する。

技術的には全て Win32 標準 API（windows crate v0.52、Tauri v2 標準のグローバルショートカットプラグイン、CodeMirror v6 標準の updateListener）の組合せで実現可能。新しいライブラリは不要。「ハンドロールしない」原則の例外は **JSON Lines ログ解析**（serde_json でシリアライズ、Node.js の素のパースで集計）と、**事前配置/補充オーケストレーション**（既存 `LAST_POOL_CREATE_MS` を拡張）。

**Primary recommendation:** 既存の `fusen_show_at_position`（lib.rs:1066）を拡張し、SetWindowPos の直前に `SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA)` を 1 コマンド内で連続呼び出しする。Pool 作成時に `WS_EX_LAYERED` を `SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current | WS_EX_LAYERED)` で付与＋`SetLayeredWindowAttributes(hwnd, 0, 0, LWA_ALPHA)`（α=0）で透明化。これだけで「描画は走るが見えない」状態が成立する（DWM が WM_PAINT を発行し続けるため）。

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `windows` (crate) | 0.52 (既存) | Win32 API バインディング — `SetLayeredWindowAttributes`, `SetWindowLongPtrW`, `GetWindowLongPtrW`, `SetWindowPos`, `WS_EX_LAYERED` | Microsoft 公式バインディング。既に Cargo.toml 登録済み（`Win32_UI_WindowsAndMessaging` feature） |
| `tauri-plugin-global-shortcut` | 2 (既存) | グローバル Ctrl+N 登録（settings.json で上書き） | Tauri v2 公式プラグイン。既に Ctrl+Shift+H で利用中 |
| `@codemirror/view` | ^6.39.9 (既存) | `EditorView.updateListener` で `update.docChanged && view.state.doc.length === 1` を検出（0→1 文字遷移） | プロジェクト標準のエディタ |
| `serde_json` | 1.0 (既存) | JSON Lines 形式での構造化ログシリアライズ | Rust のデファクト |
| `chrono` | 0.4 (既存) | ログのタイムスタンプ（既に logger.rs で使用） | プロジェクト標準 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `raw-window-handle` | 0.6 (既存) | Tauri の `webview.window_handle()` から `HWND` を取り出す | 既存パターン（lib.rs:1086-1093）をそのまま再利用 |
| Vitest + Testing Library | 既存 | CodeMirror 0→1 文字遷移ロジックの単体テスト | `app/components/StickyNote.test.tsx` 既存パターン |
| Playwright | 既存 (1.57.0) | E2E：実 Tauri ビルドでの 300ms 計測 | `tests/sticky-note.spec.ts` 既存パターン |
| Node.js (built-in) | 20+ | `npm run perf:check` スクリプト（JSON Lines パース・中央値計算） | 追加ランタイム不要 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `SetLayeredWindowAttributes` (per-window α) | `UpdateLayeredWindow` (per-pixel α) | UpdateLayeredWindow は per-pixel α を扱える代わりに、自前で全コンテンツを描画する必要があり WebView2 と非互換。**選ばない** |
| `WS_EX_LAYERED + α=0`（透明化） | `visible(false) → show()`（非表示→表示） | show() は WINDOWPLACEMENT 復元・初回 WM_PAINT 走行などで遅い。Pool 設計の前提と矛盾。**選ばない** |
| Rust の `tracing` クレート | 自前 JSON Lines 出力 | tracing は強力だが既存 logger.rs（serde_json::to_string_pretty 1 行）で十分。導入コスト高。**選ばない** |
| クライアント JS で T2_READY 計測 | Rust + JS 双方計測 | JS で計測すると Rust→JS の IPC 往復が予算に乗らない。**Rust の `RUST_EXIT` 直前で記録**するのが正確 |

**Installation:**
- 追加インストール不要。すべて既存依存。

---

## Architecture Patterns

### Recommended Project Structure
```
src-tauri/src/
├── lib.rs              # 既存：fusen_show_at_position を拡張、Ctrl+N グローバルショートカット登録
├── pool.rs             # [NEW] Pool 窓ライフサイクル管理（生成・補充・枯渇判定・promote）
│                       #       既存の create_pool_window_internal を移動
├── perflog.rs          # [NEW] JSON Lines 構造化ログ（perf_log_event(event, fields)）
├── settings.rs         # 既存：Settings 構造体に shortcut_new_note フィールド追加
└── logger.rs           # 既存：そのまま（人間可読ログ）
app/
├── components/
│   ├── StickyNote.tsx  # 既存：fusen:pool_window_ready 厳格化、1文字目検出ハンドラ追加
│   └── RichTextEditor.tsx # 既存：onFirstChar コールバック追加（オプション）
├── page.tsx            # 既存：createNewNote の lazy ファイル作成対応
└── components/PoolWaitToast.tsx # [NEW] 「少々お待ちください」トースト
scripts/
└── perf-check.mjs      # [NEW] JSON Lines を読んで中央値を計算（npm run perf:check）
```

### Pattern 1: 「色変えだけで表示」コマンド（Rust 1 関数で完結）
**What:** SetWindowPos（位置移動）→ SetLayeredWindowAttributes（α=0→255）を 1 つの async コマンドで連続実行する。中間に await を入れない。
**When to use:** Pool 窓の promote 時に、JS から 1 invoke で完結させる。
**Why:** JS から複数 invoke を await すると Tokio タスク切り替え（最低 ~1ms × 数回）が予算に乗る。Rust 内で連続実行すれば数百μs で済む。

**Example (existing `fusen_show_at_position` を拡張):**
```rust
// Source: src-tauri/src/lib.rs:1066 を拡張する形
#[tauri::command]
async fn fusen_show_at_position(
    label: String,
    phys_x: Option<i32>,
    phys_y: Option<i32>,
    phys_width: u32,
    phys_height: u32,
    app: tauri::AppHandle,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SetForegroundWindow, SetLayeredWindowAttributes,
            HWND_TOP, SWP_SHOWWINDOW, SWP_NOMOVE, LWA_ALPHA,
        };
        use windows::Win32::Foundation::{HWND, COLORREF};
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};

        if let Some(win) = app.get_webview_window(&label) {
            unsafe {
                if let Ok(handle) = win.window_handle() {
                    if let RawWindowHandle::Win32(h) = handle.as_raw() {
                        let hwnd = HWND(h.hwnd.get());
                        // (1) 位置移動 (SWP_NOACTIVATE で focus 競合を避ける選択肢あり)
                        let flags = if phys_x.is_some() { SWP_SHOWWINDOW }
                                    else { SWP_SHOWWINDOW | SWP_NOMOVE };
                        SetWindowPos(hwnd, HWND_TOP, phys_x.unwrap_or(0), phys_y.unwrap_or(0),
                                     phys_width as i32, phys_height as i32, flags)
                            .map_err(|e| format!("SetWindowPos: {}", e))?;
                        // (2) α=255 へ即時遷移（フェードなし）
                        SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)
                            .map_err(|e| format!("SetLayeredWindowAttributes: {}", e))?;
                        // (3) フォアグラウンド化（既存どおり）
                        let _ = SetForegroundWindow(hwnd);
                    }
                }
            }
        }
    }
    Ok(())
}
```
*Source: 既存 lib.rs:1066-1143 + Microsoft Learn `SetLayeredWindowAttributes` doc*

### Pattern 2: Pool 窓生成時に WS_EX_LAYERED を付与＋α=0 で透明化
**What:** Tauri の `WebviewWindowBuilder` には WS_EX_LAYERED フラグ指定 API がない。`build()` 後に Win32 API で付与する。
**When to use:** `create_pool_window_internal`（lib.rs:1166）を改修するとき。
**Critical:** `transparent(false).visible(true)` で生成し、build 完了直後に LAYERED+α=0 を設定。**この順序が逆だと一瞬 visible=true で α=255 のまま見えてしまう**。

**Example:**
```rust
// Source: src-tauri/src/lib.rs:1166 + MS Learn / windows-rs docs
fn create_pool_window_internal(app: &tauri::AppHandle) -> Result<(), String> {
    let uuid = uuid::Uuid::new_v4().to_string();
    let label = format!("pool-window-{}", uuid);

    let win = tauri::WebviewWindowBuilder::new(
        app, &label, tauri::WebviewUrl::App("/?path=&isPool=true".into())
    )
    .title("Quick Memo")
    .transparent(false)
    .decorations(false)
    .visible(false)         // ★ build 直後はまだ非表示
    .focused(false)
    .skip_taskbar(true)
    .build()
    .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    unsafe {
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, SetWindowLongPtrW, SetLayeredWindowAttributes,
            ShowWindow, GWL_EXSTYLE, WS_EX_LAYERED, LWA_ALPHA, SW_SHOWNOACTIVATE,
        };
        use windows::Win32::Foundation::{HWND, COLORREF};
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};

        if let Ok(handle) = win.window_handle() {
            if let RawWindowHandle::Win32(h) = handle.as_raw() {
                let hwnd = HWND(h.hwnd.get());
                // (1) 既存 EX style に WS_EX_LAYERED を OR で追加
                //     (上書きすると既存フラグが失われるため OR 必須)
                let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                SetWindowLongPtrW(hwnd, GWL_EXSTYLE, cur | (WS_EX_LAYERED.0 as isize));
                // (2) α=0 にして「描画は走るが見えない」状態を作る
                SetLayeredWindowAttributes(hwnd, COLORREF(0), 0, LWA_ALPHA)
                    .map_err(|e| format!("SetLayeredWindowAttributes(0): {}", e))?;
                // (3) ここで初めて visible=true（α=0 なので画面には何も出ない）
                //     ShowWindow(SW_SHOWNOACTIVATE) でフォーカスを奪わない表示
                let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
                // → 以後 WM_PAINT が走り、CodeMirror DOM が完全描画される
            }
        }
    }
    Ok(())
}
```
*Source: 既存 lib.rs:1166 + MS Learn `SetLayeredWindowAttributes` doc + [Layered Windows gist (retorillo)](https://gist.github.com/retorillo/3a12e0f7e6ae3d49771f2919608f8498)*

### Pattern 3: CodeMirror v6 — エディタ ready 検出
**What:** `EditorView` の constructor が同期的に DOM を組むため、コンストラクタが return した直後に view.dom が DOM に挿入されている。**ただし** layout/paint は次の rAF 以降。「本当に編集可能」と言える条件は以下の組合せ:

1. `viewRef.current !== null`（既存 `RichTextEditor.tsx:495` で管理済み）
2. `view.contentDOM` が `document.activeElement` の親であるか、`view.hasFocus` が動作する
3. requestAnimationFrame 1 回経過（最初のレイアウトパス完了）

**When to use:** Pool 窓側で `fusen:pool_window_ready` を emit する直前のチェックに使う。

**Example:**
```typescript
// Source: 既存 RichTextEditor.tsx:920 + 既存 StickyNote.tsx:692
// (Pool 窓専用 effect の中で)
useEffect(() => {
  if (!isPool) return;
  let cancelled = false;

  const waitReady = async () => {
    // (1) RichTextEditor が view を構築するまで待つ（既存ロジック）
    while (!editorRef.current && !cancelled) {
      await new Promise(r => requestAnimationFrame(r));
    }
    if (cancelled) return;

    // (2) 1 frame 描画完了を待つ（layout/paint 完了確認）
    await new Promise(r => requestAnimationFrame(r));

    // (3) emit ready
    const { emit } = await import('@tauri-apps/api/event');
    const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const thisWin = getCurrentWebviewWindow();
    emit('fusen:pool_window_ready', { label: thisWin.label });
  };
  waitReady();
  return () => { cancelled = true; };
}, [isPool]);
```
*Source: [CodeMirror Reference Manual](https://codemirror.net/docs/ref/) + 既存 `app/components/RichTextEditor.tsx:495,919`*

### Pattern 4: 1 文字目検出 → lazy ファイル作成（レース回避）
**What:** CodeMirror の `EditorView.updateListener` で `update.docChanged && update.startState.doc.length === 0 && update.state.doc.length > 0` を検出した瞬間に、Rust 側の **新コマンド `fusen_create_note_lazy`** を呼ぶ。Rust 側で「連番計算 → ファイル作成 → state 登録」を Mutex で 1 トランザクションで実施し、複数 pool 窓間のレースを排除する。

**IME 注意:** `compositionstart` 中でも CodeMirror は `docChanged` を発火する（プレエディット文字列を doc に反映するため）。**プレエディット中の文字も「1 文字目」として扱う**（仕様）。これにより日本語入力でも作動する。

**When to use:** `RichTextEditor.tsx:1111` の updateListener を拡張。

**Example:**
```typescript
// Source: 既存 RichTextEditor.tsx:1111 + CodeMirror discuss thread
// 既存 updateListener に追加
EditorView.updateListener.of((update: ViewUpdate) => {
  if (update.docChanged) {
    onContentChange(update.state.doc.toString());
    // [PERF|T2_FIRST_CHAR] 0→1 文字遷移を検出
    if (update.startState.doc.length === 0 && update.state.doc.length > 0) {
      onFirstChar?.();   // ← 親の StickyNote.tsx に通知
    }
  }
  // ... 既存処理
})
```

```rust
// [NEW] Rust 側: fusen_create_note を 2 段階に分割
// 1) fusen_calc_next_seq(folder_path) → seq （pool 待機中に呼ばない、軽量）
// 2) fusen_create_note_lazy(folder_path, context) → 既存 fusen_create_note と同等
//    Mutex でレース回避：複数 pool 窓が同時に呼んでも seq が衝突しない
#[tauri::command]
fn fusen_create_note_lazy(
    state: State<'_, Mutex<AppState>>,
    folder_path: String,
    context: String,
) -> Result<Note, String> {
    // 既存 fusen_create_note と同じ処理だが、state lock を get_next_seq から
    // write_note までの全区間で保持する（既存はすでにそうなっている）
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let next_seq = storage::get_next_seq(&folder_path);  // ファイルシステム scan
    let data = logic::build_create_note_data(&folder_path, &context, next_seq, &today);
    storage::write_note(&data.path_str, &data.content)?;
    logic::apply_add_note(&mut *state.lock().unwrap(), data.meta.clone());
    Ok(Note { body: data.body, frontmatter: data.frontmatter, meta: data.meta })
}
```
*Source: 既存 `fusen_create_note` (lib.rs:132) + [CodeMirror IME thread](https://discuss.codemirror.net/t/how-to-listen-to-changes-with-ime-support/5737)*

### Pattern 5: グローバル Ctrl+N（settings.json で上書き）
**What:** `tauri-plugin-global-shortcut` で Ctrl+N を登録。settings.json の `shortcut_new_note` 値があればそれを使い、なければデフォルト `"ctrl+n"`。

**Local vs Global の競合解決:**
- ローカル Ctrl+N（StickyNote.tsx:1393）はそのウィンドウにフォーカスがある時のみ発火
- グローバル Ctrl+N はどこからでも発火（他アプリにフォーカスがあっても）
- **付箋にフォーカスがある時、両方が発火し得る** → グローバル側で `app.windows().any(focused)` をチェックし、付箋にフォーカスがあるなら何もしない（ローカルに任せる）
- もしくは、ローカル側を完全に削除しグローバルだけにする（シンプル化）。ただし「他付箋にフォーカス時は他付箋を source とした座標計算」が必要なので、**ローカル側を残し、グローバル側は「フォーカスを持つ付箋がない時のみ発火」にする**のが妥当。

**Example:**
```rust
// Source: tauri-plugin-global-shortcut v2 公式 + 既存 lib.rs:1937 (Ctrl+Shift+H)
use tauri_plugin_global_shortcut::{
    Builder as ShortcutBuilder, Shortcut, ShortcutState, GlobalShortcutExt, Code, Modifiers,
};

let shortcut_str = storage::load_settings()
    .unwrap_or_default()
    .shortcut_new_note
    .unwrap_or_else(|| "ctrl+n".to_string());

let parsed: Shortcut = shortcut_str.parse()
    .unwrap_or_else(|_| Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN));

let plugin = ShortcutBuilder::new()
    .with_shortcut(parsed.clone())   // または .with_shortcuts([...])
    .with_handler(move |app, sc, event| {
        if event.state() != ShortcutState::Pressed { return; }
        if sc != &parsed { return; }
        // (1) 付箋ウィンドウのいずれかが focused なら、ローカル側に任せる
        let focused = app.webview_windows().values()
            .any(|w| w.is_focused().unwrap_or(false));
        if focused { return; }
        // (2) 付箋に focus がない時：メインウィンドウへ create_note を要求
        let _ = app.emit("fusen:request_create_global", ());
    })
    .build();
app.handle().plugin(plugin)?;
```
*Source: [Tauri v2 Global Shortcut docs](https://v2.tauri.app/plugin/global-shortcut/)*

### Pattern 6: JSON Lines 構造化ログ
**What:** 既存の `[PERF|T0]` テキストログを JSON 行に置き換える。1 行 = 1 イベント = 1 JSON オブジェクト。改行で区切り（serde_json の `to_string` は改行を含まないため安全）。

**Schema:**
```jsonc
{"ts":"2026-04-30T12:34:56.789+09:00","run_id":"a1b2c3","event":"T0","label":null,"elapsed_ms":null,"meta":{"trigger":"local"}}
{"ts":"...","run_id":"a1b2c3","event":"T1_RUST_ENTER","label":"pool-window-xxx","elapsed_ms":12,"meta":{}}
{"ts":"...","run_id":"a1b2c3","event":"T2_READY","label":"pool-window-xxx","elapsed_ms":287,"meta":{}}
```

- `run_id`: T0 で発番した uuid。T0/T1/T2 を 1 セッションに紐づける
- `event`: `T0` | `T1_RUST_ENTER` | `T1_VISIBLE` | `T_PROMOTE_START` | `T2_READY` | `POOL_REPLENISH_START` | `POOL_REPLENISH_DONE` | `POOL_EXHAUSTED` | `FALLBACK_OPEN_NOTE`
- `elapsed_ms`: T0 からの経過 ms（T0 自身は null）
- `label`: pool 窓 label（該当しないイベントは null）

**出力先:**
- 開発時: `%LOCALAPPDATA%\ore-no-fusen\perf.jsonl`（既存 logger.rs パターンを流用）
- ストリーム to stdout（CI で見えるように）— `cfg!(debug_assertions)` 時のみ

**Example:**
```rust
// [NEW] src-tauri/src/perflog.rs
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::Write;

#[derive(Serialize)]
struct PerfEvent<'a> {
    ts: String,
    run_id: &'a str,
    event: &'a str,
    label: Option<&'a str>,
    elapsed_ms: Option<u64>,
    meta: serde_json::Value,
}

pub fn log_event(run_id: &str, event: &str, label: Option<&str>, elapsed_ms: Option<u64>, meta: serde_json::Value) {
    let ev = PerfEvent {
        ts: chrono::Local::now().to_rfc3339(),
        run_id, event, label, elapsed_ms, meta,
    };
    if let Ok(line) = serde_json::to_string(&ev) {
        // ファイル append + stdout
        if let Ok(path) = perf_log_path() {
            if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(f, "{}", line);
            }
        }
        if cfg!(debug_assertions) { println!("{}", line); }
    }
}
```

**解析スクリプト (Node.js):**
```javascript
// [NEW] scripts/perf-check.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const path = process.env.PERF_LOG ?? join(process.env.LOCALAPPDATA, 'ore-no-fusen', 'perf.jsonl');
const lines = readFileSync(path, 'utf-8').trim().split('\n');
const runs = new Map();
for (const ln of lines) {
  const ev = JSON.parse(ln);
  if (!runs.has(ev.run_id)) runs.set(ev.run_id, {});
  runs.get(ev.run_id)[ev.event] = ev.elapsed_ms;
}
const t2s = [...runs.values()].map(r => r.T2_READY).filter(x => x != null);
t2s.sort((a, b) => a - b);
const median = t2s[Math.floor(t2s.length / 2)];
console.log(`Samples: ${t2s.length}, Median T2_READY: ${median}ms`);
process.exit(median != null && median <= 300 ? 0 : 1);
```
*Source: 既存 logger.rs パターン + [JSON Lines spec](https://jsonlines.org/)*

### Anti-Patterns to Avoid
- **`SetWindowLongPtrW(hwnd, GWL_EXSTYLE, WS_EX_LAYERED.0)` で上書き設定**:既存の EX style フラグ（WS_EX_TOOLWINDOW 等）が失われる。**必ず `GetWindowLongPtrW | WS_EX_LAYERED` で OR 演算する**。
- **JS から `setLayeredWindowAttributes`（Tauri に存在しない）を呼ぼうとする**: Tauri v2 には API がない。Rust 側で実装する以外に道はない。
- **α=0 のまま `setFocus` を呼ぶ**: WS_EX_LAYERED+α=0 はクリックを通過させる挙動だが、`SetForegroundWindow` 自体は機能する。ただし**フォーカスが取れても見えない**ので意味がない。**必ず α=255 にしてからフォーカスを与える**。
- **複数 await を直列に挟む promote 処理**: JS 側で `invoke('a'); await; invoke('b'); await; invoke('c')` のような書き方は IPC 往復を予算に乗せる。**1 つのコマンドにまとめる**（既存 `fusen_show_at_position` の発想を継続）。
- **CodeMirror の `view.composing` だけで「最初の文字」を判定する**: `composing` は false の状態でも IME 確定後の transaction では true → false に遷移済み。`docChanged` + `doc.length` の 0→1 遷移で判定するのが堅実。
- **Pool ready 判定で setTimeout(N) を使う**: マシン負荷で N が足りない/長すぎる。requestAnimationFrame で「実際にレイアウト 1 回完了」を待つ。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 「事前にウィンドウを作る」最適化 | 自前 webview 再利用フレームワーク | OS が提供する WS_EX_LAYERED + α 制御 | OS は GPU 合成で α 0→255 を 1 frame で処理する。自前 hide/show は WM_PAINT・WINDOWPLACEMENT 復元・初期 layout の再走で 100ms+ 増える |
| α 段階フェード | requestAnimationFrame で 0→255 を補間 | `SetLayeredWindowAttributes(α=255)` 一発 | DWM が垂直同期で十分滑らか。フェードに 50ms 使うのは 300ms 予算では致命的 |
| 連番ファイル名衝突回避 | 自前 lock ファイル / file system watcher | Rust の `Mutex<AppState>` 内で連番計算→write を 1 トランザクション | 既存 `fusen_create_note` (lib.rs:132) がすでにこの形 |
| グローバルショートカット登録 | 自前 Win32 RegisterHotKey | `tauri-plugin-global-shortcut`（既に依存） | Tauri 公式が unregister/競合検出/IPC まで面倒見る |
| 構造化ログ | カスタムロガークラス | `serde_json::to_string()` を 1 行ずつ append | 5 行で書ける。tracing は重厚すぎる |
| 1 文字目検出 | 自前 input イベントリスナー | CodeMirror の `EditorView.updateListener` + `update.startState.doc.length === 0` | IME・貼り付け・キー入力すべてが docChanged に集約される |
| 「他付箋数で 300ms が変わるか」検証 | 自前負荷生成スクリプト | Pool アーキテクチャで構造的に依存をゼロ化 | webview 新規作成しないため、付箋数は CPU 競合経由でしか影響しない（1ms 未満想定） |

**Key insight:** Phase 19 はアプリの「最も書ける」コアパス。**性能のためのカスタム最適化を書きたくなる誘惑が強い**が、Win32 と CodeMirror の標準機能で目標達成できる。コードを増やさずアーキテクチャで解決する（ユーザの哲学：「妥協ルートを安易に採らない」「速度を犠牲にする"安全側"のコードは原則 NG」）。

---

## Common Pitfalls

### Pitfall 1: `WS_EX_LAYERED` を CreateWindow 後に SetWindowLongPtrW で付与すると、WM_PAINT が一度走らないと窓が完全に透明にならない
**What goes wrong:** Tauri が build() で window を作った直後、SetWindowLongPtrW(WS_EX_LAYERED) → SetLayeredWindowAttributes(α=0) を呼んでも、まだ最初の WM_PAINT 前なら画面に「黄色い四角」が一瞬チラつく可能性がある。
**Why it happens:** WS_EX_LAYERED は窓を「DWM の特殊レイヤー」に移すスタイル変更で、最初の paint で初めて compositor 経由になる。
**How to avoid:** `WebviewWindowBuilder` で `.visible(false)` で作り、SetWindowLongPtr+SetLayeredWindowAttributes を呼んだ**後で** `ShowWindow(SW_SHOWNOACTIVATE)` を呼ぶ（Pattern 2 の順序）。
**Warning signs:** 起動時に画面端に黄色い四角がチラつく → 順序が逆になっている。

### Pitfall 2: `SetWindowLongPtrW(hwnd, GWL_EXSTYLE, WS_EX_LAYERED)` で書き換えると既存フラグが消える
**What goes wrong:** Tauri は `WS_EX_TOOLWINDOW`（skip_taskbar）等を既に設定している。上書きすると消える。
**Why it happens:** Win32 API はビット OR 演算を自動でしない。
**How to avoid:** `let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE); SetWindowLongPtrW(hwnd, GWL_EXSTYLE, cur | (WS_EX_LAYERED.0 as isize));` の **OR パターン必須**。
**Warning signs:** Pool 窓がタスクバーに出てしまう、装飾が変わる、不整合が起きる。

### Pitfall 3: α=0 中にユーザーが Pool 窓の座標をクリックすると、Pool 窓は無視され下のウィンドウがクリックを受ける
**What goes wrong:** WS_EX_LAYERED+α=0 はクリックスルー（hit-testing が透明）になる。これは仕様だが、Pool 窓を「画面端の 1px 位置」に置いた場合、ユーザーは気づかない。
**Why it happens:** Microsoft のドキュメント通りの挙動：「areas whose alpha value is zero will let the mouse messages through」。
**How to avoid:** Pool 窓の事前配置は **画面外の負座標**（例: x=-2000, y=-2000）に置く。マルチモニタでも到達しない座標。promote 時に SetWindowPos で目的地にジャンプ。
**Warning signs:** ない（クリックスルーなのでバグになりにくい）。ただし**画面端配置は避ける**ルールを守る。

### Pitfall 4: グローバル Ctrl+N とローカル Ctrl+N の二重発火
**What goes wrong:** 付箋にフォーカスがある時、ローカル keydown とグローバル shortcut の両方が発火し、create_note が 2 回呼ばれる。
**Why it happens:** Tauri のグローバルショートカットはアプリにフォーカスがあっても発火する。
**How to avoid:** グローバル側のハンドラで `app.webview_windows().values().any(|w| w.is_focused().unwrap_or(false))` をチェックし、フォーカス窓があれば即 return（ローカルに任せる）。
**Warning signs:** Ctrl+N 1 回押したのに 2 個付箋が出る。

### Pitfall 5: CodeMirror の `update.startState.doc.length` が 0 になっていない（プリロードコンテンツがある）
**What goes wrong:** Pool 窓の RichTextEditor はマウント時に `value=""` で作るが、`isNew && rawFrontmatter` が空でもデフォルトで何か入る場合（例：previousState 復元）、`doc.length === 0` のチェックが効かない。
**Why it happens:** CodeMirror の `EditorState.create({ doc })` は doc が undefined だと空文字列になるが、もし promote_from_pool で `setEditBody` を呼んだ後に Listener が発火すると、startState は既に空でなくなっている。
**How to avoid:** **「promote 完了後に doc.length が 0 で、かつそれ以降の最初の docChanged を捕まえる」** という状態管理を Pool 専用に持つ。具体的には `useRef<boolean>(false)` の `firstCharFiredRef` を持ち、promote 後に false → 一度だけ true にする。
**Warning signs:** Lazy 作成が走らない、または 2 度走る。

### Pitfall 6: SetWindowPos の SWP_NOACTIVATE と SetForegroundWindow の競合
**What goes wrong:** 既存コードは `SWP_SHOWWINDOW`（SWP_NOACTIVATE 無し）の後 SetForegroundWindow を呼ぶ。SWP_SHOWWINDOW は activate を起こすため、SetForegroundWindow は冗長 or 競合する可能性。
**Why it happens:** Win32 のフォアグラウンド設定は複数経路から起こり、たまに OS が「フォアグラウンドに移行できない」と判断する。
**How to avoid:** **既存実装（lib.rs:1100, 1117）はすでに動作しているので踏襲する**。ただし **α=0→255 の実行は `SetForegroundWindow` の前** に置くのが正しい（フォーカス取得時に既に見える状態にする）。
**Warning signs:** ウィンドウは出るがフォーカスが取れず、最初の文字が消える。

### Pitfall 7: Pool 窓の `loadNote()` が空ファイルを読みに行ってクラッシュ
**What goes wrong:** Pool 窓は `path=""` で作られる。StickyNote の `selectedFile` が `null` でも `loadNote` が走るパスがあると、空文字 path でファイル読みに行って失敗する。
**Why it happens:** 既存コードでは `isPool` で各 effect を skip しているが、新規追加の effect で skip 漏れがある可能性。
**How to avoid:** Pool 窓専用 effect は **必ず先頭で `if (!isPool) return;`** を書く（既存パターン：StickyNote.tsx:271,584,880）。
**Warning signs:** Pool 窓が ready emit しない、ログに「ENOENT: no such file or directory ''」。

### Pitfall 8: 起動時の補充タイミングが付箋復元と被って起動時間が悪化
**What goes wrong:** 「アプリ起動完了後に pool=3 を作る」と書いたが、`tauri::Builder::setup` の中で同期的に作ると 17 付箋復元と CPU を食い合う。
**Why it happens:** WebviewWindowBuilder.build() は WebView2 の初期化を含み 200ms+ かかる。
**How to avoid:** `tauri::async_runtime::spawn` で非同期に、かつ「main window の `ready` イベントを待ってから順次 1 個ずつ」作る。
**Warning signs:** アプリ起動から 17 付箋表示までが体感で遅くなる（Phase 19 起動時の単発 Ctrl+N は 300ms 超過許容なので問題ないが、起動全体の遅延は嫌）。

### Pitfall 9: JSON Lines ログのファイルロック競合
**What goes wrong:** 複数 Pool 窓が同時に T1_VISIBLE を書こうとして、ファイル append でロックエラー。
**Why it happens:** Windows の `OpenOptions::append(true)` は exclusive lock を取らないが、bufer flush タイミングで稀に競合する。
**How to avoid:** Rust の `Mutex<()>` でログ書き込みを排他制御する。性能影響は無視できる（1 行 ~200byte の書き込みは μs オーダー）。
**Warning signs:** ログ行が混ざる、改行欠落。

### Pitfall 10: Sentry が PERF ログを「個人情報」として送信してしまう
**What goes wrong:** プロジェクトは @sentry/nextjs を使っており、console.log は捕捉される可能性がある。perf JSON Lines にユーザのファイルパスが含まれるとリーク。
**Why it happens:** Sentry の breadcrumbs が console.log を自動収集する設定がデフォルト。
**How to avoid:** PERF イベントに `path` を含めない（label は uuid なので OK）。フォルダパスは sanitize（既存 `logger.rs:113 sanitize_path` 流用）。
**Warning signs:** Sentry 上でパス情報が見える。

---

## Code Examples

Verified patterns from official sources:

### Win32: WS_EX_LAYERED 付与（OR パターン）
```rust
// Source: MS Learn SetLayeredWindowAttributes + windows-rs 0.52 docs
unsafe {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_LAYERED,
    };
    let cur = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
    SetWindowLongPtrW(hwnd, GWL_EXSTYLE, cur | (WS_EX_LAYERED.0 as isize));
}
```

### Win32: α=0 で透明化
```rust
// Source: MS Learn SetLayeredWindowAttributes
use windows::Win32::UI::WindowsAndMessaging::{SetLayeredWindowAttributes, LWA_ALPHA};
use windows::Win32::Foundation::COLORREF;
unsafe {
    SetLayeredWindowAttributes(hwnd, COLORREF(0), 0u8, LWA_ALPHA)
        .map_err(|e| format!("alpha=0 failed: {}", e))?;
}
```

### Win32: α=255 で表示（promote 時）
```rust
// Source: MS Learn SetLayeredWindowAttributes
unsafe {
    SetLayeredWindowAttributes(hwnd, COLORREF(0), 255u8, LWA_ALPHA)
        .map_err(|e| format!("alpha=255 failed: {}", e))?;
}
```

### Tauri v2: グローバル Ctrl+N の登録
```rust
// Source: https://v2.tauri.app/plugin/global-shortcut/
use tauri_plugin_global_shortcut::{
    Builder, Code, Modifiers, Shortcut, ShortcutState, GlobalShortcutExt,
};
let ctrl_n = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN);
app.handle().plugin(
    Builder::new()
        .with_handler(move |app, sc, event| {
            if event.state() == ShortcutState::Pressed && sc == &ctrl_n {
                let focused = app.webview_windows().values()
                    .any(|w| w.is_focused().unwrap_or(false));
                if !focused {
                    let _ = app.emit("fusen:request_create_global", ());
                }
            }
        })
        .build()
)?;
app.global_shortcut().register(ctrl_n)?;
```

### CodeMirror v6: 0→1 文字遷移検出
```typescript
// Source: 既存 RichTextEditor.tsx:1111 + CodeMirror 公式ドキュメント
EditorView.updateListener.of((update: ViewUpdate) => {
  if (update.docChanged) {
    if (update.startState.doc.length === 0 && update.state.doc.length > 0) {
      onFirstChar?.();
    }
    onContentChange(update.state.doc.toString());
  }
})
```

### Tauri: HWND 取得（既存パターン）
```rust
// Source: 既存 src-tauri/src/lib.rs:1086-1093
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use windows::Win32::Foundation::HWND;
unsafe {
    if let Ok(handle) = win.window_handle() {
        if let RawWindowHandle::Win32(h) = handle.as_raw() {
            let hwnd = HWND(h.hwnd.get());
            // ... use hwnd
        }
    }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `visible(false)` Pool 窓 → `show()` で表示 | `WS_EX_LAYERED + α=0` Pool 窓 → α=255 で表示 | Phase 19 で導入 | show() の WINDOWPLACEMENT 復元・初回 paint 走行を排除し、~50–100ms 短縮 |
| JS スロットル 1.2s でクラッシュ防止 | アーキテクチャでクラッシュ原因（webview 新規作成）を消す | Phase 19 で導入 | スロットルの「速度を犠牲にする"安全側"」を撤去 |
| ad-hoc 文字列ログ `[PERF\|T0]` | JSON Lines 構造化ログ | Phase 19 で導入 | 自動解析・CI 統合・回帰検知が可能に |
| ローカル Ctrl+N のみ | ローカル + グローバル Ctrl+N | Phase 19 で導入 | 他アプリにフォーカス時も発火 |
| `setTimeout(300ms)` 後に focus | requestAnimationFrame でレイアウト確定確認 | Phase 19 で改善 | 機械差で N が足りない問題を解消 |

**Deprecated/outdated:**
- `SetWindowLong` (32-bit): 64-bit 環境では `SetWindowLongPtrW` を使う。windows crate v0.52 では型シグネチャが `isize` で統一されている。
- `UpdateLayeredWindow`: WebView2 と非互換。SetLayeredWindowAttributes 一択。

---

## Open Questions

1. **Pool 窓の事前配置座標で「画面外の負座標」が安全か？**
   - What we know: WS_EX_LAYERED+α=0 はクリックスルーなので、画面内でも害は少ない。ただし α=255 切替の瞬間に位置が画面内になければ移動が必要。
   - What's unclear: マルチモニタで「全モニタの外」を保証する負座標の選び方（例：x=-10000 で全モニタの外か？）。
   - Recommendation: 実装時に `EnumDisplayMonitors` で全モニタ範囲を取得し、その左端 - 1000 の位置に置く。Tauri の `monitorFromPoint` API も使える（既存 page.tsx:563 で使用）。

2. **CodeMirror の updateListener が pool マウント時に発火する瞬間**
   - What we know: `EditorState.create({ doc: "" })` で startState は空。promote 直後に `setEditBody("")` で changes を dispatch しないため、最初の docChanged はユーザ入力時。
   - What's unclear: promote 時に `setRawFrontmatter` だけでも updateListener が発火する可能性（要実装時に確認）。
   - Recommendation: `firstCharFiredRef` を `useRef(false)` で管理し、promote 完了直後に false にリセット、初回 docChanged で true にして再入防止。

3. **SetForegroundWindow が Tauri webview で確実に動くか**
   - What we know: 既存 `fusen_show_at_position` で動作実績あり（lib.rs:1117）。
   - What's unclear: グローバル Ctrl+N から呼ばれた時、Foreground Lock（Windows 仕様：他アプリからの強奪防止）に引っかからないか。
   - Recommendation: グローバルショートカットのハンドラ内で実行されるので、「ユーザ操作直後」扱いで通常は通る。テストでは念のため `AllowSetForegroundWindow(GetCurrentProcessId())` を呼ぶオプションを検討。

4. **「1 文字も入れずに閉じた」場合のクリーンアップ**
   - What we know: Pool 窓は close 時に何もしない（ファイル未作成なので）。
   - What's unclear: Pool 窓を **再利用** するか、close するか。CONTEXT.md は「close 一択」と決めている。
   - Recommendation: CONTEXT 通り close。ただし `usedPoolWindowsRef`（page.tsx:520）から削除し、補充トリガを発火する。

5. **JSON Lines ログのプライバシー**
   - What we know: フォルダパスを含めない方針。label は uuid。
   - What's unclear: Sentry 連携で perf ログが意図せず送信されないか。
   - Recommendation: `println!`（stdout）は Sentry が拾わない。ファイル出力のみで十分。Sentry の `beforeBreadcrumb` で `[PERF` を含む console を弾く。

6. **連打時の pool=3 枯渇 → 4 個目で「少々お待ちください」トースト → ユーザが連打続行した場合**
   - What we know: 4 個目以降は openNoteWindow フォールバック（300ms 超過 OK）。
   - What's unclear: 5,6,7 個目を連打されたらどうなるか。openNoteWindow は webview 新規作成なので CPU スパイクで全付箋が固まる過去のクラッシュ再発リスク。
   - Recommendation: フォールバック側にも 1.2s スロットルを残す。「すぐ書ける」体験は pool=3 までと割り切る（CONTEXT「連打上限 N 個（pool=3）はユーザ理解させる前提で設計」）。

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (frontend) | Vitest 1.x + @testing-library/react 16.3.1 |
| Framework (E2E) | Playwright 1.57.0 |
| Framework (Rust) | `cargo test`（既存パターン：lib.rs:1996+ `#[cfg(test)] mod` + tempfile 3.8 dev-dep） |
| Config files | `vitest.config.ts`, `playwright.config.ts`, `src-tauri/Cargo.toml [dev-dependencies]` |
| Quick run command | `npm test` (vitest run, ~5s) / `cargo test --manifest-path src-tauri/Cargo.toml` |
| Full suite command | `npm test && npm run test:e2e && cargo test --manifest-path src-tauri/Cargo.toml && npm run perf:check` |
| Phase-specific | `npm run perf:check` — JSON Lines パース → 中央値判定 → exit 0/1 |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | Ctrl+N → T2_READY 中央値 ≤ 300ms (5 サンプル) | E2E + 解析スクリプト | `npm run test:e2e -- --grep "ctrl-n-300ms" && npm run perf:check` | ❌ Wave 0 (e2e/perf-300ms.spec.ts, scripts/perf-check.mjs) |
| PERF-02 | 1.5s に 3 回 Ctrl+N で 3 付箋全部出る、4 回目はトースト表示＋通常生成 | E2E | `npm run test:e2e -- --grep "ctrl-n-burst"` | ❌ Wave 0 (e2e/perf-burst.spec.ts) |
| PERF-03 | 17 付箋仕込み済みでも PERF-01 が達成 | E2E | `npm run test:e2e -- --grep "ctrl-n-loaded"` | ❌ Wave 0 (e2e/perf-load.spec.ts、テストフィクスチャで 17 付箋作成) |
| PERF-04 | 0 文字で close → ファイル無し | Vitest 単体 (Pool 専用 effect) + Rust 単体 (`fusen_create_note_lazy`) | `npm test app/components/StickyNote.pool.test.tsx && cargo test pool_lazy_create` | ❌ Wave 0 (StickyNote.pool.test.tsx, lib.rs に test mod 追加) |
| PERF-05 | Pool 窓は WS_EX_LAYERED + α=0 で待機（CodeMirror 描画完了） | Rust 単体 + 手動目視 | `cargo test pool_window_layered` (windows crate API モック)、目視確認: 起動後 `Spy++` で WS_EX_LAYERED フラグ確認 | ❌ Wave 0 (lib.rs に test mod) + manual-only (目視) |
| PERF-06 | promote 時 SetWindowPos + SetLayeredWindowAttributes が 1 invoke で完結 | Rust 単体 (関数の呼び出しシーケンス) + JSON Lines イベント順序 | `cargo test fusen_show_at_position_atomic` | ❌ Wave 0 |
| PERF-07 | グローバル Ctrl+N が他アプリ focus 時に発火 | manual-only (E2E が他アプリ起動を制御できないため) | 手動: メモ帳に focus → Ctrl+N → 付箋が出る | manual-only |
| PERF-08 | settings.json で `shortcut_new_note: "ctrl+shift+m"` を書くと変更される | Vitest (settings parse) + manual (実機) | `npm test lib/settings-store.test.ts` | ✅ 既存 lib/settings-store.test.ts 拡張 |

### Sampling Rate (Nyquist 観点)

「正しさ」を見抜く最小サンプリング頻度を以下で設計：

- **Per task commit:** `npm test` (vitest run) — 5s 以内に終わるユニットテストのみ。**毎コミット必須**。
  - PERF-04 (lazy 作成) の Vitest だけでも実行
- **Per wave merge:** 上記 + Rust 単体 + Playwright（ヘッドレス、3 サンプル中央値）
  - PERF-01/02/03/04/06/08 を網羅
- **Phase gate (`/gsd:verify-work` 前):** Full suite + 5 サンプル中央値 + 17 付箋仕込みフィクスチャ
  - PERF-05 の手動目視（Spy++）と PERF-07 の手動メモ帳テストを実施
  - perf.jsonl をリポジトリに添付（`.planning/phases/19-.../perf-evidence.jsonl`）

### Wave 0 Gaps（実装前に作る必要があるもの）

- [ ] `e2e/perf-300ms.spec.ts` — Ctrl+N → T2_READY 計測 (PERF-01)
- [ ] `e2e/perf-burst.spec.ts` — 連打 1.5s/3 回 (PERF-02)
- [ ] `e2e/perf-load.spec.ts` — 17 付箋仕込み + Ctrl+N (PERF-03)
- [ ] `e2e/fixtures/seed-17-notes.ts` — テスト前に 17 付箋を IndexedDB/フォルダに配置するヘルパ
- [ ] `app/components/StickyNote.pool.test.tsx` — Pool 専用挙動の単体テスト (PERF-04)
- [ ] `scripts/perf-check.mjs` — JSON Lines パース・中央値計算 (PERF-01 解析)
- [ ] `package.json` に `"perf:check": "node scripts/perf-check.mjs"` 追加
- [ ] `src-tauri/src/lib.rs` 内 `#[cfg(test)] mod pool_tests` — Pool 関連単体テスト
- [ ] `src-tauri/src/perflog.rs` — JSON Lines 出力モジュール（実装先行で作るべき）
- [ ] CI では Tauri ビルドが必要な PERF-01/02/03 は Windows runner のみで実行（GitHub Actions `windows-latest`）
- [ ] **手動検証手順書** `docs/manual-verify-phase19.md` — PERF-05 (Spy++ 確認) と PERF-07 (グローバルショートカット) を再現可能な形でメモ

### Manual-Only Justification

| Test | Why manual-only |
|------|-----------------|
| PERF-05 (WS_EX_LAYERED 目視) | Spy++ や Window Detective 等の外部ツールが必要。Playwright には Win32 API 検査機能なし |
| PERF-07 (グローバルショートカット) | 他アプリ（メモ帳等）にフォーカスを移す操作は Playwright で再現不可（ブラウザ外操作） |
| 「すぐ書ける」体感品質 | 300ms はベンチマークで合格しても体感が合わないことがある。実機で 1 度はユーザが確認する |

---

## Sources

### Primary (HIGH confidence)
- 既存ソース: `src-tauri/src/lib.rs:1066-1188` (fusen_show_at_position, create_pool_window_internal)
- 既存ソース: `src-tauri/src/lib.rs:1937-1970` (Ctrl+Shift+H グローバルショートカット既存実装)
- 既存ソース: `src-tauri/src/logger.rs` (ログシステム既存パターン)
- 既存ソース: `app/components/StickyNote.tsx:583-700` (pool promote ハンドラ)
- 既存ソース: `app/components/StickyNote.tsx:1380-1436` (Ctrl+N ローカルショートカット)
- 既存ソース: `app/components/RichTextEditor.tsx:919-1130` (EditorView 構築 + updateListener)
- 既存ソース: `app/page.tsx:485-641` (createNewNote pool 選択ロジック)
- 既存ソース: `src-tauri/Cargo.toml` (windows crate v0.52 + features)
- [Microsoft Learn: SetLayeredWindowAttributes](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setlayeredwindowattributes) — α・LWA_ALPHA・WS_EX_LAYERED 必須・WM_PAINT 動作
- [windows-rs docs: SetLayeredWindowAttributes](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/UI/WindowsAndMessaging/fn.SetLayeredWindowAttributes.html) — Rust シグネチャ
- [windows-rs docs: WS_EX_LAYERED](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/UI/WindowsAndMessaging/constant.WS_EX_LAYERED.html)
- [windows-rs docs: GWL_EXSTYLE](https://microsoft.github.io/windows-docs-rs/doc/windows/Win32/UI/WindowsAndMessaging/constant.GWL_EXSTYLE.html)
- [Microsoft Learn: SetWindowLongPtrW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongptrw) — OR パターン必須
- [Tauri v2 Global Shortcut Plugin](https://v2.tauri.app/plugin/global-shortcut/) — Builder API・ShortcutState
- [tauri-plugin-global-shortcut crates.io](https://crates.io/crates/tauri-plugin-global-shortcut)
- [CodeMirror Reference Manual](https://codemirror.net/docs/ref/) — EditorView, updateListener, ViewUpdate
- [JSON Lines spec](https://jsonlines.org/)

### Secondary (MEDIUM confidence)
- [CodeMirror discuss: IME with updateListener](https://discuss.codemirror.net/t/how-to-listen-to-changes-with-ime-support/5737) — IME 中の docChanged 挙動
- [Layered Windows behavior gist (retorillo)](https://gist.github.com/retorillo/3a12e0f7e6ae3d49771f2919608f8498) — α=0 のクリック透過挙動
- [DEV Community: Tauri Global Shortcut tutorial](https://dev.to/rain9/tauri-8-implementing-global-shortcut-key-function-2336) — register/unregister パターン

### Tertiary (LOW confidence — needs validation)
- 「α 切替が DWM の同一 frame で composition される」: 公式ドキュメントは「smoothly」と書くが正確な ms 値は未明示。**実機計測で 300ms 達成可否を確認する**のが唯一の根拠
- 「pool=3 で連打 1.5s/3 回が満たせる」: 補充タイミング（500ms 間隔）の理論値だが、実機で WebView2 起動 200ms+ がボトルネックになるか未検証
- グローバル Ctrl+N の **Foreground Lock 抜け** の挙動: Windows のフォーカス強奪制限はバージョンによって異なる。Windows 11 では「ユーザ操作直後」扱いで通る想定だが要実機確認

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — windows crate v0.52、tauri-plugin-global-shortcut、CodeMirror v6、すべて既存依存・公式ドキュメント参照済み
- Architecture (pool 透明→不透明): HIGH — Win32 API 仕様で確定。順序・OR パターンも公式 doc にある
- Pitfalls: HIGH — 既存コードの観察 + 公式 doc + コミュニティで確認済みの罠を網羅
- 性能達成可能性: MEDIUM — 理論的には 300ms 余裕あり（α 切替は 1 frame ≈ 16ms、SetWindowPos は μs オーダー）。ただし**実機計測で初めて確証が得られる**
- 連打耐性: MEDIUM — pool=3 で十分な理屈はあるが、補充並列度 1 と CPU 負荷の干渉は実機検証必要
- グローバルショートカット競合解決: MEDIUM — 「フォーカス窓があるか」のチェックロジックは合理的だが、エッジケース（メインウィンドウ minimize 中など）は実装で詰める

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (Win32 API は安定、Tauri/CodeMirror も major 変更なし想定。1 か月で再検証)
