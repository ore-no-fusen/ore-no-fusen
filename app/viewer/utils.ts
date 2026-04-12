export function resizeImageToBase64(file: File, maxWidth = 800): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'always' });
  if (diff < 60_000) return rtf.format(-Math.floor(diff / 1000), 'seconds');
  if (diff < 3_600_000) return rtf.format(-Math.floor(diff / 60_000), 'minutes');
  if (diff < 86_400_000) return rtf.format(-Math.floor(diff / 3_600_000), 'hours');
  return rtf.format(-Math.floor(diff / 86_400_000), 'days');
}

export function insertAtCursor(el: HTMLTextAreaElement, insertion: string): string {
  const { selectionStart, selectionEnd, value } = el;
  const newValue =
    value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
  requestAnimationFrame(() => {
    const pos = selectionStart + insertion.length;
    el.selectionStart = pos;
    el.selectionEnd = pos;
  });
  return newValue;
}

/** 画像ファイル名を生成する（日付・時刻・タイトルコンテキストを含む） */
export function buildImageFileName(title: string, index: number): string {
  const now = new Date();
  const date = now.toLocaleDateString('sv').replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const ctx = title.trim().replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '').slice(0, 10);
  return ctx
    ? `fusen_img_${date}_${time}_${ctx}_${index}.jpg`
    : `fusen_img_${date}_${time}_${index}.jpg`;
}

/** contenteditable のカーソル位置にテキストを挿入 */
export function insertTextAtCursor(text: string): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.setEndAfter(node);
  sel.removeAllRanges();
  sel.addRange(range);
}

/** contenteditable のカーソル位置に DOM ノードを挿入 */
export function insertNodeAtCursor(node: Node): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  const after = document.createTextNode('\n');
  if (node.parentNode) {
    node.parentNode.insertBefore(after, node.nextSibling);
  }
  range.setStartAfter(after);
  range.setEndAfter(after);
  sel.removeAllRanges();
  sel.addRange(range);
}
