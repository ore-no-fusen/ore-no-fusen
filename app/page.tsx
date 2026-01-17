'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import StickyNote from './components/StickyNote';
import LoadingScreen from './components/LoadingScreen';
import SetupScreen from './components/SetupScreen';

// Global AppState type definition
type AppState = {
  folder_path: string | null;
  notes: NoteMeta[];
  selected_path: string | null;
};



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
      // まずclose()を試す
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
      // タグ追加成功後、即座にウィンドウを閉じる
      handleClose();
    } catch (err) {
      console.error("[TagPopup] Failed to add tag:", err);
      setIsSubmitting(false);
      alert("タグの保存に失敗しました: " + String(err));
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-gray-50 overflow-hidden select-none p-6">
      <div
        className="w-full h-full bg-white rounded-[2rem] shadow-2xl flex flex-col border border-gray-100"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex-1 p-8 flex flex-col justify-center">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-500/30 mx-auto mb-4">
              <span className="text-3xl">🏷️</span>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
              タグを新規作成
            </h3>
          </div>

          <div className="w-full mb-8" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <input
              autoFocus
              type="text"
              value={tagValue}
              onChange={(e) => setTagValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') handleClose();
              }}
              placeholder="新しいタグ名を入力..."
              className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-blue-600 focus:bg-white rounded-2xl text-xl font-bold text-gray-800 placeholder:text-gray-300 focus:outline-none transition-all"
            />
          </div>

          <div className="flex gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 py-5 text-sm font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={isSubmitting || !tagValue.trim()}
              className="flex-[2] py-5 text-sm font-black text-white bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-xl shadow-blue-500/40 transition-all active:scale-95 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none"
            >
              {isSubmitting ? "ADDING..." : "ADD TAG"}
            </button>
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
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
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
      <div
        className="w-full h-full bg-white rounded-[2rem] shadow-2xl flex flex-col border border-gray-100"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex-1 p-8 flex flex-col">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-purple-600 rounded-3xl flex items-center justify-center shadow-xl shadow-purple-500/30 mx-auto mb-4">
              <span className="text-3xl">🌍</span>
            </div>
            <h3 className="text-2xl font-black text-gray-900 tracking-tight">
              タグを選択
            </h3>
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
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className="w-full px-6 py-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all text-left flex items-center gap-4"
                  >
                    <div className="text-2xl">
                      {selectedTags.includes(tag) ? '☑' : '☐'}
                    </div>
                    <span className="text-lg font-bold text-gray-800">{tag}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
            <button
              onClick={handleClose}
              className="flex-1 py-5 text-sm font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="flex-[2] py-5 text-sm font-black text-white bg-purple-600 hover:bg-purple-700 rounded-2xl shadow-xl shadow-purple-500/40 transition-all active:scale-95"
            >
              Apply ({selectedTags.length} selected)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrchestratorContent() {
  const searchParams = useSearchParams();
  const urlPath = searchParams.get('path');



  const [folderPath, setFolderPath] = useState<string>('');
  const [files, setFiles] = useState<NoteMeta[]>([]);
  // プロダクションビルド対応：初期値をtrueにして、チェック完了後にfalseに更新
  const [setupRequired, setSetupRequired] = useState(true);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // State同期 (Single Source of Truth)
  const syncState = useCallback(async () => {
    try {
      const state = await invoke<AppState>('fusen_get_state');
      if (state.folder_path) {
        setFolderPath(state.folder_path);
        // localStorage同期 (念のため)
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
      // Setup check logic (splash screen mode)
      if (isCheckingSetup && !setupRequired) { // "Loading..." phase
        try {
          const { getCurrentWindow, currentMonitor } = await import('@tauri-apps/api/window');
          const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi');
          const win = getCurrentWindow();

          // Only resize/move main window (management screen)
          if (win.label === 'main') {
            // 1. Set Size (Small)
            const splashWidth = 240;
            const splashHeight = 300;
            await win.setSize(new LogicalSize(splashWidth, splashHeight));

            // 2. Calculate Top-Right Position
            const monitor = await currentMonitor();
            if (monitor) {
              const screenWidth = monitor.size.width / monitor.scaleFactor; // Convert to Logical
              // const screenHeight = monitor.size.height / monitor.scaleFactor;

              // Position: Top-Right with 20px padding
              const x = screenWidth - splashWidth - 20;
              const y = 20;
              await win.setPosition(new LogicalPosition(x, y));
            }

            // 3. Show Window (it was hidden safely)
            await win.show();
            await win.setFocus();
          }
        } catch (e) {
          console.error('Failed to init splash', e);
          // Error recovery: show window anyway
          try {
            const { getCurrentWindow } = await import('@tauri-apps/api/window');
            await getCurrentWindow().show();
          } catch { }
        }
      } else if (!isCheckingSetup && folderPath) {
        // Dashboard mode (Setup done, folder selected)
        // Resize back to Dashboard Size (Large)
        try {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          const win = getCurrentWindow();
          if (win.label === 'main') {
            await win.setSize(new (await import('@tauri-apps/api/dpi')).LogicalSize(800, 600));
            await win.center();
            await win.show(); // Ensure visible
          }
        } catch (e) { console.error('Failed to resize dashboard', e); }
      }
    };
    handleResize();
  }, [isCheckingSetup, folderPath, setupRequired]);

  // パス正規化
  const normalizePath = (path: string): string => {
    let normalized = path.trim();
    // Unicode正規化 (NFC) を追加して、濁点などの表記揺れを防ぐ
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
        try {
          await task();
        } finally {
          resolve();
        }
      });

      if (!queue.processing) {
        processQueue();
      }
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
          try {
            await task();
          } catch (e) {
            console.error('[processQueue] Task failed:', e);
          }
          if (queue.queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
      }
    } finally {
      queue.processing = false;
    }
  };

  // ウィンドウ作成中チェック
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

    await enqueueWindowCreation(async () => {
      try {
        if (isWindowInProgress(label)) return;

        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
          await existing.unminimize();
          await existing.setFocus();
          return;
        }

        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();

        for (const win of allWindows) {
          try {
            if (win.label === label) {
              await win.unminimize();
              await win.setFocus();
              return;
            }
          } catch (e) {
            // ignore
          }
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
            url,
            transparent: true,
            decorations: false,
            alwaysOnTop: false,
            visible: true,
            width,
            height,
            x,
            y,
            skipTaskbar: false,
            focus: true, // Explicitly request focus in config
          });

          // Force focus immediately after creation hook
          win.once('tauri://created', async () => {
            console.log(`[openNoteWindow] Window created: ${label}. Forcing focus.`);
            await win.setFocus();
          });

          // Also try immediately just in case
          await win.setFocus();

          await new Promise(resolve => setTimeout(resolve, 100));

        } finally {
          unmarkWindowInProgress(label);
        }

      } catch (e) {
        console.error(`Failed to open window:`, e);
        unmarkWindowInProgress(label);
      }
    });
  };

  // フォルダ選択
  const selectDirectory = async () => {
    try {
      const folder = await invoke<string>('fusen_select_folder');
      if (folder) {
        // Backend側でState更新済みなので、FrontendはFetchするだけ
        await syncState();
      }
    } catch (e) {
      console.error('select_folder failed', e);
    }
  };

  // 新規ノート作成
  const handleCreateNote = async () => {
    const context = 'NewNote';
    if (!folderPath) return; // Guard

    // 1️⃣ 仮ノートをローカルで生成（folderPath 配下に temp_<timestamp>.md）
    const timestamp = Date.now();
    const tempPath = `${folderPath}/temp_${timestamp}.md`;
    const today = new Date().toISOString().slice(0, 10);
    const tempMeta: NoteMeta = {
      path: tempPath,
      seq: timestamp,
      context,
      updated: today,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      backgroundColor: undefined,
      tags: [],
    };

    // UI に即表示し、スピナーを表示
    setFiles(prev => [...prev, tempMeta]);
    setIsCreating(true);

    try {
      // 2️⃣ バックエンドで正式ノート作成
      const newNote = await invoke<any>('fusen_create_note', {
        folderPath: folderPath,
        context,
      });

      // 3️⃣ 仮ノートを正式ノートに置換
      setFiles(prev =>
        prev.map((n: NoteMeta) => (n.path === tempPath ? newNote.meta : n))
      );

      // 4️⃣ 作成されたノートを開く
      await openNoteWindow(newNote.meta.path, undefined, true);
    } catch (e) {
      // 失敗したら仮ノートを削除
      setFiles(prev => prev.filter((n: NoteMeta) => n.path !== tempPath));
      console.error('create_note failed', e);
    } finally {
      setIsCreating(false);
    }
  };



  // ファイル選択
  const handleFileSelect = async (file: NoteMeta) => {
    await openNoteWindow(file.path, {
      x: file.x,
      y: file.y,
      width: file.width,
      height: file.height
    });
  };

  // 初期化フラグ
  const isInitialized = () => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('__INITIALIZED__') === 'true';
  };

  const setInitialized = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('__INITIALIZED__', 'true');
    }
  };

  // イベントリスナー設定 (他ウィンドウからの依頼受取)
  useEffect(() => {
    const unlistenPromise = listen<{ path: string; isNew?: boolean }>('fusen:open_note', (event) => {
      openNoteWindow(event.payload.path, undefined, event.payload.isNew);
    });

    return () => {
      unlistenPromise.then(async (unlisten) => {
        try {
          await unlisten();
        } catch (e) {
          console.warn('Failed to unlisten fusen:open_note', e);
        }
      });
    };
  }, []);

  // タグフィルター: switch_world イベントリスナー（旧・単一選択）
  useEffect(() => {
    const unlistenPromise = listen<string | null>('fusen:switch_world', async (event) => {
      const selectedTag = event.payload;
      console.log('[switch_world] Received:', selectedTag);

      try {
        // State同期して最新のノート一覧を取得
        await syncState();
        const state = await invoke<AppState>('fusen_get_state');
        const allNotes = state.notes;

        // フィルタリング
        const filteredNotes = selectedTag
          ? allNotes.filter(n => n.tags && n.tags.includes(selectedTag))
          : allNotes;

        console.log('[switch_world] All notes:', allNotes.length, 'Filtered:', filteredNotes.length);

        // 現在開いているウィンドウを取得
        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();

        // フィルタ対象のパスをセットにする
        const filteredPaths = new Set(filteredNotes.map(n => getWindowLabel(n.path)));

        // 既存ウィンドウの処理
        for (const win of allWindows) {
          if (win.label === 'main') continue; // 管理画面は除外

          const shouldShow = filteredPaths.has(win.label);
          try {
            if (shouldShow) {
              await win.show();
              await win.unminimize();
            } else {
              await win.hide();
            }
          } catch (e) {
            console.error('[switch_world] Failed to show/hide window:', win.label, e);
          }
        }

        // フィルタ対象で開いていないウィンドウを開く
        const openedLabels = new Set(allWindows.map(w => w.label));
        for (const note of filteredNotes) {
          const label = getWindowLabel(note.path);
          if (!openedLabels.has(label)) {
            await openNoteWindow(note.path, {
              x: note.x,
              y: note.y,
              width: note.width,
              height: note.height
            });
            // 連続で開きすぎないように少し待機
            await new Promise(resolve => setTimeout(resolve, 150));
          }
        }
      } catch (e) {
        console.error('[switch_world] Error:', e);
      }
    });

    return () => {
      unlistenPromise.then(async (unlisten) => {
        try {
          await unlisten();
        } catch (e) {
          console.warn('Failed to unlisten fusen:switch_world', e);
        }
      });
    };
  }, []);

  // タグセレクター開くイベントリスナー
  useEffect(() => {
    const unlistenPromise = listen('fusen:open_tag_selector', async () => {
      try {
        const existing = await WebviewWindow.getByLabel('tag-selector');
        if (existing) {
          await existing.unminimize();
          await existing.setFocus();
          return;
        }

        await new WebviewWindow('tag-selector', {
          url: '/?tagSelector=1',
          title: '世界を選ぶ',
          width: 350,
          height: 500,
          alwaysOnTop: true,
          decorations: true,
          resizable: false,
        });
      } catch (e) {
        console.error('[open_tag_selector] Error:', e);
      }
    });

    return () => {
      unlistenPromise.then(async (unlisten) => {
        try {
          await unlisten();
        } catch (e) {
          console.warn('Failed to unlisten fusen:open_tag_selector', e);
        }
      });
    };
  }, []);

  // タグフィルター適用イベントリスナー（複数選択）
  useEffect(() => {
    const unlistenPromise = listen<string[]>('fusen:apply_tag_filter', async (event) => {
      // ONLY Main window (hidden manager) should handle global filtering
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWin = getCurrentWindow();

      // Ensure only the hidden main window handles orchestration
      if (currentWin.label !== 'main') {
        return;
      }

      const selectedTags = event.payload;
      console.error('[JS_DEBUG] Received Tags:', JSON.stringify(selectedTags));

      try {
        // State同期して最新のノート一覧を取得
        await syncState();
        const state = await invoke<AppState>('fusen_get_state');
        const allNotes = state.notes;

        // 複数タグフィルタリング（OR条件）
        const filteredNotes = selectedTags.length > 0
          ? allNotes.filter(n => n.tags && n.tags.some(tag => selectedTags.includes(tag)))
          : allNotes;

        console.log('[apply_tag_filter] All notes:', allNotes.length, 'Filtered:', filteredNotes.length);

        // 現在開いているウィンドウを取得
        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();

        // フィルタ対象のパスをセットにする
        const filteredPaths = new Set(filteredNotes.map(n => getWindowLabel(n.path)));

        // 既存ウィンドウの処理
        for (const win of allWindows) {
          if (win.label === 'main' || win.label === 'tag-selector') continue; // 管理画面とタグセレクターは除外

          const shouldShow = filteredPaths.has(win.label);

          // Debug Mismatch
          if (!shouldShow) {
            console.error(`[JS_DEBUG] Window '${win.label}' is hiding. Check if this is correct.`);
            const matchedNote = filteredNotes.find(n => getWindowLabel(n.path) === win.label);
            if (matchedNote) {
              console.error(`[JS_DEBUG] CRITICAL: Window '${win.label}' matches note '${matchedNote.path}' but set to hide? Wait, shouldShow is false.`);
            } else {
              console.error(`[JS_DEBUG] Window '${win.label}' does NOT match any filtered note labels. Labels in set:`, Array.from(filteredPaths));
            }
          } else {
            console.error(`[JS_DEBUG] Showing Window '${win.label}'`);
          }

          try {
            if (shouldShow) {
              await win.show();
              await win.unminimize();
            } else {
              await win.hide();
            }
          } catch (e) {
            console.error('[apply_tag_filter] Failed to show/hide window:', win.label, e);
          }
        }

        // フィルタ対象で開いていないウィンドウを開く
        const openedLabels = new Set(allWindows.map(w => w.label));
        for (const note of filteredNotes) {
          try {
            const label = getWindowLabel(note.path);
            if (!openedLabels.has(label)) {
              console.log(`[JS_DEBUG] Force opening Note: ${note.path}`);
              await openNoteWindow(note.path, {
                x: note.x,
                y: note.y,
                width: note.width,
                height: note.height
              });
              // 連続で開きすぎないように少し待機
              await new Promise(resolve => setTimeout(resolve, 150));
            }
          } catch (e) {
            console.error(`[JS_DEBUG] Failed to force open note: ${note.path}`, e);
          }
        }
      } catch (e) {
        console.error('[apply_tag_filter] Error:', e);
      }
    });

    return () => {
      unlistenPromise.then(async (unlisten) => {
        try {
          await unlisten();
        } catch (e) {
          console.warn('Failed to unlisten fusen:apply_tag_filter', e);
        }
      });
    };
  }, []);

  // UC-01: セットアップチェック
  useEffect(() => {
    async function checkSetup() {
      console.log('[Setup Check] Starting...');
      try {
        const basePath = await invoke<string | null>('get_base_path');
        console.log('[Setup Check] basePath:', basePath, 'type:', typeof basePath, 'length:', basePath?.length);

        // より厳密なチェック: null, undefined, 空文字列のいずれもセットアップ必要
        const needsSetup = !basePath || basePath.trim() === '';

        if (needsSetup) {
          // セットアップが必要な場合のみウィンドウを表示
          console.log('[Setup Check] Setup required, showing window...');
          setSetupRequired(true);
          const win = getCurrentWindow();
          console.log('[Setup Check] Window label:', win.label);
          await win.show();
          console.log('[Setup Check] Window shown');
          await win.setFocus();
          console.log('[Setup Check] Window focused');
        } else {
          console.log('[Setup Check] Setup not required, base path exists:', basePath);
          setSetupRequired(false);  // セットアップ不要の場合はfalseに設定
          // セットアップ不要の場合、mainウィンドウを非表示にする（付箋復元時用）
          const win = getCurrentWindow();
          if (win.label === 'main') {
            // 少し待ってから非表示（付箋復元処理に委ねる）
            setTimeout(async () => {
              try {
                await win.hide();
                console.log('[Setup Check] Main window hidden (setup not required)');
              } catch (e) {
                console.error('[Setup Check] Failed to hide window:', e);
              }
            }, 500);
          }
        }
      } catch (e) {
        console.error('Failed to check base_path:', e);
        setSetupRequired(true);
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      } finally {
        setIsCheckingSetup(false);
      }
    }

    // デバッグ：起動時ウィンドウ情報
    const win = getCurrentWindow();
    console.log('[BOOT] label=', win.label, 'pathParam=', !!searchParams.get('path'));

    // pathパラメータが無い場合（管理画面/初回起動ルート）は必ずcheckSetupを実行
    if (!searchParams.get('path')) {
      console.log('[Setup Check] Executing check...');
      checkSetup();
    } else {
      console.log('[Setup Check] Skipping check (sticky note window)');
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
      // UC-01: セットアップが完了していなければ復元をスキップ
      const checkAndRestore = async () => {
        const basePath = await invoke<string | null>('get_base_path');

        // base_pathが未設定の場合は復元しない（セットアップ画面へ）
        if (!basePath) {
          // セットアップが必要な場合は既にウィンドウ表示済み
          return;
        }

        // base_pathが設定されている場合のみ復元処理を実行
        const savedFolder = basePath;

        setTimeout(async () => {
          try {
            // Rust側のStateを初期化するために一度リスト取得を呼ぶ必要がある
            // (fusen_get_state は初期値(default)を返すだけかもしれないため)
            // ただしBackendのfusen_list_notesはStateを更新する仕様に変えました。
            await invoke('fusen_list_notes', { folderPath: savedFolder });

            // Stateを同期
            const state = await invoke<AppState>('fusen_get_state');
            if (state.folder_path) setFolderPath(state.folder_path);
            setFiles(state.notes);

            const notes = state.notes;
            if (notes.length > 0) {
              for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                await openNoteWindow(note.path, {
                  x: note.x,
                  y: note.y,
                  width: note.width,
                  height: note.height
                });
              }

              // 付箋をすべて開いたら、mainウィンドウを非表示にする
              setTimeout(async () => {
                try {
                  console.log('[Restore] Attempting to hide main window...');
                  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
                  const mainWindow = await WebviewWindow.getByLabel('main');
                  if (mainWindow) {
                    console.log('[Restore] Main window found, calling hide()...');
                    await mainWindow.hide();
                    console.log('[Restore] Main window hidden successfully');
                  } else {
                    console.error('[Restore] Main window not found');
                  }
                } catch (e) {
                  console.error('[Restore] Failed to hide main window:', e);
                }
              }, 1000);
            }
          } catch (e) {
            console.error('Failed during restoration:', e);
          }
        }, 800);
      };

      checkAndRestore().catch(e => {
        console.error('Failed to check setup:', e);
      });
    }
  }, []);

  // パラメータチェック
  if (searchParams.get('tagSelector') === '1') {
    return <TagSelector />;
  }

  if (searchParams.get('tagInput') === '1') {
    return <TagInputPopup target={searchParams.get('target') || ''} />;
  }

  if (searchParams.get('path')) {
    return <StickyNote />; // 付箋ウィンドウとして開かれている
  }

  // セットアップチェック中はローディング表示
  if (isCheckingSetup) {
    return <LoadingScreen message="STARTING..." />;
  }

  if (setupRequired) {
    return <SetupScreen onComplete={async () => {
      setSetupRequired(false);
      // セットアップ完了後、State再取得
      await syncState();
      // メインウィンドウを表示
      try {
        const win = getCurrentWindow();
        await win.show();
        await win.setFocus();
      } catch (e) {
        console.error('Failed to show main window:', e);
      }
    }} />;
  }

  // 管理画面
  return (
    <div className="h-screen w-screen flex flex-col relative bg-white overflow-hidden p-8">
      <header className="mb-12">
        <h1 className="text-4xl font-black text-gray-900 tracking-tighter mb-2">俺の付箋</h1>
        <p className="text-gray-400 text-sm">Minimalist Sticky Notes for Obsidian Vault</p>
      </header>
      {!folderPath ? (
        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl">
          <button onClick={selectDirectory} className="px-8 py-4 bg-black text-white rounded-2xl shadow-2xl hover:bg-gray-800 transition-all font-bold text-lg">Vaultフォルダを選択</button>
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
