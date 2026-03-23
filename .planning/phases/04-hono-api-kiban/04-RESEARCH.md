# Phase 4: Hono API基盤 - Research

**Researched:** 2026-03-23
**Domain:** Hono + Next.js App Router + Google Drive API + Web Push (VAPID)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Push通知方式**: APNsは使用しない。Web Push（VAPID）で統一。iOS 16.4以降のSafari Web Pushのみ対応
- APNs関連コード・ライブラリ・証明書は一切実装しない
- `web-push` ライブラリでVAPID署名を行い、ブラウザのプッシュサービス経由で送信する
- **APIエンドポイント保護**: 全エンドポイントをBearer認証で保護。ヘッダー形式: `Authorization: Bearer {API_SECRET}`
- `API_SECRET` はVercel環境変数で管理。PWA側・Rust側ともに同じトークンを使用
- **Google OAuth認証フロー**: `/api/v1/auth` エンドポイントで認証フロー実装。初回のみブラウザでGoogle認証→refresh_token取得。失効時は503を返す
- **Google Driveファイル配置**:
  - フォルダ名: `ore-no-fusen`（マイドライブ直下）
  - `ore-no-fusen/fusen_push_config.json` — Push Subscription（endpoint + p256dh + auth）
  - `ore-no-fusen/fusen_note.json` — 最後に送信した付箋1件（上書き保存）
- **fusen_note.json**: 最新1件のみ上書き保存（履歴なし）
- **Hono配置**: `app/api/v1/[[...route]]/route.ts`（既存 `app/api/` との衝突なし）
- `nodejs` runtime 宣言必須（googleapis はEdge Runtime非対応）
- **Vercel環境変数**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `API_SECRET`

### Claude's Discretion
- Hono のミドルウェア構成（認証チェックの実装方法）
- Google Drive APIのファイルUPDATE vs CREATE処理の詳細
- エラーレスポンスのJSON body形式
- `lib/gdrive.ts` と `lib/webpush.ts` のインターフェース設計

### Deferred Ideas (OUT OF SCOPE)
- Android Chrome での Web Push 対応（v3.0以降）
- 複数デバイスへの同時送信（v3.0以降）
- 既存 `app/api/*.ts` の Hono 移植（v3.0以降）
- 付箋の送信履歴管理（複数件保存）
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| API-01 | Hono ルーターが `app/api/v1/[[...route]]/route.ts` に設置され `nodejs` runtime が宣言されている | Hono + Next.js App Router セットアップパターンで対応 |
| API-02 | Google Drive OAuth2 認証が動作する（OAuth2Client + refresh_token 管理 + 失効時 503 レスポンス） | googleapis OAuth2Client パターン + invalid_grant エラーハンドリングで対応 |
| API-03 | Google Drive の JSON 読み書きが動作する（`fusen_push_config.json` / `fusen_note.json`） | files.list + files.update/create upsert パターンで対応 |
| API-04 | VAPID 鍵ペアが生成・設定される（`lib/webpush.ts`、`sub` クレームに `mailto:` を設定） | web-push npm setVapidDetails API で対応 |
| API-05 | `POST /api/v1/subscribe` が Push Subscription を Google Drive に保存する | lib/gdrive.ts upsert + Hono ルートで対応 |
| API-06 | `POST /api/v1/notes/push` が Google Drive への書込と Web Push 送信を行う | lib/gdrive.ts upsert + lib/webpush.ts sendNotification で対応 |
| API-07 | `GET /api/v1/notes/latest` が最後に送信した note JSON を返す | files.get ダウンロード + JSON parse で対応 |
</phase_requirements>

## Summary

Phase 4 は Hono を Next.js 14 の App Router に統合し、Google Drive をデータストア、`web-push` を送信エンジンとする Push 通知 API を構築するフェーズ。既存の next.config.mjs が `output: 'export'` を Tauri ビルド時のみ有効にする設計のため、Vercel デプロイ時は API Routes が自動的に有効になる。

