---
phase: 2
slug: bagu-shuse
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + cargo build |
| **Config file** | `playwright.config.ts` |
| **Quick run command** | `cargo build --manifest-path src-tauri/Cargo.toml` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cargo build --manifest-path src-tauri/Cargo.toml`
- **After every plan wave:** Run `npx playwright test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | STAB-02 | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 2-01-02 | 01 | 1 | STAB-02 | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 2-01-03 | 01 | 1 | STAB-02 | build | `cargo build --manifest-path src-tauri/Cargo.toml` | ✅ | ⬜ pending |
| 2-02-01 | 02 | 2 | STAB-03 | manual | — 目視確認 | N/A | ⬜ pending |
| 2-02-02 | 02 | 2 | UI-02 | smoke | `npx playwright test --grep "フォーマット"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — 既存テストインフラが Phase 2 要件をカバーしている。

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Rust panic しないこと（unwrap 除去） | STAB-02 | Rustランタイム動作のため自動E2E不可 | `cargo build` でコンパイルエラーがないことを確認 |
| Win32後のTauri状態同期 | STAB-03 | ランタイム動作（ウィンドウ表示/非表示）のため自動E2E困難 | アプリ起動後にピンボタンを操作し、ウィンドウが消えないことを確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
