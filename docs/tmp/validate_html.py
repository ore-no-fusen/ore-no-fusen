import re
import sys

with open('docs/INDEX.html', 'r', encoding='utf-8') as f:
    html = f.read()

# doc-grid内を抽出
start_marker = '<div class="doc-grid">'
end_marker = '</div><!-- /doc-grid -->'

s_idx = html.find(start_marker)
e_idx = html.find(end_marker)

if s_idx == -1 or e_idx == -1:
    print("Cannot find doc-grid boundaries")
    sys.exit(1)

grid_content = html[s_idx + len(start_marker):e_idx]

div_open = len(re.findall(r'<div\b[^>]*>', grid_content))
div_close = len(re.findall(r'</div>', grid_content))

print(f"Inside doc-grid: open divs = {div_open}, close divs = {div_close}")
if div_open != div_close:
    print("MISMATCH! HTML structure is broken.")
else:
    print("MATCH. HTML structure should be fine.")
    
# 各カードごとのチェック
blocks = grid_content.split('<!-- ===== 00')
for b in blocks:
    if not b.strip(): continue
    num = b[:1]
    o = len(re.findall(r'<div\b[^>]*>', b))
    c = len(re.findall(r'</div>', b))
    print(f"Card 00{num} -> open: {o}, close: {c}, Diff: {o-c}")

