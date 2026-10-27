# テストファイル全一覧（機能別）

2026-10-27。実行条件は [検査番号表](TEST_EXECUTION_MATRIX.md) を参照します。検査番号は対象別6大分類の33項目（テスト・静的検査・動作確認のみ）、個別ファイルは従来のF番号を維持します。機能分類はファイル名・配置で確認できる主対象に基づき、複合的なものは共通へ置きます。要求単位の網羅性を保証する表ではありません。Rustはテスト/宣言を含むファイルを掲載します。

表1：機能別の参照先とファイル数

|機能分類|関連設計書|ファイル数|
|---|---|---|
|お便り・開発者とのやりとり|[007_COMMUNICATION.md](../docs-v2/007_COMMUNICATION.md)|27|
|会員・利用状況・同意|[007_COMMUNICATION.md](../docs-v2/007_COMMUNICATION.md)|17|
|Web共有|[013_WEB_SHARE.md](../docs-v2/013_WEB_SHARE.md)|22|
|iPhone・PWA・クラウド同期|[003_IPHONE.md](../docs-v2/003_IPHONE.md)|32|
|画像の添付・編集|[002_PC.md](../docs-v2/002_PC.md)|9|
|アラーム|[002_PC.md](../docs-v2/002_PC.md)|3|
|クイックランチャー・収納・タグ・検索|[002_PC.md](../docs-v2/002_PC.md)|11|
|データ保存・復元・保全|[002_PC.md](../docs-v2/002_PC.md)|12|
|付箋本文・編集・形式|[002_PC.md](../docs-v2/002_PC.md)|28|
|性能・負荷|[004_TEST.md](../docs-v2/004_TEST.md)|4|
|認証・セキュリティ・運用設定|[006_ARCHITECTURE.md](../docs-v2/006_ARCHITECTURE.md)|8|
|設計書・公開マニュアル|[004_TEST.md](../docs-v2/004_TEST.md)|5|
|配布・リリース・自動化|[008_DISTRIBUTION.md](../docs-v2/008_DISTRIBUTION.md)|12|
|設定・ウィンドウ・共通基盤|[002_PC.md](../docs-v2/002_PC.md)|49|

## お便り・開発者とのやりとり

表2：お便り・開発者とのやりとりの個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F005|T02-01|Vitest|[app/announcement-notice/page.test.tsx](../app/announcement-notice/page.test.tsx)|
|F008|T02-01|Vitest|[app/api/feedback/conversation/ack/route.test.ts](../app/api/feedback/conversation/ack/route.test.ts)|
|F009|T02-01|Vitest|[app/api/feedback/conversation/delete/route.test.ts](../app/api/feedback/conversation/delete/route.test.ts)|
|F010|T02-01|Vitest|[app/api/feedback/conversation/messages/route.test.ts](../app/api/feedback/conversation/messages/route.test.ts)|
|F011|T02-01|Vitest|[app/api/feedback/conversation/session/route.test.ts](../app/api/feedback/conversation/session/route.test.ts)|
|F012|T02-01|Vitest|[app/api/feedback/discord/cron/route.test.ts](../app/api/feedback/discord/cron/route.test.ts)|
|F013|T02-01|Vitest|[app/api/feedback/discord/ingest/http.test.ts](../app/api/feedback/discord/ingest/http.test.ts)|
|F014|T02-01|Vitest|[app/api/feedback/discord/ingest/route.test.ts](../app/api/feedback/discord/ingest/route.test.ts)|
|F015|T02-01|Vitest|[app/api/feedback/discord/ingest/run.test.ts](../app/api/feedback/discord/ingest/run.test.ts)|
|F016|T02-01|Vitest|[app/api/feedback/lib/appwrite-auth.test.ts](../app/api/feedback/lib/appwrite-auth.test.ts)|
|F017|T02-01|Vitest|[app/api/feedback/lib/appwrite-storage.test.ts](../app/api/feedback/lib/appwrite-storage.test.ts)|
|F018|T02-01|Vitest|[app/api/feedback/lib/environment.test.ts](../app/api/feedback/lib/environment.test.ts)|
|F019|T02-01|Vitest|[app/api/feedback/lib/image-access.test.ts](../app/api/feedback/lib/image-access.test.ts)|
|F020|T02-01|Vitest|[app/api/feedback/lib/security.test.ts](../app/api/feedback/lib/security.test.ts)|
|F021|T02-01|Vitest|[app/api/feedback/lib/store.test.ts](../app/api/feedback/lib/store.test.ts)|
|F022|T02-01|Vitest|[app/api/feedback/ownership.test.ts](../app/api/feedback/ownership.test.ts)|
|F023|T02-01|Vitest|[app/api/feedback/request-limits.test.ts](../app/api/feedback/request-limits.test.ts)|
|F032|T02-01|Vitest|[app/components/AnnouncementCard.test.tsx](../app/components/AnnouncementCard.test.tsx)|
|F033|T02-01|Vitest|[app/components/AnnouncementDeliveryStatus.test.tsx](../app/components/AnnouncementDeliveryStatus.test.tsx)|
|F064|T02-01|Vitest|[app/hooks/useDiscordReplyIngest.test.tsx](../app/hooks/useDiscordReplyIngest.test.tsx)|
|F065|T02-01|Vitest|[app/hooks/useFeedbackConversationUnreadCheck.test.tsx](../app/hooks/useFeedbackConversationUnreadCheck.test.tsx)|
|F104|T02-01|Vitest|[app/utils/discordReplyIngest.test.ts](../app/utils/discordReplyIngest.test.ts)|
|F107|T02-01|Vitest|[app/utils/feedbackConversation.test.ts](../app/utils/feedbackConversation.test.ts)|
|F108|T02-01|Vitest|[app/utils/feedbackImage.test.ts](../app/utils/feedbackImage.test.ts)|
|F167|T02-04|ブラウザ|[e2e/developer-conversation.spec.ts](../e2e/developer-conversation.spec.ts)|
|F168|T02-04|ブラウザ|[e2e/discord-auto-ingest.spec.ts](../e2e/discord-auto-ingest.spec.ts)|
|F237|T04-02|Node/個別|[workers/discord-replies/src/index.test.mjs](../workers/discord-replies/src/index.test.mjs)|

