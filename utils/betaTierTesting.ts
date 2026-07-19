/**
 * Lets you flip Free ↔ Premium on device without App Store billing.
 * Enabled in dev, or when EXPO_PUBLIC_ENABLE_TEST_TIER_SWITCH=true (set in eas.json for TestFlight).
 */
export function isBetaTierTestingEnabled(): boolean {
  if (__DEV__) return true;
  return process.env.EXPO_PUBLIC_ENABLE_TEST_TIER_SWITCH === 'true';
}
