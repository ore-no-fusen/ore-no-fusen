import { Page } from '@playwright/test';

/**
 * Tauri APIをモックする関数 (Shared)
 * 
 * 各テストファイルでこの関数を呼び出すことで、
 * TauriのIPC通信やウィンドウ操作をシミュレートできます。
 */
export async function mockTauriAPI(page: Page) {
    await page.addInitScript(() => {
        // --- IPC Handler Definition ---
        const handleIpc = (cmd: string, args: any) => {
            console.log('[Mock Tauri] IPC:', cmd, args);

            // コマンド別レスポンス定義
            switch (cmd) {
                // ノート読み込み
                case 'fusen_read_note':
                    return {
                        body: `---
seq: 1
context: テストノート
backgroundColor: #f7e9b0
x: 100
y: 100
width: 400
height: 300
updated: 2026-01-31
---

- [ ] タスク1
- [x] タスク2
これはテスト本文です。`,
                        frontmatter: '',
                        meta: { path: args.path || 'C:/test/note.md', seq: 1, context: 'テスト', updated: '2026-01-31' }
                    };

                // ノート保存
                case 'fusen_save_note':
                    return args.path;

                // 新規ノート作成
                case 'fusen_create_note':
                    const newPath = `${args.folderPath || 'C:/test'}/note_${Date.now()}.md`;
                    return {
                        meta: {
                            path: newPath,
                            seq: Date.now(),
                            context: args.context || 'New Note',
                            updated: new Date().toISOString().slice(0, 10),
                            x: 150,
                            y: 150,
                            width: 400,
                            height: 300,
                            tags: []
                        },
                        content: ''
                    };

                // ノート削除
                case 'fusen_delete_note':
                    console.log('[Mock Tauri] Deleted:', args.path);
                    return null;

                // 設定読み込み (Release Test用)
                case 'fusen_load_config':
                case 'get_settings':
                    return {
                        theme: 'system',
                        font_size: 16,
                        auto_save: true,
                        language: 'ja'
                    };

                // 設定保存
                case 'fusen_save_config':
                    return null;

                // タグ一覧取得
                case 'fusen_get_all_tags':
                    return ['タグ1', 'タグ2', '重要'];

                // 検索 (Release Test用)
                case 'fusen_search_notes':
                    // キーワードが含まれているか適当に判定して返す
                    if (args.query && 'テスト'.includes(args.query)) {
                        return [
                            { path: 'C:/test/note.md', content: 'これはテスト本文です', modified: Date.now() }
                        ];
                    }
                    return [];

                // アーカイブ (Release Test用)
                case 'fusen_archive_note':
                    console.log('[Mock Tauri] Archived:', args.path);
                    return args.path;

                case 'get_base_path':
                    return 'C:/test';

                case 'fusen_open_containing_folder':
                    return null;

                case 'fusen_debug_log':
                    return null;

                // Tauri v2 Event Plugin Support
                case 'plugin:event|listen':
                    // args contains { event, handler }
                    const { event, handler } = args;
                    console.log(`[Mock Tauri] IPC Listen: ${event}, handlerID: ${handler}`);
                    if (!listeners.has(event)) listeners.set(event, []);

                    // The handler comes as a number (callback ID).
                    // Tauri v2 invokes window[`_${handler}`](payload).
                    listeners.get(event)!.push((e: any) => {
                        const callbackName = `_${handler}`;
                        const cb = (window as any)[callbackName];
                        if (typeof cb === 'function') {
                            cb(e);
                        } else {
                            console.warn(`[Mock Tauri] Callback ${callbackName} not found for event ${event}`);
                        }
                    });

                    return Math.floor(Math.random() * 10000);

                case 'plugin:event|unlisten':
                    return;

                // Tauri v2 Window Plugin Support
                case 'plugin:window|center':
                case 'plugin:window|set_focus':
                case 'plugin:window|set_size':
                case 'plugin:window|set_always_on_top':
                case 'plugin:window|show':
                case 'plugin:window|hide':
                case 'plugin:window|close':
                case 'plugin:window|unminimize':
                    console.log(`[Mock Tauri] Window Command: ${cmd}`);
                    return null;

                default:
                    console.warn('[Mock Tauri] Unhandled command:', cmd);
                    return 0;
            }
        };

        // --- Tauri Internals Mocking ---

        // Tauri v2 / IPC モック
        (window as any).__TAURI_IPC__ = async (message: any) => {
            return handleIpc(message.cmd, message);
        };

        // 再帰的なモック生成プロキシ (API構造を動的に模倣)
        const createRecursiveMock = (path: string = ''): any => {
            return new Proxy(() => Promise.resolve(), {
                get: (_target, prop) => {
                    if (prop === 'then') return undefined; // Promise安全性
                    if (prop === 'toJSON') return () => ({}); // JSON化対応

                    if (typeof prop === 'string') {
                        // 特定のAPIメソッドへの対応
                        if (path === '' && prop === 'invoke') return (cmd: string, args: any) => Promise.resolve(handleIpc(cmd, args));

                        // ログ出ししつつ深掘り
                        // console.log(`[Mock Tauri] Access: ${path ? path + '.' : ''}${prop}`);
                        return createRecursiveMock(`${path ? path + '.' : ''}${prop}`);
                    }
                    return createRecursiveMock();
                },
                apply: (_target, _thisArg, args) => {
                    // console.log(`[Mock Tauri] Call: ${path}`, args);
                    return Promise.resolve();
                }
            });
        };

        // Tauri Internals Mocking
        const internalsMock = createRecursiveMock();

        // [FIX] transformCallback must return a UID, not a Promise.
        (internalsMock as any).transformCallback = (callback: Function, once: boolean) => {
            const identifier = Math.floor(Math.random() * 1000000); // Random UID
            const callbackName = `_${identifier}`;

            (window as any)[callbackName] = (response: any) => {
                callback(response);
                if (once) {
                    delete (window as any)[callbackName];
                }
            };

            return identifier;
        };

        (window as any).__TAURI_INTERNALS__ = internalsMock;

        // window.__TAURI__ の構築
        const tauriProxy = createRecursiveMock();

        // --- Event Bus Mechanism ---
        const listeners = new Map<string, Function[]>();

        // Testからイベントを発火するためのヘルパー
        (window as any).__MOCK_EMIT__ = (event: string, payload: any) => {
            console.log(`[Mock Tauri] Manually emitting event: ${event}`, payload);
            const handlers = listeners.get(event) || [];
            handlers.forEach(h => h({ payload }));
        };

        // Window Mock
        const currentWindowMock = {
            label: 'main', // Default to main for release test flow
            listen: (event: string, handler: Function) => {
                // Window-specific listen (often mapped to global in simplified mocks, but let's separate if needed)
                // For now, treat window listen as global for simplicity or ignore
                return Promise.resolve(() => { });
            },
            onCloseRequested: (handler: Function) => Promise.resolve(() => { }), // page.tsx uses this
            emit: () => Promise.resolve(),
            innerSize: () => Promise.resolve({ width: 400, height: 300 }),
            outerPosition: () => Promise.resolve({ x: 100, y: 100 }),
            scaleFactor: () => Promise.resolve(1),
            startDragging: () => Promise.resolve(),
            show: () => Promise.resolve(),
            hide: () => Promise.resolve(),
            close: () => Promise.resolve(),
            setFocus: () => Promise.resolve(),
            unminimize: () => Promise.resolve(),
            setAlwaysOnTop: () => Promise.resolve(),
            setSize: () => Promise.resolve(),
            center: () => Promise.resolve(),
        };

        // 具体的なモジュール割り当て
        Object.assign(tauriProxy, {
            window: {
                getCurrentWindow: () => currentWindowMock,
                getAll: () => [currentWindowMock],
                WebviewWindow: {
                    getByLabel: () => Promise.resolve(null), // 検索ウィンドウ等はnull開始
                },
            },
            core: {
                invoke: (cmd: string, args: any) => Promise.resolve(handleIpc(cmd, args))
            },
            event: {
                listen: (event: string, handler: Function) => {
                    console.log(`[Mock Tauri] Registered listener for: ${event}`);
                    if (!listeners.has(event)) listeners.set(event, []);
                    listeners.get(event)!.push(handler);
                    return Promise.resolve(() => {
                        // Unlisten logic (simplified)
                        const list = listeners.get(event) || [];
                        const idx = list.indexOf(handler);
                        if (idx > -1) list.splice(idx, 1);
                    });
                },
                emit: (event: string, payload: any) => {
                    // Emit to listeners
                    const handlers = listeners.get(event) || [];
                    handlers.forEach(h => h({ payload }));
                    return Promise.resolve();
                },
            },
        });

        (window as any).__TAURI__ = tauriProxy;
    });
}
