// @vitest-environment node
import { build } from 'esbuild';
import { chromium, type Browser } from '@playwright/test';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';

let browser: Browser;
let bundle: string;
beforeAll(async () => {
    const result = await build({ entryPoints: [path.resolve('app/utils/mermaid.ts')], bundle: true, write: false, platform: 'browser', format: 'iife', globalName: 'appMermaidSecurity', logLevel: 'silent' });
    bundle = result.outputFiles[0].text;
    browser = await chromium.launch();
}, 120_000);
afterAll(async () => { await browser?.close(); });

async function checkDiagram(code: string, name: string, recover = false) {
    const page = await browser.newPage();
    const requests: string[] = [];
    await page.route('**/*', async route => { requests.push(route.request().url()); await route.abort(); });
    try {
        await page.setContent('<!doctype html><meta charset="utf-8"><body><div id="out"></div></body>');
        await page.addScriptTag({ content: bundle });
        const result = await page.evaluate(async ({code, name, recover}) => {
            const w = window as any;
            w.__alerts = 0;
            window.alert = () => { w.__alerts += 1; };
            let error = '';
            try {
                const svg = await w.appMermaidSecurity.renderSecureMermaid(name, code);
                document.getElementById('out')!.innerHTML = svg;
                for (const node of document.querySelectorAll('#out *')) node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            } catch (e) {
                error = String(e);
                document.getElementById('out')!.textContent = error;
            }
            if (recover) {
                const svg = await w.appMermaidSecurity.renderSecureMermaid('recovered-diagram', 'flowchart LR\n A["正常"] --> B["再表示"]');
                document.getElementById('out')!.innerHTML = svg;
            }
            await new Promise(resolve => setTimeout(resolve, 150));
            return { error, alerts: w.__alerts, html: document.getElementById('out')!.innerHTML, text: document.getElementById('out')!.textContent, url: location.href };
        }, { code, name, recover });
        // Never reset these records after rendering: rendering itself can load resources.
        expect(requests, name).toEqual([]);
        expect(result.alerts, name).toBe(0);
        expect(result.url).toBe('about:blank');
        if (process.env.ONF_SECURITY_EVIDENCE_DIR) {
            await fs.mkdir(process.env.ONF_SECURITY_EVIDENCE_DIR, { recursive: true });
            await page.screenshot({ path: path.join(process.env.ONF_SECURITY_EVIDENCE_DIR, name + '.png'), fullPage: true });
        }
        return result;
    } finally { await page.close(); }
}

