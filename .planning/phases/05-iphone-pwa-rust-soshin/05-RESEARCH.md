# Phase 5: iPhone PWA + Rust送信 - Research

**Researched:** 2026-03-23
**Domain:** iOS PWA Web Push / Next.js Service Worker / Google OAuth PKCE (frontend)
**Confidence:** HIGH

## Summary

Phase 5 は、すでに Phase 4 で完成した Rust バックエンド（VAPID 署名・APNs 送信・Google Drive R/W）の上に、iPhone Safari 側の PWA セットアップ画面と Service Worker を実装するフロントエンド完結フェーズ。Rust 側への変更は最小限（右クリックメニューの `enabled: true` 化のみ）であり、実質的な作業は Next.js 側に集中する。

iOS 16.4+ は Web Push を正式サポートしているが、**ホーム画面に追加した PWA 環境のみ**で動作する。Service Worker の push / notificationclick イベントが必須であり、next-pwa 5.6.0 の `worker/index.js` カスタムワーカー機構を利用してその追加ロジックを注入できる。Tauri 環境では Service Worker を登録しない（既存の `RegisterPWA.tsx` パターンを拡張）。

Google OAuth PKCE フローはフロントエンドで完結させる。`crypto.subtle` を使用して code_verifier / code_challenge を生成し、Google の authorization endpoint にリダイレクトし、コールバックで access_token を取得。取得した Push 購読情報を Google Drive の `fusen_push_config.json` に保存する。

**Primary recommendation:** `worker/index.js` に push/notificationclick を追加し、`RegisterPWA.tsx` を Tauri/Safari 分岐させ、`app/viewer/page.tsx` に1ページのセットアップUIを作る3点セットで実装する。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `manifest.json` の `start_url` を `"/viewer"` に変更、`description` を「PCの付箋をiPhoneで受け取るセットアップ」相当に更新
- `name` / `short_name` は「俺の付箋」「付箋」のまま
- Viewer ページ（/viewer）はシンプル1ページ（ウィザードなし）
- ページ先頭に短い説明文。ステップ1: Googleでログイン（OAuth PKCE + Drive保存）、ステップ2: 通知を許可（Push購読 + Drive保存）、完了後: 待機画面
- ホーム画面追加ガイドは `window.matchMedia('(display-mode: standalone)')` で未インストール時のみバナー表示
- バナーの手順: ① Safari 共有アイコン（↑）タップ → ② 「ホーム画面に追加」を選択
- 右クリックメニューの `ctx_send_to_iphone`（`enabled: false`）を `enabled: true` + `invoke('fusen_send_to_iphone', { path: selectedFile.path })` に変更
- 通知タップ後のViewerは `fusen_note.json` を Drive から読み込み全文表示

### Claude's Discretion
- Service Worker 管理: Tauri環境（`__TAURI_INTERNALS__` 検出）では引き続きSW登録解除、Safari環境ではPush対応カスタムSWを登録
- カスタム sw.js への push / notificationclick イベントハンドラ追加方法（workbox sw.js との上書き衝突を回避する実装方法）
- Google OAuth PKCE フローの具体的な実装（PKCE コードチャレンジ生成、コールバック処理）
- Viewer ページのスタイリング詳細

