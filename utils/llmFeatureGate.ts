import type { SubscriptionFeatures } from '@/types/subscription';

export const ENABLE_LLM_ASSIST = process.env.EXPO_PUBLIC_ENABLE_LLM_ASSIST === 'true';

/** Proxy URL is set and assist is enabled for this build (UI may still be premium-gated). */
export function isLlmProxyReady(baseUrl: string | undefined): boolean {
  const configured = Boolean(typeof baseUrl === 'string' && baseUrl.trim().length > 0);
  return configured && (ENABLE_LLM_ASSIST || __DEV__);
}

/** Live LLM calls and editable AI controls — Premium only. */
export function isLlmPremiumFeatureActive(
  features: Pick<SubscriptionFeatures, 'canUseLLM'>,
  baseUrl: string | undefined
): boolean {
  return features.canUseLLM === true && isLlmProxyReady(baseUrl);
}
