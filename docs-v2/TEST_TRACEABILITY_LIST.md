# 要求・機能・ソースとテストの一覧

番号は「要求ID → 要求ID.機能番号 → 要求ID.機能番号.ソース番号」。例：1-1 → 1-1.1 → 1-1.1.1。補助A/Bは要求の対応が未確認のため別番号とする。

不足＝対応テストを確認できていない。部分的なテストは不足範囲を併記。同じテストは共用。`.test.ts` / `.spec.ts`等はテストファイル。Rustは実装と同じ`.rs`内にテストを持つため「内のテスト」と表示。実行結果の一覧ではない。


## 要求1-1　思いついた瞬間に、書ける状態になっていてほしい

表1-1：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・概要・不足|
|---|---|---|---|
|1-1|要求|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：新規メモへの入力<br>確認範囲：一部：ブラウザーの表示/入力。実OSキー/プール昇格/応答時間は不足|
|1-1.1|↳ 機能|プールウィンドウ方式|[app/components/StickyNote.pool.test.tsx](../app/components/StickyNote.pool.test.tsx)<br>概要：初回入力・プール解放<br>確認範囲：一部。実OSの昇格/フォーカス/待ち時間は未確認|
|1-1.1.1|　↳ ソース|[app/utils/invisibleNotePool.ts](../app/utils/invisibleNotePool.ts)|[app/utils/invisibleNotePool.test.ts](../app/utils/invisibleNotePool.test.ts)<br>概要：準備済み・未使用の窓を選ぶ。利用可能な窓がなければ通常作成へ切り替える。|
|1-1.1.2|　↳ ソース|[app/utils/freshRequestQueue.ts](../app/utils/freshRequestQueue.ts)|[app/utils/freshRequestQueue.test.ts](../app/utils/freshRequestQueue.test.ts)<br>概要：作成要求を受付順に処理し、1.5秒超の古い要求と上限4件超を受け付けない。|
|1-1.2|↳ 機能|グローバルホットキー Ctrl+N|**不足：対応テスト未確認**<br>確認範囲：不足。OSキー→新規窓の通し確認は別途必要|
|1-1.2.1|　↳ ソース|[src-tauri/src/hotkey_manager.rs](../src-tauri/src/hotkey_manager.rs)|[src-tauri/src/hotkey_manager.rs 内のテスト](../src-tauri/src/hotkey_manager.rs)<br>概要：予約済みキーの拒否、キー設定の読込・保存、無効設定の保持を確認。|
|1-1.2.2|　↳ ソース|[app/utils/shortcutKey.ts](../app/utils/shortcutKey.ts)|[app/utils/shortcutKey.test.ts](../app/utils/shortcutKey.test.ts)<br>概要：キー入力と設定の一致・重複・対象外入力・表示を確認。Ctrl＋Nなどの組合せを読み取り、Ctrlだけ・Nだけは除外する。|
|1-1.3|↳ 機能|Ctrl 2回押し／Shift 2回押しトリガー|**不足：対応テスト未確認**<br>確認範囲：不足。判定関数の単体はあるが実フック→窓は未確認|
|1-1.3.1|　↳ ソース|[src-tauri/src/double_tap.rs](../src-tauri/src/double_tap.rs)|[src-tauri/src/double_tap.rs 内のテスト](../src-tauri/src/double_tap.rs)<br>概要：2回押しの検知、時間切れ・他キー併用の除外、3回押しでの重複防止を確認。|
|1-1.4|↳ 機能|システムトレイ常駐＋トレイメニュー「新規メモ」|**不足：対応テスト未確認**<br>確認範囲：不足。メニュー文字列の単体と実作成を区別|
|1-1.4.1|　↳ ソース|[src-tauri/src/tray.rs](../src-tauri/src/tray.rs)|[src-tauri/src/tray.rs 内のテスト](../src-tauri/src/tray.rs)<br>概要：トレイメニューに設定済みショートカットと起動方法を正しく表示する。|
|1-1.5|↳ 機能|付箋上の「＋」ボタン／右クリック「新規メモ」|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：新規メモへの入力<br>確認範囲：一部。既存E2Eは新規URLを開くため＋/右クリック起点と実位置は未確認|
|1-1.5.1|　↳ ソース|[app/utils/newNotePosition.ts](../app/utils/newNotePosition.ts)|[app/utils/newNotePosition.test.ts](../app/utils/newNotePosition.test.ts)<br>概要（代表ケース）：centers within the usable area above the taskbar ／ uses the selected monitor coordinates and DPI, including negative origins|
|1-1.5.2|　↳ ソース|[app/hooks/useStickyNoteContextMenu.ts](../app/hooks/useStickyNoteContextMenu.ts)|[app/hooks/useStickyNoteContextMenu.test.ts](../app/hooks/useStickyNoteContextMenu.test.ts)<br>概要（代表ケース）：filters reserved tags ／ creates stable tag ids|
|1-1.6|↳ 機能|自動起動|**不足：対応テスト未確認**<br>確認範囲：不足。設定移行の単体はあるがOSログイン受入は未確認|
|1-1.6.1|　↳ ソース|[src-tauri/src/distribution.rs](../src-tauri/src/distribution.rs)|[src-tauri/src/distribution.rs 内のテスト](../src-tauri/src/distribution.rs)<br>概要：未確認|

## 要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい

表1-2：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|1-2|要求|要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい|[app/components/StickyNote.test.tsx](../app/components/StickyNote.test.tsx)<br>[e2e/pc-to-iphone-image.spec.ts](../e2e/pc-to-iphone-image.spec.ts)<br>概要：ドロップ保存呼出・拒否・PWA受信画像の表示<br>確認範囲：一部：ドロップ部品と受信画像。実OSキャプチャ/クリップボードからの通しは不足|
|1-2.1|↳ 機能|画面キャプチャ|**不足：対応テスト未確認**<br>確認範囲：不足。capture.rsの専用分岐試験なし。実OS撮影/キャンセル確認が必要|
|1-2.1.1|　↳ ソース|**未確認**|**不足：専用ソーステスト未確認**|
|1-2.2|↳ 機能|クリップボード画像の貼り付け|**不足：対応テスト未確認**<br>確認範囲：不足。挿入位置/保存の単体はあるが実クリップボード→保存→表示の全体は未確認|
|1-2.2.1|　↳ ソース|**未確認**（対応テスト：[app/components/RichTextEditor.imagePaste.test.ts](../app/components/RichTextEditor.imagePaste.test.ts)）|[app/components/RichTextEditor.imagePaste.test.ts](../app/components/RichTextEditor.imagePaste.test.ts)<br>概要（代表ケース）：places the next input position on a new line after the image ／ shows a pending image immediately without adding it to the document|
|1-2.2.2|　↳ ソース|[src-tauri/src/clipboard.rs](../src-tauri/src/clipboard.rs)|[src-tauri/src/clipboard.rs 内のテスト](../src-tauri/src/clipboard.rs)<br>概要：未確認|
|1-2.3|↳ 機能|エディタへの画像ドロップ貼り付け|[app/components/StickyNote.test.tsx](../app/components/StickyNote.test.tsx)<br>概要：ドロップ保存呼出・拒否<br>確認範囲：一部。保存呼出はモック。実Explorerとファイル書込は別|
|1-2.3.1|　↳ ソース|[app/utils/droppedImage.ts](../app/utils/droppedImage.ts)|[app/utils/droppedImage.test.ts](../app/utils/droppedImage.test.ts)<br>概要（代表ケース）：accepts supported image extensions only ／ appends dropped images after the current body|
|1-2.3.2|　↳ ソース|[src-tauri/src/clipboard.rs](../src-tauri/src/clipboard.rs)|[src-tauri/src/clipboard.rs 内のテスト](../src-tauri/src/clipboard.rs)<br>概要：未確認|

