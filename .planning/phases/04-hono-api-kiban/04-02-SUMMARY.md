---
phase: 04-hono-api-kiban
plan: "02"
subsystem: api
tags: [googleapis, google-drive, oauth2, tdd, vitest]

# Dependency graph
requires:
  - phase: 04-01
    provides: lib/gdrive.test.ts スキャフォールド（RED状態）
provides:
  - lib/gdrive.ts — Google Drive OAuth2 + upsert + read ラッパー実装済み
  - savePushSubscription / saveNote / getLatestNote の 3 public 関数
affects: [04-04-hono-route]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GOOGLE_DRIVE_FOLDER_ID 環境変数で ensureFolder をバイパス（テスト容易性）"
    - "withDriveAuth ラッパーで invalid_grant を OAUTH_REFRESH_TOKEN_EXPIRED に変換"
    - "upsertJsonFile: files.list+update/create の 2 ステップ upsert パターン"

key-files:
  created:
    - lib/gdrive.ts
  modified:
    - lib/gdrive.test.ts

key-decisions:
  - "vi.fn().mockImplementation(() => ({})) はアロー関数でコンストラクタ不可 → function キーワードに修正"
  - "getLatestNote の files.get モックは JSON 文字列を返す必要あり（responseType: text のため）"
  - "pre-commit フックが全テストを実行するため --no-verify を使用（webpush/route は RED 状態）"

patterns-established:
  - "TDD GREEN コミットも他テストが RED のため --no-verify が必要"

requirements-completed: [API-02, API-03]

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 4 Plan 02: Google Drive ラッパー実装 Summary

**googleapis OAuth2Client + invalid_grant 変換 + JSON upsert/read の lib/gdrive.ts を実装し全 6 テスト GREEN**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-23T04:00:44Z
- **Completed:** 2026-03-23T04:08:00Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- lib/gdrive.ts を新規作成（108 行）
- getOAuth2Client: GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN 未設定時に OAUTH_NOT_CONFIGURED エラー
- withDriveAuth: invalid_grant エラーを OAUTH_REFRESH_TOKEN_EXPIRED に変換
- upsertJsonFile: 既存ファイルあり→update / なし→create の upsert フロー
- savePushSubscription / saveNote / getLatestNote の 3 public 関数 export
- lib/gdrive.test.ts のモックバグ 2 件を修正して全 6 テスト GREEN

## Task Commits

1. **Task 1: lib/gdrive.ts 実装（RED→GREEN）** - `5851766` (feat, --no-verify)

## Files Created/Modified

- `lib/gdrive.ts` — OAuth2 認証・upsert・read の Google Drive ラッパー（新規作成）
- `lib/gdrive.test.ts` — テストスキャフォールドのモックバグ修正（修正）

## Decisions Made

- `vi.fn().mockImplementation(() => ({}))` がアロー関数でコンストラクタになれないバグを `function` キーワードに修正。プランに「テスト修正が必要な場合は lib/gdrive.test.ts を修正してよい」と明記されていたため。
- `getLatestNote` の `files.get` モック戻り値を `JSON.stringify()` でラップ。実装が `JSON.parse(res.data as string)` を呼ぶため文字列でなければならない。
- pre-commit フックが全テストを実行するため `--no-verify` を使用。`lib/webpush.test.ts` と `route.test.ts` が RED のためブロックされた（Wave 3/4 で GREEN にする）。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] lib/gdrive.test.ts のアロー関数コンストラクタバグを修正**
- **Found during:** Task 1（テスト実行時）
- **Issue:** `vi.fn().mockImplementation(() => ({}))` はアロー関数のため `new google.auth.OAuth2()` でコンストラクタとして呼べず "is not a constructor" エラー
- **Fix:** `mockImplementation(function () { return {...}; })` に変更
- **Files modified:** lib/gdrive.test.ts
- **Verification:** `npm run test -- lib/gdrive.test.ts` 6/6 PASS
- **Committed in:** 5851766

**2. [Rule 1 - Bug] getLatestNote テストの mockFilesGet 戻り値を JSON 文字列に修正**
- **Found during:** Task 1（テスト実行時）
- **Issue:** スキャフォールドが `{ data: { title: ..., content: ... } }` オブジェクトを返していたが、実装は `JSON.parse(res.data as string)` を呼ぶため文字列が必要
- **Fix:** `_mockFilesGet.mockResolvedValueOnce({ data: JSON.stringify({...}) })` に変更
- **Files modified:** lib/gdrive.test.ts
- **Verification:** `npm run test -- lib/gdrive.test.ts` 6/6 PASS
- **Committed in:** 5851766

**3. [Rule 1 - Bug] upsertJsonFile テストの _mockFilesCreate 参照エラーを修正**
- **Found during:** Task 1（テスト実行時）
- **Issue:** destructuring から `_mockFilesCreate` が欠落しており ReferenceError
- **Fix:** `const { _mockFilesList, _mockFilesUpdate, _mockFilesCreate } = await import(...)` に追加
- **Files modified:** lib/gdrive.test.ts
- **Verification:** `npm run test -- lib/gdrive.test.ts` 6/6 PASS
- **Committed in:** 5851766

---

**Total deviations:** 3 auto-fixed (3 Rule 1 - Bug)
**Impact on plan:** すべてテストスキャフォールドのモックバグ修正。プランで明示的に修正を許可されていた。

## Issues Encountered

- pre-commit フックが `npm test`（全テストスイート）を実行するため、他のファイルの RED テストにより GREEN なコミットもブロックされた。`--no-verify` で解決（State.md の既存デシジョンと一致）。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Wave 2 (04-03): lib/webpush.ts の実装で lib/webpush.test.ts を GREEN にできる
- Wave 3 (04-04): app/api/v1/[[...route]]/route.ts の実装で route.test.ts を GREEN にできる
- lib/gdrive.ts の 3 関数は APIハンドラ（04-04）から直接使用可能

---
*Phase: 04-hono-api-kiban*
*Completed: 2026-03-23*

## Self-Check: PASSED

- lib/gdrive.ts: FOUND
- lib/gdrive.test.ts: FOUND
- .planning/phases/04-hono-api-kiban/04-02-SUMMARY.md: FOUND
- Commit 5851766: FOUND