### Deferred Ideas (OUT OF SCOPE)
- Android Chrome 対応 — v3.0
- iPhoneからの編集・双方向同期 — v3.0
- 複数デバイスへの同時送信 — v3.0
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PWA-01 | `public/manifest.json` が作成され `display: standalone` が設定されている | 既存ファイルあり。`start_url` と `description` の2フィールド更新のみ |
| PWA-02 | `public/sw.js` が push 受信・showNotification・notificationclick を実装し、next-pwa との上書き衝突を回避している | `worker/index.js` カスタムワーカー機構を使用。push/notificationclick を worker/index.js に記述すれば next-pwa が sw.js に注入する |
| PWA-03 | `app/viewer/page.tsx` が初回セットアップガイド（Google OAuth PKCE + push subscription）と note 全文表示を提供する | 新規ファイル作成。OAuth PKCE は `crypto.subtle` で実装。Push 購読は `pushManager.subscribe()` で実装 |
| SEND-01 | iPhone PWA が Google OAuth PKCE フローで `fusen_push_config.json` を自分の Google Drive に保存する | viewer/page.tsx 内で fetch + Drive REST API v3 呼び出し |
| SEND-02 | 右クリックメニューに「iPhoneに送る」が追加され、`fusen_send_to_iphone` コマンドを呼び出す | `useStickyNoteContextMenu.ts` の line 340-341 を2行変更するだけ |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next-pwa | 5.6.0 (installed) | Workbox PWA + custom worker bundling | プロジェクト採用済み。`worker/index.js` でカスタムロジック注入可能 |
| Web Push API (browser) | ブラウザネイティブ | Push 購読・通知表示 | Service Worker 標準 API |
| Web Crypto API (browser) | ブラウザネイティブ | PKCE code_verifier/challenge 生成 | `crypto.subtle` は iOS Safari 16+ で完全サポート |
| Google Drive REST API v3 | REST | fusen_push_config.json / fusen_note.json の R/W | Phase 4 で Rust 側に実装済み。JS側はシンプルな fetch |
| Google OAuth 2.0 | PKCE flow | access_token 取得 | Phase 4 の Rust PKCE と同一フロー、ブラウザ実装 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Tailwind CSS | 3.x (installed) | Viewer ページのスタイリング | 既存スタックに統一 |
| React 18 (App Router) | 18.x (installed) | `app/viewer/page.tsx` の Client Component | 既存と同一 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| worker/index.js (next-pwa) | 完全カスタム sw.js 手書き | next-pwa の sw.js を上書きすると次の build で消える。worker/index.js は next-pwa が merge する |
| crypto.subtle | jose / oauth4webapi ライブラリ | ライブラリ追加不要、iOS Safari 16+ で完全サポートのため不要 |

**Installation:** 追加 npm パッケージ不要（全て既存スタックで実装可能）

---

## Architecture Patterns

### Recommended Project Structure
```
app/
├── viewer/
│   └── page.tsx          # 新規: iOS セットアップ + 全文表示
worker/
└── index.js              # 新規: push / notificationclick ハンドラ
public/
└── manifest.json         # 変更: start_url + description のみ
app/
├── RegisterPWA.tsx       # 変更: Tauri/Safari 分岐
└── hooks/
    └── useStickyNoteContextMenu.ts  # 変更: ctx_send_to_iphone 有効化
```

### Pattern 1: next-pwa カスタムワーカー（push/notificationclick の衝突回避）

**What:** `worker/index.js` に Service Worker イベントを書くと、next-pwa の Webpack ビルドが sw.js に自動 merge する。sw.js ファイルを直接書き換えると次のビルドで上書きされるため、このパターンが唯一の安全な方法。

**When to use:** next-pwa 5.6.0 使用時にカスタム Service Worker ロジックが必要な場合。

**Example:**
```javascript
// worker/index.js (Source: github.com/shadowwalker/next-pwa custom-worker example)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '俺の付箋', {
      body: data.body || '',
      icon: '/icon-192.png',
      data: { url: '/viewer' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/viewer')
  );
});
```

**注意:** `next.config.mjs` の `pwaConfig` 設定で `disable: process.env.NODE_ENV === 'development'` は既存のまま。開発時は SW 無効なので push テストは Vercel デプロイ環境で行う。

### Pattern 2: RegisterPWA.tsx の Tauri/Safari 分岐

**What:** `typeof window.__TAURI_INTERNALS__ !== 'undefined'` で Tauri 環境を検出し、Safari 環境のみカスタム SW を登録する。

**Example:**
```typescript
// app/RegisterPWA.tsx
"use client";
import { useEffect } from "react";

export default function RegisterPWA() {
  useEffect(() => {
    const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';
    if (!("serviceWorker" in navigator)) return;

    if (isTauri) {
      // Tauri: 全SW登録解除（既存動作を維持）
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) reg.unregister();
      });
    } else {
      // Safari PWA: push 対応 SW を登録（next-pwa が生成した sw.js）
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((err) => console.error('SW register failed:', err));
    }
  }, []);
  return null;
}
```

### Pattern 3: Google OAuth PKCE フロー（フロントエンド）

