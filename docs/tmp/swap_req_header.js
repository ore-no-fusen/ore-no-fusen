const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const reqHtmlPath = path.join(__dirname, '..', '000_REQUIREMENTS.html');
const html = fs.readFileSync(reqHtmlPath, 'utf-8');
const dom = new JSDOM(html);
const document = dom.window.document;

const headers = document.querySelectorAll('.req-header');
let changed = false;

headers.forEach(header => {
    const reqId = header.querySelector('.req-id');
    const reqTitle = header.querySelector('.req-title');
    
    if (reqId && reqTitle) {
        // すでに title が先に来ているか確認
        if (reqTitle.nextElementSibling === reqId) {
            return;
        }
        
        // titleのあとにidバッジを持ってくる
        header.insertBefore(reqTitle, reqId);
        changed = true;
    }
});

if (changed) {
    fs.writeFileSync(reqHtmlPath, dom.serialize());
    console.log("Successfully swapped .req-id and .req-title.");
} else {
    console.log("No changes needed or already swapped.");
}