## 会員・利用状況・同意

表3：会員・利用状況・同意の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F024|T02-01|Vitest|[app/api/members/[operation]/route.test.ts](../app/api/members/[operation]/route.test.ts)|
|F025|T02-01|Vitest|[app/api/members/lib/conversation-number.test.ts](../app/api/members/lib/conversation-number.test.ts)|
|F026|T02-01|Vitest|[app/api/members/lib/database.test.ts](../app/api/members/lib/database.test.ts)|
|F027|T02-01|Vitest|[app/api/members/lib/service.test.ts](../app/api/members/lib/service.test.ts)|
|F030|T02-01|Vitest|[app/components/AnalyticsConsentDialog.test.tsx](../app/components/AnalyticsConsentDialog.test.tsx)|
|F031|T02-01|Vitest|[app/components/AnalyticsLoader.test.tsx](../app/components/AnalyticsLoader.test.tsx)|
|F042|T02-01|Vitest|[app/components/MemberSettings.test.tsx](../app/components/MemberSettings.test.tsx)|
|F057|T02-01|Vitest|[app/components/SupportMemberNumber.test.tsx](../app/components/SupportMemberNumber.test.tsx)|
|F063|T02-01|Vitest|[app/hooks/useAnalyticsConsentPromptEligibility.test.tsx](../app/hooks/useAnalyticsConsentPromptEligibility.test.tsx)|
|F238|T02-01|Vitest|[app/api/launcher.usage.test.ts](../app/api/launcher.usage.test.ts)|
|F239|T02-01|Vitest|[app/shared/lib/usage.test.ts](../app/shared/lib/usage.test.ts)|
|F091|T02-01|Vitest|[app/utils/analytics.test.ts](../app/utils/analytics.test.ts)|
|F092|T02-01|Vitest|[app/utils/analyticsConsentCompletion.test.ts](../app/utils/analyticsConsentCompletion.test.ts)|
|F116|T02-01|Vitest|[app/utils/memberUsageQueue.test.ts](../app/utils/memberUsageQueue.test.ts)|
|F197|T03-04|Node/個別|[scripts/member-stats.test.mjs](../scripts/member-stats.test.mjs)|
|F198|T03-03|Node/個別|[scripts/member-usage-analysis.test.mjs](../scripts/member-usage-analysis.test.mjs)|
|F220|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/member_identity.rs](../src-tauri/src/member_identity.rs)|

## Web共有

