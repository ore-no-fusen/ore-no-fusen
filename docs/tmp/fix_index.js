const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'INDEX.html');
let content = fs.readFileSync(indexPath, 'utf-8');

// doc-gridの中身を再構築する
const startMarker = '<!-- ===== DOCUMENT GRID ===== -->\n<div class="doc-grid">\n';
const endMarker = '</div><!-- /doc-grid -->';

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
    let gridContent = content.substring(startIndex + startMarker.length, endIndex);
    
    // 各 00X ブロックを分割
    let blocks = [];
    const ids = ["000", "001", "002", "003", "004", "005", "006"];
    
    for (let i = 0; i < ids.length; i++) {
        let currentId = ids[i];
        let nextId = ids[i+1];
        
        let startDelim = `<!-- ===== ${currentId} ===== -->`;
        let nextDelim = nextId ? `<!-- ===== ${nextId} ===== -->` : null;
        
        let sIdx = gridContent.indexOf(startDelim);
        let eIdx = nextDelim ? gridContent.indexOf(nextDelim) : gridContent.length;
        
        if (sIdx !== -1) {
            let blockStr = gridContent.substring(sIdx, eIdx);
            // 余分な閉じタグを一旦すべて削除し、最後に正確な閉じタグを付与する
            // まず blockStr の中から `</div>` がいくつあるか数える
            // 構造は <div class="doc-card"> <div class="doc-card-header">...</div> <div class="toc-list">...</div> </div> のはず。
            // つまり、header の閉じ、toc-list の中のセクション等の閉じ、そして最後に card の閉じが必要。
            
            // 最も確実なのは、blockStr の一番最後に </div> を一つ強制的に追加することだ。
            // 現状、toc-list が </div> で終わっているが、doc-card が閉じられていない。
            // blockStr の末尾の空白をトリムし、</div> がいくつあるか見る。
            blockStr = blockStr.trimEnd();
            
            // toc-list 自体は </div> で閉じられているはず。
            // doc-card を閉じるための </div> を追加する。
            if (!blockStr.endsWith('</div>\n  </div>') && !blockStr.endsWith('</div></div>')) {
                 blockStr += '\n  </div>\n\n  ';
            }
            
            blocks.push(blockStr);
        }
    }
    
    // 最後に溜まった閉じタグ </div></div></div></div></div></div></body></html> を修正
    let postGrid = content.substring(endIndex);
    postGrid = postGrid.replace(/(<\/div>)+<\/body><\/html>/, '</body></html>');
    
    let newGridContent = '\n  ' + blocks.join('') + '\n';
    
    let newHtml = content.substring(0, startIndex + startMarker.length) + newGridContent + '</div><!-- /doc-grid -->\n\n</body>\n</html>\n';
    
    fs.writeFileSync(indexPath, newHtml);
    console.log('INDEX.html structure fixed!');
} else {
    console.log('Could not find doc-grid markers.');
}
