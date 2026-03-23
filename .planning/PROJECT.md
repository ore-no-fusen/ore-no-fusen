# 俺の付箋

## What This Is

デスクトップ付箋アプリ（Tauri v2 + Next.js 14）。付箋をデスクトップに貼り、すぐ書いてそこに残す。
v2.0 マイルストーンでは Hono + Google Drive + APNs を使い、PCからiPhoneのロック画面に付箋を送れるようにする。

## Core Value

> 「大事なことは貼っておけばいいと思うよ」
> すぐ書けて、そこに残る。それだけ確実に動く。

## Current Milestone: v2.0 iPhone連携

**Goal:** PCの付箋を右クリック一発でiPhoneのロック画面に送れるようにする

**Target features:**
- Hono API 基盤（Push通知エンドポイント）
- Google Drive 連携（データ中継・費用ゼロ）
- VAPID + APNs によるiPhone Push通知
- iPhone Safari PWA（閲覧・通知受信）

## Tech Stack

- **Frontend**: Next.js 14 + React 18 + TypeScript
- **Backend**: Rust（Tauri v2）
- **API**: Hono（Next.js App Router内）
- **通信（デスクトップ）**: Tauri `invoke()`
- **通信（Web）**: Google Drive API + APNs
- **テスト**: Vitest（33件）+ Playwright E2E（13件）

## Requirements

### Validated

- ✓ 新規作成・編集の基本フロー動作
- ✓ 自動保存
- ✓ マルチウィンドウ
- ✓ ピン（常に最前面）
- ✓ リッチテキスト編集（太字・見出し・箇条書き・チェックボックス）
- ✓ 潜在バグの洗い出しと修正（v1.0マイルストーン）

### Active

- [ ] Hono API 基盤の構築
- [ ] Google Drive 連携（Push Subscription保存・note JSON読み書き）
- [ ] VAPID署名 + APNs Push通知送信
- [ ] iPhone Safari PWA（Service Worker・通知受信・閲覧）
- [ ] PCからの「iPhoneに送る」操作（右クリックメニュー）

### Out of Scope

- iPhoneからの双方向編集 — Phase 3（次マイルストーン）
- Android対応 — Phase 3（次マイルストーン）
- 既存 `app/api/*.ts` のHono移植 — 今は不要、次マイルストーン以降
- ユーザー認証（複数ユーザー） — シングルユーザー前提のため不要

## Context

- **ノートデータ形式**: Markdownファイル（YAML frontmatter付き）
- **現在の保存先**: ローカルファイルシステム
- **移行方針**: デスクトップ側コード変更なし。Google Driveの同期フォルダにノートフォルダを移動するだけ
- **`ctx_send_to_iphone` が既存コードに `enabled: false` で実装済み** — Phase 2の工数削減に直結
- **VAPID暗号化はHono側で処理** — Rustには reqwest 1クレート追加のみ

## Constraints

- **費用**: ¥0（Vercel無料枠 + Google Drive 15GB + APNs 無料）
- **Tech stack**: 既存 Next.js プロジェクト内に Hono を追加（新サーバー不要）
- **Rust変更最小化**: reqwest のみ追加、暗号処理はTypeScript側
- **シングルユーザー**: 自分だけが使う前提（認証はGoogle OAuth最小構成）

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 最小修正のみ | CLAUDE.md のルール | ✓ Good |
| Hono を Next.js 内に統合 | 新サーバー不要・Vercel同居 | — Pending |
| VAPID処理をHono側に | Rustクレート7個 → 1個（reqwestのみ） | — Pending |
| Google Drive をデータ中継に使用 | DB不要・費用ゼロ・ファイルがそのままデータ | — Pending |
| 既存APIは移植しない（v2.0では） | 移植コスト > メリット。iPhone機能に必要なエンドポイントだけ新規追加 | — Pending |

---
*Last updated: 2026-03-23 after v2.0 milestone start*
