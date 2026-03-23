# Pitfalls Research

**Domain:** iPhone連携 — Web Push (VAPID/APNs) + Google Drive API + Hono + PWA Service Worker
**Researched:** 2026-03-23
**Confidence:** MEDIUM (training data ~Aug 2025; WebSearch/WebFetch unavailable — verify flagged items against current Apple/Google docs)

---

## Critical Pitfalls

### Pitfall 1: iOS Safari の「PWAインストール必須」制約を後から知る

**What goes wrong:**
Chrome/Android では `Notification.requestPermission()` をブラウザ上で直接呼べる。iOS Safari では**ホーム画面に追加（Add to Home Screen）した PWA の中からしか**プッシュ通知の許可ダイアログを出せない。通常のブラウザセッションで `requestPermission()` を呼ぶと即座に拒否（denied）になる。

**Why it happens:**
Apple の設計方針。iOS 16.4 で Web Push が解放されたが、ブラウザ内 Web サイトからの無制限プッシュ許可申請を防ぐためにこの制限を維持した（HIGH confidence — 複数の公式 WebKit ブログ・Apple Developer Docs に明記）。

**How to avoid:**
- iPhone 側 PWA は `<meta name="apple-mobile-web-app-capable" content="yes">` + `<link rel="manifest">` を必ず設定する
- 通知許可フローは PWA インストール後のオンボーディング画面で行う
- `navigator.standalone` をチェックし、PWA として実行されていない場合は「ホーム画面に追加してください」の案内を表示する

**Warning signs:**
- `Notification.permission` が常に `"denied"` または `"default"` で `requestPermission()` が解決しない
- iPhone Safari のブラウザタブで動作確認しようとしている

**Phase to address:**
Phase 1（Hono API 基盤） — manifest.json と PWA メタタグを最初から正しく設定する。後から追加すると Service Worker の scope 問題が連鎖する。

---

### Pitfall 2: VAPID の `sub` クレームが Apple の要件を満たしていない

**What goes wrong:**
VAPID JWT の `sub` フィールドに `mailto:` URI か有効な URL を設定しないと、APNs 経由での Push が HTTP 400/403 で拒否される。多くのライブラリはデフォルトで `sub` を省略するか空文字にする。Chrome (FCM) は `sub` に甘いが APNs は厳格。

**Why it happens:**
RFC 8292 (VAPID) では `sub` は任意だが、Apple の APNs ゲートウェイは必須として扱う（MEDIUM confidence — Apple Developer Forums と web-push ライブラリの issues から）。

**How to avoid:**
```
VAPID_SUBJECT=mailto:your@email.com
```
`web-push` (Node.js) を使う場合、`webpush.setVapidDetails(subject, publicKey, privateKey)` の `subject` を必ず `mailto:` か `https://` URL にする。

**Warning signs:**
- Chrome/Android では Push が届くのに iPhone だけ届かない
- Hono エンドポイントは 201 を返しているがデバイスに何も来ない
- APNs のエラーレスポンスが `"MissingTopic"` または `"BadMessageId"`

**Phase to address:**
Phase 2（VAPID + APNs Push送信）— VAPID 初期化コードを書く最初の時点で `sub` を設定する。

---

### Pitfall 3: APNs の Push Topic (Bundle ID) 設定ミス

**What goes wrong:**
Web Push for Safari は APNs の `apns-topic` ヘッダーに `<bundle-id>.pushkit.fileprovider` ではなく `<bundle-id>` + `.push.web` サフィックスの形式を使う。古い APNs ライブラリや Curl サンプルをそのまま流用すると `BadTopic` エラーになる。

**Why it happens:**
Safari の Web Push は Native App Push とは異なる APNs トピック命名規則を持つ（HIGH confidence — Apple WWDC 2023 資料・WebKit ブログに明記）。

**How to avoid:**
`web-push` npm ライブラリの最新版（v3.6+）は Safari Web Push の `apns-topic` を自動設定する。独自実装する場合はトピックを `<team-id>.<bundle-id>` 形式で指定し、APNs エンドポイントは production (`api.push.apple.com`) と development (`api.sandbox.push.apple.com`) を使い分ける。

**Warning signs:**
- APNs が `BadTopic` レスポンスを返す
- Push が Sandbox では届くが Production では届かない（エンドポイント混在）

**Phase to address:**
Phase 2（APNs Push 送信）

---

### Pitfall 4: Service Worker の scope が Next.js App Router の `app/` ルーティングと衝突する

