/**
 * メインオーケストレーター (Page Component)
 *
 * 責務:
 * - アプリケーション全体の初期化と状態管理 (AppState)
 * - ウィンドウ管理（新規作成、復元、リサイズ、整列）
 * - グローバルイベントのリスニング (Tauriイベント, ショートカット)
 * - バックエンド (Rust) との通信ブリッジ
 */

'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emitTo, listen } from '@tauri-apps/api/event';
import { pathsEqual, normalizePath, getFileName, encodeNotePathForUrl } from './utils/pathUtils';
import { playLocalSound, playCreateSound, SoundType } from './utils/soundManager';
import { type NoteMeta } from './api/notes';
import StickyNote from './components/StickyNote';
import LoadingScreen from './components/LoadingScreen';
import SettingsPage from '@/components/ui/settings-page';
import SearchOverlay from './components/SearchOverlay'; // [NEW] 全文検索
import ConfirmDialog from './components/ConfirmDialog'; // [NEW] アプリ内確認ダイアログ
import AnalyticsConsentDialog from './components/AnalyticsConsentDialog';
import BackupResultDialog from './components/BackupResultDialog';
import PoolWaitToast from './components/PoolWaitToast'; // [NEW] Pool 枯渇時トースト
import { getTranslation, type Language } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-store';
import ErrorBoundary from './components/ErrorBoundary'; // [NEW] エラー境界
import { useUpdateCheck } from './hooks/useUpdateCheck';
import { isStoreMigrationBridgeVersion } from './utils/storeMigration';
import { trackEvent } from './utils/analytics';
import { useMainWindowResizePolicy, calcSettingsWindowSize } from './hooks/useMainWindowResizePolicy';
import { useFeedbackConversationUnreadCheck } from './hooks/useFeedbackConversationUnreadCheck';
import { safeUnlisten, safeUnlistenWhenResolved } from './utils/safeUnlisten';
import { isDuplicateWindowCreationRequest } from './utils/windowCreation';
import { selectReadyInvisibleNote } from './utils/invisibleNotePool';
import { physicalCrystalWindowPosition, physicalCrystalWindowSize } from './utils/crystalWindowSize';
import {
  partitionStartupLabels,
  runWithConcurrency,
  STARTUP_INITIAL_READY_TIMEOUT_MS,
  STARTUP_RETRY_READY_TIMEOUT_MS,
  waitForStartupReady,
} from './utils/startupRestore';
import { FreshRequestQueue } from './utils/freshRequestQueue';
import { NOTE_COLORS } from './utils/noteAppearance';
import { receiveIphoneNote } from './utils/receiveIphoneNote';

// Global AppState type definition
type AppState = {
  base_path?: string | null;
  folder_path: string | null;
  notes: NoteMeta[];
  selected_path: string | null;
};

type HotkeyRegisterFailure = {
  action: string;
  shortcut: string;
};

type CreateNoteRequest = {
  overrideFolder?: string;
  overrideContext?: string;
  sourceMeta?: { physX: number; physY: number; scale: number; physWidth?: number; physHeight?: number };
  duplicatePath?: string;
  perfT0?: number;
};

type HotkeyRegisterFailuresResponse = {
  failures: HotkeyRegisterFailure[];
};

type BackupRecord = { path: string; created_at: string; file_count: number };
type MonthlyBackupResult =
  | { status: 'success'; record: BackupRecord; nextPromptAt?: string }
  | { status: 'error'; message: string };

// [NEW] 最初からウィンドウを表示するためのフック


// Global throttle for creation
let globalLastCreateTime = 0;



