---
phase: 04-hono-api-kiban
plan: "01"
subsystem: infra
tags: [rust, cargo, reqwest, oauth2, p256, jsonwebtoken, aes-gcm, hkdf, tauri-plugin-oauth, state]

# Dependency graph
requires: []
provides:
  - "Phase 4 全クレート依存関係 (Cargo.toml)"
  - "ProConfig 型定義 + AppState.pro_config フィールド (state.rs)"
affects: [04-02-gdrive, 04-03-webpush, 04-04-hono-auth, 04-05-apns]

# Tech tracking
tech-stack:
  added:
    - "reqwest 0.12 (json, rustls-tls, multipart) — HTTP クライアント"
    - "oauth2 5.0 — Google OAuth PKCE フロー"
    - "tauri-plugin-oauth 2 — ローカルリダイレクト受信"
    - "p256 0.13 (ecdh, ecdsa) — VAPID 鍵ペア生成"
    - "jsonwebtoken 9 — ES256 JWT 署名 (VAPID用, cmake 不要)"
    - "aes-gcm 0.10 — AES-128-GCM 暗号化"
    - "hkdf 0.12 — HKDF 鍵導出"
  patterns:
    - "AppState に Option<T> フィールドを追加して derive(Default) で初期化"

key-files:
  created: []
  modified:
    - "src-tauri/Cargo.toml — 7 クレート追加"
    - "src-tauri/src/state.rs — ProConfig 構造体 + AppState.pro_config フィールド"

key-decisions:
  - "jwt-simple を jsonwebtoken 9 に変更: jwt-simple は boring-sys 経由で cmake が必要なため、cmake なし環境でビルド不可。jsonwebtoken は cmake 不要かつ ES256 対応"
  - "reqwest は 0.12 を使用: 0.13 は tauri-plugin-updater が既に引き込んでいるが、直接依存として 0.12 を指定（0.13 は cmake 依存の boring-sys を引き込む）"

patterns-established:
  - "cmake 不要クレート優先: BoringSSL 依存クレートは Windows ビルド環境(cmake なし)でビルド失敗するため回避"

requirements-completed: [API-03, API-07]

# Metrics
duration: 9min
completed: 2026-03-23
---

# Phase 4 Plan 01: Cargo.toml 依存関係追加 + ProConfig 型定義 Summary

**reqwest/oauth2/p256/jsonwebtoken/aes-gcm/hkdf を Cargo.toml に追加し、Web Push サブスクリプション保持用 ProConfig 構造体を state.rs に定義**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-23T06:19:02Z
- **Completed:** 2026-03-23T06:28:02Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Cargo.toml に Phase 4 で必要な 7 クレートを追加し cargo check が通る状態を確立
- state.rs に ProConfig 構造体（push_endpoint / p256dh / auth）を定義
- AppState に pro_config: Option<ProConfig> フィールドを追加（derive(Default) で自動的に None）

## Task Commits

1. **Task 1: Cargo.toml に新規クレートを追加する** - `63ca7d1` (chore)
2. **Task 2: state.rs に ProConfig 構造体と AppState フィールドを追加する** - `aead5c8` (feat)

## Files Created/Modified

- `src-tauri/Cargo.toml` — reqwest/oauth2/tauri-plugin-oauth/p256/jsonwebtoken/aes-gcm/hkdf を依存追加
- `src-tauri/src/state.rs` — ProConfig 構造体 + AppState.pro_config フィールド

## Decisions Made

- jwt-simple を jsonwebtoken 9 に変更: jwt-simple が boring-sys 経由で cmake を必要とするが、このビルド環境に cmake がないため、cmake 不要で ES256 対応の jsonwebtoken 9 に差し替えた
- reqwest は 0.13 ではなく 0.12 を直接依存として指定: 0.13 は tauri-plugin-updater 経由で既にツリーにあるが、直接依存として 0.13 を指定すると aws-lc-rs 経由で cmake が必要になるため 0.12 を使用

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] jwt-simple を jsonwebtoken 9 に置き換え**
- **Found during:** Task 1 (Cargo.toml にクレートを追加する)
- **Issue:** jwt-simple 0.12 が boring-sys を引き込み、cmake なし環境でビルドエラー (`cmake not found`)
- **Fix:** jwt-simple の代わりに cmake 不要・ES256 対応の jsonwebtoken 9 を使用。VAPID JWT 署名機能は同等に実装可能
- **Files modified:** src-tauri/Cargo.toml
- **Verification:** cargo check が error 0 で完了
- **Committed in:** 63ca7d1 (Task 1 commit)

**2. [Rule 1 - Bug] reqwest を 0.13 から 0.12 に変更**
- **Found during:** Task 1 (reqwest 0.13 feature 調査中)
- **Issue:** reqwest 0.13 の `rustls` feature が aws-lc-rs/BoringSSL を引き込み cmake が必要。`rustls-tls` feature 名も 0.13 では廃止されている
- **Fix:** reqwest 0.12 を使用（`rustls-tls` feature が存在し cmake 不要）
- **Files modified:** src-tauri/Cargo.toml
- **Verification:** cargo check が error 0 で完了
- **Committed in:** 63ca7d1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - cmake 依存ブロック解消)
**Impact on plan:** 機能的に同等。jwt-simple → jsonwebtoken は ES256 署名が同様に可能。reqwest 0.12 → Plan 02/03 の HTTP 機能に影響なし。

## Issues Encountered

- reqwest 0.13 feature 名変更（rustls-tls が廃止）+ aws-lc-rs/BoringSSL 依存で cmake 必須となりビルド不可
- jwt-simple が boring-sys を引き込み同様に cmake 必須
- いずれも cmake 不要クレートへの変更で解決

## Next Phase Readiness

- Plan 02 (gdrive.rs): reqwest 0.12 + oauth2 5.0 + tauri-plugin-oauth が利用可能
- Plan 03 (webpush.rs): p256 + jsonwebtoken + aes-gcm + hkdf が利用可能、ProConfig 型が定義済み
- Plan 04/05: ProConfig が AppState に格納されるため Tauri コマンドから状態アクセス可能

---
*Phase: 04-hono-api-kiban*
*Completed: 2026-03-23*