Google Drive API は `googleapis` npm パッケージ（Node.js 依存）で操作する。`googleapis` は Edge Runtime 非対応のため、`export const runtime = 'nodejs'` 宣言が必須。Hono の `handle()` は `hono/vercel` からインポートし、named exports（`export const GET = handle(app)`）でNext.jsに接続する。bearer auth は `hono/bearer-auth` の組み込みミドルウェアで実装する。

Web Push は `web-push` npm パッケージを使用。`setVapidDetails` で mailto subject + 鍵ペアを設定し、`sendNotification` で Push Subscription に対して送信する。iOS 16.4 以降の Safari PWA は標準 Web Push API（VAPID）に対応しているため、APNs は不要。

**Primary recommendation:** `hono` + `hono/vercel` + `googleapis` + `web-push` の 4 パッケージを追加。Hono アプリは basePath `/api` で構成し、`/v1/*` 配下に認証ミドルウェアを適用する。

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.x | API ルーター | Next.js App Router に統合可能。`hono/vercel` アダプターが公式サポート |
| googleapis | ^144.x | Google Drive / OAuth2 | Google 公式 Node.js クライアント。OAuth2Client で refresh_token 自動更新 |
| web-push | ^3.6.x | VAPID + Web Push 送信 | 標準的な Node.js Web Push ライブラリ。iOS Safari PWA 対応 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/web-push | ^3.6.x | web-push TypeScript 型定義 | web-push はビルトイン型がないため devDependencies に追加 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| googleapis | @googleapis/drive (軽量版) | @googleapis/drive は Drive のみで軽いが、OAuth2Client が google-auth-library から別インポートになる。googleapis 一本で統一が簡単 |
| web-push | 手動 fetch + JWT | web-push が暗号化・VAPID 署名・TTL を全て処理。手動実装は大量のエッジケース |

**Installation:**
```bash
npm install hono googleapis web-push
npm install --save-dev @types/web-push
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── api/
│   ├── v1/
│   │   └── [[...route]]/
│   │       └── route.ts      # Hono エントリポイント（API-01）
│   ├── notes.ts              # 既存 Tauri invoke wrapper（変更なし）
│   ├── tags.ts               # 既存（変更なし）
│   └── window.ts             # 既存（変更なし）
lib/
├── gdrive.ts                 # Google Drive 操作（API-02, API-03）
└── webpush.ts                # VAPID / Web Push 送信（API-04, API-06）
```

### Pattern 1: Hono in Next.js App Router（API-01）
**What:** `hono/vercel` の `handle()` で Hono アプリを Next.js Route Handler に接続する
**When to use:** Vercel + Node.js runtime で Hono を使う場合

```typescript
// app/api/v1/[[...route]]/route.ts
// Source: https://hono.dev/docs/getting-started/nextjs
import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { bearerAuth } from 'hono/bearer-auth'

export const runtime = 'nodejs'

const app = new Hono().basePath('/api/v1')

// 全エンドポイントに Bearer 認証を適用
app.use('/*', (c, next) => {
  const token = process.env.API_SECRET!
  return bearerAuth({ token })(c, next)
})

app.post('/subscribe', ...)
app.post('/notes/push', ...)
app.get('/notes/latest', ...)

export const GET = handle(app)
export const POST = handle(app)
```

**重要:** `import { handle } from 'hono/vercel'` を使うこと。`@hono/node-server/vercel` ではない（TypeError の原因になる）。

### Pattern 2: Google OAuth2 + Drive 操作（API-02, API-03）
**What:** OAuth2Client に refresh_token を設定し、Drive API で JSON をアップサート
**When to use:** サーバーサイドのみで Google Drive にアクセスする場合

