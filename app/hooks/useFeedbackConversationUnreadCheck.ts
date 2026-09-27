"use client";

import { useEffect } from "react";
import {
  getFeedbackConversationIdentity,
  hasUnreadDeveloperReply,
  markDeveloperReplyNotified,
  markDailyFeedbackUnreadCheck,
  markFeedbackUnreadAttempt,
  pollFeedbackConversationMessages,
  setFeedbackConversationUnreadState,
  shouldNotifyDeveloperReply,
  shouldRunActiveFeedbackUnreadCheck,
  shouldRunDailyFeedbackUnreadCheck,
} from "@/app/utils/feedbackConversation";

const CHECK_INTERVAL_MS = 60 * 1000;

async function showDeveloperReplyNotice(messageId: string, count: number) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const label = `developer-reply-notice-${messageId}`;
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.setFocus();
  } else {
    new WebviewWindow(label, {
      url: `/announcement-notice?${new URLSearchParams({ kind: 'reply', count: String(count) })}`,
      title: '開発者から返信が届きました',
      width: 400, height: 240,
      resizable: false, decorations: true, alwaysOnTop: true,
    });
  }
}

export function useFeedbackConversationUnreadCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const runIfDue = async () => {
      if (cancelled) return;
      const dailyDue = shouldRunDailyFeedbackUnreadCheck();
      const activeDue = shouldRunActiveFeedbackUnreadCheck();
      if (!dailyDue && !activeDue) return;

      const identity = getFeedbackConversationIdentity();
      if (!identity) return;

      if (dailyDue) markDailyFeedbackUnreadCheck();
      markFeedbackUnreadAttempt();
      try {
        const messages = await pollFeedbackConversationMessages(identity);
        if (!cancelled) {
          setFeedbackConversationUnreadState(hasUnreadDeveloperReply(messages));
          const unread = messages.filter(message => message.authorType === 'developer' && !message.readByUser);
          const newest = unread.at(-1);
          if (newest && shouldNotifyDeveloperReply(newest.messageId)) {
            await showDeveloperReplyNotice(newest.messageId, unread.length);
            markDeveloperReplyNotified(newest.messageId);
          }
        }
      } catch (error) {
        console.warn("[FeedbackConversation] Unread check failed:", error);
      }
    };

    runIfDue();
    const timer = window.setInterval(runIfDue, CHECK_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);
}
