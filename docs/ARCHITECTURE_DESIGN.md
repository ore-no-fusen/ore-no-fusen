# 俺の付箋 - アーキテクチャ・設計仕様 (Architecture & Design Specifications)

本ドキュメントは、アプリケーションの主要な動作フローやシステム間連携のブロック図・シーケンス図をまとめた設計資料です。
各機能の詳細な要求仕様については `俺の付箋_要求仕様_v2.0.md` を参照してください。

---

## 0. 技術スタック (Technology Stack)

本アプリケーションは、パフォーマンスとクロスプラットフォーム対応（主にWindows最適化）を両立させるため、以下の技術を選定・活用しています。

### 0.1 アプリケーション基盤
- **フレームワーク**: Tauri v2
  - クロスプラットフォームGUI構築フレームワーク。WebviewとRustバックエンドの連携を担当。

### 0.2 フロントエンド (UI / UX)
- **コア**: React 18 / Next.js 14 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **UIコンポーネント**: Radix UI (Headless UIによるアクセシビリティ確保)
- **アイコン**: Lucide React
- **エディタ実装**: CodeMirror 6 (マークダウンハイライト、検索等の高度なテキスト操作)

### 0.3 バックエンド (Core Logic)
- **言語**: Rust (Edition 2021)
- **クリップボード連携**: `arboard` (画像等データの取得)
- **音声再生**: `rodio` (UIサウンド、通知音の提供)
- **OSネイティブ操作**: `windows` (Win32 API連携)、`tauri-plugin-os`, `tauri-plugin-global-shortcut`
- **データ永続化**: ファイルシステム (`std::fs`, `serde` によるJSON/Markdown直書き)

### 0.4 テスト・品質保証
- **フロントエンド・ロジックテスト**: Vitest (V8 Coverage)
- **E2E（UI結合）テスト**: Playwright

---

## 1. 構造図 (Architecture Diagram)
全体像としてのフロントエンドとバックエンドの関連図です。

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'fontSize': '28px', 'fontFamily': 'Meiryo', 'lineColor': '#81ecec'}, 'flowchart': {'htmlLabels': true, 'useMaxWidth': true, 'subGraphTitleMargin': { 'top': 20, 'bottom': 20 }, 'padding': 60 }}}%%
graph LR
    %% スタイル設定
    classDef default fill:#2d3436,stroke:#81ecec,stroke-width:4px,color:#fff,font-size:28px;
    classDef cluster fill:#2d3436,stroke:#a29bfe,stroke-width:4px,color:#fff,font-size:32px;
    
    %% 線は3pxにして矢印を目立たせる
    linkStyle default stroke:#81ecec,stroke-width:3px;
    
    Root("【俺の付箋】<br/>(App)")
    
    subgraph Frontend ["<span style='white-space:nowrap'>フロントエンド</span>"]
        direction LR
        StickyNote("【StickyNote】<br/>StickyNote.tsx")
        
        StickyNote --> Hooks("【Hooks】<br/>app/hooks/")
        
        Hooks --> WM("【執事長】<br/>useWindowManager.ts")
        WM --> Sync("【同期】<br/>useWindowSync.ts")
        WM --> Control("【操作】<br/>useWindowControls.ts")
        WM --> Event("【監視】<br/>useWindowEvents.ts")
        
        Hooks --> Menu("【右クリック】<br/>useStickyNoteContextMenu.ts")
        Hooks --> Shortcuts("【ショートカット】<br/>useGlobalEvents.ts")
        
        StickyNote --> Render("【Components】<br/>app/components/")
        
        Render --> Render_React("【React】<br/>MarkdownRenderer.tsxなど")
        Render --> Render_Editor("【Editor】<br/>RichTextEditor.tsx")
    end
    
    %% ダミー接続
    Frontend ~~~ Backend

    subgraph Backend ["<span style='white-space:nowrap'>バックエンド</span>"]
        direction TB
        Tauri("【大家】<br/>src-tauri/src/")
        
        Tauri --> Files("【ファイル】<br/>lib.rs / main.rs")
        Tauri --> Settings("【設定】<br/>settings.rs")
        Tauri --> Logic("【ロジック】<br/>logic.rs")
    end

    %% 全体の接続：普通の矢印(-->)に変更して、必ず色が出るようにする
    Root --> StickyNote
    Root --> Tauri
    
    %% 点線矢印
    Sync -.-> Tauri
    Control -.-> Tauri
    Menu -.-> Tauri
    Shortcuts -.-> Tauri

    classDef default fill:#2d3436,stroke:#81ecec,stroke-width:4px,color:#fff,font-size:28px;
    classDef cluster fill:#2d3436,stroke:#a29bfe,stroke-width:4px,color:#fff,font-size:32px;
```

---

## 2. クラス図 (Class Diagram)
コアとなる付箋データと各管理マネージャーの依存関係・操作フローです。

```mermaid
classDiagram
    %% 横向きに設定
    direction LR

    class StickyNote {
        +string id
        +string content
        +number x
        +number y
        +save()
        +minimize()
    }
    note for StickyNote "付箋データ"

    class WindowManager {
        +createWindow()
        +focusWindow()
        +closeWindow()
        +syncWindows()
    }
    note for WindowManager "ウィンドウ管理"

    class TauriBackend {
        +writeTextFile()
        +readTextFile()
        +setAlwaysOnTop()
        +app.exit()
    }
    note for TauriBackend "Tauri (Rust)"

    %% 意味を線の上に書く
    WindowManager "1" *-- "*" StickyNote : 管理する(持ち主)
    StickyNote ..> TauriBackend : 使う(保存/読込)
    WindowManager ..> TauriBackend : 使う(命令)
