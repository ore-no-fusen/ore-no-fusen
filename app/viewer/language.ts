import type { Language } from '@/lib/i18n';

export const PWA_LANGUAGE_STORAGE_KEY = 'ore-no-fusen-viewer-language';

export function loadPwaLanguage(storage: Pick<Storage, 'getItem'>): Language {
  return storage.getItem(PWA_LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'ja';
}

export function savePwaLanguage(storage: Pick<Storage, 'setItem'>, language: Language): void {
  storage.setItem(PWA_LANGUAGE_STORAGE_KEY, language);
}
