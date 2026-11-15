# 修正内容から選ぶテスト

2026-11-16。**表のテストを一式で実行しない。変更した処理に当てはまる候補だけ選ぶ。**

## まずこの場合分けを使う

表1：毎回の判断

|修正内容・状況|行うこと|追加しないこと|
|---|---|---|
|文書・図・文言・余白だけ。処理とデータは不変|差分・対象表示・参照確認|アプリ単体・E2E・Rust・MSIX|
|既存機能の処理を変更|大5系統→中項目→該当箇所の試験|同じ系統の全件|
|複数系統の処理を変更|該当セットの和集合。重複は1回|変更していない相手や別サービスの試験|
|新機能|系統を選び、必要な層に専用の成功/失敗ケースを追加。共用部を変えた分だけ既存対象を足す|似た名前の試験だけで合格／全件で埋め合わせ|
|表にない・影響不明|その判断だけ調べ、選択表へ追加してから実施|自動的な全件実行、対象0件での成功扱い|
|develop統合・push・PR|同じ入力の合格を引継ぎ。競合解消で変わった分だけ確認|イベントだけを理由にした再実行|
|リリース候補|固定候補で全体確認1回。合格記録と同exeを引継ぎ|梱包再開/承認待ち/main保存だけでの全体やり直し|

## 5系統の入口

表2：大項目は変更の影響範囲。製品の3コンセプトを置き換える分類ではない。

|大項目|中項目（各4つ）|選ぶ基準|
|---|---|---|
|見た目・操作系|U1 本文・書式・構造<br>U2 画像・図・添付の操作<br>U3 一覧・検索・タグ操作<br>U4 設定・言語・画面表示|表示・入力・画像・一覧の処理が変わる|
|保存・管理系|D1 本文・名前・属性の保存<br>D2 削除・保管・復元<br>D3 バックアップ・インポート<br>D4 PWA保存・草稿・容量|保存・削除・復元・草稿の処理が変わる|
|通信・連携系|C1 PCとiPhoneの送受信<br>C2 PCとWebの共有<br>C3 認証・通信失敗・再送<br>C4 外部サービス・API|送受信・認証・外部APIの処理が変わる|
|起動・OS動作系|O1 新規ウィンドウ・復元<br>O2 キー・トレイ・起動入口<br>O3 位置・サイズ・窓属性<br>O4 通知・アラーム・音|ウィンドウ・キー・通知の処理が変わる|
|配布・開発基盤系|R1 ビルド・版・依存・更新<br>R2 MSIX・署名・導入<br>R3 hook・CIの起動と選択<br>R4 候補合格・再開・実行制御|ビルド・MSIX・検査・再開の処理が変わる|

**動画なら全部、ではない。再生画面だけ＝U2。端末保存＝D4。送るデータ＝C1。実際に変えた処理だけ選ぶ。**

## 中項目ごとの具体的な選択

「最初に選ぶ候補」は条件に合うものだけ。PC/Web/PWAも変更側だけ。既存試験が変更した分岐を守っていなければ、その回帰ケースを追加する。候補を読まず全件実行しない。

### 見た目・操作系

表3：見た目・操作系の分岐

