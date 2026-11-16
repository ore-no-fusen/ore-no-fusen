---
title: 004 テスト設計
outline: deep
---

# 🧪 004 テスト設計

<p class="lead-text">
テスト戦略・テスト対象一覧・実行方法・カバレッジ外領域
</p>

<p class="version-info">
設計書 v1.8 / 2026-11-17
</p>

---

## 1 テスト戦略（ピラミッド）

3層のテストピラミッドで品質を担保する。下層ほど実行コストが低く数が多い。

<div style="display:flex;flex-direction:column;align-items:center;gap:4px;margin:24px auto;max-width:600px;">
  <div style="width:38%;background:#7c3aed;color:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:6px;font-weight:700;font-size:0.95em;text-align:center;">
    🎭 E2E テスト（Playwright）
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">ブラウザーの実画面 / Tauri・通信はケースごとにモック</span>
  </div>
  <div style="width:64%;background:#2563eb;color:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:6px;font-weight:700;font-size:0.95em;text-align:center;">
    ⚡ ユニットテスト（Vitest）
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">部品・関数 / jsdom 環境</span>
  </div>
  <div style="width:90%;background:#059669;color:#fff;display:flex;flex-direction:column;align-items:center;padding:12px 20px;border-radius:6px;font-weight:700;font-size:0.95em;text-align:center;">
    🦀 Rust ユニットテスト（cargo test）
    <span style="font-size:0.78em;font-weight:400;margin-top:4px;opacity:0.9;">gdrive.rs / webpush.rs / logic.rs 等 / インプロセス</span>
  </div>
</div>

<Note type="info">
<strong>テスト方針：</strong>
ユニットテストは純粋関数・データ変換ロジック・ストレージ操作を対象とする。
E2E テストはブラウザー上で操作シナリオを確認する。Tauri/OS/通信をモックにする試験は、その先の実動作を保証しない。
部品・関数・接続のうち、変更した結果を確認できる必要な試験だけ選ぶ。
</Note>

<div class="test-policy">

<a id="test-policy"></a>

### 1.1 テスト方針：通常は機能単位、全要求・全機能はリリース時

**要求は安定した基準とし、その下の機能が追加・変更・削除される。通常のデグレ試験は変更機能と影響先だけ。全要求に対応する全機能の確認は、固定したリリース候補で1回行う。**

<p class="table-caption">表1.1-1　いつ・どこまで確認するか</p>

|時点|確認する範囲|繰り返さないもの|
|---|---|---|
|機能の修正|変更機能と影響する機能のデグレ。必要なソース単体を選ぶ|無関係な機能・全要求の再試験|
|機能の追加|追加機能と、共通処理などが変わる影響先のデグレ|未変更の既存機能一式|
|機能の削除|残る関連機能・入口・データ契約が壊れていないか|削除した機能の全動作|
|文書・図・文言・余白だけ|差分・対象の表示・参照|アプリ単体・結合・E2E・Rust|
|固定リリース候補|全要求→全機能の対応をたどり、必要な単体・機能・受入を重複除去して全体確認1回|要求用/機能用という名前だけで同じケースを二重実行|
|合格済み同一候補の再開・配布|合格記録・ソース/依存/環境・配布物の一致と、配信先の差を照合|承認待ち・PR・統合・main保存・梱包再開だけを理由にした全体試験|

<p class="table-caption">表1.1-2　要求・機能・ソースとテストの関係</p>

