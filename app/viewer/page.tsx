'use client';

import React, { useState, useEffect } from 'react';
import { formatRelativeTime, insertAtCursor, buildImageFileName, insertTextAtCursor, insertNodeAtCursor, nowJST } from './utils';
import { getTranslation, type Language } from '@/lib/i18n';
import type { IphoneNote, PendingHydrate, DraftRecord, PendingVideoMeta, VideoBlobMap } from './types';
import { NoteListStep } from './NoteListStep';
import { PushStep } from './PushStep';
import { WriteStep } from './WriteStep';
import { saveDraft, loadAllDrafts, loadDraft, deleteDraft, markDraftDeleted } from './lib/indexeddb';
import { useAutoSave } from './hooks/useAutoSave';
import { useVisibilitySave } from './hooks/useVisibilitySave';
import { useLockToggle } from './hooks/useLockToggle';
import { useBackgroundSend } from './hooks/useBackgroundSend';
import { useAppInit } from './hooks/useAppInit';
import { useNoteList } from './hooks/useNoteList';
import { usePcDevices } from './hooks/usePcDevices';
import {
  downloadFromDrive,
  downloadWithAutoRefresh,
  refreshAccessToken,
  uploadImageWithAutoRefresh,
  removeNotesFromIphoneQueue,
} from './lib/drive';
import { generatePKCE, startOAuth, urlBase64ToUint8Array } from './lib/auth';
import { silentReRegisterIfNeeded } from './lib/push';
import { serializeEditor, hydrateEditor, loadKnownTags, mergeKnownTags, extractTitleBody } from './editor-helpers';
import { renderSecureMermaid } from '../utils/mermaid';
import { loadPwaLanguage, savePwaLanguage } from './language';
import {
  consumePendingNotification,
  loadNotificationDraft,
  registerPendingNotificationResume,
} from './lib/notification-navigation';
import {
  appendDiagnosticLog,
  buildNotificationDiagnosticReport,
  formatNavigationLog,
  type DiagnosticLogRecord,
} from './lib/diagnostic-log';

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
    setLang(loadPwaLanguage(localStorage));
  }, []);
  const t = getTranslation(lang);
  const handleLanguageChange = React.useCallback((language: Language) => {
    savePwaLanguage(localStorage, language);
    setLang(language);
  }, []);

  const [isStandalone, setIsStandalone] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [showDebugLog, setShowDebugLog] = useState(false);
  const [step, setStep] = useState<
    'banner' | 'login' | 'push' | 'ready' | 'write' | 'list'
  >('banner');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [swReady, setSwReady] = useState(false);
  const [swVersion, setSwVersion] = useState<string | null>(null);
  const [runtimeOrigin, setRuntimeOrigin] = useState('');
  const editorRef = React.useRef<HTMLDivElement>(null);
  const [imageBlobs, setImageBlobs] = useState<Map<string, Blob>>(new Map());
  const [writeTags, setWriteTags] = useState<string[]>([]);
  const [showTagBar, setShowTagBar] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [, setCropQueue] = useState<File[]>([]);
  const [showCropModal, setShowCropModal] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [historyNotes, setHistoryNotes] = useState<IphoneNote[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const [showMermaidModal, setShowMermaidModal] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const videoInputRef = React.useRef<HTMLInputElement>(null);
  const [videoBlobs, setVideoBlobs] = useState<VideoBlobMap>(new Map());
  const [videoMetas, setVideoMetas] = useState<PendingVideoMeta[]>([]);
  const [pendingHydrate, setPendingHydrate] = useState<PendingHydrate | null>(null);
  const currentDraftIdRef = React.useRef<string | null>(null);
  const imageBlobsRef = React.useRef<Map<string, Blob>>(new Map());
  const videoBlobsRef = React.useRef<VideoBlobMap>(new Map());
  const writeTagsRef = React.useRef<string[]>([]);
  const hasStartedWriting = React.useCallback(
    () => Boolean(editorRef.current?.textContent),
    []
  );

  useEffect(() => {
    setIsMounted(true);
    setShowDebugLog(new URLSearchParams(window.location.search).get('debug') === '1');
    setRuntimeOrigin(window.location.origin);
  }, []);

  const runtimeKind = React.useMemo(() => {
    if (!runtimeOrigin) return t('pwa.runtime.checking');
    if (runtimeOrigin.includes('localhost') || runtimeOrigin.includes('127.0.0.1') || /^http:\/\/192\.168\./.test(runtimeOrigin)) {
      return t('pwa.runtime.pcDevelopment');
    }
    if (runtimeOrigin.includes('vercel.app')) return 'Vercel';
    return t('pwa.runtime.unknown');
  }, [runtimeOrigin, t]);

  // SWバージョン取得
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      setSwVersion('not-available');
      return;
    }
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SW_VERSION') setSwVersion(e.data.version);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // アプリ初期化（SW登録・OAuth・ステップ遷移）
  useAppInit({
    setIsStandalone,
    setSwReady,
    setStep,
    setAccessToken,
    setIsLoading,
    setErrorMessage,
    setPendingHydrate,
    hasStartedWriting,
  });

  // ログイン後: Drive から自分のデバイスが消えていたら静かに再登録
  useEffect(() => {
    if (!accessToken) return;
    silentReRegisterIfNeeded(accessToken).catch(() => {});
  }, [accessToken]);

  // refs を state と同期（visibilitychange ハンドラで最新値を参照するため）
  useEffect(() => { currentDraftIdRef.current = currentDraftId; }, [currentDraftId]);
  useEffect(() => { imageBlobsRef.current = imageBlobs; }, [imageBlobs]);
  useEffect(() => { videoBlobsRef.current = videoBlobs; }, [videoBlobs]);
  useEffect(() => { writeTagsRef.current = writeTags; }, [writeTags]);

  const videoMetasFromRecord = React.useCallback((record: {
    type?: string;
    videoFileName?: string;
    originalFileName?: string;
    videos?: Array<{ fileName?: string; videoFileName?: string; originalName?: string; originalFileName?: string; blob?: Blob }>;
  }): PendingVideoMeta[] => {
    if (Array.isArray(record.videos) && record.videos.length > 0) {
      return record.videos.map((video, index) => {
        const fileName = video.fileName || video.videoFileName || `video-${index}`;
        return {
          fileName,
          name: video.originalName || video.originalFileName || fileName,
          size: video.blob?.size ?? 0,
          type: video.blob?.type || 'video/mp4',
        };
      });
    }
    if (record.type !== 'video' && !record.videoFileName && !record.originalFileName) return [];
    const fileName = record.videoFileName || record.originalFileName || 'video';
    return [{
      fileName,
      name: record.originalFileName || record.videoFileName || 'video',
      size: 0,
      type: 'video/mp4',
    }];
  }, []);

  const videoBlobMapFromDraft = React.useCallback((draft: DraftRecord | null): VideoBlobMap => {
    if (!draft?.videos || draft.videos.length === 0) return new Map();
    return new Map(draft.videos.flatMap((video) => (
      video.blob
        ? [[video.fileName, { blob: video.blob, originalName: video.originalName }]]
        : []
    )));
  }, []);

  // visibilitychange: バックグラウンドになった瞬間に保存
  useVisibilitySave({ editorRef, currentDraftIdRef, imageBlobsRef, videoBlobsRef, writeTagsRef });

  // onInput 自動保存
  const handleEditorInput = useAutoSave(
    { editorRef, currentDraftIdRef, imageBlobsRef, videoBlobsRef, writeTagsRef },
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
          for (let idx = 0; idx < mermaidDivs.length; idx++) {
            const div = mermaidDivs[idx];
            const code = div.getAttribute('data-mermaid-code') ?? '';
            try {
              const svg = await renderSecureMermaid(`mermaid-h-${idx}-${Date.now()}`, code);
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
      const nextVideoBlobMap = pendingHydrate.videoBlobMap ?? new Map();
      videoBlobsRef.current = nextVideoBlobMap;
      setVideoBlobs(nextVideoBlobMap);
      setVideoMetas(pendingHydrate.videoMetas ?? (pendingHydrate.videoMeta ? [pendingHydrate.videoMeta] : []));
      if (pendingHydrate.notificationSource) {
        appendDiagnosticLog(formatNavigationLog('detail_displayed', {
          source: pendingHydrate.notificationSource,
          id: pendingHydrate.draftId ?? 'unknown',
        }));
      }
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
      appendDiagnosticLog(formatNavigationLog('page_visible'));
      const { loadPendingOpen, clearPendingOpen, loadDraft } = await import('./lib/indexeddb');
      const pending = await loadPendingOpen().catch(() => null);
      appendDiagnosticLog(formatNavigationLog('pending_checked', {
        source: 'visibility',
        found: Boolean(pending),
        id: pending?.id,
        age_seconds: pending ? Math.round((Date.now() - pending.t) / 1000) : undefined,
      }));
      if (!pending || Date.now() - pending.t >= 30 * 60 * 1000) return;
      const draft = await consumePendingNotification(
        pending.id,
        loadDraft,
        () => clearPendingOpen().catch(() => {}),
        undefined,
        (attempt) => appendDiagnosticLog(formatNavigationLog('draft_load', {
          source: 'visibility',
          id: pending.id,
          attempt: attempt.attempt,
          result: attempt.result,
          elapsed_ms: attempt.elapsedMs,
          error: attempt.errorName,
        })),
      );
      // iOS では notificationclick が発火しないため、locked: true のノートは page 側で再通知する
      if (draft?.locked) {
        try {
          const reg = await navigator.serviceWorker.ready;
          const rawTitle = draft.title || '';
          const rawBody = (draft.body || '').replace(/!\[.*?\]\(.*?\)/g, '').trim();
          const notifTitle = rawTitle ? rawTitle.replace(/^#\s*/, '') : rawBody.slice(0, 20) || '（無題）';
          const notifBody = rawTitle ? rawBody.slice(0, 40) : rawBody.slice(20, 60);
          await reg.showNotification(notifTitle, {
            body: notifBody,
            tag: `fusen-${draft.id}`,
            data: { id: draft.id, title: notifTitle, body: notifBody },
            icon: '/icon-192.png',
            badge: '/icon-192.png',
          });
        } catch { /* 無視 */ }
      }
      if (draft) {
        const titleLine = draft.title ? `${draft.title}\n` : '';
        const images = draft.images ?? [];
        const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }: { fileName: string; blob: Blob }) => [fileName, blob]));
        setPendingHydrate({
          markdown: titleLine + draft.body,
          blobMap,
          draftId: draft.id,
          tags: draft.tags ?? [],
          videoMetas: videoMetasFromRecord(draft),
          videoBlobMap: videoBlobMapFromDraft(draft),
          notificationSource: 'visibility',
        });
        appendDiagnosticLog(formatNavigationLog('detail_requested', {
          source: 'visibility',
          id: pending.id,
        }));
        setStep('write');
      } else {
        appendDiagnosticLog(formatNavigationLog('detail_not_opened', {
          source: 'visibility',
          id: pending.id,
          reason: 'draft_unavailable',
        }));
      }
    };
    const unregisterResume = registerPendingNotificationResume(handleVisible);
    // 起動直後も確認（clients.openWindow で新規タブが開かれた場合、visibilitychange は発火しない）
    handleVisible();
    return unregisterResume;
  }, [videoBlobMapFromDraft, videoMetasFromRecord]);


  // ページ起動ログ（バージョン確認用）
  useEffect(() => {
    try {
      const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const t = jst.toISOString().replace('Z', '+09:00');
      const req = indexedDB.open('fusen-logs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
      req.onsuccess = () => {
        const tx = req.result.transaction('logs', 'readwrite');
        tx.objectStore('logs').add({ t, msg: `[page] 起動` });
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
      pageLog(formatNavigationLog('route_received', {
        source: 'open_note',
        id: noteId,
      }));
      const draft = await loadNotificationDraft(
        noteId,
        loadDraft,
        undefined,
        (attempt) => pageLog(formatNavigationLog('draft_load', {
          source: 'open_note',
          id: noteId,
          attempt: attempt.attempt,
          result: attempt.result,
          elapsed_ms: attempt.elapsedMs,
          error: attempt.errorName,
        })),
      );
      if (draft) {
        const images = draft.images ?? [];
        const titleLine = draft.title ? `${draft.title}\n` : '';
        const blobMap = new Map<string, Blob>(images.map(({ fileName, blob }: { fileName: string; blob: Blob }) => [fileName, blob]));
        setPendingHydrate({
          markdown: titleLine + draft.body,
          blobMap,
          draftId: draft.id,
          tags: draft.tags ?? [],
          videoMetas: videoMetasFromRecord(draft),
          videoBlobMap: videoBlobMapFromDraft(draft),
          notificationSource: 'open_note',
        });
        pageLog(formatNavigationLog('detail_requested', {
          source: 'open_note',
          id: noteId,
        }));
        setStep('write');
      } else {
        pageLog(formatNavigationLog('detail_not_opened', {
          source: 'open_note',
          id: noteId,
          reason: 'draft_unavailable',
        }));
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [videoBlobMapFromDraft, videoMetasFromRecord]);

  // step === 'list' になったとき一覧ロード（Drive → IndexedDB → UI）
  useNoteList({
    step,
    accessToken,
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
  const { pcDevices, selectedPcId, setSelectedPcId, refreshPcDevices } = usePcDevices(accessToken);

  // メモ削除ハンドラ
  const handleDeleteNote = async (note: IphoneNote) => {
    new Audio('/sounds/delete.wav').play().catch(() => {});
    setIsLoading(true);
    try {
      await markDraftDeleted(note.id);
      await deleteDraft(note.id);
      setLockedNoteIds((prev) => prev.filter((id) => id !== note.id));

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
              type: d.type,
              videoFileName: d.videoFileName,
              originalFileName: d.originalFileName,
              videos: (d.videos ?? []).map((video) => ({
                videoFileName: video.fileName,
                originalFileName: video.originalName,
              })),
            }))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 20)
        );
      }
      if (note.status === 'received_pc' && accessToken) {
        removeNotesFromIphoneQueue(accessToken, [note.id]).catch(() => {});
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
        <p className="text-gray-500">{t('pwa.loading')}</p>
      </div>
    );
  }

  // 非standalone → ホーム画面追加バナー
  if (isMounted && !isStandalone) {
    return (
      <div className="min-h-screen bg-[#F2F2F7] px-4 py-8 overflow-y-auto max-w-sm mx-auto relative">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t('pwa.install.title')}</h1>
        <p className="text-gray-500 text-sm mb-6">{t('pwa.install.description')}</p>

        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-semibold text-gray-800 mb-3">{t('pwa.install.step1')}</p>
            <img src="/banner-step1.png" alt={t('pwa.install.step1Alt')} className="w-full rounded-xl" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-semibold text-gray-800 mb-3">{t('pwa.install.step2')}</p>
            <img src="/banner-step2.png" alt={t('pwa.install.step2Alt')} className="w-full rounded-xl" />
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="font-semibold text-gray-800 mb-3">{t('pwa.install.step3')}</p>
            <img src="/banner-step3.png" alt={t('pwa.install.step3Alt')} className="w-full rounded-xl" />
          </div>
        </div>
        <div className="text-center text-gray-300 text-[10px] mt-4">
          v{swVersion ?? '---'}
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
          {t('pwa.sent')}
        </div>
      )}
      {backgroundSendError && (
        <div className="fixed top-4 right-4 bg-red-500 text-white text-sm px-3 py-2 rounded shadow z-50">
          {backgroundSendError}
        </div>
      )}
      <div className="max-w-prose mx-auto w-full">
        {step === 'login' && (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            <p className="text-gray-700">{t('pwa.loginTitle')}</p>
            <p className="text-gray-500 text-sm text-center">{t('pwa.loginDesc')}</p>
            <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500 leading-relaxed">
              <div>{t('pwa.runtime.destination')}: <span className="font-mono break-all">{runtimeOrigin || t('pwa.runtime.checking')}</span></div>
              <div>{t('pwa.runtime.environment')}: <span className="font-semibold">{runtimeKind}</span> / SW: <span className="font-mono">{swVersion ?? '---'}</span></div>
            </div>
            {!swReady && (
              <p className="text-gray-500 text-sm">{t('pwa.setup.swPreparing')}</p>
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
            <div className="w-full mt-2 bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">{t('pwa.login.continueHint')}</p>
              <div className="flex flex-col gap-3">
                <img src="/login-step1.png" alt={t('pwa.login.continueHintAlt')} className="w-full rounded-xl" />
                <img src="/login-step2.png" alt={t('pwa.login.continueHint2Alt')} className="w-full rounded-xl" />
              </div>
            </div>
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


        {step === 'write' && (
          <WriteStep
            editorRef={editorRef}
            fileInputRef={fileInputRef}
            videoInputRef={videoInputRef}
            imageBlobsRef={imageBlobsRef}
            videoBlobsRef={videoBlobsRef}
            showTagBar={showTagBar}
            tagInput={tagInput}
            writeTags={writeTags}
            knownTags={knownTags}
            showCropModal={showCropModal}
            cropFile={cropFile}
            showMermaidModal={showMermaidModal}
            videoMetas={videoMetas}
            backgroundSendSuccess={backgroundSendSuccess}
            errorMessage={errorMessage}
            isLoading={isLoading}
            isSendingInBackground={isSendingInBackground}
            currentDraftId={currentDraftId}
            accessToken={accessToken}
            pcDevices={pcDevices}
            selectedPcId={selectedPcId}
            t={t}
            setStep={setStep}
            setShowTagBar={setShowTagBar}
            setTagInput={setTagInput}
            setWriteTags={setWriteTags}
            setKnownTags={setKnownTags}
            setImageBlobs={setImageBlobs}
            setShowCropModal={setShowCropModal}
            setCropFile={setCropFile}
            setCropQueue={setCropQueue}
            setShowMermaidModal={setShowMermaidModal}
            setVideoBlobs={setVideoBlobs}
            setVideoMetas={setVideoMetas}
            setErrorMessage={setErrorMessage}
            setIsLoading={setIsLoading}
            setCurrentDraftId={setCurrentDraftId}
            setPendingHydrate={setPendingHydrate}
            setSelectedPcId={setSelectedPcId}
            refreshPcDevices={refreshPcDevices}
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
            language={lang}
            onNew={() => {
              videoBlobsRef.current = new Map();
              setVideoBlobs(new Map());
              setVideoMetas([]);
              setPendingHydrate({ markdown: '', blobMap: new Map(), draftId: null, tags: [], videoMetas: [], videoBlobMap: new Map() });
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
              setPendingHydrate({
                markdown: fullText,
                blobMap,
                draftId: note.id,
                tags: note.tags ?? [],
                videoMetas: videoMetasFromRecord(draft ?? note),
                videoBlobMap: videoBlobMapFromDraft(draft),
              });
              setStep('write');

            }}
            swVersion={swVersion}
            runtimeOrigin={runtimeOrigin}
            runtimeKind={runtimeKind}
            onDelete={handleDeleteNote}
            onLockToggle={handleLockToggle}
            onReRegisterPush={() => {
              localStorage.removeItem('viewer_push_done');
              setStep('push');
            }}
            onLanguageChange={handleLanguageChange}
          />
        )}

        {step === 'banner' && isStandalone && (
          <div className="text-center">
            <p className="text-gray-500">{t('pwa.loading')}</p>
          </div>
        )}

        {/* デバッグログ表示（?debug=1 のときのみ） */}
        {showDebugLog && (
          <DebugLogView />
        )}
      </div>
    </div>
  );
}

function DebugLogView() {
  const language: Language = typeof navigator !== 'undefined' && !navigator.language.startsWith('ja') ? 'en' : 'ja';
  const t = getTranslation(language);
  const [logs, setLogs] = React.useState<DiagnosticLogRecord[]>([]);
  const [swVersion, setSwVersion] = React.useState<string | null>(null);
  const [siriTokenStatus, setSiriTokenStatus] = React.useState<string | null>(null);
  const [diagnosticCopyStatus, setDiagnosticCopyStatus] = React.useState<string | null>(null);
  const loadLogs = React.useCallback(() => {
    const req = indexedDB.open('fusen-logs', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('logs', { autoIncrement: true });
    req.onsuccess = () => {
      const tx = req.result.transaction('logs', 'readonly');
      const all = tx.objectStore('logs').getAll();
      all.onsuccess = () => setLogs((all.result as DiagnosticLogRecord[]).reverse());
    };
    req.onerror = () => setLogs([]);
  }, []);

  // 裏機能: Siri 用 refresh_token をクリップボードにコピーする
  // 一般ユーザー向けではない。?debug=1 で開いた開発者のみ使用する想定
  const copySiriToken = React.useCallback(async () => {
    const token = localStorage.getItem('viewer_refresh_token');
    if (!token) {
      setSiriTokenStatus(t('pwa.debug.tokenNotFound'));
      setTimeout(() => setSiriTokenStatus(null), 3000);
      return;
    }
    try {
      await navigator.clipboard.writeText(token);
      setSiriTokenStatus(t('pwa.debug.tokenCopied'));
      setTimeout(() => setSiriTokenStatus(null), 3000);
    } catch {
      setSiriTokenStatus(t('pwa.debug.tokenCopyFailed'));
      setTimeout(() => setSiriTokenStatus(null), 3000);
    }
  }, [t]);

  const copyNotificationDiagnostics = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildNotificationDiagnosticReport(logs, swVersion));
      setDiagnosticCopyStatus(t('pwa.debug.diagnosticsCopied'));
    } catch {
      setDiagnosticCopyStatus(t('pwa.debug.diagnosticsCopyFailed'));
    }
    setTimeout(() => setDiagnosticCopyStatus(null), 3000);
  }, [logs, swVersion, t]);

  useEffect(() => {
    loadLogs();
    const timer = window.setInterval(loadLogs, 1000);
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) {
      setSwVersion('not-available');
      return () => window.clearInterval(timer);
    }
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'SW_VERSION') setSwVersion(e.data.version);
    };
    navigator.serviceWorker.addEventListener('message', handler);
    navigator.serviceWorker.controller?.postMessage({ type: 'GET_VERSION' });
    return () => {
      window.clearInterval(timer);
      navigator.serviceWorker.removeEventListener('message', handler);
    };
  }, [loadLogs]);
  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 text-green-400 text-xs font-mono p-4 overflow-y-auto z-50">
      <div className="flex justify-between mb-2">
        <div className="flex items-center gap-3">
          <button className="text-blue-400" onClick={() => window.history.back()}>← {t('pwa.debug.back')}</button>
          <span className="text-white font-bold">SW Debug Log</span>
          <span className="text-yellow-400">SW: {swVersion ?? '---'}</span>
        </div>
        <div className="flex items-center gap-3">
          <button className="text-blue-400" onClick={loadLogs}>{t('pwa.debug.refresh')}</button>
          <button className="text-yellow-300" onClick={copyNotificationDiagnostics}>
            {t('pwa.debug.copyNotificationDiagnostics')}
          </button>
          <button className="text-red-400" onClick={() => {
            indexedDB.deleteDatabase('fusen-logs');
            setLogs([]);
          }}>{t('pwa.debug.clear')}</button>
        </div>
      </div>
      <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-700">
        <button className="text-purple-400" onClick={copySiriToken}>{t('pwa.debug.copySiriToken')}</button>
        {siriTokenStatus && <span className="text-yellow-300">{siriTokenStatus}</span>}
        {diagnosticCopyStatus && <span className="text-yellow-300">{diagnosticCopyStatus}</span>}
      </div>
      {logs.length === 0 && <p className="text-gray-500">{t('pwa.debug.empty')}</p>}
      {logs.map((l, i) => (
        <div key={i}><span className="text-gray-500">{l.t.slice(11, 19)}</span> {l.msg}</div>
      ))}
    </div>
  );
}
