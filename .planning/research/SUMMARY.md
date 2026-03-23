# Project Research Summary

**Project:** 俺の付箋 v2.0 — iPhone連携
**Domain:** Desktop sticky note app + iPhone Push notification via Vercel-hosted API
**Researched:** 2026-03-23
**Confidence:** MEDIUM (architecture HIGH from project docs; stack/pitfalls MEDIUM from training data)

## Executive Summary

俺の付箋 v2.0 は、既存の Tauri/Next.js デスクトップアプリに iPhone へのプッシュ通知連携を追加する**加算的マイルストーン**である。設計の核心は「新しいインフラを持ち込まない」こと — Vercel（既存）・Google Drive（BYOS）・VAPID/APNs（Web標準）の組み合わせで、データベースもネイティブiOSアプリも不要な構成を実現する。PC からの右クリック一発送信 → APNs → iPhone PWA 通知 → 全文閲覧、という流れがコアバリューであり、実装の大部分は既存コードへの最小限の追加で完結する。

推奨アーキテクチャは明確に2フェーズに分かれる。Phase 1 は Hono + Google Drive + VAPID の API 基盤を Vercel 上で構築する（Rust/フロントエンド変更なし）。Phase 2 は iPhone PWA（Service Worker + manifest）と Rust の `fusen_send_to_iphone` コマンドを追加し、既存の右クリックメニュー項目を有効化する。この順序は強制依存関係によるもの — Rust コマンドは Hono API が稼働していないとテスト不可能である。

主要リスクは2点に集約される。第一に iOS Safari の「PWAインストール必須」制約 — ホーム画面追加前にはプッシュ許可ダイアログが出ない。第二に OAuth refresh_token 管理 — Google Drive の認証トークンが失効するとサイレント障害になる。いずれも実装開始前から設計に組み込むことで、後からの手戻りを防げる。

## Key Findings

### Recommended Stack

既存スタック（Next.js 14 + Tauri v2 + React 18 + tokio）はそのまま維持する。追加するのは3つのnpmパッケージと1つのRustクレートのみ。既存の `next-pwa@5.6.0` は Service Worker 登録に使うが、カスタム push イベントハンドラとの衝突回避が必要（`customWorkerSrc` または別ファイル名で解決）。

**Core technologies:**
- `hono@^4.6.x`: API ルーティング基盤 — Next.js App Router の `[[...route]]/route.ts` パターンで既存コードと共存。`export const runtime = 'nodejs'` を必ず宣言する。
- `web-push@^3.6.x`: VAPID署名・APNs Push送信 — Safari Web Push対応はv3.5以降。v3.6+を使うこと。
- `googleapis@^144.x`: Google Drive API — シングルユーザー前提のため OAuth2Client に refresh_token を直接設定。
- `reqwest@0.12` (Rust): Tauri → Hono への HTTP呼び出し — `rustls-tls` feature でWindows互換、既存 tokio で動作。

### Expected Features

**Must have (v2.0 table stakes):**
- iPhoneロック画面への通知 — コア機能。届かないなら意味がない
- 付箋テキストが通知に表示される — 何を送ったかが分かる
- 通知タップで PWA が開きノート全文が読める — 通知は4KBペイロード上限あり
- PWAインストール案内UI — `beforeinstallprompt` はiOS未対応のため手動案内必須
- Push通知権限リクエスト（PWAインストール後のオンボーディング）
- Push Subscription保存（Google Drive）
- 右クリック「iPhoneに送る」有効化 — 既存コードの `enabled: false` を外すだけ

**Should have (競争優位):**
- 右クリック一発送信のUX — 既存コードが `ctx_send_to_iphone` としてスタブ済み
- Google Drive中継（DBなし・費用ゼロ）— BYOS設計の核心
- 送信成功/失敗のフィードバック（Tauriトースト）

**Defer (v3+):**
- iPhoneからの編集（双方向同期）— 競合解決が必要で工数3倍
- Android対応 — VAPID共通なので後から容易に追加可能
- リアルタイム同期（WebSocket/SSE）— Google Drive ポーリングで代替

### Architecture Approach

全体は「PC(Tauri/Rust) → Vercel(Hono) → APNs → iPhone(Safari PWA)」の一方向パイプラインである。永続化は Google Drive の2ファイル（`fusen_push_config.json` + `fusen_note.json`）のみ。既存の `app/api/*.ts` ファイルは Tauri invoke ラッパーであり HTTP ルートではないため、新しい `app/api/v1/` Hono ルートとの衝突はゼロ。

