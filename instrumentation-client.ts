import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://33337a8a57c2fd7460c6ee207027415c@o4511028066516992.ingest.us.sentry.io/4511028072611840',

  // package.json 由来のアプリバージョンをSentryのリリースとして記録
  release: `ore-no-fusen@${process.env.NEXT_PUBLIC_APP_VERSION}`,

  // エラーの詳細度（本番は低め）
  tracesSampleRate: 0,

  // 開発環境では送信しない
  enabled: process.env.NODE_ENV === 'production',

  // デバッグログ無効
  debug: false,

  // 個人情報を自動収集しない
  sendDefaultPii: false,

  // 付箋の本文・ファイルパスなど個人情報をレポートから除外
  beforeSend(event) {
    // console ログのパンくずには付箋本文が混入しうるため除外する。
    // 一方 fetch/xhr/navigation のパンくず（URL・遷移のみ＝本文を含まない）は残す。
    // → 「Unexpected token '<'」のようにスタックが無いエラーでも、
    //    直前にどのファイルを取りに行って失敗したかを追えるようにするため。
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.filter((b) => b.category !== 'console');
    }

    // requestボディがあれば削除
    if (event.request?.data) {
      delete event.request.data;
    }

    const exception = event.exception?.values?.[0];
    const isLegacyVercelInsightsSyntaxError =
      exception?.type === 'SyntaxError' &&
      exception.value?.includes("Unexpected token '<'") &&
      exception.stacktrace?.frames?.some((frame) => frame.filename?.includes('_vercel/insights'));

    if (isLegacyVercelInsightsSyntaxError) {
      return null;
    }

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
