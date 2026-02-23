# 俺の付箋 - アーキテクチャ・設計仕様 (Architecture & Design Specifications) v1.1

本ドキュメントは、アプリケーションの主要な動作フローやシステム間連携のブロック図・シーケンス図をまとめた設計資料です。
v1.1 では、現状のソースコードに基づいた「オーケストレーター・パターン」の明文化と、将来的な iPhone 連携（PWA + Google Drive Sync）を見据えた Hono API 層の追加を反映しています。

---

## 変更履歴 (Change History)

| バージョン | 日付 | 内容 |
| :--- | :--- | :--- |
| v1.0 | 2026-02-20 | 初版作成 (Tauri + Next.js + Rust 構成) |
| v1.1 | 2026-02-24 | Hono API層、Google Drive同期 (BYOS)、iPhone PWA ロック画面通知フローの追加。現状のオーケストレーター設計の詳細反映。 |

---

## 0. 技術スタック (Technology Stack)

### 0.1 アプリケーション基盤
- **コアエンジン**: Tauri v2
  - Rust によるネイティブ機能制御と、Webview (Frontend) のブリッジ。
- **API層 / 同期司令塔**: Hono (Planned)
  - Next.js との間で型安全な通話を実現し、将来的に PC/iPhone 間での同期ロジックを共有。

### 0.2 フロントエンド (UI / UX)
- **フレームワーク**: Next.js 14 (App Router / 'use client' 多用による SPA モード)
- **状態管理**: `AppState` (Single Source of Truth)
- **PWA**: `next-pwa` (Planned for iPhone: 背景同期、ロック画面通知)

### 0.3 バックエンド (Core Logic)
- **言語**: Rust (Edition 2021)
- **設計パターン**: DOD (Data-Oriented Design) + Effect Pattern
  - ロジック層 (`logic.rs`) は純粋関数で `Effect` を返し、コマンド層 (`lib.rs`) が I/O を担当。
- **外部ストレージ**: Google Drive API (BYOS: ユーザー所有のストレージを将来的に利用)

---

## 1. 構造図 (Architecture Diagram)

PC版の「オーケストレーター」中心の設計と、Google Drive を中継点として PWA と連携する全体像です。

```mermaid
graph TD
    %% ユーザーの保管場所
    subgraph Storage ["【ストレージ空間】"]
        LocalFS[("ローカルファイル<br/>(.md / assets/)")]
        GDrive[("Google Drive<br/>(BYOS Sync)")]
    end

    %% PCアプリの構造
    subgraph PC_App ["【PC版 (Main)】"]
        Orchest["オーケストレーター<br/>(page.tsx)"]
        StickyNote["付箋ウィンドウ群<br/>(StickyNote.tsx)"]
        Hono_Internal["Hono (Local)<br/>(API & Sync)"]
        Rust_Core["Rust Backend<br/>(Logic / Storage)"]
        
        StickyNote -- "イベント通知" --> Orchest
        Orchest -- "制御/生成" --> StickyNote
        Orchest -- "Invoke" --> Hono_Internal
        Hono_Internal -- "Effect実行" --> Rust_Core
        Rust_Core -- "I/O" --> LocalFS
        Hono_Internal -.-> GDrive
    end

    %% iPhone(PWA)の構造
    subgraph iPhone_PWA ["【iPhone版 (Sub)】"]
        iOS_UI["PWA表示層<br/>(簡易編集)"]
        iOS_Hono["Hono (Edge)<br/>(Data Fetching)"]
        iOS_Lock["ロック画面<br/>(通知/アクション)"]

        GDrive -- "同期" --> iOS_Hono
        iOS_Hono -- "Push" --> iOS_Lock
        iOS_UI -- "反映" --> iOS_Hono
    end
```

![iPhoneロック画面連携 構造図描画](/C:/Users/uck/.gemini/antigravity/brain/82426293-f082-40f6-864d-d8480f938d2f/architecture_iphone_sync_v2_1771880509146.png)

---

## 2. クラス図 (Class Diagram)

現状の Rust バックエンドの型定義 (`state.rs`) と、将来の Hono 統合を含めた概念図です。