```typescript
// lib/gdrive.ts
// Source: https://googleapis.dev/nodejs/googleapis/latest/oauth2/index.html
import { google } from 'googleapis'

function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('OAUTH_NOT_CONFIGURED')
  }
  const auth = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return auth
}

// refresh_token 失効検知：invalid_grant を 503 に変換
async function withDriveAuth<T>(fn: (drive: any) => Promise<T>): Promise<T> {
  try {
    const auth = getOAuth2Client()
    const drive = google.drive({ version: 'v3', auth })
    return await fn(drive)
  } catch (err: any) {
    // googleapis は invalid_grant / invalid_token を GaxiosError でスロー
    if (err?.response?.data?.error === 'invalid_grant' ||
        err?.message?.includes('invalid_grant')) {
      throw new Error('OAUTH_REFRESH_TOKEN_EXPIRED')
    }
    throw err
  }
}
```

**invalid_grant 検知:** googleapis の OAuth2Client は refresh_token 失効時に `GaxiosError` をスローし、`err.response.data.error === 'invalid_grant'` で検知できる。ルート側でこのエラーを 503 に変換する。

### Pattern 3: Google Drive ファイル upsert（API-03）
**What:** ファイル名で検索し、存在すれば update、なければ create
**When to use:** `fusen_push_config.json` / `fusen_note.json` の上書き保存

```typescript
// Source: https://gist.github.com/gengue/8082b04b34a5bfcc128a171b7a12b62e
// Source: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
async function upsertJsonFile(
  drive: any,
  folderId: string,
  filename: string,
  data: object
): Promise<void> {
  const json = JSON.stringify(data)
  const media = { mimeType: 'application/json', body: json }

  // 既存ファイル検索
  const list = await drive.files.list({
    q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  const existing = list.data.files?.[0]

  if (existing?.id) {
    await drive.files.update({ fileId: existing.id, media })
  } else {
    await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media,
    })
  }
}
```

### Pattern 4: Web Push 送信（API-04, API-06）
**What:** `web-push` ライブラリで VAPID 署名し Push Subscription に送信
**When to use:** `POST /api/v1/notes/push` で iPhone にプッシュを送る

```typescript
// lib/webpush.ts
// Source: https://github.com/web-push-libs/web-push/blob/master/README.md
import webpush from 'web-push'

export function initVapid() {
  webpush.setVapidDetails(
    'mailto:your@email.com',   // API-04: mailto: が必須
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
}

export async function sendPushNotification(
  subscription: { endpoint: string; p256dh: string; auth: string },
  payload: { title: string; body: string }
): Promise<void> {
  initVapid()
  await webpush.sendNotification(
    {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    },
    JSON.stringify(payload)
  )
}
```

**注意:** iOS Safari PWA の Push Subscription は keys に `p256dh` と `auth` を含む。`web-push` の `sendNotification` 第1引数は `{ endpoint, keys: { p256dh, auth } }` の形式。

### Pattern 5: Google Drive フォルダ取得/作成
**What:** `ore-no-fusen` フォルダをマイドライブ直下に確保する

```typescript
async function ensureFolder(drive: any, folderName: string): Promise<string> {
  const list = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  })
  if (list.data.files?.[0]?.id) return list.data.files[0].id

  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  })
  return created.data.id!
}
```

### Pattern 6: fusen_note.json 読み取り（API-07）

```typescript
// GET /api/v1/notes/latest
async function readJsonFile(drive: any, fileId: string): Promise<object> {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'text' }
  )
  return JSON.parse(res.data as string)
}
```

