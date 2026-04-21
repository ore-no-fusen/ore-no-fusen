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

// すべての絵文字や特定の文字を削ぎ落としてピュアなテキストにするヘルパー
function removeEmoji(str) {
    // 典型的な絵文字やシンボルを削除
    return str.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{2B1B}\u{2B1C}\u{2122}\u{00A9}\u{00AE}\u{1F1E6}-\u{1F1FF}\u{1F191}-\u{1F251}\u{1F004}\u{1F0CF}\u{1F170}-\u{1F171}\u{1F17E}\u{1F17F}\u{1F18E}\u{3030}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FE}\u{25FD}\u{25FC}\u{25FB}\u{2B1B}\u{2B1C}]/gu, '').trim();
}

function removeOldNumber(element) {
    let replacedAny = false;
    // 子ノードから純粋なテキストを探し、番号を消す
    for (let i=0; i<element.childNodes.length; i++) {
        let node = element.childNodes[i];
        if (node.nodeType === 3) {
            let text = node.textContent;
            let replaced = text.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s*)+/, '');
            if (replaced !== text) {
                node.textContent = replaced;
                replacedAny = true;
                break;
            }
        }
    }
    // もしそれでも "1. 画面構成" のようなノードが残っていたら強制クリーンアップ
    if (!replacedAny) {
        for (let i=0; i<element.childNodes.length; i++) {
            let node = element.childNodes[i];
            if (node.nodeType === 3 && node.textContent.trim().match(/^\d+\./)) {
                node.textContent = node.textContent.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s*)+/, '');
                break;
            }
        }
    }
}

function insertNewNumber(element, numStr) {
    let inserted = false;
    for (let node of element.childNodes) {
        if (node.nodeType === 3 && node.textContent.trim() !== '') {
            node.textContent = ' ' + numStr + node.textContent.trimStart();
            inserted = true;
            break;
        }
    }
    if (!inserted) {
        element.appendChild(element.ownerDocument.createTextNode(' ' + numStr));
    }
}

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    const html = fs.readFileSync(filePath, 'utf-8');
    const dom = new JSDOM(html);
    const document = dom.window.document;

    let l1 = 0, l2 = 0, l3 = 0;
    let headings = [];

    const elements = document.querySelectorAll('.sec-title, h3, h4, .req-title');

    elements.forEach(el => {
        let level = 0;
        if (el.classList.contains('sec-title')) level = 1;
        else if (el.tagName.toLowerCase() === 'h3' || el.classList.contains('req-title')) level = 2;
        else if (el.tagName.toLowerCase() === 'h4') level = 3;

        if (level === 1) { l1++; l2 = 0; l3 = 0; }
        else if (level === 2) { l2++; l3 = 0; }
        else if (level === 3) { l3++; }

        let numStr = `${l1}${level>=2?'.'+l2:''}${level>=3?'.'+l3:''} `;

        // 本文の要素自体の番号を更新
        removeOldNumber(el);
        // もう一度実行して二重番号 "1. 1. " を確実に取り除く
        removeOldNumber(el);
        insertNewNumber(el, numStr);

        let id = el.getAttribute('id');
        if (!id) {
            id = `sec${l1}${level>=2?'-'+l2:''}${level>=3?'-'+l3:''}`;
            el.setAttribute('id', id);
        }

        // 目次向けテキストの生成（アイコンなし、番号あり）
        let clone = el.cloneNode(true);
        clone.querySelectorAll('span, i, svg').forEach(s => s.remove());
        let pureText = clone.textContent.trim();
        // ここでもう一度数字を除去（クローン上での念押し）
        pureText = pureText.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s*)+/, '');
        // 絵文字除去
        pureText = removeEmoji(pureText);
        
        // TOC用の最終的なテキスト
        let tocText = numStr + pureText.trim();
        headings.push({ level, id, text: tocText });
    });

    // 目次生成（各HTML内）
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

    let tocContainer = document.querySelector('nav.toc') || document.querySelector('div.toc');
    if (tocContainer) {
        tocContainer.innerHTML = tocHtml;
    }

    fs.writeFileSync(filePath, dom.serialize());

    // INDEX.html の文字列組み立て
    let indexToc = '';
    headings.forEach(h => {
        let href = `${file}#${h.id}`;
        if (h.level === 1) {
            if (indexToc) indexToc += `        </div>\n      </div>\n`;
            indexToc += `      <div class="toc-section" style="margin-bottom: 4px;">\n        <a class="toc-sec-link" href="${href}">${h.text}</a>\n        <div class="toc-sub-list" style="display: none;">\n`;
        }
        // L2, L3 は INDEX には出力しない（カードの高さを極力揃えるため）
    });
    if (headings.length > 0) {
        indexToc += `        </div>\n      </div>\n`;
    }
    indexTocs[file.substring(0,3)] = `    <div class="toc-list">\n${indexToc}    </div>`;
});

// INDEX.html をコメントマーカーベースで確実に置換
let indexContent = fs.readFileSync(indexPath, 'utf-8');
Object.keys(indexTocs).forEach(id => {
    let parts = indexContent.split(`<!-- ===== ${id} ===== -->`);
    if (parts.length > 1) {
        let blockStr = parts[1];
        let nextMarker = blockStr.indexOf('\n\n  <!-- =====');
        if (nextMarker === -1) nextMarker = blockStr.indexOf('\n</div><!-- /doc-grid -->');
        if (nextMarker === -1) nextMarker = blockStr.length;

        let block = blockStr.substring(0, nextMarker);
        
        let replaceStart = block.indexOf('<div class="toc-list">');
        let replaceEnd = block.lastIndexOf('</div>');
        if (replaceEnd !== -1) {
            // 見つかった最後の </div> の次まで含める
            replaceEnd += 6; 
        }

        if (replaceStart !== -1 && replaceEnd !== -1) {
            let newBlock = block.substring(0, replaceStart) + indexTocs[id] + block.substring(replaceEnd);
            indexContent = parts[0] + `<!-- ===== ${id} ===== -->` + newBlock + parts[1].substring(nextMarker);
        } else {
            // TOCリストが見つからない場合はカードの末尾（</div>の前）に挿入するフォールバック
            let lastDiv = block.lastIndexOf('</div>');
            if (lastDiv !== -1) {
                let newBlock = block.substring(0, lastDiv) + '\n' + indexTocs[id] + '\n' + block.substring(lastDiv);
                indexContent = parts[0] + `<!-- ===== ${id} ===== -->` + newBlock + parts[1].substring(nextMarker);
            }
        }
    }
});

fs.writeFileSync(indexPath, indexContent);
console.log('Fixed DOM renumbering and INDEX injection completed!');