**What goes wrong:**
`/service-worker.js` を `public/` に置き、`scope: '/'` で登録すると、Next.js の `app/` ルートへのナビゲーションが Service Worker の fetch ハンドラを通る。静的アセットのキャッシュ戦略を誤ると、Next.js のサーバーコンポーネントへのリクエストがキャッシュ済みの古いレスポンスで返される。

**Why it happens:**
Service Worker は登録スコープ以下の全リクエストを傍受する。Next.js の RSC ペイロード（`?_rsc=...` クエリ）をキャッシュするとデータが腐る。

**How to avoid:**
- Service Worker の fetch ハンドラで `/_next/` と `/api/` はキャッシュせず `return fetch(event.request)` で素通し
- `scope` を Push 通知受信専用なら `/push-sw.js` のようにスコープを狭める
- `workbox-webpack-plugin` は使わず、手書きの最小 SW で通知受信だけ行う

**Warning signs:**
- ページ更新後に古いデータが表示される
- Next.js の `/_next/data/` リクエストがネットワークに出ずキャッシュから返る
- `chrome://serviceworker-internals` でエラーログが出る

**Phase to address:**
Phase 1（PWA Service Worker 基盤構築）

---

### Pitfall 5: Google Drive API の OAuth トークンを環境変数に直書きして Vercel にデプロイする

**What goes wrong:**
`refresh_token` を `.env.local` に書き、Vercel の Environment Variables に設定する。初回は動く。しかし Google は refresh token を失効させることがある（consent 再取得、長期未使用、セキュリティイベント）。失効後は Hono エンドポイントが 401 を返すがアラートがなく、ユーザーは Push が来なくなるまで気づかない。

**Why it happens:**
シングルユーザー前提なのでトークンリフレッシュの仕組みを省略しがち。Google の OAuth 2.0 では `refresh_token` は初回認証時のみ返され、その後の再認証では返されない（`prompt=consent` が必要）。

**How to avoid:**
- `access_token` + `refresh_token` + `expiry_date` を Google Drive ファイルか Vercel KV に保存し、リクエストごとに有効期限を確認してリフレッシュする
- `google-auth-library` の `OAuth2Client` を使えば `refreshIfNeeded()` が自動処理する
- トークンリフレッシュ失敗時は Hono エンドポイントが 503 を返し、Tauri 側でユーザーに再認証を促す

**Warning signs:**
- Google Drive API が突然 `401 Invalid Credentials` を返す
- 数週間後に Push が届かなくなる

**Phase to address:**
Phase 2（Google Drive 連携）— OAuth フローの初回実装時にリフレッシュロジックを含める。

---

### Pitfall 6: Hono を Next.js App Router の `route.ts` に統合する際の Edge Runtime 非互換

**What goes wrong:**
Next.js App Router のデフォルト runtime は Node.js だが、Vercel の Hobby/Pro プランでは Edge Functions の方が起動が速い。Hono は Edge 対応だが、`web-push` ライブラリ（`crypto.subtle` 依存）や `google-auth-library` は Edge Runtime では動かない。途中で runtime を切り替えると import エラーで全体が壊れる。

**Why it happens:**
Edge Runtime は Web Crypto API のみ使用可。Node.js `crypto` モジュールは使えない。`web-push` と `googleapis` は Node.js `crypto` に依存する。

**How to avoid:**
`route.ts` の先頭に `export const runtime = 'nodejs'` を明示して最初から固定する。Edge Runtime に切り替える誘惑に負けない。

**Warning signs:**
- Vercel デプロイ時に `The edge runtime does not support Node.js 'crypto' module` エラー
- ローカルでは動くが Vercel でクラッシュする

**Phase to address:**
Phase 1（Hono API 基盤）— `route.ts` 作成時点で runtime を宣言する。

---

### Pitfall 7: Push Subscription の endpoint URL を保存せずに VAPID 公開鍵だけ保存する

**What goes wrong:**
`PushSubscription` オブジェクトは `endpoint`（APNs/FCM のデバイス固有 URL）・`p256dh`・`auth` の3つで構成される。endpoint だけ、または公開鍵だけ保存すると Push を送れない。再サブスクリプション（Service Worker 更新）で endpoint が変わることもある。

**Why it happens:**
`subscription.toJSON()` を丸ごと保存すれば問題ないが、フィールドを手動でピックするコードでは `endpoint` を忘れがち。