### Anti-Patterns to Avoid
- **`import { handle } from '@hono/node-server/vercel'`**: `hono/vercel` が正しいインポート。node-server 版は `TypeError: outgoing.on is not a function` を引発する
- **Edge Runtime で googleapis を使う**: googleapis は Node.js 依存。`export const runtime = 'nodejs'` を省略すると Vercel の Edge Runtime でクラッシュする
- **`basePath` なしで Hono を構成する**: `new Hono().basePath('/api/v1')` が必要。ないと Next.js のルーティングとミスマッチが起きる
- **`files.list` の `q` パラメータで特殊文字をエスケープしない**: ファイル名にアポストロフィが含まれる場合、`\\'` でエスケープが必要（今回のファイル名に該当なし）
- **Push Subscription を `{ endpoint, p256dh, auth }` のフラット構造で保存して `{ endpoint, keys: { p256dh, auth } }` で読むことを忘れる**: 保存時と web-push API の形式が異なる

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| VAPID 署名・暗号化 | 独自の WebCrypto 実装 | `web-push` | RFC 8292 + RFC 8188 の暗号化が複雑。ecdh_es + AES-GCM の実装は数百行 |
| Bearer Token 検証 | `Authorization` ヘッダー手動パース | `hono/bearer-auth` | timing attack 対策・400/401 レスポンスの正確な仕様対応が必要 |
| Google OAuth2 refresh | 手動 fetch to token endpoint | `google-auth-library` (googleapis 内蔵) | token 期限管理・自動 refresh・エラー分類が複雑 |
| Google Drive ファイル検索 | Drive URL を直接組み立て | `googleapis` drive.files.list | Drive API のページネーション・フィールドマスク・スコープ管理が必要 |

**Key insight:** Web Push の暗号化（Encrypted Content-Encoding）は最も実装コストが高い領域。`web-push` を使えば VAPID + ECE がブラックボックス化される。

## Common Pitfalls

### Pitfall 1: `hono/vercel` vs `@hono/node-server/vercel` の混同
**What goes wrong:** `TypeError: outgoing.on is not a function` でルートが動かない
**Why it happens:** Node.js runtime の Next.js は Response オブジェクトが Web API 準拠。`@hono/node-server` は Node.js の http.ServerResponse を期待するため不整合が起きる
**How to avoid:** 常に `import { handle } from 'hono/vercel'` を使う
**Warning signs:** build は通るが runtime で TypeError / 500 になる

### Pitfall 2: refresh_token 失効のサイレント障害
**What goes wrong:** googleapis が `invalid_grant` をスローするが catch されず、空レスポンスや 500 が返る
**Why it happens:** googleapis はトークン失効を例外でスローするが、デフォルトのエラーハンドラがない
**How to avoid:** `withDriveAuth` ラッパーで `invalid_grant` を検知し、明示的に 503 を返す
**Warning signs:** Google Drive 操作が "unexpected error" として落ちる

### Pitfall 3: Google Drive API スコープ不足
**What goes wrong:** `files.list` や `files.create` が 403 Forbidden
**Why it happens:** OAuth2 認証時のスコープが `https://www.googleapis.com/auth/drive.file` のみだと、アプリが作成していないファイルにアクセスできない
**How to avoid:** スコープは `https://www.googleapis.com/auth/drive.file` を使う（アプリが作成したファイルのみ）。初回認証フロー時に正しいスコープを指定する
**Warning signs:** ファイル作成は成功するが、別セッションで files.list に返ってこない

### Pitfall 4: web-push の Push Subscription 形式不一致
**What goes wrong:** `sendNotification` が "invalid endpoint" や暗号化エラーを投げる
**Why it happens:** ブラウザから受け取った `PushSubscription.toJSON()` の形式（`{ endpoint, expirationTime, keys: { p256dh, auth } }`）と、Google Drive に保存する形式（`{ endpoint, p256dh, auth }`）と、`web-push` に渡す形式（`{ endpoint, keys: { p256dh, auth } }`）が全て異なる
**How to avoid:** 保存時は `{ endpoint, p256dh, auth }` のフラット構造に正規化。`sendNotification` 呼び出し時に `{ endpoint, keys: { p256dh, auth } }` に変換する
**Warning signs:** 送信リクエスト自体は 201 を返すが iPhone に通知が届かない

### Pitfall 5: Google Drive で同名ファイルが重複作成される
**What goes wrong:** `files.list` で見つからず、毎回 `files.create` が走り重複する
**Why it happens:** `trashed=false` 条件の欠落、または `spaces: 'drive'` 未指定でマイドライブ外を検索している
**How to avoid:** upsert クエリに必ず `and trashed=false` と `spaces: 'drive'` を含める

