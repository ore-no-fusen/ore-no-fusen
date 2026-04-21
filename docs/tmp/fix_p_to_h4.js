const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..');
const files = ["002_PC.html", "003_IPHONE.html"];

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // <p style="font-size:12px;font-weight:700... を <h4 class="subsec" style="..."> に置換
    // 注意: 既存の改行やスペースも許容する
    const regex = /<p\s+style="font-size:12px;font-weight:700;color:#334155;([^"]*)"(?:[^>]*)>([\s\S]*?)<\/p>/g;
    
    let changed = false;
    content = content.replace(regex, (match, styleRest, innerHtml) => {
        changed = true;
        return `<h4 class="subsec" style="font-size:12px;font-weight:700;color:#334155;${styleRest}">${innerHtml}</h4>`;
    });

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}: Converted <p> to <h4>`);
    }
});
