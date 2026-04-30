# Phase 19: 起動性能300ms達成（Pool 透明→不透明アーキテクチャ） - Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Ctrl+N 押下から 1 文字目入力可能（T2_READY）まで **5回中央値 300ms 以下**を達成する。
Pool 窓を透明状態で事前完全準備（描画完了・CodeMirror マウント済・編集モード待機）しておき、
Ctrl+N の瞬間は Win32 レベルで α=0→255 と SetWindowPos 位置移動のみで実現する。

**含む:**
- 既存 Pool 窓アーキテクチャの強化（pool=3 化、α 制御 LAYERED 化）
- 空メモ.md のゴミ防止（lazy ファイル作成）
- Ctrl+N 連打耐性（1.5秒3回）
- 300ms 計測ログ基盤（JSON Lines + 解析スクリプト）
- グローバルショートカット対応（settings.json による上書き）

**含まない:**
- グローバルショートカットの設定 GUI（settings.json 手動編集まで）
- mac/Linux 対応（WS_EX_LAYERED は Windows 固有）
- 連打 N 個（pool=3）を超えるユーザ向け教育 UI を超える機能

</domain>

<decisions>
## Implementation Decisions

### α 遷移（透明→不透明）の実現方法
- **WS_EX_LAYERED + SetLayeredWindowAttributes(α=0→255)** で真の「色変え」を実現
- Pool 窓は最初から表示状態（visible）かつ α=0。OS コンポジットに乗せた状態で待機
- Ctrl+N 時は **1 つの Rust コマンド**で SetWindowPos(位置) → SetLayeredWindowAttributes(α=255) を連続実行
- α=255 はフェードなしの即適用（「すぐ書ける」が最優先、フェードに 50ms 使うのは勿体ない）
- Pool 窓の事前配置は **画面外を含む任意位置に原寸 (400×300)** で待機、Ctrl+N 時に SetWindowPos でジャンプ

### Pool 窓の READY 判定
- CodeMirror EditorView マウント完了 + IME 準備完了を示すコールバックで `fusen:pool_window_ready` を emit
- 既存の `fusen:pool_window_ready` イベントを厳格化して再利用する

### Pool 窓数とリプレニッシュ戦略
- **常時 3 個**を維持（成功基準#2 連打耐性 1.5s/3回 = 500ms間隔の最小ライン）
- **補充トリガ**: 「ユーザが 1 文字目を入力（T2_READY 達成）してから 5 秒後」
  - 1 文字目以降は 300ms 予算外なのでリソース消費 OK
  - 連打中は誰も 1 文字目を打てないので補充も走らず、結果的に pool=3 を消費しっぱなしでも破綻しない
  - 連打が落ち着いた後にバックグラウンド補充
- **補充上限**: 3 個。足りない分だけ補充（pool が 1 個減ったら 1 個だけ作る）
- **補充並列度**: 1 個ずつ順次作成（並列は CPU スパイクで他付箋のパフォーマンス悪化）
- **アプリ起動時**: 付箋復元完了後に順次作成（起動直後は付箋復元が CPU を使うので避ける）

### Pool 窓ライフサイクル
- 生存期間無制限（使うまで保持）。アプリ終了まで close しない
- Promote 失敗時（pool 窓がクラッシュ・タイムアウトで反応しない場合）：その pool 窓を捨てて、現状の `openNoteWindow` で従来ルートで付箋を起動
- Pool 窓 URL は現状維持（`/?path=&isPool=true`、StickyNote.tsx を再利用）

### Pool 枯渇時のフォールバック
- 4 個目以降の Ctrl+N は現状の「通常ウィンドウ生成」（`openNoteWindow`）にフォールバック
- 同時に **「少々お待ちください」トースト**を Ctrl+N を押した付箋の近くに表示（1〜2秒で消える）
  - 目的: 連打上限 N 個（pool=3）の存在をユーザに理解してもらう

### 空メモ.md のゴミ防止
- **ファイル作成タイミング**: CodeMirror に 1 文字目が input された瞬間（lazy 作成）
- **連番計算**: 1 文字目の瞬間にスキャン一回で連番計算 + ファイル作成を同時実施
- 「1 文字目」の定義: CodeMirror に input イベントが 0→1 文字に変化した瞬間（IME 未確定中含む）
- ファイル未作成のまま close された場合: pool 窓を close して何もせずに終わる（ファイル無いのでゴミも無い）

### Ctrl+N 発火範囲
- ローカルショートカット（付箋フォーカス中）+ **グローバルショートカット**（どこからでも）
- デフォルトは Ctrl+N
- カスタマイズは settings.json への手動記述で対応（GUI 設定は別 Phase）

### スロットル方針（クラッシュ防止）
- **JS 1.2s スロットルを撤去**（Ctrl+N は webview を新規作成しないため、過去のクラッシュ原因が構造的に消える）
- **Rust 500ms スロットル（fusen_create_pool_window）はセーフティネットとして残す**
  - 「足りない分だけ順次補充」設計では事実上呼ばれないが、万一の防護線として保持
- クラッシュ防止は「アーキテクチャで原因を消す」アプローチ

