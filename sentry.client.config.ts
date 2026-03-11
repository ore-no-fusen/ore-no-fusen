import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://33337a8a57c2fd7460c6ee207027415c@o4511028066516992.ingest.us.sentry.io/4511028072611840',

  // エラーの詳細度（本番は低め）
  tracesSampleRate: 0,

  // デバッグログ無効
  debug: false,

  // 個人情報を自動収集しない
  sendDefaultPii: false,

  // 付箋の本文・ファイルパスなど個人情報をレポートから除外
  beforeSend(event) {
    // パンくずリストから付箋内容が混入しないよう本文系データを削除
    // consoleログのパンくずは付箋内容が混入する可能性があるため削除
    delete event.breadcrumbs;

    // requestボディがあれば削除
    if (event.request?.data) {
      delete event.request.data;
    }

    return event;
  },
});
