/**
 * 責務: contenteditable div の DOM ツリーを Markdown 文字列に変換する
 * 入力: el: HTMLDivElement（contenteditable ルート）
 * 出力: string（末尾改行除去済み Markdown）
 * 副作用: なし
 */
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
    // URLリンクは表示用。保存時は元のURL文字列へ戻す。
    if (node.tagName === 'A') return node.textContent ?? '';
    // 通常行のインライン要素間には改行を追加しない。
    if (node.tagName === 'SPAN') {
      return Array.from(node.childNodes).map((c) => walk(c, false)).join('');
    }
    // br → 改行
    if (node.tagName === 'BR') return '\n';
    // div（ルート以外）→ ブロック要素として先頭に改行
    if (node.tagName === 'DIV' && !isRoot) {
      const children = Array.from(node.childNodes).map((c) => walk(c, false)).join('');
      return '\n' + children;
    }
    // root: 子要素を順に結合し、改行が途切れる箇所を補完する
    let result = '';
    for (const child of Array.from(node.childNodes)) {
      const r = walk(child, false);
      if (r && !r.startsWith('\n') && result && !result.endsWith('\n')) {
        result += '\n';
      }
      result += r;
    }
    return result;
  }
  return walk(el, true).replace(/\n+$/, '');
}

function appendLinkedText(parent: HTMLElement, text: string): void {
  const urlRe = /https?:\/\/[^\s<>"'）)\]}、。]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const link = document.createElement('a');
    link.href = match[0];
    link.textContent = match[0];
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('data-pwa-link', '');
    link.style.cssText = 'color:#2563eb;text-decoration:underline;overflow-wrap:anywhere;';
    parent.appendChild(link);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parent.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

/**
 * 責務: Markdown 文字列を contenteditable DOM に復元する
 * 入力: el: HTMLDivElement, markdown: string, blobMap: Map<string, Blob>（ローカル画像）
 * 出力: なし（el.innerHTML を書き換える）
 * 副作用: el.innerHTML を破壊的に書き換える、blobMap ヒット時に URL.createObjectURL を呼ぶ
 */
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
    // 画像記法 ![任意](filename) 検出（alt textあり・なし両方対応、先頭の空白を許容、後続テキストあり・なし両方対応）
    const imgMatch = line.match(/^\s*!\[[^\]]*\]\(([^)]+)\)(.*)$/);
    if (imgMatch) {
      const filename = imgMatch[1];
      const trailingText = imgMatch[2].trim();
      const file = blobMap.get(filename);
      if (file) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.setAttribute('data-filename', filename);
        img.style.cssText = 'max-height:80px;border-radius:4px;margin:2px 0;';
        el.appendChild(img);
        if (trailingText) {
          const span = document.createElement('span');
          span.textContent = trailingText;
          el.appendChild(span);
        }
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
    appendLinkedText(span, line);
    el.appendChild(span);
    el.appendChild(document.createElement('br'));
    i++;
  }
}

/**
 * 責務: localStorage から既知タグ一覧を読み込む
 * 入力: なし
 * 出力: string[]（パース失敗時は []）
 * 副作用: localStorage 読み取り（fusen_known_tags）
 */
export function loadKnownTags(): string[] {
  try {
    return JSON.parse(localStorage.getItem('fusen_known_tags') || '[]');
  } catch {
    return [];
  }
}

/**
 * 責務: 新タグを既知タグに重複なくマージして localStorage に保存する
 * 入力: newTags: string[]
 * 出力: なし
 * 副作用: localStorage 書き込み（fusen_known_tags）
 */
export function mergeKnownTags(newTags: string[]): void {
  const known = loadKnownTags();
  const merged = Array.from(new Set([...known, ...newTags]));
  localStorage.setItem('fusen_known_tags', JSON.stringify(merged));
}

/**
 * 責務: Markdown テキストの1行目をタイトル、残りを body に分離する
 * 入力: text: string（先頭行の # プレフィックスは除去される）
 * 出力: { title: string; body: string }
 * 副作用: なし
 */
export function extractTitleBody(text: string): { title: string; body: string } {
  const lines = text.split('\n');
  const firstLine = lines[0].replace(/^#\s*/, '').trim();
  // 1行目が画像参照の場合はタイトルなしで全体をbodyに（画像がタイトル扱いになるのを防ぐ）
  if (/^!\[/.test(firstLine)) {
    return { title: '', body: text.replace(/^\n+/, '') };
  }
  const rest = lines.slice(1).join('\n').replace(/^\n+/, '');
  return { title: firstLine, body: rest };
}
