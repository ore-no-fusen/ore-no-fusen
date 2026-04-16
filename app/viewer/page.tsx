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
// PWAバージョン（SW_VERSION と必ず同じ番号にする）
// ---------------------------------------------------------------------------
const PAGE_VERSION = '2.9.10';

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

  // フォアグラウンド復帰時に pending_open を確認してノートを開く（通知タップ対応）
  useEffect(() => {
    const handleVisible = async () => {
      if (document.visibilityState !== 'visible') return;
      const { loadPendingOpen, clearPendingOpen, loadDraft } = await import('./lib/indexeddb');
      const pending = await loadPendingOpen().catch(() => null);
      console.log(`[page] visibilitychange: pending=${pending ? `id=${pending.id} 経過${Math.round((Date.now() - pending.t) / 1000)}秒` : 'なし'}`);
      if (!pending || Date.now() - pending.t >= 30 * 60 * 1000) return;
      await clearPendingOpen().catch(() => {});
      const draft = await loadDraft(pending.id).catch(() => null);
      console.log(`[page] visibilitychange draft: ${draft ? `images=${draft.images?.length ?? 0}件 blobs=${draft.images?.filter((i: { fileName: string; blob: Blob }) => i.blob != null).length ?? 0}件` : 'なし'}`);
      if (draft) {
        const titleLine = draft.title ? `${draft.title}\n` : '';
        const images = draft.images ?? [];
        const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }: { fileName: string; blob: Blob }) => [fileName, blob]));
        setPendingHydrate({ markdown: titleLine + draft.body, blobMap, draftId: draft.id, tags: draft.tags ?? [] });
      }
      setStep('write');
    };
    document.addEventListener('visibilitychange', handleVisible);
    return () => document.removeEventListener('visibilitychange', handleVisible);
  }, []);

  // バックグラウンド移行時に locked ノートの通知を再表示（iOS はフォアグラウンド中に showNotification が効かないため）
  useEffect(() => {
    const handleHide = async () => {
      if (document.visibilityState !== 'hidden') return;
      if (Notification.permission !== 'granted') return;
      const { loadAllDrafts } = await import('./lib/indexeddb');
      const drafts = await loadAllDrafts().catch(() => []);
      const locked = drafts.filter((d) => d.locked);
      if (locked.length === 0) return;
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (!reg) return;
      // すでに通知センターにある通知は再表示しない（重複防止）
      const existingIds = await new Promise<string[]>((resolve) => {
        if (!reg.active) { resolve([]); return; }
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => resolve(e.data.ids ?? []);
        reg.active.postMessage({ type: 'GET_NOTIFICATIONS' }, [channel.port2]);
        setTimeout(() => resolve([]), 1000);
      });
      for (const d of locked) {
        if (existingIds.includes(d.id)) continue;
        const rawTitle = d.title || '';
        const rawBody = d.body || '';
        const notifTitle = rawTitle ? rawTitle.replace(/^#\s*/, '') : rawBody.slice(0, 20) || '（無題）';
        const notifBody = rawTitle ? rawBody.slice(0, 40) : rawBody.slice(20, 60);
        await reg.showNotification(notifTitle, {
          body: notifBody,
          tag: `fusen-${d.id}`,
          data: { id: d.id, title: notifTitle, body: notifBody },
          icon: '/icon-192.png',
          badge: '/icon-192.png',
        });
      }
    };
    document.addEventListener('visibilitychange', handleHide);
    return () => document.removeEventListener('visibilitychange', handleHide);
  }, []);

  // ページ起動ログ（バージョン確認用）
  useEffect(() => {
    try {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const t = jst.toISOString().replace('Z', '+09:00');
      const req = indexedDB.open('fusen-logs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
      req.onsuccess = () => {
        const tx = req.result.transaction('logs', 'readwrite');
        tx.objectStore('logs').add({ t, msg: `[page] 起動 v${PAGE_VERSION}` });
      };
    } catch { /* 無視 */ }
  }, []);

  // SW から OPEN_NOTE メッセージを受信したときにノートを開く（iOS で client.navigate() が効かない場合の代替）
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
    const pageLog = (msg: string) => {
      try {
        const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
        const t = jst.toISOString().replace('Z', '+09:00');
        const req = indexedDB.open('fusen-logs', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
        req.onsuccess = () => {
          const tx = req.result.transaction('logs', 'readwrite');
          tx.objectStore('logs').add({ t, msg });
        };
      } catch { /* ログ失敗は無視 */ }
    };
    const handler = async (event: MessageEvent) => {
      if (event.data?.type !== 'OPEN_NOTE' || !event.data.id) return;
      const noteId = event.data.id as string;
      pageLog(`[page] OPEN_NOTE受信 id=${noteId}`);
      const draft = await loadDraft(noteId).catch(() => null);
      if (draft) {
        const images = draft.images ?? [];
        pageLog(`[page] draft取得成功 images=${images.length}件`);
        const titleLine = draft.title ? `${draft.title}\n` : '';
        const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }: { fileName: string; blob: Blob }) => [fileName, blob]));
        setPendingHydrate({ markdown: titleLine + draft.body, blobMap, draftId: draft.id, tags: draft.tags ?? [] });
      } else {
        pageLog(`[page] draft取得失敗 id=${noteId}`);
      }
      setStep('write');
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

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

        {/* デバッグログ表示（?debug=1 のときのみ） */}
        {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1' && (
          <DebugLogView />
        )}
      </div>
    </div>
  );
}

function DebugLogView() {
  const [logs, setLogs] = React.useState<{ t: string; msg: string }[]>([]);
  useEffect(() => {
    const req = indexedDB.open('fusen-logs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
    req.onsuccess = () => {
      const tx = req.result.transaction('logs', 'readonly');
      const all = tx.objectStore('logs').getAll();
      all.onsuccess = () => setLogs((all.result as { t: string; msg: string }[]).reverse());
    };
  }, []);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 text-green-400 text-xs font-mono p-4 overflow-y-auto z-50">
      <div className="flex justify-between mb-2">
        <div className="flex items-center gap-3">
          <button className="text-blue-400" onClick={() => window.history.back()}>← 戻る</button>
          <span className="text-white font-bold">SW Debug Log</span>
        </div>
        <button className="text-red-400" onClick={() => {
          indexedDB.deleteDatabase('fusen-logs');
          setLogs([]);
        }}>クリア</button>
      </div>
      {logs.length === 0 && <p className="text-gray-500">ログなし</p>}
      {logs.map((l, i) => (
        <div key={i}><span className="text-gray-500">{l.t.slice(11, 19)}</span> {l.msg}</div>
      ))}
    </div>
  );
}
