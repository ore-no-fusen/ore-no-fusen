'use client';

/**
 * LanguageContext - 言語設定を管理するReactコンテキスト
 * 
 * 使用方法:
 * 1. LanguageProvider でアプリをラップ
 * 2. useLanguage() で現在の言語と翻訳関数を取得
 */

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Language, TranslationKey, getTranslation, translations } from './i18n';
import { invoke } from '@tauri-apps/api/core';

type LanguageContextType = {
    language: Language;
    setLanguage: (lang: Language) => void;
    t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>('ja');

    // 設定から言語を読み込む
    useEffect(() => {
        const loadLanguage = async () => {
            try {
                // ブラウザ環境チェック
                if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
                    const saved = localStorage.getItem('ore-no-fusen-settings');
                    if (saved) {
                        const settings = JSON.parse(saved);
                        if (settings.language === 'en' || settings.language === 'ja') {
                            setLanguageState(settings.language);
                        }
                    }
                } else {
                    // Tauri環境
                    const settings = await invoke<{ language: Language }>('get_settings');
                    if (settings.language === 'en' || settings.language === 'ja') {
                        setLanguageState(settings.language);
                    }
                }
            } catch (e) {
                console.error('[Language] Failed to load language setting:', e);
            }
        };
        loadLanguage();
    }, []);

    const setLanguage = (lang: Language) => {
        setLanguageState(lang);
    };

    const t = getTranslation(language);

    return (
        <LanguageContext.Provider value={{ language, setLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

/**
 * 現在の言語と翻訳関数を取得するフック
 */
export function useLanguage() {
    const context = useContext(LanguageContext);
    if (!context) {
        // Providerがない場合はデフォルト値を返す
        return {
            language: 'ja' as Language,
            setLanguage: () => { },
            t: getTranslation('ja'),
        };
    }
    return context;
}

/**
 * 言語設定を使用しないコンポーネント向けのシンプルな翻訳関数
 * 設定を直接読み込んで翻訳する
 */
export async function getT(): Promise<(key: TranslationKey) => string> {
    try {
        if (typeof window !== 'undefined' && !('__TAURI__' in window)) {
            const saved = localStorage.getItem('ore-no-fusen-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                return getTranslation(settings.language || 'ja');
            }
        } else {
            const settings = await invoke<{ language: Language }>('get_settings');
            return getTranslation(settings.language || 'ja');
        }
    } catch (e) {
        console.error('[Language] Failed to load language:', e);
    }
    return getTranslation('ja');
}
