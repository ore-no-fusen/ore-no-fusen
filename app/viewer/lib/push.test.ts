import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { subscribePush } from './push';

/**
 * subscribePush の動作確認
 *
 * 検証ポイント:
 * - 進捗が 1/4 → 2/4 → 3/4 → 4/4 と順番に流れること
 * - 各段階でタイムアウトすると「無限待ち」にならずエラーで止まること
 * - 通知拒否（permission != granted）でも早期に止まり、isLoading が false に戻ること
 * - 成功時は setStep('write') へ遷移し、進捗が null（クリア）になること
 * - 例外時にも isLoading が必ず false になり、進捗もクリアされること
 */

// --- ヘルパ ---

const FAKE_VAPID_PUBLIC_KEY = 'BNbxGYNMhEIi9zrneh7mqV4oUanjVjpmgGCBJWFk5sUiVF4O' +
                              '3M6QkPzpe7HNPnHGNh6JDx_PRYYxJK6HKxLBcXg'; // 65byte 相当のダミー

// fetch モック（drive.ts / auth.ts 経由で叩かれる）
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Notification モック
const mockRequestPermission = vi.fn();
class MockNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = mockRequestPermission;
}
vi.stubGlobal('Notification', MockNotification);

// pushManager / serviceWorker モック制御変数（テストごとに上書き）
let mockSubscribeImpl: () => Promise<any> = async () => ({
  toJSON: () => ({
    endpoint: 'https://web.push.apple.com/fake-endpoint',
    keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
  }),
});

const mockServiceWorkerReady = Promise.resolve({
  pushManager: {
    getSubscription: vi.fn(async () => null),
    subscribe: vi.fn((..._args: any[]) => mockSubscribeImpl()),
  },
} as any);

Object.defineProperty(globalThis, 'navigator', {
  value: {
    ...globalThis.navigator,
    serviceWorker: { ready: mockServiceWorkerReady },
    userAgent: 'iPhone test',
  },
  writable: true,
  configurable: true,
});

// drive.ts と auth.ts は経由するだけなのでまとめてモック
vi.mock('../lib/drive', () => ({
  downloadFromDrive: vi.fn(async () => ({ devices: [] })),
  downloadWithAutoRefresh: vi.fn(async (_token: string, name: string) => {
    if (name === 'push_keys.json') {
      return { public_key_b64url: FAKE_VAPID_PUBLIC_KEY };
    }
    return {};
  }),
  uploadWithAutoRefresh: vi.fn(async () => undefined),
}));

vi.mock('../lib/auth', () => ({
  urlBase64ToUint8Array: vi.fn(() => new Uint8Array(65)),
}));

vi.mock('../utils', async () => {
  const actual: any = await vi.importActual('../utils');
  return {
    ...actual,
    createId: () => 'test-device-id',
    nowJST: () => '2026-05-31T12:00:00+09:00',
  };
});

// --- 共通 fixture ---

type Spies = {
  setIsLoading: ReturnType<typeof vi.fn<(v: boolean) => void>>;
  setErrorMessage: ReturnType<typeof vi.fn<(msg: string | null) => void>>;
  setStep: ReturnType<typeof vi.fn<(step: 'login' | 'write') => void>>;
  setProgress: ReturnType<typeof vi.fn<(progress: string | null) => void>>;
};

function makeSpies(): Spies {
  return {
    setIsLoading: vi.fn<(v: boolean) => void>(),
    setErrorMessage: vi.fn<(msg: string | null) => void>(),
    setStep: vi.fn<(step: 'login' | 'write') => void>(),
    setProgress: vi.fn<(progress: string | null) => void>(),
  };
}

