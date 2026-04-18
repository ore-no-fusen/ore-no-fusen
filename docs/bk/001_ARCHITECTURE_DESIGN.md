# 俺の付箋 - アーキテクチャ・設計仕様 (Architecture & Design Specifications)

本ドキュメントは、アプリケーションの主要な動作フローやシステム間連携のブロック図・シーケンス図をまとめた設計資料です。
各機能の詳細な要求仕様については `007_REQUIREMENTS_v2.0.md` を参照してください。

---

## 目次

- [改版履歴](#改版履歴)
- [0. 技術スタック](#0-技術スタック-technology-stack)
- [1. 構造図](#1-構造図-architecture-diagram)
- [2. クラス図](#2-クラス図-class-diagram)
- [3. シーケンス図](#3-シーケンス図-sequence-diagrams)
  - [3.1 アプリケーション起動シーケンス](#31-アプリケーション起動シーケンス)
  - [3.2 自動リネームフロー](#32-自動リネームフロー)
  - [3.3 画像キャプチャフロー](#33-画像キャプチャフロー)
  - [3.4 全文検索フロー](#34-全文検索フロー)
- [4. ER図](#4-er図-entity-relationship-diagram)
- [5. Google Drive ファイル仕様](#5-google-drive-ファイル仕様)
  - [5.1 ライフサイクル一覧](#51-ライフサイクル一覧)
  - [5.2 データ構造](#52-データ構造)
  - [5.3 VAPID 鍵設計について](#53-vapid-鍵設計について)
- [6. iPhone連携フロー](#6-iphone連携フロー)
  - [6.1 PC→iPhone 送信フロー（v2.0）](#61-pciphone-送信フローv20)
    - [A. 初回セットアップ](#a-初回セットアップsafariで1回だけ)
    - [B. PC側の準備](#b-pc側の準備tauriアプリ起動時)
    - [C. 付箋を送る（日常利用）](#c-付箋を送る日常利用)
  - [6.2 iPhone→PC 送信フロー（v3.0）](#62-iphonepc-送信フローv30)
  - [6.3 viewer 画面遷移](#63-viewer-画面遷移)

---

## 改版履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0 | 2026-04-08 | 初版。Google Drive ファイル仕様・ライフサイクル表・VAPID鍵設計意図を含む。以降はこのファイルを唯一の設計書として更新する |
| 1.1 | 2026-04-08 | セクション6追加。iPhone連携フロー（PC→iPhone v2.0 / iPhone→PC v3.0 / viewer画面遷移）を iphone_01〜04 HTML設計書よりマージ |
| 1.2 | 2026-04-08 | 6.2・6.3 を実装に合わせて更新。「iPhoneに置いておく」→「新規付箋」ボタン名変更。バッジ色を保存済み（グレー）・PC受信（薄藍）・送信済み（薄青）に変更 |
| 1.3 | 2026-04-10 | 1.1「画面とソースファイルの対応」追加（PC マルチウィンドウ構造・iPhone PWA 構成）。4.1「iPhone側データ構造」追加（DraftRecord / IphoneNote / FusenNoteItem）。notes_to_iphone.json に tags フィールド追記 |
| 1.4 | 2026-04-15 | 6.1C を現在の実装に合わせて更新。Service Worker が push 受信後に Drive から body_rich を取得・IndexedDB 保存するフローを追加。通知タップ時は IndexedDB から読む設計に変更 |
| 1.5 | 2026-04-15 | 実装メモ（Phase 6/7）・③責務変化図・6.2全体フロー図を削除。セクション0を表に変換。タイムスタンプをUTC→JST（+09:00）に変更 |
| 1.6 | 2026-04-15 | 6.1C push受信フローを更新。SW が body_rich 取得後に fusen_img_* 画像 Blob もダウンロードして IndexedDB に保存。通知タップ時は Drive アクセスなしで表示完結 |

---

## 0. 技術スタック (Technology Stack)

| カテゴリ | 技術 | 用途 |
|---|---|---|
| アプリ基盤 | Tauri v2 | クロスプラットフォームGUI。WebviewとRustバックエンドの連携 |
| フロントエンド | React 18 / Next.js 14 (App Router) | UI構築・ルーティング |
| フロントエンド | TypeScript | 型安全な開発 |
| フロントエンド | Tailwind CSS | スタイリング |
| フロントエンド | Radix UI | Headless UIコンポーネント |
| フロントエンド | CodeMirror 6 | Markdownエディタ（ハイライト・検索） |
| バックエンド | Rust (Edition 2021) | コアロジック |
| バックエンド | arboard | クリップボード連携（画像取得） |
| バックエンド | rodio | UIサウンド・通知音 |
| バックエンド | windows / tauri-plugin-os | Win32 API・OSネイティブ操作 |
| バックエンド | std::fs + serde | ファイルシステム永続化（JSON/Markdown） |
| テスト | Vitest | フロントエンド・ロジックテスト |
| テスト | Playwright | E2E（UI結合）テスト |

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

## 1.1 画面とソースファイルの対応

本アプリは Next.js App Router を使っており、URL パスごとに `page.tsx` が分かれている。

| 画面 | URL | ソースファイル | 実行環境 |
|------|-----|---------------|---------|
| メインウィンドウ（トレイ・設定・検索） | `/` | `app/page.tsx` | PC（Tauri WebView） |
| 付箋ウィンドウ 1枚ごと | `/` と同じ URL（別 WebView ウィンドウ） | `app/components/StickyNote.tsx` | PC（Tauri マルチウィンドウ） |
| iPhone PWA | `/viewer` | `app/viewer/page.tsx` | iPhone Safari（PWA） |

### PC のマルチウィンドウの仕組み

```
Tauri 起動
  └── メインウィンドウ (app/page.tsx)
        ├── 付箋A用 WebviewWindow → StickyNote.tsx を読み込む
        ├── 付箋B用 WebviewWindow → StickyNote.tsx を読み込む
        └── 付箋C用 WebviewWindow → StickyNote.tsx を読み込む
```

- Tauri が付箋1枚ごとに `WebviewWindow` を生成する
- 各ウィンドウは独立したプロセスで `StickyNote.tsx` を表示する
- ウィンドウ間の状態同期は Rust `AppState` と Tauri イベント経由で行う（フロントエンドに状態を持たない）

### iPhone PWA の構成

```
/viewer (app/viewer/page.tsx)  ← 約2000行・全画面を1ファイルで管理
  ├── SimpleNoteBody.tsx        ← 一覧カードの本文表示（Mermaid図含む）
  ├── editor-helpers.ts         ← 編集画面のヘルパー関数
  └── utils.ts                  ← 共通ユーティリティ
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

---

## 4.1 iPhone側データ構造

iPhone PWA（`app/viewer/page.tsx`）で扱うデータ型の一覧。

### DraftRecord — iPhone ローカル保存データ（IndexedDB）

iPhone 内の IndexedDB（`fusen-drafts` ストア）に保存される。Drive は使わない。

```ts
type DraftRecord = {
  id: string;            // ノートID（UUID）
  title: string;         // タイトル（例: "# 買い物リスト"）
  body: string;          // 本文（Markdown）
  created_at: string;    // 作成日時（ISO 8601 例: "2026-04-10T14:30:00.000+09:00"）
  images: {
    fileName: string;    // 例: "fusen_img_20260410_143000_メモ_1.jpg"
    blob: Blob;          // 画像の生データ（iPhoneローカルのみ。Driveには送信時にアップロード）
  }[];
  tags?: string[];       // タグ（例: ["仕事", "メモ"]）
  received_pc?: true;    // PCから受信したメモに付くフラグ
  sent_at?: string;      // PCに送信した日時（ISO 8601）
  locked?: true;         // 🔔ロック画面に表示中（Phase 13）
};
```

**ISO 8601** とは日時の国際標準フォーマット。末尾の `Z` は UTC（世界標準時）、`+09:00` は JST（日本標準時）を表す。現在は `nowJST()`（`app/viewer/utils.ts`）で JST 固定。**世界対応時は `nowJST()` をタイムゾーン対応の関数に差し替えるだけでよい。**

### IphoneNote — 一覧画面の表示用データ

`DraftRecord`（IndexedDB）と Drive の送信済みデータをマージして画面に表示するための型。保存はしない。

```ts
type IphoneNote = {
  id: string;
  status: 'sent'        // PCに送信済み
        | 'draft'       // 下書き（未送信）
        | 'received_pc' // PCから受信
  title: string;
  body: string;
  created_at: string;   // ISO 8601
  sent_at?: string;     // ISO 8601
  tags?: string[];
};
```

### FusenNoteItem — Google Drive 経由で PC→iPhone に届くデータ

`notes_to_iphone.json` の各アイテム。PC が送信し、iPhone が受け取る。

```ts
type FusenNoteItem = {
  id: string;
  title: string;
  body: string;
  tags: string[];            // PC付箋のタグ（frontmatterから取得）
  sent_at: string;           // PCが送った日時（ISO 8601）
  received_at: string | null; // iPhoneが受け取った日時（null = 未受信）
};
```

---

## 5. Google Drive ファイル仕様

Drive の `ore-no-fusen` フォルダ内に置かれる JSON ファイルの仕様。

**Drive はすべて中継所。** 大本データは PC ローカル（Markdown ファイル）または iPhone ローカル（IndexedDB）にある。Drive にしか存在しないデータはない。全ファイルを削除しても本体データは失われない。

---

### 5.1 ライフサイクル一覧

| ファイル名 | 何のデータか | いつ作られるか | どこで作られるか | いつ消されるか | 消えた場合の影響 |
|---|---|---|---|---|---|
| `notes_to_iphone.json` | PC→iPhone 送信キュー（最新20件） | PC から「iPhoneに送る」を実行したとき | PC アプリ | iPhone viewer でアイテムを削除したとき（アイテム単位） | 次の「iPhoneに送る」実行時に再作成。未受信データは消える |
| `notes_from_iphone.json` | iPhone→PC 送信キュー | iPhone viewer で「PCに送る」を実行したとき | iPhone viewer | （自動削除なし・アイテムに received_at が付くのみ） | 次の「PCに送る」実行時に再作成。未受信データは消える |
| `push_devices.json` | iPhone のプッシュ通知デバイス登録情報 | iPhone viewer で初回セットアップを完了したとき | iPhone viewer | （自動削除なし） | PC からプッシュ通知が届かなくなる。iPhone で再セットアップすれば復元 |
| `push_keys.json` | VAPID 鍵ペア（プッシュ通知の送信元認証鍵） | PC アプリが Google 連携を設定したとき（初回のみ） | PC アプリ | （自動削除なし） | PC ローカルにも同じ鍵があるため通常は復元される。**鍵が変わることは、ほぼ、実運用上はない**（OS再インストール後にDriveも誤削除した場合のみ）。万一変わった場合は push_devices.json が無効になるため iPhone で再セットアップが必要 |

---

### 5.2 データ構造

#### notes_to_iphone.json

```json
{
  "items": [
    {
      "id": "uuid-v4",
      "title": "付箋のタイトル（frontmatter の title）",
      "body": "本文（ローカル画像は base64 data URI に変換済み）",
      "tags": ["タグ1", "タグ2"],
      "sent_at": "2026-04-08T10:00:00Z",
      "received_at": "2026-04-08T10:01:00Z"
    }
  ]
}
```

- `received_at` は iPhone viewer が受信した時刻。未受信アイテムは `received_at` なし
- `tags` は PC 付箋の frontmatter から取得（Phase 13 で追加）
- ローカル画像は iPhone で表示できるよう base64 data URI に埋め込み済み
- 件数制限: 最新 20 件のみ保持（PC アプリが送信時に超過分を削除）

#### notes_from_iphone.json

```json
{
  "items": [
    {
      "id": "uuid-v4",
      "title": "タイトル",
      "body": "本文（画像参照は fusen_img_*.jpg 形式）",
      "sent_at": "2026-04-08T10:00:00Z",
      "received_at": "2026-04-08T10:01:00Z",
      "tags": ["タグ1", "タグ2"]
    }
  ]
}
```

- `received_at` は PC アプリが受信した時刻。未受信アイテムは `received_at` なし
- 画像は Drive に別途アップロードされた `fusen_img_*.jpg` を参照。PC 受信後にローカル保存し Drive から削除
- 旧スキーマ互換: `{ "id": "...", "title": "...", "body": "..." }` の単一オブジェクト形式も読める

#### push_devices.json

```json
{
  "devices": [
    {
      "endpoint": "https://api.push.apple.com/3/device/...",
      "keys": {
        "p256dh": "base64url...",
        "auth": "base64url..."
      },
      "created_at": "2026-04-08T10:00:00Z"
    }
  ]
}
```

- デバイスを追加するたびに upsert（件数制限なし）
- 旧スキーマ互換: `{ "endpoint": "...", "keys": {...} }` の単一デバイス形式も読める

#### push_keys.json

```json
{
  "public_key_b64url": "base64url...",
  "private_key_b64url": "base64url...",
  "subject": "mailto:ore-no-fusen@example.com"
}
```

- PC ローカル（`%LOCALAPPDATA%/ore-no-fusen/push_keys.json`）にも同じ内容を保存
- Drive は別 PC への引き継ぎ用バックアップ。ローカルに鍵がない PC は Drive からダウンロードする

---

### 5.3 VAPID 鍵設計について（重要: ユーザーごとに異なる・開発者の鍵ではない）

一般的な Web サービスでは VAPID 鍵は開発者が1サービスに1セット持つ。**俺の付箋はこの設計を採用していない。**

| | 一般的な Web サービス | 俺の付箋 |
|---|---|---|
| 誰が生成 | 開発者（1サービスに1セット） | ユーザーの PC（初回起動時に自動生成） |
| 誰が保持 | 開発者のサーバー | ユーザーの PC ローカル＋自分の Drive |
| 誰が使う | 全ユーザーへ通知を送るサーバー | 自分の iPhone にだけ送る自分の PC |

この設計の理由は MVP の土台である**プライバシー**と**独立性**に基づく：
- 中央サーバーが存在しないため、開発者はユーザーの通知内容を知ることができない
- ユーザーのデータはユーザー自身の Google Drive のみを経由する
- 開発者のサーバー障害や運用停止がユーザーの通知機能に影響しない

---

## 6. iPhone連携フロー

### 6.1 PC→iPhone 送信フロー（v2.0）

PC 側から付箋を送り、iPhone のロック画面に通知として届けるまでの全体シーケンス。

#### A. 初回セットアップ（Safari で1回だけ）

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant Safari as iPhone Safari
    participant PWA as PWA /viewer
    participant SW as Service Worker
    participant API as Next.js API
    participant Drive as Google Drive

    U->>Safari: ①URLを入力してアクセス
    Safari->>PWA: ②ページ読み込み
    PWA-->>U: ③「ホーム画面に追加」バナー表示
    U->>U: ④Safari共有→ホーム画面に追加
    U->>PWA: ⑤ホーム画面アイコンからPWA起動

    PWA->>SW: ⑥register('/sw.js')
    SW-->>PWA: ⑦ready (swReady=true)
    PWA-->>U: ⑧「Googleでログイン」ボタン表示

    U->>PWA: ⑨ログインボタンタップ
    PWA->>PWA: ⑩PKCE生成・verifierをlocalStorageに保存
    PWA->>Safari: ⑪Google OAuth画面へリダイレクト
    U->>Safari: ⑫Googleアカウントを許可
    Safari->>PWA: ⑬/viewer?code=xxx にリダイレクト

    PWA->>API: ⑭POST /api/auth/token
    API->>API: ⑮Google token endpoint（client_secret使用）
    API-->>PWA: ⑯access_token
    PWA->>PWA: ⑰access_tokenをlocalStorageに保存
    PWA-->>U: ⑱「通知を許可する」ボタン表示

    U->>PWA: ⑲通知を許可するボタンタップ
    PWA->>U: ⑳「通知を許可しますか？」プロンプト
    U->>PWA: ㉑許可
    PWA->>SW: ㉒pushManager.subscribe()
    SW-->>PWA: ㉓PushSubscription(endpoint,p256dh,auth)
    PWA->>Drive: ㉔fusen_push_config.json を保存
    PWA-->>U: ㉕設定完了！PCから送信できます
```

#### B. PC側の準備（Tauriアプリ起動時）

```mermaid
sequenceDiagram
    participant PC as PC Tauri
    participant Drive as Google Drive

    PC->>Drive: ㉖fusen_push_config.json をポーリング
    Drive-->>PC: ㉗endpoint + p256dh + auth
    PC->>PC: ㉘AppStateにキャッシュ
```

#### C. 付箋を送る（日常利用）

```mermaid
sequenceDiagram
    participant U as ユーザー
    participant PC as PC Tauri
    participant Drive as Google Drive
    participant API as Next.js API
    participant APNs as APNs
    participant SW as Service Worker
    participant IDB as IndexedDB (fusen-drafts)
    participant Meta as IndexedDB (fusen-meta)
    participant Viewer as PWA /viewer

    rect rgb(235,245,255)
        note over U,API: PC から送信時
        U->>PC: ㉙付箋を右クリック→「iPhoneに送る」
        PC->>Drive: ㉚notes_to_iphone.json に body_rich を保存（画像あり）
        PC->>API: ㉛POST /api/push（body_push = テキストのみ）
        API->>APNs: ㉜Web Push（VAPID認証）
        APNs->>SW: ㉝push イベント
    end

    rect rgb(235,245,255)
        note over SW,IDB: push 受信時（バックグラウンド）
        SW->>Meta: ㉞access_token を取得
        SW->>Drive: ㉟notes_to_iphone.json をダウンロード
        Drive-->>SW: ㊱body_rich（画像マークダウン含む）
        SW->>Drive: ㊲fusen_img_*.jpg をダウンロード（body内の全画像）
        Drive-->>SW: ㊳画像 Blob
        SW->>IDB: ㊴body_rich + images（Blob配列）で保存（id, title, body, images）
        SW->>U: ㊵ロック画面に通知を表示
    end

    rect rgb(235,245,255)
        note over U,Viewer: 通知タップ時
        U->>SW: ㊶通知をタップ
        SW->>Viewer: ㊷/viewer?note=id を開く（通知を再表示して消えないように）
        Viewer->>IDB: ㊸body_rich + images を読む
        IDB-->>Viewer: ㊹title・body_rich・images Blob
        Viewer-->>U: ㊺メモ内容を全画面表示（Drive アクセスなし）
    end
```

---

### 6.2 iPhone→PC 送信フロー（v3.0）

iPhone viewer で書いた内容を Google Drive 経由で PC に送り、自動的に新規付箋として開くまでのフロー。全要件10件・Phase 6〜7 完了済み（2026-03-31）。

#### 要件一覧

| ID | カテゴリ | 要件 | Phase |
|---|---|---|---|
| SEND-01 | 送信 | iPhoneでテキストを入力して「PCに送る」で付箋をDriveに送信できる | 6 |
| SEND-02 | 送信 | 「新規付箋」で現在の内容を保存し、白紙エディタで継続入力できる（PCには送らない） | 6 |
| SEND-03 | 送信 | 画像追加ボタンでカメラ/ライブラリから写真を付箋に添付できる（Driveアップロード・カーソル位置に挿入） | 6 |
| SEND-04 | 送信 | Mermaidボタンでコード入力欄+プレビューを開き、本文に ` ```mermaid ` ブロックとして挿入できる | 6 |
| HIST-01 | 履歴 | 送信後に送信済み+下書きの履歴リストを表示できる（最新10件、sent/draft 区別） | 6 |
| HIST-02 | 履歴 | 履歴から下書きを選んで編集・送信できる | 6 |
| REND-01 | 描画 | viewer内で ` ```mermaid ` コードブロックを図（SVG）として描画できる | 6 |
| POLL-01 | PC受信 | PCがDriveを30秒間隔でポーリングして新着iPhoneノートを検出できる | 7 |
| POLL-02 | PC受信 | 新着ノートをPC側で自動的に新規付箋ウィンドウとして開ける | 7 |
| POLL-03 | PC受信 | 重複受信防止（received_atマーク＋last_seen_idによるスキップ） | 7 |

#### Phase 6 詳細 — iPhone送信UI

```mermaid
sequenceDiagram
    participant U as ユーザー(iPhone)
    participant V as viewer/page.tsx
    participant C as Canvas API
    participant M as mermaid.render()
    participant D as Google Drive

    note over U,D: SEND-01 テキスト送信
    U->>V: 「書く」タップ (step: ready → write)
    U->>V: テキスト入力
    U->>V: 「PCに送る」ボタン
    V->>V: viewer_expires_at 確認（期限切れなら /api/auth/refresh で自動更新）
    V->>D: 各画像ファイルをDriveにアップロード（uploadImageWithAutoRefresh）
    V->>D: uploadWithAutoRefresh('fusen_from_iphone.json', {id, title, body, sent_at})
    V->>D: uploadWithAutoRefresh('fusen_iphone_notes.json', [新entry, ...].slice(0,10))
    V->>V: step: list に遷移

    note over U,D: SEND-02 新規付箋（保存して継続）
    U->>V: 「新規付箋」ボタン
    V->>V: IndexedDB(fusen-drafts)にテキスト+画像をローカル保存（Drive不使用）
    V->>V: 白紙エディタで継続入力（step: write のまま）

    note over U,D: SEND-03 画像添付
    U->>V: 📷ボタンタップ
    V->>V: input[type=file] 選択
    V->>V: buildImageFileName(title, index) でファイル名生成
    V->>V: insertAtCursor() でカーソル位置に![](fileName)を挿入
    V->>V: attachedImages に{file, preview, fileName}を追加

    note over U,D: SEND-04 Mermaid挿入
    U->>V: Mermaidボタン
    V->>V: Mermaidコード入力欄を展開
    U->>V: コード入力
    V->>M: mermaid.render(id, code)
    M-->>V: SVGプレビュー
    U->>V: 「挿入」ボタン
    V->>V: ```mermaidブロックを本文に追加

    note over U,D: HIST-01/02 履歴表示・下書き編集
    V->>V: IndexedDB から下書き一覧を取得
    V->>D: downloadFromDrive('fusen_iphone_notes.json')（送信済み）
    D-->>V: 最新10件
    V->>V: 下書き+送信済みをマージして最新20件・sent/draft を色分けして表示
    U->>V: 下書きをタップ
    V->>V: step: write に遷移（既存テキストで初期化）

    note over U,D: REND-01 Mermaid描画
    V->>V: body内の```mermaidブロックを検出
    V->>M: mermaid.render(id, definition)
    M-->>V: SVG
    V->>U: 図として表示
```

#### Phase 7 詳細 — PC受信（Rust polling）

```mermaid
sequenceDiagram
    participant S as setup() [lib.rs]
    participant L as iphone_note_polling_loop
    participant D as Google Drive
    participant E as app.emit()
    participant P as page.tsx listener
    participant N as 付箋ウィンドウ

    note over S,N: POLL-01 ポーリング開始
    S->>L: tokio::spawn(iphone_note_polling_loop)

    loop 30秒ごと (tokio::time::interval)
        L->>D: get_access_token() — 期限切れなら自動refresh
        D-->>L: access_token
        L->>D: download_json('fusen_from_iphone.json')
        D-->>L: {id, body, sent_at, [received_at]}

        alt received_at あり（受信済み）
            L->>L: スキップ（重複防止）
        else id == last_seen_id
            L->>L: スキップ（重複防止）
        else 新着ノート
            L->>L: LAST_IPHONE_NOTE_ID を更新
            L->>D: upload_json('fusen_from_iphone.json', +received_at)
            L->>D: body内の![](fusen_img_*.jpg)を解析してDriveから画像削除
            L->>E: emit("fusen:note_from_iphone", {title, body, context})
        end
    end

    note over P,N: POLL-02 PC側で付箋ウィンドウを開く
    E->>P: fusen:note_from_iphone イベント受信 {title, body, context}
    P->>P: invoke('fusen_create_note', {folderPath, context})
    P->>P: invoke('fusen_save_note', {path, body, frontmatter})
    P->>N: openNoteWindow(path, {x: screen.width-430, y:50, w:400, h:350}, false)
    N->>N: 新規付箋ウィンドウが画面右上に開く
```

---

### 6.3 viewer 画面遷移

iPhone viewer（`app/viewer/page.tsx`）の画面状態遷移図（フェーズ24以降の最新版）。

```mermaid
stateDiagram-v2
  [*] --> banner : アプリ起動

  banner --> login : standalone\nかつトークンなし
  banner --> push  : standalone\nかつ push_done=false
  banner --> write : standalone\nかつ push_done=true

  login --> push   : OAuth成功
  login --> write  : pending_note(通知タップ)処理後

  push --> write   : 通知許可完了

  write --> list   : 一覧ボタンタップ
  list --> write   : メモ開く / 新規付箋タップ

  note right of write
    WriteStep.tsx が担当
    ・エディタ編集
    ・PCに送る
    ・新規付箋
  end note

  note right of list
    NoteListStep.tsx が担当
    ・メモ一覧表示
    ・ロック管理
    ・削除
  end note
```

| 画面 | 担当コンポーネント | 説明 |
|---|---|---|
| `login` | `page.tsx` (内包) | 初回のみ。Google OAuth でログイン |
| `push` | `PushStep.tsx` | 初回のみ。プッシュ通知の許可を取得 |
| `write` | `WriteStep.tsx` | **ホーム画面**。テキスト・画像・Mermaid 入力。ログイン済みなら常にここから始まる |
| `list` | `NoteListStep.tsx` | 履歴一覧。PC受信（薄藍）/ 保存済み（グレー）/ 送信済み（薄青）をバッジで区別。ロック切り替え |

---

### 6.4 iPhone Viewer アプリケーションアーキテクチャ

`app/viewer/page.tsx` の肥大化を防ぐため、状態管理（オーケストレーター）、ビジネスロジック（hooks）、UI（Step/Modal コンポーネント）、外部連携（lib）へ分離する「バケツリレー型アーキテクチャ」を採用しています。

#### ① コンポーネント依存関係（全体像）

```mermaid
graph TD
  PAGE["🏠 page.tsx\n（オーケストレーター）"]

  subgraph STEPS["Step UIコンポーネント"]
    LOGIN["🔐 LoginStep\n（inline JSX）"]
    PUSH["📲 PushStep.tsx"]
    WRITE["✏️ WriteStep.tsx"]
    LIST["📋 NoteListStep.tsx"]
    READY["✅ ReadyStep\n（inline JSX）"]
  end

  subgraph MODALS["Modalコンポーネント"]
    CROP["✂️ CropModal.tsx"]
    MERMAID_M["🔷 MermaidModal.tsx"]
  end

  subgraph HOOKS["カスタムフック（hooks/）"]
    APPINIT["useAppInit\n起動・OAuth・SW登録"]
    NOTELIST["useNoteList\n一覧ロード・サムネイル"]
    LOCK["useLockToggle\nロックON/OFF・通知"]
    BGSEND["useBackgroundSend\nPCに送る・Drive書込"]
    AUTOSAVE["useAutoSave\n自動保存"]
    VISSAVE["useVisibilitySave\n可視性保存"]
  end

  PAGE --> STEPS
  PAGE --> HOOKS
  WRITE --> CROP
  WRITE --> MERMAID_M
```

#### ② フック → 外部連携モジュール (lib/) のデータフロー

`app/viewer/lib/indexeddb.ts` を「ローカルアプリケーションの真実の情報源 (SSOT)」として扱い、Drive通信も最終的にはIndexedDBの更新に帰結する設計です。これにより、オフラインでの即時起動と表示（0.5秒起動）を実現しています。

```mermaid
graph LR
  subgraph HOOKS["hooks/"]
    APPINIT["useAppInit"]
    NOTELIST["useNoteList"]
    LOCK["useLockToggle"]
    BGSEND["useBackgroundSend"]
    AUTOSAVE["useAutoSave"]
    VISSAVE["useVisibilitySave"]
  end

  subgraph LIB["lib/"]
    AUTH["auth.ts\nPKCE / OAuth\nWebPush変換"]
    PUSH_L["push.ts\nPush購読\nデバイス登録"]
    DRIVE["drive.ts\nGoogle Drive API\ndl / ul / refresh"]
    IDB["indexeddb.ts\nIndexedDB CRUD\n下書き保存・読込"]
  end

  APPINIT -->|PKCE・OAuth| AUTH
  APPINIT -->|下書き読込| IDB
  LOCK -->|DB更新| IDB
  BGSEND -->|トークン更新| DRIVE
  BGSEND -->|Drive書込| DRIVE
  BGSEND -->|IndexedDB保存| IDB
  NOTELIST -->|一覧取得| IDB
  AUTOSAVE -->|自動保存| IDB
  VISSAVE -->|保存| IDB
```

