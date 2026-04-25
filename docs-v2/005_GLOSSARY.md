---
title: 005 用語集
outline: deep
---

# 📖 005 用語集

<p class="lead-text">
専門用語・略語一覧
</p>

<p class="version-info">
v1.0 / 2026-04-20
</p>

---

## 1 認証・セキュリティ

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | OAuth 2.0 | Google が採用する認可プロトコル。ユーザーの許可を得て、アプリが Google Drive 等のリソースにアクセスできる仕組み。「認証（ログイン確認）」ではなく「認可（権限の委譲）」であることに注意。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 2 | PKCE | **Proof Key for Code Exchange** の略。パブリッククライアント（ネイティブアプリ・SPA）向けの OAuth 2.0 拡張仕様。認可コードの横取り攻撃を防ぐため、ランダムな検証文字列（verifier）と SHA-256 ハッシュ（challenge）を使う。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | アクセストークン | Google Drive API 等を呼び出す際に必要な短期間有効な認証チケット。有効期限は約 1 時間。期限切れ後はリフレッシュトークンで更新する。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 4 | リフレッシュトークン | アクセストークンが失効した後、新しいアクセストークンを取得するための長期間有効な証明書。PC 側は `gdrive_token.json` に保存し、iPhone 側は `localStorage` に保存する。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | JWT | **JSON Web Token** の略。ヘッダー・ペイロード・署名の 3 部を Base64URL エンコードしてドットで連結したトークン形式。VAPID 署名に使用する。 | [002_PC.md](/002_PC.html) |
| 6 | ECDH / P-256 | **Elliptic Curve Diffie-Hellman**。楕円曲線を使った鍵共有プロトコル。P-256 は NIST 標準の楕円曲線パラメータ。Web Push ペイロードの暗号化鍵の導出に使用する。 | [002_PC.md](/002_PC.html) |

---

## 2 Push 通知

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | Web Push | ブラウザ向けの Push 通知標準仕様（RFC 8030 / RFC 8291 / RFC 8292）。Service Worker がバックグラウンドで Push メッセージを受信し、OS ネイティブの通知を表示できる。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 2 | VAPID | **Voluntary Application Server Identification** の略。Web Push サーバーが自身を識別するための仕組み（RFC 8292）。P-256 鍵ペアから生成した JWT をリクエストヘッダーに付与しサーバーを認証する。PC 側の `webpush.rs` で実装済み。 | [002_PC.md](/002_PC.html) |
| 3 | APNs | **Apple Push Notification service** の略。iOS デバイスへの Push 通知を仲介する Apple のサービス。Web Push を送ると最終的に APNs が iPhone を起こす。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) |
| 4 | AES-128-GCM | Web Push のペイロードを暗号化するために使用する対称暗号方式（RFC 8291 準拠）。128 bit の鍵で GCM モードの AES 暗号化を行う。`webpush.rs` の `encrypt_payload` 関数で実装。 | [002_PC.md](/002_PC.html) |
| 5 | pending_open | このプロジェクト固有の用語。iOS では `notificationclick` イベントが発火しないため、SW が Push 受信時に `fusen-meta`（IndexedDB）へ保存する「直近の通知 ID の痕跡」。アプリ復帰時に `page.tsx` がこれを読んで「通知からの起動」と判断し、再通知を行う。30 分で失効。 | [003_IPHONE.md](/003_IPHONE.html) |

---

## 3 ブラウザ技術

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | PWA | **Progressive Web App** の略。Web 技術（HTML / CSS / JS）で構築しながら、ホーム画面へのインストール・オフライン動作・Push 通知などのネイティブ機能を持つアプリ。iPhone 側の Viewer がこれにあたる。 | [003_IPHONE.md](/003_IPHONE.html) |
| 2 | Service Worker（SW） | ブラウザのバックグラウンドで動作する JavaScript スクリプト。UI スレッドとは独立して動作し、Push 受信・キャッシュ管理・オフライン対応を担う。本プロジェクトでは Push 受信 → IndexedDB 保存 → 通知表示 の核心部分。 | [003_IPHONE.md](/003_IPHONE.html) |
| 3 | IndexedDB | ブラウザに組み込まれた非同期・トランザクション対応のキーバリュー型データベース。iPhone PWA では付箋データ（`fusen-drafts`）・ログ（`fusen-logs`）・メタ情報（`fusen-meta`）の 3 ストアを使用する。 | [003_IPHONE.md](/003_IPHONE.html) |
| 4 | frontmatter | Markdown ファイルの先頭に配置する YAML 形式のメタデータブロック。`---` で囲まれた部分。本プロジェクトでは付箋ファイル（.md）のタイトル・タグ・アラーム日時・色などのメタ情報を格納する。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | skipWaiting / clients.claim | 新しい Service Worker を即時有効化するための API。`skipWaiting()` はインストール待ちの SW を強制起動し、`clients.claim()` は起動中のページを新 SW の管轄下に置く。バグ修正版 SW のデプロイ後、古い SW が動き続けることを防ぐ。 | [003_IPHONE.md](/003_IPHONE.html) |
| 6 | locked（フラグ） | IndexedDB の付箋レコードに付与する boolean フィールド。`true` の場合、ロック画面への通知常駐（再通知サイクル）が有効になる。ユーザーが 🔔 ボタンで手動切り替えできる。 | [003_IPHONE.md](/003_IPHONE.html) |

---

