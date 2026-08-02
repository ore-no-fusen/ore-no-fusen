---
title: 004 テスト設計
outline: deep
---

# 🧪 004 テスト設計

<p class="lead-text">
テスト戦略・テスト対象一覧・実行方法・カバレッジ外領域
</p>

<p class="version-info">
設計書 v1.3 / 2026-06-05
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
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">13+ ファイル / jsdom 環境</span>
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

### 1.1 リリース回帰テスト方針

リリース前の回帰テストは、確認できる場所ごとに役割を分ける。
PC 開発環境で確認できるものは PC で完結させ、iPhone Push のように develop デプロイと実機が必要なものだけを develop 環境で確認する。
develop 環境で実運用パターンが通ったものを、本番リリース候補とする。

<p class="table-caption">表 1.1-1　リリース回帰テストの分担</p>

| No | 確認場所 | 対象 | 実施者 | リリース判定での扱い |
|:---|:---|:---|:---|:---|
| 1 | PC 開発環境 / リリースCI | Rust / TypeScript の型検査、ユニットテスト、E2E、Tauri用フロントビルド、PC 画面操作、Drive 読み書きの疑似・実行確認 | 開発者 / Codex / GitHub Actions | 原則として毎回必須。手動リリースでは型検査・全ユニットテスト・Tauri用フロントビルド・Rustテストをmain変更前に再実行する |
| 2 | develop 環境 | Vercel 上の API、iPhone PWA、APNs Push、Service Worker、iPhone 実機通知 | 開発者 + 実機を持つ人間 | PC では代替できない範囲だけ確認する。通過後に本番リリース候補とする |
| 3 | production 環境 | 本番デプロイ後の軽い疎通、Cron 実行、重大な設定漏れ確認 | 開発者 | develop で通ったものを本番へ反映した後の最小確認に留める |

<Note type="success">
<strong>基本方針：</strong>
異常系はできるだけ PC 環境の自動テストで確認する。
iPhone 実機テストはコストが高いため、リリースごとに全異常系を人間が再現するのではなく、実運用で最も重要な代表シナリオだけを毎回確認する。
</Note>

### 1.2 毎回人間が実施する実機テスト

人間が毎回実施するテストは、PC 自動テストでは確認できない「実機・外部サービス・通知配信」の代表シナリオに絞る。
異常系は、発生頻度が高いもの・実運用で被害が大きいものだけを必要に応じて追加確認する。

<p class="table-caption">表 1.2-1　リリースごとの人間実機チェック</p>

| No | 確認項目 | 環境 | 手順 | 合格条件 |
|:---|:---|:---|:---|:---|
| 1 | PC から iPhone へ送信できる | develop + iPhone 実機 | PC アプリから iPhone に付箋を 1 件送る | iPhone に通知または PWA 表示が届き、PC 側に APNs 400 / 404 / 410 が出ない |
| 2 | iPhone 再接続後も送信できる | develop + iPhone 実機 | iPhone 連携をつなぎ直した後、PC アプリを再起動せずに付箋を 1 件送る | 送信直前に Drive の `push_devices.json` が再取得され、古い購読キャッシュによる Push 鍵不一致が出ない |
| 3 | iPhone から PC へ送信できる | develop + iPhone 実機 | iPhone PWA から PC 宛に付箋を 1 件送る | PC 側で付箋として開ける |
| 4 | 開発者とのやりとりが表示できる | PC 開発環境または develop | Discord 返信を取り込み、PC アプリの「開発者とのやりとり」で更新する | ユーザー・開発者メッセージが時系列で表示される |
| 5 | 未読マークが確認できる | PC 開発環境 | 管理者ツールのテスト操作、または未読状態を作って右クリックメニューを開く | 右クリックメニューに「新着あり」が表示され、やりとり画面を開くと既読になる |
| 6 | iPhone接続診断が使える | PC 開発環境 | 設定の「iPhone連携」で「接続を診断」を押す | 実Pushを送らずに Drive のPush鍵・端末情報を確認し、問題があれば次の操作を表示する |

