---
phase: 1
slug: code-review
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Static analysis (grep/manual code review) + existing Playwright E2E |
| **Config file** | playwright.config.ts |
| **Quick run command** | `npx playwright test --reporter=line` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --reporter=line`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | STAB-01 | static | `grep -n "listen(" app/components/StickyNote.tsx` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | STAB-02 | static | `grep -rn "\.unwrap()" src-tauri/src/` | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | DATA-01 | static | `grep -n "hasLoadedRef" app/hooks/useNoteFile.ts` | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | DATA-02 | static | `grep -n "cancelled" app/components/StickyNote.tsx` | ✅ | ⬜ pending |
| 1-01-05 | 01 | 1 | UI-01 | e2e | `npx playwright test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. This phase is a code review (static analysis + documentation), not a feature implementation. No new test infrastructure needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FINDINGS.md 内容の妥当性確認 | STAB-01, STAB-02, DATA-01, DATA-02, UI-01 | ドキュメントの内容・網羅性は自動チェック困難 | FINDINGS.md を開き、各要件の発見事項が記録されていることを確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
