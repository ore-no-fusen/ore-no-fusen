'use client';

export async function loadSecureMermaid() {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
        startOnLoad: false,
        theme: 'neutral',
        securityLevel: 'strict',
        htmlLabels: false,
        flowchart: {
            htmlLabels: false,
        },
    });
    return mermaid;
}

export function sanitizeMermaidSvg(svg: string): string {
    if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
        return svg;
    }

    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    doc.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((node) => node.remove());
    const sanitizeCssValue = (css: string): string => {
        // CSS escapes can disguise identifiers such as url(); if present, drop
        // that declaration rather than trying to interpret an incomplete CSS grammar.
        return css.split(';').map((declaration) => {
            if (/\\[0-9a-f]{1,6}\s?|\\[^\r\n]/i.test(declaration) || /@import/i.test(declaration)) return '';
            return declaration.replace(/url\s*\(([^)]*)\)/gi, (_whole, rawValue: string) => {
                const value = rawValue.trim().replace(/^['"]|['"]$/g, '').trim();
                return value.startsWith('#') ? `url(${value})` : 'none';
            });
        }).filter(Boolean).join(';');
    };
    doc.querySelectorAll('style').forEach((style) => {
        style.textContent = sanitizeCssValue(style.textContent ?? '');
    });

    doc.querySelectorAll('*').forEach((element) => {
        for (const attr of Array.from(element.attributes)) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
            const isStyle = name === 'style' || name === 'fill' || name === 'filter' || name === 'clip-path' || name === 'mask' || name === 'stroke' || name === 'marker-start' || name === 'marker-mid' || name === 'marker-end';
            if (
                name.startsWith('on') ||
                name === 'href' ||
                name === 'xlink:href' ||
                name === 'src' ||
                value.includes('javascript:') ||
                value.includes('file:') ||
                value.includes('http://') ||
                value.includes('https://')
            ) {
                element.removeAttribute(attr.name);
            } else if (isStyle) {
                element.setAttribute(attr.name, sanitizeCssValue(attr.value));
            }
        }
    });

    return new XMLSerializer().serializeToString(doc.documentElement);
}

export const MAX_MERMAID_SOURCE_LENGTH = 20_000;
export const MAX_MERMAID_DIAGRAMS_PER_NOTE = 10;
export const MERMAID_RENDER_TIMEOUT_MS = 5_000;

export async function renderSecureMermaid(id: string, code: string): Promise<string> {
    if (code.length > MAX_MERMAID_SOURCE_LENGTH) {
        throw new Error(`Mermaid図が長すぎます（最大${MAX_MERMAID_SOURCE_LENGTH}文字）。`);
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const deadline = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Mermaid図の作成に時間がかかりすぎました。')), MERMAID_RENDER_TIMEOUT_MS);
        });
        const mermaid = await Promise.race([loadSecureMermaid(), deadline]);
        const { svg } = await Promise.race([
            mermaid.render(id, code),
            deadline,
        ]);
        return sanitizeMermaidSvg(svg);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}
