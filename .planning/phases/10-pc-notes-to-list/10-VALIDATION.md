---
phase: 10
slug: iphone-ux-improvements
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (E2E) + manual (実機iPhone) |
| **Config file** | playwright.config.ts |
| **Quick run command** | `npx playwright test` |
| **Full suite command** | `npx playwright test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** `npx playwright test`（既存テスト全件グリーンを確認）
- **After every plan wave:** 実機iPhoneで動作確認
- **Before `/gsd:verify-work`:** 全スイートグリーン + 実機確認済み
- **Max feedback latency:** 60 seconds (automated) + manual

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Feature | Test Type | Automated Command | Status |
|---------|------|------|---------|-----------|-------------------|--------|
| 10-01-01 | 01 | 1 | チェックボックス行頭挿入 | E2E / manual | `npx playwright test` | ⬜ pending |
| 10-01-02 | 01 | 1 | インタラクティブチェックボックス | manual (iOS Safari) | — | ⬜ pending |
| 10-02-01 | 02 | 1 | タグサジェストUI | E2E / manual | `npx playwright test` | ⬜ pending |
| 10-03-01 | 03 | 1 | Drive フォルダIDキャッシュ | manual | — | ⬜ pending |
| 10-03-02 | 03 | 1 | 画像アップロード並列化 | manual | — | ⬜ pending |
| 10-03-03 | 03 | 2 | PCポーリング5秒化 | manual (PC受信時間計測) | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

既存インフラで対応可能。新規テストファイル不要。

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Feature | Why Manual | Test Instructions |
|----------|---------|------------|-------------------|
| チェックボックス行頭挿入 | 要件1 | iOS Safari の contenteditable 動作 | 行中にカーソルを置き☑ボタンをタップ → 行頭に `- [ ] ` が挿入されること |
| インタラクティブチェックボックス | 要件2 | iOS タッチイベント固有 | `- [ ] テスト` と入力 → チェックボックスをタップ → `- [x] テスト` に変わること |
| タグサジェスト | 要件3 | UI操作 | タグを1つ追加して保存→再度タグバーを開く→候補に前回のタグが表示されること |
| 送信速度 | 要件4 | タイマー計測 | 「PCに送る」タップからPC受信まで5秒以内であること |
| PCポーリング5秒 | 要件4 | タイマー計測 | 送信後5秒以内にPC側に付箋が開くこと |

---

## Validation Sign-Off

- [ ] 全タスクに automated verify または manual 手順あり
- [ ] 既存 E2E テスト (13件) グリーンを維持
- [ ] 実機確認: iPhone での4要件すべて動作
- [ ] PC受信: 送信から5秒以内を計測確認
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