### Pitfall 6: VAPID の `sub` クレームが `mailto:` でない
**What goes wrong:** Firefox/Chrome の Push サービスが 400 Bad Request を返す
**Why it happens:** VAPID 仕様で `sub` は `mailto:email` または `https://url` でなければならない
**How to avoid:** `setVapidDetails('mailto:xxx@xxx.com', ...)` の形式で必ず mailto: プレフィックスを使う（API-04 要件に明記）

## Code Examples

Verified patterns from official sources:

### Hono App Router 統合（最小構成）
```typescript
// app/api/v1/[[...route]]/route.ts
// Source: https://hono.dev/docs/getting-started/nextjs
import { Hono } from 'hono'
import { handle } from 'hono/vercel'  // ← hono/vercel が正しい
import { bearerAuth } from 'hono/bearer-auth'

export const runtime = 'nodejs'

const app = new Hono().basePath('/api/v1')

app.use('/*', (c, next) => {
  const token = process.env.API_SECRET!
  return bearerAuth({ token })(c, next)
})

export const GET = handle(app)
export const POST = handle(app)
```

### web-push VAPID キー生成（初回セットアップ）
```bash
# Source: https://github.com/web-push-libs/web-push#usage
npx web-push generate-vapid-keys
# 出力:
# Public Key: BExamp...
# Private Key: abc123...
```

### エラーレスポンス形式（Claude's Discretion：推奨）
```typescript
// 統一エラーレスポンス形式
// { error: string, code: string }
c.json({ error: 'OAuth refresh token expired. Re-authenticate required.', code: 'OAUTH_EXPIRED' }, 503)
c.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, 401)
c.json({ error: 'Bad Request', code: 'INVALID_BODY' }, 400)
```

### lib/gdrive.ts インターフェース（Claude's Discretion：推奨）
```typescript
// 推奨インターフェース
export async function savePushSubscription(sub: { endpoint: string; p256dh: string; auth: string }): Promise<void>
export async function saveNote(note: object): Promise<void>
export async function getLatestNote(): Promise<object | null>
```