|ID・中項目|修正箇所 → 最初に選ぶ候補|追加条件 → 試験|確認の限界・除外|
|---|---|---|---|
|U1 本文・書式・構造|PC本文の表示 → [MarkdownRenderer.test.tsx](../app/components/__tests__/MarkdownRenderer.test.tsx)<br>PCの書式ボタン → [FloatingFormatBar.test.tsx](../app/components/FloatingFormatBar.test.tsx)<br>PWAの一覧表示 → [NoteListStep.rendering.test.tsx](../app/viewer/NoteListStep.rendering.test.tsx)<br>PWA編集本文の赤文字 → [pwa-bold.spec.ts](../e2e/pwa-bold.spec.ts)<br>Web本文/チェック → [page.test.tsx](../app/shared/page.test.tsx)<br>部分折りたたみ → [editorOutline.test.ts](../app/utils/editorOutline.test.ts)<br>日付/時刻の挿入 → [useStickyNoteContextMenu.test.ts](../app/hooks/useStickyNoteContextMenu.test.ts)<br>結晶本文の生成 → [crystalFormat.test.ts](../app/utils/crystalFormat.test.ts)|折りたたみの実操作を変更 → [editor-outline.spec.ts](../e2e/editor-outline.spec.ts)|変更した処理だけ。関係しない候補は実行しない。|
|U2 画像・図・添付の操作|描き込み → [ImageAnnotationModal.test.ts](../app/components/ImageAnnotationModal.test.ts)<br>切り取り計算 → [imageCrop.test.ts](../app/utils/imageCrop.test.ts)<br>画像の倍率操作 → [ResizableImage.test.tsx](../app/components/ResizableImage.test.tsx)<br>図の生成/安全性 → [mermaid.test.ts](../app/utils/mermaid.test.ts)<br>PWA動画の再生画面 → [pwa-video-local.spec.ts](../e2e/pwa-video-local.spec.ts)<br>PWA添付の選択（該当ケース） → [WriteStep.loss.test.tsx](../app/viewer/__tests__/WriteStep.loss.test.tsx)|図の実ブラウザー安全境界を変更 → [mermaidSecurity.browser.test.ts](../app/utils/mermaidSecurity.browser.test.ts)|動画UIだけなら再生1件。保存まで変えるときだけD4。OS画面キャプチャは専用単体なし：撮影/キャンセルを短く確認し、失敗処理の変更なら該当回帰テストを追加。|
|U3 一覧・検索・タグ操作|検索 → [SearchOverlay.test.tsx](../app/components/SearchOverlay.test.tsx)<br>タグ絞り込み → [LauncherTagFilter.test.tsx](../app/components/LauncherTagFilter.test.tsx)<br>タグ操作 → [LauncherTagActions.test.tsx](../app/components/LauncherTagActions.test.tsx)<br>ランチャー一覧 → [QuickLauncher.test.ts](../app/components/QuickLauncher.test.ts)|一覧とウィンドウ操作の接続を変更 → [quick-launcher.spec.ts](../e2e/quick-launcher.spec.ts)|保存値の変更だけD1/D2、窓の整列を変えた分だけO3を追加。|
|U4 設定・言語・画面表示|一般設定の選択 → [settingsPageText.test.ts](../app/utils/settingsPageText.test.ts)<br>翻訳処理 → [i18n.test.ts](../lib/i18n.test.ts)<br>PWA言語切替 → [NoteListStep.language.test.tsx](../app/viewer/NoteListStep.language.test.tsx)<br>支援画面 → [EndrollMatsuri.test.tsx](../app/components/EndrollMatsuri.test.tsx)<br>PWA診断ログ → [diagnostic-log.test.ts](../app/viewer/lib/diagnostic-log.test.ts)|設定を保存する画面動線を変更 → [settings-help.spec.ts](../e2e/settings-help.spec.ts)|文言/余白だけなら対象表示だけ。PC logger自体は専用単体なし：該当ログの出力を確認。診断の保存先や秘密値処理を変えればD1/C3も判断する。|

### 保存・管理系

表4：保存・管理系の分岐

|ID・中項目|修正箇所 → 最初に選ぶ候補|追加条件 → 試験|確認の限界・除外|
|---|---|---|---|
|D1 本文・名前・属性の保存|PC保存/競合/リネーム（関連関数で絞る） → [storage.rs](../src-tauri/src/storage.rs)<br>名前/本文解析（関連関数で絞る） → [logic.rs](../src-tauri/src/logic.rs)<br>設定値の保存 → [settings-store.test.ts](../lib/settings-store.test.ts)<br>画面の保存呼出 → [useNoteFile.test.tsx](../app/hooks/useNoteFile.test.tsx)|実際の保存/再読込/原本保持の通り道を変更 → [data-safety.spec.ts](../e2e/data-safety.spec.ts)|成功と書込失敗の原本保持を含める。storage全件を毎回の固定セットにしない。|
|D2 削除・保管・復元|削除履歴（関連関数） → [trash_history.rs](../src-tauri/src/trash_history.rs)<br>90日整理（関連関数） → [trash_cleanup.rs](../src-tauri/src/trash_cleanup.rs)<br>保管から戻す → [archiveRestore.test.ts](../app/utils/archiveRestore.test.ts)<br>ランチャーで隠す/戻す → [QuickLauncher.storage.test.tsx](../app/components/QuickLauncher.storage.test.tsx)|削除対象/保持条件を変更 → [trash-maintenance.spec.ts](../e2e/trash-maintenance.spec.ts)<br>保管/復元の接続を変更 → [archive-restore.spec.ts](../e2e/archive-restore.spec.ts)|対象が消えることと対象外が残ることを確認。PCごみ箱の変更でPWA動画テストはしない。|
|D3 バックアップ・インポート|バックアップ保存の関連関数 → [storage.rs](../src-tauri/src/storage.rs)<br>月次処理はmonthly_backup_tests、復旧はrestore_backup_testsで絞る → [lib.rs](../src-tauri/src/lib.rs)<br>インポートの関連関数 → [import.rs](../src-tauri/src/import.rs)<br>月次設定 → [monthlyBackupSettings.test.ts](../app/utils/monthlyBackupSettings.test.ts)<br>取込後の画面更新 → [importRefresh.test.ts](../app/utils/importRefresh.test.ts)|自動追加なし|実ファイル構成/権限を変えたら隔離フォルダーの対象1往復だけ追加。利用者の原本は試験に使わない。|
|D4 PWA保存・草稿・容量|IndexedDB保存/削除（該当ケース） → [indexeddb.test.ts](../app/viewer/lib/indexeddb.test.ts)<br>送信前退避/入力保持（該当ケース） → [WriteStep.loss.test.tsx](../app/viewer/__tests__/WriteStep.loss.test.tsx)<br>保存失敗の復旧 → [save-recovery.test.tsx](../app/viewer/hooks/save-recovery.test.tsx)<br>遅い非同期一覧の保護 → [useNoteList.test.tsx](../app/viewer/hooks/useNoteList.test.tsx)|動画バイナリ/別タブ削除のDB経路を変更 → [video-storage.browser.test.mjs](../scripts/video-storage.browser.test.mjs)<br>削除後の再読込動線を変更 → [pwa-delete-persistence.spec.ts](../e2e/pwa-delete-persistence.spec.ts)|DB処理を変えなければ保存一式を追加しない。容量超過/削除中の遅い保存など、変更する境界を選ぶ。|