## 要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）

表1-3：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|1-3|要求|要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>[e2e/pwa-recovery.spec.ts](../e2e/pwa-recovery.spec.ts)<br>[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)<br>概要：編集終了→保存呼出・PWA再起動・オフライン復元・保存成功/失敗・直列化<br>確認範囲：一部：PC側は保存モック、PWAは検証データ。PC終了後の実ディスク復元は不足|
|1-3.1|↳ 機能|変更の自動保存|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)<br>概要：編集終了→保存呼出・保存成功/失敗・直列化<br>確認範囲：一部。実ディスク保存・終了後復元の通し確認は別|
|1-3.1.1|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|1-3.1.2|　↳ ソース|[src-tauri/src/logic.rs](../src-tauri/src/logic.rs)|[src-tauri/src/logic.rs 内のテスト](../src-tauri/src/logic.rs)<br>概要（代表ケース）：sanitize_basic ／ sanitize_removes_all_forbidden_chars|
|1-3.2|↳ 機能|明示保存 Ctrl+S|[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)<br>概要：保存成功/失敗・直列化<br>確認範囲：一部。共通保存経路まで。Ctrl+S起点の専用ケースは未同定|
|1-3.2.1|　↳ ソース|**未確認**（対応テスト：[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)）|[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)<br>概要（代表ケース）：returns false without writing when an existing note has not loaded ／ returns true only after the actual write succeeds and propagates write failure|

## 要求1-4　手が離せないときは、声で送りたい

表1-4：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|1-4|要求|要求1-4　手が離せないときは、声で送りたい|**不足：対応テスト未確認**<br>確認範囲：不足：実Siri→中継→PC表示の受入がない。API単体で代替しない|
|1-4.1|↳ 機能|Siri から PC に付箋を送る|**不足：対応テスト未確認**<br>確認範囲：不足。API拒否/制限の単体だけで実Siri→PC到着を保証しない|
|1-4.1.1|　↳ ソース|[app/api/siri-send/route.ts](../app/api/siri-send/route.ts)|[app/api/siri-send/route.test.ts](../app/api/siri-send/route.test.ts)<br>概要（代表ケース）：rejects requests larger than 16KB before calling Google ／ rejects text longer than the note limit|

## 要求1-5　ファイル名を考えたくない

表1-5：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|1-5|要求|要求1-5　ファイル名を考えたくない|**不足：対応テスト未確認**<br>確認範囲：不足：命名/改名の単体はあるが利用者操作からの受入がない|
|1-5.1|↳ 機能|ファイル名の自動生成|**不足：対応テスト未確認**<br>確認範囲：不足。生成/保存の単体をつないだ新規作成の確認が必要|
|1-5.1.1|　↳ ソース|[src-tauri/src/logic.rs](../src-tauri/src/logic.rs)|[src-tauri/src/logic.rs 内のテスト](../src-tauri/src/logic.rs)<br>概要（代表ケース）：sanitize_basic ／ sanitize_removes_all_forbidden_chars|
|1-5.1.2|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|1-5.2|↳ 機能|ファイル名の本文連動|[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)<br>概要：保存成功/失敗・直列化<br>確認範囲：一部。遅延保存の呼出順を確認。実ファイルの改名・再起動は別|
|1-5.2.1|　↳ ソース|[src-tauri/src/logic.rs](../src-tauri/src/logic.rs)|[src-tauri/src/logic.rs 内のテスト](../src-tauri/src/logic.rs)<br>概要（代表ケース）：sanitize_basic ／ sanitize_removes_all_forbidden_chars|
|1-5.2.2|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|

## 要求1-6　保存場所は自分で決めたい

表1-6：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|1-6|要求|要求1-6　保存場所は自分で決めたい|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：保存先を表示<br>確認範囲：一部：現在の場所の表示だけ。初回選択と実保存/切替利用は不足|
|1-6.1|↳ 機能|初回セットアップで保存先（Vault）を選択|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：保存先を表示<br>確認範囲：一部。既存E2Eは現在の保存先表示のみ。初回選択→実保存は未確認|
|1-6.1.1|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|1-6.1.2|　↳ ソース|[lib/settings-store.ts](../lib/settings-store.ts)|[lib/settings-store.test.ts](../lib/settings-store.test.ts)<br>概要（代表ケース）：loads default settings initially ／ loads settings from localStorage if available|

## 要求2-1　大事な一文を、ひと目で目立たせたい

