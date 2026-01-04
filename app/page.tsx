'use client';

import { useState, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import { visit, SKIP } from 'unist-util-visit';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { Menu, MenuItem } from '@tauri-apps/api/menu';

// 保存失敗時のトースト用
const showSaveError = () => {
  console.error('Save failed');
};

function splitFrontMatter(src: string) {
  if (!src.startsWith('---')) return { front: '', body: src };
  const end = src.indexOf('\n---', 3);
  if (end === -1) return { front: '', body: src };
  const front = src.slice(0, end + 4);
  const body = src.slice(end + 4).replace(/^\s+/, '');
  return { front, body };
}

function getFileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
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
};

type Note = {
  body: string;
  frontmatter: any;
  meta: NoteMeta;
};

// ==text== を <span class="hl">text</span> に変換
function rehypeInlinePoint() {
  return (tree: any) => {
    visit(tree, 'text', (node: any, index: any, parent: any) => {
      if (!node.value || typeof node.value !== 'string') return;
      const parts = node.value.split(/(==[^=]+==)/g);
      if (parts.length === 1) return;
      const children: any[] = [];
      for (const p of parts) {
        const m = p.match(/^==([^=]+)==$/);
        if (m) {
          children.push({
            type: 'element',
            tagName: 'span',
            properties: { className: ['hl'] },
            children: [{ type: 'text', value: m[1] }],
          });
        } else if (p.length) {
          children.push({ type: 'text', value: p });
        }
      }
      parent.children.splice(index, 1, ...children);
      return [SKIP, index + children.length];
    });
  };
}