**How to avoid:**
```typescript
// Google Drive に保存する JSON はこの形式
{
  endpoint: subscription.endpoint,
  keys: {
    p256dh: subscription.toJSON().keys?.p256dh,
    auth: subscription.toJSON().keys?.auth,
  }
}
```
Service Worker の `pushsubscriptionchange` イベントをリッスンし、endpoint 変更時に Drive を自動更新する。

**Warning signs:**
- Push API が `410 Gone` を返す（古い endpoint）
- サブスクリプション再登録後に Push が届かない

**Phase to address:**
Phase 2（Google Drive + Push Subscription 保存）

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| `refresh_token` を env に直書きしてリフレッシュなし | 実装が速い | 数週間後にサイレント障害 | never |
| Service Worker で全リクエストをキャッシュ | オフライン動作 | Next.js RSC が腐る | never |
| VAPID 鍵ペアをハードコード（rotation なし） | 設定不要 | 鍵漏洩時に全購読が無効化 | MVP 期間中は許容（シングルユーザー） |
| Google Drive のファイル一覧を毎回全取得 | 実装が単純 | ファイル数増加で遅くなる | ファイル数 < 1000 なら許容 |
| `web-push` のエラーを catch して無視 | 実装が速い | 配信失敗がサイレントになる | never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| APNs (Safari Web Push) | `web-push` の古いバージョン（v3.4 以下）を使う | v3.6+ を使う。Safari Web Push 対応が v3.5 以降で追加 |
| Google Drive API | `drive.files.list` の `fields` パラメータを省略する | `fields: 'files(id,name,modifiedTime)'` で必要なフィールドだけ指定。省略すると余分なデータで遅くなる |
| Hono + Next.js | `app/api/[...route]/route.ts` ではなく `pages/api/` に置く | App Router の場合は `app/api/hono/[...path]/route.ts` パターンを使う |
| Google OAuth | `access_type: 'offline'` を指定しない | `access_type: 'offline'` + `prompt: 'consent'` で refresh_token を確実に取得 |
| VAPID | 公開鍵を Base64URL でなく Base64 として扱う | `urlBase64ToUint8Array()` ヘルパーで変換してから `subscribe()` に渡す |
| iOS PWA | `manifest.json` の `display: 'standalone'` を忘れる | `display: 'standalone'` がないと Add to Home Screen しても通知許可が出ない |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Push 送信のたびに Google Drive からサブスクリプションを読む | 右クリック→送信が 3〜5 秒かかる | サブスクリプション JSON を Tauri の AppState にキャッシュ（初回同期時に取得） | Drive API のレート制限（100 req/100s）に引っかかると更に悪化 |
| VAPID 鍵ペアを毎リクエスト生成 | CPU spike + 遅延 | サーバー起動時に一度生成して環境変数に保存 | 即時（毎回） |
| Service Worker が Push で大量の Drive API を呼ぶ | 通知が遅延、バッテリー消費 | Push ペイロードにノート本文を含める（4KB 以内） | iOS の Background Fetch 制限あり |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| VAPID 秘密鍵を `NEXT_PUBLIC_` プレフィックスの env に設定 | 秘密鍵がブラウザに露出 | `VAPID_PRIVATE_KEY`（プレフィックスなし）にする |
| Google Drive の service account JSON をリポジトリにコミット | 認証情報漏洩 | `.gitignore` に追加 + Vercel Environment Variables に JSON をエスケープして設定 |
| Push ペイロードを暗号化せずに送信 | ネットワーク上でノート内容が平文 | `web-push` は AES-128-GCM で自動暗号化する — ライブラリを使えば自動対処 |
| Hono エンドポイントを認証なしで公開 | 誰でも Push を送れる | Tauri からのリクエストに HMAC 署名ヘッダーを付け、Hono 側で検証する |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| 通知許可ダイアログをアプリ起動直後に出す | iOS は初回表示で拒否されると永久に blocked | オンボーディング画面で理由を説明してから `requestPermission()` を呼ぶ |
| Push が届いてもタップ先が Safari のブラウザタブで開く | PWA が起動せず UX が悪い | Service Worker の `notificationclick` で `clients.openWindow('/')` + `focus()` を実装 |
| 通知テキストが長すぎる | iOS のロック画面で切り捨てられる | `title` は 50 文字以内、`body` は 100 文字以内に収める |
| 「iPhoneに送る」操作後に成功・失敗のフィードバックがない | ユーザーが送信できたか不明 | Tauri 側で Hono からの HTTP ステータスを受け取りトースト表示 |

---

## "Looks Done But Isn't" Checklist

