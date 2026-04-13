'use client';

import React from 'react';
import type { CropModalProps } from './types';

// ---------------------------------------------------------------------------
// CropModal: Canvas API + touch/mouse でクロップ矩形を操作
// ---------------------------------------------------------------------------

/**
 * 責務: 画像クロップモーダルを描画する（Canvas でリサイズ・クロップして Blob を返す）
 * 入力: CropModalProps（file, onCancel, onCrop）
 * 出力: JSX.Element
 * 副作用: Canvas で toBlob() を呼び出す
 */
export function CropModal({ file, onCancel, onCrop }: CropModalProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [imgEl, setImgEl] = React.useState<HTMLImageElement | null>(null);
  // クロップ矩形: 画像座標系 (0〜1 の正規化)
  const [crop, setCrop] = React.useState({ x: 0, y: 0, w: 1, h: 1 });
  const dragging = React.useRef<{ type: 'move' | 'tl'|'tr'|'bl'|'br'|'t'|'b'|'l'|'r'; startX: number; startY: number; startCrop: typeof crop } | null>(null);

  // 画像を読み込んで canvas に描画
  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
    };
    img.src = URL.createObjectURL(file);
    return () => URL.revokeObjectURL(img.src);
  }, [file]);

  React.useEffect(() => {
    if (!imgEl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // canvas サイズ = 表示サイズに合わせる
    const maxW = Math.min(window.innerWidth - 32, 400);
    const scale = maxW / imgEl.naturalWidth;
    canvas.width = imgEl.naturalWidth * scale;
    canvas.height = imgEl.naturalHeight * scale;
    // 画像描画
    ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);
    // クロップ矩形描画
    const rx = crop.x * canvas.width;
    const ry = crop.y * canvas.height;
    const rw = crop.w * canvas.width;
    const rh = crop.h * canvas.height;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.clearRect(rx, ry, rw, rh);
    ctx.drawImage(imgEl, rx / scale, ry / scale, rw / scale, rh / scale, rx, ry, rw, rh);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
    // 4隅ハンドル
    const hs = 12;
    ctx.fillStyle = '#3b82f6';
    [[rx, ry],[rx+rw-hs, ry],[rx, ry+rh-hs],[rx+rw-hs, ry+rh-hs]].forEach(([hx, hy]) => {
      ctx.fillRect(hx, hy, hs, hs);
    });
  }, [imgEl, crop]);

  function getRelativePos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      nx: (clientX - rect.left) / rect.width,
      ny: (clientY - rect.top) / rect.height,
    };
  }

  function hitHandle(nx: number, ny: number): 'tl'|'tr'|'bl'|'br'|'move'|null {
    const hs = 0.04; // normalized handle size
    const { x, y, w, h } = crop;
    if (Math.abs(nx - x) < hs && Math.abs(ny - y) < hs) return 'tl';
    if (Math.abs(nx - (x+w)) < hs && Math.abs(ny - y) < hs) return 'tr';
    if (Math.abs(nx - x) < hs && Math.abs(ny - (y+h)) < hs) return 'bl';
    if (Math.abs(nx - (x+w)) < hs && Math.abs(ny - (y+h)) < hs) return 'br';
    if (nx > x && nx < x+w && ny > y && ny < y+h) return 'move';
    return null;
  }

  function onPointerDown(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    const { nx, ny } = getRelativePos(e, canvasRef.current);
    const type = hitHandle(nx, ny);
    if (!type) return;
    dragging.current = { type, startX: nx, startY: ny, startCrop: { ...crop } };
  }

  function onPointerMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!dragging.current || !canvasRef.current) return;
    const { nx, ny } = getRelativePos(e, canvasRef.current);
    const dx = nx - dragging.current.startX;
    const dy = ny - dragging.current.startY;
    const sc = dragging.current.startCrop;
    let { x, y, w, h } = sc;
    const minSize = 0.05;
    if (dragging.current.type === 'move') {
      x = Math.max(0, Math.min(1 - w, sc.x + dx));
      y = Math.max(0, Math.min(1 - h, sc.y + dy));
    } else if (dragging.current.type === 'tl') {
      x = Math.min(sc.x + dx, sc.x + sc.w - minSize);
      y = Math.min(sc.y + dy, sc.y + sc.h - minSize);
      w = sc.w - (x - sc.x);
      h = sc.h - (y - sc.y);
    } else if (dragging.current.type === 'tr') {
      y = Math.min(sc.y + dy, sc.y + sc.h - minSize);
      w = Math.max(minSize, sc.w + dx);
      h = sc.h - (y - sc.y);
    } else if (dragging.current.type === 'bl') {
      x = Math.min(sc.x + dx, sc.x + sc.w - minSize);
      w = sc.w - (x - sc.x);
      h = Math.max(minSize, sc.h + dy);
    } else if (dragging.current.type === 'br') {
      w = Math.max(minSize, sc.w + dx);
      h = Math.max(minSize, sc.h + dy);
    }
    // 境界クランプ
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(w, 1 - x);
    h = Math.min(h, 1 - y);
    setCrop({ x, y, w, h });
  }

  function onPointerUp() {
    dragging.current = null;
  }

  function handleCrop() {
    if (!imgEl) return;
    const offscreen = document.createElement('canvas');
    const sx = crop.x * imgEl.naturalWidth;
    const sy = crop.y * imgEl.naturalHeight;
    const sw = crop.w * imgEl.naturalWidth;
    const sh = crop.h * imgEl.naturalHeight;
    // 長辺 800px に収める
    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(sw, sh));
    offscreen.width = sw * scale;
    offscreen.height = sh * scale;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, offscreen.width, offscreen.height);
    offscreen.toBlob(
      (blob) => { if (blob) onCrop(blob); },
      'image/jpeg',
      0.85
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
        <button className="text-gray-300 text-sm" onClick={onCancel}>キャンセル</button>
        <span className="text-white font-semibold text-sm">トリミング</span>
        <button className="text-blue-400 text-sm font-medium" onClick={handleCrop}>貼り付け</button>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          className="touch-none max-w-full"
          style={{ cursor: 'crosshair' }}
          onMouseDown={onPointerDown}
          onMouseMove={onPointerMove}
          onMouseUp={onPointerUp}
          onTouchStart={onPointerDown}
          onTouchMove={onPointerMove}
          onTouchEnd={onPointerUp}
        />
      </div>
      <p className="text-center text-gray-400 text-xs pb-4">
        ドラッグで範囲を調整 / 隅のハンドルでリサイズ
      </p>
    </div>
  );
}
