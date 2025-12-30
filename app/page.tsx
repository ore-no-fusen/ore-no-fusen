'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

// File System Access API の型は types/filesystem.d.ts で定義

function HomeContent() {
  const searchParams = useSearchParams();
  const stickyMode = searchParams.get('sticky') === '1';

  const [stickyDismissed, setStickyDismissed] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  const [ctxPos, setCtxPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (stickyMode) {
      const dismissed = localStorage.getItem('stickyDismissed') === '1';
      if (dismissed) setStickyDismissed(true);
    }
  }, [stickyMode]);

  // コンテキストメニュー制御
  useEffect(() => {
    if (!ctxOpen) return;
    const handleClick = () => setCtxOpen(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxOpen(false);
    };
    window.addEventListener('mousedown', handleClick); // clickだとcontextmenuと競合することがあるのでmousedown推奨
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [ctxOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxPos({ x: e.clientX, y: e.clientY });
    setCtxOpen(true);
  };

  const handleDismiss = () => {
    if (confirm('この付箋をはがしますか？\n（次回から表示されなくなりますが、URLを開けば再表示できます）')) {
      localStorage.setItem('stickyDismissed', '1');
      setStickyDismissed(true);
      setCtxOpen(false);
      try {
        window.close();
      } catch (e) {
        console.log('window.close() failed', e);
      }
    }
  };

  const handleRestore = () => {
    localStorage.removeItem('stickyDismissed');
    setStickyDismissed(false);
  };

  const mdPlugins = [remarkGfm, remarkBreaks];

  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [files, setFiles] = useState<FileSystemFileHandle[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileSystemFileHandle | null>(null);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const findFileByName = useCallback(async (fileName: string) => {
    if (!directoryHandle) return;

    try {
      const fileHandles: FileSystemFileHandle[] = [];
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          fileHandles.push(entry as FileSystemFileHandle);
          if (entry.name === fileName) {
            setSelectedFile(entry as FileSystemFileHandle);
            await loadFileContent(entry as FileSystemFileHandle);
          }
        }
      }
    } catch (error) {
      console.error('ファイル検索エラー:', error);
    }
  }, [directoryHandle]);

  // localStorageから最後に選択したファイル名を復元
  useEffect(() => {
    const savedFileName = localStorage.getItem('lastSelectedFile');
    if (savedFileName && directoryHandle) {
      // ディレクトリハンドルが設定されたら、保存されたファイル名でファイルを探す
      findFileByName(savedFileName);
    }
  }, [directoryHandle, findFileByName]);

  const selectDirectory = async () => {
    try {
      // File System Access APIでディレクトリを選択
      const handle = await window.showDirectoryPicker();
      setDirectoryHandle(handle);

      // .mdファイルを取得
      const fileHandles: FileSystemFileHandle[] = [];
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.md')) {
          fileHandles.push(entry as FileSystemFileHandle);
        }
      }

      setFiles(fileHandles.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('ディレクトリ選択エラー:', error);
        alert('ディレクトリの選択に失敗しました。');
      }
    }
  };

  const loadFileContent = async (fileHandle: FileSystemFileHandle) => {
    setLoading(true);
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      setContent(text);

      // localStorageに保存
      localStorage.setItem('lastSelectedFile', fileHandle.name);
    } catch (error) {
      console.error('ファイル読み込みエラー:', error);
      alert('ファイルの読み込みに失敗しました。');
      setContent('');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (fileHandle: FileSystemFileHandle) => {
    setSelectedFile(fileHandle);
    await loadFileContent(fileHandle);
  };

  const handleReload = async () => {
    if (selectedFile) {
      await loadFileContent(selectedFile);
    }
  };

  // 付箋モード：メモ表示のみ（ただしフォルダ選択だけはできるようにする）
  if (stickyMode) {
    if (stickyDismissed) {
      return (
        <div className="sticky-root sticky-restore-view">
          <p>付箋ははがされました</p>
          <button onClick={handleRestore} className="sticky-restore-btn">
            もう一度表示する
          </button>
        </div>
      );
    }

    return (
      <div className="sticky-root" onContextMenu={handleContextMenu}>
        {/* コンテキストメニュー */}
        {ctxOpen && (
          <div
            className="sticky-context"
            style={{ top: ctxPos.y, left: ctxPos.x }}
            onMouseDown={(e) => e.stopPropagation()} // メニュー内クリックで閉じないように
          >
            <button onClick={handleDismiss} className="danger">
              🗑 はがす（非表示にする）
            </button>
            <button onClick={() => setCtxOpen(false)}>
              キャンセル
            </button>
          </div>
        )}

        {/* 付箋用の最小バー（邪魔にならない） */}
        <div className="sticky-mini-bar">
          <button onClick={selectDirectory} className="sticky-mini-btn">
            📁 フォルダ選択
          </button>
          <button
            onClick={handleReload}
            className="sticky-mini-btn"
            disabled={!selectedFile || loading}
            title={!selectedFile ? "先にファイルを選んでね" : "再読み込み"}
          >
            ↻
          </button>
          <span className="sticky-mini-info">
            {selectedFile ? selectedFile.name : "未選択"}
          </span>
        </div>

        <div className="sticky-paper">
          {loading ? (
            <div className="sticky-empty">読み込み中...</div>
          ) : content ? (
            <article className="sticky-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  h1: ({ children }) => <div className="sticky-title"><strong>{children}</strong></div>,
                  h2: ({ children }) => <div className="sticky-title"><strong>{children}</strong></div>,
                  h3: ({ children }) => <div className="sticky-title"><strong>{children}</strong></div>,
                  h4: ({ children }) => <div className="sticky-title"><strong>{children}</strong></div>,
                  p: ({ children }) => {
                    const arr = Array.isArray(children) ? children : [children];
                    const onlyStrong =
                      arr.length === 1 &&
                      typeof arr[0] === "object" &&
                      (arr[0] as any)?.type === "strong";
                    if (onlyStrong) return <div className="sticky-title">{children}</div>;
                    return <p>{children}</p>;
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </article>

          ) : (
            <div className="sticky-empty">
              付箋に表示するメモがない。上の「📁 フォルダ選択」→ファイル選択してね。
            </div>
          )}
        </div>
      </div>
    );
  }


  // 通常モード：既存レイアウト
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">俺の付箋</h1>
        <div className="flex gap-2">
          <button
            onClick={selectDirectory}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Vaultフォルダを選択
          </button>
          {selectedFile && (
            <button
              onClick={handleReload}
              disabled={loading}
              className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              再読み込み
            </button>
          )}
        </div>
      </header>

      {/* メインコンテンツ */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左側：ファイル一覧 */}
        <aside className="w-64 bg-white border-r border-gray-200 overflow-y-auto">
          {files.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm text-center">
              フォルダを選択してください
            </div>
          ) : (
            <ul className="p-2">
              {files.map((file, index) => (
                <li key={index}>
                  <button
                    onClick={() => handleFileSelect(file)}
                    className={`w-full text-left px-3 py-2 rounded-lg mb-1 transition-colors ${selectedFile?.name === file.name
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                      }`}
                  >
                    {file.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* 右側：付箋表示 */}
        <main className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center text-gray-500 py-8">読み込み中...</div>
          ) : content ? (
            <div className="max-w-4xl mx-auto">
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <article className="prose prose-slate max-w-none prose-headings:mt-6 prose-headings:mb-4 prose-p:my-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-1">
                  <ReactMarkdown remarkPlugins={mdPlugins}>
                    {content}
                  </ReactMarkdown>
                </article>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              ファイルを選択してください
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center">読み込み中...</div>}>
      <HomeContent />
    </Suspense>
  );
}

