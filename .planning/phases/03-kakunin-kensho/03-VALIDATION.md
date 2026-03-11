---
phase: 3
slug: kakunin-kensho
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright ^1.57.0 (E2E) + Vitest ^4.0.17 (Unit) |
| **Config file** | `playwright.config.ts` / `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npx playwright test && npm run test` |
| **Estimated runtime** | ~3〜4 minutes (E2E 1-2min + unit 30sec) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npx playwright test && npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (vitest), 120 seconds (Playwright)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 1 | STAB-01, DATA-01, DATA-02, UI-01, UI-02 | unit | `npm run test` | ✅ | ⬜ pending |
| 3-01-02 | 01 | 1 | STAB-01, DATA-01, DATA-02, UI-01, UI-02 | E2E | `npx playwright test` | ✅ | ⬜ pending |
| 3-01-03 | 01 | 1 | STAB-02 | build | `npm run tauri build` | ✅ | ⬜ pending |
| 3-01-04 | 01 | 1 | STAB-03 | manual | ピンボタン操作 + トレイ操作 | manual-only | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

新規テストファイルの作成は不要。既存インフラ（playwright.config.ts / vitest.config.ts）が全要件をカバーしている。

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Win32 API 呼び出し後にウィンドウが消えない | STAB-03 | ブラウザベース E2E では Tauri の内部状態を確認不可 | 新規付箋作成 → ピンボタン押下 → ウィンドウが消えないことを確認 |
| トレイアイコン操作後クラッシュしない | STAB-02 (manual confirm) | Win32 環境依存 | トレイ右クリック → メニュー表示 → 正常動作確認 |
| frontmatter なしノートの行ジャンプ正常動作 | STAB-02 (manual confirm) | E2E でカバーされていない | frontmatter なしのノートを開く → 行ジャンプ動作確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s (E2E), 30s (unit)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
