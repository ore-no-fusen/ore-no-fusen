export function replaceTaskText(markdown: string, lineIndex: number, text: string): string {
  return markdown.split('\n').map((line, index) => {
    if (index !== lineIndex) return line;
    return line.replace(/^(\s*[-*+]\s*\[[ xX]\]\s*).*/, (_match, prefix: string) => prefix + text);
  }).join('\n');
}
