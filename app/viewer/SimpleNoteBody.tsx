'use client';

import React, { useEffect, useRef } from 'react';
import { renderSecureMermaid } from '../utils/mermaid';

// Mermaid ブロック描画コンポーネント
function MermaidBlock({ code, index }: { code: string; index: number }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const id = `mermaid-${index}-${Date.now()}`;
    renderSecureMermaid(id, code)
      .then((svg) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch((err: unknown) => {
        if (containerRef.current) {
          containerRef.current.textContent =
            'Mermaid エラー: ' + (err instanceof Error ? err.message : String(err));
          containerRef.current.style.color = 'red';
        }
      });
  }, [code, index]);

  return <div ref={containerRef} className="my-4 overflow-auto" />;
}

/**
 * 責務: ノート一覧の各行に表示するノート本文プレビューを描画する（Mermaid ブロックを視覚化）
 * 入力: { body: string }
 * 出力: JSX.Element
 * 副作用: 内部 useEffect で Mermaid SVG レンダリングを行う
 */
export function SimpleNoteBody({ body }: { body: string }) {
  // テキストを「Mermaidブロック」と「その他」に分割する正規表現
  const mermaidRe = /```mermaid\n([\s\S]*?)```/g;
  const imgRe = /!\[([^\]]*)\]\((data:[^)]+)\)/g;

  const parts: React.ReactNode[] = [];
  let key = 0;
  let mermaidIndex = 0;

  type Segment =
    | { type: 'mermaid'; start: number; end: number; code: string }
    | { type: 'img'; start: number; end: number; alt: string; src: string };

  const segments: Segment[] = [];

  let match: RegExpExecArray | null;

  mermaidRe.lastIndex = 0;
  while ((match = mermaidRe.exec(body)) !== null) {
    segments.push({
      type: 'mermaid',
      start: match.index,
      end: match.index + match[0].length,
      code: match[1],
    });
  }

  imgRe.lastIndex = 0;
  while ((match = imgRe.exec(body)) !== null) {
    segments.push({
      type: 'img',
      start: match.index,
      end: match.index + match[0].length,
      alt: match[1],
      src: match[2],
    });
  }

  // 位置順にソート
  segments.sort((a, b) => a.start - b.start);

  let lastIndex = 0;
  for (const seg of segments) {
    if (seg.start > lastIndex) {
      parts.push(
        <span key={key++} style={{ whiteSpace: 'pre-wrap' }}>
          {body.slice(lastIndex, seg.start)}
        </span>
      );
    }
    if (seg.type === 'mermaid') {
      parts.push(<MermaidBlock key={key++} code={seg.code} index={mermaidIndex++} />);
    } else {
      // eslint-disable-next-line @next/next/no-img-element
      parts.push(
        <img
          key={key++}
          src={seg.src}
          alt={seg.alt}
          style={{ maxWidth: '100%', display: 'block', margin: '8px 0' }}
        />
      );
    }
    lastIndex = seg.end;
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
