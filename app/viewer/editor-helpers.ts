// contenteditable div の innerHTML を Markdown 文字列に変換
export function serializeEditor(el: HTMLDivElement): string {
  function walk(node: Node, isRoot: boolean): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    // チェックボックス行（data-checkbox-line を持つ wrapper span）
    if (node instanceof Element && node.hasAttribute('data-checkbox-line')) {
      const cb = node.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      const text = Array.from(node.childNodes)
        .filter((c) => c.nodeType === Node.TEXT_NODE)
        .map((c) => c.textContent ?? '')
        .join('');
      return `- [${cb?.checked ? 'x' : ' '}] ${text}`;
    }
    // mermaid ブロック
    const mermaidCode = node.getAttribute('data-mermaid-code');
    if (mermaidCode != null) return `\`\`\`mermaid\n${mermaidCode}\n\`\`\``;
    // 画像
    if (node.tagName === 'IMG') {
      const fn = node.getAttribute('data-filename');
      return fn ? `![](${fn})` : '';
    }
    // br → 改行
    if (node.tagName === 'BR') return '\n';
    // div（ルート以外）→ ブロック要素として先頭に改行
    const children = Array.from(node.childNodes).map((c) => walk(c, false)).join('');
    if (node.tagName === 'DIV' && !isRoot) return '\n' + children;
    return children;
  }
  return walk(el, true).replace(/\n+$/, '');
}

// Markdown 文字列を contenteditable DOM に復元
export function hydrateEditor(
  el: HTMLDivElement,
  markdown: string,
  blobMap: Map<string, Blob>
): void {
  el.innerHTML = '';
  const lines = markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // ```mermaid ブロック検出
    if (line.startsWith('```mermaid')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // closing ```
      const code = codeLines.join('\n');
      const div = document.createElement('div');
      div.setAttribute('data-mermaid-code', code);
      div.textContent = `[Mermaid: ${code.slice(0, 30)}...]`;
      div.style.cssText = 'background:#f3f4f6;padding:4px 8px;border-radius:4px;font-size:12px;color:#6b7280;margin:4px 0;';
      el.appendChild(div);
      el.appendChild(document.createElement('br'));
      continue;
    }
    // 画像記法 ![任意](filename) 検出（alt textあり・なし両方対応）
    const imgMatch = line.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (imgMatch) {
      const filename = imgMatch[1];
      const file = blobMap.get(filename);
      if (file) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.setAttribute('data-filename', filename);
        img.style.cssText = 'max-height:80px;border-radius:4px;margin:2px 0;';
        el.appendChild(img);
        el.appendChild(document.createElement('br'));
      } else if (filename.startsWith('data:')) {
        // PCから送られた base64 data URI 画像
        const img = document.createElement('img');
        img.src = filename;
        img.setAttribute('data-filename', filename);
        img.style.cssText = 'max-height:80px;border-radius:4px;margin:2px 0;';
        el.appendChild(img);
        el.appendChild(document.createElement('br'));
      } else {
        const span = document.createElement('span');
        span.textContent = line;
        el.appendChild(span);
        el.appendChild(document.createElement('br'));
      }
      i++;
      continue;
    }
    // チェックボックス行 - [ ] / - [x]
    const checkMatch = line.match(/^- \[([ x])\] (.*)$/);
    if (checkMatch) {
      const checked = checkMatch[1] === 'x';
      const text = checkMatch[2];
      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-checkbox-line', '');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = checked;
      cb.setAttribute('contenteditable', 'false');
      cb.style.cssText = 'margin-right:4px;pointer-events:auto;vertical-align:middle;';
      cb.addEventListener('mousedown', (e) => e.preventDefault());
      cb.addEventListener('click', (e) => e.stopPropagation());
      const textNode = document.createTextNode(text);
      wrapper.appendChild(cb);
      wrapper.appendChild(textNode);
      el.appendChild(wrapper);
      el.appendChild(document.createElement('br'));
      i++;
      continue;
    }
    // 通常テキスト行
    const span = document.createElement('span');
    span.textContent = line;
    el.appendChild(span);
    el.appendChild(document.createElement('br'));
    i++;
  }
}

// タグ永続化ヘルパー
export function loadKnownTags(): string[] {
  try {
    return JSON.parse(localStorage.getItem('fusen_known_tags') || '[]');
  } catch {
    return [];
  }
}

export function mergeKnownTags(newTags: string[]): void {
  const known = loadKnownTags();
  const merged = Array.from(new Set([...known, ...newTags]));
  localStorage.setItem('fusen_known_tags', JSON.stringify(merged));
}

// Markdown の1行目をタイトル、残りをbodyとして分離
// 1行目の # プレフィックスは除去
export function extractTitleBody(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const firstLine = lines[0].replace(/^#\s*/, '').trim();
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
  return { title: firstLine, body: rest };
}
