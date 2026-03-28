---
phase: 04-hono-api-kiban
plan: "03"
subsystem: infra
tags: [webpush, vapid, aes-gcm, apns, p256, hkdf, jsonwebtoken, rfc8291, rfc8292]

# Dependency graph
requires:
  - phase: 04-01
    provides: ProConfig struct (push_endpoint, p256dh, auth fields)
provides:
  - webpush::generate_vapid_keys (P-256 VAPID keypair, saved to app data dir)
  - webpush::sign_vapid_jwt (RFC 8292 ES256 JWT via jsonwebtoken 9)
  - webpush::encrypt_payload (RFC 8291 ECDH + HKDF-SHA256 + AES-128-GCM)
  - webpush::send_web_push (APNs HTTP POST with VAPID Authorization header)
affects:
  - 04-04 (fusen_send_to_iphone calls send_web_push)
  - 04-05 (end-to-end push flow)

# Tech tracking
tech-stack:
  added:
    - sha2 = "0.10" (explicit dep for HKDF-SHA256)
    - rand_core = "0.6" (explicit dep for OsRng in key generation)
    - p256 pkcs8 feature (for PKCS#8 DER export used by jsonwebtoken EncodingKey)
  patterns:
    - RFC 8291 ECDH-HKDF-AES128GCM encryption pattern (WebPush payload)
    - RFC 8292 VAPID JWT signing with ES256 via jsonwebtoken EncodingKey::from_ec_der

key-files:
  created:
    - src-tauri/src/webpush.rs
  modified:
    - src-tauri/src/lib.rs (added mod webpush)
    - src-tauri/Cargo.toml (sha2, rand_core, p256 pkcs8 feature)

key-decisions:
  - "jsonwebtoken 9 (not jwt-simple) for ES256 signing: cmake不要クレートとして前フェーズで決定済み"
  - "p256 pkcs8 feature を追加: SigningKey::to_pkcs8_der() で PKCS#8 DER を jsonwebtoken に渡す"
  - "sha2/rand_core を明示的依存に追加: transitive only では use 宣言がコンパイルエラーになる"

patterns-established:
  - "RFC 8291 WebPush暗号化: ECDH shared secret → HKDF (auth salt) → CEK/Nonce導出 → AES-128-GCM"
  - "VAPID JWT: ES256KeyPair(p256 PKCS#8 DER) → jsonwebtoken encode → Authorization: vapid t=JWT,k=pubkey"

requirements-completed: [API-04, API-05, API-06]

# Metrics
duration: 10min
completed: 2026-03-23
---

# Phase 04 Plan 03: webpush.rs Summary

**RFC 8292 VAPID ES256 JWT署名 + RFC 8291 ECDH-HKDF-AES-128-GCM暗号化 + APNs HTTP POST を実装した Rust webpush モジュール（4テスト全通過）**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-23T07:00:22Z
- **Completed:** 2026-03-23T07:10:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- `generate_vapid_keys` で P-256 秘密鍵を OsRng から生成し、65 byte 非圧縮公開鍵 + 32 byte 秘密鍵として保存
- `sign_vapid_jwt` で PKCS#8 DER 経由 jsonwebtoken ES256 署名、3セクション JWT を生成
- `encrypt_payload` で RFC 8291 完全準拠（ECDH → HKDF-SHA256 × 2 → AES-128-GCM + RFC 8291 ヘッダー付与）
- `send_web_push` で APNs に VAPID Authorization ヘッダー付き POST、201 以外はエラー返却
- `cargo test webpush` 4 tests PASSED

## Task Commits

1. **Task 1: webpush.rs 実装 (VAPID + AES-128-GCM + APNs POST)** - `5045c87` (feat)

**Plan metadata:** (この SUMMARY.md コミット)

## Files Created/Modified
- `src-tauri/src/webpush.rs` - VAPID鍵生成・JWT署名・AES-128-GCM暗号化・APNs POST の全実装 + 4 unit tests
- `src-tauri/src/lib.rs` - `mod webpush;` を追加
- `src-tauri/Cargo.toml` - sha2, rand_core, p256 pkcs8 feature を追加

## Decisions Made
- `jwt-simple` は cmake が必要な `boring-sys` を引き込むため不採用（前フェーズ決定）。`jsonwebtoken 9` を使用し、`EncodingKey::from_ec_der` に PKCS#8 DER バイトを渡す方式を採用
- `sha2`・`rand_core` は transitive 依存として存在するが `use sha2::Sha256` 等を使うには明示的 `[dependencies]` 追加が必要

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jwt-simple → jsonwebtoken API 差異の修正**
- **Found during:** Task 1 (webpush.rs 実装)
- **Issue:** Plan は `jwt_simple::ES256KeyPair` を使用するよう指示していたが、STATE.md の決定で `jsonwebtoken 9` に変更済みのため API が異なる
- **Fix:** `SigningKey::to_pkcs8_der()` (p256 pkcs8 feature) で PKCS#8 DER を取得し `EncodingKey::from_ec_der` に渡す実装に変更
- **Files modified:** src-tauri/src/webpush.rs, src-tauri/Cargo.toml
- **Verification:** cargo test webpush PASSED
- **Committed in:** 5045c87

**2. [Rule 3 - Blocking] sha2・rand_core の明示的依存追加**
- **Found during:** Task 1 (cargo check)
- **Issue:** `use sha2::Sha256` / `use rand_core::OsRng` がコンパイルエラー（transitive のみでは不可）
- **Fix:** Cargo.toml に `sha2 = "0.10"` と `rand_core = { version = "0.6", features = ["getrandom"] }` を追加
- **Files modified:** src-tauri/Cargo.toml
- **Verification:** cargo check エラーなし
- **Committed in:** 5045c87

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** 両修正とも前フェーズの決定（jwt-simple→jsonwebtoken）に起因する必須対応。スコープ変化なし。

## Issues Encountered
- `to_pkcs8_der()` の型推論が失敗（E0282）: `map_err` のクロージャ引数に `p256::pkcs8::Error` の明示的型注釈を追加して解決

## Next Phase Readiness
- `webpush::send_web_push` が公開済み。Plan 04（fusen_send_to_iphone コマンド実装）で呼び出し可能
- VAPID 鍵ペアはアプリデータディレクトリ (`ore-no-fusen/vapid_keys.json`) に自動生成・永続化

## Self-Check: PASSED
- src-tauri/src/webpush.rs: FOUND
- .planning/phases/04-hono-api-kiban/04-03-SUMMARY.md: FOUND
- commit 5045c87: FOUND

---
*Phase: 04-hono-api-kiban*
*Completed: 2026-03-23*