### 通信・連携系

表5：通信・連携系の分岐

|ID・中項目|修正箇所 → 最初に選ぶ候補|追加条件 → 試験|確認の限界・除外|
|---|---|---|---|
|C1 PCとiPhoneの送受信|動画の送信データ/保持 → [VideoAttachmentSemantics.test.tsx](../app/viewer/__tests__/VideoAttachmentSemantics.test.tsx)<br>汎用添付の送信データ → [FileAttachmentSemantics.test.tsx](../app/viewer/__tests__/FileAttachmentSemantics.test.tsx)<br>PWAのDrive通信 → [drive.test.ts](../app/viewer/lib/drive.test.ts)<br>PC受信時の反映選択 → [IphoneReturnDialog.test.tsx](../app/components/IphoneReturnDialog.test.tsx)<br>PC受信内容の変換 → [receiveIphoneNote.test.ts](../app/utils/receiveIphoneNote.test.ts)|本文/添付の契約と接続を変更 → [iphone-roundtrip.spec.ts](../e2e/iphone-roundtrip.spec.ts)<br>PC→iPhoneの画像受渡しを変更 → [pc-to-iphone-image.spec.ts](../e2e/pc-to-iphone-image.spec.ts)|データ契約を変えたら送信/受信の該当ケースを組み合わせる。PWA内の再生UIだけならPC試験は不要。|
|C2 PCとWebの共有|共有画面の編集/保存 → [page.test.tsx](../app/shared/page.test.tsx)<br>送受信 → [drive.test.ts](../app/shared/lib/drive.test.ts)<br>未送信草稿/競合 → [edit-draft.test.ts](../app/shared/lib/edit-draft.test.ts)<br>新規付箋の送信 → [NewNote.test.tsx](../app/shared/NewNote.test.tsx)<br>PCスナップショットの関連関数 → [web_share_snapshot.rs](../src-tauri/src/web_share_snapshot.rs)|契約を変更（両側を確認） → [web-share-contract.test.ts](../lib/web-share-contract.test.ts)<br>端末保存/復旧の接続を変更 → [shared-storage.spec.ts](../e2e/shared-storage.spec.ts)<br>共有順序を変更 → [shared-launcher-order.spec.ts](../e2e/shared-launcher-order.spec.ts)|変更した処理だけ。関係しない候補は実行しない。|
|C3 認証・通信失敗・再送|PWAの期限切れ/再試行 → [drive.test.ts](../app/viewer/lib/drive.test.ts)<br>共有ログインの復帰 → [login-return.test.ts](../app/shared/lib/login-return.test.ts)<br>API認証/遷移 → [routes.test.ts](../app/api/auth/routes.test.ts)<br>PCのトークン/OAuthの関連関数 → [gdrive.rs](../src-tauri/src/gdrive.rs)|認証の画面復帰を変更 → [shared-web-auth.spec.ts](../e2e/shared-web-auth.spec.ts)<br>共通の通信締切を変更 → [network-deadline.test.mjs](../scripts/network-deadline.test.mjs)|影響する成功/期限切れ/拒否を選び、全画面や全サービスは回さない。|
|C4 外部サービス・API|Siri API → [route.test.ts](../app/api/siri-send/route.test.ts)<br>会員API → [service.test.ts](../app/api/members/lib/service.test.ts)<br>会員番号の画面 → [SupportMemberNumber.test.tsx](../app/components/SupportMemberNumber.test.tsx)<br>お便り本文 → [feedbackConversation.test.ts](../app/utils/feedbackConversation.test.ts)<br>お便り画像 → [feedbackImage.test.ts](../app/utils/feedbackImage.test.ts)<br>分析送信/同意 → [analytics.test.ts](../app/utils/analytics.test.ts)<br>Discord応答Worker → [index.test.mjs](../workers/discord-replies/src/index.test.mjs)|お便りの画面とAPIをまたぐ動線を変更 → [developer-conversation.spec.ts](../e2e/developer-conversation.spec.ts)|変更したサービスだけ。新APIはその専用の成功/拒否/失敗試験を作り、既存の全API試験で埋め合わせない。|

