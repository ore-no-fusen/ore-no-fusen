/** Keep the existing production collections; isolate every non-production deployment. */
export function feedbackEnvironment(): 'production' | 'development' {
  return process.env.VERCEL_ENV === 'production' ? 'production' : 'development';
}

export function feedbackFirestorePrefix(): string {
  return feedbackEnvironment() === 'production' ? '' : '/feedback_environments/development';
}

// The existing production ingester recognizes only the literal "会話ID" field.
// A development notification must not offer that fallback into production.
export function feedbackDiscordConversationFieldName(): string {
  return feedbackEnvironment() === 'production' ? '会話ID' : '開発会話ID';
}
