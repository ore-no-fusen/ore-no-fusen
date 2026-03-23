# Stack Research

**Domain:** iPhone連携追加 (Hono API + Web Push VAPID + APNs + Google Drive API + PWA)
**Researched:** 2026-03-23
**Confidence:** MEDIUM (WebSearch/WebFetch unavailable; based on official package metadata knowledge + existing codebase analysis)

---

## Context: What Already Exists

This is an **additive milestone** to an existing working stack. Do not change or migrate existing packages.

| Already Present | Version | Status |
|----------------|---------|--------|
| next-pwa | ^5.6.0 | ALREADY INSTALLED — but see warning below |
| next | ^14.2.5 | Active |
| react / react-dom | ^18.3.1 | Active |
| typescript | ^5.5.3 | Active |
| tauri v2 | 2.9.5 | Active |
| base64 (Rust) | 0.22 | Active |
| tokio (Rust) | 1 | Active |

---

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| hono | ^4.6.x | API ルーティング基盤（Push通知・Drive連携エンドポイント） | Next.js App Router の `[[...route]]/route.ts` パターンで既存API Routeと共存可能。Vercel Edge Runtime対応。web-push処理を集約する唯一の追加サーバー層。 |
| web-push | ^3.6.x | VAPID署名生成・APNs/FCM Push通知送信 | Node.js標準のVAPID実装。APNs HTTP/2をVAPID経由で叩ける（Apple公式対応）。iPhone Safari 16.4+ で動作確認済み。 |
| @google-cloud/local-auth または googleapis | ^6.x (local-auth) / ^144.x (googleapis) | Google Drive APIクライアント | **シングルユーザー前提のため `googleapis` を使い OAuth2Client を直接構成する**。`@googleapis/drive` (モジュラー版) は bundle size が小さいがVercel Node.js Runtimeでは差が小さく、型補完の充実した `googleapis` で十分。 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hono/node-server | 不要 | (参考: スタンドアロンNode用) | Vercel上ではNode Server不要。Honoの`handle`をApp Routeにexportするだけ |
| jose | ^5.x | VAPID用 ES256 JWT署名 (web-push内包だが直接使う場合) | web-pushパッケージが内部で依存するため**直接インストール不要** |
| @types/web-push | ^3.6.x | web-push の TypeScript型定義 | devDependencyとして必須 |

### Rust追加クレート (src-tauri/Cargo.toml)

| Crate | Version | Purpose | Why |
|-------|---------|---------|-----|
| reqwest | { version = "0.12", features = ["json"] } | Hono APIエンドポイントへのHTTPリクエスト（「iPhoneに送る」コマンド） | tokioは既存。async/awaitで`invoke`ハンドラからVercel APIを叩くだけ。TLSはrustlsではなくデフォルトのnative-tlsを使用（Windows互換） |

**注意**: VAPID暗号化はすべてHono(TypeScript)側で処理する。RustにはHTTPリクエストのみを担わせる。これはPROJECT.mdの方針どおり。

---

## Installation

```bash
# Core additions (Hono + Push + Google Drive)
npm install hono web-push googleapis

# Dev dependencies
npm install -D @types/web-push
```

```toml
# src-tauri/Cargo.toml に追加
reqwest = { version = "0.12", features = ["json", "native-tls"] }
```

---

## Critical Warning: next-pwa

**`next-pwa@5.6.0` は既にインストール済みだが問題がある。**

- `next-pwa` (nus3/next-pwa) はメンテナンス停止済み。Next.js 14 App Routerで動作不安定の報告あり。
- 現在の `next.config.mjs` では `IS_TAURI_BUILD !== 'true'` の場合のみService Workerを登録している。
- iPhone Safari PWA のために**Service Workerが必要**なので、現状の `next-pwa` が正常動作するか検証が必要。

**推奨対応:**
```
現状の next-pwa@5.6.0 が Vercel上で動作するなら そのまま使う（最小修正の原則）。
動作しない場合のみ @ducanh2912/next-pwa@^10.x に移行する
（同一APIで next-pwa のメンテ継続版）。
```

