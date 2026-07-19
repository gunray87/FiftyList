import { Platform } from 'react-native';
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { UserSubscription } from '@/types/subscription';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
const PREMIUM_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_PREMIUM_ENTITLEMENT_ID || 'premium';
const PREMIUM_PACKAGE_ID = process.env.EXPO_PUBLIC_REVENUECAT_PREMIUM_PACKAGE_ID;

let initialized = false;

function getApiKeyForPlatform(): string | undefined {
  if (Platform.OS === 'ios') return IOS_API_KEY;
  if (Platform.OS === 'android') return ANDROID_API_KEY;
  return undefined;
}

function hasValidPublicSdkKey(): boolean {
  const key = getApiKeyForPlatform();
  if (!key) return false;
  if (Platform.OS === 'ios') return key.startsWith('appl_');
  if (Platform.OS === 'android') return key.startsWith('goog_');
  return false;
}

function selectPackage(offering: PurchasesOffering): PurchasesPackage | null {
  if (PREMIUM_PACKAGE_ID) {
    const exact = offering.availablePackages.find((pkg) => pkg.identifier === PREMIUM_PACKAGE_ID);
    if (exact) return exact;
  }

  return (
    offering.availablePackages.find((pkg) => pkg.identifier.toLowerCase().includes('premium')) ??
    offering.availablePackages.find((pkg) => pkg.identifier.toLowerCase().includes('month')) ??
    null
  );
}

function getEntitlement(customerInfo: CustomerInfo, entitlementId: string) {
  const active = customerInfo.entitlements.active;
  return active[entitlementId] ?? null;
}

export function isRevenueCatConfigured(): boolean {
  return hasValidPublicSdkKey();
}

export async function initializeRevenueCat(): Promise<boolean> {
  if (initialized) return true;

  const apiKey = getApiKeyForPlatform();
  if (!apiKey || !hasValidPublicSdkKey()) {
    console.warn(
      `RevenueCat disabled: missing or invalid ${Platform.OS} public SDK key. ` +
      `Expected ${Platform.OS === 'ios' ? '"appl_*"' : '"goog_*"'}.`
    );
    return false;
  }

  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.WARN);
  await Purchases.configure({ apiKey });
  initialized = true;
  return true;
}

export function customerInfoToSubscription(customerInfo: CustomerInfo): UserSubscription {
  const premiumEntitlement = getEntitlement(customerInfo, PREMIUM_ENTITLEMENT_ID);

  if (!premiumEntitlement) {
    return {
      tier: 'free',
      status: 'active',
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      autoRenew: false,
    };
  }

  const expirationDate = premiumEntitlement.expirationDate
    ? new Date(premiumEntitlement.expirationDate)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return {
    tier: 'premium',
    status: 'active',
    expiresAt: expirationDate,
    autoRenew: premiumEntitlement.willRenew ?? true,
  };
}

export async function syncSubscriptionFromRevenueCat(): Promise<UserSubscription | null> {
  const ready = await initializeRevenueCat();
  if (!ready) return null;

  const customerInfo = await Purchases.getCustomerInfo();
  return customerInfoToSubscription(customerInfo);
}

export async function purchaseRevenueCatTier(_tier: 'premium'): Promise<UserSubscription | null> {
  const ready = await initializeRevenueCat();
  if (!ready) return null;

  const offerings = await Purchases.getOfferings();
  const currentOffering = offerings.current;
  if (!currentOffering) throw new Error('No RevenueCat offering is configured.');

  const targetPackage = selectPackage(currentOffering);
  if (!targetPackage) {
    throw new Error('No premium package found in current RevenueCat offering.');
  }

  try {
    const { customerInfo } = await Purchases.purchasePackage(targetPackage);
    return customerInfoToSubscription(customerInfo);
  } catch (error: unknown) {
    const err = error as { userCancelled?: boolean; message?: string };
    if (err?.userCancelled === true) {
      return null;
    }
    const message = (err?.message ?? (error instanceof Error ? error.message : '')).toLowerCase();
    if (message.includes('cancel') || message.includes('cancelled')) {
      return null;
    }
    console.error('RevenueCat purchase failed:', error);
    throw error;
  }
}

export async function restoreRevenueCatPurchases(): Promise<UserSubscription | null> {
  const ready = await initializeRevenueCat();
  if (!ready) return null;

  const customerInfo = await Purchases.restorePurchases();
  return customerInfoToSubscription(customerInfo);
}
