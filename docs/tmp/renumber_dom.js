const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const docsDir = path.join(__dirname, '..');
const indexPath = path.join(docsDir, 'INDEX.html');
const files = [
    "000_REQUIREMENTS.html",
    "001_OVERVIEW.html",
    "002_PC.html",
    "003_IPHONE.html",
    "004_TEST.html",
    "005_GLOSSARY.html",
    "006_4PLUS1_ARCHITECTURE.html"
];

let indexTocs = {};

// テキストノードから既存の項番（「1. 」「1.1 」等）を削除するヘルパー
function removeOldNumber(element) {
    // 要素内の直接のテキストノードを探す（span等の子要素は無視）
    for (let node of element.childNodes) {
        if (node.nodeType === 3) { // TEXT_NODE
            let text = node.textContent;
            // 先頭のスペースや既存の番号（例: " 1. ", "1.1.2 "）を消す
            let replaced = text.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s*)+/, '');
            if (replaced !== text) {
                node.textContent = replaced;
                break; // 最初に見つかったテキストノードだけ処理すればOK
            } else if (text.trim() !== '') {
                // 空白以外のテキストが見つかり、番号が無ければ抜ける
                break;
            }
        }
    }
}

// テキストノードの先頭に新しい項番を挿入するヘルパー
function insertNewNumber(element, numStr) {
    // <span>絵文字</span> の「次」にあるテキストノードに番号を入れるか、先頭に入れる
    let inserted = false;
    for (let node of element.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim() !== '') {
            node.textContent = ' ' + numStr + node.textContent.trimStart();
            inserted = true;
            break;
        }
    }
    // もし適当なテキストノードが無ければ、要素の最後に追加する（絵文字だけの要素は無い前提だが念のため）
    if (!inserted) {
        element.appendChild(element.ownerDocument.createTextNode(' ' + numStr));
    }
}

// プレーンテキストを取得し、既存の番号も除去してきれいにするヘルパー（TOC用）
function getCleanText(element) {
    let text = element.textContent.trim(); // タグやアイコンを除いた純粋なテキスト
    return text.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s*)+/, '').replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').trim(); // 絵文字も消す
}

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    const html = fs.readFileSync(filePath, 'utf-8');
    const dom = new JSDOM(html);
    const document = dom.window.document;

    let l1 = 0, l2 = 0, l3 = 0;
    let headings = [];

    // 見出し要素を出現順に取得
    const elements = document.querySelectorAll('.sec-title, h3, h4, .req-title');

    elements.forEach(el => {
        let level = 0;
        if (el.classList.contains('sec-title')) level = 1;
        else if (el.tagName.toLowerCase() === 'h3' || el.classList.contains('req-title')) level = 2;
        else if (el.tagName.toLowerCase() === 'h4') level = 3;

        if (level === 1) { l1++; l2 = 0; l3 = 0; }
        else if (level === 2) { l2++; l3 = 0; }
        else if (level === 3) { l3++; }

        let numStr = '';
        if (level === 1) numStr = `${l1}. `;
        else if (level === 2) numStr = `${l1}.${l2} `;
        else if (level === 3) numStr = `${l1}.${l2}.${l3} `;

        removeOldNumber(el);
        insertNewNumber(el, numStr);

        let id = el.getAttribute('id');
        if (!id) {
            id = `sec${l1}${level>=2?'-'+l2:''}${level>=3?'-'+l3:''}`;
            el.setAttribute('id', id);
        }

        // TOC向けにクリーンなテキストを取得
        // el.cloneNode(true) してアイコン要素を取り除いてから textContent を取る
        let clone = el.cloneNode(true);
        let spans = clone.querySelectorAll('span');
        spans.forEach(s => {
            // 絵文字やバッジを含んでいそうなspanを削除
            s.remove();
        });
        let cleanText = clone.textContent.trim();
        // 最後に残った既存番号も消す
        cleanText = cleanText.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s*)+/, '').trim();

        headings.push({ level, id, text: numStr + cleanText });
    });

    // 目次 (tocHtml) を階層的に構築
    let tocHtml = `\n  <div class="toc-title">目次</div>\n  <ol>\n`;
    let currentLevel = 1;

    headings.forEach((h, index) => {
        if (h.level > currentLevel) {
            while (currentLevel < h.level) {
                tocHtml += `<ul>\n`;
                currentLevel++;
            }
        } else if (h.level < currentLevel) {
            while (currentLevel > h.level) {
                tocHtml += `</ul></li>\n`;
                currentLevel--;
            }
            if (index > 0) tocHtml += `</li>\n`;
        } else {
            if (index > 0) tocHtml += `</li>\n`;
        }
        
        tocHtml += `<li><a href="#${h.id}">${h.text}</a>`;
    });

    while (currentLevel > 1) {
        tocHtml += `</li></ul>\n`;
        currentLevel--;
    }
    if (headings.length > 0) tocHtml += `</li>\n`;
    tocHtml += `  </ol>\n`;

    // 本文のTOCコンテナを更新
    let tocContainer = document.querySelector('nav.toc') || document.querySelector('div.toc');
    if (tocContainer) {
        tocContainer.innerHTML = tocHtml;
    }

    fs.writeFileSync(filePath, dom.serialize());

    // INDEX.html 用の toc-list 構築
    let indexToc = '';
    headings.forEach(h => {
        let href = `${file}#${h.id}`;
        if (h.level === 1) {
            if (indexToc) indexToc += `        </div>\n      </div>\n`;
            indexToc += `      <div class="toc-section">\n        <a class="toc-sec-link" href="${href}">${h.text}</a>\n        <div class="toc-sub-list">\n`;
        } else if (h.level === 2) {
            indexToc += `          <a class="toc-sub-link" href="${href}">${h.text}</a>\n`;
        } else if (h.level === 3) {
            indexToc += `          <a class="toc-sub-link" style="margin-left:16px;font-size:11.5px" href="${href}">${h.text}</a>\n`;
        }
    });
    if (headings.length > 0) {
        indexToc += `        </div>\n      </div>\n`;
    }
    indexTocs[file.substring(0,3)] = `    <div class="toc-list">\n${indexToc}    </div>`;
});

// INDEX.html の更新
let indexContent = fs.readFileSync(indexPath, 'utf-8');
const indexDom = new JSDOM(indexContent);
const idxDoc = indexDom.window.document;

Object.keys(indexTocs).forEach(id => {
    // doc-badge badge-001 の親の doc-card を探す
    let badge = idxDoc.querySelector(`.badge-${id}`);
    if (badge) {
        let card = badge.closest('.doc-card');
        if (card) {
            let tocList = card.querySelector('.toc-list');
            if (tocList) {
                tocList.outerHTML = indexTocs[id];
            } else {
                card.insertAdjacentHTML('beforeend', indexTocs[id]);
            }
        }
    }
});

fs.writeFileSync(indexPath, indexDom.serialize());
console.log('DOM-based renumbering completed successfully!');