表2-1：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|2-1|要求|要求2-1　大事な一文を、ひと目で目立たせたい|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>[e2e/pwa-bold.spec.ts](../e2e/pwa-bold.spec.ts)<br>概要：PCの太字操作・PWA赤文字・再表示<br>確認範囲：一部：PCの書式操作/PWAの赤色と保持。全端末/実配送ではない|
|2-1.1|↳ 機能|太字の朱表示|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：PCの太字操作<br>確認範囲：一部。PC E2Eは書式操作を確認。PC赤色の視認条件までの専用assertは未同定|
|2-1.1.1|　↳ ソース|**未確認**（対応テスト：[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)）|[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)<br>概要（代表ケース）：keeps code-block keys distinct from source line keys ／ continues scrolling when the first gesture changes from a horizontal delta to zero deltas|
|2-1.2|↳ 機能|フローティングフォーマットバー|[app/components/FloatingFormatBar.test.tsx](../app/components/FloatingFormatBar.test.tsx)<br>[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：選択バーのボタン呼出・PCの太字操作<br>確認範囲：一部。部品の呼出と太字操作。全ボタン/配置の実操作一式ではない|
|2-1.2.1|　↳ ソース|[app/components/FloatingFormatBar.tsx](../app/components/FloatingFormatBar.tsx)|[app/components/FloatingFormatBar.test.tsx](../app/components/FloatingFormatBar.test.tsx)<br>概要（代表ケース）：太字・見出し・箇条書き・チェックの4ボタンが表示される ／ 英語では太字ボタンのラベルが Bold になる|
|2-1.3|↳ 機能|編集用ホットキー|[e2e/hotkey-disable.spec.ts](../e2e/hotkey-disable.spec.ts)<br>概要：編集キー変更・失敗復帰<br>確認範囲：ブラウザーの編集キー範囲。全OSキー登録の保証ではない|
|2-1.3.1|　↳ ソース|[app/utils/shortcutKey.ts](../app/utils/shortcutKey.ts)|[app/utils/shortcutKey.test.ts](../app/utils/shortcutKey.test.ts)<br>概要：キー入力と設定の一致・重複・対象外入力・表示を確認。Ctrl＋Nなどの組合せを読み取り、Ctrlだけ・Nだけは除外する。|
|2-1.3.2|　↳ ソース|[src-tauri/src/hotkey_manager.rs](../src-tauri/src/hotkey_manager.rs)|[src-tauri/src/hotkey_manager.rs 内のテスト](../src-tauri/src/hotkey_manager.rs)<br>概要：予約済みキーの拒否、キー設定の読込・保存、無効設定の保持を確認。|
|2-1.4|↳ 機能|PWAの強調表示|[e2e/pwa-bold.spec.ts](../e2e/pwa-bold.spec.ts)<br>概要：PWA赤文字・再表示<br>確認範囲：受信相当データによるブラウザー確認。実PC配送/実iOSは別|
|2-1.4.1|　↳ ソース|**未確認**（対応テスト：[app/viewer/NoteListStep.rendering.test.tsx](../app/viewer/NoteListStep.rendering.test.tsx)）|[app/viewer/NoteListStep.rendering.test.tsx](../app/viewer/NoteListStep.rendering.test.tsx)<br>概要（代表ケース）：一覧の受信本文を朱の太字にし、元のMarkdownを開く処理へ渡す ／ 編集中の太字とチェック項目を表示し、保存時に強調記号を保持する|

## 要求2-2　画像に、そのまま書き込みたい

表2-2：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|2-2|要求|要求2-2　画像に、そのまま書き込みたい|**不足：対応テスト未確認**<br>確認範囲：不足：計算/履歴/再表示部品だけでは、描く→実保存→再表示の受入にならない|
|2-2.1|↳ 機能|画像への描き込み|[app/components/ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)<br>概要：保存済み画像の再表示<br>確認範囲：一部。保存済み画像の読込部品まで。描画→合成保存→再表示は不足|
|2-2.1.1|　↳ ソース|**未確認**（対応テスト：[app/components/ImageAnnotationModal.test.ts](../app/components/ImageAnnotationModal.test.ts)）|[app/components/ImageAnnotationModal.test.ts](../app/components/ImageAnnotationModal.test.ts)<br>概要（代表ケース）：starts with the requested green highlighter settings ／ uses a large annotation window that keeps the footer visible|
|2-2.1.2|　↳ ソース|[app/utils/annotationHistory.ts](../app/utils/annotationHistory.ts)|[app/utils/annotationHistory.test.ts](../app/utils/annotationHistory.test.ts)<br>概要（代表ケース）：undoes and redoes drawings across different tools in operation order ／ discards redo drawings when a new drawing is recorded|
|2-2.2|↳ 機能|トリミング|[app/components/ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)<br>概要：保存済み画像の再表示<br>確認範囲：一部。矩形計算と再表示寸法はあるが操作から実保存まで不足|
|2-2.2.1|　↳ ソース|[app/utils/imageCrop.ts](../app/utils/imageCrop.ts)|[app/utils/imageCrop.test.ts](../app/utils/imageCrop.test.ts)<br>概要（代表ケース）：逆向きのドラッグでも画像内の範囲を選ぶ ／ クリックや細すぎる範囲を切り取りとして保存しない|
|2-2.2.2|　↳ ソース|[app/utils/fitCroppedNote.ts](../app/utils/fitCroppedNote.ts)|[app/utils/fitCroppedNote.test.ts](../app/utils/fitCroppedNote.test.ts)<br>概要（代表ケース）：shrinks the cropped image and removes unused height ／ respects image display scale and accompanying text height|
|2-2.3|↳ 機能|画像の表示サイズ変更|[app/components/ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)<br>概要：保存済み画像の再表示<br>確認範囲：一部。倍率を渡した再表示まで。ドラッグ→倍率保存の全体は別|
|2-2.3.1|　↳ ソース|[app/components/ResizableImage.tsx](../app/components/ResizableImage.tsx)|[app/components/ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)<br>概要（代表ケース）：reports the reloaded crop dimensions at the saved display scale ／ places the annotation action at the image top-left away from the note toolbar|

## 要求2-3　畳んでも、項目（見出し）は見えていてほしい

表2-3：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|2-3|要求|要求2-3　畳んでも、項目（見出し）は見えていてほしい|[e2e/editor-outline.spec.ts](../e2e/editor-outline.spec.ts)<br>概要：編集/表示の折畳保持<br>確認範囲：一部：本文の部分折りたたみ。窓全体の折りたたみ/再起動保持は不足|
|2-3.1|↳ 機能|付箋全体の折りたたみ（△／▽）|[app/components/StickyNote.test.tsx](../app/components/StickyNote.test.tsx)<br>概要：本文展開・状態保存呼出<br>確認範囲：一部。展開と保存呼出のみ。実窓縮小/再起動保持は別|
|2-3.1.1|　↳ ソース|[app/components/StickyNote.tsx](../app/components/StickyNote.tsx)|[app/components/StickyNote.test.tsx](../app/components/StickyNote.test.tsx)<br>概要（代表ケース）：タグなしではアーカイブへの移動と表示する ／ Windows canonicalパスの同期通知で閲覧中の付箋を再読込する|
|2-3.2|↳ 機能|本文の一部分の折りたたみ|[e2e/editor-outline.spec.ts](../e2e/editor-outline.spec.ts)<br>概要：編集/表示の折畳保持<br>確認範囲：Tauriモック。ブラウザー内の編集/表示接続を確認|
|2-3.2.1|　↳ ソース|[app/utils/editorOutline.ts](../app/utils/editorOutline.ts)|[app/utils/editorOutline.test.ts](../app/utils/editorOutline.test.ts)<br>概要（代表ケース）：keeps the image and child inside the same hidden range ／ rejects edits that would delete hidden text but permits edits outside it|
|2-3.2.2|　↳ ソース|[app/utils/outline.ts](../app/utils/outline.ts)|[app/utils/outline.test.ts](../app/utils/outline.test.ts)<br>概要（代表ケース）：derives hierarchy and hides every descendant of a collapsed parent ／ keeps the existing two-space hierarchy as the default for ordinary lines|

## 要求2-4　構造を整理して見せたい

表2-4：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|2-4|要求|要求2-4　構造を整理して見せたい|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>[e2e/editor-outline.spec.ts](../e2e/editor-outline.spec.ts)<br>概要：選択文字→表記法・選択文字→図の記法・編集/表示の折畳保持<br>確認範囲：一部：生成操作と部分折りたたみ。全形式の保存/完成表示を通した受入は不足|
|2-4.1|↳ 機能|見出し|[e2e/editor-outline.spec.ts](../e2e/editor-outline.spec.ts)<br>概要：編集/表示の折畳保持<br>確認範囲：一部。全見出しレベルは部品試験。全操作の通し確認ではない|
|2-4.1.1|　↳ ソース|**未確認**（対応テスト：[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)）|[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)<br>概要（代表ケース）：keeps code-block keys distinct from source line keys ／ continues scrolling when the first gesture changes from a horizontal delta to zero deltas|
|2-4.2|↳ 機能|チェックリスト|[app/shared/page.test.tsx](../app/shared/page.test.tsx)<br>概要：Webチェック保存・失敗復帰<br>確認範囲：一部。Web共有の操作と保存呼出/失敗復帰。PCの実保存/再起動は別|
|2-4.2.1|　↳ ソース|**未確認**（対応テスト：[app/utils/checkboxToggle.test.ts](../app/utils/checkboxToggle.test.ts)）|[app/utils/checkboxToggle.test.ts](../app/utils/checkboxToggle.test.ts)<br>概要（代表ケース）：未チェックのボックスをチェック状態に変更できる ／ チェック済みのボックスを未チェック状態に変更できる|
|2-4.2.2|　↳ ソース|**未確認**（対応テスト：[app/components/RichTextEditor.checkboxDecoration.test.ts](../app/components/RichTextEditor.checkboxDecoration.test.ts)）|[app/components/RichTextEditor.checkboxDecoration.test.ts](../app/components/RichTextEditor.checkboxDecoration.test.ts)<br>概要（代表ケース）：does not include the space before checkbox text ／ does not include the space before normal list text|
|2-4.3|↳ 機能|テーブル|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：選択文字→表記法<br>確認範囲：一部。E2Eは表記法への変換まで。完成表の表示/再保存は未確認|
|2-4.3.1|　↳ ソース|**未確認**（対応テスト：[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)）|[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)<br>概要（代表ケース）：keeps code-block keys distinct from source line keys ／ continues scrolling when the first gesture changes from a horizontal delta to zero deltas|
|2-4.4|↳ 機能|Mermaid 図|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：選択文字→図の記法<br>確認範囲：一部。ブロック変換と描画安全性は別試験。編集→保存→再表示の全体は不足|
|2-4.4.1|　↳ ソース|[app/utils/mermaid.ts](../app/utils/mermaid.ts)|[app/utils/mermaid.test.ts](../app/utils/mermaid.test.ts)<br>概要（代表ケース）：Mermaid を strict セキュリティ設定で初期化する ／ renders within the source limit and rejects an oversized diagram before parsing|
|2-4.4.2|　↳ ソース|**未確認**（対応テスト：[app/utils/mermaidSecurity.browser.test.ts](../app/utils/mermaidSecurity.browser.test.ts)）|[app/utils/mermaidSecurity.browser.test.ts](../app/utils/mermaidSecurity.browser.test.ts)<br>概要（代表ケース）：preserves Japanese labels, arrows and ordinary colors ／ still renders a normal diagram after hostile input|
|2-4.5|↳ 機能|日付・時刻の挿入|**不足：対応テスト未確認**<br>確認範囲：不足。該当操作を通す専用ケースは未同定|
|2-4.5.1|　↳ ソース|[app/hooks/useStickyNoteContextMenu.ts](../app/hooks/useStickyNoteContextMenu.ts)|[app/hooks/useStickyNoteContextMenu.test.ts](../app/hooks/useStickyNoteContextMenu.test.ts)<br>概要（代表ケース）：filters reserved tags ／ creates stable tag ids|

## 要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）

表2-5：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|2-5|要求|要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）|**不足：対応テスト未確認**<br>確認範囲：不足：値の定義/OS呼出のモックでは実際の目立ち方を判定できない|
|2-5.1|↳ 機能|最前面に固定（ピン留め）|**不足：対応テスト未確認**<br>確認範囲：不足。値/別窓のモック試験を、付箋の実OS最前面の成立にしない|
|2-5.1.1|　↳ ソース|[app/utils/noteAppearance.ts](../app/utils/noteAppearance.ts)|[app/utils/noteAppearance.test.ts](../app/utils/noteAppearance.test.ts)<br>概要（代表ケース）：付箋で共有する5色を一元管理する ／ 付箋で共有する文字サイズを一元管理する|
|2-5.2|↳ 機能|色分け（背景色5色）|**不足：対応テスト未確認**<br>確認範囲：不足。色の定義の単体だけでは画面と保存までを確認できない|
|2-5.2.1|　↳ ソース|[app/utils/noteAppearance.ts](../app/utils/noteAppearance.ts)|[app/utils/noteAppearance.test.ts](../app/utils/noteAppearance.test.ts)<br>概要（代表ケース）：付箋で共有する5色を一元管理する ／ 付箋で共有する文字サイズを一元管理する|
|2-5.3|↳ 機能|透明度3段階|**不足：対応テスト未確認**<br>確認範囲：不足。lib.rsの実OS反映と保持は未確認|
|2-5.3.1|　↳ ソース|**未確認**|**不足：専用ソーステスト未確認**|
|2-5.4|↳ 機能|文字サイズ|**不足：対応テスト未確認**<br>確認範囲：不足。サイズの定義の単体だけでは画面と保存までを確認できない|
|2-5.4.1|　↳ ソース|[app/utils/noteAppearance.ts](../app/utils/noteAppearance.ts)|[app/utils/noteAppearance.test.ts](../app/utils/noteAppearance.test.ts)<br>概要（代表ケース）：付箋で共有する5色を一元管理する ／ 付箋で共有する文字サイズを一元管理する|

## 要求2-6　時刻になったら知らせてほしい

表2-6：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|2-6|要求|要求2-6　時刻になったら知らせてほしい|**不足：対応テスト未確認**<br>確認範囲：不足：日時/言語/前面判定の単体のみ。時刻発火→OS通知の受入はない|
|2-6.1|↳ 機能|アラーム|**不足：対応テスト未確認**<br>確認範囲：不足。日時/前面判定/言語だけで時刻発火の一連を保証しない|
|2-6.1.1|　↳ ソース|[app/utils/alarmDateTime.ts](../app/utils/alarmDateTime.ts)|[app/utils/alarmDateTime.test.ts](../app/utils/alarmDateTime.test.ts)<br>概要（代表ケース）：formats an English alarm date without Japanese weekday characters ／ keeps the Japanese weekday format for Japanese|
|2-6.1.2|　↳ ソース|[app/utils/alarmAlwaysOnTop.ts](../app/utils/alarmAlwaysOnTop.ts)|[app/utils/alarmAlwaysOnTop.test.ts](../app/utils/alarmAlwaysOnTop.test.ts)<br>概要（代表ケース）：uses false while the original pin state is not loaded ／ preserves loaded boolean pin states|
|2-6.1.3|　↳ ソース|**未確認**（対応テスト：[app/components/AlarmDialog.language.test.tsx](../app/components/AlarmDialog.language.test.tsx)）|[app/components/AlarmDialog.language.test.tsx](../app/components/AlarmDialog.language.test.tsx)<br>概要（代表ケース）：passes the English locale to the Windows/WebView datetime input|

## 要求3-1　PCを開いたら、いつもの場所にいてほしい

表3-1：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|3-1|要求|要求3-1　PCを開いたら、いつもの場所にいてほしい|**不足：対応テスト未確認**<br>確認範囲：不足：復元順序/ファイルの単体のみ。実OS再起動からの受入は別|
|3-1.1|↳ 機能|起動時の状態復元|**不足：対応テスト未確認**<br>確認範囲：不足。実再起動からの復元は別。起動順序の単体のみで合格にしない|
|3-1.1.1|　↳ ソース|[app/utils/startupRestore.ts](../app/utils/startupRestore.ts)|[app/utils/startupRestore.test.ts](../app/utils/startupRestore.test.ts)<br>概要（代表ケース）：案内表示中は起動完了時の%sを実行しない ／ 案内がない場合は従来の%sを維持する|
|3-1.1.2|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|3-1.2|↳ 機能|マルチモニター救済|**不足：対応テスト未確認**<br>確認範囲：不足。新規位置の計算は関連のみ。実モニター変更による既存窓救済は未確認|
|3-1.2.1|　↳ ソース|[app/utils/newNotePosition.ts](../app/utils/newNotePosition.ts)|[app/utils/newNotePosition.test.ts](../app/utils/newNotePosition.test.ts)<br>概要（代表ケース）：centers within the usable area above the taskbar ／ uses the selected monitor coordinates and DPI, including negative origins|

## 要求3-2　家の外でも見たい・続きをしたい

表3-2：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|3-2|要求|要求3-2　家の外でも見たい・続きをしたい|[e2e/iphone-roundtrip.spec.ts](../e2e/iphone-roundtrip.spec.ts)<br>[e2e/pwa-recovery.spec.ts](../e2e/pwa-recovery.spec.ts)<br>[e2e/pwa-video-local.spec.ts](../e2e/pwa-video-local.spec.ts)<br>[e2e/shared-storage.spec.ts](../e2e/shared-storage.spec.ts)<br>概要：PWA返送→PC比較選択・PWA再起動・オフライン復元・PWA送信済み動画の再生・Web画像取得・草稿保持<br>確認範囲：一部：ブラウザー/検証データ。実端末/実通信/PC配達は別。動画の送信済み化は模擬|
|3-2.1|↳ 機能|iPhone に送る（PC → iPhone）|[e2e/pc-to-iphone-image.spec.ts](../e2e/pc-to-iphone-image.spec.ts)<br>[e2e/pwa-recovery.spec.ts](../e2e/pwa-recovery.spec.ts)<br>[e2e/pwa-bold.spec.ts](../e2e/pwa-bold.spec.ts)<br>概要：PWA受信画像の表示・PWA再起動・オフライン復元・PWA赤文字・再表示<br>確認範囲：一部。受信相当データの表示/端末保持。実PC→Drive→Push配送は別|
|3-2.1.1|　↳ ソース|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](../src-tauri/src/lib.rs)<br>概要（代表ケース）：duplicate_trash_operation_is_rejected_until_first_finishes ／ different_paths_can_be_deleted_without_an_artificial_delay|
|3-2.1.2|　↳ ソース|[app/viewer/lib/push.ts](../app/viewer/lib/push.ts)|[app/viewer/lib/push.test.ts](../app/viewer/lib/push.test.ts)<br>概要（代表ケース）：正常系: 4段階の進捗を順番に通り、setStep("write") に遷移する ／ 通知拒否: setErrorMessage に「通知を許可してください」、setStep は呼ばれない|
|3-2.2|↳ 機能|通知常駐（ロックだぜ）|[e2e/lock-notification.spec.ts](../e2e/lock-notification.spec.ts)<br>概要：PWA通知API・開くID<br>確認範囲：一部。通知APIモック。実ロック画面での常駐/OS制約は別|
|3-2.2.1|　↳ ソース|[app/viewer/lib/notification-navigation.ts](../app/viewer/lib/notification-navigation.ts)|[app/viewer/lib/notification-navigation.test.ts](../app/viewer/lib/notification-navigation.test.ts)<br>概要（代表ケース）：URLで指定された通知IDを他のクエリより優先して取得する ／ 保存直後に読めなくても対象IDだけを再試行する|
|3-2.2.2|　↳ ソース|[app/viewer/lib/push.ts](../app/viewer/lib/push.ts)|[app/viewer/lib/push.test.ts](../app/viewer/lib/push.test.ts)<br>概要（代表ケース）：正常系: 4段階の進捗を順番に通り、setStep("write") に遷移する ／ 通知拒否: setErrorMessage に「通知を許可してください」、setStep は呼ばれない|
|3-2.3|↳ 機能|iPhone から PC へ送る|[e2e/iphone-roundtrip.spec.ts](../e2e/iphone-roundtrip.spec.ts)<br>[app/components/IphoneReturnDialog.test.tsx](../app/components/IphoneReturnDialog.test.tsx)<br>[app/viewer/__tests__/FileAttachmentSemantics.test.tsx](../app/viewer/__tests__/FileAttachmentSemantics.test.tsx)<br>[app/viewer/__tests__/VideoAttachmentSemantics.test.tsx](../app/viewer/__tests__/VideoAttachmentSemantics.test.tsx)<br>概要：PWA返送→PC比較選択・PC/iPhone比較・反映選択・添付送信・失敗時保持・複数動画・容量不足の拒否<br>確認範囲：一部。受渡し/PC/Driveはモック範囲。実到着は別。動画再生/端末保存は下位分岐参照|
|3-2.3.1|　↳ ソース|[app/utils/receiveIphoneNote.ts](../app/utils/receiveIphoneNote.ts)|[app/utils/receiveIphoneNote.test.ts](../app/utils/receiveIphoneNote.test.ts)<br>概要（代表ケース）：R16 stores assets and creates the PC note before acknowledging the iPhone queue ／ does not acknowledge the iPhone queue when asset storage fails|
|3-2.3.2|　↳ ソース|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](../src-tauri/src/lib.rs)<br>概要（代表ケース）：duplicate_trash_operation_is_rejected_until_first_finishes ／ different_paths_can_be_deleted_without_an_artificial_delay|
|3-2.4|↳ 機能|Web共有|[e2e/shared-storage.spec.ts](../e2e/shared-storage.spec.ts)<br>[e2e/shared-launcher-order.spec.ts](../e2e/shared-launcher-order.spec.ts)<br>概要：Web画像取得・草稿保持・Webの並びと取得失敗<br>確認範囲：一部。検証用Drive応答。実PC/Driveへの到着と競合解消は別|
|3-2.4.1|　↳ ソース|[app/shared/page.tsx](../app/shared/page.tsx)|[app/shared/page.test.tsx](../app/shared/page.test.tsx)<br>概要（代表ケース）：retains the automatically selected PC order when the next order read fails, while showing updated content and a warning ／ uses the only PC order and keeps the current note selected across reordering and refresh|
|3-2.4.2|　↳ ソース|[app/shared/lib/drive.ts](../app/shared/lib/drive.ts)|[app/shared/lib/drive.test.ts](../app/shared/lib/drive.test.ts)<br>概要（代表ケース）：rereads mutable PC order, validates its folder/ETag and rejects duplicates without replacing the old list ／ loads a saved creation before Windows import and replaces it without duplication after publication|
|3-2.4.3|　↳ ソース|[src-tauri/src/web_share_snapshot.rs](../src-tauri/src/web_share_snapshot.rs)|[src-tauri/src/web_share_snapshot.rs 内のテスト](../src-tauri/src/web_share_snapshot.rs)<br>概要（代表ケース）：reservation_readback_must_match_all_control_and_content_fields ／ save_cas_conflict_never_overwrites_the_other_terminal|

