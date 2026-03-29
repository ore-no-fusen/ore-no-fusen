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
