'use client';

import { downloadFromDrive, uploadWithAutoRefresh } from '../lib/drive';
import { urlBase64ToUint8Array } from '../lib/auth';
import { nowJST } from '../utils';

// ---------------------------------------------------------------------------
// usePushSubscribe（フックではなく純粋なユーティリティ関数）
// Push 通知購読をセットアップして Drive に保存する
// ---------------------------------------------------------------------------

type SubscribeOptions = {
  accessToken: string;
  setIsLoading: (v: boolean) => void;
  setErrorMessage: (msg: string | null) => void;
  setStep: (step: 'login' | 'write') => void;
};

/**
 * 責務: Push 通知の許可取得・購読・デバイス登録・Drive への保存を行う
 * 入力: SubscribeOptions（accessToken, setIsLoading, setErrorMessage, setStep）
 * 出力: Promise<void>
 * 副作用: Notification 権限リクエスト、ServiceWorker 購読、localStorage 書き込み（viewer_device_id, viewer_push_done）、Drive 読み書き（push_devices.json）
 */
export async function subscribePush({
  accessToken,
  setIsLoading,
  setErrorMessage,
  setStep,
}: SubscribeOptions): Promise<void> {
  try {
    setIsLoading(true);
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      setErrorMessage('通知を許可してください');
      setIsLoading(false);
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const existingSub = await reg.pushManager.getSubscription();
    if (existingSub) await existingSub.unsubscribe();

    const vapidKey = urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!);
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey.buffer.slice(
        vapidKey.byteOffset,
        vapidKey.byteOffset + vapidKey.byteLength
      ) as ArrayBuffer,
    });
    const subJson = sub.toJSON();
    const endpoint = subJson?.endpoint as string;
    const keys = subJson?.keys;

    // デバイスIDを生成・永続化（このデバイスを一意に識別するため）
    let deviceId = localStorage.getItem('viewer_device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('viewer_device_id', deviceId);
    }

    // 既存デバイスリストを取得してupsert（新スキーマ対応、旧スキーマは自動移行）
    const existing = await downloadFromDrive(accessToken, 'push_devices.json').catch(() => ({}));
    const existingDevices: any[] = existing?.devices ?? (
      // 旧スキーマ（endpoint直下）があれば移行する
      existing?.endpoint
        ? [{ device_id: 'legacy', endpoint: existing.endpoint, keys: existing.keys, registered_at: nowJST() }]
        : []
    );
    const updatedDevices = [
      ...existingDevices.filter((d: any) => d.device_id !== deviceId),
      { device_id: deviceId, endpoint, keys, registered_at: nowJST() },
    ];
    await uploadWithAutoRefresh(accessToken, 'push_devices.json', { devices: updatedDevices });

    localStorage.setItem('viewer_push_done', 'true');
    setStep('write');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === 'session expired') {
      localStorage.removeItem('viewer_access_token');
      localStorage.removeItem('viewer_refresh_token');
      setErrorMessage('セッションが切れました。再度ログインしてください。');
      setStep('login');
    } else {
      setErrorMessage('通知設定に失敗しました: ' + msg);
    }
  } finally {
    setIsLoading(false);
  }
}