## 4 フレームワーク・ランタイム

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | Tauri | Rust で書かれたデスクトップアプリフレームワーク。OS の WebView（Windows は WebView2）でフロントエンドを表示し、Rust のバックエンドと `invoke` / イベントで通信する。Electron より軽量でバイナリサイズが小さい。PC 側アプリのランタイム。 | [002_PC.md](/002_PC.html) |
| 2 | Next.js | React ベースのフルスタック Web フレームワーク。iPhone PWA（`app/viewer/`）と Vercel 上の API Routes（OAuth・Push）の両方に使用する。 | [003_IPHONE.md](/003_IPHONE.html) |
| 3 | Vercel | Next.js を提供する会社が運営するホスティングサービス。iPhone PWA の配信・OAuth のトークン交換 API・Push のプロキシ API を担う。本プロジェクトでは「仲介役」として PC ↔ iPhone の通信を繋ぐ唯一のサーバーサイド環境。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 4 | Vitest | Vite ベースの高速 JavaScript / TypeScript テストフレームワーク。本プロジェクトのフロントエンドユニットテストに使用。`npm run test` で実行する。 | [004_TEST.md](/004_TEST.html) |
| 5 | Playwright | Microsoft 製のブラウザ自動化・E2E テストフレームワーク。実際の Tauri アプリを起動してユーザー操作をシミュレートする。本プロジェクトの E2E テストに使用。 | [004_TEST.md](/004_TEST.html) |

---

## 5 設計用語

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | USDM | **Universal Specification Describing Manner** の略。「要求 → 理由 → 仕様」の 3 層で要件を記述する手法。要求（What）・理由（Why）・仕様（How）を構造化することで、実装者が設計判断を正しく理解できる。`000_REQUIREMENTS.md` がこの形式を採用。 | [000_REQUIREMENTS.md](/000_REQUIREMENTS.html) |
| 2 | DOD | **Data-Oriented Design** の略。処理をオブジェクト中心ではなくデータ変換として設計する手法。Rust 側のロジックがこの思想で実装されており、状態変更を意図した副作用として明示的に扱う。 | [002_PC.md](/002_PC.html) |
| 3 | Effect Pattern | Logic 層が副作用（ファイル書き込み・API 呼び出し等）を直接実行せず、「何をすべきか」を表す Effect 値を返し、呼び出し元の Command 層が実行する設計パターン。テスト容易性と副作用の明示化が目的。 | [002_PC.md](/002_PC.html) |
| 4 | SSOT | **Single Source of Truth** の略。データの「唯一の正規ソース」を一か所に集中させる設計原則。冗長なデータコピーが存在しないため、不整合が起きにくい。PC 側では `AppState`（Rust の Mutex&lt;AppState&gt;）が SSOT。 | [002_PC.md](/002_PC.html) |
| 5 | AppState | このプロジェクトの PC アプリ（Rust 側）における単一状態管理構造体。`Mutex<AppState>` として Tauri の状態管理に登録し、全コマンドから参照する。SSOT の実体。 | [002_PC.md](/002_PC.html) |
| 6 | Vault | 付箋データ（.md ファイル）の保存先フォルダ。ユーザーが設定した任意のディレクトリを指定できる。`AppState.vault_path` に保持。 | [002_PC.md](/002_PC.html) |

---

## 6 Google Drive API

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | Google Drive API v3 | Google のクラウドストレージ操作 API。本プロジェクトでは PC ↔ iPhone 間のデータ中継（JSON ファイル・画像ファイルの読み書き）に使用する。直接通信は行わず、必ず Drive を経由する。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 2 | multipart upload | メタデータ（JSON）とファイル本体を 1 回の HTTP リクエストで送信するアップロード方式。Drive API では `uploadType=multipart` を指定する。本プロジェクトの全ファイルアップロードがこの方式。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 3 | ore-no-fusen フォルダ | Google Drive 上に自動作成されるアプリ専用フォルダ（名前: `ore-no-fusen`）。JSON ファイル・画像ファイルはすべてこのフォルダ内に保存される。起動時に存在しなければ自動作成する。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 4 | notes_to_iphone.json | PC → iPhone への送信データを格納する中継ファイル。PC が書き込み、Service Worker が読み込んで IndexedDB に保存した後、削除する。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 5 | notes_from_iphone.json | iPhone → PC への送信データを格納する中継ファイル。iPhone PWA が書き込み、PC の 30 秒ポーリングが読み込んで付箋を生成した後、削除する。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [003_IPHONE.md](/003_IPHONE.html) |
| 6 | push_devices.json | Web Push の送信先デバイス情報（endpoint・p256dh・auth 等）を格納する JSON ファイル。Drive 上に保存し、PC がポーリングして `AppState` にキャッシュする。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) |

---

## 7 データ形式

| No | 用語 | 解説 | 関連ファイル |
|:---|:---|:---|:---|
| 1 | YAML | **YAML Ain't Markup Language** の略。インデントとコロンで構造を表す人間が読みやすいデータ形式。付箋ファイルの frontmatter に使用する。 | [002_PC.md](/002_PC.html) |
| 2 | JSON | **JavaScript Object Notation** の略。キーと値のペアで構成するテキストベースの軽量データ交換形式。Drive 上の中継ファイルや API レスポンスに使用する。 | [001_OVERVIEW.md](/001_OVERVIEW.html) / [002_PC.md](/002_PC.html) |
| 3 | Blob | **Binary Large Object** の略。画像などのバイナリデータを表すオブジェクト。IndexedDB 内の画像保存（`fusen-drafts` の `images` フィールド）に使用する。 | [003_IPHONE.md](/003_IPHONE.html) |
| 4 | Markdown（.md） | プレーンテキストに記法を加えて構造化する軽量マークアップ言語。付箋データの本文形式。frontmatter を先頭に持つ Markdown ファイル（`.md`）が付箋の実体として Vault フォルダに保存される。 | [002_PC.md](/002_PC.html) / [003_IPHONE.md](/003_IPHONE.html) |

---

## 8 改版履歴

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 2026-04-20 | 新規作成。設計書に登場する専門用語を整理。 |