## 要求3-3　増えても、デスクトップが散らからないでほしい

表3-3：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|3-3|要求|要求3-3　増えても、デスクトップが散らからないでほしい|[e2e/archive-restore.spec.ts](../e2e/archive-restore.spec.ts)<br>[e2e/quick-launcher.spec.ts](../e2e/quick-launcher.spec.ts)<br>[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)<br>概要：保管の選択・復元操作・狭い一覧のタグ選択・隠す操作・失敗時保持<br>確認範囲：一部：UI/モック。実ファイル・実窓を一巡する受入は不足|
|3-3.1|↳ 機能|タグで整列（カンバン整列）|**不足：対応テスト未確認**<br>確認範囲：不足。配置計算の単体と実窓の並べ替えを区別|
|3-3.1.1|　↳ ソース|[src-tauri/src/arrange.rs](../src-tauri/src/arrange.rs)|[src-tauri/src/arrange.rs 内のテスト](../src-tauri/src/arrange.rs)<br>概要（代表ケース）：classify_tagged_yellow_as_kanban_yellow ／ classify_tagged_white_as_kanban_extra|
|3-3.2|↳ 機能|タグで絞り込み|[e2e/quick-launcher.spec.ts](../e2e/quick-launcher.spec.ts)<br>概要：狭い一覧のタグ選択<br>確認範囲：一部。ランチャーのブラウザー範囲。実OSの窓を隠す処理とは別|
|3-3.2.1|　↳ ソース|[app/components/LauncherTagFilter.tsx](../app/components/LauncherTagFilter.tsx)|[app/components/LauncherTagFilter.test.tsx](../app/components/LauncherTagFilter.test.tsx)<br>概要（代表ケース）：exposes whole fitting tags only, with All, expansion and management always available ／ shows all choices in their original order and collapses onto the chosen tag|
|3-3.2.2|　↳ ソース|**未確認**（対応テスト：[app/components/QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)）|[app/components/QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)<br>概要（代表ケース）：maps tabs to reserved tags ／ normalizes missing or unknown last tab to recipe|
|3-3.3|↳ 機能|全部隠す／全部戻す|**不足：対応テスト未確認**<br>確認範囲：不足。全窓の実OS操作を確認する専用機能試験は未同定|
|3-3.3.1|　↳ ソース|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](../src-tauri/src/lib.rs)<br>概要（代表ケース）：duplicate_trash_operation_is_rejected_until_first_finishes ／ different_paths_can_be_deleted_without_an_artificial_delay|
|3-3.4|↳ 機能|フォルダーに保管|[e2e/archive-restore.spec.ts](../e2e/archive-restore.spec.ts)<br>[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)<br>[app/components/ArchivedNotesRestoreDialog.test.tsx](../app/components/ArchivedNotesRestoreDialog.test.tsx)<br>概要：保管の選択・復元操作・隠す操作・失敗時保持・保管選択・失敗復帰<br>確認範囲：一部。UIの保管/復元はモック。実ファイル移動はRust単体で別確認|
|3-3.4.1|　↳ ソース|[app/utils/archiveRestore.ts](../app/utils/archiveRestore.ts)|[app/utils/archiveRestore.test.ts](../app/utils/archiveRestore.test.ts)<br>概要（代表ケース）：returns only the five newest notes ／ counts Archive and tag locations|
|3-3.4.2|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|3-3.5|↳ 機能|ランチャーに登録して画面から隠す|[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)<br>概要：隠す操作・失敗時保持<br>確認範囲：一部。API呼出/失敗時保持は確認。実窓再表示/再起動保持は別|
|3-3.5.1|　↳ ソース|[src-tauri/src/favorite_storage.rs](../src-tauri/src/favorite_storage.rs)|[src-tauri/src/favorite_storage.rs 内のテスト](../src-tauri/src/favorite_storage.rs)<br>概要：未確認|
|3-3.5.2|　↳ ソース|**未確認**（対応テスト：[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)）|[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)<br>概要（代表ケース）：stores the selected favorite without opening its row or hiding the launcher ／ takes out a non-favorite from stored notes without adding favorite registration|

