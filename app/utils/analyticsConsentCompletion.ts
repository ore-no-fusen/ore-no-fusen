/** Keep the request visible if saving fails; dismiss its native window only after success. */
export async function completeAnalyticsConsentChoice(
  save: () => Promise<unknown>,
  hideWindow: () => Promise<void>,
): Promise<void> {
  await save();
  await hideWindow();
}