### 起動・OS動作系

表6：起動・OS動作系の分岐

|ID・中項目|修正箇所 → 最初に選ぶ候補|追加条件 → 試験|確認の限界・除外|
|---|---|---|---|
|O1 新規ウィンドウ・復元|作成プール → [invisibleNotePool.test.ts](../app/utils/invisibleNotePool.test.ts)<br>作成要求の順序 → [freshRequestQueue.test.ts](../app/utils/freshRequestQueue.test.ts)<br>表示生成 → [windowCreation.test.ts](../app/utils/windowCreation.test.ts)<br>復元順序 → [startupRestore.test.ts](../app/utils/startupRestore.test.ts)|生成と表示の接続を変更 → [sticky-note.spec.ts](../e2e/sticky-note.spec.ts)|Tauriの本物の起動/フォーカスはブラウザーでは代替できない。必要な該当操作だけ常設の起動方法で確認する。|
|O2 キー・トレイ・起動入口|キーの設定/競合 → [shortcutKey.test.ts](../app/utils/shortcutKey.test.ts)<br>OSキー登録の関連関数 → [hotkey_manager.rs](../src-tauri/src/hotkey_manager.rs)<br>二度押しの関連関数 → [double_tap.rs](../src-tauri/src/double_tap.rs)<br>トレイ表示の関連関数 → [tray.rs](../src-tauri/src/tray.rs)<br>ショートカット作成の関連関数 → [desktop_shortcut.rs](../src-tauri/src/desktop_shortcut.rs)|キー設定/無効化の動線を変更 → [hotkey-disable.spec.ts](../e2e/hotkey-disable.spec.ts)|OS登録/自動起動は対象実機操作1回。自動起動の専用カバレッジ不足を一般起動試験の成功で埋めない。|
|O3 位置・サイズ・窓属性|色/文字サイズ/最前面の値 → [noteAppearance.test.ts](../app/utils/noteAppearance.test.ts)<br>新規位置 → [newNotePosition.test.ts](../app/utils/newNotePosition.test.ts)<br>サイズ制御 → [useMainWindowResizePolicy.test.tsx](../app/hooks/useMainWindowResizePolicy.test.tsx)<br>終了/復元の位置保持 → [QuickLauncher.lifecycle.test.tsx](../app/components/QuickLauncher.lifecycle.test.tsx)<br>タグで並べる関連関数 → [arrange.rs](../src-tauri/src/arrange.rs)|自動追加なし|OSへの座標/透明度/最前面反映、モニター救済は該当条件だけ実機確認。CSS余白だけで全窓確認を追加しない。|
|O4 通知・アラーム・音|アラーム日時 → [alarmDateTime.test.ts](../app/utils/alarmDateTime.test.ts)<br>発火時の前面制御 → [alarmAlwaysOnTop.test.ts](../app/utils/alarmAlwaysOnTop.test.ts)<br>PWA通知の遷移 → [notification-navigation.test.ts](../app/viewer/lib/notification-navigation.test.ts)<br>PWA Push処理 → [push.test.ts](../app/viewer/lib/push.test.ts)<br>音の設定 → [soundPreferences.test.ts](../app/utils/soundPreferences.test.ts)|PWA通知の常駐/閉じる動作を変更 → [lock-notification.spec.ts](../e2e/lock-notification.spec.ts)|OS通知の到着/音/発火を変えたら対象端末の該当操作だけ確認。文言だけなら実発火させない。|

