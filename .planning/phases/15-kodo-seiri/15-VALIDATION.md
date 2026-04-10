---
phase: 15
slug: kodo-seiri
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-10
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.17 + @testing-library/react |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test && npm run test:e2e` |
| **Estimated runtime** | ~30 seconds (unit) / ~120 seconds (E2E) |

**E2Eテスト前提:** `npm run test:e2e` は port 3003 の Next.js devサーバーが起動していること。

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** `npm test && npm run test:e2e` must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | CLEAN-02 | unit | `npm test` | ❌ Wave 0 | ⬜ pending |
| 15-01-02 | 01 | 1 | CLEAN-02 | static | `npm test` (TSC) | ❌ Wave 0 | ⬜ pending |
| 15-02-01 | 02 | 2 | CLEAN-01 | static | `grep -n "noteData\|downloadWithAutoRefresh" app/viewer/page.tsx` | — | ⬜ pending |
| 15-02-02 | 02 | 2 | CLEAN-01 | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/viewer/lib/indexeddb.test.ts` — lib/indexeddb.ts の純粋関数をカバー（openDraftsDB, saveDraft, loadDraft, loadAllDrafts, deleteDraft）
- [ ] `app/viewer/lib/drive.test.ts` — lib/drive.ts の関数をカバー（fetch モック必要）

*`app/viewer/types.ts` は型定義のみ — 専用テストファイル不要、TypeScript コンパイルで十分。*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 画像の一覧↔編集往復で壊れない（バグ①）| CLEAN-02 | 実機のBlobURL動作が必要 | 一覧→編集→一覧→編集で画像が消えないことを確認 |
| 別の通知タップで正しく切り替わる（バグ②）| CLEAN-02 | iPhone実機のPush通知が必要 | メモAを開いた状態でメモBの通知をタップ→メモBが表示されること |
| ベルON/OFF状態が正確に表示される（バグ③）| CLEAN-01 | lockedNoteIds統一の視覚確認 | ロック/解除を繰り返してベル状態がズレないこと |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