## 要求3-4　昔のメモを、すぐ見つけたい

表3-4：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|3-4|要求|要求3-4　昔のメモを、すぐ見つけたい|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>[e2e/quick-launcher.spec.ts](../e2e/quick-launcher.spec.ts)<br>概要：検索からメモを選択・狭い一覧のタグ選択<br>確認範囲：一部：検証一覧の検索/タグ選択。実Vault全件/応答時間/実窓再利用は別|
|3-4.1|↳ 機能|全文検索|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：検索からメモを選択<br>確認範囲：一部。検索/前面化のモック。実Vault全体と応答時間は別|
|3-4.1.1|　↳ ソース|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](../src-tauri/src/lib.rs)<br>概要（代表ケース）：duplicate_trash_operation_is_rejected_until_first_finishes ／ different_paths_can_be_deleted_without_an_artificial_delay|
|3-4.1.2|　↳ ソース|[app/components/SearchOverlay.tsx](../app/components/SearchOverlay.tsx)|[app/components/SearchOverlay.test.tsx](../app/components/SearchOverlay.test.tsx)<br>概要（代表ケース）：プール由来で開いている同じ付箋には新しい窓を作らず、既存窓を前面化する|
|3-4.2|↳ 機能|クイックランチャー|[e2e/quick-launcher.spec.ts](../e2e/quick-launcher.spec.ts)<br>[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)<br>概要：狭い一覧のタグ選択・隠す操作・失敗時保持<br>確認範囲：一部。タグ/保管操作。実OSで開くこと・全タブの受入は別|
|3-4.2.1|　↳ ソース|[src-tauri/src/launcher.rs](../src-tauri/src/launcher.rs)|[src-tauri/src/launcher.rs 内のテスト](../src-tauri/src/launcher.rs)<br>概要：未確認|
|3-4.2.2|　↳ ソース|**未確認**（対応テスト：[app/components/QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)）|[app/components/QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)<br>概要（代表ケース）：maps tabs to reserved tags ／ normalizes missing or unknown last tab to recipe|
|3-4.3|↳ 機能|タグ付けとタグフォルダ|[app/components/LauncherTagActions.test.tsx](../app/components/LauncherTagActions.test.tsx)<br>概要：タグ管理・部分失敗保持<br>確認範囲：一部。管理部品の追加/部分失敗まで。PCのタグフォルダを通す専用試験は未同定|
|3-4.3.1|　↳ ソース|[app/utils/reservedTags.ts](../app/utils/reservedTags.ts)|[app/utils/reservedTags.test.ts](../app/utils/reservedTags.test.ts)<br>概要（代表ケース）：defines the five reserved tags ／ detects reserved tags case-insensitively and trims spaces|
|3-4.3.2|　↳ ソース|[app/components/LauncherTagActions.tsx](../app/components/LauncherTagActions.tsx)|[app/components/LauncherTagActions.test.tsx](../app/components/LauncherTagActions.test.tsx)<br>概要（代表ケース）：creates an unused tag and refreshes without assigning it to any note ／ requires explicit delete after displaying affected count|
|3-4.3.3|　↳ ソース|[app/hooks/useTagManager.ts](../app/hooks/useTagManager.ts)|[app/hooks/useTagManager.test.ts](../app/hooks/useTagManager.test.ts)<br>概要（代表ケース）：blocks reserved tags before UI add paths call Rust ／ allows normal user tags|

