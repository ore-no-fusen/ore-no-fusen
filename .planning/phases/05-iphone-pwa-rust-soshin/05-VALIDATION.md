---
phase: 5
slug: iphone-pwa-rust-soshin
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (unit) + Playwright (E2E) |
| **Config file** | vitest.config.ts / playwright.config.ts |
| **Quick run command** | `npm run test -- --reporter=verbose` |
| **Full suite command** | `npm run test && npx playwright test` |
| **Estimated runtime** | ~30 seconds (vitest) / ~60 seconds (playwright) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test && npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | PWA-01 | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | PWA-01 | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | PWA-02 | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | PWA-02 | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 5-02-03 | 02 | 1 | PWA-03 | unit | `npm run test` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 2 | SEND-01 | manual | — | — | ⬜ pending |
| 5-04-01 | 04 | 3 | SEND-02 | manual | — | — | ⬜ pending |
| 5-04-02 | 04 | 3 | SEND-02 | E2E | `npx playwright test --grep="iphone"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/viewer/viewer.test.tsx` — viewer ページのレンダリング・ステップ遷移スタブ
- [ ] `worker/worker.test.js` — service worker push/notificationclick ハンドラスタブ
- [ ] `app/hooks/useStickyNoteContextMenu.test.ts` — SEND-02 ctx_send_to_iphone invoke スタブ
- [ ] `tests/iphone-e2e.spec.ts` — Playwright E2E スタブ（iPhoneに送る右クリックメニュー）

*既存の vitest / playwright infrastructure は導入済み。Wave 0 はテストファイルの追加のみ。*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iPhoneロック画面に通知が届く | SEND-01 | 実機 APNs が必要、エミュレータ不可 | PC右クリック「iPhoneに送る」→ iPhone実機でロック画面確認 |
| Rust送信コマンド fusen_send_to_iphone 実行 | SEND-01 | Tauri invoke は実Tauriビルド環境が必要 | `npm run tauri dev` で起動 → 右クリック「iPhoneに送る」押下 |
| 通知タップでPWAが開き全文表示 | SEND-02 | iOS Safari PWA + 実機通知が必要 | iPhone通知タップ → /viewer が開き fusen_note.json 内容表示 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
