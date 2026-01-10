'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import StickyNote from './components/StickyNote';
import SetupScreen from './components/SetupScreen';

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
};

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function OrchestratorContent() {
  const searchParams = useSearchParams();
  const urlPath = searchParams.get('path');

  // AppState型定義
  type AppState = {
    folder_path: string | null;
    notes: NoteMeta[];
    selected_path: string | null;
  };

  const [folderPath, setFolderPath] = useState<string>('');
  const [files, setFiles] = useState<NoteMeta[]>([]);
  // プロダクションビルド対応：初期値をtrueにして、チェック完了後にfalseに更新
  const [setupRequired, setSetupRequired] = useState(true);
  const [isCheckingSetup, setIsCheckingSetup] = useState(true);

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

  // パス正規化
  const normalizePath = (path: string): string => {
    let normalized = path.trim();
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

    while (queue.queue.length > 0) {
      const task = queue.queue.shift();
      if (task) {
        await task();
        if (queue.queue.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }

    queue.processing = false;
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
  const openNoteWindow = async (path: string, meta?: { x?: number, y?: number, width?: number, height?: number }) => {
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
          const url = `/?path=${pathParam}`;

          const width = meta?.width || 320;
          const height = meta?.height || 220;
          const x = meta?.x;
          const y = meta?.y;

          await new WebviewWindow(label, {
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
          });

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
    try {
      if (!folderPath) return; // Guard
      const newNote = await invoke<any>('fusen_create_note', { folderPath: folderPath, context });

      // State再取得
      await syncState();

      // 作成されたノートを開く
      await openNoteWindow(newNote.meta.path);
    } catch (e) {
      console.error('create_note failed', e);
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
    const unlistenPromise = listen<{ path: string }>('fusen:open_note', (event) => {
      openNoteWindow(event.payload.path);
    });

    return () => {
      unlistenPromise.then(unlisten => unlisten());
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
  if (searchParams.get('path')) {
    return <StickyNote />; // 付箋ウィンドウとして開かれている
  }

  // セットアップチェック中はローディング表示（静的HTML対策）
  if (isCheckingSetup) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-4">俺の付箋</div>
          <div className="text-gray-400">起動中...</div>
        </div>
      </div>
    );
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
    <Suspense fallback={
      <div className="h-screen w-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900 mb-4">俺の付箋</div>
          <div className="text-gray-400">読み込み中...</div>
        </div>
      </div>
    }>
      <OrchestratorContent />
    </Suspense>
  );
}
