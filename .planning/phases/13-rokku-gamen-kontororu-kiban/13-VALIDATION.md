---
phase: 13
slug: rokku-gamen-kontororu-kiban
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright |
| **Config file** | playwright.config.ts |
| **Quick run command** | `npx playwright test --grep "LOCK"` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx playwright test --grep "LOCK"`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 13-01-01 | 01 | 0 | LOCK-03 | unit | `npx playwright test --grep "LOCK-03"` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 0 | LOCK-04 | unit | `npx playwright test --grep "LOCK-04"` | ❌ W0 | ⬜ pending |
| 13-01-03 | 01 | 0 | LOCK-05 | unit | `npx playwright test --grep "LOCK-05"` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 1 | LOCK-01 | manual | — | — | ⬜ pending |
| 13-02-02 | 02 | 1 | LOCK-02 | manual | — | — | ⬜ pending |
| 13-02-03 | 02 | 1 | LOCK-03 | unit | `npx playwright test --grep "LOCK-03"` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 1 | LOCK-04 | unit | `npx playwright test --grep "LOCK-04"` | ❌ W0 | ⬜ pending |
| 13-03-02 | 03 | 1 | LOCK-05 | unit | `npx playwright test --grep "LOCK-05"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lock-notification.spec.ts` — LOCK-03（ロック中🔔が text-blue-500）、LOCK-04（複数メモが独立タグ）、LOCK-05（DB locked フラグ永続化）
- [ ] SW Notification API モック確認 — `mock-tauri.ts` は Tauri API のみ。`navigator.serviceWorker.ready` / `registration.showNotification` のモックが必要かを Wave 0 で確認する

*既存インフラ（playwright.config.ts, mock-tauri.ts）は流用可能。新規テストファイルのみ追加。*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 🔔タップでiPhoneロック画面に通知が表示される | LOCK-01 | iPhone実機でのSW通知表示はPlaywrightで自動検証不可 | PWAモードでiPhoneを開き、一覧の🔔ボタンをタップ → ロック画面に通知が出ることを確認 |
| 🔔再タップでロック画面の通知が消える | LOCK-02 | 同上 | ロック中メモの🔔を再タップ → ロック画面から通知が消えることを確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
