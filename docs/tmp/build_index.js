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

function extractToc(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    // nav または div の toc を探す
    const match = content.match(/<(?:nav|div) class="toc">([\s\S]*?)<\/(?:nav|div)>/);
    if (!match) return "    <div class=\"toc-list\">\n      <!-- 目次がみつかりません -->\n    </div>";
    
    const lines = match[1].split('\n');
    let out = '    <div class="toc-list">\n';
    let inSub = false;
    let mainCounter = 0;
    let subCounter = 0;
    
    for (let line of lines) {
        line = line.trim();
        if (!line || line.includes('<ol>') || line.includes('</ol>') || line.includes('toc-title')) continue;
        
        if (line.includes('<ul>')) {
            inSub = true;
            subCounter = 0;
            // 同じ行に <li><a ... がある場合の対処
            const m = line.match(/<li><a href="([^"]+)">([^<]+)<\/a>/);
            if (m) {
                mainCounter++;
                const href = m[1].replace('#', path.basename(filePath) + '#');
                let text = m[2];
                if (!/^\d+\./.test(text)) text = `${mainCounter}. ${text}`;
                out += `      <div class="toc-section">\n`;
                out += `        <a class="toc-sec-link" href="${href}">${text}</a>\n`;
            }
            out += '        <div class="toc-sub-list">\n';
            continue;
        } 
        
        if (line.includes('</ul>')) {
            inSub = false;
            out += '        </div>\n';
            if (line.includes('</li>')) {
                out += '      </div>\n';
            }
            continue;
        }

        if (line.startsWith('<li><a href=')) {
            let m = line.match(/<li><a href="([^"]+)">([^<]+)<\/a><\/li>/);
            if (!m) m = line.match(/<li><a href="([^"]+)">([^<]+)<\/a>/);
            if (m) {
                const href = m[1].replace('#', path.basename(filePath) + '#');
                let text = m[2];
                if (inSub) {
                    subCounter++;
                    if (!/^\d+\.\d+/.test(text)) text = `${mainCounter}.${subCounter} ${text}`;
                    out += `          <a class="toc-sub-link" href="${href}">${text}</a>\n`;
                } else {
                    mainCounter++;
                    if (!/^\d+\./.test(text)) text = `${mainCounter}. ${text}`;
                    out += `      <div class="toc-section">\n`;
                    out += `        <a class="toc-sec-link" href="${href}">${text}</a>\n`;
                    if (line.includes('</li>')) {
                        out += `      </div>\n`;
                    }
                }
            }
        } else if (line.includes('</li>') && !inSub && !line.startsWith('<li>')) {
            out += '      </div>\n';
        }
    }
    out += '    </div>';
    return out;
}

let indexContent = fs.readFileSync(indexPath, 'utf-8');

for (const file of files) {
    const id = file.substring(0, 3);
    const tocSnippet = extractToc(path.join(docsDir, file));
    
    const parts = indexContent.split(`<!-- ===== ${id} ===== -->`);
    if (parts.length > 1) {
        let nextIdx = parts[1].indexOf('</div>\n\n  <!-- =====');
        let nextIdx2 = parts[1].indexOf('</div><!-- /doc-grid -->');
        let limit = nextIdx !== -1 ? nextIdx : nextIdx2;
        if (limit === -1) limit = parts[1].length;
        
        let block = parts[1].substring(0, limit);
        const startToc = block.indexOf('<div class="toc-list">');
        const endToc = block.lastIndexOf('</div>') + 6;
        
        if (startToc !== -1 && endToc !== -1) {
            const newBlock = block.substring(0, startToc) + tocSnippet + block.substring(endToc);
            indexContent = parts[0] + `<!-- ===== ${id} ===== -->` + newBlock + parts[1].substring(limit);
        }
    }
}

fs.writeFileSync(indexPath, indexContent);