- [ ] **PWA インストール:** `manifest.json` に `display: 'standalone'`・`start_url`・`icons`（192px + 512px）が設定されているか確認
- [ ] **Service Worker 登録:** HTTPS 環境（または localhost）でのみ登録される条件分岐があるか確認
- [ ] **Push Subscription 保存:** `endpoint` + `p256dh` + `auth` の3フィールドすべてが Google Drive に保存されているか確認
- [ ] **VAPID subject:** `mailto:` または `https://` で始まる `sub` クレームが設定されているか確認
- [ ] **OAuth refresh_token:** `access_type: 'offline'` + `prompt: 'consent'` で取得し、リフレッシュロジックがあるか確認
- [ ] **iOS PWA 確認:** 実機 iPhone でホーム画面から起動し通知許可ダイアログが出るか確認（シミュレーター不可）
- [ ] **Hono runtime:** `export const runtime = 'nodejs'` が `route.ts` に宣言されているか確認
- [ ] **Push ペイロードサイズ:** 4096 バイト以内か確認（APNs の上限）
- [ ] **`pushsubscriptionchange`:** Service Worker が endpoint 変更を検知して再保存するか確認

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| VAPID sub 未設定で APNs 拒否 | LOW | 環境変数に `VAPID_SUBJECT=mailto:...` 追加、再デプロイ。既存サブスクリプションは有効なまま |
| OAuth refresh_token 失効 | MEDIUM | `prompt=consent` で再認証 URL を生成、手動でブラウザアクセス、新 token を env に更新、再デプロイ |
| Service Worker が Next.js RSC をキャッシュして壊れた | MEDIUM | SW を unregister → `caches.delete()` → ページリロード。その後 SW の fetch ハンドラを修正して再デプロイ |
| 全 Push Subscription の endpoint が失効 | MEDIUM | iPhone 側で PWA を再インストール（ホーム画面から削除→追加）して再サブスクリプション |
| Hono が Edge Runtime エラーで Vercel クラッシュ | LOW | `route.ts` に `export const runtime = 'nodejs'` を追加して再デプロイ |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| PWAインストール必須制約 | Phase 1: PWA/Service Worker 基盤 | 実機 iPhone でホーム画面追加後に `Notification.requestPermission()` が出ることを確認 |
| VAPID sub クレーム未設定 | Phase 2: VAPID + APNs 送信 | `web-push` の `setVapidDetails()` 呼び出しに `mailto:` subject があることを確認 |
| APNs Push Topic 設定ミス | Phase 2: VAPID + APNs 送信 | `web-push` v3.6+ を使用、APNs の 200 レスポンスを確認 |
| Service Worker が Next.js を壊す | Phase 1: Service Worker 基盤 | `/_next/` パスを SW のキャッシュから除外するテストを書く |
| OAuth refresh_token 管理ミス | Phase 2: Google Drive 連携 | `refreshIfNeeded()` を呼ぶコードと失敗時の 503 レスポンスの存在確認 |
| Hono + Edge Runtime 非互換 | Phase 1: Hono API 基盤 | `route.ts` に `runtime = 'nodejs'` の存在確認 |
| Push Subscription 不完全保存 | Phase 2: Google Drive + Subscription 保存 | Drive に保存された JSON に3フィールドが揃っているか確認 |

---

## Sources

- Apple WebKit Blog: "Web Push for Web Apps on iOS and iPadOS" — https://webkit.org/blog/13878/ (WebFetch 不可のため未確認、知識ベースからの HIGH confidence 情報)
- RFC 8292 — Voluntary Application Server Identification (VAPID): https://datatracker.ietf.org/doc/html/rfc8292
- `web-push` npm library changelog (training data から MEDIUM confidence)
- Google Identity OAuth 2.0 docs — `access_type: 'offline'` (HIGH confidence — well-documented)
- Next.js App Router Edge Runtime documentation (HIGH confidence)
- Hono Vercel deployment docs (MEDIUM confidence — verify current version compatibility)
- APNs HTTP/2 provider API docs — payload limits 4096 bytes (HIGH confidence)

**注意:** WebSearch / WebFetch が利用不可のため、すべての情報はトレーニングデータ（〜2025年8月）に基づく。iOS 17 / iOS 18 での Web Push の変更点、最新の `web-push` バージョン互換性については、Phase 1 開始前に公式ドキュメントで検証することを強く推奨する。

---

*Pitfalls research for: iPhone連携 (VAPID/APNs + Google Drive + Hono + PWA Service Worker)*
*Researched: 2026-03-23*