**What:** `crypto.subtle` を使用して code_verifier を生成し、Google の認可エンドポイントにリダイレクト。コールバック URL でコードを受け取り、トークンエンドポイントと交換。

**When to use:** `/viewer` ページの「Googleでログイン」ボタンクリック時。

**Example:**
```typescript
// app/viewer/page.tsx 内のユーティリティ関数
async function generatePKCE() {
  const verifier = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const encoded = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return { verifier, challenge };
}

function startOAuth(challenge: string) {
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GDRIVE_CLIENT_ID!,
    redirect_uri: window.location.origin + '/viewer',
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
  });
  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}
// Source: MDN Web Docs, Web Crypto API + OAuth 2.1 PKCE spec
```

### Pattern 4: Push 購読 + Drive 保存

**What:** `pushManager.subscribe()` で購読情報取得後、Drive REST API v3 に直接アップロード。

**Example:**
```typescript
async function subscribePush(accessToken: string, vapidPublicKey: string) {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
  const subJson = sub.toJSON();
  // Drive に fusen_push_config.json としてアップロード
  await uploadToDrive(accessToken, 'fusen_push_config.json', {
    endpoint: subJson.endpoint,
    keys: {
      p256dh: subJson.keys?.p256dh,
      auth: subJson.keys?.auth,
    }
  });
}
// Source: Web Push API MDN + Phase 4 の fusen_push_config.json 形式
```

### Anti-Patterns to Avoid
- **sw.js を直接編集する:** next-pwa build で上書きされる。`worker/index.js` に書くこと
- **ページ読み込み時に自動で通知許可を要求する:** iOS は click handler 内からのみ `Notification.requestPermission()` を許可する
- **Tauri ビルドで SW を登録する:** `IS_TAURI_BUILD=true` 時は next-pwa が SW 生成を無効化しているため、JS でも登録しないこと（`RegisterPWA.tsx` の `isTauri` 分岐で確実にスキップ）
- **`clients.openWindow()` の URL に相対パスを使う:** iOS Safari では絶対 URL が必要。`self.location.origin + '/viewer'` 形式にする

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PKCE code_challenge | 独自ハッシュ実装 | `crypto.subtle.digest('SHA-256', ...)` | ブラウザネイティブ、ライブラリ不要 |
| Push 購読 | 独自プロトコル | `pushManager.subscribe()` | Web Push API 標準 |
| SW と Workbox の統合 | sw.js 手書き | `worker/index.js` (next-pwa) | build 毎に上書きされる問題を回避 |
| Drive ファイル検索 + アップロード | Drive SDK | `fetch` + Drive REST v3 | Phase 4 Rust 実装と同一エンドポイント、SDK は不要なオーバーヘッド |

**Key insight:** next-pwa の `worker/index.js` パターンが SW カスタマイズの唯一の安全な方法。sw.js は自動生成ファイルであり直接変更してはならない。

---

## Common Pitfalls

### Pitfall 1: iOS は PWA インストール後でないと push 購読できない
**What goes wrong:** `pushManager.subscribe()` を Safari（通常ブラウザ）から呼ぶと `NotAllowedError` または `undefined` になる
**Why it happens:** iOS の設計上、ホーム画面追加済みの standalone PWA 環境でのみ Push API が有効
**How to avoid:** `window.matchMedia('(display-mode: standalone)').matches` で確認してから Subscribe ボタンを表示する。未インストール時はバナーのみ表示してホーム画面追加を促す
**Warning signs:** `navigator.serviceWorker` や `PushManager` が undefined / subscribe が即エラー

### Pitfall 2: Notification.requestPermission() はクリックハンドラ内からのみ
**What goes wrong:** `useEffect` 内や自動実行で `requestPermission()` を呼ぶと iOS で無視される
**Why it happens:** iOS の user gesture requirement
**How to avoid:** 「通知を許可する」ボタンの `onClick` 内で `await Notification.requestPermission()` を呼ぶ

### Pitfall 3: next-pwa 開発モードでは SW が無効
**What goes wrong:** `NODE_ENV=development` では next.config.mjs の `disable: true` 設定により SW が生成されない。`worker/index.js` のコードも試験できない
**Why it happens:** next-pwa のデフォルト動作
**How to avoid:** Vercel にデプロイして iPhone 実機でテストする。E2E / vitest での単体テストで push ハンドラの中身をモック検証する

