---
title: 006 4+1 Viewアーキテクチャ
outline: deep
---

# 📐 006 4+1 Viewアーキテクチャ

<p class="lead-text">
4+1 View Model・システム全体俯瞰図
</p>

<p class="version-info">
設計書 v1.0 / 2026-04-21
</p>

---

## 1 4+1 View Model について

ソフトウェアアーキテクチャは、単一の図面や視点だけで全体を表現することは困難です。
**「4+1 View Model」**は、1995年にPhilippe Kruchtenが提唱した設計フレームワークであり、システムを「論理」「プロセス」「開発」「物理」の4つのビューと、それらを統合する「シナリオ」という5つの異なる視点から表現することで、すべての関係者（ユーザー、開発者、SysAdmin）に明確な理解を提供します。

<Note type="info">
本ドキュメントは「俺の付箋」のすべての詳細設計ドキュメント（001〜005）を束ねる**メタアーキテクチャ仕様書**です。各ビューから該当する詳細ドキュメントへとリンクします。
</Note>

---

## 2 論理ビュー

対象: エンドユーザー、システムアナリスト。システムが提供する機能要素とドメインモデルを定義します。

### 2.1 コアドメインモデル：付箋（Fusen）

本システムの最も重要な論理エンティティは「付箋（Fusen）」です。PCではMarkdownファイルとして、iPhoneではIndexedDBオブジェクトとして存在しますが、論理的には同一のエンティティとして扱われます。

```mermaid
classDiagram
    direction LR
    class Fusen {
      +String id
      +String title
      +String content
      +String color
      +Number width
      +Number height
      +Date updatedAt
    }
    class UserSettings {
      +String driveToken
      +String theme
      +Boolean stayOnTop
    }
    class DeviceInfo {
      +String deviceId
      +String pushToken
      +String platform
    }

    Fusen "*" -- "1" UserSettings : Managed by
    UserSettings "1" -- "*" DeviceInfo : Syncs across
```
<p class="mermaid-caption">図 6-1　論理ドメインモデル関係図</p>

### 2.2 フロントエンドの状態分離

- **ViewingMode（閲覧モード）:** HTML/CSSで高速レンダリングされた状態。
- **EditingMode（編集モード）:** CodeMirrorインスタンスが立ち上がった状態。

<Note type="warning">
<strong>詳細リンク:</strong> PCアプリのUIクラス構造やモードの詳細は <a href="/002_PC#sec3-3-クラス図依存関係">002_PC のクラス図</a> 参照。
</Note>

---

## 3 プロセスビュー

対象: パフォーマンステスター、アーキテクト。並行処理、同期、IPC（プロセス間通信）、バックグラウンド非同期処理の実行モデルを定義します。

### 3.1 非同期メッセージングとイベント駆動処理

本システムは「ポーリング」と「イベント駆動（Push）」を適材適所で組み合わせて並行処理を実現します。
PC（Tauri）はバックグラウンドスレッドでイベントを監視（`tauri::async_runtime`）し、iPhone（PWA）は Service Worker を通じてブラウザのメインスレッドとは独立したプロセスでデータを受け取ります。

```mermaid
%%{init: {'sequence': {'messageMargin': 8, 'mirrorActors': false, 'height': 24, 'boxMargin': 4, 'noteMargin': 6}}}%%
sequenceDiagram
    participant PC as PC App (Rust/Tauri)
    participant Drive as Google Drive
    participant Push as APNs / FCM (Push Server)
    participant SW as Service Worker (iPhone)
    participant IDB as IndexedDB
    
    rect rgba(59, 130, 246, 0.15)
    Note over PC,IDB: Process 1: イベント駆動型バックグラウンド転送 (PC -> iPhone)
    PC->>Drive: 1. async write notes_to_iphone.json
    PC->>Push: 2. fire Web Push trigger (async)
    Push-->>SW: 3. wake up Service Worker
    SW->>Drive: 4. fetch & delete JSON
    SW->>IDB: 5. transaction write
    SW-->>SW: 6. self.registration.showNotification
    end

    rect rgba(34, 197, 94, 0.15)
    Note over PC,Drive: Process 2: ポーリング型受信 (iPhone -> PC)
    loop Every 30 seconds (tokio::time::interval)
        PC->>Drive: check notes_from_iphone.json
        alt Found data
            PC->>PC: emit IPC event to React
            PC->>Drive: delete file
        end
    end
    end
```
<p class="mermaid-caption">図 6-2　通信およびバックグラウンドプロセスのタイムライン</p>

<Note type="info">
<strong>詳細リンク:</strong> プロセス間通信（IPC）やService Workerの詳細な動作シーケンスは <a href="/001_OVERVIEW#sec3-システムデータフロー">001_OVERVIEW の データフロー</a> および <a href="/003_IPHONE#sec4-データフロー">003_IPHONE の シーケンス</a> 参照。
</Note>

---

## 4 開発ビュー

対象: 開発者、プログラマー。ソフトウェアモジュールの階層構造、ディレクトリ構成、ライブラリスタックを定義します。

### 4.1 モノレポアーキテクチャ

本プロジェクトは単一のリポジトリ（モノレポ）で「PC（Tauri）」「iPhone（PWA）」「Vercel（API）」のすべてのコードを管理しています。フロントエンドを Next.js（React） で統一することで、UIコンポーネントや型定義（TypeScript）を共通化しています。

