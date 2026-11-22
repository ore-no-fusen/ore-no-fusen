# 何を直したら、何をテストするか

**左の「直す箇所」を探し、右のテストを選びます。一覧の全部は実行しません。**

ソース修正のたびに[確認・更新手順（表11〜13）](#maintenance)を適用します。

通常は変更機能と影響先のデグレだけ。全要求・全機能はリリース時。[方針の正本](../docs-v2/004_TEST.md#test-policy)／[要求・機能・環境と実機の対応](../docs-v2/000_FEATURE_TREE.md#requirement-tests)。同じケースは重複実行しません。

表1：処理を変えない修正

|直す箇所|行う確認|
|---|---|
|説明文・表・図・余白・色だけ（処理とデータは不変）|差分・対象の表示・リンク。アプリ試験なし|

## 見た目・操作系

表2：修正箇所から直接選ぶ

|中項目|直す箇所|最初に選ぶテスト|
|---|---|---|
|本文・書式・構造|PCチェックの操作→保存（`-t 製品のチェック操作`）|[StickyNote.test.tsx](../app/components/StickyNote.test.tsx)|
|本文・書式・構造|PC本文の表示|[MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)|
|本文・書式・構造|PCの書式ボタン|[FloatingFormatBar.test.tsx](../app/components/FloatingFormatBar.test.tsx)|
|本文・書式・構造|PWAの一覧表示|[NoteListStep.rendering.test.tsx](../app/viewer/NoteListStep.rendering.test.tsx)|
|本文・書式・構造|PWA編集本文の赤文字|[pwa-bold.spec.ts](../e2e/pwa-bold.spec.ts)|
|本文・書式・構造|Web本文/チェック|[page.test.tsx](../app/shared/page.test.tsx)|
|本文・書式・構造|部分折りたたみ|[editorOutline.test.ts](../app/utils/editorOutline.test.ts)|
|本文・書式・構造|日付/時刻の挿入|[useStickyNoteContextMenu.test.ts](../app/hooks/useStickyNoteContextMenu.test.ts)|
|本文・書式・構造|結晶本文の生成|[crystalFormat.test.ts](../app/utils/crystalFormat.test.ts)|
|画像・図・添付の操作|描き込み|[ImageAnnotationModal.test.ts](../app/components/ImageAnnotationModal.test.ts)|
|画像・図・添付の操作|切り取り計算|[imageCrop.test.ts](../app/utils/imageCrop.test.ts)|
|画像・図・添付の操作|画像の倍率操作|[ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)|
|画像・図・添付の操作|ローカル画像の許可範囲、外部画像の選択後の再表示、公開設定|[Rustの画像プロトコル試験](../src-tauri/src/note_images.rs)、[ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)、[tauriConfig.test.ts](../app/security/tauriConfig.test.ts)。Windows実機では通常・カスタム保存先、保管プレビュー、描き込み後、外部画像の選択・再起動を確認。|
|画像・図・添付の操作|図の生成/安全性|[mermaid.test.ts](../app/utils/mermaid.test.ts)|
|画像・図・添付の操作|PWA動画の再生画面|[pwa-video-local.spec.ts](../e2e/pwa-video-local.spec.ts)|
|画像・図・添付の操作|PWA添付の選択（該当ケース）|[WriteStep.loss.test.tsx](../app/viewer/__tests__/WriteStep.loss.test.tsx)|
|一覧・検索・タグ操作|検索|[SearchOverlay.test.tsx](../app/components/SearchOverlay.test.tsx)|
|一覧・検索・タグ操作|タグ絞り込み|[LauncherTagFilter.test.tsx](../app/components/LauncherTagFilter.test.tsx)|
|一覧・検索・タグ操作|タグ操作|[LauncherTagActions.test.tsx](../app/components/LauncherTagActions.test.tsx)|
|一覧・検索・タグ操作|タグ統合の承認をPC側へ渡す|[tags.test.ts](../app/api/tags.test.ts)|
|一覧・検索・タグ操作|タグ名変更・統合・保管フォルダーとの整合|[user_tags.rs](../src-tauri/src/user_tags.rs) 内の該当テスト（隔離保存先）|
|一覧・検索・タグ操作|ランチャー一覧|[QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)|
|設定・言語・画面表示|一般設定の選択|[settingsPageText.test.ts](../app/utils/settingsPageText.test.ts)|
|設定・言語・画面表示|翻訳処理|[i18n.test.ts](../lib/i18n.test.ts)|
|設定・言語・画面表示|PWA言語切替|[NoteListStep.language.test.tsx](../app/viewer/NoteListStep.language.test.tsx)|
|設定・言語・画面表示|支援画面|[EndrollMatsuri.test.tsx](../app/components/EndrollMatsuri.test.tsx)|
|設定・言語・画面表示|PWA診断ログ|[diagnostic-log.test.ts](../app/viewer/lib/diagnostic-log.test.ts)|

<details>
<summary>この系統の追加条件・確認の限界</summary>

|この場合だけ追加|追加するテスト|
|---|---|
|本文・書式・構造：折りたたみの実操作を変更|[editor-outline.spec.ts](../e2e/editor-outline.spec.ts)|
|画像・図・添付の操作：図の実ブラウザー安全境界を変更|[mermaidSecurity.browser.test.ts](../app/utils/mermaidSecurity.browser.test.ts)|
|一覧・検索・タグ操作：一覧とウィンドウ操作の接続を変更|[quick-launcher.spec.ts](../e2e/quick-launcher.spec.ts)|
|設定・言語・画面表示：設定を保存する画面動線を変更|[settings-help.spec.ts](../e2e/settings-help.spec.ts)|

|中項目|範囲・除外・自動で確認できないこと|
|---|---|
|本文・書式・構造|変更した処理だけ。別画面/相手の処理が変わらなければ追加しない。|
|画像・図・添付の操作|動画UIだけなら再生1件。保存まで変えるときだけD4。OS画面キャプチャは専用単体なし：撮影/キャンセルを短く確認し、失敗処理の変更なら該当回帰テストを追加。|
|一覧・検索・タグ操作|保存値の変更だけD1/D2、窓の整列を変えた分だけO3を追加。|
|設定・言語・画面表示|文言/余白だけなら対象表示だけ。PC logger自体は専用単体なし：該当ログの出力を確認。診断の保存先や秘密値処理を変えればD1/C3も判断する。|

</details>

PCのピン・色・文字サイズ・透明度の操作→保存は `StickyNote.test.tsx -t 製品` の該当ケースだけを選ぶ。OSそのものの変更では実機の該当操作も確認する。

## 保存・管理系

表3：修正箇所から直接選ぶ

|中項目|直す箇所|最初に選ぶテスト|
|---|---|---|
|本文・名前・属性の保存|PC保存/競合/リネーム（関連関数で絞る）|[storage.rs](../src-tauri/src/storage.rs) 内の該当テスト|
|本文・名前・属性の保存|名前/本文解析（関連関数で絞る）|[logic.rs](../src-tauri/src/logic.rs) 内の該当テスト|
|本文・名前・属性の保存|設定値の保存|[settings-store.test.ts](../lib/settings-store.test.ts)|
|本文・名前・属性の保存|画面の保存呼出|[useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)|
|削除・保管・復元|削除履歴（関連関数）|[trash_history.rs](../src-tauri/src/trash_history.rs) 内の該当テスト|
|削除・保管・復元|90日整理（関連関数）|[trash_cleanup.rs](../src-tauri/src/trash_cleanup.rs) 内の該当テスト|
|削除・保管・復元|保管から戻す|[archiveRestore.test.ts](../app/utils/archiveRestore.test.ts)|
|削除・保管・復元|タグ削除に伴うArchive移動・同名保護|[user_tags.rs](../src-tauri/src/user_tags.rs) 内の該当テストと [storage.rs](../src-tauri/src/storage.rs) の保管復元テスト|
|削除・保管・復元|ランチャーで隠す/戻す|[QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)|
|バックアップ・インポート|バックアップ保存の関連関数|[storage.rs](../src-tauri/src/storage.rs) 内の該当テスト|
|バックアップ・インポート|月次処理はmonthly_backup_tests、復旧はrestore_backup_testsで絞る|[lib.rs](../src-tauri/src/lib.rs) 内の該当テスト|
|バックアップ・インポート|インポートの関連関数|[import.rs](../src-tauri/src/import.rs) 内の該当テスト|
|バックアップ・インポート|月次設定|[monthlyBackupSettings.test.ts](../app/utils/monthlyBackupSettings.test.ts)|
|バックアップ・インポート|取込後の画面更新|[importRefresh.test.ts](../app/utils/importRefresh.test.ts)|
|PWA保存・草稿・容量|IndexedDB保存/削除（該当ケース）|[indexeddb.test.ts](../app/viewer/lib/indexeddb.test.ts)|
|PWA保存・草稿・容量|送信前退避/入力保持（該当ケース）|[WriteStep.loss.test.tsx](../app/viewer/__tests__/WriteStep.loss.test.tsx)|
|PWA保存・草稿・容量|保存失敗の復旧|[save-recovery.test.tsx](../app/viewer/hooks/save-recovery.test.tsx)|
|PWA保存・草稿・容量|一覧の20件制限・状態判定・受信保存・遅い非同期一覧の保護|[useNoteList.test.tsx](../app/viewer/hooks/useNoteList.test.tsx)|

<details>
<summary>この系統の追加条件・確認の限界</summary>

|この場合だけ追加|追加するテスト|
|---|---|
|本文・名前・属性の保存：実際の保存/再読込/原本保持の通り道を変更|[data-safety.spec.ts](../e2e/data-safety.spec.ts)|
|削除・保管・復元：削除対象/保持条件を変更|[trash-maintenance.spec.ts](../e2e/trash-maintenance.spec.ts)|
|削除・保管・復元：保管/復元の接続を変更|[archive-restore.spec.ts](../e2e/archive-restore.spec.ts)|
|PWA保存・草稿・容量：動画バイナリ/別タブ削除のDB経路を変更|[video-storage.browser.test.mjs](../scripts/video-storage.browser.test.mjs)|
|PWA保存・草稿・容量：削除後の再読込動線を変更|[pwa-delete-persistence.spec.ts](../e2e/pwa-delete-persistence.spec.ts)|

|中項目|範囲・除外・自動で確認できないこと|
|---|---|
|本文・名前・属性の保存|成功と書込失敗の原本保持を含める。storage全件を毎回の固定セットにしない。|
|削除・保管・復元|対象が消えることと対象外が残ることを確認。PCごみ箱の変更でPWA動画テストはしない。|
|バックアップ・インポート|実ファイル構成/権限を変えたら隔離フォルダーの対象1往復だけ追加。利用者の原本は試験に使わない。|
|PWA保存・草稿・容量|DB処理を変えなければ保存一式を追加しない。容量超過/削除中の遅い保存など、変更する境界を選ぶ。|

</details>

## 通信・連携系

表4：修正箇所から直接選ぶ

|中項目|直す箇所|最初に選ぶテスト|
|---|---|---|
|PCとiPhoneの送受信|動画の送信データ/保持|[VideoAttachmentSemantics.test.tsx](../app/viewer/__tests__/VideoAttachmentSemantics.test.tsx)|
|PCとiPhoneの送受信|汎用添付の送信データ|[FileAttachmentSemantics.test.tsx](../app/viewer/__tests__/FileAttachmentSemantics.test.tsx)|
|PCとiPhoneの送受信|PWAのDrive通信|[drive.test.ts](../app/viewer/lib/drive.test.ts)|
|PCとiPhoneの送受信|PC送信用画像の90日整理を実Driveで確認|[live_drive_pc_image_cleanup](../src-tauri/src/gdrive.rs)（専用フォルダーの3件だけを使用する明示実行）|
|PCとiPhoneの送受信|PC受信時の反映選択|[IphoneReturnDialog.test.tsx](../app/components/IphoneReturnDialog.test.tsx)|
|PCとiPhoneの送受信|PC受信内容の変換|[receiveIphoneNote.test.ts](../app/utils/receiveIphoneNote.test.ts)|
|PCとWebの共有|共有画面の編集/保存|[page.test.tsx](../app/shared/page.test.tsx)|
|PCとWebの共有|送受信|[drive.test.ts](../app/shared/lib/drive.test.ts)|
|PCとWebの共有|未送信草稿/競合|[edit-draft.test.ts](../app/shared/lib/edit-draft.test.ts)|
|PCとWebの共有|新規付箋の送信|[NewNote.test.tsx](../app/shared/NewNote.test.tsx)|
|PCとWebの共有|PCスナップショットの関連関数|[web_share_snapshot.rs](../src-tauri/src/web_share_snapshot.rs) 内の該当テスト|
|認証・通信失敗・再送|PWAの期限切れ/再試行|[drive.test.ts](../app/viewer/lib/drive.test.ts)|
|認証・通信失敗・再送|共有ログインの復帰|[login-return.test.ts](../app/shared/lib/login-return.test.ts)|
|認証・通信失敗・再送|API認証/遷移|[routes.test.ts](../app/api/auth/routes.test.ts)|
|認証・通信失敗・再送|PCのトークン/OAuthの関連関数|[gdrive.rs](../src-tauri/src/gdrive.rs) 内の該当テスト|
|外部サービス・API|Siri API|[route.test.ts](../app/api/siri-send/route.test.ts)|
|外部サービス・API|会員API|[service.test.ts](../app/api/members/lib/service.test.ts)|
|外部サービス・API|会員番号の画面|[SupportMemberNumber.test.tsx](../app/components/SupportMemberNumber.test.tsx)|
|外部サービス・API|お便り本文|[feedbackConversation.test.ts](../app/utils/feedbackConversation.test.ts)|
|外部サービス・API|お便り画像|[feedbackImage.test.ts](../app/utils/feedbackImage.test.ts)|
|外部サービス・API|分析送信/同意|[analytics.test.ts](../app/utils/analytics.test.ts)|
|外部サービス・API|Discord応答Worker|[index.test.mjs](../workers/discord-replies/src/index.test.mjs)|

<details>
<summary>この系統の追加条件・確認の限界</summary>

|この場合だけ追加|追加するテスト|
|---|---|
|PCとiPhoneの送受信：本文/添付の契約と接続を変更|[iphone-roundtrip.spec.ts](../e2e/iphone-roundtrip.spec.ts)|
|PCとiPhoneの送受信：PC→iPhoneの画像受渡しを変更|[pc-to-iphone-image.spec.ts](../e2e/pc-to-iphone-image.spec.ts)|
|PCとWebの共有：契約を変更（両側を確認）|[web-share-contract.test.ts](../lib/web-share-contract.test.ts)|
|PCとWebの共有：端末保存/復旧の接続を変更|[shared-storage.spec.ts](../e2e/shared-storage.spec.ts)|
|PCとWebの共有：共有順序を変更|[shared-launcher-order.spec.ts](../e2e/shared-launcher-order.spec.ts)|
|認証・通信失敗・再送：認証の画面復帰を変更|[shared-web-auth.spec.ts](../e2e/shared-web-auth.spec.ts)|
|認証・通信失敗・再送：共通の通信締切を変更|[network-deadline.test.mjs](../scripts/network-deadline.test.mjs)|
|外部サービス・API：お便りの画面とAPIをまたぐ動線を変更|[developer-conversation.spec.ts](../e2e/developer-conversation.spec.ts)|

|中項目|範囲・除外・自動で確認できないこと|
|---|---|
|PCとiPhoneの送受信|データ契約を変えたら送信/受信の該当ケースを組み合わせる。PWA内の再生UIだけならPC試験は不要。|
|PCとWebの共有|変更した処理だけ。別画面/相手の処理が変わらなければ追加しない。|
|認証・通信失敗・再送|影響する成功/期限切れ/拒否を選び、全画面や全サービスは回さない。|
|外部サービス・API|変更したサービスだけ。新APIはその専用の成功/拒否/失敗試験を作り、既存の全API試験で埋め合わせない。|

</details>

## 起動・OS動作系

表5：修正箇所から直接選ぶ

|中項目|直す箇所|最初に選ぶテスト|
|---|---|---|
|新規ウィンドウ・復元|初回文字の検出|[StickyNote.pool.test.tsx](../app/components/StickyNote.pool.test.tsx)|
|新規ウィンドウ・復元|初回ファイル作成・再入防止・失敗再試行・未入力終了（`-t 製品のプール生成`）|[StickyNote.test.tsx](../app/components/StickyNote.test.tsx)|
|新規ウィンドウ・復元|窓の選択・解放|[invisibleNotePool.test.ts](../app/utils/invisibleNotePool.test.ts)|
|新規ウィンドウ・復元|作成要求の順序|[freshRequestQueue.test.ts](../app/utils/freshRequestQueue.test.ts)|
|新規ウィンドウ・復元|表示生成|[windowCreation.test.ts](../app/utils/windowCreation.test.ts)|
|新規ウィンドウ・復元|復元順序|[startupRestore.test.ts](../app/utils/startupRestore.test.ts)|
|キー・トレイ・起動入口|キーの設定/競合|[shortcutKey.test.ts](../app/utils/shortcutKey.test.ts)|
|キー・トレイ・起動入口|OSキー登録の関連関数|[hotkey_manager.rs](../src-tauri/src/hotkey_manager.rs) 内の該当テスト|
|キー・トレイ・起動入口|二度押しの関連関数|[double_tap.rs](../src-tauri/src/double_tap.rs) 内の該当テスト|
|キー・トレイ・起動入口|トレイ表示の関連関数|[tray.rs](../src-tauri/src/tray.rs) 内の該当テスト|
|キー・トレイ・起動入口|ショートカット作成の関連関数|[desktop_shortcut.rs](../src-tauri/src/desktop_shortcut.rs) 内の該当テスト|
|位置・サイズ・窓属性|読込色の表示・再読込|[useNoteStyles.test.ts](../app/hooks/useNoteStyles.test.ts)|
|位置・サイズ・窓属性|ファイルから色を読む（`logic::tests::extract_meta_`）|[logic.rs](../src-tauri/src/logic.rs) 内の該当テスト|
|位置・サイズ・窓属性|色/文字サイズ/最前面の値|[noteAppearance.test.ts](../app/utils/noteAppearance.test.ts)|
|位置・サイズ・窓属性|新規位置|[newNotePosition.test.ts](../app/utils/newNotePosition.test.ts)|
|位置・サイズ・窓属性|サイズ制御|[useMainWindowResizePolicy.test.tsx](../app/hooks/useMainWindowResizePolicy.test.tsx)|
|位置・サイズ・窓属性|終了/復元の位置保持|[QuickLauncher.lifecycle.test.tsx](../app/components/QuickLauncher.lifecycle.test.tsx)|
|位置・サイズ・窓属性|タグで並べる関連関数|[arrange.rs](../src-tauri/src/arrange.rs) 内の該当テスト|
|通知・アラーム・音|アラーム日時|[alarmDateTime.test.ts](../app/utils/alarmDateTime.test.ts)|
|通知・アラーム・音|発火時の前面制御|[alarmAlwaysOnTop.test.ts](../app/utils/alarmAlwaysOnTop.test.ts)|
|通知・アラーム・音|PWA通知の遷移|[notification-navigation.test.ts](../app/viewer/lib/notification-navigation.test.ts)|
|通知・アラーム・音|PWA Push処理|[push.test.ts](../app/viewer/lib/push.test.ts)|
|通知・アラーム・音|音の設定|[soundPreferences.test.ts](../app/utils/soundPreferences.test.ts)|

<details>
<summary>この系統の追加条件・確認の限界</summary>

|この場合だけ追加|追加するテスト|
|---|---|
|新規ウィンドウ・復元：生成と表示の接続を変更|[sticky-note.spec.ts](../e2e/sticky-note.spec.ts)|
|キー・トレイ・起動入口：キー設定/無効化の動線を変更|[hotkey-disable.spec.ts](../e2e/hotkey-disable.spec.ts)|
|通知・アラーム・音：PWA通知の常駐/閉じる動作を変更|[lock-notification.spec.ts](../e2e/lock-notification.spec.ts)|

|中項目|範囲・除外・自動で確認できないこと|
|---|---|
|新規ウィンドウ・復元|Tauriの本物の起動/フォーカスはブラウザーでは代替できない。必要な該当操作だけ常設の起動方法で確認する。|
|キー・トレイ・起動入口|OS登録/自動起動は対象実機操作1回。自動起動の専用カバレッジ不足を一般起動試験の成功で埋めない。|
|位置・サイズ・窓属性|OSへの座標/透明度/最前面反映、モニター救済は該当条件だけ実機確認。CSS余白だけで全窓確認を追加しない。|
|通知・アラーム・音|OS通知の到着/音/発火を変えたら対象端末の該当操作だけ確認。文言だけなら実発火させない。|

</details>

## 配布・開発基盤系

表6：修正箇所から直接選ぶ

|中項目|直す箇所|最初に選ぶテスト|
|---|---|---|
|ビルド・版・依存・更新|Tauri画面ビルド制御|[tauri-frontend-stage.test.mjs](../scripts/tauri-frontend-stage.test.mjs)|
|ビルド・版・依存・更新|版更新の制御|[releaseVersionScript.test.ts](../app/security/releaseVersionScript.test.ts)|
|ビルド・版・依存・更新|依存の組合せ|[dependency-compat.test.ts](../lib/dependency-compat.test.ts)|
|ビルド・版・依存・更新|更新通知/Store判定|[useUpdateCheck.test.tsx](../app/hooks/useUpdateCheck.test.tsx)|
|MSIX・署名・導入|MSIX作成/検証の制御|[msix.test.mjs](../scripts/release-machine/msix.test.mjs)|
|MSIX・署名・導入|パッケージ状態取得|[msix-status.test.mjs](../scripts/msix-status.test.mjs)|
|hook・CIの起動と選択|コミット時処理|[precommit.test.mjs](../scripts/precommit.test.mjs)|
|hook・CIの起動と選択|CI自動/手動起動|[automation-policy.test.mjs](../scripts/automation-policy.test.mjs)|
|hook・CIの起動と選択|手動CI差分分類|[ci-scope.test.mjs](../scripts/ci-scope.test.mjs)|
|hook・CIの起動と選択|CI記録の再利用|[ci-validation-reuse.test.mjs](../scripts/ci-validation-reuse.test.mjs)|
|候補合格・再開・実行制御|合格記録/環境照合|[local-validation.test.mjs](../scripts/release-machine/local-validation.test.mjs)|
|候補合格・再開・実行制御|候補固定/再開（ケース名で絞る）|[engine.test.mjs](../scripts/release-machine/engine.test.mjs)|
|候補合格・再開・実行制御|子プロセス/秘密値|[runner.test.mjs](../scripts/release-machine/runner.test.mjs)|
|候補合格・再開・実行制御|リリース画面|[ui.test.mjs](../scripts/release-machine/ui.test.mjs)|

<details>
<summary>この系統の追加条件・確認の限界</summary>

|この場合だけ追加|追加するテスト|
|---|---|
|設定/実環境など、最初の試験で確認できない結果が変わる|下の限界に従い該当部分のみ|

|中項目|範囲・除外・自動で確認できないこと|
|---|---|
|ビルド・版・依存・更新|実行方式/依存を変えたときだけ、影響するWebまたはPCのビルド。文書・版表示だけで両方作らない。影響不明なら先に調べる。|
|MSIX・署名・導入|梱包/署名/導入条件を変えた場合だけ対象MSIXの形式/内部exe/必要な導入確認。通常修正のたびにMSIXを作らない。|
|hook・CIの起動と選択|該当設定の起動/停止/対象外を模擬差分と読取で確認。アプリ全件を起動して検査しない。|
|候補合格・再開・実行制御|engineは該当ケース名だけ。模擬Git/MSIXで確認し、アプリ全件や実機合格exeの再作成を追加しない。|

</details>

## 専用の自動試験がない・実機が必要なもの

表7：別のテストで代用して合格扱いしない

|直す箇所|行う確認|
|---|---|
|画面キャプチャのOS起動|通常撮影・キャンセル。失敗処理を直すならその回帰ケースを追加|
|PCのログ出力|変更したログが出ること・秘密値が出ないこと。保存/通信を変えたら該当系統も選ぶ|
|OSキー登録・窓の位置・通知・署名/導入|修正した条件だけ実機確認。全操作を毎回一巡しない|

## 新機能・複数機能の変更

|場合|選び方|
|---|---|
|新機能|近い系統へ置き、その機能の専用テストを追加。未変更の既存試験は追加しない|
|保存と送信など、複数の処理が変わる|該当する行を組み合わせ、重複は1回だけ|
|既存ケースにない/影響不明|その部分を調べて行を追加。全件で埋め合わせない|
|同じ入力で合格済み|変更がなければ再実行しない。結果と条件を引き継ぐ|

## 実行単位

表8：ファイルとケースを指定する

|種類|コマンドの形|範囲|
|---|---|---|
|単体|`npx vitest run <対象.test.ts(x)> -t '<該当ケース>'`|小さな専用ファイルならファイル単位。実在するケース名で絞る|
|画面|`npm run test:e2e -- <対象.spec.ts> --grep '<該当ケース>'`|画面の接続/ブラウザー依存が変わる場合だけ|
|Node処理|`node --test --test-name-pattern='<該当ケース>' <対象.test.mjs>`|エンジン28件を毎回一式にしない|
|Rust|`cargo test --locked --manifest-path src-tauri/Cargo.toml '<対象関数名/名前空間>'`|.rs内の実在テスト名で絞る。ビルド成功や0件実行を試験合格としない|
|型・ビルド|型契約/ビルド入力を変えた範囲の検査|外観・文書だけでは行わない。型検査を分けられない範囲だけ共通で実施|

単体と画面試験を必ず両方行う規則ではない。同じ結果なら安い方1つ。画面接続・実DB・OSの結果が単体で分からないときだけ不足を追加する。

## 全機能との対応

[機能ツリー](../docs-v2/000_FEATURE_TREE.md)第1部の71実現案を全件割り当て、第2部の対応を起点に実在ファイルへ接続した。これは全ケースの内容監査や今回の全テスト実行ではない。機能全体の改修時は起点を使い、別の処理を変更した場合は実際の変更箇所で系統を選び直す。

<details>
<summary>全71機能の入口を見る</summary>

表9：元の機能を省略しない

|元の要求/区分|機能|選択の起点|
|---|---|---|
|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|プールウィンドウ方式|O1 新規ウィンドウ・復元|
|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|グローバルホットキー Ctrl+N|O2 キー・トレイ・起動入口|
|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|Ctrl 2回押し／Shift 2回押しトリガー|O2 キー・トレイ・起動入口|
|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|システムトレイ常駐＋トレイメニュー「新規メモ」|O2 キー・トレイ・起動入口|
|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|付箋上の「＋」ボタン／右クリック「新規メモ」|O1 新規ウィンドウ・復元|
|要求1-1　思いついた瞬間に、書ける状態になっていてほしい|自動起動|O2 キー・トレイ・起動入口|
|要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい|画面キャプチャ|U2 画像・図・添付の操作|
|要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい|クリップボード画像の貼り付け|U2 画像・図・添付の操作|
|要求1-2　画面上のもの・手元のものを、そのまま付箋にしたい|エディタへの画像ドロップ貼り付け|U2 画像・図・添付の操作|
|要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）|変更の自動保存|D1 本文・名前・属性の保存|
|要求1-3　書いたら、保存を考えたくない（保存忘れで消えるのが怖い）|明示保存 Ctrl+S|D1 本文・名前・属性の保存|
|要求1-4　ファイル名を考えたくない|ファイル名の自動生成|D1 本文・名前・属性の保存|
|要求1-4　ファイル名を考えたくない|ファイル名の本文連動|D1 本文・名前・属性の保存|
|要求1-5　保存場所は自分で決めたい|初回セットアップで保存先（Vault）を選択|D1 本文・名前・属性の保存|
|要求1-6　手が離せないときは、声で送りたい|Siri から PC に付箋を送る|C4 外部サービス・API|
|要求2-1　大事な一文を、ひと目で目立たせたい|太字の朱表示|U1 本文・書式・構造|
|要求2-1　大事な一文を、ひと目で目立たせたい|フローティングフォーマットバー|U1 本文・書式・構造|
|要求2-1　大事な一文を、ひと目で目立たせたい|編集用ホットキー|U1 本文・書式・構造|
|要求2-1　大事な一文を、ひと目で目立たせたい|PWAの強調表示|U1 本文・書式・構造|
|要求2-2　画像に、そのまま書き込みたい|画像への描き込み|U2 画像・図・添付の操作|
|要求2-2　画像に、そのまま書き込みたい|トリミング|U2 画像・図・添付の操作|
|要求2-2　画像に、そのまま書き込みたい|画像の表示サイズ変更|U2 画像・図・添付の操作|
|要求2-3　畳んでも、項目（見出し）は見えていてほしい|付箋全体の折りたたみ（△／▽）|O3 位置・サイズ・窓属性|
|要求2-3　畳んでも、項目（見出し）は見えていてほしい|本文の一部分の折りたたみ|U1 本文・書式・構造|
|要求2-4　構造を整理して見せたい|見出し|U1 本文・書式・構造|
|要求2-4　構造を整理して見せたい|チェックリスト|U1 本文・書式・構造|
|要求2-4　構造を整理して見せたい|テーブル|U1 本文・書式・構造|
|要求2-4　構造を整理して見せたい|Mermaid 図|U2 画像・図・添付の操作|
|要求2-4　構造を整理して見せたい|日付・時刻の挿入|U1 本文・書式・構造|
|要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）|最前面に固定（ピン留め）|O3 位置・サイズ・窓属性|
|要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）|色分け（背景色5色）|O3 位置・サイズ・窓属性|
|要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）|透明度3段階|O3 位置・サイズ・窓属性|
|要求2-5　付箋そのものを目立たせたい（他の窓に埋もれたくない）|文字サイズ|O3 位置・サイズ・窓属性|
|要求2-6　時刻になったら知らせてほしい|アラーム|O4 通知・アラーム・音|
|要求3-1　PCを開いたら、いつもの場所にいてほしい|起動時の状態復元|O1 新規ウィンドウ・復元|
|要求3-1　PCを開いたら、いつもの場所にいてほしい|マルチモニター救済|O3 位置・サイズ・窓属性|
|要求3-2　家の外でも見たい・続きをしたい|iPhone に送る（PC → iPhone）|C1 PCとiPhoneの送受信|
|要求3-2　家の外でも見たい・続きをしたい|通知常駐（ロックだぜ）|O4 通知・アラーム・音|
|要求3-2　家の外でも見たい・続きをしたい|iPhone から PC へ送る|C1 PCとiPhoneの送受信|
|要求3-2　家の外でも見たい・続きをしたい|Web共有|C2 PCとWebの共有|
|要求3-3　増えても、デスクトップが散らからないでほしい|タグで整列（カンバン整列）|O3 位置・サイズ・窓属性|
|要求3-3　増えても、デスクトップが散らからないでほしい|タグで絞り込み|U3 一覧・検索・タグ操作|
|要求3-3　増えても、デスクトップが散らからないでほしい|全部隠す／全部戻す|O3 位置・サイズ・窓属性|
|要求3-3　増えても、デスクトップが散らからないでほしい|フォルダーに保管|D2 削除・保管・復元|
|要求3-3　増えても、デスクトップが散らからないでほしい|ランチャーに登録して画面から隠す|D2 削除・保管・復元|
|要求3-4　昔のメモを、すぐ見つけたい|全文検索|U3 一覧・検索・タグ操作|
|要求3-4　昔のメモを、すぐ見つけたい|クイックランチャー|U3 一覧・検索・タグ操作|
|要求3-4　昔のメモを、すぐ見つけたい|タグ付けとタグフォルダ|U3 一覧・検索・タグ操作|
|補助ブランチA：基盤（土台）|Markdown ファイル保存|D1 本文・名前・属性の保存|
|補助ブランチA：基盤（土台）|アトミック保存と破損防止|D1 本文・名前・属性の保存|
|補助ブランチA：基盤（土台）|手動バックアップ|D3 バックアップ・インポート|
|補助ブランチA：基盤（土台）|月次安全バックアップ|D3 バックアップ・インポート|
|補助ブランチA：基盤（土台）|バックアップからの復旧|D3 バックアップ・インポート|
|補助ブランチA：基盤（土台）|削除とごみ箱|D2 削除・保管・復元|
|補助ブランチA：基盤（土台）|ごみ箱の90日整理|D2 削除・保管・復元|
|補助ブランチA：基盤（土台）|インポート|D3 バックアップ・インポート|
|補助ブランチA：基盤（土台）|保存先（Vault）の変更|D1 本文・名前・属性の保存|
|補助ブランチA：基盤（土台）|プライバシー設計|C3 認証・通信失敗・再送|
|補助ブランチA：基盤（土台）|効果音|O4 通知・アラーム・音|
|補助ブランチA：基盤（土台）|多言語（日本語／英語）|U4 設定・言語・画面表示|
|補助ブランチA：基盤（土台）|デスクトップショートカット|O2 キー・トレイ・起動入口|
|補助ブランチA：基盤（土台）|設定画面|U4 設定・言語・画面表示|
|補助ブランチA：基盤（土台）|ログと診断|U4 設定・言語・画面表示|
|補助ブランチA：基盤（土台）|PWAの版表示|U4 設定・言語・画面表示|
|補助ブランチB：発展|結晶化|U1 本文・書式・構造|
|補助ブランチB：発展|会員番号|C4 外部サービス・API|
|補助ブランチB：発展|機能利用分析（同意制）|C4 外部サービス・API|
|補助ブランチB：発展|開発者ホットライン（お便り）|C4 外部サービス・API|
|補助ブランチB：発展|開発者とのやりとり掲示板|C4 外部サービス・API|
|補助ブランチB：発展|開発を支援する|U4 設定・言語・画面表示|
|補助ブランチB：発展|アップデート確認|R1 ビルド・版・依存・更新|

</details>

<details>
<summary>下位機能と横断処理を見る</summary>

表10：上位ノードで隠さない分岐

|元機能|修正する部分|選択の起点|
|---|---|---|
|iPhoneからPCへ送る|動画の再生画面|U2|
|iPhoneからPCへ送る|動画/草稿の端末保存と削除|D4|
|iPhoneからPCへ送る|動画の送信契約|C1|
|iPhoneからPCへ送る|汎用ファイルの送信契約|C1|
|iPhoneに送る|遅い一覧読取と復旧|D4|
|Web共有|新規作成と未送信草稿|C2|
|通知常駐|通知遷移と閉じる操作|O4|
|画面キャプチャ|OS起動とキャンセル|U2|
|開発/配布の基盤|ビルド・版・依存・更新|R1|
|開発/配布の基盤|MSIX・署名・導入|R2|
|開発/配布の基盤|hook・CIの起動と選択|R3|
|開発/配布の基盤|候補検証と再開|R4|

</details>

<a id="maintenance"></a>

## ソース修正ごとの確認・更新

この表はテスト選択の入口であり、最終差分と製品コードに照らして使う。表にない変更を対象外と解釈しない。変更のない行を毎回書き換える必要はない。

表11：毎回の確認と完了条件

|番号|時点|必ず確認すること|
|---|---|---|
|1|修正前|基点コミットと変更予定の機能・ソースを確認し、本表のIDから候補を選ぶ。|
|2|試験直前|最終差分の全変更ファイルを確認する。実装・テスト・共通処理・依存・設定の変更を含め、各変更を選択IDまたは対象外の理由に対応付ける。呼出元・利用先への影響も確認する。|
|3|対応の更新|下の表12で更新の要否を判断する。必要な対応を同じ作業ブランチで更新してから対象試験を行う。新規・変更テストが製品コードを確認しているか、残すモックの範囲と目的も確認する。|
|4|試験後に追加修正|ソース・テスト・依存・設定が変わったら2へ戻る。影響した試験だけ合格を取り直す。同じ入力・環境の影響しない合格は引き継ぐ。|
|5|develop統合前|下の表13の記録と、最終差分・現行ケース・対応表の一致を確認する。競合解消で内容が変われば2へ戻る。未分類・理由なしの除外・適用する試験の失敗/未実施を完了扱いしない。|

表12：表を更新する条件

|番号|修正内容|更新するもの|
|---|---|---|
|1|同じ機能の内部修正で、確認内容・影響先・選択条件が不変|表は変更不要。「確認済み・更新不要」と理由を作業記録へ残す。|
|2|機能・振舞い・影響先・選択条件の追加/変更/削除|本表と対応JSON、機能マスター、004の要求→機能→ソース→テスト一覧の該当箇所。要求自体が変わる場合のみ要求仕様も更新。|
|3|ソース/テストの移動・改名・削除、ケース名/確認内容/環境の変更|該当する参照・概要・選択条件・不足。削除テストは代替の根拠または不要とする理由を確認する。|
|4|新機能・未分類・対応ケースなし|対応を追加し、必要な試験を追加するか、妥当な代替確認を具体化する。全件試験で埋め合わせない。未確認は不足として残し、合格としない。|
|5|機能マスターを更新|本表・対応JSON・004一覧を照合した後に正本SHA256を更新する。hashだけを合わせない。|

表13：CURRENTに残す最小記録（実施ごと）

|番号|記録項目|必要な内容|
|---|---|---|
|1|変更範囲|基点・確認した最終コミット/未コミット差分、変更ファイルと機能。|
|2|選択と除外|選択ID、対象ファイル/ケース・環境、追加/除外理由。文書だけなら表1を適用。|
|3|対応の確認|更新した一覧/選択表の箇所、または更新不要の理由。|
|4|結果|コマンド・合否・入力/環境・引き継ぐ既存合格・未確認点。|

表・参照・差分の照合は確認漏れを減らすものであり、意味上の影響判定を自動保証するものではない。利用者には選択/除外理由と結果を短い表で示し、画面・文書の修正は実画面キャプチャも提示する。利用者確認待ちと自己確認済みを区別する。

## どう考えたか・何を残すか

表14：分類の判断と記録

|判断|理由|残すもの|
|---|---|---|
|機能名ではなく変更の影響で5系統|新機能にも使え、同じ機能のUI修正と保存修正を混ぜない|元機能/要求と該当ID|
|中項目は対象試験が決まる粒度|「PWA全部」は広すぎ、関数1個を大項目にすると細かすぎる|変更箇所と選んだ候補|
|追加試験は条件付き|未変更の相手/別サービスへ広げない|追加/除外した理由|
|全71機能は展開欄に保持|表示を簡潔にしつつ抜けを検証できる|正本hashと対応JSON|
|結果だけで終えない|別担当が再現・検証し、同じ入力で繰り返さず引き継げる|コマンド・ケース・結果・ソース/環境・未確認点|

[選択表データ](205_test-selection-matrix.json)に正本SHA256と対応を保存。新しい機能の未分類、参照テストの削除/改名、対応ケースなしは該当行を更新する。hashだけを書き換えない。

[全体の方針](201_TEST_SELECTION_POLICY.md) ／ [リリース手順](010_RELEASE.md)
