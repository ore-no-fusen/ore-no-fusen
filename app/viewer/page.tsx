'use client';

import React, { useState, useEffect } from 'react';
import { formatRelativeTime, insertAtCursor, buildImageFileName, insertTextAtCursor, insertNodeAtCursor, nowJST } from './utils';
import { getTranslation, type Language } from '@/lib/i18n';
import type { IphoneNote, PendingHydrate, DraftRecord } from './types';
import { NoteListStep } from './NoteListStep';
import { PushStep } from './PushStep';
import { WriteStep } from './WriteStep';
import { saveDraft, loadAllDrafts, loadDraft, deleteDraft } from './lib/indexeddb';
import { useAutoSave } from './hooks/useAutoSave';
import { useVisibilitySave } from './hooks/useVisibilitySave';
import { useLockToggle } from './hooks/useLockToggle';
import { useBackgroundSend } from './hooks/useBackgroundSend';
import { useAppInit } from './hooks/useAppInit';
import { useNoteList } from './hooks/useNoteList';
import {
  downloadFromDrive,
  downloadWithAutoRefresh,
  refreshAccessToken,
  uploadWithAutoRefresh,
  uploadImageWithAutoRefresh,
} from './lib/drive';
import { generatePKCE, startOAuth, urlBase64ToUint8Array } from './lib/auth';
import { serializeEditor, hydrateEditor, loadKnownTags, mergeKnownTags, extractTitleBody } from './editor-helpers';

// ---------------------------------------------------------------------------
// ViewerPage コンポーネント
// ---------------------------------------------------------------------------

/**
 * 責務: PWA ルートコンポーネント。ステップ（banner/login/push/write/list）に応じた画面を描画する
 * 入力: なし（ページコンポーネント）
 * 出力: JSX.Element
 * 副作用: 複数のカスタムフックが状態・副作用を管理（useAppInit, useAutoSave, useVisibilitySave, useNoteList 等）
 */
