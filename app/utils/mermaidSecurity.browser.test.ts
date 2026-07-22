import { chromium } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import { sanitizeMermaidSvg } from './mermaid';

describe('Mermaid security behavior in browser', () => {
    it('危険な Mermaid から JS 実行・外部通信・危険 URL クリックが発生しない', async () => {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        const observedRequests: string[] = [];

        await page.route('**/*', async (route) => {
            const url = route.request().url();
            if (/^(https?|file):/i.test(url)) {
                observedRequests.push(url);
                await route.abort();
                return;
            }
            await route.continue();
        });

        page.on('request', (request) => {
            const url = request.url();
            if (/^(https?|file):/i.test(url) && !observedRequests.includes(url)) {
                observedRequests.push(url);
            }
        });

        try {
            await page.setContent('<!doctype html><html><body><div id="out"></div></body></html>');
            await page.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') });

            const rawSvg = await page.evaluate(async () => {
                (window as any).__mermaidSecurityAlerts = 0;
                window.alert = () => {
                    (window as any).__mermaidSecurityAlerts += 1;
                };

                (window as any).mermaid.initialize({
                    startOnLoad: false,
                    theme: 'neutral',
                    securityLevel: 'strict',
                    htmlLabels: false,
                    flowchart: {
                        htmlLabels: false,
                    },
                });

                const code = [
                    'graph TD',
                    '  A["<img src=https://attacker.invalid/pixel onerror=alert(1)>"] --> B',
                    '  click A "https://attacker.invalid/leak" "external"',
                    '  click B "file:///C:/Windows/win.ini" "file"',
                    '  click C "javascript:alert(1)" "javascript"',
                ].join('\n');

                const rendered = await (window as any).mermaid.render('mermaid-security-browser-check', code);
                return rendered.svg;
            });

            const sanitizedSvg = sanitizeMermaidSvg(rawSvg);
            observedRequests.length = 0;

            await page.setContent('<!doctype html><html><body><div id="out"></div></body></html>');

            const result = await page.evaluate(async (svg) => {
                (window as any).__mermaidSecurityAlerts = 0;
                window.alert = () => {
                    (window as any).__mermaidSecurityAlerts += 1;
                };

                const out = document.getElementById('out');
                if (!out) throw new Error('missing output element');
                out.innerHTML = svg;

                for (const element of Array.from(out.querySelectorAll('*'))) {
                    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
                await new Promise((resolve) => setTimeout(resolve, 100));

                const svgLower = svg.toLowerCase();
                return {
                    alertCount: (window as any).__mermaidSecurityAlerts,
                    hrefs: Array.from(out.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? ''),
                    currentUrl: location.href,
                    hasJavascriptScheme: svgLower.includes('javascript:'),
                    hasFileScheme: svgLower.includes('file:'),
                    hasExternalHttp: svgLower.includes('https://attacker.invalid'),
                    hasOnError: svgLower.includes('onerror'),
                    hasOnClick: svgLower.includes('onclick'),
                };
            }, sanitizedSvg);

            expect(result.alertCount).toBe(0);
            expect(result.hrefs).toEqual([]);
            expect(result.currentUrl).toBe('about:blank');
            expect(result.hasJavascriptScheme).toBe(false);
            expect(result.hasFileScheme).toBe(false);
            expect(result.hasExternalHttp).toBe(false);
            expect(result.hasOnError).toBe(false);
            expect(result.hasOnClick).toBe(false);
            expect(observedRequests).toEqual([]);
        } finally {
            await browser.close();
        }
    }, 60000);

    it('flowchart の日本語ラベルを sanitize 後も SVG text として残す', async () => {
        const browser = await chromium.launch();
        const page = await browser.newPage();

        try {
            await page.setContent('<!doctype html><html><body></body></html>');
            await page.addScriptTag({ path: require.resolve('mermaid/dist/mermaid.min.js') });

            const rawSvg = await page.evaluate(async () => {
                (window as any).mermaid.initialize({
                    startOnLoad: false,
                    theme: 'neutral',
                    securityLevel: 'strict',
                    htmlLabels: false,
                    flowchart: {
                        htmlLabels: false,
                    },
                });

                const code = [
                    'flowchart LR',
                    '  A["🍳 レシピにする"] --> B["Recipes/ フォルダに.md が作られる"]',
                    '  B --> C["黒い新付箋が開く= それがレシピ本体"]',
                ].join('\n');

                const rendered = await (window as any).mermaid.render('mermaid-label-browser-check', code);
                return rendered.svg;
            });

            const sanitizedSvg = sanitizeMermaidSvg(rawSvg);
            expect(sanitizedSvg).not.toContain('foreignObject');
            expect(sanitizedSvg).toContain('<text');
            expect(sanitizedSvg).toContain('レシピにする');
            expect(sanitizedSvg).toContain('Recipes/');
            expect(sanitizedSvg).toContain('黒い新付箋が開く');
        } finally {
            await browser.close();
        }
    }, 60000);
});
