/**
 * 多言語対応 (i18n) ユーティリティ
 * 
 * 使い方:
 * 1. useLanguage() フックで現在の言語と翻訳関数を取得
 * 2. t('key') で翻訳テキストを取得
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
        'menu.colors.blue': '青',
        'menu.colors.pink': '桃',
        'menu.colors.yellow': '黄',
        'menu.noTags': 'タグがありません',

        // 共通
        'common.loading': '読み込み中...',
        'common.save': '保存',
        'common.cancel': 'キャンセル',
        'common.optional': '任意',



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
        'settings.feedback.errorSend': "送信に失敗しました。"
    },
    en: {
        // Settings - Sidebar
        'settings.title': 'Settings',
        'settings.general': 'General',
        'settings.appearance': 'Appearance',
        'settings.data': 'Data Management',
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
        'settings.data.basePathPlaceholder': 'Not set',
        'settings.data.browse': 'Browse...',
        'settings.data.selected': 'Notes will be saved here.',
        'settings.data.notSet': 'Please select a folder to save your notes.',
        'settings.data.import': 'Import Data',
        'settings.data.importDesc': 'Import existing Markdown files or images from another folder.',
        'settings.data.importButton': 'Import',
        'settings.data.importPlaceholder': 'Source folder path',

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
        'menu.colors.blue': 'Blue',
        'menu.colors.pink': 'Pink',
        'menu.colors.yellow': 'Yellow',
        'menu.noTags': 'No tags',

        // Common
        'common.loading': 'Loading...',
        'common.save': 'Save & Close',
        'common.cancel': 'Cancel',
        'common.optional': 'Optional',

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
        'settings.feedback.errorSend': "Failed to send."
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
