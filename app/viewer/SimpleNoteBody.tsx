import React from 'react';

export function SimpleNoteBody({ body }: { body: string }) {
  const imgRe = /!\[([^\]]*)\]\((data:[^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = imgRe.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(
        <span key={key++} style={{ whiteSpace: 'pre-wrap' }}>
          {body.slice(lastIndex, match.index)}
        </span>
      );
    }
    // eslint-disable-next-line @next/next/no-img-element
    parts.push(
      <img key={key++} src={match[2]} alt={match[1]} style={{ maxWidth: '100%', display: 'block', margin: '8px 0' }} />
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(
      <span key={key++} style={{ whiteSpace: 'pre-wrap' }}>
        {body.slice(lastIndex)}
      </span>
    );
  }

  return <div className="mt-4">{parts}</div>;
}
