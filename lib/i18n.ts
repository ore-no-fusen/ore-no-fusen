/**
 * 多言語対応 (i18n) ユーティリティ
 * 
 * 責務:
 * - 言語設定（日/英）の管理と翻訳テキストの提供
 * - コンポーネント向けの `useLanguage` フックの提供
 * - 翻訳辞書データの定義
 */

// 対応言語
export type Language = 'ja' | 'en';

// 翻訳キーの型定義
export type TranslationKey = keyof typeof translations.ja;

// 翻訳辞書
export const translations = {
    ja: {
        // 設定画面 - サイドバー
        'settings.title': '俺の付箋',
        'settings.general': '一般',
        'settings.appearance': '外観',
        'settings.data': 'データ管理',
        'settings.iphone': 'iPhone連携',
        'settings.about': 'このアプリについて',

        // 設定画面 - 一般
        'settings.general.title': '一般設定',
        'settings.general.description': 'アプリケーションの基本動作を設定します。',
        'settings.general.language': '言語 (Language)',
        'settings.general.autoStart': 'ログイン時に起動',
        'settings.general.autoStartDesc': 'PC起動時に自動でアプリを立ち上げます',
        'settings.general.sound': '効果音 (SE)',
        'settings.general.soundDesc': '操作時のサウンドエフェクトを有効にする',

        // 設定画面 - 外観
        'settings.appearance.title': '外観設定',
        'settings.appearance.description': 'フォントサイズなどをカスタマイズします。',
        'settings.appearance.fontSize': 'フォントサイズ',
        'settings.appearance.fontSizeCurrent': '現在',
        'settings.appearance.preview': '文字サイズのプレビューです。',

        // 設定画面 - データ管理
        'settings.data.title': 'データ管理',
        'settings.data.description': 'データの保存場所やインポートを管理します。',
        'settings.data.basePath': 'データ保存場所 (Base Path)',
        'settings.data.browse': '参照',
        'settings.data.selected': '選択済み',
        'settings.data.notSet': '未設定の場合、デフォルトの場所（Documents/OreNoFusen）が使用されます',
        'settings.data.import': 'Markdownインポート',
        'settings.data.importDesc': '既存の .md ファイルがあるフォルダを指定して、付箋として読み込みます。',
        'settings.data.importButton': 'インポート実行',
        'settings.data.importPlaceholder': 'インポート元のフォルダパス...',
        'settings.data.basePathPlaceholder': 'フォルダを選択してください...',
        'settings.data.backup': 'バックアップ',
        'settings.data.backupDesc': '現在のデータ（付箋・タグ・画像）を別のフォルダに丸ごとコピーします。',
        'settings.data.backupButton': 'バックアップ実行',
        'settings.data.backupPlaceholder': 'バックアップ先フォルダ...',
        'settings.data.backupDone': 'バックアップ完了！\n\nコピーしたファイル数: ',

        // 設定画面 - フッター
        'settings.save': '設定完了',

        // 設定画面 - このアプリについて
        'settings.about.title': 'このアプリについて',
        'settings.about.description': 'アプリケーション情報とサポート',
        'settings.about.appName': '俺の付箋',
        'settings.about.appDesc': 'シンプルで使いやすいデスクトップ付箋アプリです。メモを素早く作成し、デスクトップ上で整理することができます。',
        'settings.about.version': 'バージョン',
        'settings.about.website': '公式ウェブサイト',
        'settings.about.copyright': '© 2026 OreNoFusen. All rights reserved.',

        // コンテキストメニュー
        'menu.openFolder': 'フォルダを開く',
        'menu.newNote': '新規メモ',
        'menu.changeColor': '色変更',
        'menu.tags': 'タグ',
        'menu.addTag': '新規追加',
        'menu.archive': 'タグフォルダへ整理',
        'menu.archive_failed': 'アーカイブに失敗しました。Windowsでは「開発者モード」を有効にするか、管理者権限が必要な場合があります：',
        'menu.deleteMode': '削除モード',
        'menu.normalMode': '通常モード',
        'menu.delete': 'このメモを削除',
        'menu.delete_failed': '削除に失敗しました:',
        'menu.colors.blue': '青',
        'menu.colors.pink': '桃',
        'menu.colors.yellow': '黄',
        'menu.noTags': 'タグがありません',
        'menu.sendToIphone': 'iPhoneに表示',
        'menu.undo': '元に戻す',
        'menu.redo': 'やり直し',
        'menu.cut': '切り取り',
        'menu.copy': 'コピー',
        'menu.paste': '貼り付け',
        'menu.selectAll': 'すべて選択',

        // 共通
        'common.loading': '読み込み中...',
        'common.save': '保存',
        'common.cancel': 'キャンセル',
        'common.optional': '任意',



        // ツールチップ
        'tooltip.newNote': '新しい付箋',
        'tooltip.fold': '畳む',
        'tooltip.unfold': '展開する',
        'tooltip.pin': '最前面に固定',
        'tooltip.unpin': '最前面固定を解除',
        'tooltip.table': 'テーブル変換',
        'tooltip.mermaid': 'Mermaid変換',
        'tooltip.capture': '画面キャプチャ',
        'tooltip.captureHint': 'Shift+Win+S → Ctrl+V',
        'tooltip.bold': '太字',
        'tooltip.heading': '見出し',
        'tooltip.list': '箇条書き',
        'tooltip.checkbox': 'チェック',
        'tooltip.expand': 'クリックで展開',
        'tooltip.drag': 'ドラッグで移動',

        // タグ操作
        'tag.addTitle': '新規タグを追加',
        'tag.addPlaceholder': '例: Todo, アイデア, etc...',
        'tag.addButton': '追加',
        'tag.deleteTitle': 'タグの削除',
        'tag.deleteMessage': 'タグ「{tag}」を完全に削除しますか？\n\n※この操作は元に戻せません。このタグを含む**すべての付箋**からバッジが消去されます。付箋本体は消去されません。',

        // アラーム
        'menu.setAlarm': 'アラームをセット',
        'alarm.setTitle': 'アラームをセット',
        'alarm.relative': '相対時刻',
        'alarm.absolute': '絶対時刻',
        'alarm.sound': '通知音あり',
        'alarm.clear': '解除する',
        'alarm.current': '現在のアラーム: ',
        'alarm.set': '設定する',
        'alarm.ringing': '⏰ タップして止める',

        // アップデート
        'update.title': 'アップデートがあります',
        'update.message': 'バージョン {version} が利用可能です。\n今すぐアップデートしますか？\n（ダウンロード後に自動で再起動します）',
        'update.confirm': 'アップデートする',
        'update.cancel': 'あとで',

        // Feedback
        'settings.feedback.menuTitle': "ご意見・ご要望",
        'settings.feedback.title': "フィードバックを送る",
        'settings.feedback.description': "バグ報告や機能リクエストなど、開発者へのメッセージをお待ちしています。",
        'settings.feedback.typeLabel': "フィードバックの種類",
        'settings.feedback.typeBug': "バグ報告",
        'settings.feedback.typeBugDesc': "動作がおかしい、エラーが出る",
        'settings.feedback.typeFeature': "機能リクエスト",
        'settings.feedback.typeFeatureDesc': "こんな機能が欲しい！",
        'settings.feedback.typeOther': "その他",
        'settings.feedback.typeOtherDesc': "感想や励ましなど",
        'settings.feedback.contentLabel': "内容",
        'settings.feedback.contentPlaceholder': "ここに詳しく書いてください...",
        'settings.feedback.contactLabel': "連絡先",
        'settings.feedback.contactDesc': "回答が必要な場合は入力してください。",
        'settings.feedback.systemInfoLabel': "システム情報（OSやバージョン）を自動添付する",
        'settings.feedback.sendButton': "送信する",
        'settings.feedback.sending': "送信中...",
        'settings.feedback.successTitle': "送信しました！",
        'settings.feedback.successDesc': "貴重なご意見ありがとうございます。開発の参考にさせていただきます。",
        'settings.feedback.sendAnother': "続けて送る",
        'settings.feedback.errorEmpty': "内容を入力してください。",
        'settings.feedback.errorSend': "送信に失敗しました。",

        // PWA (iPhone Viewer)
        'pwa.loginTitle': "PCに付箋を送る",
        'pwa.loginDesc': "Googleアカウントでログインすると、スマホからPCのデスクトップに直接付箋を送れるようになります。",
        'pwa.loginButton': "Googleでログイン",
        'pwa.loginSuccess': "ログイン済",
        'pwa.logoutButton': "ログアウト",
        'pwa.homeButton': "戻る",
        'pwa.sendToPc': "PCに置く",
        'pwa.saveLocal': "iPhoneにおいておく",
        'pwa.listTitle': "一覧",
        'pwa.newNote': "新しい付箋を書く",
        'pwa.statusSent': "送信済み",
        'pwa.statusDraft': "保存済み",
        'pwa.emptyList': "付箋がありません。＋で新規作成",
        'pwa.deleteNote': "消す",
        'pwa.saving': "保存中...",
        'pwa.sending': "送信中..."
    },
    en: {
        // Settings - Sidebar
        'settings.title': 'Settings',
        'settings.general': 'General',
        'settings.appearance': 'Appearance',
        'settings.data': 'Data Management',
        'settings.iphone': 'iPhone Sync',
        'settings.about': 'About',

        // Settings - General
        'settings.general.title': 'General Settings',
        'settings.general.description': 'Customize language and behavior.',
        'settings.general.language': 'Language',
        'settings.general.autoStart': 'Auto Start',
        'settings.general.autoStartDesc': 'Launch automatically when you log in.',
        'settings.general.sound': 'Sound Effects',
        'settings.general.soundDesc': 'Play sounds on interaction.',

        // Settings - Appearance
        'settings.appearance.title': 'Appearance',
        'settings.appearance.description': 'Customize how your notes look.',
        'settings.appearance.fontSize': 'Font Size',
        'settings.appearance.fontSizeCurrent': 'Current',
        'settings.appearance.preview': 'Preview Text',

        // Settings - Data
        'settings.data.title': 'Data Management',
        'settings.data.description': 'Manage where your notes are saved.',
        'settings.data.basePath': 'Save Location',
        'settings.data.basePathPlaceholder': 'Select a folder...',
        'settings.data.browse': 'Browse...',
        'settings.data.selected': 'Notes will be saved here.',
        'settings.data.notSet': 'Please select a folder to save your notes.',
        'settings.data.import': 'Import Data',
        'settings.data.importDesc': 'Import existing Markdown files or images from another folder.',
        'settings.data.importButton': 'Import',
        'settings.data.importPlaceholder': 'Source folder path',
        'settings.data.backup': 'Backup',
        'settings.data.backupDesc': 'Copy all your notes, tags, and images to another folder.',
        'settings.data.backupButton': 'Run Backup',
        'settings.data.backupPlaceholder': 'Backup destination folder...',
        'settings.data.backupDone': 'Backup complete!\n\nFiles copied: ',

        // Settings - Footer
        'settings.save': 'Save Settings',

        // Settings - About
        'settings.about.title': "About",
        'settings.about.description': "Version info and license",
        'settings.about.appName': "OreNoFusen",
        'settings.about.version': "Version",
        'settings.about.appDesc': "OreNoFusen is a desktop sticky note app designed for simplicity and customization.",
        'settings.about.website': "Official Website",
        'settings.about.copyright': "© 2026 OreNoFusen Project. All rights reserved.",

        // Context Menu
        'menu.openFolder': 'Open Folder',
        'menu.newNote': 'New Note',
        'menu.changeColor': 'Change Color',
        'menu.tags': 'Tags',
        'menu.addTag': 'Add New',
        'menu.archive': 'Move to Tag Folder',
        'menu.archive_failed': 'Failed to archive. On Windows, Developer Mode or Admin rights may be required:',
        'menu.deleteMode': 'Delete Mode',
        'menu.normalMode': 'Normal Mode',
        'menu.delete': 'Delete This Note',
        'menu.delete_failed': 'Failed to delete:',
        'menu.colors.blue': 'Blue',
        'menu.colors.pink': 'Pink',
        'menu.colors.yellow': 'Yellow',
        'menu.noTags': 'No tags',
        'menu.sendToIphone': 'Send to iPhone',
        'menu.undo': 'Undo',
        'menu.redo': 'Redo',
        'menu.cut': 'Cut',
        'menu.copy': 'Copy',
        'menu.paste': 'Paste',
        'menu.selectAll': 'Select All',

        // Common
        'common.loading': 'Loading...',
        'common.save': 'Save & Close',
        'common.cancel': 'Cancel',
        'common.optional': 'Optional',

        // Tooltips
        'tooltip.newNote': 'New Note',
        'tooltip.fold': 'Minimize',
        'tooltip.unfold': 'Expand',
        'tooltip.pin': 'Pin to Front',
        'tooltip.unpin': 'Unpin from Front',
        'tooltip.table': 'Convert to Table',
        'tooltip.mermaid': 'Convert to Mermaid',
        'tooltip.capture': 'Capture Image',
        'tooltip.captureHint': 'Shift+Win+S → Ctrl+V',
        'tooltip.bold': 'Bold',
        'tooltip.heading': 'Heading',
        'tooltip.list': 'List',
        'tooltip.checkbox': 'Checkbox',
        'tooltip.expand': 'Click to expand',
        'tooltip.drag': 'Drag to move',

        // Tags
        'tag.addTitle': 'Add New Tag',
        'tag.addPlaceholder': 'e.g. Todo, Ideas, etc...',
        'tag.addButton': 'Add',
        'tag.deleteTitle': 'Delete Tag',
        'tag.deleteMessage': 'Permanently delete the tag "{tag}"?\n\nThis cannot be undone. The tag will be removed from **all notes** containing it. The notes themselves will not be deleted.',

        // Alarm
        'menu.setAlarm': 'Set Alarm',
        'alarm.setTitle': 'Set Alarm',
        'alarm.relative': 'Relative',
        'alarm.absolute': 'Date & Time',
        'alarm.sound': 'With sound',
        'alarm.clear': 'Clear alarm',
        'alarm.current': 'Current alarm: ',
        'alarm.set': 'Set',
        'alarm.ringing': '⏰ Tap to stop',

        // Update
        'update.title': 'Update Available',
        'update.message': 'Version {version} is available.\nWould you like to update now?\n(The app will restart automatically after download.)',
        'update.confirm': 'Update Now',
        'update.cancel': 'Later',

        // Feedback
        'settings.feedback.menuTitle': "Feedback",
        'settings.feedback.title': "Send Feedback",
        'settings.feedback.description': "We'd love to hear from you! Send us bug reports or feature requests.",
        'settings.feedback.typeLabel': "Type",
        'settings.feedback.typeBug': "Bug Report",
        'settings.feedback.typeBugDesc': "Something's not working right",
        'settings.feedback.typeFeature': "Feature Request",
        'settings.feedback.typeFeatureDesc': "I want this feature!",
        'settings.feedback.typeOther': "Other",
        'settings.feedback.typeOtherDesc': "General comments",
        'settings.feedback.contentLabel': "Message",
        'settings.feedback.contentPlaceholder': "Tell us more...",
        'settings.feedback.contactLabel': "Contact",
        'settings.feedback.contactDesc': "Optional: Leave check valid email/ID if you want a reply.",
        'settings.feedback.systemInfoLabel': "Attach system info (OS, Version)",
        'settings.feedback.sendButton': "Send",
        'settings.feedback.sending': "Sending...",
        'settings.feedback.successTitle': "Sent!",
        'settings.feedback.successDesc': "Thank you for your feedback.",
        'settings.feedback.sendAnother': "Send another",
        'settings.feedback.errorEmpty': "Please enter a message.",
        'settings.feedback.errorSend': "Failed to send.",

        // PWA (iPhone Viewer)
        'pwa.loginTitle': "Send Notes to PC",
        'pwa.loginDesc': "Log in with your Google account to send sticky notes directly from your phone to your PC desktop.",
        'pwa.loginButton': "Sign in with Google",
        'pwa.loginSuccess': "Signed in",
        'pwa.logoutButton': "Sign out",
        'pwa.homeButton': "Back",
        'pwa.sendToPc': "Send to PC",
        'pwa.saveLocal': "Save Locally",
        'pwa.listTitle': "Notes",
        'pwa.newNote': "New Note",
        'pwa.statusSent': "Sent",
        'pwa.statusDraft': "Saved",
        'pwa.emptyList': "No notes. Tap + to create.",
        'pwa.deleteNote': "Delete",
        'pwa.saving': "Saving...",
        'pwa.sending': "Sending..."
    }
} as const;

/**
 * 翻訳関数を取得
 */
export function getTranslation(lang: Language) {
    return (key: TranslationKey): string => {
        return translations[lang][key] ?? key;
    };
}
