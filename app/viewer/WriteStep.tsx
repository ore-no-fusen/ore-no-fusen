'use client';

import React from 'react';
import { CropModal } from './CropModal';
import { MermaidModal } from './MermaidModal';
import {
  buildImageFileName,
  insertTextAtCursor,
  insertNodeAtCursor,
  nowJST,
} from './utils';
import { saveDraft } from './lib/indexeddb';
import { serializeEditor, extractTitleBody, mergeKnownTags, loadKnownTags } from './editor-helpers';
import type { TranslationKey } from '@/lib/i18n';
import type { PendingHydrate } from './types';

// ---------------------------------------------------------------------------
// WriteStep: メモ編集画面（step === 'write'）
// ---------------------------------------------------------------------------

type WriteStepProps = {
  // refs
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  // state
  showTagBar: boolean;
  tagInput: string;
  writeTags: string[];
  knownTags: string[];
  imageBlobs: Map<string, Blob>;
  showCropModal: boolean;
  cropFile: File | null;
  showMermaidModal: boolean;
  backgroundSendSuccess: boolean;
  errorMessage: string | null;
  isLoading: boolean;
  isSendingInBackground: boolean;
  currentDraftId: string | null;
  accessToken: string | null;
  t: (key: TranslationKey) => string;
  // setters
  setStep: (step: 'list' | 'write') => void;
  setShowTagBar: React.Dispatch<React.SetStateAction<boolean>>;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  setWriteTags: React.Dispatch<React.SetStateAction<string[]>>;
  setKnownTags: React.Dispatch<React.SetStateAction<string[]>>;
  setImageBlobs: React.Dispatch<React.SetStateAction<Map<string, Blob>>>;
  setShowCropModal: React.Dispatch<React.SetStateAction<boolean>>;
  setCropFile: React.Dispatch<React.SetStateAction<File | null>>;
  setShowMermaidModal: React.Dispatch<React.SetStateAction<boolean>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentDraftId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingHydrate: React.Dispatch<React.SetStateAction<PendingHydrate | null>>;
  // handlers
  handleEditorInput: () => void;
  sendToPC: (payload: { rawText: string; tags: string[]; blobs: Map<string, Blob>; draftId: string | null }) => void;
};

/**
 * 責務: ノート編集画面（contenteditable エディタ・タグ入力・画像添付・PC 送信）を描画する
 * 入力: WriteStepProps（editorRef, fileInputRef, 各 state と callback）
 * 出力: JSX.Element
 * 副作用: なし（コールバックは親から注入）
 */