表4：Web共有の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F053|T02-01|Vitest|[app/components/SharedWebQr.test.tsx](../app/components/SharedWebQr.test.tsx)|
|F081|T02-01|Vitest|[app/shared/NewNote.test.tsx](../app/shared/NewNote.test.tsx)|
|F082|T02-01|Vitest|[app/shared/VisibleImage.test.tsx](../app/shared/VisibleImage.test.tsx)|
|F083|T02-01|Vitest|[app/shared/lib/cache-policy.test.ts](../app/shared/lib/cache-policy.test.ts)|
|F084|T02-01|Vitest|[app/shared/lib/drive.test.ts](../app/shared/lib/drive.test.ts)|
|F085|T02-01|Vitest|[app/shared/lib/edit-draft.test.ts](../app/shared/lib/edit-draft.test.ts)|
|F086|T02-01|Vitest|[app/shared/lib/login-return.test.ts](../app/shared/lib/login-return.test.ts)|
|F087|T02-01|Vitest|[app/shared/lib/markdown.test.ts](../app/shared/lib/markdown.test.ts)|
|F088|T02-01|Vitest|[app/shared/page.test.tsx](../app/shared/page.test.tsx)|
|F180|T02-04|ブラウザ|[e2e/shared-storage.spec.ts](../e2e/shared-storage.spec.ts)|
|F181|T02-04|ブラウザ|[e2e/shared-web-auth.spec.ts](../e2e/shared-web-auth.spec.ts)|
|F189|T02-01|Vitest|[lib/web-share-contract.test.ts](../lib/web-share-contract.test.ts)|
|F190|T02-01|Vitest|[lib/web-share-payload-hash.test.ts](../lib/web-share-payload-hash.test.ts)|
|F191|T02-01|Vitest|[lib/web-share-snapshot.test.ts](../lib/web-share-snapshot.test.ts)|
|F192|T02-01|Vitest|[lib/web-sharing-state.test.ts](../lib/web-sharing-state.test.ts)|
|F226|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_share_contract.rs](../src-tauri/src/web_share_contract.rs)|
|F227|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_share_download.rs](../src-tauri/src/web_share_download.rs)|
|F228|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_share_markdown.rs](../src-tauri/src/web_share_markdown.rs)|
|F229|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_share_preview.rs](../src-tauri/src/web_share_preview.rs)|
|F230|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_share_read_cache.rs](../src-tauri/src/web_share_read_cache.rs)|
|F231|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_share_snapshot.rs](../src-tauri/src/web_share_snapshot.rs)|
|F232|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_sharing_state.rs](../src-tauri/src/web_sharing_state.rs)|

## iPhone・PWA・クラウド同期

