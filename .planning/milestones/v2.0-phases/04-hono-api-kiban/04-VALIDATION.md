---
phase: 04
slug: hono-api-kiban
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 04 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | cargo test (Rust unit tests) |
| **Quick run command** | `cd src-tauri && cargo test 2>&1 \| tail -5` |
| **Full suite command** | `cd src-tauri && cargo test && cd .. && npm test` |
| **Estimated runtime** | ~30 seconds |

## Sampling Rate

- **After every task commit:** `cd src-tauri && cargo test 2>&1 | tail -5`
- **After every plan wave:** `cd src-tauri && cargo test && cd .. && npm test`
- **Max feedback latency:** 30 seconds

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Automated Command | Status |
|---------|------|------|-------------|-------------------|--------|
| 04-01-01 | 01 | 1 | API-01, API-02, API-03 | `cargo test gdrive` | ⬜ pending |
| 04-02-01 | 02 | 2 | API-04, API-05, API-06 | `cargo test webpush` | ⬜ pending |
| 04-03-01 | 03 | 3 | API-07 | `cargo test fusen_send` | ⬜ pending |

## Manual-Only Verifications

| Behavior | Requirement | Why Manual |
|----------|-------------|------------|
| Google OAuth PKCE（ブラウザ認証） | API-01 | ブラウザ操作が必要 |
| APNs 実機 Push 通知 | API-06 | 実機 iPhone が必要 |

## Validation Sign-Off

- [ ] nyquist_compliant: true set in frontmatter

**Approval:** pending