export function WriteStep({
  editorRef,
  fileInputRef,
  showTagBar,
  tagInput,
  writeTags,
  knownTags,
  imageBlobs,
  showCropModal,
  cropFile,
  showMermaidModal,
  backgroundSendSuccess,
  errorMessage,
  isLoading,
  isSendingInBackground,
  currentDraftId,
  accessToken,
  t,
  setStep,
  setShowTagBar,
  setTagInput,
  setWriteTags,
  setKnownTags,
  setImageBlobs,
  setShowCropModal,
  setCropFile,
  setShowMermaidModal,
  setErrorMessage,
  setIsLoading,
  setCurrentDraftId,
  setPendingHydrate,
  handleEditorInput,
  sendToPC,
}: WriteStepProps) {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#F2F2F7]">
      {/* ヘッダー */}
      <div className="flex items-center px-4 py-3 bg-[#F2F2F7] gap-1">
        <button
          className="text-blue-500 text-sm font-medium px-2 py-2 rounded-xl hover:bg-gray-200 active:bg-gray-300 transition-colors"
          onClick={async () => {
            if (editorRef.current) {
              const rawText = serializeEditor(editorRef.current);
              if (rawText.trim()) {
                const { title, body } = extractTitleBody(rawText);
                const draftId = currentDraftId ?? crypto.randomUUID();
                const imagesArr = Array.from(imageBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
                await saveDraft({ id: draftId, title, body, created_at: nowJST(), images: imagesArr, tags: writeTags }).catch(() => {});
                setCurrentDraftId(draftId);
              }
            }
            setStep('list');
          }}
          aria-label="一覧"
        >
          📋 {t('pwa.listTitle')}
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-0 p-1">
          {/* 画像ボタン */}
          <button
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-600 rounded-lg text-lg transition-colors"
            onClick={() => fileInputRef.current?.click()}
            aria-label="画像を追加"
            title="画像"
          >
            📷
          </button>
          {/* Mermaid ボタン */}
          <button
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-600 rounded-lg text-lg transition-colors"
            onClick={() => setShowMermaidModal(true)}
            aria-label="Mermaidを追加"
            title="Mermaid"
          >
            🔷
          </button>
          {/* チェックボックス挿入ボタン */}
          <button
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-600 rounded-lg text-lg transition-colors"
            onClick={() => {
              const editor = editorRef.current;
              if (!editor) return;
              const sel = window.getSelection();
              if (!sel || sel.rangeCount === 0 || !editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
                editor.focus();
              }
              // カーソルのある行の editorRef 直下ノードを特定
              const currentSel = window.getSelection();
              let lineNode: Node | null = null;
              if (currentSel && currentSel.rangeCount > 0) {
                let node: Node = currentSel.getRangeAt(0).startContainer;
                while (node.parentNode && node.parentNode !== editor) {
                  node = node.parentNode;
                }
                if (node.parentNode === editor) lineNode = node;
              }
              // すでにチェックボックス行なら解除（toggle off）
              if (lineNode instanceof Element && lineNode.hasAttribute('data-checkbox-line')) {
                const text = (lineNode.textContent ?? '').trimStart();
                const div = document.createElement('div');
                div.textContent = text;
                editor.replaceChild(div, lineNode);
                const next = div.nextSibling;
                if (next && next.nodeName === 'BR') editor.removeChild(next);
                const range = document.createRange();
                range.selectNodeContents(div);
                range.collapse(false);
                currentSel?.removeAllRanges();
                currentSel?.addRange(range);
                return;
              }
              // チェックボックス wrapper を作成
              const wrapper = document.createElement('span');
              wrapper.setAttribute('data-checkbox-line', '');
              wrapper.style.cssText = 'display:block;';
              const cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.setAttribute('contenteditable', 'false');
              cb.style.cssText = 'margin-right:4px;pointer-events:auto;vertical-align:middle;';
              cb.addEventListener('mousedown', (e) => e.preventDefault());
              cb.addEventListener('click', (e) => e.stopPropagation());
              wrapper.appendChild(cb);
              if (lineNode && lineNode.parentNode === editor && lineNode.nodeName !== 'BR') {
                // 既存行ノードの子を wrapper に移動（テキストを保持したまま置き換え）
                if (lineNode.nodeType === Node.TEXT_NODE) {
                  // テキストノードが直接 editor の子の場合（カーソルが行の途中にあるとき）
                  wrapper.appendChild(document.createTextNode(lineNode.textContent ?? ''));
                } else {
                  while (lineNode.firstChild) {
                    wrapper.appendChild(lineNode.firstChild);
                  }
                }
                editor.replaceChild(wrapper, lineNode);
                // 後続に <br> がなければ追加（行分離のため）
                if (!wrapper.nextSibling || (wrapper.nextSibling as Element).nodeName !== 'BR') {
                  editor.insertBefore(document.createElement('br'), wrapper.nextSibling);
                }
              } else {
                // 空行または新規: wrapper + br を追加
                wrapper.appendChild(document.createTextNode(''));
                if (lineNode) {
                  editor.insertBefore(wrapper, lineNode);
                  editor.insertBefore(document.createElement('br'), wrapper.nextSibling);
                } else {
                  editor.appendChild(wrapper);
                  editor.appendChild(document.createElement('br'));
                }
              }
              // カーソルを wrapper 末尾に配置
              const range = document.createRange();
              range.selectNodeContents(wrapper);
              range.collapse(false);
              currentSel?.removeAllRanges();
              currentSel?.addRange(range);
            }}
            aria-label="チェックボックスを追加"
            title="チェックボックス"
          >
            ☑
          </button>
          {/* タグボタン */}
          <button
            className={`w-9 h-9 flex items-center justify-center rounded-lg text-lg transition-colors ${
              showTagBar ? 'bg-gray-200 text-gray-900' : 'hover:bg-gray-100 active:bg-gray-200 text-gray-600'
            }`}
            onClick={() => {
              if (!showTagBar) {
                setKnownTags(loadKnownTags());
              }
              setShowTagBar((prev) => !prev);
            }}
            aria-label="タグ"
            title="タグ"
          >
            🏷️
          </button>
        </div>
      </div>

      {/* contenteditable エディタ */}
      <div
        ref={editorRef}
        contentEditable="true"
        suppressContentEditableWarning
        className="flex-1 mx-4 mt-1 mb-2 px-4 py-4 text-base outline-none overflow-y-auto min-h-[200px] focus:outline-none bg-white rounded-2xl shadow-sm"
        data-placeholder="メモを入力..."
        style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        onInput={handleEditorInput}
      />

      {/* タグバー */}
      {showTagBar && (
        <div className="px-4 py-2 border-t border-gray-100 flex flex-wrap gap-2 items-center">
          {writeTags.map((tag, i) => (
            <span
              key={i}
              className="flex items-center gap-1 bg-blue-100 text-blue-800 text-sm rounded-full px-3 py-1"
            >
              {tag}
              <button
                className="text-blue-500 hover:text-blue-700 leading-none"
                onClick={() => setWriteTags((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`タグ ${tag} を削除`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && tagInput.trim()) {
                e.preventDefault();
                const newTag = tagInput.trim();
                if (!writeTags.includes(newTag)) {
                  setWriteTags((prev) => [...prev, newTag]);
                }
                setTagInput('');
              }
            }}
            placeholder="タグを入力（Enter で追加）"
            className="text-sm outline-none border-b border-gray-300 focus:border-blue-400 min-w-[120px] flex-1"
          />
          {/* サジェスト候補 */}
          {(() => {
            const filtered = knownTags
              .filter((t) => !writeTags.includes(t) && t.includes(tagInput))
              .slice(0, 10);
            if (filtered.length === 0) return null;
            return (
              <div className="w-full flex flex-wrap gap-1 mt-1">
                {filtered.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-0.5 bg-gray-100 text-gray-700 text-xs rounded-full pl-2 pr-1 py-0.5"
                  >
                    <button
                      type="button"
                      className="hover:text-blue-700"
                      onClick={() => {
                        if (!writeTags.includes(tag)) {
                          setWriteTags((prev) => [...prev, tag]);
                        }
                        setTagInput('');
                      }}
                    >
                      {tag}
                    </button>
                    <button
                      type="button"
                      className="text-gray-400 hover:text-red-500 leading-none"
                      aria-label={`候補 ${tag} を削除`}
                      onClick={() => {
                        const updated = knownTags.filter((k) => k !== tag);
                        localStorage.setItem('fusen_known_tags', JSON.stringify(updated));
                        setKnownTags(updated);
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {/* 隠し file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setCropFile(file);
          setShowCropModal(true);
          e.target.value = '';
        }}
      />

      {/* 成功メッセージ */}
      {backgroundSendSuccess && (
        <p className="text-center text-green-600 text-sm py-1">送信しました！</p>
      )}
      {errorMessage && (
        <p className="text-center text-red-600 text-sm py-1">{errorMessage}</p>
      )}

      {/* アクションボタン */}
      <div className="flex flex-col gap-3 px-4 py-4 bg-[#F2F2F7]">
        {/* 新規付箋ボタン */}
        <button
          className="w-full py-4 rounded-2xl bg-white text-gray-800 font-semibold disabled:opacity-40 transition-transform active:scale-95 shadow-sm text-base"
          disabled={isLoading}
          onClick={async () => {
            if (!editorRef.current) return;
            new Audio('/sounds/create.wav').play().catch(() => {});
            setIsLoading(true);
            setErrorMessage(null);
            try {
              const rawText = serializeEditor(editorRef.current);
              const { title, body } = extractTitleBody(rawText);
              const draftId = currentDraftId ?? crypto.randomUUID();
              const imagesArr = Array.from(imageBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
              mergeKnownTags(writeTags);
              await saveDraft({
                id: draftId,
                title,
                body,
                created_at: nowJST(),
                images: imagesArr,
                tags: writeTags,
              });
              setImageBlobs(new Map());
              setWriteTags([]);
              setShowTagBar(false);
              setTagInput('');
              setCurrentDraftId(null);
              setPendingHydrate({ markdown: '', blobMap: new Map(), draftId: null, tags: [] });
            } catch (err: unknown) {
              setErrorMessage('保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
            } finally {
              setIsLoading(false);
            }
          }}
        >
          新規付箋
        </button>
        {/* PCに送るボタン */}
        <button
          className="w-full py-4 rounded-2xl bg-blue-500 text-white font-semibold disabled:opacity-40 transition-transform active:scale-95 shadow-md text-base"
          disabled={isSendingInBackground}
          onClick={() => {
            if (!accessToken || !editorRef.current) return;
            new Audio('/sounds/save.wav').play().catch(() => {});
            // クリア前にデータをキャプチャ
            const rawText = serializeEditor(editorRef.current);
            const capturedTags = [...writeTags];
            const capturedBlobs = new Map(imageBlobs);
            const capturedDraftId = currentDraftId;
            // UIを即クリア
            editorRef.current.innerHTML = '';
            setImageBlobs(new Map());
            setWriteTags([]);
            setShowTagBar(false);
            setTagInput('');
            setCurrentDraftId(null);
            // バックグラウンド送信開始
            sendToPC({
              rawText,
              tags: capturedTags,
              blobs: capturedBlobs,
              draftId: capturedDraftId,
            });
          }}
        >
          {isSendingInBackground ? t('pwa.sending') : 'PCに送る'}
        </button>
      </div>

      {/* クロップモーダル */}
      {showCropModal && cropFile && (
        <CropModal
          file={cropFile}
          onCancel={() => {
            setShowCropModal(false);
            setCropFile(null);
          }}
          onCrop={(croppedBlob) => {
            const title = editorRef.current
              ? extractTitleBody(serializeEditor(editorRef.current)).title
              : '';
            const fileName = buildImageFileName(title, imageBlobs.size + 1);
            const file = new File([croppedBlob], fileName, { type: 'image/jpeg' });
            setImageBlobs((prev) => new Map(prev).set(fileName, file));
            const img = document.createElement('img');
            img.src = URL.createObjectURL(croppedBlob);
            img.setAttribute('data-filename', fileName);
            img.style.cssText = 'max-height:80px;border-radius:4px;margin:2px 0;display:block;';
            if (editorRef.current) {
              editorRef.current.focus();
              const sel = window.getSelection();
              if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
                // カーソルがチェックボックス行内なら行の後ろに挿入（行内に入ると serialize 時に無視される）
                let node: Node | null = sel.anchorNode;
                let checkboxSpan: Element | null = null;
                while (node && node !== editorRef.current) {
                  if (node instanceof Element && node.hasAttribute('data-checkbox-line')) {
                    checkboxSpan = node;
                    break;
                  }
                  node = node.parentNode;
                }
                if (checkboxSpan) {
                  checkboxSpan.parentNode!.insertBefore(img, checkboxSpan.nextSibling);
                } else {
                  insertNodeAtCursor(img);
                }
              } else {
                editorRef.current.appendChild(img);
                editorRef.current.appendChild(document.createTextNode('\n'));
              }
            }
            setShowCropModal(false);
            setCropFile(null);
          }}
        />
      )}

      {/* Mermaid モーダル */}
      {showMermaidModal && (
        <MermaidModal
          onCancel={() => setShowMermaidModal(false)}
          onInsert={(code, svg) => {
            if (svg && editorRef.current) {
              const wrapper = document.createElement('div');
              wrapper.setAttribute('data-mermaid-code', code);
              wrapper.style.cssText = 'display:block;margin:4px 0;max-width:100%;overflow-x:auto;';
              wrapper.innerHTML = svg;
              editorRef.current.focus();
              insertNodeAtCursor(wrapper);
            } else {
              const block = `\`\`\`mermaid\n${code}\n\`\`\``;
              insertTextAtCursor(block);
            }
            setShowMermaidModal(false);
          }}
        />
      )}
    </div>
  );
}