表5：iPhone・PWA・クラウド同期の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F004|T02-01|Vitest|[app/RegisterPWA.test.tsx](../app/RegisterPWA.test.tsx)|
|F028|T02-01|Vitest|[app/api/siri-send/route.test.ts](../app/api/siri-send/route.test.ts)|
|F040|T02-01|Vitest|[app/components/IphoneReturnDialog.test.tsx](../app/components/IphoneReturnDialog.test.tsx)|
|F127|T02-01|Vitest|[app/utils/receiveIphoneNote.test.ts](../app/utils/receiveIphoneNote.test.ts)|
|F146|T02-01|Vitest|[app/utils/webSyncProgress.test.ts](../app/utils/webSyncProgress.test.ts)|
|F149|T02-01|Vitest|[app/viewer/NoteListStep.language.test.tsx](../app/viewer/NoteListStep.language.test.tsx)|
|F150|T02-01|Vitest|[app/viewer/__tests__/FileAttachmentSemantics.test.tsx](../app/viewer/__tests__/FileAttachmentSemantics.test.tsx)|
|F151|T02-01|Vitest|[app/viewer/__tests__/VideoAttachmentSemantics.test.tsx](../app/viewer/__tests__/VideoAttachmentSemantics.test.tsx)|
|F152|T02-01|Vitest|[app/viewer/__tests__/WriteStep.loss.test.tsx](../app/viewer/__tests__/WriteStep.loss.test.tsx)|
|F153|T02-01|Vitest|[app/viewer/__tests__/page.test.tsx](../app/viewer/__tests__/page.test.tsx)|
|F154|T02-01|Vitest|[app/viewer/hooks/save-recovery.test.tsx](../app/viewer/hooks/save-recovery.test.tsx)|
|F155|T02-01|Vitest|[app/viewer/hooks/useAppInit.test.ts](../app/viewer/hooks/useAppInit.test.ts)|
|F156|T02-01|Vitest|[app/viewer/hooks/useNoteList.test.tsx](../app/viewer/hooks/useNoteList.test.tsx)|
|F157|T02-01|Vitest|[app/viewer/language.test.ts](../app/viewer/language.test.ts)|
|F158|T02-01|Vitest|[app/viewer/lib/diagnostic-log.test.ts](../app/viewer/lib/diagnostic-log.test.ts)|
|F159|T02-01|Vitest|[app/viewer/lib/drive.test.ts](../app/viewer/lib/drive.test.ts)|
|F160|T02-01|Vitest|[app/viewer/lib/indexeddb.test.ts](../app/viewer/lib/indexeddb.test.ts)|
|F161|T02-01|Vitest|[app/viewer/lib/notification-navigation.test.ts](../app/viewer/lib/notification-navigation.test.ts)|
|F162|T02-01|Vitest|[app/viewer/lib/push.test.ts](../app/viewer/lib/push.test.ts)|
|F163|T02-01|Vitest|[app/viewer/viewer.test.tsx](../app/viewer/viewer.test.tsx)|
|F169|T02-04|ブラウザ|[e2e/iphone-roundtrip.spec.ts](../e2e/iphone-roundtrip.spec.ts)|
|F171|T02-04|ブラウザ|[e2e/pc-to-iphone-image.spec.ts](../e2e/pc-to-iphone-image.spec.ts)|
|F174|T02-04|ブラウザ|[e2e/pwa-delete-persistence.spec.ts](../e2e/pwa-delete-persistence.spec.ts)|
|F175|T02-04|ブラウザ|[e2e/pwa-language.spec.ts](../e2e/pwa-language.spec.ts)|
|F176|T02-04|ブラウザ|[e2e/pwa-recovery.spec.ts](../e2e/pwa-recovery.spec.ts)|
|F177|T02-04|ブラウザ|[e2e/pwa-url-link.spec.ts](../e2e/pwa-url-link.spec.ts)|
|F183|T02-01|Vitest|[lib/drive-cache-policy.test.ts](../lib/drive-cache-policy.test.ts)|
|F214|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/gdrive.rs](../src-tauri/src/gdrive.rs)|
|F233|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/webpush.rs](../src-tauri/src/webpush.rs)|
|F234|T02-01|Vitest|[worker/notification-click.test.js](../worker/notification-click.test.js)|
|F235|T02-01|Vitest|[worker/notification-title.test.js](../worker/notification-title.test.js)|
|F236|T02-01|Vitest|[worker/worker.test.js](../worker/worker.test.js)|

## 画像の添付・編集

表6：画像の添付・編集の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F039|T02-01|Vitest|[app/components/ImageAnnotationModal.test.ts](../app/components/ImageAnnotationModal.test.ts)|
|F047|T02-01|Vitest|[app/components/ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)|
|F049|T02-01|Vitest|[app/components/RichTextEditor.imagePaste.test.ts](../app/components/RichTextEditor.imagePaste.test.ts)|
|F050|T02-01|Vitest|[app/components/RichTextEditor.imagePreview.test.ts](../app/components/RichTextEditor.imagePreview.test.ts)|
|F093|T02-01|Vitest|[app/utils/annotationHistory.test.ts](../app/utils/annotationHistory.test.ts)|
|F105|T02-01|Vitest|[app/utils/droppedImage.test.ts](../app/utils/droppedImage.test.ts)|
|F109|T02-01|Vitest|[app/utils/fitCroppedNote.test.ts](../app/utils/fitCroppedNote.test.ts)|
|F112|T02-01|Vitest|[app/utils/imageCrop.test.ts](../app/utils/imageCrop.test.ts)|
|F188|T02-01|Vitest|[lib/web-preview-image.test.ts](../lib/web-preview-image.test.ts)|

## アラーム

表7：アラームの個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F029|T02-01|Vitest|[app/components/AlarmDialog.language.test.tsx](../app/components/AlarmDialog.language.test.tsx)|
|F089|T02-01|Vitest|[app/utils/alarmAlwaysOnTop.test.ts](../app/utils/alarmAlwaysOnTop.test.ts)|
|F090|T02-01|Vitest|[app/utils/alarmDateTime.test.ts](../app/utils/alarmDateTime.test.ts)|

