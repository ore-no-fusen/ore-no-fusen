const fs = require('fs');
const path = require('path');

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

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // 既存の .toc { ... } を置換する
    // 目次全体をスクロール不要にするため、2カラム (column-count: 2) に変更する
    
    // CSS書き換え
    // 既存の .toc { background: #fff; padding: ... } などを探す
    const tocRegex = /\.toc\s*\{([^}]*)\}/;
    const match = content.match(tocRegex);
    if (match) {
        let rules = match[1];
        // 既に column-count があれば削除
        rules = rules.replace(/column-count:\s*\d+;/g, '');
        // column-count: 2; を追加
        let newRules = rules + '  column-count: 2;\n  column-gap: 32px;\n';
        content = content.replace(tocRegex, `.toc {${newRules}}`);
    } else {
        // 見つからなければ新しく追加
        content = content.replace('</style>', '.toc { column-count: 2; column-gap: 32px; }\n</style>');
    }
    
    // 各項目の break-inside: avoid; を ol li 要素等に追加（途中で見出しが分割されないようにする）
    // nav.toc ol li { break-inside: avoid; }
    if (!content.includes('break-inside: avoid')) {
        content = content.replace('</style>', '.toc li { break-inside: avoid; }\n</style>');
    }

    // 目次自体のタイトルの直後に目次本体（ol）があるので、タイトルがカラムの中に入ってしまわないように
    // .toc-title { column-span: all; } を追加
    if (!content.includes('column-span')) {
        content = content.replace('</style>', '.toc-title { column-span: all; margin-bottom: 16px; }\n</style>');
    }

    fs.writeFileSync(filePath, content);
});

console.log('All TOCs have been updated to 2 columns!');
