import type { Language } from '@/lib/i18n';

const JA = {
    sidebar: { hotkeys: 'ホットキー', templates: 'ひな形', conversation: '開発者とのやりとり' },
    common: { details: '詳細', current: '現在', defaultLabel: 'デフォルト', save: '保存', saving: '保存中...', cancel: 'キャンセル', delete: '削除', loading: '読み込み中...', saved: '保存しました。', saveFailed: '保存に失敗しました: ' },
    hotkeys: {
        title: 'ホットキー', description: 'よく使う順に確認できます。変更するときだけ「詳細」を開いてください。',
        loadFailed: 'ホットキー設定の読み込みに失敗しました: ', loading: 'ホットキー設定を読み込み中...', pressCombination: '修飾キーと通常キーを組み合わせて押してください。Esc でキャンセルできます。', checkFailed: '判定に失敗しました: ', press: '押してください...', pressCancel: '押してください...（Escでキャンセル）', changeSuffix: ' の変更', change: '変更', changeKey: 'キーを変更', pressKey: 'キーを押してください',
        newTitle: '新規付箋作成トリガー', newDescription: '新しい付箋をすぐに作ります。', customKey: 'カスタムキー', doubleCtrl: 'Ctrl 2回押し', doubleShift: 'Shift 2回押し', doublePressNote: '※ 2回押しは他のアプリとキーを奪い合いません（同じ操作を使うアプリがあると両方反応します）',
        launcherTitle: 'クイックランチャートリガー', launcherDescription: 'クイックランチャーを表示・非表示にします。', tripleClick: '右クリック3連打でも開く', tripleClickDescription: '他アプリの上でも使えます。クリックは奪いません。',
        arrangeTitle: '整列', arrangeDescription: 'タグごとに付箋を整列します。', visibilityTitle: '全付箋の非表示・表示', visibilityDescription: 'すべての付箋をまとめて隠す、または元に戻します。',
        bold: '太字', boldDescription: '選択範囲を太字にします。', heading: '見出し', headingDescription: '選択行を見出しにします。', bullets: '箇条書き', bulletsDescription: '選択行を箇条書きにします。', checkbox: 'チェックボックス', checkboxDescription: '選択行をチェック項目にします。', conflict: 'そのキーは別のショートカットで使用されています。',
        available: '✅ 使用できます', reserved: '❌ コピーや貼り付けなどの基本操作のため割り当てできません。', internalPrefix: '❌ このショートカットは「', internalSuffix: '」に割当済みです。', external: '❌ このショートカットは既に他のアプリまたはWindowsで使用されています。別のショートカットを選択してください。',
    },
    templates: {
        title: 'レシピ・QA・用語のひな形', description: '新しく作るときの、節名・役割・並び順を設定します。', notice: '変更は新しく作るレシピ・QA・用語にだけ効きます。既存の内容は変わりません。', cardDescription: '節名・役割・並び順を設定します。', suffix: 'のひな形', loading: 'ひな形を読み込み中...', loadFailed: '読み込みに失敗したため既定値を表示しています。', resetConfirmSuffix: ' のひな形を既定に戻しますか？', resetDone: '既定に戻しました。保存すると反映されます。', emptyLabel: '節名は空にできません。', moveUp: '上へ移動', moveDown: '下へ移動', fixed: '固定', tracked: '数える', prerequisite: '＋事前条件', addFree: '＋自由節を追加', reset: '既定に戻す', newSection: '新しい節', prerequisiteLabel: '事前条件',
        types: { recipe: '手順', qa: 'QA', term: '用語' },
        roles: { situation: '鍵', question: '鍵', name: '鍵', steps: '本体', answer: '本体', gist: '本体', detail: '詳細', source: '出所', supplement: '退避', history: '履歴', free: '自由' },
    },
} as const;

const EN = {
    sidebar: { hotkeys: 'Hotkeys', templates: 'Templates', conversation: 'Developer Messages' },
    common: { details: 'Details', current: 'Current', defaultLabel: 'Default', save: 'Save', saving: 'Saving...', cancel: 'Cancel', delete: 'Delete', loading: 'Loading...', saved: 'Saved.', saveFailed: 'Failed to save: ' },
    hotkeys: {
        title: 'Hotkeys', description: 'Review shortcuts in order of use. Open Details only when you want to change one.',
        loadFailed: 'Failed to load hotkey settings: ', loading: 'Loading hotkey settings...', pressCombination: 'Press a modifier together with a regular key. Press Esc to cancel.', checkFailed: 'Failed to check the shortcut: ', press: 'Press keys...', pressCancel: 'Press keys... (Esc to cancel)', changeSuffix: ' — Change', change: 'Change', changeKey: 'Change key', pressKey: 'Press keys',
        newTitle: 'New Note Trigger', newDescription: 'Create a new sticky note immediately.', customKey: 'Custom key', doubleCtrl: 'Press Ctrl twice', doubleShift: 'Press Shift twice', doublePressNote: 'Double-press does not reserve keys from other apps. If another app uses the same gesture, both may respond.',
        launcherTitle: 'Quick Launcher Trigger', launcherDescription: 'Show or hide the Quick Launcher.', tripleClick: 'Also open with three right-clicks', tripleClickDescription: 'Works over other apps without consuming the clicks.',
        arrangeTitle: 'Arrange Notes', arrangeDescription: 'Arrange sticky notes by tag.', visibilityTitle: 'Hide or Show All Notes', visibilityDescription: 'Hide all sticky notes together or bring them back.',
        bold: 'Bold', boldDescription: 'Make the selected text bold.', heading: 'Heading', headingDescription: 'Turn the selected line into a heading.', bullets: 'Bulleted List', bulletsDescription: 'Turn the selected lines into a bulleted list.', checkbox: 'Checkbox', checkboxDescription: 'Turn the selected line into a checklist item.', conflict: 'That key is already used by another shortcut.',
        available: '✅ Available', reserved: '❌ This key is reserved for basic actions such as copy or paste.', internalPrefix: '❌ This shortcut is already assigned to “', internalSuffix: '”.', external: '❌ This shortcut is already used by another app or Windows. Choose a different shortcut.',
    },
    templates: {
        title: 'Recipe, Q&A, and Term Templates', description: 'Set section names, roles, and order for newly created crystals.', notice: 'Changes apply only to newly created recipes, Q&As, and terms. Existing content is not changed.', cardDescription: 'Set section names, roles, and order.', suffix: ' Template', loading: 'Loading templates...', loadFailed: 'The defaults are shown because the templates could not be loaded.', resetConfirmSuffix: ' template to its defaults?', resetDone: 'Defaults restored. Save to apply them.', emptyLabel: 'Section names cannot be empty.', moveUp: 'Move up', moveDown: 'Move down', fixed: 'Fixed', tracked: 'Track', prerequisite: '+ Prerequisite', addFree: '+ Add Custom Section', reset: 'Restore Defaults', newSection: 'New Section', prerequisiteLabel: 'Prerequisite',
        types: { recipe: 'Recipe', qa: 'Q&A', term: 'Term' },
        roles: { situation: 'Key', question: 'Key', name: 'Key', steps: 'Body', answer: 'Body', gist: 'Body', detail: 'Detail', source: 'Source', supplement: 'Notes', history: 'History', free: 'Custom' },
    },
} as const;

export function getSettingsPageText(language: Language) {
    return language === 'en' ? EN : JA;
}
