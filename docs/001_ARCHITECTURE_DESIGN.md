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
  - [6.2 iPhone→PC 送信フロー（v3.0）](#62-iphonepc-送信フローv30)
  - [6.3 viewer 画面遷移](#63-viewer-画面遷移)

---

## 改版履歴

| バージョン | 日付 | 変更内容 |
|---|---|---|
| 1.0 | 2026-04-08 | 初版。Google Drive ファイル仕様・ライフサイクル表・VAPID鍵設計意図を含む。以降はこのファイルを唯一の設計書として更新する |
| 1.1 | 2026-04-08 | セクション6追加。iPhone連携フロー（PC→iPhone v2.0 / iPhone→PC v3.0 / viewer画面遷移）を iphone_01〜04 HTML設計書よりマージ |
| 1.2 | 2026-04-08 | 6.2・6.3 を実装に合わせて更新。「iPhoneに置いておく」→「新規付箋」ボタン名変更。バッジ色を保存済み（グレー）・PC受信（薄藍）・送信済み（薄青）に変更 |

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
      "sent_at": "2026-04-08T10:00:00Z",
      "received_at": "2026-04-08T10:01:00Z"
    }
  ]
}
```

- `received_at` は iPhone viewer が受信した時刻。未受信アイテムは `received_at` なし
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
    participant PWA as PWA /viewer

    U->>PC: ㉙付箋を右クリック→「iPhoneに送る」
    PC->>Drive: ㉚fusen_note.json を保存
    PC->>API: ㉛POST /api/push
    API->>APNs: ㉜Web Push（VAPID認証）
    APNs->>U: ㉝ロック画面に通知

    U->>U: ㉞通知をタップ
    U->>PWA: ㉟PWA起動（?note=xxx）
    PWA->>PWA: ㊱localStorageからaccess_token取得
    PWA->>Drive: ㊲fusen_note.json をダウンロード
    Drive-->>PWA: ㊳title と body
    PWA-->>U: ㊴メモ内容を全画面表示
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

#### 全体フロー（iPhone → Drive → PC）

```mermaid
sequenceDiagram
    participant U as ユーザー(iPhone)
    participant V as viewer/page.tsx
    participant D as Google Drive
    participant R as Rust polling
    participant P as page.tsx(PC)

    note over U,P: Phase 6 — iPhone側

    U->>V: 「書く」タップ (step: ready → write)
    U->>V: テキスト / 画像 / Mermaid を入力
    U->>V: 「PCに送る」ボタン
    V->>D: fusen_from_iphone.json {id, body, sent_at}
    V->>D: fusen_iphone_notes.json [{...new}, ...old].slice(0,10)
    V->>V: step: list に遷移（履歴表示）

    note over U,P: Phase 7 — PC受信

    loop 30秒ごと
        R->>D: fusen_from_iphone.json を取得
        D-->>R: {id, body, sent_at}
        R->>R: id == last_seen_id ? skip : 処理
        R->>R: last_seen_id を更新
        R->>D: received_at を付けて上書き（重複防止）
        R->>P: emit "fusen:note_from_iphone" {body}
    end

    P->>P: fusen_create_note(folderPath, 'from-iphone')
    P->>P: fusen_save_note(path, body)
    P->>P: openNoteWindow(path)
    P->>U: PCに新規付箋ウィンドウが開く
```

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

**実装メモ（Phase 6）**:
- 変更ファイル: `app/viewer/page.tsx`（step型に 'write'/'list'/'note' 追加）
- 新規ファイル: `app/viewer/SimpleNoteBody.tsx`（Mermaid図描画コンポーネント）
- 下書き保存: IndexedDB（`fusen-drafts`）にテキスト+画像BlobをiPhoneローカルに保存。Drive不使用
- 画像ファイル名: `fusen_img_YYYYMMDD_HHMMSS_コンテキスト_N.jpg`（buildImageFileName()）
- トークン自動更新: 送信前に `viewer_expires_at` 確認 → 期限切れなら `/api/auth/refresh` で更新

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

**実装メモ（Phase 7）**:
- 変更ファイル: `src-tauri/src/lib.rs`（poll_iphone_note() + LAST_IPHONE_NOTE_ID + setup()内spawn）
- 変更ファイル: `src-tauri/src/gdrive.rs`（delete_file_by_name() 追加）
- 変更ファイル: `app/page.tsx`（fusen:note_from_iphone / fusen:drive_disconnected / drive_connected リスナー）
- Cargo.toml: `tokio features = ["rt", "time"]` + `tauri-plugin-notification = "2"`
- POLL-03: received_atフィルタ + LAST_IPHONE_NOTE_ID static Mutex で二重受信防止

---

### 6.3 viewer 画面遷移

iPhone viewer（`app/viewer/page.tsx`）の画面状態遷移図。

```mermaid
flowchart TD
    A([PWAアイコンタップ]) --> Q{ログイン済み？}
    B([ロック画面通知タップ]) --> SW["SW処理\nDrive DL → 全未読を IndexedDB 一括保存\nタップしたノートを write に表示"]
    SW --> WRITE

    Q -- "No（初回）" --> LOGIN[login]
    LOGIN --> PUSH[push]
    PUSH --> WRITE

    Q -- Yes --> WRITE["write\n書く画面（ホーム）\n─────────────\nチェックボックスON/OFF\nタグサジェスト"]

    WRITE -- "新規付箋（保存して白紙エディタへ）" --> WRITE
    WRITE -- "PCに送る（ノンブロッキング）" --> TOAST["トースト通知"]
    TOAST -. "完了後" .-> LIST
    WRITE -- "一覧" --> LIST

    LIST["list\n一覧（時系列）\nPC受信 / 保存済み / 送信済み\nチェックボックス付きはインラインでトグル"]
    LIST -- "ノートタップ（draft / sent / received_pc）" --> WRITE
    LIST -- "＋" --> WRITE
```

**画面状態の説明**:

| 画面 | 説明 |
|---|---|
| `login` | 初回のみ。Google OAuth でログイン |
| `push` | 初回のみ。プッシュ通知の許可を取得 |
| `write` | **ホーム画面**。テキスト・画像・Mermaid 入力。ログイン済みなら常にここから始まる |
| `list` | 履歴一覧。PC受信（薄藍）/ 保存済み（グレー）/ 送信済み（薄青）をバッジで区別。チェックボックスはインラインでトグル可能 |
