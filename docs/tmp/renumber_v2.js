const fs = require('fs');
const path = require('path');

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

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // 目次部分を一旦プレースホルダに置き換えて、誤検知を防ぐ
    const tocRegex = /(<(?:nav|div) class="toc">)([\s\S]*?)(<\/(?:nav|div)>)/;
    let tocStartTag = '<nav class="toc">';
    let tocEndTag = '</nav>';
    let hasToc = false;
    
    content = content.replace(tocRegex, (match, p1, p2, p3) => {
        hasToc = true;
        tocStartTag = p1;
        tocEndTag = p3;
        return '<!-- TOC_HERE -->';
    });

    if (!hasToc && content.includes('<!-- TOC_HERE -->')) {
        hasToc = true;
    }

    let l1 = 0, l2 = 0, l3 = 0;
    let headings = [];

    // L1: <div ... class="sec-title" ...>
    // L2: <h3 ...> または <span ... class="req-title" ...>
    // L3: <h4 ...>
    // これらを上から順に処理する
    const headerRegex = /(<div[^>]*class="sec-title"[^>]*>)([\s\S]*?)(<\/div>)|(<h3[^>]*>)([\s\S]*?)(<\/h3>)|(<h4[^>]*>)([\s\S]*?)(<\/h4>)|(<span[^>]*class="req-title"[^>]*>)([\s\S]*?)(<\/span>)/gi;

    content = content.replace(headerRegex, (match, d1, d2, d3, h3_1, h3_2, h3_3, h4_1, h4_2, h4_3, s1, s2, s3) => {
        let level = 0;
        let startTag = '', innerHtml = '', endTag = '';
        
        if (d1) { level = 1; startTag = d1; innerHtml = d2; endTag = d3; }
        else if (h3_1) { level = 2; startTag = h3_1; innerHtml = h3_2; endTag = h3_3; }
        else if (h4_1) { level = 3; startTag = h4_1; innerHtml = h4_2; endTag = h4_3; }
        else if (s1) { level = 2; startTag = s1; innerHtml = s2; endTag = s3; }

        if (level === 1) { l1++; l2 = 0; l3 = 0; }
        else if (level === 2) { l2++; l3 = 0; }
        else if (level === 3) { l3++; }

        let numStr = '';
        if (level === 1) numStr = `${l1}. `;
        else if (level === 2) numStr = `${l1}.${l2} `;
        else if (level === 3) numStr = `${l1}.${l2}.${l3} `;

        // innerHtml から既存の番号を消す
        // 例: <span>絵文字</span> 1.1.1 タイトル -> prefix="<span>絵文字</span> " rest="1.1.1 タイトル"
        let m = innerHtml.match(/^(<span[^>]*>[\s\S]*?<\/span>\s*)?(.*)$/i);
        let prefix = m ? (m[1] || '') : '';
        let rest = m ? (m[2] || innerHtml) : innerHtml;
        
        // rest の先頭にある数字群（1., 1.1, 1.1.1 など）を消去
        rest = rest.replace(/^(?:\d+(?:\.\d+)*\.?\s*)+/, '');
        
        let newInner = prefix + numStr + rest;

        // IDの取得または付与
        let idMatch = startTag.match(/id="([^"]+)"/);
        let hid = idMatch ? idMatch[1] : '';
        if (!hid) {
            hid = `sec${l1}${level>=2?'-'+l2:''}${level>=3?'-'+l3:''}`;
            // startTag に id を付与
            startTag = startTag.replace(/<([a-zA-Z0-9]+)/, `<$1 id="${hid}"`);
        }

        headings.push({
            level,
            id: hid,
            text: newInner.replace(/<[^>]+>/g, '').trim() // タグを除去したプレーンテキスト
        });

        return startTag + newInner + endTag;
    });

    // 目次 (tocHtml) を階層的に構築
    let tocHtml = `  <div class="toc-title">目次</div>\n  <ol>\n`;
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

    if (hasToc) {
        content = content.replace('<!-- TOC_HERE -->', `${tocStartTag}\n${tocHtml}${tocEndTag}`);
    }
    fs.writeFileSync(filePath, content);

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
Object.keys(indexTocs).forEach(id => {
    let parts = indexContent.split(`<!-- ===== ${id} ===== -->`);
    if (parts.length > 1) {
        let blockStr = parts[1];
        let nextMarker = blockStr.indexOf('\n\n  <!-- =====');
        if (nextMarker === -1) nextMarker = blockStr.indexOf('\n</div><!-- /doc-grid -->');
        if (nextMarker === -1) nextMarker = blockStr.length;

        let block = blockStr.substring(0, nextMarker);
        let replaceStart = block.indexOf('<div class="toc-list">');
        let replaceEnd = block.lastIndexOf('</div>') + 6; // </div>の長さ

        if (replaceStart !== -1 && replaceEnd !== -1) {
            let newBlock = block.substring(0, replaceStart) + indexTocs[id] + block.substring(replaceEnd);
            indexContent = parts[0] + `<!-- ===== ${id} ===== -->` + newBlock + parts[1].substring(nextMarker);
        }
    }
});

fs.writeFileSync(indexPath, indexContent);
console.log('All documents completely re-numbered and hierarchical TOCs generated!');