**Service Worker の push イベントハンドラ**は `next-pwa` の `sw.ts` カスタムエントリポイントまたは `public/sw.js` に手動で追記する。パッケージの置き換えではなくファイル追記で済む。

---

## Hono Integration Pattern

Next.js App Router 内に Hono を追加する標準パターン:

```
app/
  api/
    feedback/route.ts     ← 既存。変更しない
    push/
      [[...route]]/
        route.ts          ← Hono をここにマウント
```

```typescript
// app/api/push/[[...route]]/route.ts
import { Hono } from 'hono'
import { handle } from 'hono/vercel'

const app = new Hono().basePath('/api/push')
// ... ルート定義
export const GET = handle(app)
export const POST = handle(app)
```

`IS_TAURI_BUILD === 'true'` のとき `output: 'export'` になるため、Tauri buildではこのルートは存在しない。Tauri側は `reqwest` で `https://ore-no-fusen.vercel.app/api/push/...` を直接叩く。

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| hono | Next.js Route Handler直接実装 | エンドポイントが1-2個ならRoute Handlerで十分。3個以上になるとHonoの型安全ルーティングが有利 |
| web-push | APNs HTTP/2を直接実装 (node-apn等) | APNsのみを対象にする場合。VAPIDはWeb標準なのでweb-pushの方が将来Android対応も容易 |
| googleapis | @googleapis/drive (モジュラー) | Vercel Edge Runtimeを使う場合はモジュラー版必須。Node.js Runtimeなら差は小さい |
| reqwest (Rust) | Tauri HTTP plugin | tauri-plugin-http を使う選択肢もあるが、Rust側で直接reqwestを使う方がコントロールしやすく、plugin依存を増やさない |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| next-auth | シングルユーザー前提。Googleログインを複雑なsession管理なしで実装できる | googleapis の OAuth2Client に refresh_token を.envに直書きして使う |
| firebase-admin / FCM | APNs直接送信(VAPID経由)で十分。Firebaseの依存追加はオーバーキル | web-push |
| @tauri-apps/plugin-http | reqwestを直接使う方がシンプル。pluginを増やすとCapabilities設定が複雑になる | reqwest クレート直接 |
| workbox直接設定 | next-pwa が内部でworkboxをラップしている。直接触ると競合する | next-pwa のカスタムSWエントリポイント経由でpushイベントを追記 |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| hono@4.6.x | next@14.2.5 | App Router `handle()` パターンは Next.js 13.2+ から対応 |
| web-push@3.6.x | Node.js 18+ | Vercel Functions は Node.js 20 デフォルト。互換 |
| googleapis@144.x | TypeScript 5.x | 型定義内蔵。@types/googleapis 不要 |
| reqwest@0.12 | tokio@1 (既存) | async対応。Cargo.toml の tokio features に `rt-multi-thread` が必要な場合あり（現状確認要） |
| @ducanh2912/next-pwa@10.x | next@14.2.5 | next-pwa@5.6.0 が動かない場合の代替。API互換 |

---

## Sources

- 既存 `package.json` / `Cargo.toml` の確認 (HIGH confidence — ファイル直接参照)
- `.planning/PROJECT.md` の設計方針 (HIGH confidence — プロジェクト確定済み)
- `next.config.mjs` の `output: 'export'` / IS_TAURI_BUILD フラグ (HIGH confidence — ファイル直接参照)
- Hono公式 App Router統合パターン — training data (MEDIUM confidence — バージョン要確認)
- web-push npm パッケージ VAPIDサポート — training data (MEDIUM confidence)
- next-pwa@5.6.0 メンテ状況 / @ducanh2912/next-pwa — training data (MEDIUM confidence — 導入前に npm で最新版確認推奨)

---

*Stack research for: iPhone連携 (Hono + Web Push + Google Drive + PWA)*
*Researched: 2026-03-23*
