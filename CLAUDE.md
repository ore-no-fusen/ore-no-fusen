# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド

```bash
npm run dev          # 開発サーバー起動（port 3002）
npm test             # ユニットテスト（vitest）
npm run test:watch   # ウォッチモード
npm run test:e2e     # E2Eテスト（要: devサーバー起動済み、port 3003）
npm run lint         # ESLint
npm run tauri dev    # Tauriアプリ起動（デスクトップ）
npm run tauri build  # Tauriビルド
```

単一テスト実行: `npx vitest run app/viewer/__tests__/page.test.tsx`

---

## アーキテクチャ

**デスクトップアプリ（Tauri v2）**
- Frontend: Next.js 14 / React 18（`app/`）
- Backend: Rust（`src-tauri/src/`）
- 通信: `invoke()` で frontend → Rust、`emit()` で Rust → frontend

**iPhone PWA**（`app/viewer/`）
- Google Drive 経由でデータ同期
- Service Worker（`worker/index.js`）が push 受信時に Drive から body + 画像を取得して IndexedDB に保存
- 表示時は IndexedDB のみ参照。Drive は見ない

**データフロー**
```
PC → Drive（notes_to_iphone.json + fusen_img_*.jpg）→ SW が受信・IndexedDB 保存 → Viewer 表示
iPhone → Drive（notes_from_iphone.json + 画像）→ PC が受信・付箋として開く
```

**状態管理の鉄則**
- 唯一の状態は Rust `AppState`
- フロントエンドは state を持たない。変更は必ず Rust 経由

**マルチウィンドウ**
- 各付箋は独立した Tauri window
- 同期は Rust backend + Tauri event 経由のみ

---

## 作業ルール

### 修正前に必ず説明する
1. 不具合の場所
2. 根本原因
3. 影響範囲
4. 最小の修正方法

ユーザーの確認後に修正する。

### 最小修正
- 不要なリファクタリング禁止
- 無関係なコードは変更しない

### 出力ルール
- 結論 → 根拠 → 修正の順
- 調査ログ・思考ログは出力しない

### 調査ルール
主に読む場所: `app/components` `app/hooks` `app/utils` `src-tauri/src`
必要なファイルのみ読む。大量読み込み禁止。

### 設計書の扱い
設計書（`docs/`）は「参考」でなく「仕様」。
- 実装前にシーケンス図の何番に対応するか確認する
- 設計に不明点があれば実装前に確認する（実装しながら修正禁止）

---

## ベテランプログラマの心得

| 原則 | 内容 |
|------|------|
| 一度に一つ変える | 複数変更を同時にしない。原因特定が困難になる |
| 動くコードを壊すな | 変更前に何が動いているか把握する |
| ソースとテストはセット | ソース変更と同時にテストも修正・削除する |
| デッドコードは即削除 | コメントアウトも残さない。履歴は git にある |
| リソースは解放する | DBに保存したら元（Drive等）から削除する |
| 設計書は現実と一致させる | コードが真実。ずれたら即更新 |
| 目的を理解してから動く | 「なぜ」が分かれば「何をすべきか」が見える |
| 推測で実装しない | 分からなければ実装前に確認する |
| YAGNI | 今必要でない機能は作らない |
| DRY | 同じロジックを複数箇所に書かない |
| Fail fast | エラーは早期に検出・報告する |