describe('subscribePush', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRequestPermission.mockReset();
    localStorage.clear();
    // デフォルトのモック動作に戻す
    mockSubscribeImpl = async () => ({
      toJSON: () => ({
        endpoint: 'https://web.push.apple.com/fake-endpoint',
        keys: { p256dh: 'fake-p256dh', auth: 'fake-auth' },
      }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('正常系: 4段階の進捗を順番に通り、setStep("write") に遷移する', async () => {
    mockRequestPermission.mockResolvedValue('granted');
    const spies = makeSpies();

    await subscribePush({
      accessToken: 'test-token',
      ...spies,
    });

    // setProgress 呼び出し履歴
    const progressCalls = spies.setProgress.mock.calls.map((args) => args[0]);
    expect(progressCalls.filter((m) => m && m.startsWith('1/4'))).toHaveLength(1);
    expect(progressCalls.filter((m) => m && m.startsWith('2/4'))).toHaveLength(1);
    expect(progressCalls.filter((m) => m && m.startsWith('3/4'))).toHaveLength(1);
    expect(progressCalls.filter((m) => m && m.startsWith('4/4'))).toHaveLength(1);
    // 最後に null でクリアされる
    expect(progressCalls[progressCalls.length - 1]).toBeNull();

    // 進捗の順番が 1→2→3→4 になっている
    const stages = progressCalls.filter((m): m is string => !!m).map((m) => m.charAt(0));
    expect(stages).toEqual(['1', '2', '3', '4']);

    expect(spies.setStep).toHaveBeenCalledWith('write');
    expect(spies.setErrorMessage).not.toHaveBeenCalled();
    // isLoading の最終呼び出しは false
    const loadingCalls = spies.setIsLoading.mock.calls.map((args) => args[0]);
    expect(loadingCalls[0]).toBe(true);
    expect(loadingCalls[loadingCalls.length - 1]).toBe(false);
  });

  it('通知拒否: setErrorMessage に「通知を許可してください」、setStep は呼ばれない', async () => {
    mockRequestPermission.mockResolvedValue('denied');
    const spies = makeSpies();

    await subscribePush({
      accessToken: 'test-token',
      ...spies,
    });

    expect(spies.setErrorMessage).toHaveBeenCalledWith('通知を許可してください');
    expect(spies.setStep).not.toHaveBeenCalled();
    // isLoading は最終的に false
    const loadingCalls = spies.setIsLoading.mock.calls.map((args) => args[0]);
    expect(loadingCalls[loadingCalls.length - 1]).toBe(false);
    // 進捗はクリアされる
    const lastProgress = spies.setProgress.mock.calls[spies.setProgress.mock.calls.length - 1]?.[0];
    expect(lastProgress).toBeNull();
  });

  it('3/4 購読登録で永遠に返ってこない → タイムアウトで止まる（無限待ちにならない）', async () => {
    mockRequestPermission.mockResolvedValue('granted');
    // 購読が絶対に解決しないようにする
    mockSubscribeImpl = () => new Promise(() => { /* never resolves */ });
    const spies = makeSpies();

    vi.useFakeTimers();
    const subscribePromise = subscribePush({
      accessToken: 'test-token',
      ...spies,
    });

    // 30 秒 + バッファ進める
    await vi.advanceTimersByTimeAsync(31_000);
    await subscribePromise;

    expect(spies.setStep).not.toHaveBeenCalled();
    expect(spies.setErrorMessage).toHaveBeenCalled();
    const errMsg = spies.setErrorMessage.mock.calls[0][0];
    expect(errMsg).toContain('3/4');
    expect(errMsg).toContain('時間がかかりすぎています');
    // 必ず isLoading が false に戻る
    const loadingCalls = spies.setIsLoading.mock.calls.map((args) => args[0]);
    expect(loadingCalls[loadingCalls.length - 1]).toBe(false);
    // 進捗もクリアされる
    const lastProgress = spies.setProgress.mock.calls[spies.setProgress.mock.calls.length - 1]?.[0];
    expect(lastProgress).toBeNull();
  });

  it('例外時: isLoading が必ず false に戻り、進捗もクリアされる', async () => {
    mockRequestPermission.mockResolvedValue('granted');
    mockSubscribeImpl = async () => { throw new Error('boom'); };
    const spies = makeSpies();

    await subscribePush({
      accessToken: 'test-token',
      ...spies,
    });

    const loadingCalls = spies.setIsLoading.mock.calls.map((args) => args[0]);
    expect(loadingCalls[loadingCalls.length - 1]).toBe(false);
    const lastProgress = spies.setProgress.mock.calls[spies.setProgress.mock.calls.length - 1]?.[0];
    expect(lastProgress).toBeNull();
    expect(spies.setErrorMessage).toHaveBeenCalled();
  });

  it('セッション切れ: setStep("login") に戻り、トークンを localStorage から消す', async () => {
    mockRequestPermission.mockResolvedValue('granted');
    mockSubscribeImpl = async () => { throw new Error('session expired'); };
    localStorage.setItem('viewer_access_token', 'old-token');
    localStorage.setItem('viewer_refresh_token', 'old-refresh');

    const spies = makeSpies();

    await subscribePush({
      accessToken: 'test-token',
      ...spies,
    });

    expect(localStorage.getItem('viewer_access_token')).toBeNull();
    expect(localStorage.getItem('viewer_refresh_token')).toBeNull();
    expect(spies.setStep).toHaveBeenCalledWith('login');
  });

  it('setProgress 未指定でも動く（後方互換）', async () => {
    mockRequestPermission.mockResolvedValue('granted');
    const setIsLoading = vi.fn();
    const setErrorMessage = vi.fn();
    const setStep = vi.fn();

    await subscribePush({
      accessToken: 'test-token',
      setIsLoading,
      setErrorMessage,
      setStep,
    });

    expect(setStep).toHaveBeenCalledWith('write');
  });
});