**Major components:**
1. **Hono entry** (`app/api/v1/[[...route]]/route.ts`) — 全 `/api/v1/*` リクエストのルーティング。`nodejs` runtime 固定。
2. **lib/gdrive.ts** — Google Drive 読み書きラッパー。OAuth2Client + refresh_token 管理。両フェーズから依存される。
3. **lib/webpush.ts** — VAPID keygen + sendNotification ラッパー。`sub` クレーム設定を内包。
4. **public/sw.js** — Service Worker。push / notificationclick のみ実装。next-pwa の上書き回避が必要。
5. **fusen_send_to_iphone** (Rust, `src-tauri/src/lib.rs`) — ノート読み取り + reqwest で Hono に POST。
6. **app/viewer/page.tsx** — PWA ビューアー + ホーム画面追加ガイド + 購読フロー。

### Critical Pitfalls

1. **iOS Safari PWAインストール必須** — ブラウザタブでは `requestPermission()` が即拒否になる。`navigator.standalone` チェック + 「ホーム画面に追加」案内UIを Phase 1 から組み込む。
2. **VAPID `sub` クレーム未設定** — APNs は `mailto:` または `https://` 形式の `sub` を必須扱い。Chrome では届くのに iPhone だけ届かない症状になる。`setVapidDetails()` に必ず設定する。
3. **Google Drive OAuth refresh_token の無管理** — 数週間後にサイレント障害になる。`OAuth2Client` の `refreshIfNeeded()` + 失敗時503レスポンスを初回実装に含める。
4. **Hono の Edge Runtime 誤設定** — `googleapis` は Node.js APIs に依存。`route.ts` に `export const runtime = 'nodejs'` を最初から宣言する。
5. **next-pwa による sw.js 上書き** — ビルドのたびにカスタム push イベントハンドラが消える。`customWorkerSrc` オプションか別ファイル名で回避する。

## Implications for Roadmap

研究結果から、2フェーズ構成を強く推奨する。フェーズ間の境界はハード依存関係に基づく。

### Phase 1: Hono + Drive + VAPID API 基盤

**Rationale:** Rust コマンドと iPhone PWA の両方が Hono エンドポイントに依存する。API が稼働していない状態では他のコンポーネントをテストできない。Rust/フロントエンド変更なしで完結するため、Vercel デプロイのみで検証できる。

**Delivers:** `POST /api/v1/subscribe`・`POST /api/v1/notes/push`・`GET /api/v1/notes/latest` が稼働し、curl でテスト可能な状態。

**Addresses:**
- VAPID鍵ペア生成・Hono APIエンドポイント（FEATURES P1）
- Google Drive OAuth認証 + subscription.json 読み書き（FEATURES P1）

**Avoids:**
- Hono Edge Runtime 非互換（route.ts 作成時に `nodejs` runtime 宣言）
- OAuth refresh_token 無管理（gdrive.ts 実装時に refreshIfNeeded を含める）

**Build order within phase:**
1. npm install hono web-push googleapis
2. lib/gdrive.ts（Drive ラッパー）
3. lib/webpush.ts（VAPID ラッパー）
4. app/api/v1/[[...route]]/route.ts（Hono entry）
5. handlers/subscribe.ts、push.ts、latest.ts
6. .env.local + Vercel env vars
7. 検証: curl POST /api/v1/subscribe が200を返すこと

### Phase 2: iPhone PWA + Rust 送信コマンド

**Rationale:** Phase 1 の API が稼働している前提で、iPhone 側とデスクトップ側の両端を同時に追加する。これらは互いに独立して開発できるが、E2Eテストには両方必要。

**Delivers:** 右クリック「iPhoneに送る」がロック画面に通知を表示し、タップで全文が読める完全なフロー。

**Uses:**
- reqwest@0.12（Rust HTTP）
- public/sw.js（Service Worker）
- public/manifest.json（PWA manifest）

**Implements:**
- fusen_send_to_iphone Rust コマンド
- ctx_send_to_iphone メニュー項目の有効化（1行変更）
- app/viewer/page.tsx（セットアップガイド + ビューアー）

**Avoids:**
- iOS PWAインストール必須制約（viewer ページに navigator.standalone チェック + 案内UI）
- VAPID sub クレーム未設定（lib/webpush.ts で setVapidDetails に mailto: を設定済み）
- next-pwa による sw.js 上書き（customWorkerSrc または手動登録で回避）
- Push Subscription 不完全保存（endpoint + p256dh + auth の3フィールドすべて保存）

**Build order within phase:**
1. public/manifest.json（display: standalone 必須）
2. public/sw.js（next-pwa 衝突解決後）
3. app/viewer/page.tsx
4. Cargo.toml: reqwest 追加
5. lib.rs: fusen_send_to_iphone コマンド
6. useStickyNoteContextMenu.ts: enabled: true に変更
7. 検証: 実機 iPhone でE2Eフロー確認（シミュレーター不可）

### Phase Ordering Rationale

