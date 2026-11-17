---
pageClass: test-traceability-list-page
---

# 要求・機能・ソースとテストの一覧

<div class="test-traceability-list">

番号は「要求ID → 要求ID.機能番号 → 要求ID.機能番号.ソース番号」。例：1-1 → 1-1.1 → 1-1.1.1。補助A/Bは要求の対応が未確認のため別番号とする。

不足＝対応テストを確認できていない。部分的なテストは不足範囲を併記。同じテストは共用。`.test.ts` / `.spec.ts`等はテストファイル。Rustは実装と同じ`.rs`内にテストを持つため「内のテスト」と表示。実行結果の一覧ではない。


## 要求1-1　思いついた瞬間に、書ける状態になっていてほしい

表1-1：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-1|要求|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：新規メモへの入力<br>確認範囲：一部：ブラウザーの表示/入力。実OSキー/プール昇格/応答時間は不足|
|1-1.1|↳ 機能|プールウィンドウ方式|[app/components/StickyNote.pool.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.pool.test.tsx)<br>概要：初回入力・プール解放<br>確認範囲：一部。実OSの昇格/フォーカス/待ち時間は未確認|
|1-1.1.1|　↳ ソース|[app/utils/invisibleNotePool.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/invisibleNotePool.ts)|[app/utils/invisibleNotePool.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/invisibleNotePool.test.ts#L5)<br>概要：準備済み・未使用の窓を選び、なければ通常作成に切り替える。|
|1-1.1.2|　↳ ソース|[app/utils/freshRequestQueue.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/freshRequestQueue.ts)|[app/utils/freshRequestQueue.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/freshRequestQueue.test.ts#L5)<br>概要：作成要求を受付順に処理し、1.5秒を過ぎた要求と上限4件超を除外する。|
|1-1.2|↳ 機能|グローバルホットキー Ctrl+N|**不足：対応テスト未確認**<br>確認範囲：不足。OSキー→新規窓の通し確認は別途必要|
|1-1.2.1|　↳ ソース|[src-tauri/src/hotkey_manager.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/hotkey_manager.rs)|[src-tauri/src/hotkey_manager.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/hotkey_manager.rs#L722)<br>概要：予約済みキーの拒否、設定の読込・保存、無効設定の保持を確認する。|
|1-1.2.2|　↳ ソース|[app/utils/shortcutKey.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/shortcutKey.ts)|[app/utils/shortcutKey.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/shortcutKey.test.ts#L21)<br>概要：押したキーと設定の一致・重複・表示を確認し、Ctrlだけ・文字だけの入力を除外する。|
|1-1.3|↳ 機能|Ctrl 2回押し／Shift 2回押しトリガー|**不足：対応テスト未確認**<br>確認範囲：不足。判定関数の単体はあるが実フック→窓は未確認|
|1-1.3.1|　↳ ソース|[src-tauri/src/double_tap.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/double_tap.rs)|[src-tauri/src/double_tap.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/double_tap.rs#L499)<br>概要：2回押しを検知し、時間切れ・他キー併用・押し続け・3回押しでの誤作動を防ぐ。|
|1-1.4|↳ 機能|システムトレイ常駐＋トレイメニュー「新規メモ」|**不足：対応テスト未確認**<br>確認範囲：不足。メニュー文字列の単体と実作成を区別|
|1-1.4.1|　↳ ソース|[src-tauri/src/tray.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/tray.rs)|[src-tauri/src/tray.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/tray.rs#L421)<br>概要：トレイメニューに設定済みのキーと起動方法を正しく表示する。|
|1-1.5|↳ 機能|付箋上の「＋」ボタン／右クリック「新規メモ」|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：新規メモへの入力<br>確認範囲：一部。既存E2Eは新規URLを開くため＋/右クリック起点と実位置は未確認|
|1-1.5.1|　↳ ソース|[app/utils/newNotePosition.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/newNotePosition.ts)|[app/utils/newNotePosition.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/newNotePosition.test.ts#L12)<br>概要：カーソルのある画面を選び、倍率・負座標を考慮して付箋を画面内に配置する。|
|1-1.5.2|　↳ ソース|[app/hooks/useStickyNoteContextMenu.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.ts)|[app/hooks/useStickyNoteContextMenu.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.test.ts#L41)<br>概要：タグ・操作キー表示などのメニュー補助を確認する。新規作成を押して開く専用テストは不足。|
|1-1.6|↳ 機能|自動起動|**不足：対応テスト未確認**<br>確認範囲：不足。設定移行の単体はあるがOSログイン受入は未確認|
|1-1.6.1|　↳ ソース|[src-tauri/src/distribution.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/distribution.rs)|[src-tauri/src/distribution.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/distribution.rs#L60)<br>概要：旧自動起動設定を一度だけ無効化する移行を確認する。OSログイン時の自動起動は対象外。|

## 要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい

表1-2：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-2|要求|要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい|[app/components/StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx)<br>[e2e/pc-to-iphone-image.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pc-to-iphone-image.spec.ts)<br>概要：ドロップ保存呼出・拒否・PWA受信画像の表示<br>確認範囲：一部：ドロップ部品と受信画像。実OSキャプチャ/クリップボードからの通しは不足|
|1-2.1|↳ 機能|画面キャプチャ|**不足：対応テスト未確認**<br>確認範囲：不足。capture.rsの専用分岐試験なし。実OS撮影/キャンセル確認が必要|
|1-2.1.1|　↳ ソース|[src-tauri/src/capture.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/capture.rs)|**不足：専用ソーステスト未確認**|
|1-2.2|↳ 機能|クリップボード画像の貼り付け|**不足：対応テスト未確認**<br>確認範囲：不足。挿入位置/保存の単体はあるが実クリップボード→保存→表示の全体は未確認|
|1-2.2.1|　↳ ソース|[app/components/RichTextEditor.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/RichTextEditor.tsx)|[app/components/RichTextEditor.imagePaste.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/RichTextEditor.imagePaste.test.ts#L15)<br>概要：画像の次を入力位置にし、保存待ち画像の即時表示と画像クリック時の編集終了を確認する。|
|1-2.2.2|　↳ ソース|[src-tauri/src/clipboard.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/clipboard.rs)|[src-tauri/src/clipboard.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/clipboard.rs#L386)<br>概要：画像保存・ドロップの正常系と非対応入力の拒否を確認する。|
|1-2.3|↳ 機能|エディタへの画像ドロップ貼り付け|[app/components/StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx)<br>概要：ドロップ保存呼出・拒否<br>確認範囲：一部。保存呼出はモック。実Explorerとファイル書込は別|
|1-2.3.1|　↳ ソース|[app/utils/droppedImage.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/droppedImage.ts)|[app/utils/droppedImage.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/droppedImage.test.ts#L9)<br>概要：対応する画像だけを受け付け、指定位置または本文末尾へ挿入し、不正位置でも本文を失わない。|
|1-2.3.2|　↳ ソース|[src-tauri/src/clipboard.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/clipboard.rs)|[src-tauri/src/clipboard.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/clipboard.rs#L386)<br>概要：画像保存・ドロップの正常系と非対応入力の拒否を確認する。|

## 要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）

表1-3：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-3|要求|要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>[e2e/pwa-recovery.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-recovery.spec.ts)<br>[app/hooks/useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx)<br>概要：編集終了→保存呼出・PWA再起動・オフライン復元・保存成功/失敗・直列化<br>確認範囲：一部：PC側は保存モック、PWAは検証データ。PC終了後の実ディスク復元は不足|
|1-3.1|↳ 機能|変更の自動保存|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>[app/hooks/useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx)<br>概要：編集終了→保存呼出・保存成功/失敗・直列化<br>確認範囲：一部。実ディスク保存・終了後復元の通し確認は別|
|1-3.1.1|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1514)<br>概要：条件付き保存で新しい本文を上書きせず、新しい復旧草稿だけを使い、成功後に草稿を消せることを確認する。|
|1-3.1.2|　↳ ソース|[src-tauri/src/logic.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs)|[src-tauri/src/logic.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs#L1168)<br>概要：改名後の遅い保存で旧名を再作成せず、属性更新でも本文を保持する。|
|1-3.2|↳ 機能|明示保存 Ctrl+S|[app/hooks/useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx)<br>概要：保存成功/失敗・直列化<br>確認範囲：一部。共通保存経路まで。Ctrl+S起点の専用ケースは未同定|
|1-3.2.1|　↳ ソース|[app/hooks/useNoteFile.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.ts)|[app/hooks/useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx#L17)<br>概要：保存成功・失敗を正しく返し、重なる保存を順序化して改名後の場所へ保存する。|

## 要求1-4　ファイル名を考えたくない

表1-4：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-4|要求|要求1-4　ファイル名を考えたくない|**不足：対応テスト未確認**<br>確認範囲：不足：命名/改名の単体はあるが利用者操作からの受入がない|
|1-4.1|↳ 機能|ファイル名の自動生成|**不足：対応テスト未確認**<br>確認範囲：不足。生成/保存の単体をつないだ新規作成の確認が必要|
|1-4.1.1|　↳ ソース|[src-tauri/src/logic.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs)|[src-tauri/src/logic.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs#L1111)<br>概要：本文から名前を作り、禁止文字を除き、日本語・連番を含むファイル名を生成する。|
|1-4.1.2|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1845)<br>概要：既存ファイルから次の連番を求め、新しい付箋ファイルを作る。|
|1-4.2|↳ 機能|ファイル名の本文連動|[app/hooks/useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx)<br>概要：保存成功/失敗・直列化<br>確認範囲：一部。遅延保存の呼出順を確認。実ファイルの改名・再起動は別|
|1-4.2.1|　↳ ソース|[src-tauri/src/logic.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs)|[src-tauri/src/logic.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/logic.rs#L1161)<br>概要：画像から始まる本文でも名前用の行を選び、改名後の遅い保存で旧名を復活させない。|
|1-4.2.2|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1526)<br>概要：ファイルの改名、存在しない元ファイルの拒否、古い内容や既存の改名先の保護を確認する。|

## 要求1-5　保存場所は自分で決めたい

表1-5：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-5|要求|要求1-5　保存場所は自分で決めたい|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：保存先を表示<br>確認範囲：一部：現在の場所の表示だけ。初回選択と実保存/切替利用は不足|
|1-5.1|↳ 機能|初回セットアップで保存先（Vault）を選択|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：保存先を表示<br>確認範囲：一部。既存E2Eは現在の保存先表示のみ。初回選択→実保存は未確認|
|1-5.1.1|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1879)<br>概要：通常の保存先を受け付け、危険・不存在・ファイル自体の指定を拒否する。初回画面の操作は対象外。|
|1-5.1.2|　↳ ソース|[lib/settings-store.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.ts)|[lib/settings-store.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.test.ts#L43)<br>概要：初期設定と保存済み設定を読み、設定変更を端末保存へ反映する。|

## 要求1-6　手が離せないときは、声で送りたい

表1-6：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-6|要求|要求1-6　手が離せないときは、声で送りたい（未完成）|**不足：対応テスト未確認**<br>確認範囲：不足：実Siri→中継→PC表示の受入がない。API単体で代替しない|
|1-6.1|↳ 機能|Siri から PC に付箋を送る|**不足：対応テスト未確認**<br>確認範囲：不足。API拒否/制限の単体だけで実Siri→PC到着を保証しない|
|1-6.1.1|　↳ ソース|[app/api/siri-send/route.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/api/siri-send/route.ts)|[app/api/siri-send/route.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/api/siri-send/route.test.ts#L18)<br>概要：大きすぎる送信要求と長すぎる本文を拒否し、Google通信の待ち時間を制限する。|

## 要求2-1　大事な一文を、ひと目で目立たせたい

表2-1：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|2-1|要求|要求2-1　大事な一文を、ひと目で目立たせたい|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>[e2e/pwa-bold.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-bold.spec.ts)<br>概要：PCの太字操作・PWA赤文字・再表示<br>確認範囲：一部：PCの書式操作/PWAの赤色と保持。全端末/実配送ではない|
|2-1.1|↳ 機能|太字の朱表示|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：PCの太字操作<br>確認範囲：一部。PC E2Eは書式操作を確認。PC赤色の視認条件までの専用assertは未同定|
|2-1.1.1|　↳ ソース|[app/components/MarkdownRenderer.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/MarkdownRenderer.tsx)|[app/components/__tests__/MarkdownRenderer.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/__tests__/MarkdownRenderer.test.tsx#L127)<br>概要：同ファイルには見出し・折りたたみの表示試験があるが、PCの赤い太字を直接確認する専用ケースは未確認。|
|2-1.2|↳ 機能|フローティングフォーマットバー|[app/components/FloatingFormatBar.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/FloatingFormatBar.test.tsx)<br>[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：選択バーのボタン呼出・PCの太字操作<br>確認範囲：一部。部品の呼出と太字操作。全ボタン/配置の実操作一式ではない|
|2-1.2.1|　↳ ソース|[app/components/FloatingFormatBar.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/FloatingFormatBar.tsx)|[app/components/FloatingFormatBar.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/FloatingFormatBar.test.tsx#L21)<br>概要：書式ボタン・言語・配置を表示し、押したボタンの処理だけを呼ぶ。|
|2-1.3|↳ 機能|編集用ホットキー|[e2e/hotkey-disable.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/hotkey-disable.spec.ts)<br>概要：編集キー変更・失敗復帰<br>確認範囲：ブラウザーの編集キー範囲。全OSキー登録の保証ではない|
|2-1.3.1|　↳ ソース|[app/utils/shortcutKey.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/shortcutKey.ts)|[app/utils/shortcutKey.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/shortcutKey.test.ts#L21)<br>概要：押したキーと設定の一致・重複・表示を確認し、Ctrlだけ・文字だけの入力を除外する。|
|2-1.3.2|　↳ ソース|[src-tauri/src/hotkey_manager.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/hotkey_manager.rs)|[src-tauri/src/hotkey_manager.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/hotkey_manager.rs#L722)<br>概要：予約済みキーの拒否、設定の読込・保存、無効設定の保持を確認する。|
|2-1.4|↳ 機能|PWAの強調表示|[e2e/pwa-bold.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-bold.spec.ts)<br>概要：PWA赤文字・再表示<br>確認範囲：受信相当データによるブラウザー確認。実PC配送/実iOSは別|
|2-1.4.1|　↳ ソース|[app/viewer/NoteListStep.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/NoteListStep.tsx)|[app/viewer/NoteListStep.rendering.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/NoteListStep.rendering.test.tsx#L9)<br>概要：太字を赤く表示し、編集・保存でも強調記号を保持してHTMLを実行しない。|

## 要求2-2　画像に、そのまま書き込みたい

表2-2：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|2-2|要求|要求2-2　画像に、そのまま書き込みたい|**不足：対応テスト未確認**<br>確認範囲：不足：計算/履歴/再表示部品だけでは、描く→実保存→再表示の受入にならない|
|2-2.1|↳ 機能|画像への描き込み|[app/components/ResizableImage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.test.tsx)<br>概要：保存済み画像の再表示<br>確認範囲：一部。保存済み画像の読込部品まで。描画→合成保存→再表示は不足|
|2-2.1.1|　↳ ソース|[app/components/ImageAnnotationModal.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ImageAnnotationModal.tsx)|[app/components/ImageAnnotationModal.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ImageAnnotationModal.test.ts#L5)<br>概要：描画の初期設定・窓サイズ・画像出力完了待ち・空画像の拒否を確認する。|
|2-2.1.2|　↳ ソース|[app/utils/annotationHistory.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/annotationHistory.ts)|[app/utils/annotationHistory.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/annotationHistory.test.ts#L8)<br>概要：描画を操作順に取り消し・やり直しし、新規描画と終了時に履歴を整理する。|
|2-2.2|↳ 機能|トリミング|[app/components/ResizableImage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.test.tsx)<br>概要：保存済み画像の再表示<br>確認範囲：一部。矩形計算と再表示寸法はあるが操作から実保存まで不足|
|2-2.2.1|　↳ ソース|[app/utils/imageCrop.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/imageCrop.ts)|[app/utils/imageCrop.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/imageCrop.test.ts#L5)<br>概要：逆向き選択、細すぎる範囲の拒否、縮尺から元画像の切取範囲への変換を確認する。|
|2-2.2.2|　↳ ソース|[app/utils/fitCroppedNote.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/fitCroppedNote.ts)|[app/utils/fitCroppedNote.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/fitCroppedNote.test.ts#L6)<br>概要：切取後の画像と窓を余白なく縮め、本文・表示倍率・画面内サイズを守る。|
|2-2.3|↳ 機能|画像の表示サイズ変更|[app/components/ResizableImage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.test.tsx)<br>概要：保存済み画像の再表示<br>確認範囲：一部。倍率を渡した再表示まで。ドラッグ→倍率保存の全体は別|
|2-2.3.1|　↳ ソース|[app/components/ResizableImage.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.tsx)|[app/components/ResizableImage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ResizableImage.test.tsx#L34)<br>概要：加工後の画像を再読込し、保存した寸法・倍率を反映する。読込失敗時は元の記法を表示する。|

## 要求2-3　畳んでも、項目（見出し）は見えていてほしい

表2-3：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|2-3|要求|要求2-3　畳んでも、項目（見出し）は見えていてほしい|[e2e/editor-outline.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/editor-outline.spec.ts)<br>概要：編集/表示の折畳保持<br>確認範囲：一部：本文の部分折りたたみ。窓全体の折りたたみ/再起動保持は不足|
|2-3.1|↳ 機能|付箋全体の折りたたみ（△／▽）|[app/components/StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx)<br>概要：本文展開・状態保存呼出<br>確認範囲：一部。展開と保存呼出のみ。実窓縮小/再起動保持は別|
|2-3.1.1|　↳ ソース|[app/components/StickyNote.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.tsx)|[app/components/StickyNote.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.test.tsx#L184)<br>概要：同期時の未保存本文保持、画像ドロップ、折りたたみ展開、サイズ保存を確認する。|
|2-3.2|↳ 機能|本文の一部分の折りたたみ|[e2e/editor-outline.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/editor-outline.spec.ts)<br>概要：編集/表示の折畳保持<br>確認範囲：Tauriモック。ブラウザー内の編集/表示接続を確認|
|2-3.2.1|　↳ ソース|[app/utils/editorOutline.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/editorOutline.ts)|[app/utils/editorOutline.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/editorOutline.test.ts#L9)<br>概要：折りたたんだ画像と子項目を同じ範囲で隠し、隠れた本文を消す編集を拒否する。|
|2-3.2.2|　↳ ソース|[app/utils/outline.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/outline.ts)|[app/utils/outline.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/outline.test.ts#L13)<br>概要：見出し・箇条書き・字下げの親子関係を判定し、親を畳むと子孫を隠す。|

## 要求2-4　構造を整理して見せたい

表2-4：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|2-4|要求|要求2-4　構造を整理して見せたい|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>[e2e/editor-outline.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/editor-outline.spec.ts)<br>概要：選択文字→表記法・選択文字→図の記法・編集/表示の折畳保持<br>確認範囲：一部：生成操作と部分折りたたみ。全形式の保存/完成表示を通した受入は不足|
|2-4.1|↳ 機能|見出し|[e2e/editor-outline.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/editor-outline.spec.ts)<br>概要：編集/表示の折畳保持<br>確認範囲：一部。全見出しレベルは部品試験。全操作の通し確認ではない|
|2-4.1.1|　↳ ソース|[app/components/MarkdownRenderer.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/MarkdownRenderer.tsx)|[app/components/__tests__/MarkdownRenderer.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/__tests__/MarkdownRenderer.test.tsx#L105)<br>概要：6段階の見出しを記号なしで表示し、通常行の番号や折りたたみの本文を保持する。|
|2-4.2|↳ 機能|チェックリスト|[app/shared/page.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/page.test.tsx)<br>概要：Webチェック保存・失敗復帰<br>確認範囲：一部。Web共有の操作と保存呼出/失敗復帰。PCの実保存/再起動は別|
|2-4.2.1|　↳ ソース|[app/components/StickyNote.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.tsx)|[app/utils/checkboxToggle.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/checkboxToggle.test.ts)<br>概要：テスト内に複製したチェック切替処理を確認する。<br>**不足：製品ソースを直接読み込む試験ではない。**|
|2-4.2.2|　↳ ソース|[app/components/RichTextEditor.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/RichTextEditor.tsx)|[app/components/RichTextEditor.checkboxDecoration.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/RichTextEditor.checkboxDecoration.test.ts#L5)<br>概要：チェック・箇条書きの装飾範囲を正しく取り、設定したキーを編集用の形式へ変換する。|
|2-4.3|↳ 機能|テーブル|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：選択文字→表記法<br>確認範囲：一部。E2Eは表記法への変換まで。完成表の表示/再保存は未確認|
|2-4.3.1|　↳ ソース|[app/components/MarkdownRenderer.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/MarkdownRenderer.tsx)|[app/components/__tests__/MarkdownRenderer.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/__tests__/MarkdownRenderer.test.tsx#L62)<br>概要：表の横スクロールを継続し、縦スクロールを妨げず、畳んだ見出し内の表を隠す。表の全編集操作は対象外。|
|2-4.4|↳ 機能|Mermaid 図|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：選択文字→図の記法<br>確認範囲：一部。ブロック変換と描画安全性は別試験。編集→保存→再表示の全体は不足|
|2-4.4.1|　↳ ソース|[app/utils/mermaid.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/mermaid.ts)|[app/utils/mermaid.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/mermaid.test.ts#L37)<br>概要：図の大きさ・処理時間を制限し、危険な実行・通信・ファイル参照を除去する。|
|2-4.4.2|　↳ ソース|[app/utils/mermaid.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/mermaid.ts)|[app/utils/mermaidSecurity.browser.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/mermaidSecurity.browser.test.ts#L76)<br>概要：実ブラウザーで日本語・矢印・色を保ち、不正入力の後も通常の図を描けることを確認する。|
|2-4.5|↳ 機能|日付・時刻の挿入|**不足：対応テスト未確認**<br>確認範囲：不足。該当操作を通す専用ケースは未同定|
|2-4.5.1|　↳ ソース|[app/hooks/useStickyNoteContextMenu.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.ts)|[app/hooks/useStickyNoteContextMenu.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.test.ts#L59)<br>概要：メニュー補助の試験はあるが、日付・時刻を挿入する専用ケースは未確認。|

## 要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）

表2-5：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|2-5|要求|要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）|**不足：対応テスト未確認**<br>確認範囲：不足：値の定義/OS呼出のモックでは実際の目立ち方を判定できない|
|2-5.1|↳ 機能|最前面に固定（ピン留め）|**不足：対応テスト未確認**<br>確認範囲：不足。値/別窓のモック試験を、付箋の実OS最前面の成立にしない|
|2-5.1.1|　↳ ソース|[app/components/StickyNote.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/StickyNote.tsx)|**不足：ピン留めの専用ソーステスト未確認**<br>確認範囲：以前のnoteAppearance.test.tsは色と文字サイズのみで、ピン留めを確認しないため除外。|
|2-5.2|↳ 機能|色分け（背景色5色）|**不足：対応テスト未確認**<br>確認範囲：不足。色の定義の単体だけでは画面と保存までを確認できない|
|2-5.2.1|　↳ ソース|[app/utils/noteAppearance.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.ts)|[app/utils/noteAppearance.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.test.ts#L5)<br>概要：付箋で共有する5色の値が変わらないことを確認する。実際の窓への色反映は別確認。|
|2-5.3|↳ 機能|透明度3段階|**不足：対応テスト未確認**<br>確認範囲：不足。lib.rsの実OS反映と保持は未確認|
|2-5.3.1|　↳ ソース|[app/hooks/useStickyNoteContextMenu.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useStickyNoteContextMenu.ts)<br>[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|**不足：専用ソーステスト未確認**|
|2-5.4|↳ 機能|文字サイズ|**不足：対応テスト未確認**<br>確認範囲：不足。サイズの定義の単体だけでは画面と保存までを確認できない|
|2-5.4.1|　↳ ソース|[app/utils/noteAppearance.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.ts)|[app/utils/noteAppearance.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/noteAppearance.test.ts#L11)<br>概要：付箋で共有する文字サイズの選択値を確認する。画面での反映は別確認。|

## 要求2-6　時刻になったら知らせてほしい

表2-6：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|2-6|要求|要求2-6　時刻になったら知らせてほしい|**不足：対応テスト未確認**<br>確認範囲：不足：日時/言語/前面判定の単体のみ。時刻発火→OS通知の受入はない|
|2-6.1|↳ 機能|アラーム|**不足：対応テスト未確認**<br>確認範囲：不足。日時/前面判定/言語だけで時刻発火の一連を保証しない|
|2-6.1.1|　↳ ソース|[app/utils/alarmDateTime.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/alarmDateTime.ts)|[app/utils/alarmDateTime.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/alarmDateTime.test.ts#L5)<br>概要：日本語・英語それぞれに合ったアラーム日時の表記を確認する。|
|2-6.1.2|　↳ ソース|[app/utils/alarmAlwaysOnTop.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/alarmAlwaysOnTop.ts)|[app/utils/alarmAlwaysOnTop.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/alarmAlwaysOnTop.test.ts#L5)<br>概要：元の最前面設定が未読込なら無効とし、読込後は元の設定を保持する。|
|2-6.1.3|　↳ ソース|[app/components/AlarmDialog.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AlarmDialog.tsx)|[app/components/AlarmDialog.language.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AlarmDialog.language.test.tsx#L8)<br>概要：英語設定をWindowsの日時入力部品へ渡すことを確認する。|

## 要求3-1　PCを開いたら、いつもの場所にいてほしい

表3-1：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|3-1|要求|要求3-1　PCを開いたら、いつもの場所にいてほしい|**不足：対応テスト未確認**<br>確認範囲：不足：復元順序/ファイルの単体のみ。実OS再起動からの受入は別|
|3-1.1|↳ 機能|起動時の状態復元|**不足：対応テスト未確認**<br>確認範囲：不足。実再起動からの復元は別。起動順序の単体のみで合格にしない|
|3-1.1.1|　↳ ソース|[app/utils/startupRestore.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/startupRestore.ts)|[app/utils/startupRestore.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/startupRestore.test.ts#L12)<br>概要：起動案内中の動作、準備完了待ちの上限、同時準備数、未準備窓の除外を確認する。|
|3-1.1.2|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L2004)<br>概要：保存済みの位置などの属性を読み取り、設定の主ファイルが壊れた場合に有効な前世代から復旧する。|
|3-1.2|↳ 機能|マルチモニター救済|**不足：対応テスト未確認**<br>確認範囲：不足。新規位置の計算は関連のみ。実モニター変更による既存窓救済は未確認|
|3-1.2.1|　↳ ソース|[app/utils/newNotePosition.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/newNotePosition.ts)|[app/utils/newNotePosition.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/newNotePosition.test.ts#L12)<br>概要：カーソルのある画面を選び、倍率・負座標を考慮して付箋を画面内に配置する。|

## 要求3-2　家の外でも見たい・続きをしたい

表3-2：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|3-2|要求|要求3-2　家の外でも見たい・続きをしたい|[e2e/iphone-roundtrip.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/iphone-roundtrip.spec.ts)<br>[e2e/pwa-recovery.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-recovery.spec.ts)<br>[e2e/pwa-video-local.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-video-local.spec.ts)<br>[e2e/shared-storage.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/shared-storage.spec.ts)<br>概要：PWA返送→PC比較選択・PWA再起動・オフライン復元・PWA送信済み動画の再生・Web画像取得・草稿保持<br>確認範囲：一部：ブラウザー/検証データ。実端末/実通信/PC配達は別。動画の送信済み化は模擬|
|3-2.1|↳ 機能|iPhone に送る（PC → iPhone）|[e2e/pc-to-iphone-image.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pc-to-iphone-image.spec.ts)<br>[e2e/pwa-recovery.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-recovery.spec.ts)<br>[e2e/pwa-bold.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-bold.spec.ts)<br>概要：PWA受信画像の表示・PWA再起動・オフライン復元・PWA赤文字・再表示<br>確認範囲：一部。受信相当データの表示/端末保持。実PC→Drive→Push配送は別|
|3-2.1.1|　↳ ソース|[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs#L4332)<br>概要：送信待ちを保存してから通知先を再取得し、先頭画像を本文に保持し、大きい本文はDrive取得方式へ切り替える。|
|3-2.1.2|　↳ ソース|[app/viewer/lib/push.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/push.ts)|[app/viewer/lib/push.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/push.test.ts#L118)<br>概要：通知登録の進捗・成功・拒否・時間切れ・期限切れ後の画面遷移を確認する。|
|3-2.2|↳ 機能|通知常駐（ロックだぜ）|[e2e/lock-notification.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/lock-notification.spec.ts)<br>概要：PWA通知API・開くID<br>確認範囲：一部。通知APIモック。実ロック画面での常駐/OS制約は別|
|3-2.2.1|　↳ ソース|[app/viewer/lib/notification-navigation.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/notification-navigation.ts)|[app/viewer/lib/notification-navigation.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/notification-navigation.test.ts#L15)<br>概要：通知先の付箋IDを読み、見つかるまで再試行し、開けた後だけ遷移情報を消す。|
|3-2.2.2|　↳ ソース|[app/viewer/lib/push.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/push.ts)|[app/viewer/lib/push.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/push.test.ts#L118)<br>概要：通知登録の進捗・成功・拒否・時間切れ・期限切れ後の画面遷移を確認する。|
|3-2.3|↳ 機能|iPhone から PC へ送る|[e2e/iphone-roundtrip.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/iphone-roundtrip.spec.ts)<br>[app/components/IphoneReturnDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/IphoneReturnDialog.test.tsx)<br>[app/viewer/__tests__/FileAttachmentSemantics.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/__tests__/FileAttachmentSemantics.test.tsx)<br>[app/viewer/__tests__/VideoAttachmentSemantics.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/__tests__/VideoAttachmentSemantics.test.tsx)<br>概要：PWA返送→PC比較選択・PC/iPhone比較・反映選択・添付送信・失敗時保持・複数動画・容量不足の拒否<br>確認範囲：一部。受渡し/PC/Driveはモック範囲。実到着は別。動画再生/端末保存は下位分岐参照|
|3-2.3.1|　↳ ソース|[app/utils/receiveIphoneNote.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/receiveIphoneNote.ts)|[app/utils/receiveIphoneNote.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/receiveIphoneNote.test.ts#L19)<br>概要：添付保存とPC付箋の作成後だけ受信完了を返し、保存失敗時は送信待ちを残す。|
|3-2.3.2|　↳ ソース|[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs#L5689)<br>概要：指定PCだけが受信し、返送本文を元の付箋へ反映し、競合時は拒否して二重適用を防ぐ。|
|3-2.4|↳ 機能|Web共有|[e2e/shared-storage.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/shared-storage.spec.ts)<br>[e2e/shared-launcher-order.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/shared-launcher-order.spec.ts)<br>概要：Web画像取得・草稿保持・Webの並びと取得失敗<br>確認範囲：一部。検証用Drive応答。実PC/Driveへの到着と競合解消は別|
|3-2.4.1|　↳ ソース|[app/shared/page.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/page.tsx)|[app/shared/page.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/page.test.tsx#L60)<br>概要：Web共有の一覧・選択・草稿復元・チェック操作と、読込や保存の失敗時保持を確認する。|
|3-2.4.2|　↳ ソース|[app/shared/lib/drive.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/lib/drive.ts)|[app/shared/lib/drive.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/shared/lib/drive.test.ts#L26)<br>概要：共有一覧の版・順序・重複、編集競合、送信再試行と再開時の保持を確認する。|
|3-2.4.3|　↳ ソース|[src-tauri/src/web_share_snapshot.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/web_share_snapshot.rs)|[src-tauri/src/web_share_snapshot.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/web_share_snapshot.rs#L1516)<br>概要：共有データと添付の整合、アカウント違い、同時更新の衝突と安全な拒否を確認する。|

## 要求3-3　増えても、デスクトップが散らからないでほしい

表3-3：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|3-3|要求|要求3-3　増えても、デスクトップが散らからないでほしい|[e2e/archive-restore.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/archive-restore.spec.ts)<br>[e2e/quick-launcher.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/quick-launcher.spec.ts)<br>[app/components/QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx)<br>概要：保管の選択・復元操作・狭い一覧のタグ選択・隠す操作・失敗時保持<br>確認範囲：一部：UI/モック。実ファイル・実窓を一巡する受入は不足|
|3-3.1|↳ 機能|タグで整列（カンバン整列）|**不足：対応テスト未確認**<br>確認範囲：不足。配置計算の単体と実窓の並べ替えを区別|
|3-3.1.1|　↳ ソース|[src-tauri/src/arrange.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/arrange.rs)|[src-tauri/src/arrange.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/arrange.rs#L723)<br>概要：タグ・色・結晶の分類を判定し、整列グループへ正しく分ける。|
|3-3.2|↳ 機能|タグで絞り込み|[e2e/quick-launcher.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/quick-launcher.spec.ts)<br>概要：狭い一覧のタグ選択<br>確認範囲：一部。ランチャーのブラウザー範囲。実OSの窓を隠す処理とは別|
|3-3.2.1|　↳ ソース|[app/components/LauncherTagFilter.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagFilter.tsx)|[app/components/LauncherTagFilter.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagFilter.test.tsx#L27)<br>概要：狭い幅でタグを展開・選択でき、幅変更や右クリックでも選択を保持する。|
|3-3.2.2|　↳ ソース|[app/components/QuickLauncher.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.tsx)|[app/components/QuickLauncher.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.test.ts#L25)<br>概要：タブと分類、項目の選択移動、更新通知の対象、ごみ箱と登録解除の振り分けを確認する。|
|3-3.3|↳ 機能|全部隠す／全部戻す|**不足：対応テスト未確認**<br>確認範囲：不足。全窓の実OS操作を確認する専用機能試験は未同定|
|3-3.3.1|　↳ ソース|[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs#L6412)<br>概要：関連する状態解決の単体はあるが、全部隠す・全部戻すを操作する専用ケースは未確認。|
|3-3.4|↳ 機能|フォルダーに保管|[e2e/archive-restore.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/archive-restore.spec.ts)<br>[app/components/QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx)<br>[app/components/ArchivedNotesRestoreDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/ArchivedNotesRestoreDialog.test.tsx)<br>概要：保管の選択・復元操作・隠す操作・失敗時保持・保管選択・失敗復帰<br>確認範囲：一部。UIの保管/復元はモック。実ファイル移動はRust単体で別確認|
|3-3.4.1|　↳ ソース|[app/utils/archiveRestore.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/archiveRestore.ts)|[app/utils/archiveRestore.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/archiveRestore.test.ts#L10)<br>概要：新しい保管付箋の抽出、保管場所の集計、検索、Windowsパス違いの照合を確認する。|
|3-3.4.2|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1566)<br>概要：保管一覧と日時を読み、本文・画像を一緒に戻す。衝突や範囲外は拒否して原本を保持する。|
|3-3.5|↳ 機能|ランチャーに登録して画面から隠す|[app/components/QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx)<br>概要：隠す操作・失敗時保持<br>確認範囲：一部。API呼出/失敗時保持は確認。実窓再表示/再起動保持は別|
|3-3.5.1|　↳ ソース|[src-tauri/src/favorite_storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/favorite_storage.rs)|[src-tauri/src/favorite_storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/favorite_storage.rs#L271)<br>概要：収納状態を保存・再読込し、Vaultごとの分離、原本保持、失敗時の成功誤報防止を確認する。|
|3-3.5.2|　↳ ソース|[app/components/QuickLauncher.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.tsx)|[app/components/QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx#L28)<br>概要：選んだ付箋・タグの収納と取出し、失敗時の利用可能状態、処理中の過剰な再読込防止を確認する。|

## 要求3-4　昔のメモを、すぐ見つけたい

表3-4：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|3-4|要求|要求3-4　昔のメモを、すぐ見つけたい|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>[e2e/quick-launcher.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/quick-launcher.spec.ts)<br>概要：検索からメモを選択・狭い一覧のタグ選択<br>確認範囲：一部：検証一覧の検索/タグ選択。実Vault全件/応答時間/実窓再利用は別|
|3-4.1|↳ 機能|全文検索|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：検索からメモを選択<br>確認範囲：一部。検索/前面化のモック。実Vault全体と応答時間は別|
|3-4.1.1|　↳ ソース|[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs#L7035)<br>概要：検索語で対象を絞り、結晶の所属フォルダーを区別する。検索画面の全操作は別確認。|
|3-4.1.2|　↳ ソース|[app/components/SearchOverlay.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/SearchOverlay.tsx)|[app/components/SearchOverlay.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/SearchOverlay.test.tsx#L41)<br>概要：検索で既に開いている付箋を選ぶと、新しい窓を作らず既存窓を前面に出す。|
|3-4.2|↳ 機能|クイックランチャー|[e2e/quick-launcher.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/quick-launcher.spec.ts)<br>[app/components/QuickLauncher.storage.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.storage.test.tsx)<br>概要：狭い一覧のタグ選択・隠す操作・失敗時保持<br>確認範囲：一部。タグ/保管操作。実OSで開くこと・全タブの受入は別|
|3-4.2.1|　↳ ソース|[src-tauri/src/launcher.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/launcher.rs)|[src-tauri/src/launcher.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/launcher.rs#L2427)<br>概要：一覧の検索・順序保存、分類別の読込、付箋を開く際の本文・位置保持を確認する。|
|3-4.2.2|　↳ ソース|[app/components/QuickLauncher.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.tsx)|[app/components/QuickLauncher.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QuickLauncher.test.ts#L25)<br>概要：タブと分類、項目の選択移動、更新通知の対象、ごみ箱と登録解除の振り分けを確認する。|
|3-4.3|↳ 機能|タグ付けとタグフォルダ|[app/components/LauncherTagActions.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagActions.test.tsx)<br>概要：タグ管理・部分失敗保持<br>確認範囲：一部。管理部品の追加/部分失敗まで。PCのタグフォルダを通す専用試験は未同定|
|3-4.3.1|　↳ ソース|[app/utils/reservedTags.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/reservedTags.ts)|[app/utils/reservedTags.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/reservedTags.test.ts#L5)<br>概要：システム用タグを判別し、部分一致を誤認せず、利用者の分類タグだけを取り出す。|
|3-4.3.2|　↳ ソース|[app/components/LauncherTagActions.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagActions.tsx)|[app/components/LauncherTagActions.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/LauncherTagActions.test.tsx#L18)<br>概要：タグの作成・登録・削除確認、変更の一部失敗と復旧、未使用タグの安全な削除を確認する。|
|3-4.3.3|　↳ ソース|[app/hooks/useTagManager.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useTagManager.ts)|[app/hooks/useTagManager.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useTagManager.test.ts#L5)<br>概要：システム用タグの追加を拒否し、通常の利用者タグを受け付ける。|

## 補助ブランチA：基盤（土台）

表補助A：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|補助A|要求|補助ブランチA：基盤（土台）|**不足：16要求内の親要求が未定義**|
|補助A.1|↳ 機能|Markdown ファイル保存|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>[app/hooks/useNoteFile.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useNoteFile.test.tsx)<br>概要：編集終了→保存呼出・保存成功/失敗・直列化<br>確認範囲：一部。ブラウザー側は保存モック。実読書きのRust試験と組み合わせてもOS終了復元は別|
|補助A.1.1|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1816)<br>概要：Markdownを実ファイルへ保存して再読込し、本文と必要な属性を保持する。|
|補助A.2|↳ 機能|アトミック保存と破損防止|**不足：対応テスト未確認**<br>確認範囲：不足。実ファイルの単体はあるが利用者操作から復旧までの上位試験は未同定|
|補助A.2.1|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1514)<br>概要：新しい本文や他の同時更新を古い保存で上書きせず、設定の有効な前世代を残す。|
|補助A.3|↳ 機能|手動バックアップ|[app/components/BackupResultDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/BackupResultDialog.test.tsx)<br>概要：バックアップ結果表示<br>確認範囲：一部。結果画面と保存処理は別。操作から成果物の照合まで不足|
|補助A.3.1|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1748)<br>概要：ごみ箱を含む・含まないバックアップを分け、同じ保存先や内側の指定を拒否する。|
|補助A.3.2|　↳ ソース|[app/components/BackupResultDialog.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/BackupResultDialog.tsx)|[app/components/BackupResultDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/BackupResultDialog.test.tsx#L9)<br>概要：バックアップ結果・保存情報を明確に表示し、閉じるまで結果を保持する。|
|補助A.4|↳ 機能|月次安全バックアップ|**不足：対応テスト未確認**<br>確認範囲：不足。月次処理の単体と実起動契機/日付をまたぐ動作を区別|
|補助A.4.1|　↳ ソース|[src-tauri/src/maintenance.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/maintenance.rs)|[src-tauri/src/maintenance.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/maintenance.rs#L41)<br>概要：24時間の境界・時計の巻戻し・再起動後の重複防止を、処理種別と保存先ごとに確認する。|
|補助A.4.2|　↳ ソース|[app/utils/monthlyBackupSettings.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/monthlyBackupSettings.ts)|[app/utils/monthlyBackupSettings.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/monthlyBackupSettings.test.ts#L5)<br>概要：自動バックアップの有効・無効と案内状態を更新し、既存の履歴を守る。|
|補助A.4.3|　↳ ソース|[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs#L560)<br>概要：月次バックアップを1世代だけ保持し、ごみ箱を既定で除外して中断した仮フォルダーを整理する。|
|補助A.5|↳ 機能|バックアップからの復旧|**不足：対応テスト未確認**<br>確認範囲：不足。restore_backup_testsのファイル検証はあるが再起動利用までの通し確認は別|
|補助A.5.1|　↳ ソース|[src-tauri/src/lib.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/lib.rs#L731)<br>概要：復旧元の不存在・付箋なし・コピー件数の相違を拒否し、所定の復旧先へコピーする。|
|補助A.6|↳ 機能|削除とごみ箱|**不足：対応テスト未確認**<br>確認範囲：不足。PCの実操作→ごみ箱→復元の専用上位試験は未同定。PWA削除とは別|
|補助A.6.1|　↳ ソース|[src-tauri/src/trash_history.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/trash_history.rs)|[src-tauri/src/trash_history.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/trash_history.rs#L98)<br>概要：削除履歴を並行処理でも欠落させず、中断や移動後の失敗で原本と停止情報を保持する。|
|補助A.6.2|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L2214)<br>概要：ごみ箱への移動履歴を残し、古い一覧情報から変更済み付箋を誤って移動しない。|
|補助A.7|↳ 機能|ごみ箱の90日整理|**不足：対応テスト未確認**<br>確認範囲：一部の安全停止E2Eは後述。期限判定から実削除までの上位試験は未同定|
|補助A.7.1|　↳ ソース|[src-tauri/src/trash_cleanup.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/trash_cleanup.rs)|[src-tauri/src/trash_cleanup.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/trash_cleanup.rs#L512)<br>概要：保持期限・変更済み・対象外を守り、削除範囲・画像参照・ロックを安全に扱う。|
|補助A.8|↳ 機能|インポート|**不足：対応テスト未確認**<br>確認範囲：不足。ファイル処理と一覧再読取の単体だけで全操作成立としない|
|補助A.8.1|　↳ ソース|[src-tauri/src/import.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/import.rs)|[src-tauri/src/import.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/import.rs#L148)<br>概要：取込先の付箋パスを返し、旧窓設定だけを除去して本文と必要な属性を保持する。|
|補助A.8.2|　↳ ソース|[app/utils/importRefresh.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/importRefresh.ts)|[app/utils/importRefresh.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/importRefresh.test.ts#L5)<br>概要：取込後に一覧を同期し、取り込んだ全付箋を再表示する。|
|補助A.9|↳ 機能|保存先（Vault）の変更|[e2e/sticky-note.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/sticky-note.spec.ts)<br>概要：保存先を表示<br>確認範囲：一部。既存E2Eは保存先の表示のみ。切替後の実利用は未確認|
|補助A.9.1|　↳ ソース|[src-tauri/src/storage.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/storage.rs#L1879)<br>概要：危険な保存先を拒否し、読み書き可能性と指定パスの保持を確認する。画面での変更は別確認。|
|補助A.9.2|　↳ ソース|[lib/settings-store.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.ts)|[lib/settings-store.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.test.ts#L43)<br>概要：初期設定と保存済み設定を読み、設定変更を端末保存へ反映する。|
|補助A.10|↳ 機能|プライバシー設計|**不足：対応テスト未確認**<br>確認範囲：不足。暗号化/OAuthの単体だけで外部通信全体・保存先・ログの受入としない|
|補助A.10.1|　↳ ソース|[src-tauri/src/gdrive.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/gdrive.rs)|[src-tauri/src/gdrive.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/gdrive.rs#L1575)<br>概要：OAuthの照合と拒否、認証情報の暗号化保存、旧平文形式からの移行を確認する。|
|補助A.11|↳ 機能|効果音|**不足：対応テスト未確認**<br>確認範囲：不足。設定値の単体のみ。実音の発生は別|
|補助A.11.1|　↳ ソース|[app/utils/soundPreferences.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/soundPreferences.ts)|[app/utils/soundPreferences.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/soundPreferences.test.ts#L5)<br>概要：対応する音の選択を保持し、不明な値は標準へ戻し、操作ごとに別設定を使う。|
|補助A.12|↳ 機能|多言語（日本語／英語）|[e2e/settings-english.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/settings-english.spec.ts)<br>[e2e/pwa-language.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/pwa-language.spec.ts)<br>概要：PC設定の英語表示・PWA言語と再起動保持<br>確認範囲：一部。対象画面のブラウザー範囲。全画面/OSの言語受入ではない|
|補助A.12.1|　↳ ソース|[lib/i18n.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/i18n.ts)|[lib/i18n.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/i18n.test.ts#L14)<br>概要：日本語・英語の翻訳とキーの対応、翻訳がない場合の表示を確認する。|
|補助A.12.2|　↳ ソース|[app/viewer/language.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/language.ts)|[app/viewer/language.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/language.test.ts#L5)<br>概要：PWAの初期言語と選択した言語の端末保存・再読込を確認する。|
|補助A.13|↳ 機能|デスクトップショートカット|**不足：対応テスト未確認**<br>確認範囲：不足。名前/起動先の単体のみ。OSから開く実操作は別|
|補助A.13.1|　↳ ソース|[src-tauri/src/desktop_shortcut.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/desktop_shortcut.rs)|[src-tauri/src/desktop_shortcut.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/desktop_shortcut.rs#L155)<br>概要：Store版と旧版のショートカットを見分けられ、Storeアプリの固定識別子を使うことを確認する。|
|補助A.14|↳ 機能|設定画面|[e2e/settings-english.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/settings-english.spec.ts)<br>概要：PC設定の英語表示<br>確認範囲：一部。既存参照は言語表示。全設定の保存/実動作を確認した意味ではない|
|補助A.14.1|　↳ ソース|[app/utils/settingsPageText.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/settingsPageText.ts)|[app/utils/settingsPageText.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/settingsPageText.test.ts#L5)<br>概要：英語設定に日本語を混ぜず、日本語設定では日本語のラベルを表示する。|
|補助A.14.2|　↳ ソース|[lib/settings-store.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.ts)|[lib/settings-store.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/settings-store.test.ts#L43)<br>概要：初期設定と保存済み設定を読み、設定変更を端末保存へ反映する。|
|補助A.15|↳ 機能|ログと診断|**不足：対応テスト未確認**<br>確認範囲：不足。PWA診断の単体はあるがPC loggerを含む全経路ではない|
|補助A.15.1|　↳ ソース|[app/viewer/lib/diagnostic-log.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/diagnostic-log.ts)|[app/viewer/lib/diagnostic-log.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/lib/diagnostic-log.test.ts#L9)<br>概要：通知調査に必要な項目だけを記録し、本文や例外内容をコピー対象に含めない。|
|補助A.16|↳ 機能|PWAの版表示|**不足：対応テスト未確認**<br>確認範囲：不足。リリース時の配信照合は運用手順。版表示の専用自動機能試験は未同定|
|補助A.16.1|　↳ ソース|[lib/pwa-version.mjs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/lib/pwa-version.mjs)<br>[app/viewer/NoteListStep.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/viewer/NoteListStep.tsx)|**不足：専用ソーステスト未確認**|

## 補助ブランチB：発展

表補助B：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|補助B|要求|補助ブランチB：発展|**不足：16要求内の親要求が未定義**|
|補助B.1|↳ 機能|結晶化|**不足：対応テスト未確認**<br>確認範囲：不足。整形/モーダルの試験はあるが生成→保存→再利用の通し確認は未同定|
|補助B.1.1|　↳ ソース|[app/utils/crystalFormat.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/crystalFormat.ts)|[app/utils/crystalFormat.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/crystalFormat.test.ts#L32)<br>概要：指定した項目順で結晶を分解・組立てし、変更箇所と履歴を正しく生成する。|
|補助B.1.2|　↳ ソース|[app/utils/crystalFormatEditor.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/crystalFormatEditor.ts)|[app/utils/crystalFormatEditor.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/crystalFormatEditor.test.ts#L14)<br>概要：自由項目の追加・削除・移動、初期化、言語切替時の独自設定保持を確認する。|
|補助B.1.3|　↳ ソース|[app/components/QaCreateModal.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/QaCreateModal.tsx)<br>[app/components/TermCreateModal.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/TermCreateModal.tsx)|[app/components/CrystalCreateModals.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/CrystalCreateModals.test.tsx#L53)<br>概要：保存済みの英語の初期ひな形を日本語へ戻せることを確認する。|
|補助B.2|↳ 機能|会員番号|[app/components/SupportMemberNumber.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/SupportMemberNumber.test.tsx)<br>概要：会員番号・登録待ち表示<br>確認範囲：一部。番号表示とAPI処理は別。実登録→保存→再起動まで不足|
|補助B.2.1|　↳ ソース|[app/api/members/lib/service.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/api/members/lib/service.ts)|[app/api/members/lib/service.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/api/members/lib/service.test.ts#L18)<br>概要：会員番号の割当、同意状態の分離、他会員へのお便り混入防止を確認する。|
|補助B.2.2|　↳ ソース|[src-tauri/src/member_identity.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/member_identity.rs)|[src-tauri/src/member_identity.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/member_identity.rs#L578)<br>概要：会員情報の暗号化・設定の安全な更新・区分ごとの集計と案内配信を確認する。|
|補助B.3|↳ 機能|機能利用分析（同意制）|[app/components/AnalyticsConsentDialog.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AnalyticsConsentDialog.test.tsx)<br>概要：同意保留・再確認<br>確認範囲：一部。同意画面と送信判定の試験。実サービス集計までの上位確認は別|
|補助B.3.1|　↳ ソース|[app/utils/analytics.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/analytics.ts)|[app/utils/analytics.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/analytics.test.ts#L23)<br>概要：同意前は送信せず、本文・正確な件数を除外し、許可した分類だけをまとめて記録する。|
|補助B.3.2|　↳ ソース|[app/utils/analyticsConsentCompletion.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/analyticsConsentCompletion.ts)|[app/utils/analyticsConsentCompletion.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/analyticsConsentCompletion.test.ts#L5)<br>概要：同意の保存に成功した後だけ案内窓を隠し、保存・終了の失敗を成功扱いしない。|
|補助B.4|↳ 機能|開発者ホットライン（お便り）|[e2e/developer-conversation.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/developer-conversation.spec.ts)<br>[app/components/AnnouncementCard.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/AnnouncementCard.test.tsx)<br>概要：お便り画像失敗・入力保持・お便り返信操作<br>確認範囲：一部。通信先モック。実サービスへの到着は別|
|補助B.4.1|　↳ ソース|[app/utils/feedbackConversation.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/feedbackConversation.ts)|[app/utils/feedbackConversation.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/feedbackConversation.test.ts#L69)<br>概要：匿名の会話識別子と未読状態を保存し、既存会話を保持して返信を取得する。|
|補助B.4.2|　↳ ソース|[app/utils/feedbackImage.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/feedbackImage.ts)|[app/utils/feedbackImage.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/feedbackImage.test.ts#L5)<br>概要：画像の枚数・種類・容量を制限し、長辺を縮めて軽いWebPへ変換する。|
|補助B.5|↳ 機能|開発者とのやりとり掲示板|[e2e/developer-conversation.spec.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/e2e/developer-conversation.spec.ts)<br>概要：会話順序・新着表示<br>確認範囲：一部。受信相当データの表示。実Discord/サーバー間配送は別|
|補助B.5.1|　↳ ソース|[app/utils/developerConversationTimeline.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/developerConversationTimeline.ts)|[app/utils/developerConversationTimeline.test.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/utils/developerConversationTimeline.test.ts#L5)<br>概要：お便りと返信を同じ会話にまとめ、最後に動いた会話を末尾へ並べる。|
|補助B.5.2|　↳ ソース|[workers/discord-replies/src/index.js](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/workers/discord-replies/src/index.js)|[workers/discord-replies/src/index.test.mjs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/workers/discord-replies/src/index.test.mjs#L26)<br>概要：返信取込の再開位置を保持し、同時取込と失敗時の進み過ぎ・認証情報漏れを防ぐ。|
|補助B.6|↳ 機能|開発を支援する|[app/components/EndrollMatsuri.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/EndrollMatsuri.test.tsx)<br>概要：支援者の表示<br>確認範囲：一部。表示部品のみ。支援の手続き成立は別|
|補助B.6.1|　↳ ソース|[app/components/EndrollMatsuri.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/EndrollMatsuri.tsx)|[app/components/EndrollMatsuri.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/components/EndrollMatsuri.test.tsx#L23)<br>概要：支援者数・金額・コメント・参加日を表示し、支援者がいない場合の案内を確認する。|
|補助B.7|↳ 機能|アップデート確認|[app/hooks/useUpdateCheck.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useUpdateCheck.test.tsx)<br>概要：配布方式別の更新確認<br>確認範囲：一部。更新サービスと導入はモック。Store取得/導入/再起動は別|
|補助B.7.1|　↳ ソース|[app/hooks/useUpdateCheck.ts](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useUpdateCheck.ts)|[app/hooks/useUpdateCheck.test.tsx](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/app/hooks/useUpdateCheck.test.tsx#L29)<br>概要：Store版と通常版の更新経路を分け、判定失敗時に別方式へ進まず、通常版は本人確認後に導入する。|
|補助B.7.2|　↳ ソース|[src-tauri/src/distribution.rs](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/distribution.rs)|[src-tauri/src/distribution.rs 内のテスト](https://github.com/ore-no-fusen/ore-no-fusen/blob/74d9f8c1c8350fd795b5e71c19f09dec19d3d333/src-tauri/src/distribution.rs#L53)<br>概要：Store更新の有無、配布形式の判定、旧自動起動設定を一度だけ無効にする移行を確認する。|

## 根拠

機能マスターの16要求・71機能を対象に、要求・機能は実在する担当ケース、ソースはテスト内の対象モジュール参照と確認内容を照合。概要は日本語で記載し、ファイル内に別機能の試験があっても対象機能を確認した扱いにしない。

テストがないと確定できない場合は「不足：対応テスト未確認」とする。部分確認と未確認範囲は各行に残す。補助A/Bは既存16要求内の親要求が未定義であることを不足として明示。同じテストは共用し、要求・機能・ソース別に重複実行しない。

テスト名・実装へのリンクは、今回の対象コードと一致する固定版74d9f8c1の公開ソースを参照。テストの内容を照合した一覧であり、今回これらのアプリ試験を実行した結果ではない。

</div>