## 補助ブランチA：基盤（土台）

表補助A：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|補助A|要求|補助ブランチA：基盤（土台）|**未確認：支える要求の対応未整理**|
|補助A.1|↳ 機能|Markdown ファイル保存|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)<br>概要：編集終了→保存呼出・保存成功/失敗・直列化<br>確認範囲：一部。ブラウザー側は保存モック。実読書きのRust試験と組み合わせてもOS終了復元は別|
|補助A.1.1|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|補助A.2|↳ 機能|アトミック保存と破損防止|**不足：対応テスト未確認**<br>確認範囲：不足。実ファイルの単体はあるが利用者操作から復旧までの上位試験は未同定|
|補助A.2.1|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|補助A.3|↳ 機能|手動バックアップ|[app/components/BackupResultDialog.test.tsx](../app/components/BackupResultDialog.test.tsx)<br>概要：バックアップ結果表示<br>確認範囲：一部。結果画面と保存処理は別。操作から成果物の照合まで不足|
|補助A.3.1|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|補助A.3.2|　↳ ソース|[app/components/BackupResultDialog.tsx](../app/components/BackupResultDialog.tsx)|[app/components/BackupResultDialog.test.tsx](../app/components/BackupResultDialog.test.tsx)<br>概要（代表ケース）：shows an unmistakable success result and backup facts ／ keeps the result visible until the user closes it|
|補助A.4|↳ 機能|月次安全バックアップ|**不足：対応テスト未確認**<br>確認範囲：不足。月次処理の単体と実起動契機/日付をまたぐ動作を区別|
|補助A.4.1|　↳ ソース|[src-tauri/src/maintenance.rs](../src-tauri/src/maintenance.rs)|[src-tauri/src/maintenance.rs 内のテスト](../src-tauri/src/maintenance.rs)<br>概要：未確認|
|補助A.4.2|　↳ ソース|[app/utils/monthlyBackupSettings.ts](../app/utils/monthlyBackupSettings.ts)|[app/utils/monthlyBackupSettings.test.ts](../app/utils/monthlyBackupSettings.test.ts)<br>概要（代表ケース）：enables automatic backup and resets prompt state in one update ／ disables automatic backup without changing its history|
|補助A.4.3|　↳ ソース|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](../src-tauri/src/lib.rs)<br>概要（代表ケース）：duplicate_trash_operation_is_rejected_until_first_finishes ／ different_paths_can_be_deleted_without_an_artificial_delay|
|補助A.5|↳ 機能|バックアップからの復旧|**不足：対応テスト未確認**<br>確認範囲：不足。restore_backup_testsのファイル検証はあるが再起動利用までの通し確認は別|
|補助A.5.1|　↳ ソース|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|[src-tauri/src/lib.rs 内のテスト](../src-tauri/src/lib.rs)<br>概要（代表ケース）：duplicate_trash_operation_is_rejected_until_first_finishes ／ different_paths_can_be_deleted_without_an_artificial_delay|
|補助A.6|↳ 機能|削除とごみ箱|**不足：対応テスト未確認**<br>確認範囲：不足。PCの実操作→ごみ箱→復元の専用上位試験は未同定。PWA削除とは別|
|補助A.6.1|　↳ ソース|[src-tauri/src/trash_history.rs](../src-tauri/src/trash_history.rs)|[src-tauri/src/trash_history.rs 内のテスト](../src-tauri/src/trash_history.rs)<br>概要（代表ケース）：concurrent_records_remain_complete_without_missing_ids ／ subprocess_worker|
|補助A.6.2|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|補助A.7|↳ 機能|ごみ箱の90日整理|**不足：対応テスト未確認**<br>確認範囲：一部の安全停止E2Eは後述。期限判定から実削除までの上位試験は未同定|
|補助A.7.1|　↳ ソース|[src-tauri/src/trash_cleanup.rs](../src-tauri/src/trash_cleanup.rs)|[src-tauri/src/trash_cleanup.rs 内のテスト](../src-tauri/src/trash_cleanup.rs)<br>概要（代表ケース）：policy_defaults_off_and_never_reactivates_after_location_change ／ excess_expired_notes_wait_for_next_batch_and_oversized_files_are_retained|
|補助A.8|↳ 機能|インポート|**不足：対応テスト未確認**<br>確認範囲：不足。ファイル処理と一覧再読取の単体だけで全操作成立としない|
|補助A.8.1|　↳ ソース|[src-tauri/src/import.rs](../src-tauri/src/import.rs)|[src-tauri/src/import.rs 内のテスト](../src-tauri/src/import.rs)<br>概要（代表ケース）：imported_markdown_paths_point_to_the_copied_notes ／ import_removes_old_window_and_font_settings_but_keeps_content_metadata|
|補助A.8.2|　↳ ソース|[app/utils/importRefresh.ts](../app/utils/importRefresh.ts)|[app/utils/importRefresh.test.ts](../app/utils/importRefresh.test.ts)<br>概要（代表ケース）：一覧同期後に取り込んだ付箋をすべて表示し直す|
|補助A.9|↳ 機能|保存先（Vault）の変更|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)<br>概要：保存先を表示<br>確認範囲：一部。既存E2Eは保存先の表示のみ。切替後の実利用は未確認|
|補助A.9.1|　↳ ソース|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|[src-tauri/src/storage.rs 内のテスト](../src-tauri/src/storage.rs)<br>概要（代表ケース）：legacy_settings_default_reconfirmation_marker_without_changing_denial ／ conditional_note_write_preserves_newer_content|
|補助A.9.2|　↳ ソース|[lib/settings-store.ts](../lib/settings-store.ts)|[lib/settings-store.test.ts](../lib/settings-store.test.ts)<br>概要（代表ケース）：loads default settings initially ／ loads settings from localStorage if available|
|補助A.10|↳ 機能|プライバシー設計|**不足：対応テスト未確認**<br>確認範囲：不足。暗号化/OAuthの単体だけで外部通信全体・保存先・ログの受入としない|
|補助A.10.1|　↳ ソース|[src-tauri/src/gdrive.rs](../src-tauri/src/gdrive.rs)|[src-tauri/src/gdrive.rs 内のテスト](../src-tauri/src/gdrive.rs)<br>概要（代表ケース）：web_share_inventory_preserves_names_versions_and_json_filter ／ test_get_token_path_returns_valid_path|
|補助A.11|↳ 機能|効果音|**不足：対応テスト未確認**<br>確認範囲：不足。設定値の単体のみ。実音の発生は別|
|補助A.11.1|　↳ ソース|[app/utils/soundPreferences.ts](../app/utils/soundPreferences.ts)|[app/utils/soundPreferences.test.ts](../app/utils/soundPreferences.test.ts)<br>概要（代表ケース）：keeps supported choices and falls back to default for unknown values ／ maps every daily PC scene to its own persisted setting|
|補助A.12|↳ 機能|多言語（日本語／英語）|[e2e/settings-english.spec.ts](../e2e/settings-english.spec.ts)<br>[e2e/pwa-language.spec.ts](../e2e/pwa-language.spec.ts)<br>概要：PC設定の英語表示・PWA言語と再起動保持<br>確認範囲：一部。対象画面のブラウザー範囲。全画面/OSの言語受入ではない|
|補助A.12.1|　↳ ソース|[lib/i18n.ts](../lib/i18n.ts)|[lib/i18n.test.ts](../lib/i18n.test.ts)<br>概要（代表ケース）：returns correct translation for Japanese ／ returns correct translation for English|
|補助A.12.2|　↳ ソース|[app/viewer/language.ts](../app/viewer/language.ts)|[app/viewer/language.test.ts](../app/viewer/language.test.ts)<br>概要（代表ケース）：defaults to Japanese when no setting has been saved ／ restores English only when the user selected it|
|補助A.13|↳ 機能|デスクトップショートカット|**不足：対応テスト未確認**<br>確認範囲：不足。名前/起動先の単体のみ。OSから開く実操作は別|
|補助A.13.1|　↳ ソース|[src-tauri/src/desktop_shortcut.rs](../src-tauri/src/desktop_shortcut.rs)|[src-tauri/src/desktop_shortcut.rs 内のテスト](../src-tauri/src/desktop_shortcut.rs)<br>概要（代表ケース）：store_shortcut_is_visibly_distinct_from_legacy_name ／ msix_target_uses_stable_apps_folder_identity|
|補助A.14|↳ 機能|設定画面|[e2e/settings-english.spec.ts](../e2e/settings-english.spec.ts)<br>概要：PC設定の英語表示<br>確認範囲：一部。既存参照は言語表示。全設定の保存/実動作を確認した意味ではない|
|補助A.14.1|　↳ ソース|[app/utils/settingsPageText.ts](../app/utils/settingsPageText.ts)|[app/utils/settingsPageText.test.ts](../app/utils/settingsPageText.test.ts)<br>概要（代表ケース）：returns English labels without Japanese characters in English mode ／ keeps Japanese labels in Japanese mode|
|補助A.14.2|　↳ ソース|[lib/settings-store.ts](../lib/settings-store.ts)|[lib/settings-store.test.ts](../lib/settings-store.test.ts)<br>概要（代表ケース）：loads default settings initially ／ loads settings from localStorage if available|
|補助A.15|↳ 機能|ログと診断|**不足：対応テスト未確認**<br>確認範囲：不足。PWA診断の単体はあるがPC loggerを含む全経路ではない|
|補助A.15.1|　↳ ソース|[app/viewer/lib/diagnostic-log.ts](../app/viewer/lib/diagnostic-log.ts)|[app/viewer/lib/diagnostic-log.test.ts](../app/viewer/lib/diagnostic-log.test.ts)<br>概要（代表ケース）：通知経路の解析に必要な項目を一行で出力する ／ 例外本文を記録せず種類だけを返す|
|補助A.16|↳ 機能|PWAの版表示|**不足：対応テスト未確認**<br>確認範囲：不足。リリース時の配信照合は運用手順。版表示の専用自動機能試験は未同定|
|補助A.16.1|　↳ ソース|**未確認**|**不足：専用ソーステスト未確認**|

