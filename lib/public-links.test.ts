import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { publicGuideLinks, PUBLIC_GUIDE_BASE } from './public-links';

describe('user-facing documentation boundary', () => {
    it('keeps Japanese and English guides on the public guide site', () => {
        expect(publicGuideLinks('ja').manual).toBe(`${PUBLIC_GUIDE_BASE}/user-guide/`);
        expect(publicGuideLinks('en').comic).toBe(`${PUBLIC_GUIDE_BASE}/en/user-guide/comic.html`);
        expect(publicGuideLinks('unexpected').manual).toBe(publicGuideLinks('ja').manual);
        for (const language of ['ja', 'en']) {
            for (const url of Object.values(publicGuideLinks(language))) {
                expect(url.startsWith(`${PUBLIC_GUIDE_BASE}/`)).toBe(true);
                expect(url).not.toMatch(/github\.com|00[0-9]_.*\.html/);
            }
        }
    });

    it('does not direct users from settings or landing pages to development resources', () => {
        for (const file of ['components/ui/settings-page.tsx', 'app/landing/page.tsx', 'app/use-cases/windows-sticky-notes/page.tsx']) {
            const source = fs.readFileSync(path.resolve(file), 'utf8');
            expect(source).not.toMatch(/https:\/\/github\.com\/ore-no-fusen\/ore-no-fusen(?:["'/]|$)/);
            expect(source).not.toMatch(/github\.io\/ore-no-fusen\//);
        }
    });
});
