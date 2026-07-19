import React, { useState, useEffect, useContext, createContext } from 'react';
import { UserSubscription, getSubscriptionFeatures, SubscriptionFeatures } from '@/types/subscription';
import {
  deleteSecureItem,
  getSecureItem,
  getSecureJson,
  migrateKeyFromAsyncStorageToSecureStore,
  setSecureItem,
  setSecureJson,
} from '@/utils/secureStore';
import { clearPremiumRefineContext } from '@/utils/premiumRefineContext';
import { openSubscriptionManagement } from '@/utils/subscriptionManagement';
import { isBetaTierTestingEnabled } from '@/utils/betaTierTesting';
import {
  isRevenueCatConfigured,
  purchaseRevenueCatTier,
  restoreRevenueCatPurchases,
  syncSubscriptionFromRevenueCat,
} from '@/utils/revenueCat';

interface SubscriptionContextType {
  subscription: UserSubscription | null;
  features: SubscriptionFeatures;
  isLoading: boolean;
  isRevenueCatReady: boolean;
  subscribeToPremium: () => Promise<boolean>;
  startFreeTrial: () => Promise<void>;
  clearLocalTierOverride: () => Promise<void>;
  openManageSubscriptions: () => Promise<boolean>;
  refreshSubscription: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  /** Local-only tier for simulator / TestFlight when billing is unavailable. */
  isBetaTierTestingEnabled: boolean;
  setTestTier: (tier: 'free' | 'premium') => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);
const SUBSCRIPTION_STORAGE_KEY = 'user_subscription';
const SUBSCRIPTION_LOCAL_OVERRIDE_KEY = 'user_subscription_local_override';

function buildFreeSubscription(): UserSubscription {
  return {
    tier: 'free',
    status: 'active',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    autoRenew: false,
  };
}

function buildPremiumSubscription(status: UserSubscription['status'] = 'active'): UserSubscription {
  return {
    tier: 'premium',
    status,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    autoRenew: status === 'active',
  };
}

async function applyLocalTestTier(tier: 'free' | 'premium'): Promise<void> {
  if (tier === 'free') {
    await setSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY, 'free');
    await setSecureJson(SUBSCRIPTION_STORAGE_KEY, buildFreeSubscription());
    await clearPremiumRefineContext();
    return;
  }
  await setSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY, 'premium');
  await setSecureJson(SUBSCRIPTION_STORAGE_KEY, buildPremiumSubscription());
}

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