- **Phase 1 before Phase 2:** Rust コマンドは Hono エンドポイントに POST するが、エンドポイントなしでは動作確認不可。API を先に稼働させることでデバッグサイクルが大幅に短縮される。
- **gdrive.ts before handlers:** subscribe・push・latest の全ハンドラが gdrive.ts に依存するため、共通基盤を先に完成させる。
- **manifest.json before sw.js:** ブラウザは manifest が有効なときのみ PWA インストールプロンプトを表示する。
- **sw.js before viewer page:** viewer ページが Service Worker 経由で pushManager.subscribe を呼ぶため。
- **Cargo.toml before lib.rs change:** コンパイルエラーを防ぐため。
- **lib.rs before useStickyNoteContextMenu.ts:** Rust コマンドが存在しない状態でメニュー項目を有効化するとユーザーに見えるランタイムエラーが発生する。

### Research Flags

**Phase 1 は追加調査を推奨:**
- `next-pwa@5.6.0` の `customWorkerSrc` オプションが Next.js 14.2.x で動作するか — メンテ状況と実際の動作を npm / GitHub issues で確認する。動作しない場合は `@ducanh2912/next-pwa@^10.x` に移行（API互換）。
- Google OAuth `access_type: 'offline'` で refresh_token が確実に取得できるか — 初回認証前に確認。

**Phase 2 は実機検証が必須:**
- iOS 17 / iOS 18 での Web Push 動作変更 — 訓練データは2025年8月まで。最新の Apple Developer Documentation を確認する。
- APNs の Web Push Topic 設定 — `web-push@3.6+` が自動設定するが、Sandbox と Production のエンドポイント混在に注意。

**標準パターンで進められる（追加調査不要）:**
- Hono + Next.js App Router 統合 — 公式パターンが明確。
- reqwest + tokio の組み合わせ — 既存プロジェクトの tokio 設定で互換。
- VAPID/AES-128-GCM 暗号化 — web-push ライブラリが完全に抽象化。

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | パッケージの存在と目的は確か。バージョン互換性は npm で要確認。next-pwa の動作は実地検証必須。 |
| Features | MEDIUM | Web Push/VAPID 仕様はMDN公式で HIGH。iOS固有制約（PWAインストール必須等）は Apple 公式ブログ確認済みで MEDIUM-HIGH。 |
| Architecture | HIGH | プロジェクト自身の PLAN_web_iphone.md と ARCHITECTURE_DESIGN_v1.1.md を直接参照。コンポーネント境界とデータフローは確定済み。 |
| Pitfalls | MEDIUM | 主要な罠（iOS制約・VAPID sub・Edge Runtime）は複数ソースで確認。iOS 17/18 の変更点は未確認。 |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **next-pwa vs カスタム sw.js の衝突:** Phase 1 開始前に `next.config.mjs` の next-pwa 設定を調査し、`customWorkerSrc` が使えるか確認する。使えない場合は `@ducanh2912/next-pwa` 移行を Phase 1 に含める。
- **iOS 17/18 の Web Push 変更:** Apple Developer Documentation を Phase 2 開始前に確認。特に `pushsubscriptionchange` イベントのサポート状況。
- **Vercel 無料枠の Function タイムアウト:** googleapis + web-push チェーンが10秒以内に完了するか。Drive API が遅い環境でのタイムアウトリスクを Phase 1 デプロイ後に実測する。
- **reqwest の native-tls vs rustls-tls:** ARCHITECTURE.md は `rustls-tls` を推奨、STACK.md は `native-tls` を推奨と矛盾あり。Windows 互換性の観点から `rustls-tls` を採用することを推奨するが、実際のビルドで確認する。

## Sources

### Primary (HIGH confidence)
- `.planning/PLAN_web_iphone.md` — 実装計画（プロジェクトオーナー作成）
- `docs/ARCHITECTURE_DESIGN_v1.1.md` — アーキテクチャ設計書v1.1
- `app/hooks/useStickyNoteContextMenu.ts` — `ctx_send_to_iphone` スタブの存在確認
- `next.config.mjs` — next-pwa 設定の確認
- `src-tauri/Cargo.toml` — tokio 存在確認・reqwest 未追加確認
- `package.json` — hono/web-push/googleapis 未インストール確認
- MDN Web Docs — Push API, PushSubscription, PWA installability

### Secondary (MEDIUM confidence)
- Apple WebKit Blog: "Web Push for Web Apps on iOS and iPadOS" (知識ベース)
- `web-push` npm library changelog (訓練データ)
- Hono Vercel deployment docs (訓練データ)
- RFC 8292 VAPID (訓練データ)

### Tertiary (LOW confidence / needs validation)
- iOS 17/18 Web Push 変更点 — 訓練データは2025年8月まで、実地確認必須
- next-pwa@5.6.0 の Next.js 14 App Router 動作状況 — npm/GitHub issues で確認推奨

---
*Research completed: 2026-03-23*
*Ready for roadmap: yes*
