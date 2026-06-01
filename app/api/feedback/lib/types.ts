export type FeedbackConversation = {
  conversationId: string;
  secretTokenHash: string;
  discordChannelId?: string;
  discordMessageId?: string;
  discordThreadId?: string;
  deliveryEnabled: boolean;
  shadowOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessageAuthor = 'user' | 'developer';

export type FeedbackConversationMessage = {
  messageId: string;
  conversationId: string;
  authorType: ConversationMessageAuthor;
  body: string;
  createdAt: string;
  discordMessageId?: string;
  readByUser: boolean;
  shadowOnly: boolean;
};

export type DiscordCandidateMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorIsBot: boolean;
  content: string;
  referencedMessageId?: string | null;
  threadId?: string | null;
};

export type DeveloperReplyEligibilityInput = {
  message: DiscordCandidateMessage;
  allowedDiscordUserIds: string[];
  mappedConversationId?: string | null;
  alreadyIngested: boolean;
};

export type DeveloperReplyEligibilityResult =
  | {
      ok: true;
      conversationId: string;
      reason: 'accepted';
    }
  | {
      ok: false;
      reason:
        | 'not_reply_to_conversation'
        | 'author_not_allowed'
        | 'duplicate'
        | 'empty_body'
        | 'bot_message';
    };