<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:12px 0;">
<table class="module-table">
  <tr><th>ディレクトリ</th><th>責任範囲</th><th>技術スタック</th></tr>
  <tr><td><code>src-tauri/</code></td><td>PCアプリのコアロジック、OSネイティブAPI（ウィンドウ操作、トレイ）、ローカルファイルI/O</td><td>Rust (tokio, tauri, reqwest)</td></tr>
  <tr><td><code>app/viewer/</code></td><td>iPhone PWA および Vercel API Routes のエントリーポイント</td><td>Next.js (App Router), React, Google APIs</td></tr>
  <tr><td><code>app/page.tsx</code> 等</td><td>PCアプリ用のフロントエンド・UIコンポーネント群</td><td>Next.js, Tailwind CSS, CodeMirror</td></tr>
</table>
<table class="module-table">
  <tr><th>ディレクトリ</th><th>責任範囲</th><th>技術スタック</th></tr>
  <tr><td><code>public/worker/</code></td><td>iPhone バックグラウンド同期と通知処理</td><td>Vanilla JS (Service Worker API), IndexedDB</td></tr>
  <tr><td><code>.github/workflows/</code></td><td>CI/CD パイプライン（自動ビルド、Winget自動リリース）</td><td>GitHub Actions</td></tr>
</table>
</div>

<Note type="warning">
<strong>データ指向設計 (DOD):</strong> Rust側は状態管理（`AppState`）を Single Source of Truth とし、副作用（Side-Effect）を分離する Effect Pattern を採用。
</Note>

---

## 5 物理ビュー

対象: インフラエンジニア。システムがデプロイされるハードウェア、ネットワーク、実行コンテキストを定義します。

### 5.1 ランタイム環境とネットワーク・トポロジー

本システムは中央集権的なデータベースを持たず、**「ユーザーのデバイス（Edge）」**と**「ユーザー所有のパーソナルクラウド（Drive）」**のみで完結するピュアな分散コンピューティングモデルです。
Vercelは静的ファイルのホスティングおよび一時的な認証プロキシ（OAuth2 Secret の秘匿）のためだけに存在します。

```mermaid
flowchart LR
    subgraph "Local Execution Environment (Edge)"
        PC["PC (Windows / macOS)<br>Tauri + Local Filesystem"]
        IPHONE["iPhone / iPad<br>Safari WebKit + IndexedDB"]
    end

    subgraph "User Cloud Infrastructure"
        DRIVE["Google Drive API <br> (User's Storage)"]
    end

    subgraph "Vendor Infrastructure"
        VERCEL["Vercel Serverless Edge<br>Hosted App"]
        APNS["Apple Push Notification Service"]
    end

    PC <-->|HTTPS API / Polling| DRIVE
    IPHONE <-->|HTTPS API| DRIVE
    IPHONE -->|Fetch PWA / Auth| VERCEL
    PC -->|Trigger Push| APNS
    APNS -->|Deliver Push| IPHONE
    VERCEL -.->|Client Secret| DRIVE
```
<p class="mermaid-caption">図 6-3　物理デプロイトポロジー</p>

<Note type="success">
<strong>セキュリティ原則:</strong> 開発者が管理するサーバー（Vercel）にはユーザーのメモデータ（Fusen）は一切保存も通過もされません。通信はすべて HTTPS 経由で Google のサーバーへ直接（Peer-to-Cloud）行われます。
</Note>

---

## 6 ユースケース（Scenarios）

対象: 全ステークホルダー。4つのビューを実証する代表的なユースケースのシナリオです。

### 6.1 中心シナリオ: 「出先での確認と返信」

本アーキテクチャの存在意義と4つのビューの連携をもっとも色濃く反映している一連のシナリオ（ユースケース）です。

| ステップ | ユーザー視点のシナリオ展開 | アーキテクチャの関与ビュー |
|:---|:---|:---|
| **1. PCで入力** | ユーザーがPC上で「買い物リスト」を書き、「iPhoneに送る」ボタンを押す。 | **[Logical]** Fusen オブジェクトの生成<br>**[Development]** RustモジュールによるファイルI/O |
| **2. クラウド中継** | 数秒以内にノートがクラウドにアップロードされ、通知発火のトリガーが引かれる。 | **[Physical]** Local PC → Google Drive 通信<br>**[Process]** APNs への非同期 Push API 呼び出し |
| **3. iPhoneで受信** | ユーザーが外出先でiPhoneを見ると、ポケットの中で既に通知（新着ノート）が届いている。 | **[Process]** Service Workerのバックグラウンド起床とDrive取得<br>**[Physical]** Safariサンドボックス内でのIndexedDB保管 |
| **4. 返信して削除** | iPhoneから「牛乳買ったよ」と追記してPCに送り返し、手元のノートを消す。 | **[Logical]** Viewing/Editing Mode の遷移（PWA）<br>**[Process]** PCの30秒ポーリングによる即時回収と自動削除 |

<Note type="info">
このシナリオをプログラムで自動検証する E2E テストの仕様と結果については、<a href="/004_TEST">004 テスト設計</a> を参照してください。
</Note>

---

## 7 改版履歴

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 2026-04-21 | 新規作成。4+1 View Model（論理・プロセス・開発・物理・シナリオ）全ビューを整理。 |
| 2 | 1.1 | 2026-04-24 | classDiagram・物理ビュー flowchart を `LR`（横向き）に変更。スクロールなしで全体が見えるよう改善。 |

<div style="margin-top:60px;text-align:center;font-size:12px;color:#94a3b8">
  © 2026 Ore No Fusen Project. 4+1 View Architecture Design.
</div>
