# FileDrop 実装計画・テスト設計

日付: 2026-10-08。作業場所: `.w/ファイル添付`、ブランチ: `codex/file-drop`（ローカルdevelop 9a5f1dd3から作成）。今回の範囲は計画、設計書、ソース、テスト、主要キャプチャまで。統合・push・配布は行わない。

## 目的と調査結果

iPhone「ファイル」内のPDFを、write画面から付箋に添付して既存Drive経由でPCへ送る。VideoDropのWriteStep → useBackgroundSend → notes_from_iphone.json → Rust poll → React付箋作成 → ackの経路を再利用する。本文・元名・一時名・保存先を分離する。

`useAutoSave` / `useVisibilitySave`、通知復帰、一覧からの再編集、送信前バックアップも対象。FileDropではiOS向けArrayBufferを保存し、Blobへ復元する。Service WorkerのPC→iPhone受信は既存レコードをspreadしておりfilesを維持するため、送信方向を広げる変更は不要。

## 実装方針

1. `FileAttachment` / `DraftFileAttachment` / PendingHydrateにfilesを追加。PDF選択・元名一覧・解除を追加し、本文は変更しない。添付・解除を即時保存する。
2. Driveの汎用multipartと自動更新を追加。添付成功後だけキューにfilesを追加。元名とは別にUUIDを含むfusen_file一時名を生成する。
3. Rustでメタデータとサイズを検査し、Vault内assets/filesに排他的create_newで保存。元の拡張子と日本語名を保持し、衝突時は_2、_3。Windows予約名・パス注入・Vault外リンクを防ぐ。
4. 全FileDrop保存成功後だけ受信イベントを出し、既存付箋保存成功後のackで一時名を削除。一時掃除はキュー参照中を保護する。
5. 003_IPHONE、006_ARCHITECTURE、004_TEST、用語・プライバシー文書を整合させる。

## テスト設計

| 対象 | 利用者から見える結果・不変条件 |
| --- | --- |
| 選択・解除 | PDF選択で元名を表示。本文なしでも即時保存。×解除後も本文を維持し、files=[]を保存 |
| 対象外・取消 | ZIP選択を拒否。選択取消は既存添付を変えない |
| 送信 | 本文・タグ・targetPcId・既存未処理項目を保持。画像・動画・PDFを同一付箋で送信 |
| 失敗 | IndexedDB・アップロード・キュー読込の失敗は本文・添付を消さない。キュー読込失敗は上書きしない |
| 復元 | 実IndexedDBでArrayBufferを保存し、一覧・再読込でPDF名とバイト列を復元。本文編集の自動保存でも添付を維持 |
| PC保存 | 元の拡張子・バイト列・日本語名を維持。同名は連番で既存ファイル不変。サイズ不一致はファイルを作らない |
| 保護 | 不正メタデータは受信を中止。Windows予約名・パスを安全化。未処理キュー参照の一時ファイルを掃除しない |
| ack | 付箋作成成功後だけack。作成失敗ではackしない既存PC受信テストを実行 |
| 回帰 | viewer全体とworker既存テスト、Rust受信ルーティング、画像・動画保存テスト、型検査、対象Lint |

## 最初の受け入れ試験（iPhone実機・未実施）

ChatGPTで作成したPDFをiPhoneのファイルに保存 → 俺の付箋PWAで📎を押す → PDFを選択 → PCへ送る → PCに新しい付箋が現れる → assets/files/に元PDFが保存される → 付箋から保存先が分かる → Driveの一時ファイルが削除される。

同名再送、本文なし、本文・タグあり、画像・動画との混在、宛先PC以外で受信されない、Drive切断、Vault書込不可も実機確認する。自動テストとブラウザ確認はこのiPhone実機試験の代替ではない。

## 結果と証拠

実行結果は`my/file-drop/`に保存し、完了時にCURRENT.mdへ集約する。主要キャプチャは実際のローカルPWA画面・VitePressのMarkdownレンダーとMermaidで描画した設計書・実行ログから作成した結果表とし、実機の結果と混同しない。

- Vitest: viewer・worker・PC受信/返送の20ファイル133件成功。
- Rust: FileDrop/一時掃除/VideoDrop互換8件、iPhone関連26件、合計34件成功。`cargo check --lib --offline`成功（既存save_annotated_imageのdead_code警告1件）。認証用コンパイル設定は検証用のダミー値。
- TypeScript、変更対象Lint、git diff --check成功。
- Chrome実PWA: PDF選択/本文保護、実IndexedDBへの全バイト保存、通知URLからの再読込復元、×解除、multipart/JSON送信と送信後リセットの5項目成功。Google Drive APIは模擬。
- 設計書ソース: VitePressのMarkdownレンダー＋Mermaidで2列の表・3参加者の図を描画し、1280px/390px表示を確認。VitePressサイト全体は既存@docsearch/css不足で未確認。依存追加をしていない。
- キャプチャ: `my/file-drop/test-results.png`、`pwa-pdf.png`、`pwa-sent.png`、`design-data.png`、`design-sequence.png`、`design-mobile.png`。結果表の元データは`results.json`と各実行ログ。
- 統合・push・配布なし。iPhone実機の最初の受け入れ試験は未実施。