|対象|確認する目的|対応の置き場所|
|---|---|---|
|要求|利用者の目的を満たすか|[機能ツリー第2部](000_FEATURE_TREE.md#requirement-tests)|
|機能|操作から結果まで、その機能が成立するか|[機能ツリー第3部](000_FEATURE_TREE.md#function-tests)|
|ソース|個々の処理・境界・失敗時の不変条件が正しいか|[機能ツリー第4部](000_FEATURE_TREE.md#source-tests)|

要求/機能/ソースは確認の目的であり、テストファイルを別々に増やす区分ではない。同じケースが複数を確認できれば、共通IDで参照して実行は1回にする。結合/E2Eなどの形式と、要求を満たしたかという判定も区別する。

<p class="table-caption">表1.1-3　環境と実機の扱い</p>

|記録すること|決め方|
|---|---|
|テスト環境|ブラウザー/jsdom/Rust/Node/実端末を記載し、OS・通信・保存先のどこがモックかを残す|
|最終実機|OS・iOS・実通信・署名/導入など、変更した未確認部分だけ選ぶ。対象は[機能ツリー第6部](000_FEATURE_TREE.md#test-environments)|
|既存合格|同じ入力・環境で有効な結果は引き継ぐ。未変更の合格操作を本人へ再依頼しない|
|不足|対応ケース/実機結果がないものを見えるように残す。自動スクリプト成功だけで全要求合格としない|

通常修正では機能単位の対象を選ぶ。要求の合格条件や共通契約に影響する変更だけ、その要求の該当シナリオも対象へ足す。要求の条件自体を変える場合は、要求と対応表を更新する。どちらの場合も全要求一式を通常修正の固定セットにしない。

要求・機能・ソースの母集団と対応は[機能ツリー](000_FEATURE_TREE.md)。具体的なコマンド/ケースの入口は開発リポジトリの `docs/TEST_SELECTION_MATRIX.md`。リリース手順 `docs/010_RELEASE.md` は本節を参照し、テスト範囲の別規則を重ねて作らない。

リリース候補の全体合格後にコード・依存・実行環境を変更した場合は、その変更の対象確認後、新しいリリース候補として確認する。対象不明・不足した記録・失敗を合格として扱わない。GitHub Test/MSIX検査は必要時の手動実行、コミット/push/PRだけで全件を起動しない。


</div>

### 1.2 変更の影響に応じて実施する端末確認

AIが実施できるPC実機項目を先に確認し、人間には端末固有・外部通知等の必要項目だけまとめて依頼する。既に合格した機能は影響する変更なしに再依頼しない。以下は対象変更時に選ぶ代表シナリオであり、全項目を毎回行う指示ではない。
異常系は、発生頻度が高いもの・実運用で被害が大きいものだけを必要に応じて追加確認する。

<p class="table-caption">表 1.2-1　変更に応じて選ぶ端末確認</p>

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
E2E テストはPlaywrightでブラウザー上の画面を操作する。PC側の多くはTauri APIをモック化し、PWA/Web側も検証データや模擬通信を使う。実OS/実端末の確認範囲は機能ツリーに分けて記録する。
</Note>

<p class="table-caption">表 3-1　E2E テスト一覧</p>

| No | ファイル | テストシナリオの概要 | 主な検証ポイント |
|:---|:---|:---|:---|
| 1 | `e2e/sticky-note.spec.ts` | 付箋の作成・編集・保存・削除・アーカイブ | 新規付箋作成 → テキスト入力 → 自動保存確認 → ファイルシステムへの書き込み検証 → 削除・アーカイブ動作確認 |
| 2 | `e2e/data-safety.spec.ts` | データ安全性（破損・欠損なし）の確認 | アプリ再起動後のデータ復元 → frontmatter の整合性確認 → アトミック書き込みによる破損防止確認 |
| 3 | `e2e/lock-notification.spec.ts` | ロック画面に表示（通知常駐）機能の動作確認 | Push 受信後の IndexedDB 保存確認 → locked フラグの ON/OFF → pending_open メカニズムの動作確認 |
| 4 | `e2e/pc-to-iphone-image.spec.ts` | PC送信キューの先頭画像をPWAで受信・表示 | `notes_to_iphone.json` と `fusen_img_*` の取得 → IndexedDB保存 → 一覧サムネイル → 本文の画像表示 |

---

## FileDropの受け入れ・回帰確認

**表 FileDrop-1　確認項目と証拠**

| 対象 | 合格条件 |
| --- | --- |
| PWA添付 | PDF選択・元名表示・×解除・本文保護。本文なしも保存可能 |
| 下書き | バイナリのArrayBuffer保存・Blob復元。実IndexedDBで再読込後も添付維持 |
| 送信 | 本文・タグ・宛先・未処理キュー保持。画像・動画・PDF混在と失敗時保持 |
| PC保存 | 元拡張子・バイト列保持、同名連番、排他的作成、サイズ不一致時は作成しない |
| ack・掃除 | 付箋保存失敗ではackしない。files一時名を掃除対象に追加し、未処理参照中を保護 |
| 実機の最初の試験 | ChatGPT作成PDFをiPhoneのファイルへ保存→📎選択→PCへ送る→新付箋→assets/filesの元PDF→本文で保存先確認→Drive一時名削除 |

自動テスト: `FileAttachmentSemantics.test.tsx`、`WriteStep.loss.test.tsx`、Rust `file_drop::tests`、既存PC受信・viewer・worker回帰。実行記録はCURRENT.mdと`my/file-drop/`に保存。iPhone実機試験はブラウザ確認と区別する。

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
# 通常修正：変更したシナリオだけ（隔離Nextサーバーは実行ラッパーが起動）
npm run test:e2e -- e2e/pwa-video-local.spec.ts
# 必要なら実在するケース名でさらに絞る
npm run test:e2e -- e2e/sticky-note.spec.ts --grep '新しい付箋'
```

ブラウザーE2Eのために、別exeや実Tauriアプリを毎回起動する必要はない。実OS/実機試験が必要な条件は機能ツリーの対応欄を参照する。ファイル指定なしの全体実行は固定リリース候補で行う。

### 5.4 リリース候補の合格ゲート

採用分を統合したdevelop候補に対し、§1.1の全体試験結果とMSIX実機結果を記録する。main反映時には同じ入力・同じexeであることを照合する。旧 `do-release` は案内専用であり、現在の正規入口はリリースマシン。運用正本 `docs/010_RELEASE.md` を参照する。

移行前のCIは `docs/CI_MERGE_POLICY.md` に記録した既存条件を満たす。新しい候補合格引継ぎが未実装のまま、旧検査を省略したり未実施を成功表示にしたりしない。

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
| 6 | 1.5 | 26-10-08 | FileDropの選択・復元・汎用送信・連番保存・ack保護・画像動画回帰と最初のiPhone実機受け入れ試験を追加。 |
| 7 | 1.6 | 26-10-28 | 通常開発の全件検査のCI集約、E2E分担と同一入力の統合後検証を追加。 |
| 8 | 1.7 | 26-11-15 | Museと整理した3方針の要求・テスト対応を起点に、通常対象試験・候補全体1回・同一成果物引継ぎの手順へ改定。自動化未移行と全量監査未完了を区別。 |
| 9 | 1.8 | 26-11-17 | 通常は機能単位のデグレ、全要求/全機能はリリース時と明記。要求/機能/ソースの共有ケースと環境/条件付き実機確認を機能ツリーへ接続。E2Eの実際のモック境界と実行方法を訂正。 |

</div>


FileDrop追加確認：Excel（xls/xlsx）、Word（doc/docx）、ZIP、音声（m4a/mp3）を選択し、元名・本文・バイト列を保持して送信・保存できること。MIME型が空でもapplication/octet-streamで扱い、同名連番と送信失敗時保持を維持する。

<style>
.test-policy table { display: table; table-layout: fixed; width: 100%; }
.test-policy table th:first-child, .test-policy table td:first-child { width: 25% !important; min-width: 0 !important; max-width: none !important; white-space: normal !important; padding: 10px !important; text-align: left !important; }
.test-policy td, .test-policy th { overflow-wrap: anywhere; white-space: normal; }
</style>