<Note type="warning">
<strong>実機テストを増やす条件：</strong>
APNs Push、Service Worker、OAuth、Google Drive 権限、PWA インストール手順を変更した場合は、上記に加えて該当機能の異常系を 1 回だけ追加確認する。
変更していない領域の異常系を、リリースのたびに人間が毎回再現する必要はない。
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
| 5 | `app/viewer/__tests__/VideoAttachmentSemantics.test.tsx` | <span class="badge badge-vitest">Vitest</span> | VideoDrop 添付セマンティクス | 動画選択時に本文を上書きしない、複数動画を `videos[]` として保持する、送信後に送信済み表示へ反映する |
| 6 | `app/viewer/__tests__/WriteStep.loss.test.tsx` | <span class="badge badge-vitest">Vitest</span> | PWA 編集画面のデータ安全性 | ユーザーが入力した本文・1行目・添付情報が保存/送信過程で失われないこと |

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
| 4 | `e2e/pc-to-iphone-image.spec.ts` | PC送信キューの先頭画像をPWAで受信・表示 | `notes_to_iphone.json` と `fusen_img_*` の取得 → IndexedDB保存 → 一覧サムネイル → 本文の画像表示 |

---

## 4 データロスト防止ゲート

付箋アプリでは、ユーザーが入力した1文字を失うことが最重大障害である。
ソース修正後は、リリース前に以下の順で確認する。

<p class="table-caption">表 4-1　データロスト防止ゲート</p>

| No | 確認項目 | 実行コマンド / 観点 |
|:---|:---|:---|
| 1 | 型検査 | `npx tsc --noEmit --pretty false` |
| 2 | PWA 本文保護 | `npm test -- WriteStep.loss` |
| 3 | VideoDrop 添付仕様 | `npm test -- VideoAttachmentSemantics` |
| 4 | 全ユニットテスト | `npm test` |
| 5 | Rust 側受信処理 | `cargo check` |
| 6 | 本番ビルド | `npm run build` |

<Note type="warning">
<strong>禁止事項：</strong>添付ファイル名、Drive 一時ファイル名、PC 保存パスを、ユーザーが入力した本文やタイトルの代わりとして上書きしてはならない。
画像・動画・音声などの添付は、本文とは別の部品として扱う。
</Note>

---

## 5 テスト実行方法

### 5.1 フロントエンド ユニットテスト（Vitest）

```bash
# 全ユニットテストを実行（一回実行）
npm run test
# ウォッチモード（開発中）
npx vitest
# カバレッジレポート付き
npx vitest run --coverage
```

### 5.2 Rust バックエンド ユニットテスト（cargo test）

```bash
# Rust ユニットテストを実行
cd src-tauri
cargo test
```

### 5.3 E2E テスト（Playwright）

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

### 5.4 手動リリースの自動ゲート

`.github/workflows/do-release.yml` の `verify-release` は、`main` の変更前に次を順番に実行する。

1. `npm ci`
2. `npx tsc --noEmit --pretty false`
3. `npm test`
4. `npm run build:tauri`
5. `cargo test --locked --lib`

いずれかが失敗した場合はバージョン更新・`main`へのマージ・Storeパッケージ作成へ進まない。E2Eと外部サービスの実機確認は引き続き表1.1-1の分担で行う。

---

## 6 カバレッジ外の領域

現時点でテストが存在しない・または困難な領域。今後のリスクとして認識しておくべき箇所。

<p class="table-caption">表 6-1　カバレッジ外領域一覧</p>

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

## 7 改版履歴

<div class="history-table">
<p class="table-caption">表 7-1　改版履歴</p>

| No | バージョン | 日付 | 変更内容 |
|:---|:---|:---|:---|
| 1 | 1.0 | 26-04-20 | 新規作成。テスト戦略・ユニットテスト一覧（11ファイル）・E2E一覧（3ファイル）・実行方法・カバレッジ外領域を整理。 |
| 2 | 1.1 | 26-04-24 | テストピラミッドを TestPyramid コンポーネント（3色ブロック）に変更。 |
| 3 | 1.2 | 26-05-25 | VideoDrop と PWA 本文保護のテストを追加。データロスト防止ゲートを新設し、ソース修正後の必須確認順を明記。 |
| 4 | 1.3 | 26-06-05 | リリース回帰テスト方針を追加。PC 開発環境・develop 環境・production 環境の分担と、人間が毎回実施する実機チェック、iPhone接続診断の確認観点を明記。 |
| 5 | 1.4 | 26-07-31 | 手動リリースでmainを変更する前に、型検査・全ユニットテスト・Tauri用フロントビルド・Rustテストを必須とする自動ゲートを追加。 |

</div>
