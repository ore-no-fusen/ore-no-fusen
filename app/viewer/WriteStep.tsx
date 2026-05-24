'use client';

import React from 'react';
import { CropModal } from './CropModal';
import { MermaidModal } from './MermaidModal';
import {
  buildImageFileName,
  buildVideoFileName,
  createId,
  insertTextAtCursor,
  insertNodeAtCursor,
  nowJST,
} from './utils';
import { saveDraft } from './lib/indexeddb';
import { serializeEditor, extractTitleBody, mergeKnownTags, loadKnownTags } from './editor-helpers';
import type { TranslationKey } from '@/lib/i18n';
import type { PendingHydrate, PendingVideoMeta, VideoBlobMap } from './types';

// ---------------------------------------------------------------------------
// WriteStep: メモ編集画面（step === 'write'）
// ---------------------------------------------------------------------------

type WriteStepProps = {
  // refs
  editorRef: React.MutableRefObject<HTMLDivElement | null>;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  videoInputRef: React.MutableRefObject<HTMLInputElement | null>;
  imageBlobsRef: React.MutableRefObject<Map<string, Blob>>;
  videoBlobsRef: React.MutableRefObject<VideoBlobMap>;
  // state
  showTagBar: boolean;
  tagInput: string;
  writeTags: string[];
  knownTags: string[];
  showCropModal: boolean;
  cropFile: File | null;
  showMermaidModal: boolean;
  videoMetas: PendingVideoMeta[];
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
  setCropQueue: React.Dispatch<React.SetStateAction<File[]>>;
  setShowMermaidModal: React.Dispatch<React.SetStateAction<boolean>>;
  setVideoBlobs: React.Dispatch<React.SetStateAction<VideoBlobMap>>;
  setVideoMetas: React.Dispatch<React.SetStateAction<PendingVideoMeta[]>>;
  setErrorMessage: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setCurrentDraftId: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingHydrate: React.Dispatch<React.SetStateAction<PendingHydrate | null>>;
  // handlers
  handleEditorInput: () => void;
  sendToPC: (payload: { rawText: string; tags: string[]; blobs: Map<string, Blob>; videoBlobs?: VideoBlobMap; draftId: string | null }) => Promise<boolean>;
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
  videoInputRef,
  imageBlobsRef,
  videoBlobsRef,
  showTagBar,
  tagInput,
  writeTags,
  knownTags,
  showCropModal,
  cropFile,
  showMermaidModal,
  videoMetas,
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
  setCropQueue,
  setShowMermaidModal,
  setVideoBlobs,
  setVideoMetas,
  setErrorMessage,
  setIsLoading,
  setCurrentDraftId,
  setPendingHydrate,
  handleEditorInput,
  sendToPC,
}: WriteStepProps) {
  const openNextCrop = React.useCallback(() => {
    setCropQueue((prev) => {
      const [nextFile, ...rest] = prev;
      if (nextFile) {
        setCropFile(nextFile);
        setShowCropModal(true);
      } else {
        setCropFile(null);
        setShowCropModal(false);
      }
      return rest;
    });
  }, [setCropFile, setCropQueue, setShowCropModal]);

  const currentVideos = React.useCallback(() => (
    Array.from(videoBlobsRef.current.entries()).map(([fileName, entry]) => ({
      fileName,
      originalName: entry.originalName,
      blob: entry.blob,
    }))
  ), [videoBlobsRef]);

  const videoDraftFields = React.useCallback(() => {
    const videos = currentVideos();
    const first = videos[0];
    return {
      videos,
      type: videos.length > 0 ? ('video' as const) : ('note' as const),
      videoFileName: first?.fileName,
      originalFileName: first?.originalName,
    };
  }, [currentVideos]);

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
                const draftId = currentDraftId ?? createId();
                const imagesArr = Array.from(imageBlobsRef.current.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
                await saveDraft({ id: draftId, title, body, created_at: nowJST(), images: imagesArr, tags: writeTags, ...videoDraftFields() }).catch(() => {});
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
          {/* 動画送信ボタン */}
          <button
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 text-gray-600 rounded-lg text-lg transition-colors"
            onClick={() => videoInputRef.current?.click()}
            aria-label="動画をPCに送る"
            title="動画"
          >
            🎬
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
              // IMGノードはテキストを持たないため、次の兄弟（trailing text span）を使う
              // 例: ![](img.jpg)text → <img><span>text</span> の構造でカーソルがimgに落ちるケース
              if (lineNode && lineNode.nodeName === 'IMG') {
                const next = lineNode.nextSibling;
                if (next && next.nodeName !== 'BR') {
                  lineNode = next;
                }
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
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length === 0) return;
          setCropQueue(files.slice(1));
          setCropFile(files[0]);
          setShowCropModal(true);
          e.target.value = '';
        }}
      />

      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;
          const validFiles = files.filter((file) => {
            const lower = file.name.toLowerCase();
            return lower.endsWith('.mp4') || lower.endsWith('.mov');
          });
          if (validFiles.length !== files.length) {
            setErrorMessage('mp4 または mov を選択してください。');
          }
          if (validFiles.length === 0) {
            return;
          }
          const title = editorRef.current
            ? extractTitleBody(serializeEditor(editorRef.current)).title
            : '';
          const nextMap = new Map(videoBlobsRef.current);
          const nextMetas = [...videoMetas];
          for (const file of validFiles) {
            const fileName = buildVideoFileName(file.name, title);
            nextMap.set(fileName, { blob: file, originalName: file.name });
            nextMetas.push({
              fileName,
              name: file.name,
              size: file.size,
              type: file.type || 'video/mp4',
            });
          }
          videoBlobsRef.current = nextMap;
          setVideoBlobs(nextMap);
          setVideoMetas(nextMetas);
          setErrorMessage(null);
          if (editorRef.current) {
            const rawText = serializeEditor(editorRef.current);
            if (rawText.trim()) {
              const { title, body } = extractTitleBody(rawText);
              const draftId = currentDraftId ?? createId();
              const imagesArr = Array.from(imageBlobsRef.current.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
              saveDraft({
                id: draftId,
                title,
                body,
                created_at: nowJST(),
                images: imagesArr,
                tags: writeTags,
                videos: Array.from(nextMap.entries()).map(([fileName, entry]) => ({
                  fileName,
                  originalName: entry.originalName,
                  blob: entry.blob,
                })),
                type: nextMap.size > 0 ? 'video' : 'note',
                videoFileName: nextMetas[0]?.fileName,
                originalFileName: nextMetas[0]?.name,
              }).catch(() => {});
              setCurrentDraftId(draftId);
            }
          }
        }}
      />

      {/* 成功メッセージ */}
      {backgroundSendSuccess && (
        <p className="text-center text-green-600 text-sm py-1">送信しました！</p>
      )}
      {errorMessage && (
        <p className="text-center text-red-600 text-sm py-1">{errorMessage}</p>
      )}
      {videoMetas.length > 0 && (
        <div className="mx-4 mb-2 flex flex-col gap-2">
          {videoMetas.map((meta) => (
            <div
              key={meta.fileName}
              className="px-3 py-2 rounded-xl bg-white text-sm text-gray-700 shadow-sm flex items-center justify-between gap-2 border border-blue-100"
            >
              <span className="truncate">🎬 {meta.name}</span>
              <button
                type="button"
                className="text-gray-400 hover:text-red-500 px-2"
                aria-label={`${meta.name} を外す`}
                onClick={() => {
                  const nextMap = new Map(videoBlobsRef.current);
                  nextMap.delete(meta.fileName);
                  videoBlobsRef.current = nextMap;
                  setVideoBlobs(nextMap);
                  setVideoMetas((prev) => prev.filter((v) => v.fileName !== meta.fileName));
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
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
              const draftId = currentDraftId ?? createId();
              const imagesArr = Array.from(imageBlobsRef.current.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
              mergeKnownTags(writeTags);
              await saveDraft({
                id: draftId,
                title,
                body,
                created_at: nowJST(),
                images: imagesArr,
                tags: writeTags,
                ...videoDraftFields(),
              });
              imageBlobsRef.current = new Map();
              setImageBlobs(new Map());
              videoBlobsRef.current = new Map();
              setVideoBlobs(new Map());
              setVideoMetas([]);
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
          onClick={async () => {
            if (!editorRef.current) return;
            new Audio('/sounds/save.wav').play().catch(() => {});
            const rawText = serializeEditor(editorRef.current);
            const capturedTags = [...writeTags];
            const capturedBlobs = new Map(imageBlobsRef.current);
            const draftId = currentDraftId ?? createId();
            const { title, body } = extractTitleBody(rawText);
            const imagesArr = Array.from(capturedBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file }));

            try {
              await saveDraft({
                id: draftId,
                title,
                body,
                created_at: nowJST(),
                images: imagesArr,
                ...videoDraftFields(),
                tags: capturedTags,
              });
              setCurrentDraftId(draftId);
              localStorage.setItem('pending_note', draftId);
            } catch (err: unknown) {
              setErrorMessage('送信前の退避保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)));
              return;
            }

            if (!accessToken) {
              setErrorMessage('Driveに接続してください。付箋は下書きに退避しました。');
              return;
            }

            const sent = await sendToPC({
              rawText,
              tags: capturedTags,
              blobs: capturedBlobs,
              videoBlobs: new Map(videoBlobsRef.current),
              draftId,
            });
            if (!sent) return;

            editorRef.current.innerHTML = '';
            imageBlobsRef.current = new Map();
            setImageBlobs(new Map());
            setWriteTags([]);
            setShowTagBar(false);
            setTagInput('');
            videoBlobsRef.current = new Map();
            setVideoBlobs(new Map());
            setVideoMetas([]);
            setCurrentDraftId(null);
            if (localStorage.getItem('pending_note') === draftId) {
              localStorage.removeItem('pending_note');
            }
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
            openNextCrop();
          }}
          onCrop={(croppedBlob) => {
            const title = editorRef.current
              ? extractTitleBody(serializeEditor(editorRef.current)).title
              : '';
            const fileName = buildImageFileName(title, imageBlobsRef.current.size + 1);
            const file = new File([croppedBlob], fileName, { type: 'image/jpeg' });
            const nextBlobs = new Map(imageBlobsRef.current);
            nextBlobs.set(fileName, file);
            imageBlobsRef.current = nextBlobs;
            setImageBlobs(nextBlobs);
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
              const rawText = serializeEditor(editorRef.current);
              if (rawText.trim()) {
                const { title, body } = extractTitleBody(rawText);
                const draftId = currentDraftId ?? createId();
                const imagesArr = Array.from(nextBlobs.entries()).map(([fileName, file]) => ({ fileName, blob: file }));
                saveDraft({ id: draftId, title, body, created_at: nowJST(), images: imagesArr, tags: writeTags, ...videoDraftFields() }).catch(() => {});
                setCurrentDraftId(draftId);
              }
            }
            openNextCrop();
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
