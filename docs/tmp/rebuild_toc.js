const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const docsDir = path.join(__dirname, '..');
const files = [
    "000_REQUIREMENTS.html",
    "001_OVERVIEW.html",
    "002_PC.html",
    "003_IPHONE.html",
    "004_TEST.html",
    "005_GLOSSARY.html",
    "006_4PLUS1_ARCHITECTURE.html"
];

// 絵文字や特定の文字を削ぎ落としてピュアなテキストにするヘルパー
function removeEmoji(str) {
    return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{2B1B}\u{2B1C}\u{2122}\u{00A9}\u{00AE}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{2B1B}\u{2B1C}]/gu, '').trim();
}

// テキストからすべての先頭の数字やドットを完全に削除する
function cleanPrefixNumbers(element) {
    for (let i = 0; i < element.childNodes.length; i++) {
        let node = element.childNodes[i];
        if (node.nodeType === 3) { // Text Node
            let text = node.textContent;
            // "1. 1 " や "2. 2.1 " など、先頭にある数字やドット、スペースをすべて消す
            let replaced = text.replace(/^(?:\s*\d+(?:\.\d+)*\.*)*\s*/, '');
            if (replaced !== text) {
                node.textContent = replaced;
            }
        }
    }
}

function insertNewNumber(element, numStr) {
    for (let node of element.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim() !== '') {
            node.textContent = numStr + ' ' + node.textContent.trimStart();
            return;
        }
    }
    element.appendChild(element.ownerDocument.createTextNode(numStr + ' '));
}

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let html = fs.readFileSync(filePath, 'utf-8');
    
    // 既存のCSSから、ol/ul関連の古いものを削除
    html = html.replace(/\.toc\s+ol[^{]*\{[^}]*\}/g, '');
    html = html.replace(/\.toc\s+ul[^{]*\{[^}]*\}/g, '');
    html = html.replace(/\.toc\s+li[^{]*\{[^}]*\}/g, '');

    // 新しい div ベースの TOC 用の CSS を追加
    // column-count を 3 に変更（ユーザー要望）
    const newTocCss = `
.toc-list { column-count: 3; column-gap: 32px; font-size: 13px; line-height: 1.6; }
@media (max-width: 1024px) { .toc-list { column-count: 2; } }
@media (max-width: 768px) { .toc-list { column-count: 1; } }
.toc-l1 { margin-bottom: 8px; font-weight: 700; break-inside: avoid; }
.toc-l2 { margin-bottom: 6px; margin-left: 16px; font-weight: normal; break-inside: avoid; }
.toc-l3 { margin-bottom: 6px; margin-left: 32px; font-size: 12px; color: #475569; break-inside: avoid; }
.toc-item a { color: #4c1d95; text-decoration: none; }
.toc-item a:hover { text-decoration: underline; }
`;
    if (!html.includes('.toc-list { column-count: 3')) {
        html = html.replace('</style>', newTocCss + '</style>');
    }

    const dom = new JSDOM(html);
    const document = dom.window.document;

    let l1 = 0, l2 = 0, l3 = 0;
    let headings = [];

    // 本文から見出しを抽出
    const elements = document.querySelectorAll('.sec-title, h3, h4, .req-title');

    elements.forEach(el => {
        let level = 0;
        if (el.classList.contains('sec-title')) level = 1;
        else if (el.tagName.toLowerCase() === 'h3' || el.classList.contains('req-title')) level = 2;
        else if (el.tagName.toLowerCase() === 'h4') level = 3;

        if (level === 1) { l1++; l2 = 0; l3 = 0; }
        else if (level === 2) { l2++; l3 = 0; }
        else if (level === 3) { l3++; }

        let numStr = `${l1}${level>=2?'.'+l2:''}${level>=3?'.'+l3:''}`;

        // 見出し内の不要な重複数字を完全に削除してから新しい数字をつける
        cleanPrefixNumbers(el);
        // "4+1 View" など特殊なテキストが壊れないように配慮する必要があるが、
        // 006 は手動で直した。cleanPrefixNumbers の正規表現は先頭の独立した数字群だけを消す
        insertNewNumber(el, numStr);

        let id = el.getAttribute('id');
        if (!id) {
            id = `sec${l1}${level>=2?'-'+l2:''}${level>=3?'-'+l3:''}`;
            el.setAttribute('id', id);
        }

        // TOC用テキスト生成
        let clone = el.cloneNode(true);
        clone.querySelectorAll('span, i, svg').forEach(s => s.remove());
        let pureText = clone.textContent.trim();
        // ここでも数字を消す
        pureText = pureText.replace(/^(?:\s*\d+(?:\.\d+)*\.*)*\s*/, '');
        pureText = removeEmoji(pureText);
        
        let tocText = numStr + ' ' + pureText.trim();
        headings.push({ level, id, text: tocText });
    });

    // 目次HTMLの生成 (ol/ul を一切使わず div で構成)
    let tocHtml = `\n  <div class="toc-title">目次</div>\n  <div class="toc-list">\n`;
    headings.forEach(h => {
        // L1, L2, L3 全て出力する（ユーザー要望：1.1.1までいっていい）
        tocHtml += `    <div class="toc-item toc-l${h.level}"><a href="#${h.id}">${h.text}</a></div>\n`;
    });
    tocHtml += `  </div>\n`;

    let tocContainer = document.querySelector('nav.toc') || document.querySelector('div.toc');
    if (tocContainer) {
        tocContainer.innerHTML = tocHtml;
    }

    fs.writeFileSync(filePath, dom.serialize());
    console.log(`Rebuilt TOC for ${file}`);
});
console.log('TOC rebuild complete!');
