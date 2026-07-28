"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isEnglish = typeof navigator !== 'undefined' && !navigator.language.startsWith('ja');
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
          <h2>{isEnglish ? 'An error occurred' : 'エラーが発生しました'}</h2>
          <button onClick={reset}>{isEnglish ? 'Try again' : '再試行'}</button>
        </div>
      </body>
    </html>
  );
}
