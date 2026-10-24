'use client';

import { parse as parseCss, walk as walkCss } from 'css-tree';

export function createSecureMermaidConfig(defaultSecure: readonly string[]) {
    return {
        startOnLoad: false,
        theme: 'neutral' as const,
        securityLevel: 'strict' as const,
        htmlLabels: false,
        flowchart: {
            htmlLabels: false,
        },
        themeCSS: '',
        // Keep Mermaid's own protections, and prevent note content from
        // overriding the sanitizer or enabling HTML labels.
        secure: [...new Set([...defaultSecure, 'dompurifyConfig', 'htmlLabels', 'flowchart', 'themeCSS', 'themeVariables', 'fontFamily', 'altFontFamily'])],
    };
}

export async function loadSecureMermaid() {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize(createSecureMermaidConfig(mermaid.mermaidAPI.defaultConfig.secure ?? []));
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

// Mermaid 11.16.1 exposes these parsed collections. Reject an unexpected API
// shape rather than silently missing an image that loads before SVG sanitizing.
async function validateMermaidInput(mermaid: Awaited<ReturnType<typeof loadSecureMermaid>>, code: string) {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(code);
    const db = diagram.db as unknown as Record<string, unknown>;
    validateMermaidStyles(db);
    const method = typeof db.getVertices === 'function' || diagram.type.startsWith('flowchart') || diagram.type === 'swimlane' ? 'getVertices'
        : diagram.type === 'sequence' ? 'getActors' : null;
    if (!method) return;
    const getter = db[method];
    if (typeof getter !== 'function') throw new Error('図の安全性を確認できませんでした。');
    const nodes: unknown = getter.call(db);
    if (!(nodes instanceof Map)) throw new Error('図の安全性を確認できませんでした。');
    for (const value of nodes.values()) {
        if (!value || typeof value !== 'object') throw new Error('図の安全性を確認できませんでした。');
        const node = value as Record<string, unknown>;
        const properties = node.properties;
        if (node.img !== undefined || (properties && typeof properties === 'object' && 'icon' in properties)) {
            throw new Error('Mermaid図内の画像は読み込みません。画像は付箋へ直接追加してください。');
        }
    }
}

// Inspect parsed declarations, including nested state definitions. CSS parsing
// decodes CSS syntax; a URL denylist over the original diagram is insufficient.
function validateMermaidStyles(db: Record<string, unknown>) {
    const values: unknown[] = [db];
    for (const name of ['getClasses', 'getStates', 'getRelations', 'getVertices', 'getEdges', 'getBlocks', 'getBlocksFlat', 'getEntities']) {
        const get = db[name];
        if (typeof get === 'function') values.push(get.call(db));
    }
    const seen = new WeakSet<object>();
    const safeFunctions = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark', 'calc', 'min', 'max', 'clamp', 'round', 'mod', 'rem', 'abs', 'sign']);
    const reject = () => { throw new Error('図のスタイルに安全でない指定があります。通常の色や線の指定を使ってください。'); };
    const check = (value: unknown) => {
        if (value == null) return;
        const styles = Array.isArray(value) ? value : [value];
        for (const style of styles) {
            if (typeof style !== 'string') reject();
            const ast = parseCss(style as string, { context: 'declarationList', parseCustomProperty: true, onParseError: reject });
            walkCss(ast, node => {
                if (node.type === 'Url' || node.type === 'Raw' || node.type === 'Atrule'
                    || (node.type === 'Function' && !safeFunctions.has(node.name.toLowerCase()))) reject();
            });
        }
    };
    while (values.length) {
        const value = values.pop();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        if (value instanceof Map) { values.push(...value.values()); continue; }
        if (Array.isArray(value)) {
            values.push(...value);
            check((value as unknown as Record<string, unknown>).defaultStyle);
            continue;
        }
        const record = value as Record<string, unknown>;
        // Nested state statements are converted to node styles only during
        // rendering; inspect their parsed declarations before that conversion.
        if (record.stmt === 'style' || record.stmt === 'classDef') {
            const declarations = record.stmt === 'style' ? record.styleClass : record.classes;
            if (typeof declarations !== 'string') reject();
            check((declarations as string).split(','));
        }
        for (const [key, child] of Object.entries(value)) {
            if (key === 'styles' || key === 'style' || key === 'textStyles' || key === 'cssStyles' || key === 'defaultStyle') check(child);
            else values.push(child);
        }
    }
}

// Keep initialization, parsing, validation and rendering together. A timeout
// stops waiting but does not allow a second render to overlap unfinished work.
let renderQueue: Promise<unknown> = Promise.resolve();

export async function renderSecureMermaid(id: string, code: string): Promise<string> {
    if (code.length > MAX_MERMAID_SOURCE_LENGTH) {
        throw new Error(`Mermaid図が長すぎます（最大${MAX_MERMAID_SOURCE_LENGTH}文字）。`);
    }
    const work = renderQueue.then(async () => {
        const mermaid = await loadSecureMermaid();
        await validateMermaidInput(mermaid, code);
        const { svg } = await mermaid.render(id, code);
        return sanitizeMermaidSvg(svg);
    });
    renderQueue = work.then(() => undefined, () => undefined);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        const deadline = new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error('Mermaid図の作成に時間がかかりすぎました。')), MERMAID_RENDER_TIMEOUT_MS);
        });
        return await Promise.race([work, deadline]);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}
