// Only user-facing pages belong here; never link to the development repository.
export const PUBLIC_GUIDE_BASE = 'https://ore-no-fusen.github.io/ore-no-fusen-guide';
export const MICROSOFT_STORE_URL = 'https://apps.microsoft.com/detail/9N4MW0V2MVVG';
export function publicGuideLinks(language: string = 'ja') {
    const manual = `${PUBLIC_GUIDE_BASE}/${language === 'en' ? 'en/' : ''}user-guide/`;
    return {
        manual,
        install: `${manual}install.html`,
        comic: `${manual}comic.html`,
        contact: `${PUBLIC_GUIDE_BASE}/contact.html`,
        updates: `${PUBLIC_GUIDE_BASE}/updates.html`,
        faq: `${PUBLIC_GUIDE_BASE}/faq.html`,
        privacy: `${PUBLIC_GUIDE_BASE}/100_PRIVACY.html`,
        terms: `${PUBLIC_GUIDE_BASE}/101_TERMS.html`,
    } as const;
}