### 配布・開発基盤系

表7：配布・開発基盤系の分岐

|ID・中項目|修正箇所 → 最初に選ぶ候補|追加条件 → 試験|確認の限界・除外|
|---|---|---|---|
|R1 ビルド・版・依存・更新|Tauri画面ビルド制御 → [tauri-frontend-stage.test.mjs](../scripts/tauri-frontend-stage.test.mjs)<br>版更新の制御 → [releaseVersionScript.test.ts](../app/security/releaseVersionScript.test.ts)<br>依存の組合せ → [dependency-compat.test.ts](../lib/dependency-compat.test.ts)<br>更新通知/Store判定 → [useUpdateCheck.test.tsx](../app/hooks/useUpdateCheck.test.tsx)|自動追加なし|実行方式/依存を変えたときだけ、影響するWebまたはPCのビルド。文書・版表示だけで両方作らない。影響不明なら先に調べる。|
|R2 MSIX・署名・導入|MSIX作成/検証の制御 → [msix.test.mjs](../scripts/release-machine/msix.test.mjs)<br>パッケージ状態取得 → [msix-status.test.mjs](../scripts/msix-status.test.mjs)|自動追加なし|梱包/署名/導入条件を変えた場合だけ対象MSIXの形式/内部exe/必要な導入確認。通常修正のたびにMSIXを作らない。|
|R3 hook・CIの起動と選択|コミット時処理 → [precommit.test.mjs](../scripts/precommit.test.mjs)<br>CI自動/手動起動 → [automation-policy.test.mjs](../scripts/automation-policy.test.mjs)<br>手動CI差分分類 → [ci-scope.test.mjs](../scripts/ci-scope.test.mjs)<br>CI記録の再利用 → [ci-validation-reuse.test.mjs](../scripts/ci-validation-reuse.test.mjs)|自動追加なし|該当設定の起動/停止/対象外を模擬差分と読取で確認。アプリ全件を起動して検査しない。|
|R4 候補合格・再開・実行制御|合格記録/環境照合 → [local-validation.test.mjs](../scripts/release-machine/local-validation.test.mjs)<br>候補固定/再開（ケース名で絞る） → [engine.test.mjs](../scripts/release-machine/engine.test.mjs)<br>子プロセス/秘密値 → [runner.test.mjs](../scripts/release-machine/runner.test.mjs)<br>リリース画面 → [ui.test.mjs](../scripts/release-machine/ui.test.mjs)|自動追加なし|engineは該当ケース名だけ。模擬Git/MSIXで確認し、アプリ全件や実機合格exeの再作成を追加しない。|

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
|要求1-4　手が離せないときは、声で送りたい|Siri から PC に付箋を送る|C4 外部サービス・API|
|要求1-5　ファイル名を考えたくない|ファイル名の自動生成|D1 本文・名前・属性の保存|
|要求1-5　ファイル名を考えたくない|ファイル名の本文連動|D1 本文・名前・属性の保存|
|要求1-6　保存場所は自分で決めたい|初回セットアップで保存先（Vault）を選択|D1 本文・名前・属性の保存|
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

## どう考えたか・何を残すか

表11：分類の判断と記録

|判断|理由|残すもの|
|---|---|---|
|機能名ではなく変更の影響で5系統|新機能にも使え、同じ機能のUI修正と保存修正を混ぜない|元機能/要求と該当ID|
|中項目は対象試験が決まる粒度|「PWA全部」は広すぎ、関数1個を大項目にすると細かすぎる|変更箇所と選んだ候補|
|追加試験は条件付き|未変更の相手/別サービスへ広げない|追加/除外した理由|
|全71機能は展開欄に保持|表示を簡潔にしつつ抜けを検証できる|正本hashと対応JSON|
|結果だけで終えない|別担当が再現・検証し、同じ入力で繰り返さず引き継げる|コマンド・ケース・結果・ソース/環境・未確認点|

[選択表データ](test-selection-matrix.json)に正本SHA256と対応を保存。新しい機能の未分類、参照テストの削除/改名、対応ケースなしは該当行を更新する。hashだけを書き換えない。

[全体の方針](TEST_SELECTION_POLICY.md) ／ [リリース手順](010_RELEASE.md)
