---
phase: 6
slug: iphone-send-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.17 + @testing-library/react ^16.3.1 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run app/viewer/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run app/viewer/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | SEND-01,02,03,04,HIST-01,02,REND-01 | unit stub | `npx vitest run app/viewer/viewer.test.tsx` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | SEND-01,SEND-02 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存（新テスト追加） | ⬜ pending |
| 6-03-01 | 03 | 2 | SEND-03 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存（新テスト追加） | ⬜ pending |
| 6-04-01 | 04 | 2 | SEND-04 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存（新テスト追加） | ⬜ pending |
| 6-05-01 | 05 | 3 | HIST-01,HIST-02 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存（新テスト追加） | ⬜ pending |
| 6-06-01 | 06 | 3 | REND-01 | unit | `npx vitest run app/viewer/viewer.test.tsx` | ✅ 既存（新テスト追加） | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `app/viewer/viewer.test.tsx` — SEND-01〜04, HIST-01〜02, REND-01 のテストケースをスタブとして先行追加
- [ ] `vi.mock('mermaid')` のセットアップ — mermaid の jsdom 対応モック（`render` を `{ svg: '<svg>mock</svg>' }` で返す）
- [ ] `HTMLCanvasElement.prototype.getContext` の `vi.fn()` モック — Canvas API の jsdom 対応

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safariでカメラ/ライブラリ選択シートが開く | SEND-03 | 実機のみ（jsdomは file input未対応） | iPhoneのSafariでPWAを開き、📷ボタンをタップしてカメラ/ライブラリが表示されることを確認 |
| PWAアイコンタップ→即writeステップ表示 | SEND-01 | 実機PWA環境のみ確認可能 | ホーム画面のアイコンをタップしてwriteステップが表示されることを確認 |
| Mermaid SVGが実際に描画される | REND-01 | jsdomではSVG描画を検証不可 | viewerでmermaidブロックを含むノートを表示してSVG図が表示されることを確認 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
