'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { pathsEqual } from './utils/pathUtils';
import StickyNote from './components/StickyNote';
import LoadingScreen from './components/LoadingScreen';
// ▼ 修正箇所: ./ ではなく ../ に変更して、ルートのcomponentsフォルダを参照させます
import SettingsPage from '../components/ui/settings-page';

// Global AppState type definition
type AppState = {
  folder_path: string | null;
  notes: NoteMeta[];
  selected_path: string | null;
};

// [NEW] 最初からウィンドウを表示するためのフック
function useShowOnMount() {
  useEffect(() => {
    const show = async () => {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      setTimeout(async () => {
        await win.show();
      }, 500);
    };
    show();
  }, []);
}

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
  backgroundColor?: string;
  tags?: string[];
};

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function TagInputPopup({ target }: { target: string }) {
  const [tagValue, setTagValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.close();
    } catch (e) {
      console.error("Window close failed", e);
    }
  };

  const submit = async () => {
    const trimmed = tagValue.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      console.log('[TagPopup] Adding tag:', trimmed, 'to:', target);
      await invoke('fusen_add_tag', { path: target, tag: trimmed });
      console.log('[TagPopup] Tag added successfully, closing window...');
      handleClose();
    } catch (err) {
      console.error("[TagPopup] Failed to add tag:", err);
      setIsSubmitting(false);
      alert("タグの保存に失敗しました: " + String(err));
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 overflow-hidden select-none p-6">
      <div className="w-full h-full bg-white rounded-[2rem] shadow-2xl flex flex-col border border-gray-100" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex-1 p-8 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/30 mx-auto mb-4">
              <span className="text-3xl">🏷️</span>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">タグを新規作成</h3>
          </div>
          <div className="w-full mb-8" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <input autoFocus type="text" value={tagValue} onChange={(e) => setTagValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') handleClose(); }} placeholder="新しいタグ名を入力..." className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl text-xl font-bold text-gray-800 placeholder:text-gray-300 focus:outline-none transition-all" />
          </div>
          <div className="flex gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button onClick={handleClose} disabled={isSubmitting} className="flex-1 py-5 text-sm font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest">Cancel</button>
            <button onClick={submit} disabled={isSubmitting || !tagValue.trim()} className="flex-[2] py-5 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-xl shadow-blue-500/40 transition-all active:scale-95 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none">{isSubmitting ? "ADDING..." : "ADD TAG"}</button>
          </div>
        </div>
      </div>
    </div>
  );
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
  useShowOnMount();
  const searchParams = useSearchParams();

  const [folderPath, setFolderPath] = useState<string>('');
  const [files, setFiles] = useState<NoteMeta[]>([]);
  const [setupRequired, setSetupRequired] = useState(true);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // [RESTORED]
  // ダッシュボード表示時も小さいサイズを維持する
  useEffect(() => {
    if (!setupRequired && !isSettingsOpen && !isCheckingSetup) {
      const enforceSmallSize = async () => {
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const { LogicalSize } = await import('@tauri-apps/api/dpi');
          const win = getCurrentWindow();
          if (win.label === 'main') {
            await win.setSize(new LogicalSize(240, 300));
            await win.center();
          }
        } catch (e) { }
      };
      enforceSmallSize();
    }
  }, [setupRequired, isSettingsOpen, isCheckingSetup]);

  const syncState = useCallback(async () => {
    try {
      const state = await invoke<AppState>('fusen_get_state');
      if (state.folder_path) {
        setFolderPath(state.folder_path);
        localStorage.setItem('lastFolder', state.folder_path);
      }
      setFiles(state.notes);
    } catch (e) {
      console.error('get_state failed', e);
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
          const width = meta?.width || 320;
          const height = meta?.height || 220;
          const x = meta?.x;
          const y = meta?.y;

          console.log(`[openNoteWindow] Creating window: url=${url}, isNew=${isNew}, width=${width}, height=${height}`);
          const win = new WebviewWindow(label, {
            url, transparent: true, decorations: false, alwaysOnTop: false, visible: true, width, height, x, y, skipTaskbar: false, focus: true,
          });
          win.once('tauri://created', async () => { console.log(`[openNoteWindow] Window created: ${label}. Forcing focus.`); await win.setFocus(); });
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

  const handleCreateNote = async () => {
    const context = 'NewNote';
    if (!folderPath) return;
    const timestamp = Date.now();
    const tempPath = `${folderPath}/temp_${timestamp}.md`;
    const today = new Date().toISOString().slice(0, 10);
    const tempMeta: NoteMeta = { path: tempPath, seq: timestamp, context, updated: today, x: 100, y: 100, width: 400, height: 300, backgroundColor: undefined, tags: [] };

    setFiles(prev => [...prev, tempMeta]);
    setIsCreating(true);
    try {
      const newNote = await invoke<any>('fusen_create_note', { folderPath: folderPath, context });
      setFiles(prev => prev.map((n: NoteMeta) => (pathsEqual(n.path, tempPath) ? newNote.meta : n)));
      await openNoteWindow(newNote.meta.path, undefined, true);
    } catch (e) {
      setFiles(prev => prev.filter((n: NoteMeta) => !pathsEqual(n.path, tempPath)));
      console.error('create_note failed', e);
    } finally { setIsCreating(false); }
  };

  const handleFileSelect = async (file: NoteMeta) => {
    await openNoteWindow(file.path, { x: file.x, y: file.y, width: file.width, height: file.height });
  };

  const isInitialized = () => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('__INITIALIZED__') === 'true';
  };
  const setInitialized = () => { if (typeof window !== 'undefined') { sessionStorage.setItem('__INITIALIZED__', 'true'); } };

  // イベントリスナー設定
  useEffect(() => {
    let unlisten: null | (() => void) = null;
    (async () => {
      unlisten = await listen<{ path: string; isNew?: boolean }>('fusen:open_note', (event) => {
        openNoteWindow(event.payload.path, undefined, event.payload.isNew);
      });
    })();
    return () => { try { unlisten?.(); } catch (e) { console.warn('Failed to unlisten fusen:open_note', e); } };
  }, []);

  // タグフィルター
  useEffect(() => {
    let unlisten: null | (() => void) = null;
    (async () => {
      unlisten = await listen<string | null>('fusen:switch_world', async (event) => {
        const selectedTag = event.payload;
        try {
          await syncState();
          const state = await invoke<AppState>('fusen_get_state');
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
    })();
    return () => { try { unlisten?.(); } catch (e) { console.warn('Failed to unlisten fusen:switch_world', e); } };
  }, []);

  // タグセレクター
  useEffect(() => {
    let unlisten: null | (() => void) = null;
    (async () => {
      unlisten = await listen('fusen:open_tag_selector', async () => {
        try {
          const existing = await WebviewWindow.getByLabel('tag-selector');
          if (existing) { await existing.unminimize(); await existing.setFocus(); return; }
          await new WebviewWindow('tag-selector', { url: '/?tagSelector=1', title: '世界を選ぶ', width: 350, height: 500, alwaysOnTop: true, decorations: true, resizable: false });
        } catch (e) { console.error('[open_tag_selector] Error:', e); }
      });
    })();
    return () => { try { unlisten?.(); } catch (e) { console.warn('Failed to unlisten fusen:open_tag_selector', e); } };
  }, []);

  // 設定画面イベント (Tray etc)
  useEffect(() => {
    let unlisten: null | (() => void) = null;
    (async () => {
      unlisten = await listen('fusen:open_settings', async () => {
        try {
          setIsSettingsOpen(true);
          // ウィンドウを前面に
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          const { LogicalSize } = await import('@tauri-apps/api/dpi');

          if (win.label === 'main') {
            await win.setSize(new LogicalSize(900, 630));
            await win.center();
            await win.show();
            await win.unminimize();
            await win.setFocus();
          }
        } catch (e) {
          console.error('[open_settings] Error:', e);
        }
      });
    })();
    return () => { try { unlisten?.(); } catch (e) { console.warn('Failed to unlisten fusen:open_settings', e); } };
  }, []);

  // [NEW] トレイからの新規作成イベント
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let isActive = true;

    const setup = async () => {
      try {
        const u = await listen('fusen:create_note_from_tray', async () => {
          try {
            const { handleCreateNoteFromTray } = await import('../lib/tray-actions');
            const { getCurrentWindow } = await import('@tauri-apps/api/window');

            await handleCreateNoteFromTray({
              getCurrentWindowLabel: async () => getCurrentWindow().label,
              getBasePath: async () => invoke<string | null>('get_base_path'),
              createNote: async (folder, ctx) => invoke('fusen_create_note', { folderPath: folder, context: ctx }),
              openWindow: async (path, isNew) => openNoteWindow(path, undefined, isNew),
              folderPath: folderPath || undefined
            });
          } catch (e) {
            console.error('[Tray] Create note failed:', e);
          }
        });

        if (isActive) {
          unlisten = u;
        } else {
          u(); // すでにアンマウントされている場合は即解除
        }
      } catch (e) {
        console.warn('Failed to setup fusen:create_note_from_tray listener', e);
      }
    };

    setup();

    return () => {
      isActive = false;
      if (unlisten) unlisten();
    };
  }, [folderPath]);

  // タグフィルター（複数）
  useEffect(() => {
    let unlisten: null | (() => void) = null;
    (async () => {
      unlisten = await listen<string[]>('fusen:apply_tag_filter', async (event) => {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const currentWin = getCurrentWindow();
        if (currentWin.label !== 'main') return;

        const selectedTags = event.payload;
        try {
          const allNotes = await invoke<NoteMeta[]>('fusen_refresh_notes_with_tags');
          const selected = selectedTags.map(t => t.trim());
          const filteredNotes = selected.length > 0 ? allNotes.filter(n => (n.tags ?? []).some(tag => selected.includes(tag.trim()))) : allNotes;
          const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
          const allWindows = await getAllWebviewWindows();
          const filteredPaths = new Set(filteredNotes.map(n => getWindowLabel(n.path)));

          for (const win of allWindows) {
            if (win.label === 'main' || win.label === 'tag-selector') continue;
            if (!filteredPaths.has(win.label)) { try { await win.hide(); } catch (e) { } }
          }
          for (const note of filteredNotes) {
            try {
              await openNoteWindow(note.path, { x: note.x, y: note.y, width: note.width, height: note.height });
              await new Promise(resolve => setTimeout(resolve, 50));
            } catch (e) { }
          }
        } catch (e) { console.error('[apply_tag_filter] Error:', e); }
      });
    })();
    return () => { try { unlisten?.(); } catch (e) { console.warn('Failed to unlisten fusen:apply_tag_filter', e); } };
  }, []);

  // UC-01: セットアップチェック
  useEffect(() => {
    async function checkSetup() {
      try {
        const basePath = await invoke<string | null>('get_base_path');
        const needsSetup = !basePath || basePath.trim() === '';

        if (needsSetup) {
          setSetupRequired(true);
          const win = getCurrentWindow();
          await win.setFocus();
        } else {
          setSetupRequired(false);
          const win = getCurrentWindow();
          if (win.label === 'main') {
            setTimeout(async () => {
              try { await win.hide(); } catch (e) { }
            }, 100);
          }
        }
      } catch (e) {
        console.error('Failed to check base_path:', e);
        setSetupRequired(true);
        const win = getCurrentWindow();
        await win.setFocus();
      } finally {
        setTimeout(() => {
          setIsCheckingSetup(false);
        }, 800);
      }
    }

    if (!searchParams.get('path')) {
      checkSetup();
    } else {
      setIsCheckingSetup(false);
    }
  }, [searchParams]);

  // 起動時復元
  useEffect(() => {
    if (isInitialized()) return;
    if (typeof window !== 'undefined' && window.location.search.includes('path=')) return;
    const win = getCurrentWindow();
    if (win.label !== 'main') return;

    setInitialized();
    if (!searchParams.get('path')) {
      const checkAndRestore = async () => {
        const basePath = await invoke<string | null>('get_base_path');
        if (!basePath) return;
        const savedFolder = basePath;
        setTimeout(async () => {
          try {
            await invoke('fusen_list_notes', { folderPath: savedFolder });
            const state = await invoke<AppState>('fusen_get_state');
            if (state.folder_path) setFolderPath(state.folder_path);
            setFiles(state.notes);
            const notes = state.notes;
            if (notes.length > 0) {
              for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                await openNoteWindow(note.path, { x: note.x, y: note.y, width: note.width, height: note.height });
              }
              setTimeout(async () => {
                try {
                  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                  const mainWindow = await WebviewWindow.getByLabel('main');
                  if (mainWindow) { await mainWindow.hide(); }
                } catch (e) { }
              }, 100);
            } else {
              try {
                const newNote = await invoke<any>('fusen_create_note', {
                  folderPath: savedFolder,
                  context: 'ようこそ'
                });
                await openNoteWindow(newNote.meta.path, undefined, true);
                setTimeout(async () => {
                  try {
                    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                    const mainWindow = await WebviewWindow.getByLabel('main');
                    if (mainWindow) { await mainWindow.hide(); }
                  } catch (e) { }
                }, 100);
              } catch (createErr) { }
            }
          } catch (e) { }
        }, 300);
      };
      checkAndRestore().catch(e => { console.error('Failed to check setup:', e); });
    }
  }, []);

  // パラメータチェックによる分岐
  if (searchParams.get('tagSelector') === '1') return <TagSelector />;
  if (searchParams.get('tagInput') === '1') return <TagInputPopup target={searchParams.get('target') || ''} />;
  if (searchParams.get('path')) return <StickyNote />;

  if (isCheckingSetup) return <LoadingScreen message="STARTING..." />;

  // ★ここが修正ポイント: 設定が必要な場合は、新しく作った SettingsPage を表示
  if (setupRequired || isSettingsOpen) {
    return <SettingsPage onClose={async () => {
      // 設定画面を閉じる時の処理
      setIsSettingsOpen(false);

      // setupRequiredだった場合は、ここを通るということはセットアップ完了のはず（SettingsPage内でsetup_first_launchするから）
      // ただしpage.tsxのstate更新が必要かもしれないが、現在のロジックではリロードが入るか、
      // ユーザー操作でSettingsPage内の「設定完了」→ setup_first_launch → ウィンドウリサイズ等が行われる

      // 通常の設定変更の場合は、メインウィンドウを隠すのが基本挙動
      if (!setupRequired) {
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


  // 管理画面（ダッシュボード）
  return (
    <div className="h-screen w-screen flex flex-col relative bg-white overflow-hidden p-8">
      <header className="mb-12">
        <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-2">俺の付箋</h1>
        <p className="text-gray-400 text-sm">Minimalist Sticky Notes for Obsidian Vault</p>
      </header>
      {!folderPath ? (
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <p className="text-xs text-gray-500 mb-4 text-center">フォルダ設定が必要です</p>
          <button onClick={selectDirectory} className="w-full py-3 bg-black text-white rounded-xl shadow-lg hover:bg-gray-800 transition-all font-bold text-sm">Vaultフォルダを選択</button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-800">ノート一覧</h2>
            <div className="flex gap-4 items-center">
              <button onClick={handleCreateNote} className="text-sm font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1 rounded-lg">✨ 新規ノート</button>
              <button onClick={selectDirectory} className="text-xs text-blue-500 hover:underline">フォルダ変更</button>
            </div>
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-4">
            {files.map((file, index) => (
              <li key={index}>
                <button onClick={() => handleFileSelect(file)} className="w-full text-left px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl hover:border-blue-200 hover:bg-blue-50 transition-all group">
                  <div className="text-xs text-gray-400 mb-1 group-hover:text-blue-400">{file.updated}</div>
                  <div className="text-sm font-bold text-gray-700 truncate group-hover:text-blue-600">{getFileName(file.path)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OrchestratorContent />
    </Suspense>
  );
}