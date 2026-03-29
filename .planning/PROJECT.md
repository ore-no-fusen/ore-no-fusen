# 俺の付箋

## What This Is

デスクトップ付箋アプリ（Tauri v2 + Next.js 14）。付箋をデスクトップに貼り、すぐ書いてそこに残す。
v2.0 マイルストーンで Google Drive + APNs を使ったPC→iPhone送信を実装。PCの付箋を右クリック一発でiPhoneのロック画面に送れる。

## Core Value

> 「大事なことは貼っておけばいいと思うよ」
> すぐ書けて、そこに残る。それだけ確実に動く。

## Current State (v2.0 shipped 2026-03-29)

- PCの付箋を右クリック→「iPhoneに送る」でロック画面通知が届く
- iPhone PWA（/viewer）で付箋の全文が読める
- Google Drive経由（DB不要・費用ゼロ）
- VAPID + APNs で暗号化プッシュ通知

## Tech Stack

- **Frontend**: Next.js 14 + React 18 + TypeScript
- **Backend**: Rust（Tauri v2）
- **API**: Next.js App Router Route Handlers（Vercel）
- **通信（デスクトップ）**: Tauri `invoke()`
- **通信（Web）**: Google Drive API + APNs（VAPID）
- **テスト**: Vitest（33件）+ Playwright E2E（13件）

## Current Milestone: v3.0 iPhone→PC送信

**Goal:** iPhoneで書いたメモ・写真・MermaidをPCに送ると、30秒以内に新規付箋ウィンドウが開く

**Target features:**
- iPhoneからテキスト入力 → 「PCに送る」で付箋がPCに届く
- PCが30秒間隔でDriveをポーリングして自動受信・新規ウィンドウ表示
- iPhone側の送信履歴リスト（最新50件）
- 写真添付（Canvas APIでリサイズ + base64 → Markdown画像）
- Mermaid図のレンダリング（viewer内で描画）

## Requirements

### Validated

- ✓ 新規作成・編集の基本フロー動作
- ✓ 自動保存
- ✓ マルチウィンドウ
- ✓ ピン（常に最前面）
- ✓ リッチテキスト編集（太字・見出し・箇条書き・チェックボックス）
- ✓ 潜在バグの洗い出しと修正 — v1.0
- ✓ Google Drive 連携（Push Subscription保存・note JSON読み書き） — v2.0
- ✓ VAPID署名 + APNs Push通知送信 — v2.0
- ✓ iPhone Safari PWA（Service Worker・通知受信・閲覧） — v2.0
- ✓ PCからの「iPhoneに送る」操作（右クリックメニュー） — v2.0

### Active

- [ ] iPhoneからPC宛に付箋テキストを送信できる（Drive経由）
- [ ] PC側でDriveポーリングして自動受信・新規付箋ウィンドウを開く
- [ ] iPhone送信履歴リストを表示できる
- [ ] 写真をMarkdown画像として送信できる
- [ ] viewer内でMermaid図をレンダリングできる

### Out of Scope

- Android対応 — シングルユーザー・iPhone前提のため当面不要
- ユーザー認証（複数ユーザー） — シングルユーザー前提のため不要

## Context

- **ノートデータ形式**: Markdownファイル（YAML frontmatter付き）
- **現在の保存先**: ローカルファイルシステム
- **Drive利用**: 付箋送信時のみ（fusen_note.json, fusen_push_config.json, vapid_keys.json）
- **Honoは未実装**: 当初計画したがNext.js Route Handlerで十分と判断。既存APIの移植も不要。

## Constraints

- **費用**: ¥0（Vercel無料枠 + Google Drive 15GB + APNs 無料）
- **Tech stack**: 既存 Next.js プロジェクト内に Route Handler を追加（新サーバー不要）
- **シングルユーザー**: 自分だけが使う前提（認証はGoogle OAuth最小構成）

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 最小修正のみ | CLAUDE.md のルール | ✓ Good |
| Hono を使わず Next.js Route Handler のみ | cmake依存・ビルド複雑化を回避 | ✓ Good |
| VAPID処理をRust側で完結 | reqwest + p256 + jsonwebtoken で実現。Hono不要 | ✓ Good |
| Google Drive をデータ中継に使用 | DB不要・費用ゼロ・ファイルがそのままデータ | ✓ Good |
| 既存APIは移植しない | 移植コスト > メリット | ✓ Good |
| reqwest 0.12 を直接指定 | 0.13 は cmake 必須の aws-lc-rs を引き込むため | ✓ Good |
| jsonwebtoken 9 を採用 | cmake不要でES256対応 | ✓ Good |

---
*Last updated: 2026-03-29 after v3.0 milestone started*
