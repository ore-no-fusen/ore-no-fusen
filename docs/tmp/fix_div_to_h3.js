const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..');
const files = ["002_PC.html", "003_IPHONE.html"];

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // <div id="..." class="subsec">...</div> を <h3 id="..." class="subsec">...</h3> に変換
    const regex = /<div([^>]*class="subsec"[^>]*)>([\s\S]*?)<\/div>/g;
    
    let changed = false;
    content = content.replace(regex, (match, attrs, innerHtml) => {
        changed = true;
        return `<h3${attrs}>${innerHtml}</h3>`;
    });

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}: Converted <div class="subsec"> to <h3>`);
    }
});
