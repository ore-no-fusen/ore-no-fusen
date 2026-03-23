import webpush from 'web-push';

/**
 * VAPID 鍵をセットアップする（環境変数から読む）
 * VAPID_PUBLIC_KEY または VAPID_PRIVATE_KEY が未設定なら Error をスロー
 */
export function initVapid(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:ore-no-fusen@example.com';

  if (!publicKey || !privateKey) {
    throw new Error('VAPID_NOT_CONFIGURED');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
}

/**
 * Push Subscription に対して Web Push を送信する
 * subscription は { endpoint, keys: { p256dh, auth } } 形式
 * 内部で initVapid() を呼び出す
 */
export async function sendNoteToIphone(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  note: { title: string; body: string }
): Promise<void> {
  initVapid();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      JSON.stringify({ title: note.title, body: note.body })
    );
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
      throw new Error('SUBSCRIPTION_EXPIRED');
    }
    throw err;
  }
}