function TagSelector({ language = 'ja' }: { language?: Language }) {
  const isEnglish = language === 'en';
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadTags = async () => {
      try {
        const tags = await invoke<string[]>('fusen_get_all_tags');
        const activeTags = await invoke<string[]>('fusen_get_active_tags');
        setAllTags(tags);
        setSelectedTags(activeTags);
      } catch (e) {
        console.error('Failed to load tags:', e);
      } finally {
        setIsLoading(false);
      }
    };
    loadTags();
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleApply = async () => {
    try {
      console.log('[TagSelector] Applying tags:', selectedTags);
      await invoke('fusen_set_active_tags', { tags: selectedTags });
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.destroy();
    } catch (e) {
      console.error('Failed to apply tag filter:', e);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.destroy();
    } catch (e) {
      console.error("Window close failed", e);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 overflow-hidden select-none p-6">
      <div className="w-full h-full bg-white rounded-[2rem] shadow-2xl flex flex-col border border-gray-100" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex-1 p-8 flex flex-col">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-600 rounded-3xl flex items-center justify-center shadow-xl shadow-purple-500/30 mx-auto mb-4">
              <span className="text-3xl">🌍</span>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">{isEnglish ? 'Select Tags' : 'タグを選択'}</h3>
            <p className="text-sm text-gray-500 mt-2">{isEnglish ? 'Show only notes with the selected tags.' : '選択したタグを持つ付箋のみを表示'}</p>
          </div>
          <div className="flex-1 overflow-y-auto mb-6" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {isLoading ? (
              <div className="text-center text-gray-400">{isEnglish ? 'Loading...' : '読み込み中...'}</div>
            ) : allTags.length === 0 ? (
              <div className="text-center text-gray-400">{isEnglish ? 'No tags found.' : 'タグがありません'}</div>
            ) : (
              <div className="space-y-2">
                {allTags.map(tag => (
                  <button key={tag} onClick={() => toggleTag(tag)} className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-left flex items-center gap-4">
                    <div className="text-2xl">{selectedTags.includes(tag) ? '☑' : '☐'}</div>
                    <span className="text-lg font-bold text-gray-800">{tag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button onClick={handleClose} className="flex-1 py-5 text-sm font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest">{isEnglish ? 'Cancel' : 'キャンセル'}</button>
            <button onClick={handleApply} className="flex-[2] py-5 text-sm font-black text-white bg-purple-600 hover:bg-purple-700 rounded-2xl shadow-xl shadow-purple-500/40 transition-all active:scale-95">{isEnglish ? `Apply (${selectedTags.length} selected)` : `適用（${selectedTags.length}件選択）`}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrchestratorContent() {
  const { settings, saveSettings, loading: settingsLoading } = useSettings();
  // [DEBUG] Lifecycle
  useEffect(() => {
    return () => console.log('[Orchestrator] Unmounted');
  }, []);

  const searchParams = useSearchParams();
  const path = searchParams.get('path');
  const tagSelector = searchParams.get('tagSelector');
  const isPool = searchParams.get('isPool') === 'true'; // [NEW] プール判定
  const isMainWindow = !path && !tagSelector && !isPool; // [FIX] プールウィンドウをメインウィンドウ扱いしない
  const [language, setLanguage] = useState<Language>('ja');

  useEffect(() => {
    const logWindowIdentity = async () => {
      const search = typeof window !== 'undefined' ? window.location.search : '(server)';
      let label = '(unknown)';
      try {
        label = getCurrentWindow().label;
      } catch (e) {
        label = `(getCurrentWindow failed: ${String(e)})`;
      }
      if (label === 'main' && isMainWindow) {
        const msg = `[起動診断] main OK search=${search || '(empty)'}`;
        console.log(msg);
        invoke('fusen_debug_log', { message: msg }).catch(() => { });
        const startupMsg = '[起動 1/6] メインウィンドウの画面を読み込みました。ここから付箋復元を開始します';
        console.log(startupMsg);
        invoke('fusen_debug_log', { message: startupMsg }).catch(() => { });
      } else if (isPool) {
        const msg = '[起動後準備] Pool付箋 ready';
        console.log(msg);
        invoke('fusen_debug_log', { message: msg }).catch(() => { });
      }
    };
    logWindowIdentity();
  }, [path, tagSelector, isPool, isMainWindow]);

  const [folderPath, setFolderPath] = useState<string>('');
  const folderPathRef = useRef<string>(''); // [FIX] スロットル用にRefでも保持
  const [iphoneDriveDisconnected, setIphoneDriveDisconnected] = useState(false);
  // 保存先フォルダが消えていて再セットアップ中かどうか
  const [recoveredMissingFolder, setRecoveredMissingFolder] = useState<string | null>(null);
  const usedPoolWindowsRef = useRef<Set<string>>(new Set()); // [NEW] 昇格済みのプールウィンドウのラベルを記録し、再利用を防ぐ
  const readyPoolWindowsRef = useRef<Set<string>>(new Set()); // リスナー登録完了済みのプールウィンドウ
  const crystalPoolWindowsRef = useRef<Map<string, string>>(new Map()); // 結晶パス → 昇格済みPool窓
  useEffect(() => {
    if (!isMainWindow) return;
    const prepare = async () => {
      const title = language === 'en' ? 'Create Recipe' : 'レシピにする';
      const existing = await WebviewWindow.getByLabel('recipe-create');
      if (existing) {
        await existing.setTitle(title);
        return;
      }
      new WebviewWindow('recipe-create', {
        url: '/recipe-create',
        title,
        width: 760,
        height: 860,
        minWidth: 640,
        minHeight: 620,
        center: true,
        resizable: true,
        visible: false,
        focus: false,
        skipTaskbar: true,
        alwaysOnTop: true,
      });
    };
    const timer = setTimeout(() => { prepare().catch(() => {}); }, 0);
    return () => clearTimeout(timer);
  }, [isMainWindow, language]);
  // [NEW] Pool 枯渇時トースト
  const [poolWaitToast, setPoolWaitToast] = useState<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false });
  const [files, setFiles] = useState<NoteMeta[]>([]);
  const [setupRequired, setSetupRequired] = useState(isMainWindow);
  const [isCheckingSetup, setIsCheckingSetup] = useState(isMainWindow);
  const [loadingStatus, setLoadingStatus] = useState("STARTING..."); // [NEW] Visual Debug Log
  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // [RESTORED]
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<string>('general');
  const [hotkeyRegisterFailureMessage, setHotkeyRegisterFailureMessage] = useState<string | null>(null);
  const [showMonthlyBackupPrompt, setShowMonthlyBackupPrompt] = useState(false);
  const [showDesktopShortcutPrompt, setShowDesktopShortcutPrompt] = useState(false);
  const desktopShortcutPromptCheckedRef = useRef(false);
  const [monthlyBackupResult, setMonthlyBackupResult] = useState<MonthlyBackupResult | null>(null);
  const monthlyBackupCheckedRef = useRef(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false); // [NEW] 全文検索オーバーレイ
  const [searchCaller, setSearchCaller] = useState<string | null>(null); // [NEW] Focus Return用
  // [NEW] アップデートチェック（useUpdateCheckに委譲）
  const { pendingUpdate, showUpdateDialog, isHidingAfterUpdate, handleUpdateConfirm, handleUpdateCancel, tUpdate }
    = useUpdateCheck({ isMainWindow });

  const isSearchOpenRef = useRef(false);
  const hotkeyRegisterFailuresCheckedRef = useRef(false);
  useEffect(() => { isSearchOpenRef.current = isSearchOpen; }, [isSearchOpen]);


  const syncState = useCallback(async (): Promise<AppState | null> => {
    try {
      const state = await invoke<AppState>('fusen_get_state');
      if (state.folder_path) {
        setFolderPath(state.folder_path);
        folderPathRef.current = state.folder_path;
        localStorage.setItem('lastFolder', state.folder_path);
      }
      setFiles(state.notes);
      return state;
    } catch (e) {
      console.error('get_state failed', e);
      return null;
    }
  }, []);

  // ウィンドウリサイズポリシー（useMainWindowResizePolicyに委譲）
  useMainWindowResizePolicy({
    setupRequired: isMainWindow && setupRequired,
    isSettingsOpen: isMainWindow && isSettingsOpen,
    isCheckingSetup: isMainWindow && isCheckingSetup,
    showUpdateDialog: isMainWindow && showUpdateDialog,
    isSearchOpen: isMainWindow && isSearchOpen,
  });
  useFeedbackConversationUnreadCheck(isMainWindow);

  // ウィンドウラベル生成
  const getWindowLabel = useCallback((path: string) => {
    const simpleHash = (str: string): string => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    };
    // [Fix] Use shared normalization logic
    const normalizedPath = normalizePath(path);
    const hash = simpleHash(normalizedPath);
    console.log(`[getWindowLabel] Input: ${path} -> Normalized: ${normalizedPath} -> Hash: note-${hash}`);
    return `note-${hash}`;
  }, []);

  // グローバルキュー初期化
  if (typeof window !== 'undefined' && !(window as any).__WINDOW_QUEUE__) {
    (window as any).__WINDOW_QUEUE__ = {
      queue: [] as Array<() => Promise<void>>,
      processing: false,
      inProgress: new Set<string>(),
    };
  }

  // キュー処理
  const processQueue = useCallback(async () => {
    const queue = (window as any).__WINDOW_QUEUE__;
    if (queue.processing) return;
    queue.processing = true;
    try {
      while (queue.queue.length > 0) {
        const task = queue.queue.shift();
        if (task) {
          try { await task(); } catch (e) { console.error('[processQueue] Task failed:', e); }
          if (queue.queue.length > 0) await new Promise(resolve => setTimeout(resolve, 50));
        }
      }
    } finally { queue.processing = false; }
  }, []);

  const enqueueWindowCreation = useCallback(async (task: () => Promise<void>): Promise<void> => {
    const queue = (window as any).__WINDOW_QUEUE__;
    return new Promise((resolve) => {
      queue.queue.push(async () => {
        try { await task(); } finally { resolve(); }
      });
      if (!queue.processing) processQueue();
    });
  }, [processQueue]);



  const isWindowInProgress = useCallback((label: string): boolean => {
    const queue = (window as any).__WINDOW_QUEUE__;
    return isDuplicateWindowCreationRequest(label, queue.inProgress);
  }, []);
  const markWindowInProgress = useCallback((label: string): void => {
    const queue = (window as any).__WINDOW_QUEUE__;
    queue.inProgress.add(label);
  }, []);
  const unmarkWindowInProgress = useCallback((label: string): void => {
    const queue = (window as any).__WINDOW_QUEUE__;
    queue.inProgress.delete(label);
  }, []);

  // ウィンドウ生成
  const resolveOpenWindow = useCallback(async (path: string) => {
    try {
      const registeredLabel = await invoke<string | null>('fusen_resolve_open_note_window', { path });
      if (registeredLabel) {
        const registeredWindow = await WebviewWindow.getByLabel(registeredLabel);
        if (registeredWindow) return registeredWindow;
      }
    } catch (e) {
      console.warn('[付箋表示] 登録済みウィンドウの解決に失敗しました:', e);
    }

    return WebviewWindow.getByLabel(getWindowLabel(path));
  }, [getWindowLabel]);

  const openNoteWindow = useCallback(async (path: string, meta?: { x?: number, y?: number, width?: number, height?: number, always_on_top?: boolean, opacity?: number, background_color?: string, startup_restore?: boolean }, isNew?: boolean, fromIphone?: boolean) => {
    const label = getWindowLabel(path);
    const startupRestore = meta?.startup_restore === true;

    try {
      const existing = await resolveOpenWindow(path);
      if (existing) {
        if (!startupRestore) await existing.show();
        await existing.unminimize();
        if (!startupRestore) await existing.setFocus();
        return;
      }
    } catch (e) { console.warn(`[付箋表示] 既存ウィンドウ確認に失敗しました: ${label}`, e); }

    await enqueueWindowCreation(async () => {
      try {
        if (isWindowInProgress(label)) return;
        markWindowInProgress(label);

        const existing = await resolveOpenWindow(path);
        if (existing) {
          unmarkWindowInProgress(label);
          await existing.unminimize();
          if (!startupRestore) {
            await existing.show();
            await existing.setFocus();
          }
          return;
        }

        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();
        for (const win of allWindows) {
          try {
            if (win.label === label) {
              unmarkWindowInProgress(label);
              await win.unminimize();
              if (!startupRestore) {
                await win.show();
                await win.setFocus();
              }
              return;
            }
          } catch (e) { }
        }

        try {
          const pathParam = encodeNotePathForUrl(path);
          // 色が分かっている場合は初期描画から正しい色にする（黄色フラッシュ防止）
          const bgHex = /^#[0-9a-fA-F]{6}$/.test(meta?.background_color || '') ? meta!.background_color! : null;
          const bgParam = bgHex ? `&bg=${encodeURIComponent(bgHex)}` : '';
          const startupParam = startupRestore ? '&startupRestore=1' : '';
          const url = isNew ? `/?path=${pathParam}&isNew=1${bgParam}${startupParam}` : `/?path=${pathParam}${bgParam}${startupParam}`;
          const width = meta?.width || 400;
          const height = meta?.height || 300;
          const x = meta?.x;
          const y = meta?.y;

          const win = new WebviewWindow(label, {
            url,
            title: 'Ore No Fusen',  // タスクバープレビューのタイトル
            transparent: false,
            decorations: false,
            alwaysOnTop: meta?.always_on_top || false,
            visible: !startupRestore,
            backgroundColor: bgHex
              ? [parseInt(bgHex.slice(1, 3), 16), parseInt(bgHex.slice(3, 5), 16), parseInt(bgHex.slice(5, 7), 16), 255] as [number, number, number, number]
              : [247, 233, 176, 255], // 色不明時は従来どおり黄色 #f7e9b0
            width,
            height,
            x,
            y,
            skipTaskbar: true,
            focus: !startupRestore,
            dragDropEnabled: false,
          });

          await new Promise<void>((resolve) => {
            const settleCreation = () => resolve();

            void win.once('tauri://created', async () => {
              try {
              // opacity: 0（完全透明＝見えない）や不正値は 1.0 にフォールバックする。
              // 旧データで 0 が入っていても付箋が消えないようにする二重防御。
              const safeOpacity = (typeof meta?.opacity === 'number' && meta.opacity > 0 && meta.opacity <= 1) ? meta.opacity : 1.0;
              await invoke('fusen_set_opacity', { windowLabel: label, opacity: safeOpacity });
              } catch (e) {
              console.warn('[付箋表示] 透明度の適用に失敗しました:', e);
              }
              if (fromIphone) {
              // iPhone受信ウィンドウ: Alt+Tab窓として登録（フォーカスはすでに渡し済み）
              try {
                await invoke('fusen_set_as_alt_tab_window', { label });
              } catch (e) {
                console.warn('[付箋表示] Alt+Tab登録に失敗しました:', e);
              }
              } else {
              if (!startupRestore) {
                try { await win.setFocus(); } catch (e) { /* 表示自体は成功しているので無視 */ }
              }
              try {
                await invoke('fusen_make_tool_window');
              } catch (e) {
                console.warn('[付箋表示] ツールウィンドウ化に失敗しました:', e);
              }
              }
              settleCreation();
            });

            void win.once('tauri://error', (event) => {
              console.error('[莉倡ｮ玖｡ｨ遉ｺ] 繧ｦ繧｣繝ｳ繝峨え菴懈・縺ｫ螟ｱ謨励＠縺ｾ縺励◆:', event);
              settleCreation();
            });
          });
          if (!fromIphone && !startupRestore) {
            try { await win.setFocus(); } catch (e) { /* 作成直後は失敗することがある */ }
          }

        } finally { unmarkWindowInProgress(label); }
      } catch (e) { console.error('[付箋表示] ウィンドウ作成に失敗しました:', e); unmarkWindowInProgress(label); }
    });
  }, [getWindowLabel, resolveOpenWindow, enqueueWindowCreation, isWindowInProgress, markWindowInProgress, unmarkWindowInProgress]);

  const selectDirectory = useCallback(async () => {
    try {
      const folder = await invoke<string>('fusen_select_folder');
      if (folder) await syncState();
    } catch (e) { console.error('select_folder failed', e); }
  }, [syncState]);

  // [Fix] Synchronous lock for creation
  const isCreatingRef = useRef(false);
  const createRequestQueueRef = useRef(new FreshRequestQueue<CreateNoteRequest>(4, 1500));

  const createNoteImmediately = useCallback(async (overrideFolder?: string, overrideContext?: string, sourceMeta?: { physX: number, physY: number, scale: number, physWidth?: number, physHeight?: number }, duplicatePath?: string, perfT0?: number) => {
    const now = Date.now();
    console.log('[handleCreateNote] Triggered. overrideFolder:', overrideFolder, 'Current State:', { isCreating: isCreatingRef.current, isMainWindow, globalLastCreateTime });

    const targetFolder = overrideFolder || folderPath || folderPathRef.current;
    if (!targetFolder) {
      console.warn('[CREATE] No folder. targetFolder:', targetFolder);
      return;
    }

    globalLastCreateTime = now;

    try {
      // ============================================================
      // 複製ルート: duplicatePath がある場合は pool を使わず従来通り
      // ============================================================
      if (duplicatePath) {
        const newNote = await invoke<any>('fusen_duplicate_note', { path: duplicatePath });
        console.log('[CREATE] duplicate newNote:', newNote.meta.path);
        void playCreateSound();
        setFiles(prev => [...prev, newNote.meta]);
        const duplicatePosition = sourceMeta ? (() => {
          const scale = sourceMeta.scale || 1;
          const sourceX = sourceMeta.physX / scale;
          const sourceY = sourceMeta.physY / scale;
          const sourceHeight = (sourceMeta.physHeight ?? Math.round(300 * scale)) / scale;
          const leftX = sourceX - 410;
          return leftX >= 0
            ? { x: leftX, y: sourceY, width: 400, height: 300 }
            : { x: sourceX, y: sourceY + sourceHeight + 10, width: 400, height: 300 };
        })() : undefined;
        await openNoteWindow(newNote.meta.path, duplicatePosition, false);
        trackEvent('feature_used', { event_category: 'usage', feature_name: 'note_duplicate' });
        return;
      }

      // ============================================================
      // Pool 選択: usedPoolWindowsRef で未使用 + ready な pool 窓を探す
      // ============================================================
      let poolWindow: { label: string } | undefined;
      try {
        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();
        console.log(`[TRACE:CREATE] All windows:`, allWindows.map(w => w.label));
        poolWindow = allWindows.find(w => {
          if (!w.label.startsWith('pool-window-')) return false;
          const isUsedRef = usedPoolWindowsRef.current.has(w.label);
          const isPromotedStorage = localStorage.getItem(`promoted_${w.label}`);
          const isReady = readyPoolWindowsRef.current.has(w.label);
          console.log(`[TRACE:CREATE] Checking pool candidate: ${w.label} | isUsedRef: ${isUsedRef} | promotedStorage: ${isPromotedStorage} | isReady: ${isReady}`);
          return !isUsedRef && !isPromotedStorage && isReady;
        });
      } catch (e) {
        console.warn('[CREATE] getAllWebviewWindows failed:', e);
      }

      if (poolWindow) {
        // ============================================================
        // Pool 路: fusen_create_note は呼ばない（lazy 作成: 1 文字目で StickyNote 側が呼ぶ）
        // Atomic Coordination: invoke 1 回で α=255 + SetWindowPos + focus を完結させる
        // ============================================================
        usedPoolWindowsRef.current.add(poolWindow.label);
        localStorage.setItem(`promoted_${poolWindow.label}`, 'true');
        const ts = new Date().toLocaleTimeString('ja-JP');
        console.log(`[TRACE:CREATE | ${ts}] Pool promote (lazy): ${poolWindow.label} folder=${targetFolder}`);

        // 表示位置を計算
        let targetPhysX: number | undefined;
        let targetPhysY: number | undefined;
        if (sourceMeta) {
          const isCursorAnchor = sourceMeta.physHeight === undefined;
          const srcH = isCursorAnchor ? 0 : sourceMeta.physHeight ?? Math.round(300 * sourceMeta.scale);
          const newW = Math.round(400 * sourceMeta.scale);
          const newH = Math.round(300 * sourceMeta.scale);
          const gap = Math.round(10 * sourceMeta.scale);
          const anchorY = isCursorAnchor
            ? Math.max(0, sourceMeta.physY - Math.round(54 * sourceMeta.scale))
            : sourceMeta.physY;
          const leftX = sourceMeta.physX - newW - gap;
          if (leftX >= 0) {
            targetPhysX = leftX;
            targetPhysY = anchorY;
          } else {
            const belowY = sourceMeta.physY + srcH + gap;
            let screenPhysBottom = belowY + newH + 1;
            try {
              const { monitorFromPoint } = await import('@tauri-apps/api/window');
              const mon = await monitorFromPoint(sourceMeta.physX, sourceMeta.physY);
              if (mon) screenPhysBottom = mon.workArea.position.y + mon.workArea.size.height;
            } catch (_) {}
            targetPhysX = sourceMeta.physX;
            targetPhysY = belowY + newH <= screenPhysBottom ? belowY : anchorY - newH - gap;
          }
          try {
            const { monitorFromPoint } = await import('@tauri-apps/api/window');
            const mon = await monitorFromPoint(sourceMeta.physX, sourceMeta.physY);
            if (mon) {
              const left = mon.workArea.position.x;
              const top = mon.workArea.position.y;
              const right = left + mon.workArea.size.width;
              const bottom = top + mon.workArea.size.height;
              targetPhysX = Math.min(Math.max(targetPhysX, left), Math.max(left, right - newW));
              targetPhysY = Math.min(Math.max(targetPhysY, top), Math.max(top, bottom - newH));
            }
          } catch (_) {}
        }

        let sizeScale = sourceMeta?.scale;
        if (sizeScale === undefined) {
          try { sizeScale = await getCurrentWindow().scaleFactor(); } catch (_) { sizeScale = 1.0; }
        }
        const targetPhysWidth = Math.round(400 * sizeScale);
        const targetPhysHeight = Math.round(300 * sizeScale);

        // [NEW] fusen_show_at_position: α=255 + SetWindowPos + SetForegroundWindow を 1 invoke で完結
        // Atomic Coordination Constraint 厳守: 複数 await invoke を直列に並べない
        const runId = `create-${now}`;
        let perfEnabled = false;
        try {
          perfEnabled = await invoke<boolean>('fusen_show_at_position', {
            label: poolWindow.label,
            physX: targetPhysX ?? null,
            physY: targetPhysY ?? null,
            physWidth: targetPhysWidth,
            physHeight: targetPhysHeight,
            runId,
          });
        } catch (e) {
          invoke('fusen_debug_log', { message: `[CREATE] fusen_show_at_position failed: ${e}` }).catch(() => {});
        }

        // StickyNote.tsx に promote を通知（folderPath を渡し、lazy 作成に使わせる）
        const { emitTo } = await import('@tauri-apps/api/event');
        await emitTo(poolWindow.label, 'fusen:promote_from_pool', {
          folderPath: targetFolder,
          isNew: true,
          targetPhysX,
          targetPhysY,
          targetPhysWidth,
          targetPhysHeight,
          t0: perfT0,
          runId,
          perfEnabled,
          perfStartedAt: perfT0 ?? now,
        });
        trackEvent('note_created', { event_category: 'activation', creation_path: 'pool' });

        void playCreateSound();

        // 次のプールウィンドウを補充（バックグラウンドで順次）
        invoke('fusen_create_pool_window').catch(e => console.error('Replenish pool failed', e));

      } else {
        // ============================================================
        // フォールバック路: Pool 枯渇 → 従来の fusen_create_note + openNoteWindow
        // フォールバック側は 400ms グローバルスロットル（上部）で保護済み
        // ============================================================
        console.warn(`[CREATE] No pool window found, falling back to normal window creation`);

        // PoolWaitToast を表示（sourceMeta がある場合はその位置に近く、なければ中央付近）
        const toastX = sourceMeta ? Math.max(0, sourceMeta.physX / (sourceMeta.scale || 1) - 80) : 200;
        const toastY = sourceMeta ? Math.max(0, sourceMeta.physY / (sourceMeta.scale || 1) - 40) : 200;
        setPoolWaitToast({ x: toastX, y: toastY, visible: true });

        try {
          const newNote = await invoke<any>('fusen_create_note', { folderPath: targetFolder, context: overrideContext || 'NewNote' });
          console.log('[CREATE] fallback newNote:', newNote.meta.path);
          void playCreateSound();
          setFiles(prev => [...prev, newNote.meta]);

          await openNoteWindow(newNote.meta.path, sourceMeta ? await (async () => {
            const lx = sourceMeta.physX / sourceMeta.scale;
            const ly = sourceMeta.physY / sourceMeta.scale;
            const isCursorAnchor = sourceMeta.physHeight === undefined;
            const srcH = isCursorAnchor ? 0 : sourceMeta.physHeight ? sourceMeta.physHeight / sourceMeta.scale : 300;
            const anchorY = isCursorAnchor ? Math.max(0, ly - 54) : ly;
            const leftX = lx - 400 - 10;
            let x = leftX >= 0 ? leftX : lx;
            let clampedY = anchorY;
            if (leftX < 0) {
              const belowY = ly + srcH + 10;
              let screenLogBottom = belowY + 300 + 1;
              try {
                const { monitorFromPoint } = await import('@tauri-apps/api/window');
                const mon = await monitorFromPoint(lx, ly);
                if (mon) screenLogBottom = (mon.workArea.position.y + mon.workArea.size.height) / sourceMeta.scale;
              } catch (_) {}
              clampedY = belowY + 300 <= screenLogBottom ? belowY : anchorY - 300 - 10;
            }
            try {
              const { monitorFromPoint } = await import('@tauri-apps/api/window');
              const mon = await monitorFromPoint(lx, ly);
              if (mon) {
                const left = mon.workArea.position.x / sourceMeta.scale;
                const top = mon.workArea.position.y / sourceMeta.scale;
                const right = left + mon.workArea.size.width / sourceMeta.scale;
                const bottom = top + mon.workArea.size.height / sourceMeta.scale;
                x = Math.min(Math.max(x, left), Math.max(left, right - 400));
                clampedY = Math.min(Math.max(clampedY, top), Math.max(top, bottom - 300));
              }
            } catch (_) {}
            return { x, y: clampedY, width: 400, height: 300 };
          })() : undefined, true);

          trackEvent('note_created', { event_category: 'activation', creation_path: 'fallback' });
          invoke('fusen_create_pool_window').catch(e => console.error('Replenish pool failed', e));
        } catch (e) {
          console.error('create_note fallback failed', e);
          trackEvent('note_create_failed', { event_category: 'reliability', error_category: 'create_failed' });
        }
      }
    } catch (e) {
      console.error('handleCreateNote failed', e);
      trackEvent('note_create_failed', { event_category: 'reliability', error_category: 'create_failed' });
    }
  }, [folderPath, isMainWindow, openNoteWindow, folderPathRef]);

  const handleCreateNote = useCallback(async (overrideFolder?: string, overrideContext?: string, sourceMeta?: { physX: number, physY: number, scale: number, physWidth?: number, physHeight?: number }, duplicatePath?: string, perfT0?: number) => {
    const accepted = createRequestQueueRef.current.push({
      overrideFolder,
      overrideContext,
      sourceMeta,
      duplicatePath,
      perfT0,
    }, Date.now());
    if (!accepted) {
      console.warn('[CREATE] Request queue full; dropping new request');
      return;
    }
    if (isCreatingRef.current) return;

    isCreatingRef.current = true;
    setIsCreating(true);
    try {
      let request = createRequestQueueRef.current.take(Date.now());
      while (request) {
        const throttleWait = Math.max(0, 400 - (Date.now() - globalLastCreateTime));
        if (throttleWait > 0) {
          await new Promise((resolve) => setTimeout(resolve, throttleWait));
        }
        await createNoteImmediately(
          request.overrideFolder,
          request.overrideContext,
          request.sourceMeta,
          request.duplicatePath,
          request.perfT0,
        );
        request = createRequestQueueRef.current.take(Date.now());
      }
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  }, [createNoteImmediately]);

  const handleFileSelect = useCallback(async (file: NoteMeta) => {
    await openNoteWindow(file.path, { x: file.x, y: file.y, width: file.width, height: file.height, opacity: file.opacity });
  }, [openNoteWindow]);



  // [Removed] isInitialized (sessionStorage) - replaced with useRef in useEffect


  // イベントリスナー設定
  useEffect(() => {
    if (!isMainWindow) return; // [FIX] プールウィンドウからの過剰反応を防ぐ Guard

    let unlisten: (() => void) | undefined;
    const promise = listen<{ path: string; isNew?: boolean; backgroundColor?: string; content?: string; isCrystal?: boolean; x?: number; y?: number; width?: number; height?: number }>('fusen:open_note', async (event) => {
      const bg = event.payload.backgroundColor;
      const notePath = event.payload.path;
      if (event.payload.isCrystal && event.payload.content !== undefined) {
        const key = normalizePath(notePath);
        const mappedLabel = crystalPoolWindowsRef.current.get(key);
        if (mappedLabel) {
          const mappedWindow = await WebviewWindow.getByLabel(mappedLabel);
          if (mappedWindow) {
            await emitTo(mappedLabel, 'fusen:show_in_view_mode');
            await mappedWindow.show();
            await mappedWindow.unminimize();
            await mappedWindow.setFocus();
            return;
          }
          crystalPoolWindowsRef.current.delete(key);
        }

        const allWindows = await (await import('@tauri-apps/api/webviewWindow')).getAllWebviewWindows();
        const poolWindow = selectReadyInvisibleNote(
          allWindows,
          readyPoolWindowsRef.current,
          usedPoolWindowsRef.current,
          (label) => Boolean(localStorage.getItem(`promoted_${label}`)),
        );
        if (poolWindow) {
          usedPoolWindowsRef.current.add(poolWindow.label);
          localStorage.setItem(`promoted_${poolWindow.label}`, 'true');
          crystalPoolWindowsRef.current.set(key, poolWindow.label);
          const token = `crystal-${Date.now()}-${Math.random()}`;
          let resolveHydrated: (() => void) | undefined;
          const hydrated = new Promise<void>((resolve) => { resolveHydrated = resolve; });
          let settled = false;
          const disposeHydrated = await listen<{ label: string; token: string }>('fusen:pool_promote_ready', (ready) => {
            if (ready.payload.label !== poolWindow.label || ready.payload.token !== token || settled) return;
            settled = true;
            disposeHydrated();
            resolveHydrated?.();
          });
          setTimeout(() => {
            if (settled) return;
            settled = true;
            disposeHydrated();
            resolveHydrated?.();
          }, 500);
          await emitTo(poolWindow.label, 'fusen:promote_from_pool', {
            path: notePath,
            isNew: false,
            content: event.payload.content,
            backgroundColor: bg,
            hydrateToken: token,
          });
          await hydrated;
          const scaleFactor = await poolWindow.scaleFactor().catch(() => 1);
          const physicalSize = physicalCrystalWindowSize(
            event.payload.width,
            event.payload.height,
            scaleFactor,
          );
          const physicalPosition = physicalCrystalWindowPosition(
            event.payload.x,
            event.payload.y,
            scaleFactor,
          );
          if (!physicalPosition) await poolWindow.center();
          await invoke('fusen_show_at_position', {
            label: poolWindow.label,
            physX: physicalPosition?.x ?? null,
            physY: physicalPosition?.y ?? null,
            physWidth: physicalSize.width,
            physHeight: physicalSize.height,
            runId: null,
          });
          await invoke('fusen_register_crystal_arrange_window', {
            label: poolWindow.label,
            path: notePath,
          }).catch((error) => console.warn('[結晶整列] ウィンドウ登録に失敗しました:', error));
          invoke('fusen_create_pool_window').catch(() => {});
          return;
        }
      }
      await openNoteWindow(notePath, bg ? { background_color: bg } : undefined, event.payload.isNew);
      if (event.payload.isCrystal) {
        await invoke('fusen_register_crystal_arrange_window', {
          label: getWindowLabel(notePath),
          path: notePath,
        }).catch((error) => console.warn('[結晶整列] ウィンドウ登録に失敗しました:', error));
      }
    });

    promise.then((u) => { unlisten = u; });

    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [getWindowLabel, isMainWindow, openNoteWindow]);

  // インポートした付箋をすべて生成してから、正式登録済みの全付箋をタグで整列する。
  useEffect(() => {
    if (!isMainWindow) return;
    let unlisten: (() => void) | undefined;
    const promise = listen<{ paths: string[] }>('fusen:open_imported_notes', async (event) => {
      for (const path of event.payload.paths) {
        await openNoteWindow(path, undefined, false);
      }
      await invoke('fusen_arrange_by_tag');
    });
    promise.then((u) => { unlisten = u; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow, openNoteWindow]);

  // プールウィンドウのリスナー登録完了シグナルを受け取る
  useEffect(() => {
    if (!isMainWindow) return;
    let unlisten: (() => void) | undefined;
    listen<{ label: string }>('fusen:pool_window_ready', (event) => {
      readyPoolWindowsRef.current.add(event.payload.label);
    }).then((u) => { unlisten = u; });
    return () => { safeUnlisten(unlisten); };
  }, [isMainWindow]);

  // [NEW] Pool スロット解放: close-without-input 時に StickyNote.tsx が emit → usedPoolWindowsRef からラベルを削除
  useEffect(() => {
    if (!isMainWindow) return;
    let unlisten: (() => void) | undefined;
    listen<{ label: string }>('fusen:pool_slot_released', (event) => {
      const label = event.payload.label;
      usedPoolWindowsRef.current.delete(label);
      // localStorage フラグもクリア（次回 createNewNote でこの pool を再利用できるようにする）
      localStorage.removeItem(`promoted_${label}`);
      console.log(`[POOL] pool_slot_released: label=${label} removed from usedPoolWindowsRef`);
    }).then((u) => { unlisten = u; });
    return () => { safeUnlisten(unlisten); };
  }, [isMainWindow]);

  // [NEW] グローバル Ctrl+N リスナー（Rust が emit した fusen:request_create_global を受信して新規付箋作成）
  // createNewNote は handleCreateNote の alias。useCallback でラップ済みなので毎 render で再登録されない。
  useEffect(() => {
    if (!isMainWindow) return;
    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        // カーソル位置を取得（50ms タイムアウト付き）。失敗時はプライマリモニタ中央にフォールバック
        const getCursorSourceMeta = async (): Promise<{ physX: number; physY: number; scale: number } | undefined> => {
          try {
            const { cursorPosition } = await import('@tauri-apps/api/window');
            const pos = await Promise.race([
              cursorPosition(),
              new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 50)),
            ]);
            if (!pos) return undefined;
            // scaleFactor を取得（失敗時 1.0）
            let scale = 1.0;
            try { scale = await getCurrentWindow().scaleFactor(); } catch (_) { /* fallback */ }
            return { physX: pos.x, physY: pos.y, scale };
          } catch (_) {
            // フォールバック: プライマリモニタ中央
            let scale = 1.0;
            try { scale = await getCurrentWindow().scaleFactor(); } catch (_) { /* fallback */ }
            const physW = Math.round(screen.width * scale);
            const physH = Math.round(screen.height * scale);
            return { physX: Math.round(physW / 2), physY: Math.round(physH / 2), scale };
          }
        };

        const { listen: listenEvent } = await import('@tauri-apps/api/event');
        unlisten = await listenEvent('fusen:request_create_global', async () => {
          console.log('[GlobalShortcut] fusen:request_create_global received → createNewNote');
          const sourceMeta = await getCursorSourceMeta();
          await handleCreateNote(undefined, undefined, sourceMeta, undefined, Date.now());
        });
      } catch (e) {
        console.error('[GlobalShortcut] Failed to setup fusen:request_create_global listener:', e);
      }
    };
    setup();
    return () => { safeUnlisten(unlisten); };
  }, [isMainWindow, handleCreateNote]);

  useEffect(() => {
    if (!isMainWindow || hotkeyRegisterFailuresCheckedRef.current) return;
    hotkeyRegisterFailuresCheckedRef.current = true;

    const checkHotkeyRegisterFailures = async () => {
      try {
        const currentSettings = await invoke<{ language?: Language }>('get_settings');
        const currentLanguage: Language = currentSettings?.language === 'en' ? 'en' : 'ja';
        setLanguage(currentLanguage);
        const result = await invoke<HotkeyRegisterFailuresResponse>('hotkey_get_register_failures');
        if (!result.failures || result.failures.length === 0) return;

        const shortcutNames = result.failures.map(f => f.shortcut).join(' / ');
        setHotkeyRegisterFailureMessage(currentLanguage === 'en'
          ? `The global hotkey could not be registered.\n${shortcutNames} is already in use.\nOpen Settings?`
          : `グローバルホットキーを登録できませんでした。\n${shortcutNames} は既に使用されています。\n設定画面を開きますか？`);

        const win = getCurrentWindow();
        await win.show();
        await win.unminimize();
        await win.setFocus();
      } catch (e) {
        console.warn('[Hotkey] Failed to check register failures:', e);
      }
    };

    checkHotkeyRegisterFailures();
  }, [isMainWindow]);

  // [FIX] メインウィンドウの「閉じる」を「隠す」に変更 (検索ウィンドウ再表示不具合修正)
  useEffect(() => {
    if (!isMainWindow) return;

    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (win.label === 'main') {
          const dbg = (m: string) => invoke('fusen_debug_log', { message: m }).catch(() => { });
          dbg('[Main] Setting up onCloseRequested handler');

          if (typeof win.onCloseRequested === 'function') {
            unlisten = await win.onCloseRequested(async (event) => {
              dbg('[Main] Close requested via X button. Intercepting.');
              event.preventDefault();
              if (isSearchOpenRef.current) {
                // 検索画面が開いている場合は検索を閉じるだけ（内部×と同じ挙動）
                dbg('[Main] Search is open -> closing search overlay.');
                setIsSearchOpen(false);
                setSearchCaller(null);
              }
              await win.hide();
            });
          } else {
            console.warn('[Main] win.onCloseRequested is missing (test environment?)');
          }
        }
      } catch (e) {
        console.error('Failed to setup close handler', e);
      }
    };
    setup();

    return () => { safeUnlisten(unlisten); };
  }, [isMainWindow]);

  // [New] 設定更新イベントの監視
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;

    // settings_updated listener setup
    const setup = async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');

        // 1. Settings Updated Listener
        const unlistenSettings = await listen<any>('settings_updated', async (event) => {
          console.log('[ORCHESTRATOR] Settings updated:', event.payload);
          const newSettings = event.payload;
          if (newSettings?.language === 'en' || newSettings?.language === 'ja') {
            setLanguage(newSettings.language);
          }
          if (newSettings && newSettings.base_path) {
            setFolderPath(newSettings.base_path);
            await syncState();

            // [FIX] Listener should NOT close the settings window.
          }
        });

        // 2. Notes Updated Listener (e.g. from Import)
        const unlistenNotes = await listen('fusen:notes_updated', async () => {
          console.log('[ORCHESTRATOR] Notes updated (external). Syncing state...');
          await syncState();
        });

        // Return combined cleanup function
        return () => {
          safeUnlisten(unlistenSettings);
          safeUnlisten(unlistenNotes);
        };

      } catch (e) {
        console.error("Failed to setup orchestrator settings listener", e);
        return () => { };
      }
    };

    const promise = setup();
    promise.then(u => { unlisten = u; });

    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [syncState, isMainWindow]);


  // タグセレクター
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const promise = listen('fusen:open_tag_selector', async () => {
      try {
        const existing = await WebviewWindow.getByLabel('tag-selector');
        if (existing) {
          await existing.setTitle(language === 'en' ? 'Select Tags' : 'タグを選択');
          await existing.unminimize();
          await existing.setFocus();
          return;
        }
        await new WebviewWindow('tag-selector', { url: '/?tagSelector=1', title: language === 'en' ? 'Select Tags' : 'タグを選択', width: 350, height: 500, alwaysOnTop: true, decorations: true, resizable: false });
      } catch (e) { console.error('[open_tag_selector] Error:', e); }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow, language]);

  // 設定画面イベント (Tray etc)
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const promise = listen('fusen:open_settings', async (event: any) => {
      const tab = event?.payload?.tab ?? 'general';
      try {
        console.log('[MAIN_WINDOW_DEBUG] Settings open requested');
        // 小さい初期画面へ設定本文が先に描画されないよう、表示前にウィンドウを拡大する。
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const { LogicalSize } = await import('@tauri-apps/api/dpi');

        if (win.label === 'main') {
          const { width, height } = await calcSettingsWindowSize();
          console.log(`[MAIN_WINDOW_DEBUG] Opening settings - resizing to ${width}x${height}`);
          // 非表示中にサイズを変えてから show すると、Windows が以前の小さい
          // WINDOWPLACEMENT を復元するため、先に表示・復元してから拡大する。
          await win.show();
          await win.unminimize();
          await win.setSize(new LogicalSize(width, height));
          await win.center();
        }
      } catch (e) {
        // 拡大に失敗しても設定を開く。リサイズポリシーが再試行する。
        console.warn('[open_settings] Window operation failed:', e);
      }

      setSettingsDefaultTab(tab);
      setSetupRequired(false);
      setIsCheckingSetup(false);
      setIsSettingsOpen(true);

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        await win.setFocus();
        console.log('[MAIN_WINDOW_DEBUG] Settings window shown');
      } catch (e) {
        console.warn('[open_settings] Window show failed:', e);
      }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow]);

  // [NEW] 全文検索イベント (Tray etc)
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const promise = listen<{ sourceLabel?: string }>('fusen:open_search', async (event) => {
      const dbg = (m: string) => invoke('fusen_debug_log', { message: m }).catch(() => { });
      dbg(`[Main:Listener] Event received! source: ${event.payload?.sourceLabel}`);
      console.log('[open_search] Event received. Payload:', event.payload);

      // 1. 呼び出し元を記録
      if (event.payload?.sourceLabel) {
        setSearchCaller(event.payload.sourceLabel);
      }

      console.log('[open_search] Opening search overlay...');
      try {
        // [FIX] Force clear loading state to ensure overlay renders even if init is slow/reloaded
        setIsCheckingSetup(false);
        setSetupRequired(false);
        setIsSettingsOpen(false); // 設定画面が開いていても検索を優先する
        // ウィンドウを前面に
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        console.log('[open_search] win.label:', win.label);
        if (win.label === 'main') {
          dbg('[open_search] 3. Main window operation start');

          // [FIX] Priority 1: Mount overlay IMMEDIATELY
          setIsSearchOpen(true);
          trackEvent('feature_used', { event_category: 'usage', feature_name: 'search_open' });

          // サイズ・位置をshow前に設定して確実に反映
          await win.setSize(new LogicalSize(600, 450));
          await win.center();
          dbg('[open_search] 3b. setSize/center done');

          // [FIX] Priority 2: Show and Focus (Reliability first)
          await win.unminimize();
          await win.show();
          await win.setFocus();
          dbg('[open_search] 3c. show/focus done');

          dbg('[open_search] 4. Listener callback finished');
        }
      } catch (e) {
        console.warn('[open_search] Window operation failed:', e);
      }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow]);

  // [FIX] folderPathをRefで同期（リスナー内から参照するため）
  useEffect(() => {
    folderPathRef.current = folderPath;
  }, [folderPath]);

  // [REFACTOR] トレイからの新規作成イベント - handleCreateNoteに統一
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;

    const promise = listen('fusen:create_note_from_tray', async () => {
      console.log('[Tray] Create note event received (Listener start). folderPathRef:', folderPathRef.current);
      // [UNIFIED] handleCreateNoteを呼ぶだけ（スロットルはhandleCreateNote内で管理）
      try {
        const basePath = folderPathRef.current || await invoke<string | null>('get_base_path');
        console.log('[Tray] Resolved basePath:', basePath);
        if (basePath) {
          await handleCreateNote(basePath, language === 'en' ? 'New Note' : '新規メモ');
        } else {
          console.warn('[Tray] No folder path available. Opening Setup.');
          // フォルダー未設定時は設定画面 (Setup) を開く
          setIsSettingsOpen(true);
          // 設定画面を開くためのウィンドウ操作
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          const { LogicalSize } = await import('@tauri-apps/api/dpi');
          const { width, height } = await calcSettingsWindowSize();
          await win.setSize(new LogicalSize(width, height));
          await win.center();
          await win.show();
          await win.setFocus();
        }
      } catch (e) {
        // [FIX] トレイイベント内のエラーはサイレントに処理（アプリをクラッシュさせない）
        console.error('[Tray] create note from tray failed:', e);
      }
    });


    promise.then(u => { unlisten = u; });

    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow, handleCreateNote, language]);

  // [NEW] 付箋コンテキストメニューからの新規作成リクエスト - handleCreateNoteに統一
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;

    const promise = listen<{ folderPath: string; context: string; sourcePhysX?: number; sourcePhysY?: number; sourceScale?: number; sourcePhysWidth?: number; sourcePhysHeight?: number; t0?: number }>('fusen:request_create', async (event) => {
      const { folderPath, context, sourcePhysX, sourcePhysY, sourceScale, sourcePhysWidth, sourcePhysHeight, t0 } = event.payload;
      invoke('fusen_debug_log', { message: `[CREATE_REQ] page.tsx received: sourcePhysX=${sourcePhysX} sourcePhysY=${sourcePhysY} scale=${sourceScale} sourcePhysWidth=${sourcePhysWidth} sourcePhysHeight=${sourcePhysHeight}` }).catch(() => { });
      if (!folderPath) {
        console.warn('[RequestCreate] No folder path in request');
        return;
      }
      const sourceMeta = (sourcePhysX !== undefined && sourcePhysY !== undefined)
        ? { physX: sourcePhysX, physY: sourcePhysY, scale: sourceScale ?? 1.0, physWidth: sourcePhysWidth, physHeight: sourcePhysHeight }
        : undefined;
      await handleCreateNote(folderPath, context || 'memo', sourceMeta, undefined, t0);
    });

    promise.then(u => { unlisten = u; });

    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow, handleCreateNote]);

  // 複製リクエスト
  useEffect(() => {
    if (!isMainWindow) return;
    let unlisten: (() => void) | undefined;
    const promise = listen<{ path: string; sourcePhysX?: number; sourcePhysY?: number; sourceScale?: number }>('fusen:request_duplicate', async (event) => {
      const { path, sourcePhysX, sourcePhysY, sourceScale } = event.payload;
      const sourceMeta = (sourcePhysX !== undefined && sourcePhysY !== undefined)
        ? { physX: sourcePhysX, physY: sourcePhysY, scale: sourceScale ?? 1.0 }
        : undefined;
      await handleCreateNote(undefined, undefined, sourceMeta, path);
    });
    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow, handleCreateNote]);

  // タグフィルター（複数）& 全隠し/全表示
  // [Fix] Rust側ループ・全ウィンドウ同時処理はいずれも WebView2 COM の
  //       ネストしたメッセージポンプでスタックオーバーフローを起こす。
  //       メインウィンドウが 1ウィンドウずつ 50ms 間隔で順番に処理する。
  //       Rust 側 can_do_visibility_op() で 3秒クールダウンも設けている。
  useEffect(() => {
    if (!isMainWindow) return;

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    let unlistenSync: (() => void) | null = null;
    let unlistenVisible: (() => void) | null = null;

    (async () => {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');

      // タグフィルター: 1ウィンドウずつ順番に show/hide
      unlistenSync = await listen<string[]>('fusen:sync_visible_notes', async (event) => {
        const desiredLabels = new Set(event.payload.map((p: string) => getWindowLabel(p)));
        try {
          const wins = (await getAllWebviewWindows()).filter(w => w.label.startsWith('note-'));
          for (const win of wins) {
            try {
              if (desiredLabels.has(win.label)) { await win.show(); } else { await win.hide(); }
            } catch (e) { /* per-window エラーは無視 */ }
            await delay(50); // Win32 メッセージキューをドレインしてから次へ
          }
        } catch (e) { console.error('[TagFilter] sync failed:', e); }
      });

      // 全隠し/全表示: 1ウィンドウずつ順番に show/hide
      unlistenVisible = await listen<boolean>('fusen:set_all_notes_visible', async (event) => {
        const visible = event.payload;
        try {
          const wins = (await getAllWebviewWindows()).filter(w => w.label.startsWith('note-'));
          for (const win of wins) {
            try {
              if (visible) { await win.show(); } else { await win.hide(); }
            } catch (e) { /* per-window エラーは無視 */ }
            await delay(50); // Win32 メッセージキューをドレインしてから次へ
          }
        } catch (e) { console.error('[Visibility] set_all failed:', e); }
      });
    })();

    return () => {
      safeUnlisten(unlistenSync);
      safeUnlisten(unlistenVisible);
    };
  }, [isMainWindow, getWindowLabel]);

  // [New] 音声再生イベントハンドラ (メインウィンドウのみ)
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const setup = async () => {
      try {
        unlisten = await listen<{ type: SoundType, volume: number }>('fusen:play_sound', (event) => {
          playLocalSound(event.payload.type, event.payload.volume);
        });
      } catch (e) { console.error('Failed to setup sound listener', e); }
    };
    setup();

    return () => { safeUnlisten(unlisten); };
  }, [isMainWindow]);

  // [iPhone受信] iPhoneから付箋受信 → 新規付箋ウィンドウを右上に開く (POLL-02)
  useEffect(() => {
    if (!isMainWindow) return;
    let unlisten: (() => void) | undefined;
    const promise = listen<{ id: string; title: string; body: string; context: string; tags?: string[] }>(
      'fusen:note_from_iphone',
      async (event) => {
        const { id, title, body, context, tags } = event.payload;
        try {
          await receiveIphoneNote(
            { id, title, body, context, tags },
            {
              hasSavedNote: (noteId) => invoke<boolean>('fusen_has_iphone_note', { folderPath, noteId }),
              downloadImages: (remoteBody) => invoke<string>('fusen_download_iphone_images', { folderPath, body: remoteBody }),
              createNote: ({ context: receivedContext, body: resolvedBody, noteId }) => invoke<{
                note: { meta: { path: string } };
                created: boolean;
              }>('fusen_create_iphone_note', {
                folderPath,
                context: receivedContext,
                body: resolvedBody,
                noteId,
              }),
              addTag: (path, tag) => invoke('fusen_add_tag', { path, tag }),
              waitBeforeTagRetry: (attempt) => new Promise((resolve) => setTimeout(resolve, 50 * attempt)),
              openCreatedNote: async (path) => {
                playCreateSound();
                const sw = window.screen.width;
                await openNoteWindow(path, { x: sw - 430, y: 50, width: 400, height: 350 }, false, true);
              },
              acknowledge: async (noteId) => {
                await invoke('fusen_ack_iphone_note', { noteId }).catch((ackError) => {
                  console.error('[iphone] Drive受信キューのack失敗:', ackError);
                });
              },
              onTagFailure: (tag, tagError) => console.error(`[iphone] タグ付与に失敗: ${tag}`, tagError),
            },
          );
          trackEvent('feature_used', { event_category: 'usage', feature_name: 'iphone_receive' });
        } catch (e) {
          console.error('[iphone] 付箋作成失敗:', e);
        }
      }
    );
    promise.then((u) => { unlisten = u; });
    return () => {
      if (unlisten) safeUnlisten(unlisten);
      else safeUnlistenWhenResolved(promise);
    };
  }, [isMainWindow, openNoteWindow, folderPath]);

  // [iPhone受信] Drive接続状態 → 赤ドット制御
  useEffect(() => {
    if (!isMainWindow) return;
    let unlistenDisconnected: (() => void) | undefined;
    let unlistenConnected: (() => void) | undefined;
    const p1 = listen('fusen:drive_disconnected', () => {
      setIphoneDriveDisconnected(true);
    });
    const p2 = listen('fusen:drive_connected', () => {
      setIphoneDriveDisconnected(false);
    });
    p1.then((u) => { unlistenDisconnected = u; });
    p2.then((u) => { unlistenConnected = u; });
    return () => {
      if (unlistenDisconnected) safeUnlisten(unlistenDisconnected);
      else safeUnlistenWhenResolved(p1);
      if (unlistenConnected) safeUnlisten(unlistenConnected);
      else safeUnlistenWhenResolved(p2);
    };
  }, [isMainWindow]);

  // UC-01: セットアップチェック
  useEffect(() => {
    async function checkSetup() {
      try {
        const basePath = await invoke<string | null>('get_base_path');

        // Double check with full state
        let folderPath = basePath;
        if (!folderPath) {
          const state = await syncState();
          folderPath = state?.base_path || state?.folder_path || null;
        }

        let needsSetup = !folderPath || folderPath.trim() === '';

        // 設定済みの保存先が使えない場合は、設定を書き換えず再接続・変更を促す。
        if (!needsSetup && folderPath) {
          try {
            await invoke<void>('fusen_check_storage_health', { path: folderPath });
          } catch (e) {
            console.error('[checkSetup] storage health check failed:', e);
            setRecoveredMissingFolder(folderPath);
            needsSetup = true;
          }
        }

        if (needsSetup) {
          setSetupRequired(true);
          setIsCheckingSetup(false); // [Fix] Stop loading to show SettingsPage
          const win = getCurrentWindow();
          if (win.label === 'main') {
            await win.show();
            await win.setFocus();
          }
        } else {
          setSetupRequired(false);
          // [FIX] Setup not required => Stop loading immediately if we are just "restoring"
          // Ideally we wait for windows to open, but if the main window is shown early (e.g. search),
          // we need to be ready.
          // Note: The restore logic below will also run.
        }
      } catch (e) {
        console.error('Failed to check base_path:', e);
        setSetupRequired(true);
        const win = getCurrentWindow();
        await win.setFocus();
      } finally {
        // [Modified] Do NOT clear isCheckingSetup here. Wait for restore logic.
        // except if we are NOT restoring (e.g. first run setup needed)
        // If setup is required, we stay in Loading/Settings page anyway?
        // Let's rely on restoration logic to clear it or the Setup page to handle it.
        // But if Needs Setup -> isCheckingSetup should be false so SettingsPage renders?
        // Line 702: if (isCheckingSetup) return Loading.
        // Line 705: if (setupRequired) return SettingsPage.

        // So:

        // If NO setup needed, we wait for 'checkAndRestore' to finish.
      }
    }

    if (!searchParams.get('path') && searchParams.get('isPool') !== 'true') {
      checkSetup();
    } else {
      setIsCheckingSetup(false);
    }
  }, [searchParams, syncState]);

  // 起動時復元
  const initializationRef = useRef(false);
  useEffect(() => {
    // [Fix] checks initializedRef instead of sessionStorage to allow Reload to work
    if (initializationRef.current) return;
    if (typeof window !== 'undefined') {
      if (window.location.search.includes('path=')) return;
      if (window.location.search.includes('isPool=true')) return; // [NEW] プール時は復元しない
    }

    try {
      const win = getCurrentWindow();
      if (win.label !== 'main') return;
    } catch (e) { return; }

    initializationRef.current = true;

    // Original logic follows
    if (!path) {
      const checkAndRestore = async () => {
        const startupStartedAt = performance.now();
        let startupLanguage: Language = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'ja';
        try {
          const startupSettings = await invoke<{ language?: Language }>('get_settings');
          if (startupSettings?.language === 'en' || startupSettings?.language === 'ja') {
            startupLanguage = startupSettings.language;
          }
        } catch {
          // 設定を読めない場合だけOS言語へフォールバックする。
        }
        setLanguage(startupLanguage);
        const startupIsEnglish = startupLanguage === 'en';
        // [HELPER] Log to both Console and Terminal (via Rust)
        const log = (msg: string) => {
          console.log(msg);
          invoke('fusen_debug_log', { message: msg }).catch(() => { });
        };
        const logStartupStep = (step: string, detail: string) => {
          log(`[起動 ${step}] ${detail} / 経過 ${Math.round(performance.now() - startupStartedAt)}ms`);
        };
        const startPoolReplenishInBackground = () => {
          log('[起動後準備 1/3] 付箋表示が完了したため、Ctrl+N高速化用Pool付箋の準備をバックグラウンドで開始します');
          setTimeout(() => {
            invoke('fusen_replenish_pool')
              .then(() => log('[起動後準備 2/3] Pool付箋のバックグラウンド補充を開始しました'))
              .catch((e) => log(`[起動後準備 2/3] Pool付箋のバックグラウンド補充開始に失敗しました: ${e}`));
          }, 250);
        };

        setLoadingStatus(startupIsEnglish ? 'Checking data-location settings...' : '保存先の設定を確認中...');
        logStartupStep('2/6', '保存先フォルダの設定を確認しています');

        try {
          const basePath = await invoke<string | null>('get_base_path');

          // 設定済みの保存先が利用不能でも、自動で別フォルダへ切り替えない。
          let baseFolderMissing = false;
          if (basePath) {
            try {
              await invoke<void>('fusen_check_storage_health', { path: basePath });
            } catch (e) {
              log(`[起動処理] 保存先フォルダを利用できません。設定は変更せず復元を停止します: ${e}`);
              baseFolderMissing = true;
            }
          }

          if (!basePath) {
            setLoadingStatus(startupIsEnglish ? 'Preparing the data folder...' : '保存先フォルダを準備中...');
            try {
              await invoke<string>('setup_first_launch', { useDefault: true, importPath: null });
            } catch (setupErr) {
              log(`[起動処理] デフォルトフォルダ作成に失敗: ${setupErr}`);
              setLoadingStatus(startupIsEnglish ? 'Failed to prepare the data location' : '保存先の準備に失敗しました');
              return;
            }
          }
          if (baseFolderMissing) {
            setRecoveredMissingFolder(basePath);
            setSetupRequired(true);
            setIsCheckingSetup(false);
            const win = getCurrentWindow();
            if (win.label === 'main') {
              await win.show();
              await win.setFocus();
            }
            return;
          }
          const savedFolder = await invoke<string | null>('get_base_path') ?? '';
          logStartupStep('2/6', `保存先フォルダを確認しました: ${savedFolder || '未設定'}`);

          // ノート復元を即座に開始
          (async () => {
            try {
              setLoadingStatus(startupIsEnglish ? 'Loading the note list...' : 'ノート一覧を取得中...');
              logStartupStep('3/6', '保存先フォルダから付箋ファイル一覧を取得しています');
              await invoke('fusen_list_notes', { folderPath: savedFolder });
              logStartupStep('3/6', '付箋ファイル一覧の取得が完了しました');

              setLoadingStatus(startupIsEnglish ? 'Synchronizing app state...' : '状態を同期中...');
              logStartupStep('4/6', 'Rust側の状態をフロントへ同期しています');
              const state = await syncState();
              logStartupStep('4/6', `状態同期が完了しました: ${state ? '成功' : '失敗'}`);

              if (!state) {
                setLoadingStatus(startupIsEnglish ? 'Synchronization failed' : '同期に失敗しました');
                log('[起動処理] エラー: 状態オブジェクトが空です');
                return;
              }
              // フォルダ消失からの再起動時は、ユーザーが気づけるよう設定画面を出したままにする
              if (state.folder_path && !baseFolderMissing) {
                setSetupRequired(false);
              }
              const notes = state.notes;
              logStartupStep('5/6', `復元する付箋を確定しました: ${notes.length}件`);

              if (notes.length > 0) {
                setLoadingStatus(startupIsEnglish ? `Restoring ${notes.length} notes...` : `${notes.length} 件のノートを復元中...`);
                logStartupStep('6/6', `付箋ウィンドウを非表示で準備します: 0/${notes.length}`);

                const startupLabels = new Set(notes.map((note) => getWindowLabel(note.path)));
                const readyLabels = new Set<string>();
                let resolveAllReady: (() => void) | undefined;
                const unlistenStartupReady = await listen<{ label: string }>('fusen:startup_note_ready', (event) => {
                  const label = event.payload?.label;
                  if (!startupLabels.has(label)) return;
                  readyLabels.add(label);
                  setLoadingStatus(startupIsEnglish
                    ? `Preparing notes (${readyLabels.size}/${notes.length})...`
                    : `付箋を準備中 (${readyLabels.size}/${notes.length})...`);
                  if (readyLabels.size === startupLabels.size) resolveAllReady?.();
                });

                await runWithConcurrency(notes, 2, async (note, i) => {
                  const noteStartedAt = performance.now();
                  const noteName = note.path.split(/[\\/]/).pop();
                  setLoadingStatus(startupIsEnglish
                    ? `Preparing note windows (${i + 1}/${notes.length})...`
                    : `付箋ウィンドウを準備中 (${i + 1}/${notes.length})...`);
                  await openNoteWindow(note.path, {
                    x: note.x,
                    y: note.y,
                    width: note.width,
                    height: note.height,
                    opacity: note.opacity,
                    startup_restore: true,
                  });
                  logStartupStep('6/6', `付箋 ${i + 1}/${notes.length} ${noteName} ${Math.round(performance.now() - noteStartedAt)}ms`);
                });

                if (readyLabels.size < startupLabels.size) {
                  await waitForStartupReady(
                    startupLabels,
                    readyLabels,
                    (resolve) => {
                      resolveAllReady = resolve;
                      return () => { resolveAllReady = undefined; };
                    },
                    STARTUP_INITIAL_READY_TIMEOUT_MS,
                  );
                }

                if (readyLabels.size < startupLabels.size) {
                  const firstMissing = partitionStartupLabels(startupLabels, readyLabels).missing;
                  logStartupStep('6/6', `描画待ちを4秒で終了しました: ${readyLabels.size}/${notes.length}件準備完了。未準備${firstMissing.length}件を1回再試行します`);
                  const noteByLabel = new Map(notes.map((note) => [getWindowLabel(note.path), note]));
                  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

                  await runWithConcurrency(firstMissing, 1, async (label) => {
                    const existing = await WebviewWindow.getByLabel(label);
                    if (existing) await existing.destroy().catch(() => {});
                    const note = noteByLabel.get(label);
                    if (!note) return;
                    await openNoteWindow(note.path, {
                      x: note.x,
                      y: note.y,
                      width: note.width,
                      height: note.height,
                      opacity: note.opacity,
                      startup_restore: true,
                    });
                  });

                  await waitForStartupReady(
                    startupLabels,
                    readyLabels,
                    (resolve) => {
                      resolveAllReady = resolve;
                      return () => { resolveAllReady = undefined; };
                    },
                    STARTUP_RETRY_READY_TIMEOUT_MS,
                  );
                }
                unlistenStartupReady();

                const startupResult = partitionStartupLabels(startupLabels, readyLabels);
                if (startupResult.missing.length > 0) {
                  logStartupStep('6/6', `再試行後も未準備の付箋があります: 準備完了${startupResult.ready.length}/${notes.length}件。未準備窓は表示しません`);
                } else {
                  logStartupStep('6/6', `付箋の本文描画が完了しました: ${notes.length}/${notes.length}`);
                }

                setLoadingStatus(startupResult.ready.length > 0
                  ? (startupIsEnglish ? 'Showing notes...' : '付箋を表示しています...')
                  : (startupIsEnglish ? 'Could not restore notes. Please restart the app.' : '付箋を復元できませんでした。アプリを再起動してください。'));
                logStartupStep('6/6', '準備済みの付箋をまとめて表示します');
                try {
                  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                  const noteWindows = await Promise.all(
                    startupResult.ready.map((label) => WebviewWindow.getByLabel(label)),
                  );
                  await Promise.all(noteWindows.filter((win): win is WebviewWindow => win !== null).map((win) => win.show()));
                  const missingWindows = await Promise.all(
                    startupResult.missing.map((label) => WebviewWindow.getByLabel(label)),
                  );
                  await Promise.all(
                    missingWindows
                      .filter((win): win is WebviewWindow => win !== null)
                      .map((win) => win.destroy().catch(() => {})),
                  );
                  if (startupResult.ready.length === 0) {
                    logStartupStep('6/6', '準備完了0件のため空の付箋は表示せず、起動中画面に再起動案内を表示します');
                    return;
                  }
                  const mainWindow = await WebviewWindow.getByLabel('main');
                  if (mainWindow) await mainWindow.minimize();
                  setIsCheckingSetup(false);
                  logStartupStep('6/6', startupResult.missing.length === 0
                    ? '起動完了: すべての付箋を表示しました'
                    : `起動完了: 準備済み${startupResult.ready.length}件だけを表示しました`);
                  startPoolReplenishInBackground();
                } catch (e) {
                  log(`[起動処理] 一括表示エラー: ${e}`);
                  setLoadingStatus(startupIsEnglish
                    ? 'Failed to show notes. Please restart the app.'
                    : '付箋の表示に失敗しました: ' + String(e));
                }
              } else {
                setLoadingStatus(startupIsEnglish ? 'Creating your welcome note...' : 'ようこそノートを作成中...');
                try {
                  const welcomeNoteColor = NOTE_COLORS.yellow;
                  const newNote = await invoke<{ meta: { path: string }; frontmatter: string }>(
                    'fusen_create_note', {
                      folderPath: savedFolder,
                      context: startupIsEnglish ? 'Your first note (safe to delete)' : 'はじめての付箋（消してOK）',
                    }
                  );
                  const welcomeFrontmatter = (newNote.frontmatter || '').replace(
                    /^backgroundColor:.*$/m,
                    `backgroundColor: ${welcomeNoteColor}`,
                  );
                  await invoke('fusen_save_note', {
                    path: newNote.meta.path,
                    body: startupIsEnglish
                      ? '👋 Welcome. This is your first note.\n\n- [ ] Try this checkbox\n- [ ] Use “+” at the top right to create another note\n- [ ] Right-click this note and change its color\n- [ ] Open “?” at the bottom left for more help\n\nTo delete this note, point to it and use 🗑️.'
                      : '👋 ようこそ。これが最初の付箋です。\n\n- [ ] このチェックを押してみる\n- [ ] 右上の「＋」で新しく1枚作る\n- [ ] このメモを右クリック→色を変えてみる\n- [ ] 左下の「？」で詳しい使い方を見る\n\n消したくなったら、付箋の上にマウスをのせて右下の🗑️',
                    frontmatterRaw: welcomeFrontmatter,
                    allowRename: false,
                  });
                  await openNoteWindow(newNote.meta.path, { background_color: welcomeNoteColor });
                } catch (e) {
                  log(`[起動処理] ウェルカムノート作成失敗: ${e}`);
                  await handleCreateNote(savedFolder, startupIsEnglish ? 'Welcome' : 'ようこそ'); // fallback
                }
                setTimeout(async () => {
                  try {
                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                    const mainWindow = await WebviewWindow.getByLabel('main');
                    if (mainWindow) {
                      // フォルダ消失からの再起動時は、設定画面で通知バナーを見てもらう必要があるので隠さない
                      if (!baseFolderMissing) {
                        await mainWindow.hide();
                      }
                      setIsCheckingSetup(false);
                      logStartupStep('6/6', '起動完了: はじめての付箋を開きました');
                      startPoolReplenishInBackground();
                    }
                  } catch (e) {
                    log(`[起動処理] ウィンドウ非表示エラー: ${e}`);
                  }
                }, 100);
              }
            } catch (e) {
              log(`[起動処理] 内部エラー: ${e}`);
              setLoadingStatus(startupIsEnglish
                ? 'An error occurred during startup. Please restart the app.'
                : 'エラー: ' + String(e));
              setTimeout(() => setIsCheckingSetup(false), 3000);
            }
          })();
        } catch (e) {
          log(`[起動処理] 重大なエラー: ${e}`);
          setLoadingStatus(startupIsEnglish
            ? 'A critical startup error occurred. Please restart the app.'
            : '重大なエラー: ' + String(e));
          setTimeout(() => setIsCheckingSetup(false), 3000);
        }
      };

      checkAndRestore().catch(e => {
        invoke('fusen_debug_log', { message: `[起動処理] セットアップ確認中に例外発生: ${e}` }).catch(() => { });
        const fallbackEnglish = typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en');
        setLoadingStatus(fallbackEnglish
          ? 'Startup check failed. Please restart the app.'
          : '確認失敗: ' + String(e));
        setTimeout(() => setIsCheckingSetup(false), 3000);
      });
    }

    let unlisten: (() => void) | undefined;
    const promise = listen('fusen:reload_all', async () => {
      // Logic for reload if needed
    });

    // Setup verification logic
    const checkSetup = async () => {
      // ... Reusing logic from checkAndRestore basically
      // But the original code had distinct checkSetup?
      // Ah, line 1066 in BROKEN file had `const checkAndRestore = async` and inside it `const setupNeeded = ...`
      // Wait, the BROKEN file had `checkAndRestore` doing `fusen_check_setup` AND `restore`.
      // I should keep that structure as I copied it from the file content.
    };

    // I will stick to what was inside checkAndRestore in the broken file as it seemed to combine logic
    // Actually, looking at the broken file line 1066.

  }, [getWindowLabel, handleCreateNote, isMainWindow, openNoteWindow, path, syncState]);
  // [MOVED] isDashboard計算と診断用ログ（早期returnの前に配置）
  const isDashboard = isMainWindow && !!settings.analytics_consent && !isSearchOpen && !isCheckingSetup && !setupRequired && !isSettingsOpen && !showUpdateDialog && !hotkeyRegisterFailureMessage && !showMonthlyBackupPrompt && !showDesktopShortcutPrompt && !monthlyBackupResult;

  useEffect(() => {
    if (!isMainWindow || isCheckingSetup || setupRequired || settingsLoading || settings.analytics_consent) return;
    const showConsent = async () => {
      const { LogicalSize } = await import('@tauri-apps/api/dpi');
      const win = getCurrentWindow();
      await win.setSize(new LogicalSize(640, 520));
      await win.center();
      await win.unminimize();
      await win.show();
      await win.setFocus();
    };
    void showConsent().catch((e) => console.error('[AnalyticsConsent] prompt display failed:', e));
  }, [isMainWindow, isCheckingSetup, setupRequired, settingsLoading, settings.analytics_consent]);

  useEffect(() => {
    if (!isMainWindow || isCheckingSetup || setupRequired || isSettingsOpen || !settings.analytics_consent || desktopShortcutPromptCheckedRef.current) return;
    desktopShortcutPromptCheckedRef.current = true;
    const checkDesktopShortcut = async () => {
      try {
        const shouldPrompt = await invoke<boolean>('fusen_should_prompt_desktop_shortcut');
        if (!shouldPrompt) return;
        setShowDesktopShortcutPrompt(true);
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(640, 380));
        await win.center();
        await win.unminimize();
        await win.show();
        await win.setFocus();
      } catch (e) {
        console.error('[DesktopShortcut] initial prompt check failed:', e);
      }
    };
    checkDesktopShortcut();
  }, [isMainWindow, isCheckingSetup, setupRequired, isSettingsOpen, settings.analytics_consent]);

  useEffect(() => {
    if (!isDashboard || monthlyBackupCheckedRef.current) return;
    monthlyBackupCheckedRef.current = true;
    const checkMonthlyBackup = async () => {
      try {
        const due = await invoke<boolean>('fusen_monthly_backup_due');
        if (!due) return;
        setShowMonthlyBackupPrompt(true);
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        await win.setSize(new LogicalSize(720, 460));
        await win.center();
        await win.unminimize();
        await win.show();
        await win.setFocus();
      } catch (e) {
        console.error('[MonthlyBackup] confirmation check failed:', e);
      }
    };
    const timer = setTimeout(checkMonthlyBackup, 1000);
    return () => clearTimeout(timer);
  }, [isDashboard]);

  // [DEBUG] isDashboard状態の詳細ログ
  useEffect(() => {
    if (!isMainWindow) return;
    const logState = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (win.label === 'main') {
          await win.isVisible();
        }
      } catch (e) {
        console.error('[Dashboard] 状態確認に失敗しました:', e);
      }
    };
    logState();
  }, [isDashboard, isMainWindow, isSearchOpen, isCheckingSetup, setupRequired, isSettingsOpen, hotkeyRegisterFailureMessage]);

  // [FIX] ダッシュボードモード時にメインウィンドウを確実に隠す
  useEffect(() => {
    if (!isDashboard) return;

    const hideWindow = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        if (win.label === 'main') {
          const isVisible = await win.isVisible();

          if (isVisible) {
            await win.hide();
          }
        }
      } catch (e) {
        console.error('[Dashboard] メインウィンドウ非表示に失敗しました:', e);
      }
    };

    hideWindow();
  }, [isDashboard]);

  if (searchParams.get('tagSelector') === '1') return <TagSelector language={language} />;
  if (searchParams.get('path') || searchParams.get('isPool') === 'true') return (
    <ErrorBoundary language={language}>
      <StickyNote />
    </ErrorBoundary>
  );

  // [FIX] アップデートダイアログは最優先で表示（isDashboard より前に判定）
  // isDashboard=true だとメインウィンドウが非表示になるため、先にreturnしないと届かない
  if (isHidingAfterUpdate) return null;
  if (monthlyBackupResult) {
    return (
      <BackupResultDialog
        language={language}
        status={monthlyBackupResult.status}
        path={monthlyBackupResult.status === 'success' ? monthlyBackupResult.record.path : undefined}
        fileCount={monthlyBackupResult.status === 'success' ? monthlyBackupResult.record.file_count : undefined}
        completedAt={monthlyBackupResult.status === 'success' ? monthlyBackupResult.record.created_at : undefined}
        nextPromptAt={monthlyBackupResult.status === 'success' ? monthlyBackupResult.nextPromptAt : undefined}
        errorMessage={monthlyBackupResult.status === 'error' ? monthlyBackupResult.message : undefined}
        onClose={async () => {
          setMonthlyBackupResult(null);
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          await getCurrentWindow().hide();
        }}
      />
    );
  }
  if (showMonthlyBackupPrompt) {
    return (
      <ConfirmDialog
        isOpen
        title={language === 'en' ? 'Monthly Safety Backup' : '月次安全バックアップ'}
        message={language === 'en' ? 'About 30 days have passed since the last safety backup. Back up now?\n\nDestination: Documents\\OreNoFusen_Backup\\Monthly' : '前回の安全バックアップから約30日が経過しました。今、バックアップを実施しますか？\n\n保存先: Documents\\OreNoFusen_Backup\\Monthly'}
        confirmText={language === 'en' ? 'Back Up' : 'バックアップする'}
        cancelText={language === 'en' ? 'Not Now' : '今回はしない'}
        onConfirm={async () => {
          try {
            const record = await invoke<BackupRecord>('fusen_run_monthly_backup');
            const latestSettings = await invoke<{ monthly_backup_next_prompt?: string }>('get_settings');
            setMonthlyBackupResult({ status: 'success', record, nextPromptAt: latestSettings.monthly_backup_next_prompt });
          } catch (e) {
            console.error('[MonthlyBackup] Failed:', e);
            setMonthlyBackupResult({ status: 'error', message: language === 'en' ? 'The backup could not be completed. Please check the destination and try again.' : String(e) });
          } finally {
            setShowMonthlyBackupPrompt(false);
          }
        }}
        onCancel={async () => {
          try {
            await invoke('fusen_snooze_monthly_backup');
          } finally {
            setShowMonthlyBackupPrompt(false);
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().hide();
          }
        }}
      />
    );
  }
  if (showUpdateDialog && pendingUpdate) {
    return (
      <ConfirmDialog
        isOpen={showUpdateDialog}
        title={tUpdate('update.title')}
        message={(isStoreMigrationBridgeVersion(pendingUpdate.version)
          ? tUpdate('update.storeMigrationMessage')
          : tUpdate('update.message'))
          .replace('{version}', pendingUpdate.version)}
        confirmText={tUpdate('update.confirm')}
        cancelText={tUpdate('update.cancel')}
        onConfirm={handleUpdateConfirm}
        onCancel={handleUpdateCancel}
      />
    );
  }

  if (isMainWindow && !isCheckingSetup && !setupRequired && !settingsLoading && !settings.analytics_consent) {
    const saveAnalyticsConsent = async (consent: 'granted' | 'denied') => {
      await saveSettings({ ...settings, analytics_consent: consent });
    };
    return (
      <AnalyticsConsentDialog
        language={language}
        onAccept={() => { void saveAnalyticsConsent('granted'); }}
        onDecline={() => { void saveAnalyticsConsent('denied'); }}
      />
    );
  }

  if (showDesktopShortcutPrompt) {
    return (
      <ConfirmDialog
        isOpen
        title={language === 'en' ? 'Desktop Shortcut' : 'デスクトップショートカット'}
        message={language === 'en' ? 'Create a desktop shortcut?\nWe recommend one if you use the app every day.\nYou can also create it later in Settings.\n\nShortcut name: Ore No Fusen (Store)' : 'デスクトップにショートカットを作成しますか？\n毎日使う場合は作成をおすすめします。\n後から設定画面でも作成できます。\n\n作成される名前: 俺の付箋（Store版）'}
        confirmText={language === 'en' ? 'Create' : '作成する'}
        cancelText={language === 'en' ? 'Not Now' : '今回は作成しない'}
        onConfirm={async () => {
          try {
            await invoke<string>('fusen_create_desktop_shortcut');
            await invoke('fusen_mark_desktop_shortcut_prompted');
            setShowDesktopShortcutPrompt(false);
            await getCurrentWindow().hide();
          } catch (e) {
            console.error('[DesktopShortcut] Failed:', e);
            alert(language === 'en' ? 'The shortcut could not be created. Please try again from Settings > General.' : `ショートカットを作成できませんでした。\n\n${String(e)}`);
          }
        }}
        onCancel={async () => {
          await invoke('fusen_mark_desktop_shortcut_prompted');
          setShowDesktopShortcutPrompt(false);
          await getCurrentWindow().hide();
        }}
      />
    );
  }

  if (hotkeyRegisterFailureMessage) {
    return (
      <ConfirmDialog
        isOpen={!!hotkeyRegisterFailureMessage}
        title={language === 'en' ? 'Global Hotkey' : 'グローバルホットキー'}
        message={hotkeyRegisterFailureMessage}
        confirmText={language === 'en' ? 'Yes' : 'はい'}
        cancelText={language === 'en' ? 'No' : 'いいえ'}
        onConfirm={() => {
          setHotkeyRegisterFailureMessage(null);
          setIsCheckingSetup(false);
          setSetupRequired(false);
          setSettingsDefaultTab('general');
          setIsSettingsOpen(true);
        }}
        onCancel={() => setHotkeyRegisterFailureMessage(null)}
      />
    );
  }

  if (isCheckingSetup) return <LoadingScreen message={loadingStatus} language={language} />;

  // ★ここが修正ポイント: 設定が必要な場合は、新しく作った SettingsPage を表示
  if (setupRequired || isSettingsOpen) {
    return <SettingsPage
      defaultTab={setupRequired ? 'general' : settingsDefaultTab}
      iphoneDriveDisconnected={iphoneDriveDisconnected}
      baseFolderMissing={!!recoveredMissingFolder}
      missingFolderPath={recoveredMissingFolder}
      onClose={async () => {
      if (setupRequired) {
        const configuredPath = await invoke<string | null>('get_base_path');
        if (!configuredPath) return;
        try {
          await invoke<void>('fusen_check_storage_health', { path: configuredPath });
        } catch (e) {
          console.error('[Settings] storage is still unavailable:', e);
          setRecoveredMissingFolder(configuredPath);
          return;
        }
      }
      // 設定画面を閉じる時の処理
      setIsSettingsOpen(false);
      // フォルダ消失通知は一度確認したら消す
      setRecoveredMissingFolder(null);

      // setupRequiredだった場合は、ここを通るということはセットアップ完了のはず（SettingsPage内でsetup_first_launchするから）
      if (setupRequired) {
        // リロードせずに状態を同期してダッシュボードへ移行
        await syncState();
        setSetupRequired(false);

        // メインウィンドウを隠す（UI改善: デスクトップには付箋だけ残す）
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          if (win.label === 'main') {
            await win.hide();
          }
        } catch (e) {
          console.error("Failed to hide main window", e);
        }
      } else {
        // 通常の設定変更の場合は、メインウィンドウを隠すのが基本挙動
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          if (win.label === 'main') {
            await win.hide();
          }
        } catch (e) { }
      }
    }} />;
  }

  // [NEW] Stable Return Structure
  if (isDashboard || isSearchOpen) {
    return (
      <>
        {/* Dashboard Placeholder (Always mounted when in dashboard/search mode) */}
        <div style={{ display: isDashboard ? 'none' : 'block' }} data-testid="dashboard-anchor">
          {/* If we ever want to show something in the dashboard, put it here. Currently hidden. */}
        </div>

        {/* [NEW] Pool 枯渇時トースト（isPool=false の付箋ウィンドウ上には表示されないため main ウィンドウに置く） */}
        <PoolWaitToast
          language={language}
          x={poolWaitToast.x}
          y={poolWaitToast.y}
          visible={poolWaitToast.visible}
          onClose={() => setPoolWaitToast(prev => ({ ...prev, visible: false }))}
        />

        {/* Search Overlay */}
        {isSearchOpen && (
          <div className="fixed inset-0 bg-black/20 z-40">
            <SearchOverlay language={language} onClose={async () => {
              const dbg = (m: string) => invoke('fusen_debug_log', { message: m }).catch(() => { });
              dbg(`[Search] onClose triggered. Caller: ${searchCaller}`);
              setIsSearchOpen(false); // UIを先に閉じる

              try {
                // [FIX] Imports split correctly
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

                // 2. 呼び出し元が存在する場合、フォーカスを戻す (Return Focus)
                if (searchCaller) {
                  try {
                    console.log(`[Search] Returning focus to caller: ${searchCaller}`);
                    const targetWin = await WebviewWindow.getByLabel(searchCaller);
                    if (targetWin) {
                      await targetWin.setFocus();
                    } else {
                      console.warn(`[Search] Caller window not found: ${searchCaller}`);
                    }
                  } catch (e) {
                    console.warn(`[Search] Failed to focus caller: ${searchCaller}`, e);
                  }
                }

                const win = getCurrentWindow();
                if (win.label === 'main') {
                  await win.setClosable(true); // タイトルバーの×を復元
                  dbg('[Search] Hiding main window (Keeping size)');
                  await win.hide();
                  dbg('[Search] Window hidden successfully');
                }
              } catch (e) {
                dbg(`[Search] Cleanup Error: ${e}`);
                console.error('[Search] Failed to cleanup window:', e);
              } finally {
                dbg('[Search] onClose finished');
                setSearchCaller(null);
              }
            }} getWindowLabel={getWindowLabel} resolveOpenWindow={resolveOpenWindow} />
          </div>
        )}
      </>
    );
  }

  // Default return to avoid returning undefined
  return null;
}

export default function Home() {
  const { settings } = useSettings();
  const language: Language = settings.language === 'en' ? 'en' : 'ja';
  return (
    <Suspense fallback={<LoadingScreen language={language} />}>
      <ErrorBoundary language={language}>
        <OrchestratorContent />
      </ErrorBoundary>
    </Suspense>
  );
}
