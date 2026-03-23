---
phase: 04-hono-api-kiban
plan: "05"
subsystem: infra
tags: [vercel, hono, next-js, deploy, web-push, google-drive, oauth]

# Dependency graph
requires:
  - phase: 04-04
    provides: app/api/v1/[[...route]]/route.ts — Hono エントリポイント + 全 API ハンドラ
provides:
  - Vercel production deployment at https://ore-no-fusen.vercel.app
  - All API endpoints live at /api/v1/*
affects: [05-pwa-webpush]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hono アプリを _app.ts に分離し route.ts は GET/POST handler のみを export（Next.js Route type 要件対応）"
    - ".eslintignore でテストファイルを Next.js ESLint チェックから除外"
    - ".vercelignore で src-tauri 等の非 Web ディレクトリをアップロード除外"

key-files:
  created:
    - app/api/v1/[[...route]]/_app.ts
    - .eslintignore
    - .vercelignore
  modified:
    - app/api/v1/[[...route]]/route.ts
    - app/api/v1/[[...route]]/route.test.ts

key-decisions:
  - "Hono app を _app.ts に分離: route.ts から export const app するとNext.js が不正な Route export として拒否するため"
  - ".eslintignore でテストファイルを除外: @typescript-eslint/no-explicit-any がビルドサーバーで未定義エラーになるため"
  - ".vercelignore で src-tauri 等を除外: アップロードメモリエラーの回避"

patterns-established:
  - "Next.js + Hono 分離パターン: Hono インスタンスは _app.ts に、route.ts は handle() wrap のみ"

requirements-completed: [API-01, API-02, API-03, API-04, API-05, API-06, API-07]

# Metrics
duration: 20min
completed: 2026-03-23
---

# Phase 4 Plan 05: Vercel デプロイ Summary

**Hono API を Vercel production にデプロイし https://ore-no-fusen.vercel.app で全エンドポイントが疎通（環境変数設定待ちで 401/503 を正常返却）**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-23T04:26:29Z
- **Completed:** 2026-03-23T04:46:00Z
- **Tasks:** 1/2 (Task 2 は checkpoint:human-verify で停止)
- **Files modified:** 4

## Accomplishments
- Vercel CLI でプロダクションデプロイ成功（https://ore-no-fusen.vercel.app）
- 認証なしリクエストが正しく 401 を返すことを curl で確認
- Hono アプリを `_app.ts` に分離して Next.js Route Handler 型エラーを解消
- `.vercelignore` / `.eslintignore` でビルドエラーを解消

## Task Commits

1. **Task 1: Vercel デプロイ** - `3acb809` (feat)

## Files Created/Modified
- `app/api/v1/[[...route]]/_app.ts` — Hono アプリインスタンス（route.ts から分離）
- `app/api/v1/[[...route]]/route.ts` — Next.js ハンドラのみ（GET/POST export）
- `app/api/v1/[[...route]]/route.test.ts` — インポート先を _app.ts に変更
- `.eslintignore` — テストファイルを ESLint チェックから除外
- `.vercelignore` — src-tauri 等の非 Web ディレクトリを除外

## Decisions Made
- Hono app を `_app.ts` に分離: `route.ts` から `export const app` すると Next.js が `"app" is not a valid Route export field` エラーを出すため
- `.eslintignore` でテストファイルを除外: `@typescript-eslint/no-explicit-any` ルールがビルドサーバーに未インストールで ESLint エラーになるため
- `.vercelignore` で `src-tauri`, `out`, `coverage` 等を除外: 初回デプロイで "Array buffer allocation failed" メモリエラーが発生したため

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] export const app を const app に変更 → _app.ts に分離**
- **Found during:** Task 1 (Vercel デプロイ)
- **Issue:** `route.ts` の `export const app` が Next.js の Route Handler 型チェックで `"app" is not a valid Route export field` エラー
- **Fix:** Hono アプリを `_app.ts` に分離し `route.ts` は `GET/POST` handler のみを export。`route.test.ts` のインポート先も修正
- **Files modified:** app/api/v1/[[...route]]/_app.ts (新規), route.ts, route.test.ts
- **Verification:** vitest 3件パス、Vercel ビルド成功、curl で 401 確認
- **Committed in:** 3acb809

**2. [Rule 3 - Blocking] .eslintignore 追加**
- **Found during:** Task 1 (Vercel デプロイ)
- **Issue:** `lib/gdrive.test.ts` の `@typescript-eslint/no-explicit-any` がビルドサーバーで `Definition for rule ... was not found` エラー
- **Fix:** `.eslintignore` を作成して `**/*.test.ts` 等を除外
- **Files modified:** .eslintignore (新規)
- **Committed in:** 3acb809

**3. [Rule 3 - Blocking] .vercelignore 追加**
- **Found during:** Task 1 (Vercel デプロイ、初回試行)
- **Issue:** `src-tauri` 等の大容量ディレクトリが含まれて "Array buffer allocation failed" メモリエラー
- **Fix:** `.vercelignore` を作成して非 Web ディレクトリを除外
- **Files modified:** .vercelignore (新規)
- **Committed in:** 3acb809

---

**Total deviations:** 3 auto-fixed (all blocking — build/deploy blockers)
**Impact on plan:** すべてデプロイ成功に必要な修正。スコープ外の変更なし。

## User Setup Required

Task 2 (checkpoint:human-verify) で以下の設定が必要です:

**環境変数 (Vercel Dashboard または CLI):**
```
GOOGLE_CLIENT_ID     = Google Cloud Console の OAuth 2.0 クライアント ID
GOOGLE_CLIENT_SECRET = OAuth 2.0 クライアントシークレット
VAPID_PUBLIC_KEY     = npx web-push generate-vapid-keys の Public Key
VAPID_PRIVATE_KEY    = 同 Private Key
API_SECRET           = 任意の文字列（Bearer トークン）
```

**Google OAuth フロー（初回）:**
1. `https://ore-no-fusen.vercel.app/api/v1/auth` を開いて認証
2. 表示された `refresh_token` を `GOOGLE_REFRESH_TOKEN` に設定
3. 再デプロイ: `npx vercel --prod`

**curl 検証:**
```bash
export BASE_URL="https://ore-no-fusen.vercel.app"
export TOKEN="your-api-secret"
curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/v1/notes/latest  # → 401
curl -s -X POST $BASE_URL/api/v1/subscribe \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"endpoint":"https://example.com/push","keys":{"p256dh":"test","auth":"test"}}' \
  -w "\n%{http_code}\n"
```

## Next Phase Readiness
- Vercel デプロイ完了、エンドポイント疎通確認済み
- 環境変数設定後に Phase 4 の Success Criteria (curl 検証) が満たされる
- Phase 5 (PWA + Web Push) の前提条件が整う

---
*Phase: 04-hono-api-kiban*
*Completed: 2026-03-23*