### lib/webpush.ts インターフェース（Claude's Discretion：推奨）
```typescript
// 推奨インターフェース
export async function sendNoteToIphone(note: { title: string; body: string }): Promise<void>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| APNs Provider API（ネイティブ） | Web Push API + VAPID（PWA） | iOS 16.4 (2023) | APNs 証明書・プロビジョニング不要。通常の Web Push で iOS に送れる |
| Edge Runtime デフォルト（Vercel） | `export const runtime = 'nodejs'` 明示 | Next.js 13 App Router | googleapis など Node.js 依存ライブラリに必須 |
| `hono/node-server` アダプター | `hono/vercel` アダプター | Hono v4 | Next.js App Router との互換性問題を回避 |

**Deprecated/outdated:**
- Apple Push Notification service (APNs) 経由の PWA 通知: PWA では使用不可。ネイティブアプリのみ
- `next.config.js` の `experimental.serverComponentsExternalPackages`: Next.js 14.2 以降は `serverExternalPackages` に移動

## Open Questions

1. **Google Drive API スコープの選択**
   - What we know: `drive.file`（アプリ作成ファイルのみ）vs `drive`（全ファイル）の 2 択
   - What's unclear: `ore-no-fusen` フォルダがアプリ作成と見なされるか（初回認証で作成すれば `drive.file` で十分）
   - Recommendation: `drive.file` スコープで開始し、403 が発生したら `drive` に格上げ

2. **web-push が 410 Gone を返した場合の処理**
   - What we know: Push サービスが 410 を返すと Subscription が無効化されている
   - What's unclear: `fusen_push_config.json` を削除すべきか、Phase 4 スコープかどうか
   - Recommendation: 410 を検知したら `fusen_push_config.json` を削除してエラーレスポンスに `code: 'SUBSCRIPTION_EXPIRED'` を含める（Phase 4 でシンプルに処理）

3. **Google Drive files.get での JSON 取得方式**
   - What we know: `alt: 'media'` + `responseType: 'text'` か `responseType: 'stream'` の 2 通り
   - What's unclear: googleapis v144 での正確な型
   - Recommendation: `responseType: 'text'` で取得後 `JSON.parse()` するのが最も簡単

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v4.x |
| Config file | `vitest.config.ts`（既存）|
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

**Note:** `vitest.config.ts` の `include` に `'lib/**/*.test.ts'` が含まれているため、`lib/gdrive.ts` と `lib/webpush.ts` のテストはすぐに配置できる。

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | Hono ルートが `/api/v1/subscribe` に 401 を返す（Bearer なし） | unit | `npm run test -- lib/api.test.ts` | ❌ Wave 0 |
| API-02 | GOOGLE_REFRESH_TOKEN 未設定時に OAUTH_NOT_CONFIGURED エラー | unit | `npm run test -- lib/gdrive.test.ts` | ❌ Wave 0 |
| API-02 | invalid_grant エラーを OAUTH_REFRESH_TOKEN_EXPIRED に変換 | unit | `npm run test -- lib/gdrive.test.ts` | ❌ Wave 0 |
| API-03 | upsertJsonFile が files.list + files.update を呼ぶ | unit (mock) | `npm run test -- lib/gdrive.test.ts` | ❌ Wave 0 |
| API-04 | VAPID_PUBLIC_KEY 未設定時に initVapid がエラー | unit | `npm run test -- lib/webpush.test.ts` | ❌ Wave 0 |
| API-05 | POST /subscribe が 200 と { ok: true } を返す | unit (mock Drive) | `npm run test -- lib/gdrive.test.ts` | ❌ Wave 0 |
| API-06 | POST /notes/push が Drive 書込 + sendNotification を呼ぶ | unit (mock) | `npm run test -- lib/webpush.test.ts` | ❌ Wave 0 |
| API-07 | GET /notes/latest が保存した JSON を返す | unit (mock) | `npm run test -- lib/gdrive.test.ts` | ❌ Wave 0 |

**Manual-only テスト（自動化不可）:**
- curl による実 Vercel エンドポイント検証（Success Criteria 1〜4）: 実 Google Drive + 実 Push サービスへのアクセスが必要
- OAuth 認証フロー（ブラウザ操作が必要）

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test`
- **Phase gate:** `npm run test` green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `lib/gdrive.test.ts` — covers API-02, API-03, API-05, API-07
- [ ] `lib/webpush.test.ts` — covers API-04, API-06
- [ ] `app/api/v1/[[...route]]/route.test.ts` — covers API-01（Bearer auth）
- Framework install: 不要（Vitest v4.x 既にインストール済み）

## Sources

### Primary (HIGH confidence)
- https://hono.dev/docs/getting-started/nextjs — Hono + Next.js App Router セットアップ
- https://hono.dev/docs/middleware/builtin/bearer-auth — bearer-auth ミドルウェア API
- https://github.com/web-push-libs/web-push — web-push npm API（setVapidDetails, sendNotification）
- https://googleapis.dev/nodejs/googleapis/latest/oauth2/index.html — OAuth2Client API

### Secondary (MEDIUM confidence)
- https://gist.github.com/gengue/8082b04b34a5bfcc128a171b7a12b62e — Google Drive upsert パターン（複数ソースで確認）
- https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list — files.list クエリ構文
- https://pwa.io/articles/web-push-with-ios-safari-16-4-made-easy — iOS 16.4 Web Push 要件

### Tertiary (LOW confidence)
- `responseType: 'text'` での googleapis files.get — TypeScript 型の正確な確認が必要

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Hono/Next.js 統合は公式ドキュメントで確認。googleapis + web-push は長期安定 API
- Architecture: HIGH — upsert パターン・bearer auth・OAuth2 エラーハンドリングは複数ソースで確認
- Pitfalls: HIGH — `hono/vercel` vs `@hono/node-server/vercel` の問題は GitHub Issues で実例確認

**Research date:** 2026-03-23
**Valid until:** 2026-06-23（安定スタック、90日）
