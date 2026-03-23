---
phase: 4
slug: hono-api-kiban
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest v4.x |
| **Config file** | `vitest.config.ts`（既存） |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | API-02, API-03, API-05, API-07 | unit (mock) | `npm run test -- lib/gdrive.test.ts` | ❌ W0 | ⬜ pending |
| 4-01-02 | 01 | 1 | API-02, API-03 | unit (mock) | `npm run test -- lib/gdrive.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-01 | 02 | 0 | API-04, API-06 | unit | `npm run test -- lib/webpush.test.ts` | ❌ W0 | ⬜ pending |
| 4-02-02 | 02 | 1 | API-04, API-06 | unit (mock) | `npm run test -- lib/webpush.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-01 | 03 | 0 | API-01 | unit | `npm run test -- app/api/v1/[[...route]]/route.test.ts` | ❌ W0 | ⬜ pending |
| 4-03-02 | 03 | 2 | API-01, API-05, API-06, API-07 | unit (mock) | `npm run test` | ❌ W0 | ⬜ pending |
| 4-04-01 | 04 | 3 | all API | manual | curl 検証スクリプト | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lib/gdrive.test.ts` — stubs for API-02, API-03, API-05, API-07
- [ ] `lib/webpush.test.ts` — stubs for API-04, API-06
- [ ] `app/api/v1/[[...route]]/route.test.ts` — stubs for API-01（Bearer auth）
- Framework install: 不要（Vitest v4.x 既にインストール済み）

*`vitest.config.ts` の `include` に `'lib/**/*.test.ts'` が含まれているため即時配置可能。*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| curl で POST /api/v1/subscribe → Drive保存 + 200 | API-05 | 実Google Drive + 実Push サービスへのアクセスが必要 | `curl -X POST https://<vercel-url>/api/v1/subscribe -H "Authorization: Bearer $TOKEN" -d '{"subscription":{...}}'` |
| curl で POST /api/v1/notes/push → Drive書込 + APNs送信 | API-06 | 実Push通知サービスへのアクセスが必要 | `curl -X POST https://<vercel-url>/api/v1/notes/push -H "Authorization: Bearer $TOKEN" -d '{"body":"test"}'` |
| curl で GET /api/v1/notes/latest → JSON返却 | API-07 | 実Google Drive状態依存 | `curl https://<vercel-url>/api/v1/notes/latest -H "Authorization: Bearer $TOKEN"` |
| refresh_token 失効時に503 返却 | API-02 | 実OAuth失効状態が必要 | Google Cloudで refresh_token を無効化してからAPIを呼ぶ |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