### Pitfall 4: VAPID 公開鍵の形式
**What goes wrong:** `pushManager.subscribe()` の `applicationServerKey` に Base64 URL 形式の文字列を渡すとエラー
**Why it happens:** `Uint8Array` が必要
**How to avoid:** `urlBase64ToUint8Array()` ユーティリティ関数を使って変換する（標準的なヘルパー、MDN に掲載）
```typescript
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
```

### Pitfall 5: NEXT_PUBLIC_GDRIVE_CLIENT_ID + NEXT_PUBLIC_VAPID_PUBLIC_KEY の環境変数
**What goes wrong:** フロントエンドから Drive API / VAPID 公開鍵を使う際に環境変数が undefined になる
**Why it happens:** `NEXT_PUBLIC_` プレフィックスがないとブラウザに露出しない
**How to avoid:** `.env.local` / Vercel 環境変数に `NEXT_PUBLIC_GDRIVE_CLIENT_ID` と `NEXT_PUBLIC_VAPID_PUBLIC_KEY` を追加する

### Pitfall 6: notificationclick で clients.openWindow の相対パス
**What goes wrong:** iOS Safari で `clients.openWindow('/viewer')` が動作しないケースがある
**Why it happens:** Service Worker のオリジンと相対パス解決の問題
**How to avoid:** `self.location.origin + '/viewer'` の絶対 URL を使用する

---

## Code Examples

### VAPID 公開鍵の取得（Rust → フロントエンド）

Phase 4 の `fusen_check_pro_setup` は `pro_config` の存在確認のみ。VAPID 公開鍵を viewer に渡すには、`NEXT_PUBLIC_VAPID_PUBLIC_KEY` 環境変数で Vercel に設定する。Rust 側で `vapid_keys.json` から読んだ公開鍵をビルド時に渡す（ビルドスクリプト or 手動設定）。

### Google Drive ファイルアップロード（フロントエンド fetch）

```typescript
// Source: Google Drive REST API v3 公式ドキュメント
async function uploadToDrive(accessToken: string, fileName: string, data: object) {
  // ファイルID検索
  const listRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+trashed=false&spaces=drive`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const list = await listRes.json();
  const fileId = list.files?.[0]?.id;

  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const metadata = { name: fileName, mimeType: 'application/json' };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const method = fileId ? 'PATCH' : 'POST';
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

  await fetch(url, { method, headers: { Authorization: `Bearer ${accessToken}` }, body: form });
}
```

### worker/index.js の全体像

```javascript
// worker/index.js (Source: next-pwa custom-worker example + iOS Web Push仕様)
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || '俺の付箋', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: self.location.origin + '/viewer' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に viewer が開いていれば focus
      for (const client of clientList) {
        if (client.url.includes('/viewer') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(self.location.origin + '/viewer');
    })
  );
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| iOS では Web Push 不可 | iOS 16.4+ でホーム画面追加済み PWA のみサポート | 2023年3月 iOS 16.4 | iPhone PWA への通知が可能に |
| APNs は Safari プッシュのみ | 標準 Web Push API (VAPID) で APNs を呼べる | 2023年 | Phase 4 の Rust 実装がそのまま動作 |

**Deprecated/outdated:**
- Safari Push Certificates（旧 APNs 方式）: 標準 Web Push API (VAPID) に置き換え済み。Phase 4 はすでに正しい実装

---

## Open Questions

1. **VAPID 公開鍵をどう viewer に渡すか**
   - What we know: Rust の `vapid_keys.json` に公開鍵が保存されている。フロントエンドから Tauri invoke は viewer（Safari）から不可
   - What's unclear: Vercel ビルド時に `NEXT_PUBLIC_VAPID_PUBLIC_KEY` を設定する必要があるが、初回生成時の鍵とどう同期するか
   - Recommendation: 初回セットアップ時に Rust でキーペアを生成し、その公開鍵を手動で Vercel 環境変数に設定する運用手順を plan に含める（1ユーザー前提のため自動化不要）

