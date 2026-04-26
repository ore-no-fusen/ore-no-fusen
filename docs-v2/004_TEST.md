---
title: 004 テスト設計
outline: deep
---

# 🧪 004 テスト設計

<p class="lead-text">
テスト戦略・テスト対象一覧・実行方法・カバレッジ外領域
</p>

<p class="version-info">
設計書 v1.0 / 2026-04-20
</p>

---

## 1 テスト戦略（ピラミッド）

3層のテストピラミッドで品質を担保する。下層ほど実行コストが低く数が多い。

<div style="display:flex;flex-direction:column;align-items:center;gap:4px;margin:24px auto;max-width:600px;">
  <div style="width:38%;background:#7c3aed;color:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:6px;font-weight:700;font-size:0.95em;text-align:center;">
    🎭 E2E テスト（Playwright）
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">3 ファイル / ブラウザ + Tauri 実アプリ</span>
  </div>
  <div style="width:64%;background:#2563eb;color:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:6px;font-weight:700;font-size:0.95em;text-align:center;">
    ⚡ ユニットテスト（Vitest）
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">11 ファイル / jsdom 環境</span>
  </div>
  <div style="width:90%;background:#059669;color:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:6px;font-weight:700;font-size:0.95em;text-align:center;">
    🦀 Rust ユニットテスト（cargo test）
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">gdrive.rs / webpush.rs / logic.rs 等 / インプロセス</span>
  </div>
</div>

<Note type="info">
<strong>テスト方針：</strong>
ユニットテストは純粋関数・データ変換ロジック・ストレージ操作を対象とする。
E2E テストはユーザー操作シナリオを実際のアプリで検証する。
フロントエンドの UI コンポーネント単体テストは現状では最小限に留める。
</Note>

---

## 2 ユニットテスト一覧（Vitest）

### 2.1 PC アプリ側

<p class="table-caption">表 2.1-1　PC アプリ側ユニットテスト一覧</p>

| No | ファイル | 種別 | テスト対象 | 主なテスト内容 |
|:---|:---|:---|:---|:---|
| 1 | `app/components/StickyNote.test.tsx` | <span class="badge badge-vitest">Vitest</span> | 付箋ウィンドウ（StickyNote.tsx） | レンダリング・モード切り替え・保存トリガー・アラームチェック等 |
| 2 | `app/hooks/useStickyNoteContextMenu.test.ts` | <span class="badge badge-vitest">Vitest</span> | 右クリックメニューフック | メニュー項目の生成ロジック |
| 3 | `app/utils/checkboxToggle.test.ts` | <span class="badge badge-vitest">Vitest</span> | チェックボックストグルユーティリティ | `[ ]` ↔ `[x]` のトグル処理・Markdown 変換 |
| 4 | `app/utils/splitFrontMatter.test.ts` | <span class="badge badge-vitest">Vitest</span> | Frontmatter パーサー | YAML frontmatter の分離・パース・再組み立て |
| 5 | `lib/i18n.test.ts` | <span class="badge badge-vitest">Vitest</span> | 国際化（i18n） | 日本語・英語キーの解決・フォールバック |
| 6 | `lib/settings-store.test.ts` | <span class="badge badge-vitest">Vitest</span> | 設定ストア | 設定の読み書き・デフォルト値 |
| 7 | `lib/utils.test.ts` | <span class="badge badge-vitest">Vitest</span> | 汎用ユーティリティ | 文字列サニタイズ・日時フォーマット等 |

### 2.2 iPhone PWA 側

<p class="table-caption">表 2.2-1　iPhone PWA 側ユニットテスト一覧</p>

| No | ファイル | 種別 | テスト対象 | 主なテスト内容 |
|:---|:---|:---|:---|:---|
| 1 | `app/viewer/lib/drive.test.ts` | <span class="badge badge-vitest">Vitest</span> | Drive API ラッパー（drive.ts） | アップロード・ダウンロード・削除の正常系・エラー系 |
| 2 | `app/viewer/lib/indexeddb.test.ts` | <span class="badge badge-vitest">Vitest</span> | IndexedDB 操作（indexeddb.ts） | saveDraft / loadDraft / loadAllDrafts / deleteDraft の CRUD 確認 |
| 3 | `app/viewer/__tests__/page.test.tsx` | <span class="badge badge-vitest">Vitest</span> | iPhone PWA ページ（viewer/page.tsx） | 画像変換（hydrateEditor/serializeEditor）・チェックボックス変換・タグ永続化・Mermaid ブロック変換 |
| 4 | `app/viewer/viewer.test.tsx` | <span class="badge badge-vitest">Vitest</span> | Viewer コンポーネント全体 | ステップ遷移・初期化フロー・リスト/ライトモード切り替え |

### 2.3 Rust バックエンド（cargo test）

