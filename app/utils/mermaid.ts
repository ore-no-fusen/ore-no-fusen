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

    doc.querySelectorAll('*').forEach((element) => {
        for (const attr of Array.from(element.attributes)) {
            const name = attr.name.toLowerCase();
            const value = attr.value.trim().toLowerCase();
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
            }
        }
    });

    return new XMLSerializer().serializeToString(doc.documentElement);
}

export async function renderSecureMermaid(id: string, code: string): Promise<string> {
    const mermaid = await loadSecureMermaid();
    const { svg } = await mermaid.render(id, code);
    return sanitizeMermaidSvg(svg);
}
