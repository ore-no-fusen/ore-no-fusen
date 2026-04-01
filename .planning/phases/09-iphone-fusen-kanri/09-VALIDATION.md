---
phase: 9
slug: iphone-fusen-kanri
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (Next.js default) + Playwright E2E |
| **Config file** | jest.config.js / playwright.config.ts |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npx playwright test` |
| **Estimated runtime** | ~30 seconds (Jest) / ~60 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | IPHONE-MGT-01 | unit (pendingHydrate state 変化) | `npm test -- --testPathPattern=viewer` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | IPHONE-MGT-03 | unit (＋ボタン → draftId: null) | `npm test -- --testPathPattern=viewer` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | IPHONE-MGT-02, IPHONE-MGT-04 | unit (deleteDraft → loadAllDrafts 呼び出し) | `npm test -- --testPathPattern=viewer` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 3 | IPHONE-MGT-05 | smoke (既存 E2E + npm test) | `npm test` | ✅ 既存 | ⬜ pending |
| 09-03-02 | 03 | 3 | IPHONE-MGT-01〜05 | manual (全フロー統合) | checkpoint:human-verify | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/viewer/__tests__/page.test.tsx` — IPHONE-MGT-01〜04 のユニットテストスタブ
  - IPHONE-MGT-01: pendingHydrate state が非null のとき useEffect が hydrateEditor を呼ぶ
  - IPHONE-MGT-02: saveDraft が currentDraftId と同じ id で呼ばれる（上書き確認）
  - IPHONE-MGT-03: ＋ボタン onClick が setPendingHydrate({ draftId: null, ... }) を呼ぶ
  - IPHONE-MGT-04: deleteDraft 後に loadAllDrafts が呼ばれる
- [ ] IndexedDB モック — `fake-indexeddb` または jest-idb-mock（openDraftsDB のテスト用）
- [ ] contenteditable モック — editorRef.current のスタブ

*IPHONE-MGT-05（「PCに送る」送信動作維持）は既存 Playwright E2E スモークテストでカバー。*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 一覧→write 遷移後にエディタに内容が表示される | IPHONE-MGT-01 | contenteditable DOM 操作は JSDOM で再現困難 | list でノートタップ → write 画面でエディタが空でないことを目視確認 |
| 削除後に一覧からノートが消える | IPHONE-MGT-04 | IndexedDB モックの完全再現が困難 | 🗑️ タップ → 一覧でそのノートが消えていることを目視確認 |
| 「PCに送る」送信フロー全体 | IPHONE-MGT-05 | Drive API・ネットワーク依存 | Plan 03 の checkpoint:human-verify で確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
