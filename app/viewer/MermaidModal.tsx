'use client';

import React from 'react';
import type { MermaidModalProps } from './types';

// ---------------------------------------------------------------------------
// MermaidModal: Mermaid コードの入力・プレビュー・挿入
// ---------------------------------------------------------------------------

export function MermaidModal({ onCancel, onInsert }: MermaidModalProps) {
  const [mermaidCode, setMermaidCode] = React.useState('');
  const [previewSvg, setPreviewSvg] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [isRendering, setIsRendering] = React.useState(false);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const handlePreview = async () => {
    setIsRendering(true);
    setPreviewError(null);
    try {
      const { default: mermaid } = await import('mermaid');
      mermaid.initialize({ startOnLoad: false });
      const id = `mermaid-preview-${Date.now()}`;
      const { svg } = await mermaid.render(id, mermaidCode);
      setPreviewSvg(svg);
    } catch (err: unknown) {
      setPreviewError('構文エラー: ' + (err instanceof Error ? err.message : String(err)));
      setPreviewSvg(null);
    } finally {
      setIsRendering(false);
    }
  };

  const handleInsert = () => {
    if (!mermaidCode.trim()) return;
    onInsert(mermaidCode, previewSvg);
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* モーダルヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button
          className="text-gray-500 text-lg font-medium"
          onClick={handleCancel}
        >
          ✕
        </button>
        <span className="font-semibold text-gray-900">Mermaid</span>
        <button
          className="text-blue-600 text-sm font-medium disabled:opacity-40"
          disabled={isRendering || !mermaidCode.trim()}
          onClick={handlePreview}
        >
          {isRendering ? '描画中...' : 'プレビュー'}
        </button>
      </div>

      {/* コード入力 */}
      <textarea
        className="flex-1 px-4 py-3 text-sm font-mono outline-none resize-none border-b border-gray-100"
        placeholder={'graph TD\n  A-->B'}
        value={mermaidCode}
        onChange={(e) => {
          setMermaidCode(e.target.value);
          setPreviewSvg(null);
        }}
      />

      {/* プレビュー領域 */}
      {previewSvg && (
        <div
          ref={previewRef}
          className="px-4 py-3 overflow-auto"
          dangerouslySetInnerHTML={{ __html: previewSvg }}
        />
      )}
      {previewError && (
        <p className="px-4 py-2 text-red-600 text-sm">{previewError}</p>
      )}

      {/* 挿入ボタン */}
      <div className="px-4 py-4 border-t border-gray-200">
        <button
          className="w-full py-3 rounded-lg bg-blue-600 text-white font-medium disabled:opacity-40"
          disabled={!mermaidCode.trim()}
          onClick={handleInsert}
        >
          挿入
        </button>
      </div>
    </div>
  );
}
