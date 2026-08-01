import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
    return readFileSync(path, 'utf8');
}

describe('Windows English UI source guard', () => {
    it('does not restore known Japanese-only notifications and warnings', () => {
        const sticky = source('app/components/StickyNote.tsx');
        const menu = source('app/hooks/useStickyNoteContextMenu.ts');
        const editor = source('app/components/RichTextEditor.tsx');

        const forbidden = [
            "setToastMessage('対応していないファイル形式が含まれています')",
            "setToastMessage('画像の保存先を準備できませんでした')",
            "onToast?.('📌 お気に入りを解除しました')",
            "onToast?.('📌 お気に入りに登録しました')",
            "onToast?.('📱 iPhoneに送りました')",
            "alert(`リンクを開けませんでした。",
            "alert(`ファイルを開けませんでした。",
        ];

        const combined = `${sticky}\n${menu}\n${editor}`;
        for (const text of forbidden) {
            expect(combined).not.toContain(text);
        }
    });

    it('passes the selected language to the native datetime input', () => {
        expect(source('app/components/AlarmDialog.tsx')).toContain(
            "lang={language === 'en' ? 'en-US' : 'ja-JP'}",
        );
    });
});