describe('production Mermaid renderer in Chromium', () => {
    const ordinary = [
        ['sequence', 'sequenceDiagram\n Alice->>Bob: 日本語'],
        ['state', 'stateDiagram-v2\n [*] --> A\n A --> B\n classDef normal fill:#e0f2fe,stroke:#0284c7\n class A normal'],
        ['class', 'classDiagram\n class A\n class B\n A --> B'],
        ['er', 'erDiagram\n CUSTOMER ||--o{ ORDER : places'],
        ['journey', 'journey\n title 旅\n section 朝\n 起床: 5: 私'],
        ['gantt', 'gantt\n title 工程\n dateFormat YYYY-MM-DD\n section 準備\n 作業 :a,2026-10-24,1d'],
        ['pie', 'pie\n "項目" : 1'],
        ['git', 'gitGraph\n commit'],
        ['mindmap', 'mindmap\n root((付箋))\n  メモ'],
        ['timeline', 'timeline\n title 計画\n 2026 : 開始'],
        ['block', 'block-beta\n columns 2\n a["開始"] b["終了"]\n a --> b'],
        ['swimlane', 'swimlane-beta\n A["開始"] --> B["終了"]'],
    ];
    for (const [name, code] of ordinary) it('preserves ordinary ' + name + ' diagrams', async () => {
        const result = await checkDiagram(code, 'mermaid-normal-' + name);
        expect(result.error).toBe('');
        expect(result.html).toContain('<svg');
    }, 30_000);
    it('preserves Japanese labels, arrows and ordinary colors', async () => {
        const result = await checkDiagram('flowchart LR\n A["日本語の付箋"] --> B["保存できました"]\n classDef normal fill:#e0f2fe,stroke:#0284c7\n class A normal', 'mermaid-normal');
        expect(result.error).toBe('');
        expect(result.text).toContain('日本語の付箋');
        expect(result.text).toContain('保存できました');
        expect(result.html).toContain('<text');
        expect(result.html).not.toContain('foreignObject');
        expect(result.html).toMatch(/#e0f2fe|rgb\(224,\s*242,\s*254\)/);
    }, 30_000);

    const override = { securityLevel: 'loose', htmlLabels: true, flowchart: { htmlLabels: true }, dompurifyConfig: { ADD_TAGS: ['img'], ADD_ATTR: ['onerror', 'src'] } };
    const attacks = [
        ['mermaid-directive', `%%{init: ${JSON.stringify(override)}}%%\nflowchart LR\n A["<img src=https://attacker.invalid/pixel onerror=alert(1)>"] --> B["安全"]\n click B "javascript:alert(1)"`],
        ['mermaid-frontmatter', `---\nconfig: ${JSON.stringify(override)}\n---\nflowchart LR\n A["<img src=https://attacker.invalid/pixel onerror=alert(1)>"] --> B["安全"]`],
        ['mermaid-native-image', 'flowchart LR\n A@{ img: "https://attacker.invalid/pixel.png", label: "image" }'],
        ['mermaid-swimlane-image', 'swimlane-beta\n A@{ img: "https://attacker.invalid/pixel.png", label: "image" }'],
        ['mermaid-sequence-image', 'sequenceDiagram\n participant A\n properties A: {"icon":"https://attacker.invalid/pixel.png"}\n A->>A: hello'],
        ['mermaid-theme-css', '%%{init: {"themeCSS":"@import url(https://attacker.invalid/a.css); @font-face {font-family:evil;src:url(https://attacker.invalid/font.woff2)} .label {font-family:evil}"}}%%\nflowchart LR\n A[hello] --> B[world]'],
        ['mermaid-class-css', 'flowchart LR\n A[hello] --> B[world]\n classDef external fill:url\\28 https://attacker.invalid/pixel.svg#p\\29\n class A external'],
        ['mermaid-state-fill', 'stateDiagram-v2\n A --> B\n classDef test fill:url(https://attacker.invalid/a.svg#p)\n class A test'],
        ['mermaid-state-background', 'stateDiagram-v2\n A --> B\n classDef test background-image:url(https://attacker.invalid/a.png)\n class A test'],
        ['mermaid-state-direct', 'stateDiagram-v2\n A --> B\n style A fill:url(https://attacker.invalid/a.svg#p)'],
        ['mermaid-state-nested', 'stateDiagram-v2\n state Parent {\n A --> B\n style A fill:url(https://attacker.invalid/a.svg#p)\n }'],
        ['mermaid-state-image-set', 'stateDiagram-v2\n A --> B\n classDef test background-image:image-set("https://attacker.invalid/a.png" 1x)\n class A test'],
        ['mermaid-block-fill', 'block-beta\n A["hello"]\n style A fill:url(https://attacker.invalid/a.svg#p)'],
        ['mermaid-block-background', 'block-beta\n A["hello"]\n style A background-image:url(https://attacker.invalid/a.png)'],
        ['mermaid-block-nested', 'block-beta\n block:Parent\n A["hello"]\n end\n style A fill:url(https://attacker.invalid/a.svg#p)'],
    ];
    for (const [name, code] of attacks) it(name + ' cannot execute or fetch resources during render or after insertion', async () => {
        const result = await checkDiagram(code, name);
        expect(result.html).not.toMatch(/<foreignObject|<script|<img|<image|onerror=|onclick=/i);
        if (name.includes('image')) expect(result.error).toMatch(/画像|安全/);
        else if (name === 'mermaid-class-css' || name.startsWith('mermaid-state-') || name.startsWith('mermaid-block-')) expect(result.error).toMatch(/安全/);
        else expect(result.error).toBe('');
    }, 30_000);

    it('still renders a normal diagram after hostile input', async () => {
        const result = await checkDiagram('flowchart LR\n A@{ img: "https://attacker.invalid/pixel.png", label: "image" }', 'mermaid-after-hostile', true);
        expect(result.error).toMatch(/画像/);
        expect(result.text).toContain('再表示');
    }, 30_000);
});