## クイックランチャー・収納・タグ・検索

表8：クイックランチャー・収納・タグ・検索の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F043|T02-01|Vitest|[app/components/QuickLauncher.lifecycle.test.tsx](../app/components/QuickLauncher.lifecycle.test.tsx)|
|F044|T02-01|Vitest|[app/components/QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)|
|F045|T02-01|Vitest|[app/components/QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)|
|F052|T02-01|Vitest|[app/components/SearchOverlay.test.tsx](../app/components/SearchOverlay.test.tsx)|
|F069|T02-01|Vitest|[app/hooks/useStoreFavoriteListener.test.tsx](../app/hooks/useStoreFavoriteListener.test.tsx)|
|F070|T02-01|Vitest|[app/hooks/useTagManager.test.ts](../app/hooks/useTagManager.test.ts)|
|F130|T02-01|Vitest|[app/utils/reservedTags.test.ts](../app/utils/reservedTags.test.ts)|
|F134|T02-01|Vitest|[app/utils/shelfMotion.test.ts](../app/utils/shelfMotion.test.ts)|
|F205|T03-09|Node/個別|[scripts/tauri-frontend-stage.test.mjs](../scripts/tauri-frontend-stage.test.mjs)|
|F212|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/favorite_storage.rs](../src-tauri/src/favorite_storage.rs)|
|F217|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/launcher.rs](../src-tauri/src/launcher.rs)|

## データ保存・復元・保全

表9：データ保存・復元・保全の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F034|T02-01|Vitest|[app/components/ArchivedNotesRestoreDialog.test.tsx](../app/components/ArchivedNotesRestoreDialog.test.tsx)|
|F035|T02-01|Vitest|[app/components/BackupResultDialog.test.tsx](../app/components/BackupResultDialog.test.tsx)|
|F094|T02-01|Vitest|[app/utils/archiveRestore.test.ts](../app/utils/archiveRestore.test.ts)|
|F113|T02-01|Vitest|[app/utils/importRefresh.test.ts](../app/utils/importRefresh.test.ts)|
|F119|T02-01|Vitest|[app/utils/monthlyBackupSettings.test.ts](../app/utils/monthlyBackupSettings.test.ts)|
|F139|T02-01|Vitest|[app/utils/startupRestore.test.ts](../app/utils/startupRestore.test.ts)|
|F142|T02-01|Vitest|[app/utils/storeMigration.test.ts](../app/utils/storeMigration.test.ts)|
|F165|T02-04|ブラウザ|[e2e/archive-restore.spec.ts](../e2e/archive-restore.spec.ts)|
|F166|T02-04|ブラウザ|[e2e/data-safety.spec.ts](../e2e/data-safety.spec.ts)|
|F208|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/crash_guard.rs](../src-tauri/src/crash_guard.rs)|
|F216|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/import.rs](../src-tauri/src/import.rs)|
|F222|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/storage.rs](../src-tauri/src/storage.rs)|

## 付箋本文・編集・形式

