'use client';

import { useEffect } from 'react';
import { ingestNewDiscordReplies, isDiscordAutoIngestReady } from '@/app/utils/discordReplyIngest';

const CHECK_INTERVAL_MS = 60_000;
const FAILURE_RETRY_MS = 5 * 60_000;

export function useDiscordReplyIngest(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let inFlight = false;
    let nextAttemptAt = 0;
    const check = async () => {
      if (inFlight || Date.now() < nextAttemptAt || !isDiscordAutoIngestReady()) return;
      inFlight = true;
      nextAttemptAt = Date.now() + CHECK_INTERVAL_MS;
      try {
        await ingestNewDiscordReplies();
      } catch (error) {
        nextAttemptAt = Date.now() + FAILURE_RETRY_MS;
        console.warn('[DiscordReplyIngest] Automatic import failed:', error);
      } finally {
        inFlight = false;
      }
    };
    void check();
    const timer = window.setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);
}
