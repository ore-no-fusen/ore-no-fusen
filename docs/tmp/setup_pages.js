const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..');
const files = fs.readdirSync(docsDir).filter(f => f.endsWith('.html'));

const umamiScript = '\n<script defer src="https://cloud.umami.is/script.js" data-website-id="ab93c6f7-275c-43f5-a539-7f399e98e27f"></script>\n';

files.forEach(file => {
    const filePath = path.join(docsDir, file);
    let content = fs.readFileSync(filePath, 'utf-8');

    let changed = false;

    // 1. INDEX.html を index.html に置換
    // ナビゲーションリンクや本文内のリンクなどで INDEX.html を指しているものを修正
    if (content.includes('INDEX.html')) {
        content = content.replace(/INDEX\.html/g, 'index.html');
        changed = true;
    }

    // 2. Umamiスクリプトの挿入
    // </head> の直前に挿入する
    if (!content.includes('cloud.umami.is/script.js')) {
        content = content.replace('</head>', umamiScript + '</head>');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    }
});
console.log('Setup completed!');