表10：付箋本文・編集・形式の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F001|T04-05|Node/個別|[.planning/shared-checklist/spike/causal-contract.test.mjs](../.planning/shared-checklist/spike/causal-contract.test.mjs)|
|F002|T04-05|Node/個別|[.planning/shared-checklist/spike/item-identity.test.mjs](../.planning/shared-checklist/spike/item-identity.test.mjs)|
|F003|T04-05|Node/個別|[.planning/shared-checklist/spike/operations.test.mjs](../.planning/shared-checklist/spike/operations.test.mjs)|
|F037|T02-01|Vitest|[app/components/CrystalCreateModals.test.tsx](../app/components/CrystalCreateModals.test.tsx)|
|F046|T02-01|Vitest|[app/components/RecipeCreateModal.test.tsx](../app/components/RecipeCreateModal.test.tsx)|
|F048|T02-01|Vitest|[app/components/RichTextEditor.checkboxDecoration.test.ts](../app/components/RichTextEditor.checkboxDecoration.test.ts)|
|F051|T02-01|Vitest|[app/components/RichTextEditor.verticalSelection.test.ts](../app/components/RichTextEditor.verticalSelection.test.ts)|
|F061|T02-01|Vitest|[app/components/__tests__/MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)|
|F095|T02-01|Vitest|[app/utils/checkboxToggle.test.ts](../app/utils/checkboxToggle.test.ts)|
|F096|T02-01|Vitest|[app/utils/crystalFormat.test.ts](../app/utils/crystalFormat.test.ts)|
|F097|T02-01|Vitest|[app/utils/crystalFormatConfig.test.ts](../app/utils/crystalFormatConfig.test.ts)|
|F098|T02-01|Vitest|[app/utils/crystalFormatEditor.test.ts](../app/utils/crystalFormatEditor.test.ts)|
|F099|T02-01|Vitest|[app/utils/crystalTrashRequest.test.ts](../app/utils/crystalTrashRequest.test.ts)|
|F100|T02-01|Vitest|[app/utils/crystalWindowLifecycle.test.ts](../app/utils/crystalWindowLifecycle.test.ts)|
|F101|T02-01|Vitest|[app/utils/crystalWindowSize.test.ts](../app/utils/crystalWindowSize.test.ts)|
|F106|T02-01|Vitest|[app/utils/editorIndent.test.ts](../app/utils/editorIndent.test.ts)|
|F115|T02-01|Vitest|[app/utils/markdownUtils.test.ts](../app/utils/markdownUtils.test.ts)|
|F117|T02-01|Vitest|[app/utils/mermaid.test.ts](../app/utils/mermaid.test.ts)|
|F118|T02-01|Vitest|[app/utils/mermaidSecurity.browser.test.ts](../app/utils/mermaidSecurity.browser.test.ts)|
|F122|T02-01|Vitest|[app/utils/outline.test.ts](../app/utils/outline.test.ts)|
|F126|T02-01|Vitest|[app/utils/qaFormat.test.ts](../app/utils/qaFormat.test.ts)|
|F128|T02-01|Vitest|[app/utils/recipeDraftRequest.test.ts](../app/utils/recipeDraftRequest.test.ts)|
|F129|T02-01|Vitest|[app/utils/recipeFormat.test.ts](../app/utils/recipeFormat.test.ts)|
|F138|T02-01|Vitest|[app/utils/splitFrontMatter.test.ts](../app/utils/splitFrontMatter.test.ts)|
|F144|T02-01|Vitest|[app/utils/termFormat.test.ts](../app/utils/termFormat.test.ts)|
|F182|T02-04|ブラウザ|[e2e/sticky-note.spec.ts](../e2e/sticky-note.spec.ts)|
|F207|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/clipboard.rs](../src-tauri/src/clipboard.rs)|
|F213|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/file_drop.rs](../src-tauri/src/file_drop.rs)|

## 性能・負荷

表11：性能・負荷の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F124|T02-01|Vitest|[app/utils/perfCheck.test.ts](../app/utils/perfCheck.test.ts)|
|F125|T02-01|Vitest|[app/utils/perfMeasurement.test.ts](../app/utils/perfMeasurement.test.ts)|
|F172|T02-04|ブラウザ|[e2e/perf-load.spec.ts](../e2e/perf-load.spec.ts)|
|F221|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/perflog.rs](../src-tauri/src/perflog.rs)|

## 認証・セキュリティ・運用設定

表12：認証・セキュリティ・運用設定の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F006|T02-01|Vitest|[app/api/auth/requestSecurity.test.ts](../app/api/auth/requestSecurity.test.ts)|
|F007|T02-01|Vitest|[app/api/auth/routes.test.ts](../app/api/auth/routes.test.ts)|
|F075|T02-01|Vitest|[app/security/dependabotConfig.test.ts](../app/security/dependabotConfig.test.ts)|
|F076|T02-01|Vitest|[app/security/precommitClassification.test.ts](../app/security/precommitClassification.test.ts)|
|F077|T02-01|Vitest|[app/security/releaseVersionScript.test.ts](../app/security/releaseVersionScript.test.ts)|
|F078|T02-01|Vitest|[app/security/releaseWorkflow.test.ts](../app/security/releaseWorkflow.test.ts)|
|F079|T02-01|Vitest|[app/security/sentryServerConfig.test.ts](../app/security/sentryServerConfig.test.ts)|
|F080|T02-01|Vitest|[app/security/tauriConfig.test.ts](../app/security/tauriConfig.test.ts)|

## 設計書・公開マニュアル

