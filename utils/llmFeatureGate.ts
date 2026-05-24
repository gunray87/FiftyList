import type { SubscriptionFeatures } from '@/types/subscription';

export const ENABLE_LLM_ASSIST = process.env.EXPO_PUBLIC_ENABLE_LLM_ASSIST === 'true';

/** Proxy URL is set and assist is enabled for this build (UI may still be premium-gated). */
export function isLlmProxyReady(baseUrl: string | undefined): boolean {
  const configured = Boolean(typeof baseUrl === 'string' && baseUrl.trim().length > 0);
  if (!configured) return false;
  // Release builds bake EXPO_PUBLIC_LLM_PROXY_BASE_URL at compile time — URL is the source of truth.
  if (!__DEV__) return true;
  return ENABLE_LLM_ASSIST;
}

/** Live LLM calls and editable AI controls — Premium only (dev bypass when LLM is configured in .env). */
export function isLlmPremiumFeatureActive(
  features: Pick<SubscriptionFeatures, 'canUseLLM'>,
  baseUrl: string | undefined
): boolean {
  if (!isLlmProxyReady(baseUrl)) return false;
  if (__DEV__ && ENABLE_LLM_ASSIST) return true;
  return features.canUseLLM === true;
}
