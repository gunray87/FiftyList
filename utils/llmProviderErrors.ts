/** Map proxy / Anthropic error text to short user-facing copy. */
export function friendlyLlmErrorMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('529') || lower.includes('overloaded')) {
    return 'AI is temporarily busy — using your list-based descriptions. Try again in a minute.';
  }
  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'AI rate limit — try again shortly. Your suggestions still use your lists.';
  }
  if (lower.includes('timed out') || lower.includes('abort')) {
    return 'AI request timed out — try refresh.';
  }
  if (lower.includes('premium required')) {
    return 'Premium AI copy requires an active subscription.';
  }
  if (lower.includes('not configured') || lower.includes('proxy url')) {
    return 'AI assist is not configured for this build.';
  }
  if (lower.includes('claude inference failed')) {
    return 'AI copy unavailable right now — using list-based descriptions.';
  }
  return 'AI copy unavailable — using list-based descriptions.';
}