function HomeContent() {
  const searchParams = useSearchParams();
  const scrollRef = useState<{ top: number }>({ top: 0 })[0];

  const [folderPath, setFolderPath] = useState<string>('');
  const [files, setFiles] = useState<NoteMeta[]>([]);
  const [selectedFile, setSelectedFile] = useState<NoteMeta | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [savePending, setSavePending] = useState(false);
  const [cursorPosition, setCursorPosition] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rawFrontmatter, setRawFrontmatter] = useState<string>('');
  const [savedSelection, setSavedSelection] = useState<{ text: string } | null>(null);
  const [stickyDismissed, setStickyDismissed] = useState(false); // Added missing state

  // ホバー管理 (JSステートに戻し、windowレベルで監視を強化)
  const [isHover, setIsHover] = useState(false);
  const [isDraggableArea, setIsDraggableArea] = useState(false);
  const [isEditableArea, setIsEditableArea] = useState(false);
  const [isCornerArea, setIsCornerArea] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // マニュアルドラッグの開始
  const handleDragStart = useCallback(async (e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    // 1. インタラクティブな要素上ではドラッグを開始しない
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'A' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'INPUT' ||
      target.closest('button') ||
      target.classList.contains('file-name')
    ) {
      return;
    }

    // 2. テキスト要素上では選択を優先するためドラッグを開始しない
    if (target.closest('p, h1, h2, h3, li, span, strong, em, code, pre')) {
      return;
    }

    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error('startDragging failed', err);
    }
  }, []);

  // 「鉄壁」のホバー消去ロジック
  useEffect(() => {
    const handleGlobalPointer = (e: PointerEvent) => {
      if (!shellRef.current) return;
      const rect = shellRef.current.getBoundingClientRect();

      // マウス座標による境界判定 (0.5px 程度のマージンを持たせる)
      const isInside = (
        e.clientX >= rect.left + 0.5 &&
        e.clientX <= rect.right - 0.5 &&
        e.clientY >= rect.top + 0.5 &&
        e.clientY <= rect.bottom - 0.5
      );

      if (!isInside && isHover) {
        setIsHover(false);
        setIsDraggableArea(false);
        setIsEditableArea(false);
        setIsCornerArea(false);
      } else if (isInside) {
        const target = e.target as HTMLElement;
        const textElement = target.closest('p, h1, h2, h3, li, span, strong, em, code, pre');
        const interactive = target.closest('button, textarea, input, .file-name');

        // コーナー判定 (四隅 15px 以内 - 斜め矢印が出るエリア)
        const gap = 15;
        const nearLeft = e.clientX < rect.left + gap;
        const nearRight = e.clientX > rect.right - gap;
        const nearTop = e.clientY < rect.top + gap;
        const nearBottom = e.clientY > rect.bottom - gap;
        const isCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
        setIsCornerArea(isCorner);

        if (interactive) {
          setIsDraggableArea(false);
          setIsEditableArea(false);
        } else if (textElement) {
          setIsDraggableArea(false);
          setIsEditableArea(true);
        } else {
          setIsDraggableArea(true);
          setIsEditableArea(false);
        }
      }
    };

    const handleReset = () => {
      setIsHover(false);
      setIsDraggableArea(false);
      setIsEditableArea(false);
      setIsCornerArea(false);
    };

    window.addEventListener('pointermove', handleGlobalPointer);
    window.addEventListener('pointerleave', handleReset);
    window.addEventListener('blur', handleReset);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointer);
      window.removeEventListener('pointerleave', handleReset);
      window.removeEventListener('blur', handleReset);
    };
  }, [isHover]);

  useEffect(() => {
    // 常にチェック
    // 以前のバグで汚染された localStorage をクリーンアップ
    localStorage.removeItem('stickyDismissed');

    const dismissed = sessionStorage.getItem('stickyDismissed') === '1';
    if (dismissed) setStickyDismissed(true);
  }, []); // 初回のみ実行で十分

  // セッション管理ヘルパー
  const updateSession = (action: 'add' | 'remove', path: string) => {
    try {
      const stored = localStorage.getItem('sticky_session');
      let session: string[] = stored ? JSON.parse(stored) : [];

      if (action === 'add') {
        if (!session.includes(path)) {
          session.push(path);
        }
      } else {
        session = session.filter(p => p !== path);
      }
      localStorage.setItem('sticky_session', JSON.stringify(session));
    } catch (e) {
      console.error('Session update failed', e);
    }
  };

  // パスから完全に一意（Deterministic）なウィンドウラベルを生成
  // 同じパスなら必ず同じラベルになることを保証
  const normalizePath = (path: string): string => {
    // 【徹底的な正規化】
    // 1. 前後の空白を削除
    let normalized = path.trim();

    // 2. 全てのバックスラッシュをスラッシュに変換
    normalized = normalized.replace(/\\/g, '/');

    // 3. 全体を小文字化（Windowsはパスの大文字小文字を区別しない）
    normalized = normalized.toLowerCase();

    // 4. 連続するスラッシュを一つに統一
    normalized = normalized.replace(/\/+/g, '/');

    // 5. 末尾のスラッシュを削除
    normalized = normalized.replace(/\/$/, '');

    return normalized;
  };

  const getWindowLabel = (path: string) => {
    // シンプルなハッシュ関数（決定的）
    const simpleHash = (str: string): string => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      return Math.abs(hash).toString(36);
    };

    // パスを徹底的に正規化
    const normalizedPath = normalizePath(path);
    const hash = simpleHash(normalizedPath);

    console.log(`[LABEL] Original: ${path}`);
    console.log(`[LABEL] Normalized: ${normalizedPath}`);
    console.log(`[LABEL] Hash: ${hash}`);

    // Tauriのラベル制限に準拠: 英数字とハイフンのみ
    return `note-${hash}`;
  };

  // 【グローバル復元フラグ】
  // useRefではなくwindowグローバルで管理し、復元処理が二度と走らないようにする
  if (typeof window !== 'undefined' && (window as any).__HAS_RESTORED__ === undefined) {
    (window as any).__HAS_RESTORED__ = false;
  }

  // 【グローバル・シングルゲート・キュー】
  // 1度に1つしかウィンドウを作成しない完全直列化システム
  if (typeof window !== 'undefined' && !(window as any).__WINDOW_QUEUE__) {
    (window as any).__WINDOW_QUEUE__ = {
      queue: [] as Array<() => Promise<void>>,
      processing: false,
      inProgress: new Set<string>(), // 作成中のラベルを追跡
    };
  }

  // キューに追加して順番に実行
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

      // キューの処理を開始（既に処理中でなければ）
      if (!queue.processing) {
        processQueue();
      }
    });
  };

  const processQueue = async () => {
    const queue = (window as any).__WINDOW_QUEUE__;

    if (queue.processing) {
      console.log('[QUEUE] Already processing, skipping...');
      return;
    }

    queue.processing = true;
    console.log('[QUEUE] 🚀 Starting queue processing...');

    while (queue.queue.length > 0) {
      const task = queue.queue.shift();
      if (task) {
        console.log(`[QUEUE] 📝 Processing task (${queue.queue.length} remaining)...`);
        await task();
        console.log('[QUEUE] ✅ Task completed');

        // 次のタスクまで少し待機（OSが安定するまで）
        if (queue.queue.length > 0) {
          console.log('[QUEUE] ⏳ Waiting 300ms before next task...');
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
    }

    queue.processing = false;
    console.log('[QUEUE] 🏁 Queue processing complete');
  };

  // ラベルが作成中かチェック
  const isWindowInProgress = (label: string): boolean => {
    const queue = (window as any).__WINDOW_QUEUE__;
    return queue.inProgress.has(label);
  };

  // 作成中リストに追加
  const markWindowInProgress = (label: string): void => {
    const queue = (window as any).__WINDOW_QUEUE__;
    queue.inProgress.add(label);
    console.log(`[QUEUE] 🔒 Marked ${label} as in-progress`);
  };

  // 作成中リストから削除
  const unmarkWindowInProgress = (label: string): void => {
    const queue = (window as any).__WINDOW_QUEUE__;
    queue.inProgress.delete(label);
    console.log(`[QUEUE] 🔓 Unmarked ${label} from in-progress`);
  };


  // 【完全直列化されたウィンドウオープン処理】
  // キューを通して1つずつ確実に作成
  const openNoteWindow = async (path: string, meta?: { x?: number, y?: number, width?: number, height?: number }) => {
    const normalizedPath = normalizePath(path);
    const label = getWindowLabel(path);

    console.log(`[OPEN] ========================================`);
    console.log(`[OPEN] Request to open window`);
    console.log(`[OPEN] Original path: ${path}`);
    console.log(`[OPEN] Normalized path: ${normalizedPath}`);
    console.log(`[OPEN] Label: ${label}`);

    // キューに追加して順番待ち
    await enqueueWindowCreation(async () => {
      try {
        // 【チェック1】作成中リストで確認
        if (isWindowInProgress(label)) {
          console.log(`[OPEN] ❌ Window ${label} is already being created. BLOCKING.`);
          return;
        }

        // 【チェック2】getByLabelで既存ウィンドウを確認
        const existing = await WebviewWindow.getByLabel(label);
        if (existing) {
          console.log(`[OPEN] ❌ Window ${label} already exists (found by getByLabel). BLOCKING.`);
          await existing.unminimize();
          await existing.setFocus();
          return;
        }

        // 【チェック3】物理的な全ウィンドウチェック
        const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
        const allWindows = await getAllWebviewWindows();

        console.log(`[OPEN] Physical check: Found ${allWindows.length} total windows`);

        for (const win of allWindows) {
          try {
            if (win.label === label) {
              console.log(`[OPEN] ❌ Window ${label} found by physical check. BLOCKING.`);
              await win.unminimize();
              await win.setFocus();
              return;
            }
          } catch (e) {
            // ラベル取得失敗は無視
          }
        }

        // 全チェック通過 - 作成開始
        console.log(`[OPEN] ✅ All checks passed. Creating window for ${label}`);

        // 作成中フラグを立てる
        markWindowInProgress(label);

        try {
          const pathParam = encodeURIComponent(path);
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
            visible: true,  // 付箋は必ず表示
            width,
            height,
            x,
            y,
            skipTaskbar: false,
          });

          console.log(`[OPEN] ✅ Successfully created window ${label}`);

          // ウィンドウが完全に作成されるまで待機
          await new Promise(resolve => setTimeout(resolve, 100));

        } finally {
          // 必ず作成中フラグを解除
          unmarkWindowInProgress(label);
        }

        console.log(`[OPEN] ========================================`);

      } catch (e) {
        console.error(`[OPEN] ❌ Failed to open window ${label}:`, e);
        unmarkWindowInProgress(label);
      }
    });
  };

  // 【完全シングルトン初期化フラグ】
  // sessionStorage を使用してページリロード時に確実にリセット
  const isInitialized = () => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('__INITIALIZED__') === 'true';
  };

  const setInitialized = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('__INITIALIZED__', 'true');
    }
  };

  useEffect(() => {
    // 【物理的シングルトンガード】
    // この関数が複数回呼ばれても、処理は絶対に1回だけ実行される

    // 0. 最優先チェック: 既に初期化済みなら即座に終了
    if (isInitialized()) {
      console.log('[SINGLETON] Already initialized. Skipping.');
      return;
    }

    // 1. URLパラメータチェック: 付箋ウィンドウなら復元不要
    if (typeof window !== 'undefined' && window.location.search.includes('path=')) {
      console.log('[SINGLETON] Skipping: Window has path parameter.');
      return;
    }

    // 2. ラベルチェック: mainウィンドウ以外は復元不要
    const win = getCurrentWindow();
    if (win.label !== 'main') {
      console.log('[SINGLETON] Skipping: Not main window.');
      return;
    }

    // 3. フラグを即座に立てる（これ以降、絶対に再実行されない）
    setInitialized();
    console.log('[SINGLETON] 🔒 Initialization flag set. This will run ONLY ONCE.');

    // ここから下は一生に一度だけ実行される
    console.log('[SINGLETON] Initializing only once...');

    if (!searchParams.get('path')) {
      const savedFolder = localStorage.getItem('lastFolder');
      console.log('[DEBUG] localStorage.lastFolder:', savedFolder);

      // 【初回起動チェック】ベースフォルダが未設定の場合
      if (!savedFolder || savedFolder.trim() === '') {
        console.log('[FIRST_RUN] No base folder set. Showing main window for folder selection...');

        // メインウィンドウを表示してフォルダ選択を促す
        setTimeout(async () => {
          try {
            const win = getCurrentWindow();
            await win.show();
            await win.setFocus();

            console.log('[FIRST_RUN] Main window shown. Waiting for folder selection...');
            // フォルダ選択はUIのボタンから行う
            // selectDirectory() が呼ばれると lastFolder が設定される
          } catch (e) {
            console.error('[FIRST_RUN] Failed to show window:', e);
          }
        }, 500);

        return; // フォルダが選択されるまで復元処理は行わない
      }

      // ベースフォルダが設定されている場合は通常の復元処理
      if (savedFolder && savedFolder.trim() !== '') {
        console.log(`[RESTORE] 📂 Attempting to restore folder: ${savedFolder}`);
        setFolderPath(savedFolder); // UIステートも更新

        setTimeout(async () => {
          try {
            console.log(`[RESTORE] 📂 Calling list_notes for: ${savedFolder}`);
            const notes = await invoke<NoteMeta[]>('list_notes', { folderPath: savedFolder });
            setFiles(notes); // 取得したノート一覧をステートにセット

            console.log(`[RESTORE] ========================================`);
            console.log(`[RESTORE] Found ${notes.length} notes:`, notes.map(n => n.path));
            console.log(`[RESTORE] ========================================`);

            if (notes.length > 0) {
              // 各ノートを順番に開く
              const totalCount = notes.length;
              for (let i = 0; i < notes.length; i++) {
                const note = notes[i];
                console.log(`[RESTORE] 📝 Queueing ${i + 1}/${totalCount}: ${note.path}`);

                // キューに追加
                await openNoteWindow(note.path, {
                  x: note.x,
                  y: note.y,
                  width: note.width,
                  height: note.height
                });
              }

              if (typeof window !== 'undefined') {
                (window as any).__HAS_RESTORED__ = true;
                console.log(`[RESTORE] ✅ All ${totalCount} notes restored`);
              }
            } else {
              console.log('[RESTORE] ℹ️ No notes found in this folder.');
              if (typeof window !== 'undefined') {
                (window as any).__HAS_RESTORED__ = true;
              }
            }

          } catch (e) {
            console.error('[RESTORE] ❌ Failed during list_notes or restoration:', e);
          }
        }, 800);
      } else {
        console.log('[RESTORE] ℹ️ Saved folder path is empty.');
      }
    }
  }, []); // 依存配列を空にして、初回マウント時のみ実行

  // Frontmatterの指定キーの値を更新するヘルパー
  const updateFrontmatterValue = (front: string, key: string, value: string | number) => {
    // 柔軟なキー判定 (width/w, height/h に対応)
    let pattern = key;
    if (key === 'width') pattern = '(?:width|w)';
    else if (key === 'height') pattern = '(?:height|h)';

    const regex = new RegExp(`(${pattern}:\\s*)(.*)`);
    if (regex.test(front)) {
      // 既存のキーがあれば、その形式（w: か width: かに関わらず）を維持して値を更新
      return front.replace(regex, `$1${value}`);
    } else {
      // なければ新規追加
      const lastFence = front.lastIndexOf('---');
      if (lastFence > 0) {
        return front.slice(0, lastFence) + `${key}: ${value}\n` + front.slice(lastFence);
      }
      // Frontmatterがない、または壊れている場合は新規作成
      if (!front || front.trim() === '') {
        return `---\n${key}: ${value}\n---\n`;
      }
      return front + `\n---\n${key}: ${value}\n---\n`;
    }
  };

  const updateFrontmatterGeometry = (front: string, geom: { x?: number, y?: number, width?: number, height?: number }) => {
    let newFront = front;
    if (geom.x !== undefined) newFront = updateFrontmatterValue(newFront, 'x', Math.round(geom.x));
    if (geom.y !== undefined) newFront = updateFrontmatterValue(newFront, 'y', Math.round(geom.y));
    if (geom.width !== undefined) newFront = updateFrontmatterValue(newFront, 'width', Math.round(geom.width));
    if (geom.height !== undefined) newFront = updateFrontmatterValue(newFront, 'height', Math.round(geom.height));
    return newFront;
  };

  // ウィンドウ位置・サイズの保存ヘルパー - Frontmatterを更新して保存
  const saveWindowState = useCallback(async () => {
    if (!selectedFile) return;
    try {
      const win = getCurrentWindow();
      const factor = await win.scaleFactor();
      const physPos = await win.outerPosition();
      const physSize = await win.innerSize();

      // Physical -> Logical 変換 (Tauriのコンストラクタは論理ピクセルを期待するため)
      const x = Math.round(physPos.x / factor);
      const y = Math.round(physPos.y / factor);
      const width = Math.round(physSize.width / factor);
      const height = Math.round(physSize.height / factor);

      setRawFrontmatter(prev => {
        const updated = updateFrontmatterGeometry(prev, { x, y, width, height });
        console.log(`[GEOMETRY] Saved (Logical): x=${x}, y=${y}, w=${width}, h=${height} (Factor: ${factor})`);
        return updated;
      });
      setSavePending(true);
    } catch (e) {
      console.error('Failed to save window state', e);
    }
  }, [selectedFile]);

  // イベントリスナー設定 (移動・リサイズ時に保存)
  useEffect(() => {
    if (!selectedFile) return;

    let unlistenMove: (() => void) | undefined;
    let unlistenResize: (() => void) | undefined;
    let moveTimer: NodeJS.Timeout;
    let resizeTimer: NodeJS.Timeout;

    const setupListeners = async () => {
      const win = getCurrentWindow();

      // Move Listener
      unlistenMove = await win.listen('tauri://move', () => {
        clearTimeout(moveTimer);
        moveTimer = setTimeout(() => {
          saveWindowState();
        }, 800); // 頻繁な書き込みを避けるため長めのdebounce
      });

      // Resize Listener
      unlistenResize = await win.listen('tauri://resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          saveWindowState();
        }, 800);
      });
    };

    setupListeners();

    return () => {
      if (unlistenMove) unlistenMove();
      if (unlistenResize) unlistenResize();
      clearTimeout(moveTimer);
      clearTimeout(resizeTimer);
    };
  }, [selectedFile, saveWindowState]);

  const loadNotes = useCallback(async (path: string) => {
    try {
      console.log('[LOAD_NOTES] Calling list_notes for:', path);
      const notes = await invoke<NoteMeta[]>('list_notes', { folderPath: path });
      setFiles(notes);
      return notes;
    } catch (e) {
      console.error('list_notes failed', e);
      return [];
    }
  }, []);

  const saveNote = useCallback(async (path: string, body: string, frontmatter: string) => {
    try {
      const newPath = await invoke<string>('save_note', { path, body, frontmatterRaw: frontmatter });
      // パスが変わった場合（リネーム発生）、ステートを更新する
      if (newPath !== path) {
        console.log('File renamed during save:', path, '->', newPath);

        // 1. Files一覧の更新（簡易的に）
        setFiles(prev => prev.map(f => f.path === path ? { ...f, path: newPath, updated: new Date().toISOString().split('T')[0] } : f));

        // 2. 選択中ファイルの更新
        setSelectedFile(prev => prev ? { ...prev, path: newPath } : null);

        // 3. ローカルストレージ更新
        localStorage.setItem('lastSelectedFilePath', newPath);

        // 4. URLの更新 (replaceStateで履歴を汚さずに)
        const url = new URL(window.location.href);
        url.searchParams.set('path', newPath);
        window.history.replaceState({}, '', url.toString());
      }
    } catch (e) {
      console.error('save_note failed', e);
    }
  }, []);

  useEffect(() => {
    // 自動保存ロジック
    if (!selectedFile || !savePending) return;
    const timer = setTimeout(async () => {
      try {
        await saveNote(selectedFile.path, editBody, rawFrontmatter);
        setContent(editBody);
        setSavePending(false);
      } catch (e) {
        showSaveError();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [editBody, selectedFile, rawFrontmatter, saveNote, savePending]);

  const loadFileContent = async (noteMeta: NoteMeta) => {
    setLoading(true);
    try {
      const note = await invoke<Note>('read_note', { path: noteMeta.path });
      const { front, body } = splitFrontMatter(note.body);
      setRawFrontmatter(front);
      setContent(body);
      setEditBody(body);
      setIsEditing(false);
      localStorage.setItem('lastSelectedFilePath', noteMeta.path);
    } catch (error) {
      console.error('read_note failed', error);
      setContent('');
    } finally {
      setLoading(false);
    }
  };

  const captureSelection = useCallback(() => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? "";
    if (text.trim().length === 0) return;
    setSavedSelection({ text });
  }, []);

  const togglePoint = useCallback(async () => {
    const text = savedSelection?.text?.trim();
    if (!text || !selectedFile || !content) return;
    let newBody = content;
    const wrapped = `<span class="hl">${text}</span>`;
    const oldWrapped = `==${text}==`;
    if (newBody.includes(wrapped)) {
      newBody = newBody.replace(wrapped, text);
    } else if (newBody.includes(oldWrapped)) {
      newBody = newBody.replace(oldWrapped, text);
    } else if (newBody.includes(text)) {
      newBody = newBody.replace(text, wrapped);
    } else {
      return;
    }
    await saveNote(selectedFile.path, newBody, rawFrontmatter);
    setContent(newBody);
    setSavedSelection(null);
  }, [savedSelection, content, rawFrontmatter, selectedFile, saveNote]);

  // 【付箋ウィンドウ専用: コンテンツ読み込み】
  // URLパラメータの path を見て、自分自身のコンテンツをロードする
  useEffect(() => {
    const urlPath = searchParams.get('path');
    if (!urlPath) return;

    console.log('[STICKY_LOAD] Detected path parameter:', urlPath);

    // 1. folderPath があればセット（コンテキストメニュー用）
    const savedFolder = localStorage.getItem('lastFolder');
    if (savedFolder) setFolderPath(savedFolder);

    // 2. 自分自身の NoteMeta を作成してセット
    const myNote: NoteMeta = {
      path: urlPath,
      seq: 0,
      context: getFileName(urlPath),
      updated: '',
    };
    setSelectedFile(myNote);

    // 3. コンテンツをロード
    loadFileContent(myNote);

    console.log('[STICKY_LOAD] Content loading triggered for:', urlPath);
  }, [searchParams]); // pathパラメータが変わったら再ロード

  const selectDirectory = useCallback(async () => {
    try {
      const path = await invoke<string | null>('select_folder');
      if (path) {
        setFolderPath(path);
        localStorage.setItem('lastFolder', path);
        console.log('[DEBUG] Saved to localStorage.lastFolder:', path);

        console.log('[FOLDER_SELECTED] Base folder set:', path);
        console.log('[FOLDER_SELECTED] Loading notes and creating sticky windows...');

        // フォルダ内の .md ファイルを取得
        const notes = await invoke<NoteMeta[]>('list_notes', { folderPath: path });
        setFiles(notes);

        console.log(`[FOLDER_SELECTED] Found ${notes.length} notes`);

        if (notes.length > 0) {
          // メインウィンドウを非表示に戻す
          try {
            const win = getCurrentWindow();
            await win.hide();
          } catch (e) {
            console.error('[FOLDER_SELECTED] Failed to hide main window:', e);
          }

          // 付箋を作成
          for (let i = 0; i < notes.length; i++) {
            const note = notes[i];
            console.log(`[FOLDER_SELECTED] Creating sticky note ${i + 1}/${notes.length}: ${note.path}`);

            await openNoteWindow(note.path, {
              x: note.x,
              y: note.y,
              width: note.width,
              height: note.height
            });
          }

          console.log('[FOLDER_SELECTED] All sticky notes created');
        } else {
          console.log('[FOLDER_SELECTED] No notes found in folder');
        }
      }
    } catch (error) {
      console.error('select_folder failed', error);
    }
  }, [openNoteWindow]);

  const handleCreateNote = async () => {
    let targetPath = folderPath;
    // ブラウザのpromptは使わず、デフォルト値で作成
    const context = '新規ノート';
    try {
      const newNote = await invoke<Note>('create_note', { folderPath: targetPath, context });

      // 統一されたウィンドウオープン処理を使用
      if (typeof window !== 'undefined') {
        await openNoteWindow(newNote.meta.path);
        // セッションに追加
        updateSession('add', newNote.meta.path);
      }

      await loadNotes(targetPath);
    } catch (e) {
      console.error('create_note failed', e);
      alert('Debug Error: ' + e);
    }
  };

  const handleCopyFileName = async () => {
    if (!selectedFile) return;
    const fileName = getFileName(selectedFile.path);
    try {
      await navigator.clipboard.writeText(fileName);
      console.log('Copied:', fileName);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  const [isConfirmingDismiss, setIsConfirmingDismiss] = useState(false);

  const handleDismiss = useCallback(async () => {
    if (!selectedFile) return;
    setIsConfirmingDismiss(true); // カスタム確認画面を表示
  }, [selectedFile]);

  const executeDismiss = async () => {
    if (!selectedFile) return;
    try {
      await invoke('move_to_trash', { path: selectedFile.path });
      // RestoreViewなどは表示せず、単に閉じる
      const win = getCurrentWindow();
      await win.close();
    } catch (e) {
      alert('削除失敗: ' + e);
      setIsConfirmingDismiss(false);
    }
  };

  const handleFileSelect = async (noteMeta: NoteMeta) => {
    setSelectedFile(noteMeta);
    await loadFileContent(noteMeta);
  };

  const handleEditStart = (position?: number) => {
    const scrollContainer = document.querySelector('.notePaper');
    if (scrollContainer) {
      scrollRef.top = scrollContainer.scrollTop;
    }
    setEditBody(content);
    setCursorPosition(position ?? null);
    setIsEditing(true);
  };

  useEffect(() => {
    const scrollContainer = document.querySelector('.notePaper');
    if (scrollContainer) {
      scrollContainer.scrollTop = scrollRef.top;
    }
    // カーソル位置を設定（autoFocusとの競合を避けるため少し遅延）
    if (isEditing && textareaRef.current) {
      setTimeout(() => {
        if (textareaRef.current) {
          const pos = cursorPosition ?? textareaRef.current.value.length;
          textareaRef.current.selectionStart = pos;
          textareaRef.current.selectionEnd = pos;
          textareaRef.current.focus();
        }
      }, 10);
    }
  }, [isEditing, scrollRef, cursorPosition]);

  const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditBody(e.target.value);
    setSavePending(true);
  };

  const handleEditBlur = useCallback(() => {
    if (savePending && selectedFile) {
      saveNote(selectedFile.path, editBody, rawFrontmatter);
      setContent(editBody);
      setSavePending(false);
    }
    setIsEditing(false);
  }, [savePending, selectedFile, editBody, rawFrontmatter, saveNote]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      if (selectedFile) {
        saveNote(selectedFile.path, editBody, rawFrontmatter);
        setContent(editBody);
        setSavePending(false);
      }
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleContextMenu = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    captureSelection();

    // フォルダパスを取得
    function getDirPath(path: string) {
      return path.replace(/[\\/][^\\/]*$/, '');
    }

    // ... existing code ...

    // ネイティブメニューの構築
    const menu = await Menu.new({
      items: [
        await MenuItem.new({
          text: selectedFile ? `📄 ${getFileName(selectedFile.path)}` : 'No File',
          action: () => handleCopyFileName(),
          enabled: !!selectedFile,
        }),
        await MenuItem.new({
          text: selectedFile ? `📂 ${getDirPath(selectedFile.path)}` : 'No Folder',
          action: async () => {
            if (selectedFile) {
              const dir = getDirPath(selectedFile.path);
              await navigator.clipboard.writeText(dir);
              console.log('Copied dir:', dir);
            }
          },
          enabled: !!selectedFile,
        }),
        await MenuItem.new({
          text: `🏠 Base: ${folderPath || '未選択'}`,
          action: async () => {
            if (folderPath) {
              await navigator.clipboard.writeText(folderPath);
              console.log('Copied base dir:', folderPath);
            }
          },
          enabled: !!folderPath,
        }),
        await MenuItem.new({
          text: '---------------',
          enabled: false,
        }),
        await MenuItem.new({
          text: '🔴 強調',
          action: () => togglePoint(),
        }),
        await MenuItem.new({
          text: '✨ 新規: まっさらな付箋',
          action: () => handleCreateNote(),
        }),
        await MenuItem.new({
          text: '📂 新規: 既存ファイルから',
          action: async () => {
            try {
              const path = await invoke<string | null>('select_file', { defaultPath: folderPath });
              if (path && typeof window !== 'undefined') {
                // 統一されたウィンドウオープン処理を使用
                await openNoteWindow(path);
              }
            } catch (e) {
              console.error('select_file failed', e);
              alert('File open failed: ' + e);
            }
          },
        }),
        await MenuItem.new({
          text: '📁 フォルダ選択',
          action: () => selectDirectory(),
        }),
        await MenuItem.new({
          text: '🗑 はがす',
          action: () => handleDismiss(),
        }),
        await MenuItem.new({
          text: 'キャンセル',
          action: () => { },
        }),
      ],
    });

    await menu.popup();
  }, [captureSelection, togglePoint, handleCreateNote, selectDirectory, handleDismiss, selectedFile, handleCopyFileName]);

  const handleDoubleClick = useCallback(async () => {
    if (!shellRef.current) return;

    // リサイズ機能（余白部分のみ）
    const rect = shellRef.current.getBoundingClientRect();
    const scrollHeight = shellRef.current.scrollHeight;
    try {
      await getCurrentWindow().setSize(new LogicalSize(rect.width, scrollHeight + 4));
    } catch (err) {
      console.error('Failed to resize window:', err);
    }
  }, []);

  // ホバーバーコンポーネント
  const HoverBar = ({ show }: { show: boolean }) => (
    <div
      className="hoverBar"
      style={{
        opacity: show ? 1 : 0,
        visibility: show ? 'visible' : 'hidden',
        pointerEvents: show ? 'auto' : 'none',
        transition: 'opacity 0.1s ease',
        minWidth: (isDraggableArea || isEditableArea) ? '60px' : 'auto',
        justifyContent: 'center'
      }}
    >
      {isDraggableArea && (
        <span className="status-indicator text-blue-500">移動可</span>
      )}
      {isEditableArea && (
        <span className="status-indicator text-orange-600">編集可</span>
      )}
      {isCornerArea && (
        <span className="status-indicator text-gray-500 font-bold bg-white/40 rounded px-1">📏サイズ連動</span>
      )}
    </div>
  );


  // はがした後の「再表示」UI
  // はがした後の「再表示」UI
  const RestoreView = () => (
    <div className="sticky-restore-view p-4 bg-gray-100 h-full flex flex-col justify-center items-center text-center" onPointerDown={handleDragStart}>
      <p className="text-sm text-gray-600 mb-4 font-bold">
        はがした後はTrashフォルダに保存されています。<br />
        再度表示するにはTrashフォルダを選択してください。
      </p>
      <button
        onClick={() => {
          setStickyDismissed(false);
          sessionStorage.removeItem('stickyDismissed');
        }}
        className="text-xs bg-white border border-gray-300 px-3 py-1 rounded hover:bg-gray-50"
      >
        閉じる（再表示ではない）
      </button>
    </div>
  );

  // Custom Confirmation Overlay
  const ConfirmOverlay = () => {
    if (!isConfirmingDismiss) return null;
    return (
      <div className="absolute inset-0 bg-yellow-100/95 z-50 flex flex-col items-center justify-center p-4 text-center backdrop-blur-sm animate-in fade-in duration-200">
        <p className="mb-6 text-gray-800 font-bold text-base leading-relaxed">この付箋をはがしますか？</p>
        <div className="flex gap-3 w-full justify-center">
          <button
            onClick={executeDismiss}
            className="flex-1 max-w-[100px] py-2 bg-red-500 text-white rounded-lg font-bold shadow-md hover:bg-red-600 active:scale-95 transition-all text-sm"
          >
            OK
          </button>
          <button
            onClick={() => setIsConfirmingDismiss(false)}
            className="flex-1 max-w-[100px] py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-bold shadow-sm hover:bg-gray-50 active:scale-95 transition-all text-sm"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  };

  const getSelectionOffset = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;

    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();

    // 記事のルート要素を見つける
    const article = document.querySelector('.notePaper article');
    if (!article) return null;

    preCaretRange.selectNodeContents(article);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return preCaretRange.toString().length;
  };

  // stickyモードと通常モードを統合 - 常に同じUIを表示

  // 管理画面（リスト）
  if (!folderPath || !selectedFile) {
    return (
      <div
        ref={shellRef}
        className="h-screen w-screen flex flex-col relative bg-white overflow-hidden p-8"
        onPointerDown={handleDragStart}
        onContextMenu={handleContextMenu}
      >
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

  // はがした状態の表示
  if (stickyDismissed) {
    return <RestoreView />;
  }

  // ノート表示（通常モード）
  return (
    <div
      ref={shellRef}
      className="noteShell"
      onPointerDown={handleDragStart}
      onContextMenu={handleContextMenu}
    >
      <ConfirmOverlay />
      <HoverBar show={isHover} />

      <main
        className="flex-1 overflow-y-auto h-full w-full notePaper"
        onMouseUp={captureSelection}
        onKeyUp={captureSelection}
        onDoubleClick={(e) => {
          // 余白部分をダブルクリックした場合のみリサイズ
          if (e.target === e.currentTarget) {
            handleDoubleClick();
            e.stopPropagation();
          }
        }}
        onClick={(e) => {
          // ダブルクリックのイベントバブルを防ぐため、ここでは何もしないか、
          // 明示的に編集終了したい場合のみ処理する
          if (e.target === e.currentTarget && isEditing) {
            setIsEditing(false);
          }
        }}
      >
        {loading ? (
          <div className="text-center text-gray-300 py-8 text-xs font-mono opacity-30">Loading...</div>
        ) : isEditing ? (
          <textarea
            className="sticky-paper-editor notePaper block w-full resize-none overflow-hidden"
            value={editBody}
            onChange={(e) => {
              handleEditChange(e);
              // 自動リサイズ
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleEditBlur}
            placeholder="内容を入力..."
            ref={(el) => {
              // @ts-ignore
              textareaRef.current = el;
              if (el) {
                // 初回マウント時と更新時に高さを合わせる
                requestAnimationFrame(() => {
                  el.style.height = 'auto';
                  el.style.height = el.style.minHeight = el.scrollHeight + 'px';
                });
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <article
            className="notePaper prose prose-slate max-w-none prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5"
            onDoubleClick={(e) => {
              // テキスト上でのダブルクリック
              e.stopPropagation();
              const offset = getSelectionOffset();
              handleEditStart(offset ?? undefined);
            }}
          >
            {content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeRaw, rehypeInlinePoint]}>
                {content}
              </ReactMarkdown>
            ) : (
              <div className="text-xs opacity-20">No content (click to edit)</div>
            )}
          </article>
        )}
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