### 計測ログ（300ms 検証）
- **JSON Lines 形式の構造化ログ**（既存ad-hoc PERF ログを置き換え）
- 記録区間: **T0(keydown) → T1(rust受信) → T2_READY(α=255完了 + フォーカスOK)**
- 解析スクリプト（`npm run perf:check` 等）で 5 回中央値を自動計算 → 300ms 判定
- CI でも実行可能な形にする

### 負荷耐性（17付箋同時起動下）
- 「17 付箋同時起動下」=「アプリ起動完了後・17付箋表示済みの定常状態」と解釈
- pool=3 アーキテクチャでは Ctrl+N が webview 新規作成しないため、付箋数に依存せず 300ms 達成
- 起動時シナリオ: 付箋復元完了後に pool 作成 → 起動直後の単発 Ctrl+N は openNoteWindow 通常パス（300ms 超過許容）

### 実装プロセス（Planner/Executor への指示）
- **修正 → テスト → NG なら自動修正のループは最大 3 回**
- 3 回失敗したらユーザにエスカレート（永久ループ禁止）
- 同じアプローチで 3 回失敗 = 設計見直しサイン

### Claude's Discretion
- JSON Lines ログのスキーマ詳細
- 解析スクリプト（perf:check）の実装言語・出力形式
- 「少々お待ちください」トーストの具体的なデザイン
- Pool 窓の具体的な事前配置座標（画面外の負座標 vs 画面端の 1px 等）
- Rust 側「1 コマンドで SetWindowPos + SetLayeredWindowAttributes」の関数名・シグネチャ
- ローカル Ctrl+N とグローバル Ctrl+N の競合解決ロジック

</decisions>

<specifics>
## Specific Ideas

- 「Pool 窓は最適化テクではなく **MVP「すぐ書ける」の物理実現**」（プロジェクトメモリ）
- 「速度を犠牲にする"安全側"のコードは原則 NG」（過去の setTimeout 等は再検証してから削る）
- 「妥協ルートを安易に採らない。300ms に届かない計画は計画として不十分」
- 連打上限 N 個（pool=3）はユーザ理解させる前提で設計する → トースト表示
- グローバルショートカット = 設定で変えられる「仕組み」だけ Phase 19、UI は別 Phase

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fusen_create_pool_window` ([src-tauri/src/lib.rs:1146](src-tauri/src/lib.rs#L1146)): 既存の pool 窓生成。`transparent(false)+visible(false)` を改修して LAYERED+visible(true)+α=0 にする
- `fusen_show_at_position` ([src-tauri/src/lib.rs:1066](src-tauri/src/lib.rs#L1066)): SetWindowPos + SetForegroundWindow 既存。α 操作を追加して 1 コマンドで完結させる
- `fusen:promote_from_pool` イベント ([app/components/StickyNote.tsx:596](app/components/StickyNote.tsx#L596)): pool→本物への昇格機構。そのまま再利用
- `fusen:pool_window_ready` イベント ([app/components/StickyNote.tsx:692](app/components/StickyNote.tsx#L692)): READY 判定を CodeMirror マウント後に厳格化
- `LAST_POOL_CREATE_MS` ([src-tauri/src/lib.rs:669-670](src-tauri/src/lib.rs#L669)): セーフティネットとして残す
- 既存 PERF ログ（`[PERF|T0]`, `[PERF|RUST_ENTER]`, `[PERF|T_PROMOTE_START]`）: JSON 化のベース

### Established Patterns
- Tauri webview window ベースのマルチウィンドウ（各付箋 = 独立ウィンドウ）
- `fusen_debug_log` invoke で Rust ログに統合（PowerShell から確認可能）
- 唯一の状態は Rust `AppState`、フロントエンドは state を持たない（CLAUDE.md 鉄則）

### Integration Points
- `app/page.tsx:490-641`: `createNewNote` 関数の pool 選択ロジック → ファイル作成タイミング変更で大改修
- `src-tauri/src/lib.rs:132 fusen_create_note`: 1文字目時 lazy 作成への分割（連番計算は別関数として残し、ファイル作成と分離）
- `app/components/StickyNote.tsx:1392 Ctrl+N キーハンドラ`: スロットル削除、グローバルショートカット連携
- `tauri-plugin-global-shortcut` ([src-tauri/src/lib.rs:1937](src-tauri/src/lib.rs#L1937)): 既に依存あり、グローバル Ctrl+N の登録に使用

### 設計書参照（CLAUDE.md ルール）
- 実装前に該当シーケンス図の番号を確認すること
- 設計に不明点があれば実装前に確認、実装しながら修正禁止

</code_context>

<deferred>
## Deferred Ideas

- **グローバルショートカットの設定 GUI** — settings.json 手動編集を超える UI は別 Phase（Phase 20 以降の候補）
- **mac/Linux 対応** — WS_EX_LAYERED は Windows 固有。クロスプラットフォーム pool は別マイルストーン
- **Pool 窓のリセット再利用** — promote 失敗時に reset して再 promote する複雑機構は今回不採用、close 一択
- **連打 4 個目以降の特別演出** — トースト以外（プログレスバー等）は Phase 19 のスコープ外
- **pool 窓の DevTools 制御** — デバッグ性向上の機能は別途
- **マルチモニタでの pool 窓事前配置最適化** — 「画面外」配置の詳細はマルチモニタで複雑化する可能性。実装中に検討

</deferred>

---

*Phase: 19-300ms-pool-ctrl-n*
*Context gathered: 2026-04-30*
