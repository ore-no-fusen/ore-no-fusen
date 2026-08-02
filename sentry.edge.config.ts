import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: 'https://33337a8a57c2fd7460c6ee207027415c@o4511028066516992.ingest.us.sentry.io/4511028072611840',
  release: `ore-no-fusen@${process.env.NEXT_PUBLIC_APP_VERSION}`,
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.data;
      delete event.request.headers;
      delete event.request.query_string;
    }
    return event;
  },
});
