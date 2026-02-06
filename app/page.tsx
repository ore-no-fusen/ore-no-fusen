'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { pathsEqual } from './utils/pathUtils';
import { playLocalSound, playCreateSound, SoundType } from './utils/soundManager'; // [NEW] Sound imports
import StickyNote from './components/StickyNote';
import LoadingScreen from './components/LoadingScreen';
import SettingsPage from '@/components/ui/settings-page';
import SearchOverlay from './components/SearchOverlay'; // [NEW] 全文検索

// Global AppState type definition
type AppState = {
  base_path?: string | null;
  folder_path: string | null;
  notes: NoteMeta[];
  selected_path: string | null;
};

// [NEW] 最初からウィンドウを表示するためのフック


// Global throttle for creation
let globalLastCreateTime = 0;

// 型定義
type NoteMeta = {
  path: string;
  seq: number;
  context: string;
  updated: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  background_color?: string;
  always_on_top?: boolean;
  tags?: string[];
};

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function TagSelector() {
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
      await win.close();
    } catch (e) {
      console.error('Failed to apply tag filter:', e);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.close();
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
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">タグを選択</h3>
            <p className="text-sm text-gray-500 mt-2">選択したタグを持つ付箋のみを表示</p>
          </div>
          <div className="flex-1 overflow-y-auto mb-6" style={{ WebkitAppRegion: 'no-drag' } as any}>
            {isLoading ? (
              <div className="text-center text-gray-400">読み込み中...</div>
            ) : allTags.length === 0 ? (
              <div className="text-center text-gray-400">タグがありません</div>
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
            <button onClick={handleClose} className="flex-1 py-5 text-sm font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest">Cancel</button>
            <button onClick={handleApply} className="flex-[2] py-5 text-sm font-black text-white bg-purple-600 hover:bg-purple-700 rounded-2xl shadow-xl shadow-purple-500/40 transition-all active:scale-95">Apply ({selectedTags.length} selected)</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrchestratorContent() {
  // [DEBUG] Lifecycle
  useEffect(() => {
    console.log('[Orchestrator] Mounted');
    invoke('fusen_debug_log', { message: '[画面管理] 初期化を開始しました (Mounted)' }).catch(() => { });
    return () => console.log('[Orchestrator] Unmounted');
  }, []);

  const searchParams = useSearchParams();
  const path = searchParams.get('path');
  const tagSelector = searchParams.get('tagSelector');
  const isMainWindow = !path && !tagSelector; // [FIX] Added definition guard

  const [folderPath, setFolderPath] = useState<string>('');
  const folderPathRef = useRef<string>(''); // [FIX] スロットル用にRefでも保持
  const [files, setFiles] = useState<NoteMeta[]>([]);
  const [setupRequired, setSetupRequired] = useState(true);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState("STARTING..."); // [NEW] Visual Debug Log
  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // [RESTORED]
  const [isSearchOpen, setIsSearchOpen] = useState(false); // [NEW] 全文検索オーバーレイ
  const [searchCaller, setSearchCaller] = useState<string | null>(null); // [NEW] Focus Return用

  // [DEBUG] Render interaction (Moved to top to avoid Hook Rule violation)
  useEffect(() => {
    console.log('[Home] Render update. isMainWindow:', isMainWindow, 'isSearchOpen:', isSearchOpen, 'folderPath:', folderPath);
  });

  // ダッシュボード表示時も小さいサイズを維持する
  useEffect(() => {
    if (!setupRequired && !isSettingsOpen && !isCheckingSetup) {
      const enforceSmallSize = async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const { LogicalSize } = await import('@tauri-apps/api/dpi');
          const win = getCurrentWindow();
          if (win.label === 'main') {
            // [AGDP Log] Phase I: Observation
            console.log('[MAIN_WINDOW_DEBUG] enforceSmallSize triggered');
            const sizeBefore = await win.innerSize();
            const visibleBefore = await win.isVisible();
            console.log('[MAIN_WINDOW_DEBUG] Before: size=', sizeBefore, 'visible=', visibleBefore);

            await win.setSize(new LogicalSize(240, 300));
            await win.center();

            const sizeAfter = await win.innerSize();
            const visibleAfter = await win.isVisible();
            console.log('[MAIN_WINDOW_DEBUG] After: size=', sizeAfter, 'visible=', visibleAfter);
          }
        } catch (e) {
          console.error('[MAIN_WINDOW_DEBUG] enforceSmallSize failed:', e);
        }
      };
      enforceSmallSize();
    }
  }, [setupRequired, isSettingsOpen, isCheckingSetup]);

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

  // [Splash Screen Logic] resize window
  useEffect(() => {
    const handleResize = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();

        // メインウィンドウ以外（付箋ウィンドウなど）はリサイズしない
        if (!win.label.includes('main') && win.label.includes('note-')) return;

        if (!isCheckingSetup && setupRequired) {
          await win.setSize(new LogicalSize(900, 630));
          await win.center();
          await win.setFocus();
        } else {
          await win.setSize(new LogicalSize(240, 300));
          await win.center();
        }
      } catch (e) { }
    };
    handleResize();
  }, [isCheckingSetup, setupRequired]);

  // パス正規化
  const normalizePath = (path: string): string => {
    let normalized = path.trim();
    normalized = normalized.normalize('NFC');
    normalized = normalized.replace(/\\/g, '/');
    normalized = normalized.toLowerCase();
    normalized = normalized.replace(/\/+/g, '/');
    normalized = normalized.replace(/\/$/, '');
    return normalized;
  };

  // ウィンドウラベル生成
  const getWindowLabel = (path: string) => {
    const simpleHash = (str: string): string => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return Math.abs(hash).toString(36);
    };
    const normalizedPath = normalizePath(path);
    const hash = simpleHash(normalizedPath);
    return `note-${hash}`;
  };

  // グローバルキュー初期化
  if (typeof window !== 'undefined' && !(window as any).__WINDOW_QUEUE__) {
    (window as any).__WINDOW_QUEUE__ = {
      queue: [] as Array<() => Promise<void>>,
      processing: false,
      inProgress: new Set<string>(),
    };
  }

  // キュー処理
  const enqueueWindowCreation = async (task: () => Promise<void>): Promise<void> => {
    const queue = (window as any).__WINDOW_QUEUE__;
    return new Promise((resolve) => {
      queue.queue.push(async () => {
        try { await task(); } finally { resolve(); }
      });
      if (!queue.processing) processQueue();
    });
  };

  const processQueue = async () => {
    const queue = (window as any).__WINDOW_QUEUE__;
    if (queue.processing) return;
    queue.processing = true;
    try {
      while (queue.queue.length > 0) {
        const task = queue.queue.shift();
        if (task) {
          try { await task(); } catch (e) { console.error('[processQueue] Task failed:', e); }
          if (queue.queue.length > 0) await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    } finally { queue.processing = false; }
  };

  const isWindowInProgress = (label: string): boolean => {
    const queue = (window as any).__WINDOW_QUEUE__;
    return queue.inProgress.has(label);
  };
  const markWindowInProgress = (label: string): void => {
    const queue = (window as any).__WINDOW_QUEUE__;
    queue.inProgress.add(label);
  };
  const unmarkWindowInProgress = (label: string): void => {
    const queue = (window as any).__WINDOW_QUEUE__;
    queue.inProgress.delete(label);
  };

  // ウィンドウ生成
  const openNoteWindow = async (path: string, meta?: { x?: number, y?: number, width?: number, height?: number }, isNew?: boolean) => {
    const label = getWindowLabel(path);
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
      const existing = await WebviewWindow.getByLabel(label);
      if (existing) {
        console.log(`[openNoteWindow] Showing existing window: ${label}`);
        await existing.show();
        await existing.unminimize();
        await existing.setFocus();
        return;
      }
    } catch (e) { console.warn(`[openNoteWindow] Failed to check existing window: ${label}`, e); }

    await enqueueWindowCreation(async () => {
      try {
        if (isWindowInProgress(label)) return;
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) { await existing.unminimize(); await existing.show(); await existing.setFocus(); return; }

        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();
        for (const win of allWindows) {
          try { if (win.label === label) { await win.show(); await win.unminimize(); await win.setFocus(); return; } } catch (e) { }
        }

        markWindowInProgress(label);
        try {
          const safePath = path.replace(/\\/g, '/');
          const pathParam = encodeURIComponent(safePath);
          const url = isNew ? `/?path=${pathParam}&isNew=1` : `/?path=${pathParam}`;
          const width = meta?.width || 400;
          const height = meta?.height || 300;
          const x = meta?.x;
          const y = meta?.y;

          console.log(`[openNoteWindow] Creating window: url=${url}, isNew=${isNew}, width=${width}, height=${height}`);
          const win = new WebviewWindow(label, {
            url,
            title: 'Quick Memo',  // タスクバープレビューのタイトル
            transparent: true,
            decorations: false,
            alwaysOnTop: false,
            visible: true,
            width,
            height,
            x,
            y,
            skipTaskbar: true,
            focus: true,
          });
          win.once('tauri://created', async () => {
            console.log(`[openNoteWindow] Window created: ${label}. Applying tool window style.`);
            await win.setFocus();
            // [NEW] Alt+Tab/タスクビューから除外するためWS_EX_TOOLWINDOWを適用
            try {
              await invoke('fusen_make_tool_window');
            } catch (e) {
              console.warn('[openNoteWindow] Failed to apply tool window style:', e);
            }
          });
          await win.setFocus();
          await new Promise(resolve => setTimeout(resolve, 100));
        } finally { unmarkWindowInProgress(label); }
      } catch (e) { console.error(`Failed to open window:`, e); unmarkWindowInProgress(label); }
    });
  };

  const selectDirectory = async () => {
    try {
      const folder = await invoke<string>('fusen_select_folder');
      if (folder) await syncState();
    } catch (e) { console.error('select_folder failed', e); }
  };

  // [Fix] Synchronous lock for creation
  const isCreatingRef = useRef(false);

  const handleCreateNote = async (overrideFolder?: string, overrideContext?: string) => {
    // Global Throttle (Module Level) prevention
    const now = Date.now();
    console.log('[handleCreateNote] Triggered. overrideFolder:', overrideFolder, 'Current State:', { isCreating: isCreatingRef.current, isMainWindow, globalLastCreateTime });

    if (now - globalLastCreateTime < 1000) {
      console.warn('[CREATE] Blocked by global throttle');
      return;
    }

    // Sync check
    const targetFolder = overrideFolder || folderPath || folderPathRef.current;
    if (!targetFolder || isCreatingRef.current) {
      console.warn('[CREATE] No folder or already creating. targetFolder:', targetFolder, 'creating:', isCreatingRef.current);
      return;
    }

    globalLastCreateTime = now;
    isCreatingRef.current = true;
    setIsCreating(true); // Keep for UI disabled state

    const context = overrideContext || 'NewNote';
    const timestamp = Date.now();
    const tempPath = `${targetFolder}/temp_${timestamp}.md`;
    const today = new Date().toISOString().slice(0, 10);
    const tempMeta: NoteMeta = { path: tempPath, seq: timestamp, context, updated: today, x: 100, y: 100, width: 400, height: 300, background_color: undefined, tags: [] };

    setFiles(prev => [...prev, tempMeta]);

    try {
      console.log('[CREATE] Invoking fusen_create_note with folder:', targetFolder);
      const newNote = await invoke<any>('fusen_create_note', { folderPath: targetFolder, context });

      // [NEW] 新規作成音を鳴らす
      await playCreateSound();

      setFiles(prev => prev.map((n: NoteMeta) => (pathsEqual(n.path, tempPath) ? newNote.meta : n)));
      // Open window after creation
      await openNoteWindow(newNote.meta.path, undefined, true);
    } catch (e) {
      setFiles(prev => prev.filter((n: NoteMeta) => !pathsEqual(n.path, tempPath)));
      console.error('create_note failed', e);
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
    }
  };

  const handleFileSelect = async (file: NoteMeta) => {
    await openNoteWindow(file.path, { x: file.x, y: file.y, width: file.width, height: file.height });
  };



  // [Removed] isInitialized (sessionStorage) - replaced with useRef in useEffect


  // イベントリスナー設定
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const promise = listen<{ path: string; isNew?: boolean }>('fusen:open_note', (event) => {
      openNoteWindow(event.payload.path, undefined, event.payload.isNew);
    });

    promise.then((u) => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
      else promise.then((u) => u());
    };
  }, []);

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

          unlisten = await win.onCloseRequested(async (event) => {
            dbg('[Main] Close requested via X button. Intercepting -> Hide.');
            event.preventDefault();
            await win.hide();
          });
        }
      } catch (e) {
        console.error('Failed to setup close handler', e);
      }
    };
    setup();

    return () => { if (unlisten) unlisten(); };
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
          unlistenSettings();
          unlistenNotes();
        };

      } catch (e) {
        console.error("Failed to setup orchestrator settings listener", e);
        return () => { };
      }
    };

    const promise = setup();
    promise.then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u && u());
    };
  }, [syncState]);

  // タグフィルター
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const promise = listen<string | null>('fusen:switch_world', async (event) => {
      const selectedTag = event.payload;
      try {
        const state = await syncState();
        if (!state) return;
        const allNotes = state.notes;
        const filteredNotes = selectedTag ? allNotes.filter(n => n.tags && n.tags.includes(selectedTag)) : allNotes;
        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();
        const filteredPaths = new Set(filteredNotes.map(n => getWindowLabel(n.path)));

        for (const win of allWindows) {
          if (win.label === 'main') continue;
          const shouldShow = filteredPaths.has(win.label);
          try { if (shouldShow) { await win.show(); await win.unminimize(); } else { await win.hide(); } } catch (e) { }
        }
        const openedLabels = new Set(allWindows.map(w => w.label));
        for (const note of filteredNotes) {
          const label = getWindowLabel(note.path);
          if (!openedLabels.has(label)) {
            await openNoteWindow(note.path, { x: note.x, y: note.y, width: note.width, height: note.height });
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }
      } catch (e) { console.error('[switch_world] Error:', e); }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u());
    };
  }, []);

  // タグセレクター
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const promise = listen('fusen:open_tag_selector', async () => {
      try {
        const existing = await WebviewWindow.getByLabel('tag-selector');
        if (existing) { await existing.unminimize(); await existing.setFocus(); return; }
        await new WebviewWindow('tag-selector', { url: '/?tagSelector=1', title: '世界を選ぶ', width: 350, height: 500, alwaysOnTop: true, decorations: true, resizable: false });
      } catch (e) { console.error('[open_tag_selector] Error:', e); }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u());
    };
  }, []);

  // 設定画面イベント (Tray etc)
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;
    const promise = listen('fusen:open_settings', async () => {
      try {
        console.log('[MAIN_WINDOW_DEBUG] Settings open requested');
        setIsSettingsOpen(true);
        // ウィンドウを前面に
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const { LogicalSize } = await import('@tauri-apps/api/dpi');

        if (win.label === 'main') {
          console.log('[MAIN_WINDOW_DEBUG] Opening settings - resizing to 900x630');
          await win.setSize(new LogicalSize(900, 630));
          await win.center();
          await win.show();
          await win.unminimize();
          await win.setFocus();
          console.log('[MAIN_WINDOW_DEBUG] Settings window shown');
        }
      } catch (e) {
        // ウィンドウ操作に失敗しても致命的ではないため無視
        console.warn('[open_settings] Window operation failed:', e);
      }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u());
    };
  }, []);

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
        // ウィンドウを前面に
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        const win = getCurrentWindow();
        if (win.label === 'main') {
          dbg('[open_search] 3. Main window operation start');

          // [FIX] Priority 1: Mount overlay IMMEDIATELY
          setIsSearchOpen(true);

          // [FIX] Priority 2: Show and Focus (Reliability first)
          await win.unminimize();
          await win.show();
          await win.setFocus();
          dbg('[open_search] 3c. show/focus done');

          // [FIX] Priority 3: Size and Position (Non-blocking to prevent UI hang)
          (async () => {
            try {
              // Give OS a moment to finish 'show' animation before resizing
              await new Promise(resolve => setTimeout(resolve, 150));
              dbg('[open_search] 3d-async. setSize(800, 600)');
              await win.setSize(new LogicalSize(800, 600));
              dbg('[open_search] 3e-async. center');
              await win.center();
              dbg('[open_search] 3f-async. All window ops done');
            } catch (e) {
              dbg(`[open_search] Async Window Ops Error: ${e}`);
            }
          })();

          dbg('[open_search] 4. Listener callback finished');
        }
      } catch (e) {
        console.warn('[open_search] Window operation failed:', e);
      }
    });

    promise.then(u => { unlisten = u; });
    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u());
    };
  }, []);

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
      const basePath = folderPathRef.current || await invoke<string | null>('get_base_path');
      console.log('[Tray] Resolved basePath:', basePath);
      if (basePath) {
        await handleCreateNote(basePath, '新規メモ');
      } else {
        console.warn('[Tray] No folder path available. Opening Setup.');
        // フォルダー未設定時は設定画面 (Setup) を開く
        setIsSettingsOpen(true);
        // 設定画面を開くためのウィンドウ操作
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const { LogicalSize } = await import('@tauri-apps/api/dpi');
        await win.setSize(new LogicalSize(900, 630));
        await win.center();
        await win.show();
        await win.setFocus();
      }
    });

    promise.then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u());
    };
  }, []); // 空の依存配列でリスナー再登録防止

  // [NEW] 付箋コンテキストメニューからの新規作成リクエスト - handleCreateNoteに統一
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: (() => void) | undefined;

    const promise = listen<{ folderPath: string; context: string }>('fusen:request_create', async (event) => {
      console.log('[RequestCreate] Event received from sticky note:', event.payload);
      const { folderPath, context } = event.payload;
      if (folderPath) {
        await handleCreateNote(folderPath, context || 'memo');
      } else {
        console.warn('[RequestCreate] No folder path in request');
      }
    });

    promise.then(u => { unlisten = u; });

    return () => {
      if (unlisten) unlisten();
      else promise.then(u => u());
    };
  }, []); // 空の依存配列でリスナー再登録防止

  // タグフィルター（複数）
  useEffect(() => {
    if (!isMainWindow) return; // Guard

    let unlisten: null | (() => void) = null;
    (async () => {
      // [Refactor] SSOT-based Window Reconciliation
      // Rust updates state -> Emits this event -> Frontend syncs actual windows
      unlisten = await listen<string[]>('fusen:sync_visible_notes', async (event) => {
        const visiblePaths = event.payload;
        console.log('[Orchestrator] Reconciling windows. Desired visible count:', visiblePaths.length);

        try {
          const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
          const allWindows = await getAllWebviewWindows();
          const currentWindowMap = new Map(allWindows.map(w => [w.label, w]));

          // 1. Calculate Desired Labels
          const desiredLabels = new Set(visiblePaths.map(p => getWindowLabel(p)));

          // 2. Hide extra windows (Existent && Not Desired)
          // Only target note windows (label starts with 'note-')
          for (const win of allWindows) {
            if (win.label.startsWith('note-') && !desiredLabels.has(win.label)) {
              await win.hide();
            }
          }

          // 3. Show/Open missing windows
          for (const path of visiblePaths) {
            const label = getWindowLabel(path);
            const win = currentWindowMap.get(label);
            if (win) {
              await win.show();
              await win.unminimize();
            } else {
              await openNoteWindow(path);
            }
          }
        } catch (e) { console.error('[Orchestrator] Failed to reconcile windows:', e); }
      });
    })();
    return () => { try { unlisten?.(); } catch (e) { console.warn('Failed to unlisten fusen:apply_tag_filter', e); } };
  }, []);

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

    return () => { if (unlisten) unlisten(); };
  }, []);

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

        const needsSetup = !folderPath || folderPath.trim() === '';

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

    if (!searchParams.get('path')) {
      checkSetup();
    } else {
      setIsCheckingSetup(false);
    }
  }, [searchParams]);

  // 起動時復元
  const initializationRef = useRef(false);
  useEffect(() => {
    // [Fix] checks initializedRef instead of sessionStorage to allow Reload to work
    if (initializationRef.current) return;
    if (typeof window !== 'undefined' && window.location.search.includes('path=')) return;
    try {
      const win = getCurrentWindow();
      if (win.label !== 'main') return;
    } catch (e) { return; }

    initializationRef.current = true;

    // Original logic follows
    if (!searchParams.get('path')) {
      const checkAndRestore = async () => {
        // [HELPER] Log to both Console and Terminal (via Rust)
        const log = (msg: string) => {
          console.log(msg);
          invoke('fusen_debug_log', { message: msg }).catch(() => { });
        };

        setLoadingStatus("保存先の設定を確認中...");
        log('[起動処理] 復元処理を開始します (checkAndRestore started)');

        try {
          const basePath = await invoke<string | null>('get_base_path');
          log(`[起動処理] 設定されたパス: ${basePath || 'なし'}`);

          if (!basePath) {
            log('[起動処理] パスが未設定のため、復元を停止します');
            setLoadingStatus("保存先が見つかりません");
            return;
          }
          const savedFolder = basePath;

          setTimeout(async () => {
            try {
              setLoadingStatus("ノート一覧を取得中...");
              log('[起動処理] ノート一覧を取得しています...');
              await invoke('fusen_list_notes', { folderPath: savedFolder });
              log('[起動処理] 一覧取得完了。状態を同期します...');

              setLoadingStatus("状態を同期中...");
              const state = await syncState();
              log(`[起動処理] 同期結果: ${state ? '成功' : '失敗'}`);

              if (!state) {
                setLoadingStatus("同期に失敗しました");
                log('[起動処理] エラー: 状態オブジェクトが空です');
                return;
              }
              if (state.folder_path) {
                setSetupRequired(false);
              }
              const notes = state.notes;
              log(`[起動処理] 復元対象のノート数: ${notes.length}件`);

              if (notes.length > 0) {
                setLoadingStatus(`${notes.length} 件のノートを復元中...`);
                for (let i = 0; i < notes.length; i++) {
                  const note = notes[i];
                  setLoadingStatus(`ノートを開いています (${i + 1}/${notes.length}): ${note.path.split(/[\\/]/).pop()}...`);
                  log(`[起動処理] ウィンドウを開く: ${note.path}`);
                  await openNoteWindow(note.path, { x: note.x, y: note.y, width: note.width, height: note.height });
                }

                setLoadingStatus("仕上げ処理...");
                setTimeout(async () => {
                  try {
                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                    const mainWindow = await WebviewWindow.getByLabel('main');
                    if (mainWindow) {
                      log('[起動処理] メインウィンドウを最小化します (通常起動)');
                      await mainWindow.minimize();
                      setIsCheckingSetup(false);
                    }
                  } catch (e) {
                    log(`[起動処理] 最小化エラー: ${e}`);
                    setLoadingStatus("最小化失敗: " + String(e));
                    setTimeout(() => setIsCheckingSetup(false), 2000);
                  }
                }, 100);
              } else {
                setLoadingStatus("ようこそノートを作成中...");
                log('[起動処理] ノートが0件のため、ようこそノートを作成します');
                await handleCreateNote(savedFolder, 'ようこそ');
                setTimeout(async () => {
                  try {
                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                    const mainWindow = await WebviewWindow.getByLabel('main');
                    if (mainWindow) {
                      log('[起動処理] メインウィンドウを隠します (初回ウェルカム)');
                      await mainWindow.hide();
                      setIsCheckingSetup(false);
                    }
                  } catch (e) {
                    log(`[起動処理] ウィンドウ非表示エラー: ${e}`);
                  }
                }, 100);
              }
            } catch (e) {
              log(`[起動処理] 内部エラー: ${e}`);
              setLoadingStatus("エラー: " + String(e));
              setTimeout(() => setIsCheckingSetup(false), 3000);
            }
          }, 300);
        } catch (e) {
          log(`[起動処理] 重大なエラー: ${e}`);
          setLoadingStatus("重大なエラー: " + String(e));
          setTimeout(() => setIsCheckingSetup(false), 3000);
        }
      };

      checkAndRestore().catch(e => {
        invoke('fusen_debug_log', { message: `[起動処理] セットアップ確認中に例外発生: ${e}` }).catch(() => { });
        setLoadingStatus("確認失敗: " + String(e));
        setTimeout(() => setIsCheckingSetup(false), 3000);
      });
    }
  }, []);

  // [MOVED] isDashboard計算と診断用ログ（早期returnの前に配置）
  const isDashboard = isMainWindow && !isSearchOpen && !isCheckingSetup && !setupRequired && !isSettingsOpen;

  // [DEBUG] isDashboard状態の詳細ログ
  useEffect(() => {
    const logState = async () => {
      const dbg = (m: string) => invoke('fusen_debug_log', { message: m }).catch(() => { });

      dbg(`[Dashboard:State] isDashboard=${isDashboard} | breakdown: isMainWindow=${isMainWindow}, isSearchOpen=${isSearchOpen}, isCheckingSetup=${isCheckingSetup}, setupRequired=${setupRequired}, isSettingsOpen=${isSettingsOpen}`);

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        if (win.label === 'main') {
          const isVisible = await win.isVisible();
          const isMinimized = await win.isMinimized();
          const size = await win.innerSize();

          dbg(`[Dashboard:Window] label=main, visible=${isVisible}, minimized=${isMinimized}, size=${size.width}x${size.height}`);
          console.log('[Dashboard:Window]', { isDashboard, isVisible, isMinimized, size: `${size.width}x${size.height}` });
        }
      } catch (e) {
        console.error('[Dashboard:State] Failed to get window info:', e);
      }
    };
    logState();
  }, [isDashboard, isMainWindow, isSearchOpen, isCheckingSetup, setupRequired, isSettingsOpen]);

  // [FIX] ダッシュボードモード時にメインウィンドウを確実に隠す
  useEffect(() => {
    if (!isDashboard) return;

    const hideWindow = async () => {
      const dbg = (m: string) => invoke('fusen_debug_log', { message: m }).catch(() => { });

      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();

        if (win.label === 'main') {
          const isVisible = await win.isVisible();

          if (isVisible) {
            dbg(`[Dashboard:Fix] メインウィンドウが表示されているため隠します (visible=${isVisible})`);
            console.log('[Dashboard:Fix] Hiding main window because isDashboard=true');
            await win.hide();
            dbg('[Dashboard:Fix] ウィンドウを隠しました');
            console.log('[Dashboard:Fix] Window hidden successfully');
          } else {
            console.log('[Dashboard:Fix] Window already hidden, no action needed');
          }
        }
      } catch (e) {
        dbg(`[Dashboard:Fix] エラー: ${e}`);
        console.error('[Dashboard:Fix] Failed to hide window:', e);
      }
    };

    hideWindow();
  }, [isDashboard]);

  if (searchParams.get('tagSelector') === '1') return <TagSelector />;
  if (searchParams.get('path')) return <StickyNote />;

  if (isCheckingSetup) return <LoadingScreen message={loadingStatus} />;

  // ★ここが修正ポイント: 設定が必要な場合は、新しく作った SettingsPage を表示
  if (setupRequired || isSettingsOpen) {
    return <SettingsPage onClose={async () => {
      // 設定画面を閉じる時の処理
      setIsSettingsOpen(false);

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

        {/* Search Overlay */}
        {isSearchOpen && (
          <div className="fixed inset-0 bg-black/20 z-40">
            <SearchOverlay onClose={async () => {
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
            }} getWindowLabel={getWindowLabel} />
          </div>
        )}
      </>
    );
  }

  // Fallback (should not be reached if conditions match)
  return null;
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OrchestratorContent />
    </Suspense>
  );
}