表13：設計書・公開マニュアルの個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F164|T01-02|Node/個別|[docs-v2/.vitepress/html-links.test.mjs](../docs-v2/.vitepress/html-links.test.mjs)|
|F173|T02-04/T02-05|ブラウザ|[e2e/public-guide-links.spec.ts](../e2e/public-guide-links.spec.ts)|
|F179|T02-04|ブラウザ|[e2e/settings-help.spec.ts](../e2e/settings-help.spec.ts)|
|F185|T02-01|Vitest|[lib/public-links.test.ts](../lib/public-links.test.ts)|
|F196|T06-04|Node/個別|[scripts/export-public-guide.test.mjs](../scripts/export-public-guide.test.mjs)|

## 配布・リリース・自動化

表14：配布・リリース・自動化の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F145|T02-01|Vitest|[app/utils/verifyCargoLockRelease.test.ts](../app/utils/verifyCargoLockRelease.test.ts)|
|F193|T03-06|Node/個別|[scripts/automation-policy.test.mjs](../scripts/automation-policy.test.mjs)|
|F194|T03-11|Node/個別|[scripts/ci-artifact-policy.test.mjs](../scripts/ci-artifact-policy.test.mjs)|
|F195|T03-05|Node/個別|[scripts/ci-scope.test.mjs](../scripts/ci-scope.test.mjs)|
|F199|T03-10|Node/個別|[scripts/msix-status.test.mjs](../scripts/msix-status.test.mjs)|
|F200|T04-01|Node/個別|[scripts/network-deadline.test.mjs](../scripts/network-deadline.test.mjs)|
|F201|T03-08|Node/個別|[scripts/release-machine/engine.test.mjs](../scripts/release-machine/engine.test.mjs)|
|F202|T06-03|Node/個別|[scripts/release-machine/msix.test.mjs](../scripts/release-machine/msix.test.mjs)|
|F203|T03-07|Node/個別|[scripts/release-machine/runner.test.mjs](../scripts/release-machine/runner.test.mjs)|
|F204|T02-06|Node/個別|[scripts/release-machine/ui.test.mjs](../scripts/release-machine/ui.test.mjs)|
|F209|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/desktop_shortcut.rs](../src-tauri/src/desktop_shortcut.rs)|
|F210|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/distribution.rs](../src-tauri/src/distribution.rs)|

## 設定・ウィンドウ・共通基盤

表15：設定・ウィンドウ・共通基盤の個別ファイル

