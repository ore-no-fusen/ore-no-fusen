const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..');
const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    // 古い ol, ul, li のスタイル指定を正規表現で削除
    content = content.replace(/\.toc\s+ol\s*\{[^}]*\}/g, '');
    content = content.replace(/\.toc\s+ul\s*\{[^}]*\}/g, '');
    content = content.replace(/\.toc\s+li\s*\{[^}]*\}/g, '');

    // 完全に番号と白丸を消し、インデントだけを整える新しいスタイルを追加
    const newStyles = `
.toc ol, .toc ul { list-style-type: none !important; margin: 0; padding: 0; }
.toc ul { margin-left: 12px; }
.toc li { margin-bottom: 6px; line-height: 1.5; padding-left: 4px; break-inside: avoid; }
`;
    content = content.replace('</style>', newStyles + '</style>');

    // ついでに、INDEX.html に出力される目次についても修正
    // INDEX.html の toc-list 内のリンクに list-style-type が付いているわけではないので、
    // 画像の問題は間違いなく各HTMLファイル内の .toc の問題。

    fs.writeFileSync(filePath, content);
});
console.log("Fixed all list styles to remove duplicate numbers and dots.");
