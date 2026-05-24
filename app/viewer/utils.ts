/**
 * 責務: ISO 日時文字列を「3分前」などの相対時刻表現（日本語）に変換する
 * 入力: isoString: string（ISO 8601 形式）
 * 出力: string（日本語相対時刻）
 * 副作用: なし
 */
export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const rtf = new Intl.RelativeTimeFormat('ja', { numeric: 'always' });
  if (diff < 60_000) return rtf.format(-Math.floor(diff / 1000), 'seconds');
  if (diff < 3_600_000) return rtf.format(-Math.floor(diff / 60_000), 'minutes');
  if (diff < 86_400_000) return rtf.format(-Math.floor(diff / 3_600_000), 'hours');
  return rtf.format(-Math.floor(diff / 86_400_000), 'days');
}

/**
 * 責務: textarea のカーソル位置にテキストを挿入し新しい value を返す
 * 入力: el: HTMLTextAreaElement, insertion: string
 * 出力: string（挿入後の新しい value）
 * 副作用: requestAnimationFrame でカーソル位置を挿入後に移動する
 */
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

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  const random = Math.random().toString(16).slice(2).padEnd(13, '0');
  return `${Date.now().toString(16)}-${random}`;
}

/**
 * 責務: 日付・時刻・タイトルを含む画像ファイル名を生成する
 * 入力: title: string（コンテキスト用）, index: number（連番）
 * 出力: string（例: fusen_img_20260101_120000_タイトル_0.jpg）
 * 副作用: なし
 */
export function buildImageFileName(title: string, index: number): string {
  const now = new Date();
  const date = now.toLocaleDateString('sv').replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const ctx = title.trim().replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '').slice(0, 10);
  return ctx
    ? `fusen_img_${date}_${time}_${ctx}_${index}.jpg`
    : `fusen_img_${date}_${time}_${index}.jpg`;
}

/**
 * 責務: iPhone/iPad からPCへ送る動画ファイル名を生成する
 * 入力: originalName: string
 * 出力: string（例: fusen_video_20260101_120000_dance01_a1b2c3d4.mp4）
 * 副作用: なし
 */
export function buildVideoFileName(originalName: string, titleHint = ''): string {
  const now = new Date();
  const date = now.toLocaleDateString('sv').replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const dot = originalName.lastIndexOf('.');
  const rawBase = dot >= 0 ? originalName.slice(0, dot) : originalName;
  const rawExt = dot >= 0 ? originalName.slice(dot + 1).toLowerCase() : 'mp4';
  const ext = rawExt === 'mov' ? 'mov' : 'mp4';
  const base = (titleHint || rawBase)
    .trim()
    .replace(/[^\w\u3000-\u9fff\u30a0-\u30ff\u3040-\u309f]/g, '')
    .slice(0, 24) || 'video';
  const suffix = createId().replace(/-/g, '').slice(0, 8);
  return `fusen_video_${date}_${time}_${base}_${suffix}.${ext}`;
}

export function buildVideoDisplayName(originalName: string, titleHint = ''): string {
  const dot = originalName.lastIndexOf('.');
  const rawExt = dot >= 0 ? originalName.slice(dot + 1).toLowerCase() : 'mp4';
  const ext = rawExt === 'mov' ? 'mov' : 'mp4';
  const base = titleHint.trim() || (dot >= 0 ? originalName.slice(0, dot) : originalName).trim() || 'video';
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base}.${ext}`;
}

/**
 * 責務: contenteditable のカーソル位置にテキストノードを挿入する
 * 入力: text: string
 * 出力: なし
 * 副作用: window.getSelection() のカーソル位置を変更する
 */
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

/**
 * 責務: 現在時刻を日本時間（JST, +09:00）の ISO 8601 文字列で返す
 * 出力: string（例: "2026-04-15T14:30:00.000+09:00"）
 * 副作用: なし
 */
export function nowJST(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().replace('Z', '+09:00');
}

/**
 * 責務: contenteditable のカーソル位置に DOM ノードを挿入する（直後に改行テキストノードも挿入）
 * 入力: node: Node
 * 出力: なし
 * 副作用: window.getSelection() のカーソル位置を変更する
 */
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
