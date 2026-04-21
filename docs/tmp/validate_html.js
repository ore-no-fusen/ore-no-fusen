const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'INDEX.html');
const content = fs.readFileSync(indexPath, 'utf-8');

const startMarker = '<div class="doc-grid">';
const endMarker = '</div><!-- /doc-grid -->';

const sIdx = content.indexOf(startMarker);
const eIdx = content.indexOf(endMarker);

if (sIdx === -1 || eIdx === -1) {
    console.log("Cannot find doc-grid boundaries");
    process.exit(1);
}

const gridContent = content.substring(sIdx + startMarker.length, eIdx);

const divOpenMatch = gridContent.match(/<div\b[^>]*>/g) || [];
const divCloseMatch = gridContent.match(/<\/div>/g) || [];

console.log(`Inside doc-grid: open divs = ${divOpenMatch.length}, close divs = ${divCloseMatch.length}`);

if (divOpenMatch.length !== divCloseMatch.length) {
    console.log("MISMATCH! HTML structure is broken.");
} else {
    console.log("MATCH. HTML structure should be fine.");
}

const blocks = gridContent.split('<!-- ===== 00');
blocks.forEach(b => {
    if (!b.trim()) return;
    const num = b.substring(0, 1);
    const o = (b.match(/<div\b[^>]*>/g) || []).length;
    const c = (b.match(/<\/div>/g) || []).length;
    console.log(`Card 00${num} -> open: ${o}, close: ${c}, Diff: ${o - c}`);
});