export default function ViewerPage() {
  const [lang, setLang] = useState<Language>('ja');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const browserLang = navigator.language.startsWith('ja') ? 'ja' : 'en';
      setLang(browserLang);
    }
  }, []);
  const t = getTranslation(lang);

  const [isStandalone, setIsStandalone] = useState(false);
  const [step, setStep] = useState<
    'banner' | 'login' | 'push' | 'ready' | 'write' | 'list'
  >('banner');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [imageBlobs, setImageBlobs] = useState<Map<string, Blob>>(new Map());
  const [writeTags, setWriteTags] = useState<string[]>([]);
  const [showTagBar, setShowTagBar] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [historyNotes, setHistoryNotes] = useState<IphoneNote[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const hasRestoredLockRef = React.useRef(false);
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [pendingHydrate, setPendingHydrate] = useState<PendingHydrate | null>(null);
  const currentDraftIdRef = React.useRef<string | null>(null);
  const imageBlobsRef = React.useRef<Map<string, Blob>>(new Map());
  const writeTagsRef = React.useRef<string[]>([]);

  // アプリ初期化（SW登録・OAuth・ステップ遷移）
  useAppInit({
    setIsStandalone,
    setSwReady,
    setStep,
    setAccessToken,
    setIsLoading,
    setErrorMessage,
    setPendingHydrate,
  });

  // refs を state と同期（visibilitychange ハンドラで最新値を参照するため）
  useEffect(() => { currentDraftIdRef.current = currentDraftId; }, [currentDraftId]);
  useEffect(() => { imageBlobsRef.current = imageBlobs; }, [imageBlobs]);
  useEffect(() => { writeTagsRef.current = writeTags; }, [writeTags]);

  // visibilitychange: バックグラウンドになった瞬間に保存
  useVisibilitySave({ editorRef, currentDraftIdRef, imageBlobsRef, writeTagsRef });

  // onInput 自動保存
  const handleEditorInput = useAutoSave(
    { editorRef, currentDraftIdRef, imageBlobsRef, writeTagsRef },
    { setCurrentDraftId }
  );

  // pendingHydrate: list→write 遷移後に editorRef がマウントされてから hydrateEditor を呼ぶ
  useEffect(() => {
    if (!pendingHydrate) return;
    const run = async () => {
      if (!editorRef.current) return;
      const el = editorRef.current;
      hydrateEditor(el, pendingHydrate.markdown, pendingHydrate.blobMap);
      // mermaid ブロックをレンダリング（PC送信ノートの ```mermaid...``` を SVG に変換）
      const mermaidDivs = Array.from(el.querySelectorAll<HTMLElement>('[data-mermaid-code]'));
      if (mermaidDivs.length > 0) {
        try {
          const { default: mermaid } = await import('mermaid');
          mermaid.initialize({ startOnLoad: false });
          for (let idx = 0; idx < mermaidDivs.length; idx++) {
            const div = mermaidDivs[idx];
            const code = div.getAttribute('data-mermaid-code') ?? '';
            try {
              const { svg } = await mermaid.render(`mermaid-h-${idx}-${Date.now()}`, code);
              if (el.contains(div)) {
                div.innerHTML = svg;
                div.style.cssText = 'display:block;margin:4px 0;max-width:100%;overflow-x:auto;';
              }
            } catch { /* レンダリング失敗はプレースホルダのまま */ }
          }
        } catch { /* mermaid import 失敗 */ }
      }
      setImageBlobs(pendingHydrate.blobMap);
      setCurrentDraftId(pendingHydrate.draftId);
      setWriteTags(pendingHydrate.tags);
      setShowTagBar(pendingHydrate.tags.length > 0);
      setPendingHydrate(null);
    };
    const timer = setTimeout(run, 50);
    return () => clearTimeout(timer);
  }, [pendingHydrate]);

  const {
    lockedNoteIds,
    setLockedNoteIds,
    initLockedNoteIds,
    isLockPermissionPending,
    handleLockToggle,
  } = useLockToggle({ onError: (msg) => setErrorMessage(msg) });

  // step === 'list' になったとき一覧ロード（Drive → IndexedDB → UI）
  useNoteList({
    step,
    accessToken,
    hasRestoredLockRef,
    setHistoryNotes,
    setIsHistoryLoading,
    setThumbnailUrls,
    initLockedNoteIds,
  });

  const {
    isSendingInBackground,
    backgroundSendSuccess,
    backgroundSendError,
    sendToPC,
  } = useBackgroundSend({
    accessToken,
    onTokenRefreshed: (newToken) => setAccessToken(newToken),
    onSessionExpired: () => setStep('login'),
  });

  // メモ削除ハンドラ
  const handleDeleteNote = async (note: IphoneNote) => {
    setIsLoading(true);
    try {
      // received_pc の場合: Drive再取得 → 対象削除 → Upload → IndexedDB削除（順序厳守）
      if (note.status === 'received_pc' && accessToken) {
        try {
          const raw = await downloadWithAutoRefresh(accessToken, 'notes_to_iphone.json') as { items?: unknown[] };
          const items = (Array.isArray(raw.items) ? raw.items : []) as { id: string }[];
          const updated = items.filter((n) => n.id !== note.id);
          await uploadWithAutoRefresh(accessToken, 'notes_to_iphone.json', { items: updated });
        } catch {
          // Drive 更新失敗 → IndexedDB 削除は続行
        }
      }

      await deleteDraft(note.id);

      if (note.status === 'sent') {
        setHistoryNotes((prev) => prev.filter((n) => n.id !== note.id));
      } else {
        const updatedDrafts = await loadAllDrafts();
        setHistoryNotes(
          updatedDrafts
            .map((d) => ({
              id: d.id, title: d.title, body: d.body,
              status: d.sent_at ? ('sent' as const) : d.received_pc ? ('received_pc' as const) : ('draft' as const),
              created_at: d.created_at, tags: d.tags,
            }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 20)
        );
      }
    } catch {
      // エラー無視（削除失敗）
    } finally {
      setIsLoading(false);
    }
  };

  // ローディング表示
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    );
  }

  // 非standalone → ホーム画面追加バナー
  if (!isStandalone) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 max-w-sm w-full">
          <h1 className="text-lg font-bold mb-3">ホーム画面に追加してください</h1>
          <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
            <li>
              Safari の共有アイコン（↑）をタップ
            </li>
            <li>
              「ホーム画面に追加」を選択
            </li>
          </ol>
          <p className="mt-3 text-sm text-gray-500">
            インストール後にセットアップを完了してください
          </p>
        </div>
      </div>
    );
  }

  // standalone → ステップUI
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-white text-gray-900">
      {/* バックグラウンド送信トースト */}
      {isSendingInBackground && (
        <div className="fixed top-4 right-4 bg-blue-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          {t('pwa.sending')}
        </div>
      )}
      {backgroundSendSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          送信しました ✓
        </div>
      )}
      {backgroundSendError && (
        <div className="fixed top-4 right-4 bg-red-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          {backgroundSendError}
        </div>
      )}
      <div className="max-w-prose mx-auto w-full">
        {step === 'login' && (
          <div className="flex flex-col items-center gap-4">
            <p className="text-gray-700">{t('pwa.loginTitle')}</p>
            <p className="text-gray-500 text-sm max-w-sm text-center mt-2">{t('pwa.loginDesc')}</p>
            {!swReady && (
              <p className="text-gray-500 text-sm">SW準備中...</p>
            )}
            <button
              className="bg-blue-600 text-white rounded-lg px-6 py-3 font-medium disabled:opacity-40"
              disabled={!swReady}
              onClick={async () => {
                const { verifier, challenge } = await generatePKCE();
                localStorage.setItem('pkce_verifier', verifier);
                startOAuth(challenge);
              }}
            >
              {t('pwa.loginButton')}
            </button>
            {errorMessage && (
              <p className="text-red-600 text-sm">{errorMessage}</p>
            )}
          </div>
        )}

        {step === 'push' && (
          <PushStep
            swReady={swReady}
            isLoading={isLoading}
            errorMessage={errorMessage}
            accessToken={accessToken}
            t={t}
            setIsLoading={setIsLoading}
            setErrorMessage={setErrorMessage}
            setStep={setStep}
          />
        )}

        {step === 'ready' && (
          <div className="text-center">
            <p className="text-gray-700">
              PCから付箋が送られたらここに表示されます
            </p>
            {errorMessage && (
              <p className="text-red-600 text-sm mt-2">{errorMessage}</p>
            )}
          </div>
        )}

        {step === 'write' && (
          <WriteStep
            editorRef={editorRef}
            fileInputRef={fileInputRef}
            showTagBar={showTagBar}
            tagInput={tagInput}
            writeTags={writeTags}
            knownTags={knownTags}
            imageBlobs={imageBlobs}
            showCropModal={showCropModal}
            cropFile={cropFile}
            showMermaidModal={showMermaidModal}
            backgroundSendSuccess={backgroundSendSuccess}
            errorMessage={errorMessage}
            isLoading={isLoading}
            isSendingInBackground={isSendingInBackground}
            currentDraftId={currentDraftId}
            accessToken={accessToken}
            t={t}
            setStep={setStep}
            setShowTagBar={setShowTagBar}
            setTagInput={setTagInput}
            setWriteTags={setWriteTags}
            setKnownTags={setKnownTags}
            setImageBlobs={setImageBlobs}
            setShowCropModal={setShowCropModal}
            setCropFile={setCropFile}
            setShowMermaidModal={setShowMermaidModal}
            setErrorMessage={setErrorMessage}
            setIsLoading={setIsLoading}
            setCurrentDraftId={setCurrentDraftId}
            setPendingHydrate={setPendingHydrate}
            handleEditorInput={handleEditorInput}
            sendToPC={sendToPC}
          />
        )}

        {step === 'list' && (
          <NoteListStep
            notes={historyNotes}
            isLoading={isHistoryLoading}
            thumbnailUrls={thumbnailUrls}
            lockedNoteIds={lockedNoteIds}
            isLockPermissionPending={isLockPermissionPending}
            t={t}
            onNew={() => {
              setPendingHydrate({ markdown: '', blobMap: new Map(), draftId: null, tags: [] });
              setStep('write');
            }}
            onOpen={async (note) => {
              const draft = await loadDraft(note.id).catch(() => null);
              const blobMap = new Map<string, Blob>();
              if (draft?.images && draft.images.length > 0) {
                for (const { fileName, blob } of draft.images) {
                  blobMap.set(fileName, blob);
                }
              }
              const fullText = note.title
                ? (note.body ? `${note.title}\n${note.body}` : note.title)
                : (note.body ?? '');
              setPendingHydrate({ markdown: fullText, blobMap, draftId: note.id, tags: note.tags ?? [] });
              setStep('write');

              // received_pc の既読を Drive にバックグラウンドで記録（遷移を待たない）
              if (note.status === 'received_pc' && accessToken) {
                const token = accessToken;
                downloadWithAutoRefresh(token, 'notes_to_iphone.json')
                  .then((raw) => {
                    const data = raw as { items?: unknown[] };
                    const items = (Array.isArray(data.items) ? data.items : []) as { id: string; received_at?: string | null }[];
                    const updated = items.map((n) =>
                      n.id === note.id ? { ...n, received_at: nowJST() } : n
                    );
                    return uploadWithAutoRefresh(token, 'notes_to_iphone.json', { items: updated });
                  })
                  .catch(() => {}); // 失敗しても次回同期で整合
              }
            }}
            onDelete={handleDeleteNote}
            onLockToggle={handleLockToggle}
          />
        )}

        {step === 'banner' && isStandalone && (
          <div className="text-center">
            <p className="text-gray-500">読み込み中...</p>
          </div>
        )}
      </div>
    </div>
  );
}
