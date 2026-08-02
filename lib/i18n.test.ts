/**
 * i18n ユーティリティテスト
 *
 * 責務:
 * - 翻訳機能の動作検証
 * - 言語切り替えロジックのテスト
 * - 辞書データの整合性確認
 */

import { describe, it, expect } from 'vitest';
import { getTranslation, translations } from './i18n';

describe('i18n Utility', () => {
    it('returns correct translation for Japanese', () => {
        const t = getTranslation('ja');
        expect(t('settings.title')).toBe('俺の付箋');
        expect(t('common.save')).toBe('保存');
        expect(t('settings.data.basePathPlaceholder')).toBe('フォルダを選択してください...');
        expect(t('settings.data.import')).toBe('Markdownのインポート＆しまったタグのインポート');
        expect(t('settings.data.importTagDesc')).toContain('元のタグフォルダにも残ります');
        expect(t('settings.help.menuTitle')).toBe('使い方');
        expect(t('settings.help.workflow.title')).toBe('よくある使い方');
        expect(t('settings.help.contextTable.title')).toBe('右クリックメニュー早見表');
        expect(t('settings.help.contextTable.archive.action')).toBe('タグフォルダへしまう');
        expect(t('menu.archive')).toBe('タグフォルダへしまう');
        expect(t('menu.openHelp')).toBe('使い方を開く');
        expect(t('menu.colors.yellow')).toBe('黄 - アイデア保存');
        expect(t('menu.colors.black')).toBe('黒 - レシピ・手順');
        expect(t('settings.about.editionDevelopment')).toBe('開発版');
    });

    it('returns correct translation for English', () => {
        const t = getTranslation('en');
        expect(t('settings.title')).toBe('Settings');
        expect(t('common.save')).toBe('Save & Close');
        expect(t('settings.data.basePathPlaceholder')).toBe('Select a folder...');
        expect(t('settings.data.import')).toBe('Import Markdown & Put-Away Tags');
        expect(t('settings.help.menuTitle')).toBe('Help');
        expect(t('settings.help.workflow.title')).toBe('Common Workflows');
        expect(t('settings.help.contextTable.title')).toBe('Right-Click Menu Reference');
        expect(t('menu.openHelp')).toBe('Open Help');
        expect(t('menu.colors.yellow')).toBe('Yellow - ideas');
        expect(t('menu.colors.black')).toBe('Black - recipes');
        expect(t('settings.about.editionDevelopment')).toBe('Development edition');
    });

    it('returns key if translation is missing', () => {
        const t = getTranslation('ja');
        // @ts-ignore - Testing invalid key
        expect(t('non.existent.key')).toBe('non.existent.key');
    });

    it('has matching keys structure for both languages', () => {
        const jaKeys = Object.keys(translations.ja).sort();
        const enKeys = Object.keys(translations.en).sort();
        expect(jaKeys).toEqual(enKeys);
    });
});