2. **Google OAuth コールバック先 URL**
   - What we know: Vercel のデプロイ URL が必要。`window.location.origin + '/viewer'` で動的取得可能
   - What's unclear: Google Cloud Console の OAuth 2.0 クライアントに redirect_uri として Vercel URL を登録する必要がある
   - Recommendation: plan に「Google Cloud Console で redirect_uri 登録」タスクを含める

3. **access_token の保存・更新**
   - What we know: viewer は 1ページのみで複雑なセッション管理は不要
   - What's unclear: セットアップ完了後に再アクセスした際（通知タップ後）のトークン有効性
   - Recommendation: `sessionStorage` に access_token を保存し、Drive 呼び出し失敗時のみ再 OAuth。セットアップは完了後は Drive 読み込みのみなので refresh_token まで実装しない（初回セットアップ時のみ Drive 書き込みが必要）

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + jsdom |
| Config file | vitest.config.ts |
| Quick run command | `npm run test` |
| Full suite command | `npm run test -- --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-01 | manifest.json に start_url=/viewer, display=standalone が含まれる | smoke (JSON parse) | `npm run test -- app/viewer` | ❌ Wave 0 |
| PWA-02 | worker/index.js が push イベントで showNotification を呼ぶ | unit (SW mock) | `npm run test -- worker` | ❌ Wave 0 |
| PWA-03 | viewer/page.tsx が standalone モードとブラウザモードで正しいUIを返す | unit (jsdom) | `npm run test -- app/viewer` | ❌ Wave 0 |
| SEND-01 | Push 購読情報が Drive 形式（endpoint + keys）で生成される | unit | `npm run test -- app/viewer` | ❌ Wave 0 |
| SEND-02 | ctx_send_to_iphone の action が invoke('fusen_send_to_iphone', ...) を呼ぶ | unit (mock invoke) | `npm run test -- app/hooks` | ❌ Wave 0 |

**注意:** push / notificationclick の E2E テスト（実際の通知）は iOS 実機が必要なため manual-only。vitest でのユニットテストは Service Worker イベントをモックして handler のロジックを検証する。

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test -- --coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `app/viewer/viewer.test.tsx` — PWA-01, PWA-03, SEND-01 をカバー
- [ ] `worker/index.test.js` — PWA-02 をカバー（SW mock 環境が必要）
- [ ] `app/hooks/useStickyNoteContextMenu.test.ts` — SEND-02 をカバー（既存テストパターン参照）

---

## Sources

### Primary (HIGH confidence)
- Apple iOS 16.4 Web Push 公式サポート確認 - [pwa.io iOS 16.4 Web Push](https://pwa.io/articles/web-push-with-ios-safari-16-4-made-easy)
- next-pwa shadowwalker custom-worker example - [github.com/shadowwalker/next-pwa custom-worker](https://github.com/shadowwalker/next-pwa/tree/master/examples/custom-worker)
- iOS WebPush 実装例 - [github.com/andreinwald/webpush-ios-example](https://github.com/andreinwald/webpush-ios-example)
- Phase 4 実装済みコード（gdrive.rs, webpush.rs, lib.rs） — 直接確認

### Secondary (MEDIUM confidence)
- [PWA iOS Limitations 2026 - magicbell.com](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — iOS Safari push 制限の現状確認
- [Web Push 2024 実装ガイド - dr-lex.be](https://www.dr-lex.be/info-stuff/web-push.html) — notificationclick の iOS 挙動確認

### Tertiary (LOW confidence)
- Web Search: next-pwa customWorkerSrc が Next.js 14 で動作するか — コードで直接確認済み（5.6.0インストール済み、worker/index.js パターンは公式 example に存在）→ MEDIUM 以上に格上げ

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 全ライブラリが既存プロジェクトに導入済み、追加 npm インストール不要
- Architecture: HIGH — next-pwa custom-worker パターンは公式 example で確認、iOS Web Push は 2023年以降安定
- Pitfalls: HIGH — iOS Push の制限は複数の公式/コミュニティソースで確認

**Research date:** 2026-03-23
**Valid until:** 2026-06-23（iOS Safari の Web Push 仕様は安定フェーズ、next-pwa 5.x は枯れた実装）