```mermaid
classDiagram
    direction LR

    class AppState {
        +Option~String~ base_path
        +Vec~NoteMeta~ notes
        +Option~String~ selected_path
        +Vec~String~ active_tags
    }
    note for AppState "Rust側 SSOT (state.rs)"

    class NoteMeta {
        +string path
        +number seq
        +string context
        +number? x, y, width, height
        +string[] tags
        +boolean folded
    }
    note for NoteMeta "付箋のメタデータ"

    class HonoServer {
        +sync_logic()
        +handle_rpc()
    }
    note for HonoServer "将来の同期司令塔"

    class Orchestrator {
        +openNoteWindow()
        +handleCreateNote()
        +syncState()
    }
    note for Orchestrator "Frontend (page.tsx)"

    AppState "1" *-- "*" NoteMeta : 保持
    Orchestrator ..> AppState : invoke('fusen_get_state')
    Orchestrator ..> HonoServer : リクエスト依頼
    HonoServer ..> AppState : Effect Pattern経由で更新
```

---

## 3. シーケンス図 (Sequence Diagrams)

### 3.1 起動およびウィンドウ復元フロー
オーケストレーターが Rust から状態を読み込み、順次ウィンドウを復元する流れです。

```mermaid
sequenceDiagram
    participant OS
    participant Rust as Rust (lib.rs)
    participant Page as Orchestrator (page.tsx)
    participant Win as WebviewWindow

    OS->>Rust: アプリ起動
    Rust->>Rust: AppState初期化
    Rust->>Page: Frontend表示
    Page->>Rust: fusen_get_state()
    Rust-->>Page: AppState (NoteMeta一覧)
    
    loop 以前開いていた各付箋
        Page->>Page: enqueueWindowCreation()
        Page->>Win: new WebviewWindow(label, params)
        Win->>Rust: tauri://created
        Rust->>Win: fusen_make_tool_window (WS_EX_TOOLWINDOW)
    end
```

### 3.2 ジオメトリ保存フロー (Effect Pattern)
付箋の移動やリサイズがどのように永続化されるかを示します。

```mermaid
sequenceDiagram
    participant UI as StickyNote.tsx
    participant Hooks as useWindowManager.ts
    participant Rust as Rust (lib.rs)
    participant Logic as Rust (logic.rs)
    participant FS as File System

    UI->>Hooks: move/resize発火
    Hooks->>Rust: fusen_update_geometry(path, x, y, w, h)
    Rust->>Logic: handle_update_geometry()
    Note over Logic: Effect::WriteNote を計算
    Logic-->>Rust: Effect
    Rust->>FS: storage::write_note()
    Rust-->>UI: Success
```

---

## 4. ER図 (Entity-Relationship Diagram)

データの永続化構造です。`NoteMeta` の全フィールドを網羅しています。

```mermaid
erDiagram
    NOTE_FILE ||--|| FRONTMATTER : "内部に含む"
    FRONTMATTER {
        string type "sticky (固定)"
        number seq "重なり順"
        string created "作成日"
        string updated "更新日"
        string backgroundColor "背景色"
        string[] tags "タグ"
        boolean folded "最小化フラグ"
        object window "{x, y, width, height}"
    }
    
    SETTINGS {
        string base_path "Vault保存先"
        string language "言語"
        boolean auto_start "自動起動"
        number font_size "基本文字サイズ"
        boolean sound_enabled "音設定"
    }
```

---

## 5. iPhone 連携の詳細
- **コンセプト**: iPhone を「第二の脳（サブ機）」として、ロック画面通知で付箋を「攻め」の通知に変える。
- **データ中継**: Google Drive API を使用。Hono が PC 側で同期対象フラグが立ったノートのみを抽出してアップロード。
- **PWA 背景同期**: Service Worker を活用し、定期的に Drive をチェック、変更があれば Web Notification を発行。

---

## 6. アーキテクチャ原則
1. **SSOT (Single Source of Truth)**: Rust 側の `AppState` が常に正。
2. **純粋ロジックの分離**: ファイル名生成やパースは `logic.rs` で完結し、テスト容易性を確保。
3. **BYOS (Bring Your Own Storage)**: ユーザープライバシー重視。サーバーサイドで個人データは一切保持しない。
