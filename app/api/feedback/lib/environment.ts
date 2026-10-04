/** Keep the existing production collections; isolate every non-production deployment. */
export function feedbackEnvironment(): 'production' | 'development' {
  return process.env.VERCEL_ENV === 'production' ? 'production' : 'development';
}

export function feedbackFirestorePrefix(): string {
  return feedbackEnvironment() === 'production' ? '' : '/feedback_environments/development';
}