Rust ユニットテスト（各 `.rs` ファイルの `#[cfg(test)]` モジュール）

<p class="table-caption">表 2.3-1　Rust バックエンドユニットテスト一覧</p>

| No | ファイル | 種別 | 主なテスト内容 |
|:---|:---|:---|:---|
| 1 | `src-tauri/src/gdrive.rs` | <span class="badge badge-rust">cargo test</span> | トークンパスの検証・PushConfigJson のパース確認 |
| 2 | `src-tauri/src/webpush.rs` | <span class="badge badge-rust">cargo test</span> | VAPID 鍵生成・JWT 署名・AES-128-GCM 暗号化の正常動作確認 |

---

## 3 E2Eテスト一覧（Playwright）

<Note type="info">
E2E テストは Playwright で実際の Tauri アプリを起動して操作する。テスト実行には開発ビルドが必要。
</Note>

<p class="table-caption">表 3-1　E2E テスト一覧</p>

| No | ファイル | テストシナリオの概要 | 主な検証ポイント |
|:---|:---|:---|:---|
| 1 | `e2e/sticky-note.spec.ts` | 付箋の作成・編集・保存・削除・アーカイブ | 新規付箋作成 → テキスト入力 → 自動保存確認 → ファイルシステムへの書き込み検証 → 削除・アーカイブ動作確認 |
| 2 | `e2e/data-safety.spec.ts` | データ安全性（破損・欠損なし）の確認 | アプリ再起動後のデータ復元 → frontmatter の整合性確認 → アトミック書き込みによる破損防止確認 |
| 3 | `e2e/lock-notification.spec.ts` | ロック画面に表示（通知常駐）機能の動作確認 | Push 受信後の IndexedDB 保存確認 → locked フラグの ON/OFF → pending_open メカニズムの動作確認 |

---

## 4 テスト実行方法

### 4.1 フロントエンド ユニットテスト（Vitest）

```bash
# 全ユニットテストを実行（一回実行）
npm run test

# ウォッチモード（開発中）
npx vitest

# カバレッジレポート付き
npx vitest run --coverage
```

### 4.2 Rust バックエンド ユニットテスト（cargo test）

```bash
# Rust ユニットテストを実行
cd src-tauri
cargo test
```

### 4.3 E2E テスト（Playwright）

```bash
# E2E テストを実行（Tauri アプリのビルドが必要）
npx playwright test

# 特定ファイルのみ実行
npx playwright test e2e/sticky-note.spec.ts

# UI モードで実行（デバッグ用）
npx playwright test --ui
```

<Note type="warning">
<strong>注意：</strong> E2E テストは <code>npm run tauri dev</code> が起動中でないと実行できない場合がある。
CI での実行は未整備（ローカル手動実行のみ）。
</Note>

---

## 5 カバレッジ外の領域

現時点でテストが存在しない・または困難な領域。今後のリスクとして認識しておくべき箇所。

<p class="table-caption">表 5-1　カバレッジ外領域一覧</p>

| No | 領域 | カバレッジ外の理由 | リスク |
|:---|:---|:---|:---|
| 1 | Rust ロジック層（`logic.rs` / `storage.rs`） | ファイルシステム操作が絡むため逃げにくい。Tauri 環境依存が強い | リネーム・アーカイブ・削除のバグが本番環境でしか発覚しない |
| 2 | Service Worker の Push 受信フロー | 実際の APNs / FCM を介した Push は自動テスト困難 | Push 受信・IndexedDB 保存・通知表示の組み合わせバグが検出できない |
| 3 | マルチウィンドウ間の状態同期 | 複数の Tauri WebviewWindow を扱う E2E テストはセットアップが複雑 | 付箋間の emit/listen によるデータ競合が検出できない |
| 4 | Google OAuth フロー全体 | 外部サービス（Google）への依存があるため自動テスト不可 | 認証フローの変更時にリグレッションが発覚しにくい |
| 5 | iPhone 実機での UI 動作 | iOS Safari の実機が必要。シミュレーター環境の整備が必要 | iOS 固有のバグ（notificationclick 未発火等）が手動テストのみ |

<Note type="success">
<strong>改善方針：</strong>
<code>logic.rs</code> / <code>storage.rs</code> のビジネスロジックは副作用を分離する DOD + Effect パターンを採用しているため、
純粋関数部分から順にユニットテストを追加できる。優先度は高い。
</Note>

---

## 6 改版履歴

<div class="history-table">
<p class="table-caption">表 6-1　改版履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 26-04-20 | 新規作成。テスト戦略・ユニットテスト一覧（11ファイル）・E2E一覧（3ファイル）・実行方法・カバレッジ外領域を整理。 |
| 2 | 1.1 | 26-04-24 | テストピラミッドを TestPyramid コンポーネント（3色ブロック）に変更。 |

</div>