export const useSubscriptionProvider = () => {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRevenueCatReady, setIsRevenueCatReady] = useState(false);

  const features = getSubscriptionFeatures(subscription);

  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const revenueCatConfigured = isRevenueCatConfigured();
      setIsRevenueCatReady(revenueCatConfigured);

      await migrateKeyFromAsyncStorageToSecureStore(SUBSCRIPTION_STORAGE_KEY);
      await migrateKeyFromAsyncStorageToSecureStore(SUBSCRIPTION_LOCAL_OVERRIDE_KEY);

      const localOverride = await getSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY);
      if (localOverride === 'free') {
        const free = buildFreeSubscription();
        setSubscription(free);
        await setSecureJson(SUBSCRIPTION_STORAGE_KEY, free);
        setIsLoading(false);
        return;
      }
      if (localOverride === 'premium' && isBetaTierTestingEnabled()) {
        const premium = buildPremiumSubscription();
        setSubscription(premium);
        await setSecureJson(SUBSCRIPTION_STORAGE_KEY, premium);
        setIsLoading(false);
        return;
      }

      const stored = await getSecureJson<UserSubscription>(SUBSCRIPTION_STORAGE_KEY);
      if (stored) {
        const normalized: UserSubscription = {
          ...stored,
          tier: stored.tier === 'premium' ? 'premium' : 'free',
          expiresAt: new Date(stored.expiresAt),
          trialEndsAt: stored.trialEndsAt ? new Date(stored.trialEndsAt) : undefined,
        };
        setSubscription(normalized);
      } else {
        setSubscription(buildFreeSubscription());
      }

      if (revenueCatConfigured) {
        const synced = await syncSubscriptionFromRevenueCat();
        if (synced) {
          await saveSubscription(synced);
        }
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
      setSubscription(buildFreeSubscription());
    } finally {
      setIsLoading(false);
    }
  };

  const saveSubscription = async (newSubscription: UserSubscription) => {
    setSubscription(newSubscription);
    try {
      await setSecureJson(SUBSCRIPTION_STORAGE_KEY, newSubscription);
    } catch (error) {
      console.error('Error saving subscription:', error);
      throw error;
    }
  };

  const subscribeToPremium = async (): Promise<boolean> => {
    try {
      await clearLocalTierOverride();

      if (isRevenueCatReady) {
        const synced = await syncSubscriptionFromRevenueCat();
        if (synced?.tier === 'premium') {
          await saveSubscription(synced);
          console.log('🎉 RevenueCat already active for premium');
          return true;
        }

        const purchased = await purchaseRevenueCatTier('premium');
        if (purchased?.tier === 'premium') {
          await saveSubscription(purchased);
          console.log('🎉 RevenueCat premium purchase completed');
          return true;
        }

        return false;
      }

      if (__DEV__) {
        const simulatedSubscription: UserSubscription = {
          tier: 'premium',
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: true,
        };
        await saveSubscription(simulatedSubscription);
        console.log('🎉 User subscribed to premium (simulated dev fallback)');
        return true;
      }

      throw new Error(
        'Subscription purchase unavailable: RevenueCat is not configured for this build.'
      );
    } catch (error) {
      console.error('Error subscribing to premium:', error);
      throw error;
    }
  };

  const startFreeTrial = async () => {
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const trialSubscription: UserSubscription = {
      tier: 'premium',
      status: 'trial',
      expiresAt: trialEndsAt,
      autoRenew: false,
      trialEndsAt,
    };

    await saveSubscription(trialSubscription);
    console.log('🆓 User started free trial!');
  };

  const clearLocalTierOverride = async () => {
    await deleteSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY);
  };

  const setTestTier = async (tier: 'free' | 'premium') => {
    if (!isBetaTierTestingEnabled()) {
      throw new Error('Test tier switching is not enabled in this build.');
    }
    await applyLocalTestTier(tier);
    setSubscription(tier === 'free' ? buildFreeSubscription() : buildPremiumSubscription());
    console.log(`🧪 Test tier set to ${tier} (local only)`);
  };

  const openManageSubscriptions = async () => {
    return openSubscriptionManagement();
  };

  const refreshSubscription = async () => {
    const localOverride = await getSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY);
    if (localOverride === 'free') {
      await saveSubscription(buildFreeSubscription());
      return;
    }
    if (localOverride === 'premium' && isBetaTierTestingEnabled()) {
      await saveSubscription(buildPremiumSubscription());
      return;
    }

    if (isRevenueCatReady) {
      const synced = await syncSubscriptionFromRevenueCat();
      if (synced) {
        await saveSubscription(synced);
        return;
      }
    }
    await loadSubscription();
  };

  const restorePurchases = async () => {
    try {
      if (!isRevenueCatReady) {
        console.log('ℹ️ RevenueCat not configured; restore is unavailable in this build.');
        return;
      }

      const restored = await restoreRevenueCatPurchases();
      if (restored) {
        await clearLocalTierOverride();
        await saveSubscription(restored);
      }
    } catch (error) {
      console.error('Error restoring purchases:', error);
      throw error;
    }
  };

  return {
    subscription,
    features,
    isLoading,
    isRevenueCatReady,
    subscribeToPremium,
    startFreeTrial,
    clearLocalTierOverride,
    openManageSubscriptions,
    refreshSubscription,
    restorePurchases,
    isBetaTierTestingEnabled: isBetaTierTestingEnabled(),
    setTestTier,
  };
};

export const SubscriptionProvider = ({ children }: { children: React.ReactNode }) => {
  const subscriptionData = useSubscriptionProvider();

  return (
    <SubscriptionContext.Provider value={subscriptionData}>
      {children}
    </SubscriptionContext.Provider>
  );
};