```

---

## 3. シーケンス図 (Sequence Diagrams)

### 3.1 アプリケーション起動シーケンス
アプリ起動から、Vaultスキャン、トレイ常駐、および前回開いていた付箋ウィンドウの復元までの流れを示します。

```mermaid
sequenceDiagram
    participant User
    participant Page as page.tsx (Orchestrator)
    participant Rust as Backend (Rust)
    participant Win as Note Windows

    User->>Rust: アプリ起動
    Rust->>Page: 初期化完了
    Page->>Rust: fusen_get_state()
    Rust->>Rust: 設定読み込み & ノート一覧取得
    Rust-->>Page: AppState (Notes List)
    
    alt base_path 未設定
        Page->>Page: Setup画面表示 (Resize 900x630)
        User->>Page: フォルダ選択
        Page->>Rust: setup_first_launch()
    else 設定済み
        Page->>Page: Dashboard表示 (Resize 240x300)
    end

    loop 各ノート
        Page->>Page: __WINDOW_QUEUE__.push()
        Page->>Win: WebviewWindow生成 (x, y, width, height)
    end
```

---

### 3.2 自動リネームフロー
本文の1行目を「コンテキストファイル名」として採用し、ユーザーのファイル管理の手間を省くための非同期リネーム処理の流れです。

```mermaid
sequenceDiagram
    participant Editor as エディタ
    participant Logic as リネームロジック
    participant FS as ファイルシステム
    
    Editor->>Editor: 1行目変更検知
    Editor->>Logic: 800ms後に発火 (Debounce)
    Logic->>Logic: 新ファイル名生成
    Logic->>FS: rename実行
    FS-->>Logic: 新パス返却
    Logic->>Editor: パス更新
```

---

### 3.3 画像キャプチャフロー
OS内蔵のスクリーンショットツール（Snipping Tool等）を呼び出し、撮影された画像を自動でVault内の `assets/` フォルダへ格納する流れです。

```mermaid
sequenceDiagram
    participant User as ユーザー
    participant Fusen as 付箋
    participant Snip as SnippingTool
    participant FS as ファイルシステム
    
    User->>Fusen: 📷クリック
    Fusen->>Fusen: 全付箋を一時非表示
    Fusen->>Snip: 起動
    User->>Snip: 範囲選択
    Snip->>FS: クリップボードに画像
    Fusen->>FS: assets/へ保存
    Fusen->>Fusen: Markdown挿入
    Fusen->>Fusen: 全付箋を再表示
```

---

### 3.4 全文検索フロー
Grep同等の高速検索を行い、結果リストから対象付箋へのフォーカスとハイライトを行うまでのプロセスです。

```mermaid
sequenceDiagram
    participant User
    participant Sticky as Setup/Tray
    participant Page as page.tsx
    participant Search as SearchOverlay
    participant Rust
    participant Target as StickyNote

    User->>Sticky: Ctrl+F または トレイ「検索」
    Sticky->>Page: emit('fusen:open_search')
    Page->>Page: setIsSearchOpen(true)
    Page->>Page: win.setSize(550, 450)
    Page->>Search: Render Overlay

    User->>Search: "keyword" 入力 + Enter
    Search->>Rust: fusen_search_notes("keyword")
    Rust-->>Search: Scan .md files -> SearchHit[]
    Search->>User: 結果リスト表示
    
    note right of Search: Line# = Raw# - (Frontmatter + EmptyLines)

    User->>Search: 結果クリック
    Search->>Page: emit('fusen:scroll_to_line', {path, line, query})
    Target->>Target: highlightQuery(query)
    Target->>Target: Set Cursor & Scroll
```

---

## 4. ER図 (Entity-Relationship Diagram)
フロントエンドへ渡されるデータ（`NoteMeta` / `Note`）、およびバックエンド設定（`Settings`）の構造的な関係性です。（現状の実装に基づいて最適化しています）

```mermaid
erDiagram
    %% 付箋データ (実体: マークダウンファイル .md の Frontmatter + 本文)
    NOTE_DATA {
        string path "ファイルパス (実質的主キー)"
        string content "本文テキスト (Markdown)"
        string context "コンテキスト(ファイル名)"
        string updated "最終更新日時"
        number seq "重なり順(Z-index相当)"
        number x "X座標"
        number y "Y座標"
        number width "幅"
        number height "高さ"
        string background_color "背景色 (YAML)"
        boolean always_on_top "最前面固定"
        boolean folded "折りたたみ状態(最小化)"
        string[] tags "タグ一覧"
    }

    %% 設定データ (実体: AppData内 settings.json)
    SETTINGS {
        string base_path "保存先フォルダ(Vault)"
        string language "表示言語"
        boolean auto_start "OS自動起動"
        number font_size "基本フォントサイズ"
        boolean sound_enabled "効果音ON/OFF"
    }

    %% タグデータ (概念的/ディレクトリによる分類)
    TAG {
        string name "タグ名"
    }

    %% 関係性
    NOTE_DATA }|..|{ TAG : "配列としてタグを持つ"
    NOTE_DATA ||--|| HDD : "1つのファイル(.md)として保存"
```
