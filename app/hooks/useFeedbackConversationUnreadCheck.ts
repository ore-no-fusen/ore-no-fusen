"use client";

import { useEffect } from "react";
import {
  getFeedbackConversationIdentity,
  hasUnreadDeveloperReply,
  markDailyFeedbackUnreadCheck,
  pollFeedbackConversationMessages,
  setFeedbackConversationUnreadState,
  shouldRunDailyFeedbackUnreadCheck,
} from "@/app/utils/feedbackConversation";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export function useFeedbackConversationUnreadCheck(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const runIfDue = async () => {
      if (cancelled || !shouldRunDailyFeedbackUnreadCheck()) return;

      const identity = getFeedbackConversationIdentity();
      if (!identity) return;

      markDailyFeedbackUnreadCheck();
      try {
        const messages = await pollFeedbackConversationMessages(identity);
        if (!cancelled) {
          setFeedbackConversationUnreadState(hasUnreadDeveloperReply(messages));
        }
      } catch (error) {
        console.warn("[FeedbackConversation] Daily unread check failed:", error);
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
