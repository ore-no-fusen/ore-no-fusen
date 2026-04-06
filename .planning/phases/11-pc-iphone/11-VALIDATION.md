---
phase: 11
slug: pc-iphone
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + jsdom |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run app/viewer/viewer.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run app/viewer/viewer.test.tsx`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | P11-01 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 0 | P11-02 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 0 | P11-03 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 0 | P11-04 | unit | `npx vitest run` | ❌ W0 | ⬜ pending |
| 11-02-01 | 02 | 1 | P11-01〜03 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ | ⬜ pending |
| 11-02-02 | 02 | 1 | P11-04 | unit | `npx vitest run` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 1 | P11-05 | manual | — | — | ⬜ pending |
| 11-03-02 | 03 | 1 | P11-06 | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/viewer/viewer.test.tsx` に P11-01〜03 スタブ追加（DraftRecord received_pc フラグ・配列スキーマ互換）
- [ ] `worker/worker.test.js` または viewer.test.tsx 内 worker モック — P11-04（通知タグ `'fusen-<id>'`）

*既存 vitest インフラが利用可能。新規ライブラリのインストール不要。*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 複数通知がロック画面に独立表示される | P11-05 | 実機PWA環境が必要 | iPhoneで2件送信→ロック画面で独立した通知2件を確認 |
| 通知タップ後に一覧で PC受信バッジが表示される | P11-06 | 実機PWA環境が必要 | 通知タップ→一覧に水色「PC受信」バッジのノートを確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