## 補助ブランチB：発展

表補助B：要求・機能・ソースとテスト

|番号|階層|対象|テストファイル・不足|
|---|---|---|---|
|補助B|要求|補助ブランチB：発展|**未確認：支える要求の対応未整理**|
|補助B.1|↳ 機能|結晶化|**不足：対応テスト未確認**<br>確認範囲：不足。整形/モーダルの試験はあるが生成→保存→再利用の通し確認は未同定|
|補助B.1.1|　↳ ソース|[app/utils/crystalFormat.ts](../app/utils/crystalFormat.ts)|[app/utils/crystalFormat.test.ts](../app/utils/crystalFormat.test.ts)<br>概要（代表ケース）：splits sections using the provided spec ／ joins sections using the provided spec order|
|補助B.1.2|　↳ ソース|[app/utils/crystalFormatEditor.ts](../app/utils/crystalFormatEditor.ts)|[app/utils/crystalFormatEditor.test.ts](../app/utils/crystalFormatEditor.test.ts)<br>概要（代表ケース）：T9 inserts a free section before history ／ T9 removes only free sections|
|補助B.1.3|　↳ ソース|**未確認**（対応テスト：[app/components/CrystalCreateModals.test.tsx](../app/components/CrystalCreateModals.test.tsx)）|[app/components/CrystalCreateModals.test.tsx](../app/components/CrystalCreateModals.test.tsx)<br>概要（代表ケース）：restores stored English Q&A defaults to Japanese ／ restores stored English Term defaults to Japanese|
|補助B.2|↳ 機能|会員番号|[app/components/SupportMemberNumber.test.tsx](../app/components/SupportMemberNumber.test.tsx)<br>概要：会員番号・登録待ち表示<br>確認範囲：一部。番号表示とAPI処理は別。実登録→保存→再起動まで不足|
|補助B.2.1|　↳ ソース|[app/api/members/lib/service.ts](../app/api/members/lib/service.ts)|[app/api/members/lib/service.test.ts](../app/api/members/lib/service.test.ts)<br>概要（代表ケース）：案内前・未回答・保留を別々に保存し、同意や機能履歴を作らない ／ assigns a sequential public number and a separate stable analysis id|
|補助B.2.2|　↳ ソース|[src-tauri/src/member_identity.rs](../src-tauri/src/member_identity.rs)|[src-tauri/src/member_identity.rs 内のテスト](../src-tauri/src/member_identity.rs)<br>概要：未確認|
|補助B.3|↳ 機能|機能利用分析（同意制）|[app/components/AnalyticsConsentDialog.test.tsx](../app/components/AnalyticsConsentDialog.test.tsx)<br>概要：同意保留・再確認<br>確認範囲：一部。同意画面と送信判定の試験。実サービス集計までの上位確認は別|
|補助B.3.1|　↳ ソース|[app/utils/analytics.ts](../app/utils/analytics.ts)|[app/utils/analytics.test.ts](../app/utils/analytics.test.ts)<br>概要（代表ケース）：buckets %i without sending an exact count ／ does not send desktop events before consent|
|補助B.3.2|　↳ ソース|[app/utils/analyticsConsentCompletion.ts](../app/utils/analyticsConsentCompletion.ts)|[app/utils/analyticsConsentCompletion.test.ts](../app/utils/analyticsConsentCompletion.test.ts)<br>概要（代表ケース）：%s: 保存成功後に案内用の窓を隠す ／ 保存失敗なら窓を残してエラーを呼出元へ返す|
|補助B.4|↳ 機能|開発者ホットライン（お便り）|[e2e/developer-conversation.spec.ts](../e2e/developer-conversation.spec.ts)<br>[app/components/AnnouncementCard.test.tsx](../app/components/AnnouncementCard.test.tsx)<br>概要：お便り画像失敗・入力保持・お便り返信操作<br>確認範囲：一部。通信先モック。実サービスへの到着は別|
|補助B.4.1|　↳ ソース|[app/utils/feedbackConversation.ts](../app/utils/feedbackConversation.ts)|[app/utils/feedbackConversation.test.ts](../app/utils/feedbackConversation.test.ts)<br>概要（代表ケース）：掲示板の表示状態をローカルに切り替える ／ uses the desktop app version in feedback messages|
|補助B.4.2|　↳ ソース|[app/utils/feedbackImage.ts](../app/utils/feedbackImage.ts)|[app/utils/feedbackImage.test.ts](../app/utils/feedbackImage.test.ts)<br>概要（代表ケース）：rejects a fourth image, unsupported type, and more than 5 MiB ／ decodes, limits the long edge, and returns a smaller WebP|
|補助B.5|↳ 機能|開発者とのやりとり掲示板|[e2e/developer-conversation.spec.ts](../e2e/developer-conversation.spec.ts)<br>概要：会話順序・新着表示<br>確認範囲：一部。受信相当データの表示。実Discord/サーバー間配送は別|
|補助B.5.1|　↳ ソース|[app/utils/developerConversationTimeline.ts](../app/utils/developerConversationTimeline.ts)|[app/utils/developerConversationTimeline.test.ts](../app/utils/developerConversationTimeline.test.ts)<br>概要（代表ケース）：お便りへの返信を同じスレッドに置き、最後に動いたスレッドを末尾に置く ／ 新しい返信が付いた古いお便りを下へ移し、返信先のない発言は独立させる|
|補助B.5.2|　↳ ソース|**未確認**（対応テスト：[workers/discord-replies/src/index.test.mjs](../workers/discord-replies/src/index.test.mjs)）|[workers/discord-replies/src/index.test.mjs](../workers/discord-replies/src/index.test.mjs)<br>概要（代表ケース）：server imports production replies without an author PC and resumes its checkpoint ／ failure retains checkpoint, waits five minutes and does not disclose credentials|
|補助B.6|↳ 機能|開発を支援する|[app/components/EndrollMatsuri.test.tsx](../app/components/EndrollMatsuri.test.tsx)<br>概要：支援者の表示<br>確認範囲：一部。表示部品のみ。支援の手続き成立は別|
|補助B.6.1|　↳ ソース|[app/components/EndrollMatsuri.tsx](../app/components/EndrollMatsuri.tsx)|[app/components/EndrollMatsuri.test.tsx](../app/components/EndrollMatsuri.test.tsx)<br>概要（代表ケース）：renders with default props without crashing ／ shows the supporter count from props|
|補助B.7|↳ 機能|アップデート確認|[app/hooks/useUpdateCheck.test.tsx](../app/hooks/useUpdateCheck.test.tsx)<br>概要：配布方式別の更新確認<br>確認範囲：一部。更新サービスと導入はモック。Store取得/導入/再起動は別|
|補助B.7.1|　↳ ソース|**未確認**（対応テスト：[app/hooks/useUpdateCheck.test.tsx](../app/hooks/useUpdateCheck.test.tsx)）|[app/hooks/useUpdateCheck.test.tsx](../app/hooks/useUpdateCheck.test.tsx)<br>概要（代表ケース）：Store版はStore更新だけを確認し通知を閉じられる ／ Store更新なし/取得失敗ではdesktop更新へ進まない: %s|
|補助B.7.2|　↳ ソース|[src-tauri/src/distribution.rs](../src-tauri/src/distribution.rs)|[src-tauri/src/distribution.rs 内のテスト](../src-tauri/src/distribution.rs)<br>概要：未確認|

## 根拠

[機能マスター](./000_FEATURE_TREE.md)の全71機能と既存の要求・機能テスト対応を使用。テストファイルの存在を照合。実装ソースは同名ファイルが実在しテストからの参照が確認できたもの、およびテスト内蔵Rustのみ記載。それ以外は推測せず未確認。補助ブランチと要求の対応は未整理。
