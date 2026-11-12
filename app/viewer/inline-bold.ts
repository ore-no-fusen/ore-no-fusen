export type InlineBoldPart = { text: string; bold: boolean };

/** HTMLを作らず、インラインコードとエスケープを残して強調だけを分ける。 */
export function splitInlineBold(text: string): InlineBoldPart[] {
  const parts: InlineBoldPart[] = [];
  const pattern = /`[^`]*`|\\\*|\*\*([^*\n]+)\*\*/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index! > end) parts.push({ text: text.slice(end, match.index), bold: false });
    parts.push({ text: match[1] ?? match[0], bold: match[1] !== undefined });
    end = match.index! + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), bold: false });
  return parts;
}
