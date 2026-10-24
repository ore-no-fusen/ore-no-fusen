import { describe, expect, it, vi } from 'vitest';
import { loadSecureMermaid, sanitizeMermaidSvg, renderSecureMermaid, MAX_MERMAID_SOURCE_LENGTH, MERMAID_RENDER_TIMEOUT_MS } from './mermaid';

const mermaidMock = vi.hoisted(() => ({
    mermaidAPI: {
        defaultConfig: { secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges'] },
        getDiagramFromText: vi.fn(async () => ({ type: 'flowchart-v2', db: { getVertices: () => new Map() } })),
    },
    initialize: vi.fn(),
    render: vi.fn(),
}));

vi.mock('mermaid', () => ({
    default: mermaidMock,
}));

describe('loadSecureMermaid', () => {
    it('Mermaid を strict セキュリティ設定で初期化する', async () => {
        const mermaid = await loadSecureMermaid();

        expect(mermaid).toBe(mermaidMock);
        expect(mermaidMock.initialize).toHaveBeenCalledWith({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'strict',
            htmlLabels: false,
            flowchart: {
                htmlLabels: false,
            },
            themeCSS: '',
            secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'dompurifyConfig', 'htmlLabels', 'flowchart', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily'],
        });
    });
});

describe('renderSecureMermaid limits', () => {
    it('renders within the source limit and rejects an oversized diagram before parsing', async () => {
        mermaidMock.render.mockReset().mockResolvedValue({ svg: '<svg></svg>' });
        await renderSecureMermaid('within-limit', 'graph TD');
        expect(mermaidMock.render).toHaveBeenCalledTimes(1);
        mermaidMock.render.mockClear();

        await expect(renderSecureMermaid('too-large', 'a'.repeat(MAX_MERMAID_SOURCE_LENGTH + 1)))
            .rejects.toThrow('長すぎます');
        expect(mermaidMock.render).not.toHaveBeenCalled();
    });

    it('refuses an unknown parsed collection without starting the renderer', async () => {
        mermaidMock.render.mockClear();
        mermaidMock.mermaidAPI.getDiagramFromText.mockResolvedValueOnce({
            type: 'flowchart-v2', db: { getVertices: () => ({}) as Map<string, unknown> },
        });
        await expect(renderSecureMermaid('unknown-api', 'graph TD')).rejects.toThrow('安全性');
        expect(mermaidMock.render).not.toHaveBeenCalled();
    });

    it('continues rendering after a rejected job', async () => {
        mermaidMock.render.mockReset().mockRejectedValueOnce(new Error('bad diagram')).mockResolvedValue({ svg: '<svg></svg>' });
        await expect(renderSecureMermaid('bad-job', 'graph TD')).rejects.toThrow('bad diagram');
        await expect(renderSecureMermaid('next-job', 'graph TD')).resolves.toContain('<svg');
    });

    it('returns a timeout error when Mermaid does not finish in time', async () => {
        vi.useFakeTimers();
        let complete: ((value: { svg: string }) => void) | undefined;
        try {
            mermaidMock.render.mockReset().mockImplementation(() => new Promise(resolve => { complete = resolve; }));
            const result = renderSecureMermaid('timeout-check', 'graph TD');
            await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0));
            const rejection = expect(result).rejects.toThrow('時間がかかりすぎました');
            await vi.advanceTimersByTimeAsync(MERMAID_RENDER_TIMEOUT_MS);
            await rejection;
        } finally {
            complete?.({ svg: '<svg></svg>' });
            vi.useRealTimers();
        }
    });
});

describe('sanitizeMermaidSvg', () => {
    it('実行・通信・ファイル参照につながる属性を取り除く', () => {
        const sanitized = sanitizeMermaidSvg(`
            <svg xmlns="http://www.w3.org/2000/svg">
                <script>alert(1)</script>
                <foreignObject><div>bad</div></foreignObject>
                <a href="https://attacker.invalid/leak" onclick="alert(1)">
                    <text onmouseover="alert(1)">link</text>
                </a>
                <image href="file:///C:/Windows/win.ini" />
                <image href="javascript:alert(1)" />
                <image src="https://attacker.invalid/pixel" />
            </svg>
        `);

        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('foreignObject');
        expect(sanitized).not.toContain('href=');
        expect(sanitized).not.toContain('src=');
        expect(sanitized).not.toContain('onclick');
        expect(sanitized).not.toContain('onmouseover');
        expect(sanitized).not.toContain('https://attacker.invalid');
        expect(sanitized).not.toContain('file:///');
        expect(sanitized).not.toContain('javascript:');
    });

    it('CSSの外部参照を取り除き、SVG内参照は残す', () => {
        const sanitized = sanitizeMermaidSvg(`
          <svg xmlns="http://www.w3.org/2000/svg">
            <style>.safe { clip-path: url(#clip); } @import url(https://evil.invalid/x.css); .bad { fill: url(//evil.invalid/a); }</style>
            <path id="a" style="fill:url(//evil.invalid/x); clip-path:url(#clip)" fill="url(/secret)" />
            <path id="b" style="fill:u\\72l(https://evil.invalid/x)" />
          </svg>
        `);
        expect(sanitized).toContain('url(#clip)');
        expect(sanitized).not.toContain('@import');
        expect(sanitized).not.toContain('https://evil.invalid');
        expect(sanitized).not.toContain('//evil.invalid');
        expect(sanitized).not.toContain('url(/secret)');
        expect(sanitized).not.toContain('u\\72l');
    });
});