|ファイル番号|検査番号|方式|ファイル|
|---|---|---|---|
|F036|T02-01|Vitest|[app/components/ConfirmDialog.test.tsx](../app/components/ConfirmDialog.test.tsx)|
|F038|T02-01|Vitest|[app/components/EndrollMatsuri.test.tsx](../app/components/EndrollMatsuri.test.tsx)|
|F041|T02-01|Vitest|[app/components/LoadingScreen.test.tsx](../app/components/LoadingScreen.test.tsx)|
|F054|T02-01|Vitest|[app/components/StickyActionIcon.test.tsx](../app/components/StickyActionIcon.test.tsx)|
|F055|T02-01|Vitest|[app/components/StickyNote.pool.test.tsx](../app/components/StickyNote.pool.test.tsx)|
|F056|T02-01|Vitest|[app/components/StickyNote.test.tsx](../app/components/StickyNote.test.tsx)|
|F058|T02-01|Vitest|[app/components/ToolbarButtons.test.tsx](../app/components/ToolbarButtons.test.tsx)|
|F059|T02-01|Vitest|[app/components/Tooltip.test.tsx](../app/components/Tooltip.test.tsx)|
|F060|T02-01|Vitest|[app/components/TopRightResizeHandle.test.tsx](../app/components/TopRightResizeHandle.test.tsx)|
|F062|T02-01|Vitest|[app/endroll/EndrollContent.test.tsx](../app/endroll/EndrollContent.test.tsx)|
|F066|T02-01|Vitest|[app/hooks/useMainWindowResizePolicy.test.tsx](../app/hooks/useMainWindowResizePolicy.test.tsx)|
|F067|T02-01|Vitest|[app/hooks/useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)|
|F068|T02-01|Vitest|[app/hooks/useStickyNoteContextMenu.test.ts](../app/hooks/useStickyNoteContextMenu.test.ts)|
|F071|T02-01|Vitest|[app/hooks/useUpdateCheck.test.tsx](../app/hooks/useUpdateCheck.test.tsx)|
|F072|T02-01|Vitest|[app/hooks/useWindowManager.listeners.test.tsx](../app/hooks/useWindowManager.listeners.test.tsx)|
|F073|T02-01|Vitest|[app/hooks/useWindowManager.test.ts](../app/hooks/useWindowManager.test.ts)|
|F074|T02-01|Vitest|[app/metadataRoutes.test.ts](../app/metadataRoutes.test.ts)|
|F102|T02-01|Vitest|[app/utils/cursorStyles.test.ts](../app/utils/cursorStyles.test.ts)|
|F103|T02-01|Vitest|[app/utils/developerConversationTimeline.test.ts](../app/utils/developerConversationTimeline.test.ts)|
|F110|T02-01|Vitest|[app/utils/freshRequestQueue.test.ts](../app/utils/freshRequestQueue.test.ts)|
|F111|T02-01|Vitest|[app/utils/hydratedNoteMeta.test.ts](../app/utils/hydratedNoteMeta.test.ts)|
|F114|T02-01|Vitest|[app/utils/invisibleNotePool.test.ts](../app/utils/invisibleNotePool.test.ts)|
|F120|T02-01|Vitest|[app/utils/newNoteTriggerLabel.test.ts](../app/utils/newNoteTriggerLabel.test.ts)|
|F121|T02-01|Vitest|[app/utils/noteAppearance.test.ts](../app/utils/noteAppearance.test.ts)|
|F123|T02-01|Vitest|[app/utils/pathUtils.test.ts](../app/utils/pathUtils.test.ts)|
|F131|T02-01|Vitest|[app/utils/safeUnlisten.test.ts](../app/utils/safeUnlisten.test.ts)|
|F132|T02-01|Vitest|[app/utils/settingsPageText.test.ts](../app/utils/settingsPageText.test.ts)|
|F133|T02-01|Vitest|[app/utils/settingsTheme.test.ts](../app/utils/settingsTheme.test.ts)|
|F135|T02-01|Vitest|[app/utils/shortcutKey.test.ts](../app/utils/shortcutKey.test.ts)|
|F136|T02-01|Vitest|[app/utils/sideButtonHorizontalScroll.test.ts](../app/utils/sideButtonHorizontalScroll.test.ts)|
|F137|T02-01|Vitest|[app/utils/soundPreferences.test.ts](../app/utils/soundPreferences.test.ts)|
|F140|T02-01|Vitest|[app/utils/stickyActionSymbols.test.ts](../app/utils/stickyActionSymbols.test.ts)|
|F141|T02-01|Vitest|[app/utils/stickyControlStyles.test.ts](../app/utils/stickyControlStyles.test.ts)|
|F143|T02-01|Vitest|[app/utils/temporaryWindowGeometry.test.ts](../app/utils/temporaryWindowGeometry.test.ts)|
|F147|T02-01|Vitest|[app/utils/windowCreation.test.ts](../app/utils/windowCreation.test.ts)|
|F148|T02-01|Vitest|[app/utils/windowsEnglishUiSource.test.ts](../app/utils/windowsEnglishUiSource.test.ts)|
|F170|T02-04|ブラウザ|[e2e/lock-notification.spec.ts](../e2e/lock-notification.spec.ts)|
|F178|T02-04|ブラウザ|[e2e/settings-english.spec.ts](../e2e/settings-english.spec.ts)|
|F184|T02-01|Vitest|[lib/i18n.test.ts](../lib/i18n.test.ts)|
|F186|T02-01|Vitest|[lib/settings-store.test.ts](../lib/settings-store.test.ts)|
|F187|T02-01|Vitest|[lib/utils.test.ts](../lib/utils.test.ts)|
|F206|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/arrange.rs](../src-tauri/src/arrange.rs)|
|F211|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/double_tap.rs](../src-tauri/src/double_tap.rs)|
|F215|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/hotkey_manager.rs](../src-tauri/src/hotkey_manager.rs)|
|F218|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/lib.rs](../src-tauri/src/lib.rs)|
|F219|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/logic.rs](../src-tauri/src/logic.rs)|
|F223|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/tray.rs](../src-tauri/src/tray.rs)|
|F224|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/triple_right_click.rs](../src-tauri/src/triple_right_click.rs)|
|F225|T03-02|Rust（テスト/宣言を含む）|[src-tauri/src/web_create.rs](../src-tauri/src/web_create.rs)|

登録ファイル239件。テストケース数や検査の実行単位数とは別です。Git管理外の個人用監視ツールの試験は別運用です。
