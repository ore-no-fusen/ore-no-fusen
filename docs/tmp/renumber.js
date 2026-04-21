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

    let l1 = 0, l2 = 0, l3 = 0;
    let tocHtml = '';
    
    // 目次生成用のトラッカー
    let currentL1Id = '';
    let inToc = false;

    // 正規表現で L1(sec-title), L2(h3 or req-title), L3(h4) を一括置換
    // 注: h3にidが付いていない場合は目次リンク生成のため付与する
    content = content.replace(/(<div[^>]*id="([^"]+)"[^>]*class="sec-title"[^>]*>)([\s\S]*?)(<\/div>)|(<h3(?:[^>]*id="([^"]+)")?[^>]*>)([\s\S]*?)(<\/h3>)|(<h4(?:[^>]*id="([^"]+)")?[^>]*>)([\s\S]*?)(<\/h4>)|(<span[^>]*class="req-title"[^>]*>)([\s\S]*?)(<\/span>)/gi, 
    (match, d1, d1_id, d2, d3, h3_1, h3_id, h3_2, h3_3, h4_1, h4_id, h4_2, h4_3, s1, s2, s3) => {
        if (d1) {
            l1++; l2 = 0; l3 = 0;
            currentL1Id = d1_id;
            // 番号部分（1. など）を一旦消す
            let clean = d2.replace(/^(<span>.*?<\/span>\s*)?(?:\d+\.\s*)?/, '$1');
            let numStr = `${l1}. `;
            let newContent = clean.replace(/^(<span>.*?<\/span>\s*)?/, `$1${numStr}`);
            
            let textOnly = newContent.replace(/<[^>]+>/g, '').trim();
            if (l1 > 1 && tocHtml.endsWith('</ul>\n      </li>\n')) {
                // 既に閉じているので何もしない
            } else if (l1 > 1) {
                tocHtml += `      </li>\n`;
            }
            tocHtml += `      <li><a href="#${d1_id}">${textOnly}</a>\n`;

            return d1 + newContent + d3;

        } else if (h3_1) {
            l2++; l3 = 0;
            let hid = h3_id || `sec${l1}-${l2}`;
            let startTag = h3_1;
            if (!h3_id) {
                startTag = startTag.replace(/<h3/, `<h3 id="${hid}"`);
            }
            let clean = h3_2.replace(/^(<span>.*?<\/span>\s*)?(?:\d+\.\d+\s*)?/, '$1');
            let numStr = `${l1}.${l2} `;
            let newContent = clean.replace(/^(<span>.*?<\/span>\s*)?/, `$1${numStr}`);

            let textOnly = newContent.replace(/<[^>]+>/g, '').trim();
            if (l2 === 1) tocHtml += `        <ul>\n`;
            else if (l2 > 1 && l3 === 0 && tocHtml.endsWith('</ul>\n          </li>\n')) {
                // do nothing
            } else if (l2 > 1) {
                tocHtml += `          </li>\n`;
            }
            tocHtml += `          <li><a href="#${hid}">${textOnly}</a>\n`;

            return startTag + newContent + h3_3;

        } else if (h4_1) {
            l3++;
            let hid = h4_id || `sec${l1}-${l2}-${l3}`;
            let startTag = h4_1;
            if (!h4_id) {
                startTag = startTag.replace(/<h4/, `<h4 id="${hid}"`);
            }
            let clean = h4_2.replace(/^(<span>.*?<\/span>\s*)?(?:\d+\.\d+\.\d+\s*)?/, '$1');
            let numStr = `${l1}.${l2}.${l3} `;
            let newContent = clean.replace(/^(<span>.*?<\/span>\s*)?/, `$1${numStr}`);

            let textOnly = newContent.replace(/<[^>]+>/g, '').trim();
            if (l3 === 1) tocHtml += `            <ul>\n`;
            tocHtml += `              <li><a href="#${hid}">${textOnly}</a></li>\n`;

            return startTag + newContent + h4_3;

        } else if (s1) { // 000_REQUIREMENTS.html のサブセクション
            l2++; l3 = 0;
            // 000 の req-card 構造には固有IDが存在しないことが多いので req-card 自体に付与されていると仮定（ここではアンカーリンクは作れない場合があるが、とりあえず生成）
            // TOC向けには req-id を使うか仮IDを使う
            let hid = `req${l1}-${l2}`;
            let clean = s2.replace(/^(<span>.*?<\/span>\s*)?(?:\d+\.\d+\s*)?/, '$1');
            let numStr = `${l1}.${l2} `;
            // すでに "実装済み" などのバッジがある場合があるので注意
            let newContent = numStr + clean;

            let textOnly = newContent.replace(/<[^>]+>/g, '').trim();
            if (l2 === 1) tocHtml += `        <ul>\n`;
            tocHtml += `          <li><a href="#${hid}">${textOnly}</a></li>\n`;
            
            // 本文側の span には id が付けられないが、とりあえず見出しテキストだけ置換する
            return s1 + newContent + s3;
        }
        return match;
    });

    // TOCの閉じタグ調整
    if (l3 > 0) tocHtml += `            </ul>\n          </li>\n`;
    else if (l2 > 0) tocHtml += `          </li>\n`;
    if (l2 > 0) tocHtml += `        </ul>\n`;
    if (l1 > 0) tocHtml += `      </li>\n`;

    // 本文内の目次（TOC）セクションを書き換え
    // <nav class="toc"> ... </nav> または <div class="toc"> ... </div>
    const tocRegex = /(<(?:nav|div) class="toc">[\s\S]*?<div class="toc-title">目次<\/div>\n\s*<ol>\n)([\s\S]*?)(<\/ol>\n\s*<\/(?:nav|div)>)/;
    content = content.replace(tocRegex, `$1${tocHtml}$3`);

    fs.writeFileSync(filePath, content);

    // INDEX.html のために変換
    // <li><a href="#id">...</a></li> -> <a class="toc-sub-link" href="file.html#id">...</a>
    let indexToc = tocHtml.split('\n').map(line => {
        if (!line.trim()) return '';
        if (line.includes('<ul>') || line.includes('</ul>') || line.includes('</li>')) return '';
        
        let m = line.match(/<li[^>]*><a href="#([^"]+)">([^<]+)<\/a>/);
        if (m) {
            let href = `${file}#${m[1]}`;
            let text = m[2];
            // 階層判定
            if (line.startsWith('      <li>')) { // L1
                return `      <div class="toc-section">\n        <a class="toc-sec-link" href="${href}">${text}</a>\n        <div class="toc-sub-list">`;
            } else if (line.startsWith('          <li>')) { // L2
                return `          <a class="toc-sub-link" href="${href}">${text}</a>`;
            } else if (line.startsWith('              <li>')) { // L3
                return `          <a class="toc-sub-link" style="margin-left:16px;font-size:11.5px" href="${href}">${text}</a>`;
            }
        }
        return '';
    }).filter(x => x).join('\n');
    
    // セクション閉じタグ調整
    indexToc = indexToc.replace(/(<div class="toc-sub-list">[\s\S]*?)(?=\n      <div class="toc-section">|$)/g, '$1\n        </div>\n      </div>');

    indexTocs[file.substring(0,3)] = `    <div class="toc-list">\n${indexToc}\n    </div>`;
});

// INDEX.html を更新
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
        let replaceEnd = block.lastIndexOf('</div>') + 6;

        if (replaceStart !== -1 && replaceEnd !== -1) {
            let newBlock = block.substring(0, replaceStart) + indexTocs[id] + block.substring(replaceEnd);
            indexContent = parts[0] + `<!-- ===== ${id} ===== -->` + newBlock + parts[1].substring(nextMarker);
        }
    }
});

fs.writeFileSync(indexPath, indexContent);
console.log('All documents and INDEX re-numbered and synced.');
