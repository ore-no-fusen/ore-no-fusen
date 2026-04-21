const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..');
const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    let changed = false;

    // 1. CSSの .toc ol の修正
    const olRegex = /\.toc\s+ol\s*\{([^}]*)\}/g;
    if (olRegex.test(content)) {
        content = content.replace(olRegex, '.toc ol { list-style-type: none; padding-left: 0; margin: 0; }');
        changed = true;
    } else if (content.includes('.toc')) {
        content = content.replace('</style>', '.toc ol { list-style-type: none; padding-left: 0; margin: 0; }\n</style>');
        changed = true;
    }

    // 2. INDEX.html 内の toc-list の a タグなどが 1. 1 となっている問題はないか？
    // INDEX.html の場合は ol ではなく div ベースなので、ブラウザの自動番号付与はない。
    // そのため画像の問題は INDEX.html ではなく各ドキュメント（000〜006）内の目次のはず。

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated: ${file}`);
    }
});
console.log("Fixed duplicate numbering in TOC by removing ol list-style.");
