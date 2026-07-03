import { describe, expect, it, vi } from 'vitest';
import { loadSecureMermaid, sanitizeMermaidSvg } from './mermaid';

const mermaidMock = vi.hoisted(() => ({
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
        });
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
});
