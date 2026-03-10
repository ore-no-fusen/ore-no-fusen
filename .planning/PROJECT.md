# 俺の付箋 — 品質改善マイルストーン

## Overview

**プロジェクト**: 俺の付箋（デスクトップ付箋アプリ）
**種類**: 既存プロジェクトへの品質改善（Brownfield）
**現在バージョン**: v1.0.4
**目標**: 潜在バグ・不安定要素を洗い出して修正し、安定した v1.1.0 をリリースする

## Core Value

> 「大事なことは貼っておけばいいと思うよ」
> すぐ書けて、そこに残る。それだけ確実に動く。

## Tech Stack

- **Frontend**: Next.js 14 + React 18 + TypeScript
- **Backend**: Rust（Tauri v2）
- **通信**: Tauri `invoke()`
- **テスト**: Playwright E2E（13件）

## Current Status

### 解決済みリスク
- C-1: `fusen_update_geometry` デッドコード削除済み
- C-2: `reload_note` リスナーの空body上書き → 修正済み
- H-1: `hasLoadedRef` による空body通過ブロック → 修正済み
- Listener Leak: `cancelled` フラグ + ref パターン → 修正済み
- ピンボタンバグ: 生Win32後のTauri状態同期 → 修正済み
- isNewNoteバグ: 再編集時カーソル先頭戻り → 修正済み
- Rust `unwrap()`: 29箇所 → `unwrap_or_else` に変更済み

### 既知の潜在リスク
- StickyNote.tsx が大きい（リファクタリング候補・現在は対象外）
- テストカバレッジ 30%（E2E 13件のみ）
- その他の未発見バグ・パターン

## Goals for This Milestone

1. **潜在リスクの洗い出し**: コードベースを横断的にレビューし、未対処のバグパターンを発見する
2. **優先度付け**: 影響度・再現性・修正コストで分類する
3. **修正**: 高優先度の問題を最小変更で修正する
4. **回帰防止**: 修正後にテストで確認する

## Requirements

### Validated

- ✓ 新規作成・編集の基本フロー動作
- ✓ 自動保存
- ✓ マルチウィンドウ
- ✓ ピン（常に最前面）
- ✓ リッチテキスト編集（太字・見出し・箇条書き・チェックボックス）

### Active

- [ ] 潜在バグの体系的な洗い出しと文書化
- [ ] 発見されたバグの修正（優先度高）
- [ ] 修正後の動作確認

### Out of Scope

- 新機能追加（画像貼り付け・タグ・リンク）— 別マイルストーン
- StickyNote.tsx のリファクタリング — 別マイルストーン
- テストカバレッジの大幅引き上げ — 別マイルストーン

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 最小修正のみ | CLAUDE.md のルール。無関係なコードは変更しない | — Active |
| ソース変更なし（調査フェーズ） | まず問題を把握してから修正に入る | — Active |

---
*Last updated: 2026-03-11 after initialization*
