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
  subscribeToTier: (tier: 'entry' | 'premium') => Promise<boolean>;
  upgradeToPremium: () => Promise<boolean>;
  startFreeTrial: () => Promise<void>;
  downgradeToEntry: () => Promise<void>;
  clearLocalTierOverride: () => Promise<void>;
  openManageSubscriptions: () => Promise<boolean>;
  refreshSubscription: () => Promise<void>;
  restorePurchases: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);
const SUBSCRIPTION_STORAGE_KEY = 'user_subscription';
/** When set, local tier wins over RevenueCat sync until purchase/restore. */
const SUBSCRIPTION_LOCAL_OVERRIDE_KEY = 'user_subscription_local_override';

function buildFreeSubscription(): UserSubscription {
  return {
    tier: 'free',
    status: 'active',
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    autoRenew: false,
  };
}

function buildEntrySubscription(): UserSubscription {
  return {
    tier: 'entry',
    status: 'active',
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    autoRenew: true,
  };
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

  // Load subscription from storage
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
      if (localOverride === 'entry') {
        const entry = buildEntrySubscription();
        setSubscription(entry);
        await setSecureJson(SUBSCRIPTION_STORAGE_KEY, entry);
        setIsLoading(false);
        return;
      }
      if (localOverride === 'free') {
        const free = buildFreeSubscription();
        setSubscription(free);
        await setSecureJson(SUBSCRIPTION_STORAGE_KEY, free);
        setIsLoading(false);
        return;
      }

      const stored = await getSecureJson<UserSubscription>(SUBSCRIPTION_STORAGE_KEY);
      if (stored) {
        const normalized: UserSubscription = {
          ...stored,
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
      // Default to free tier on error
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

  const subscribeToTier = async (tier: 'entry' | 'premium'): Promise<boolean> => {
    try {
      const localOverride = await getSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY);
      // Local "Entry" testing override must not block a real Premium purchase.
      if (localOverride === 'entry' && tier === 'premium') {
        await clearLocalTierOverride();
      }

      if (isRevenueCatReady) {
        const synced = await syncSubscriptionFromRevenueCat();
        if (synced?.tier === tier) {
          await clearLocalTierOverride();
          await saveSubscription(synced);
          console.log(`🎉 RevenueCat already active for ${tier}`);
          return true;
        }

        const purchased = await purchaseRevenueCatTier(tier);
        if (purchased?.tier === tier) {
          await clearLocalTierOverride();
          await saveSubscription(purchased);
          console.log(`🎉 RevenueCat ${tier} purchase completed`);
          return true;
        }

        // User cancelled, or purchase did not grant the requested tier.
        if (localOverride === 'entry' && tier === 'premium') {
          await setSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY, 'entry');
          await saveSubscription(buildEntrySubscription());
        }
        return false;
      }

      if (__DEV__) {
        const simulatedSubscription: UserSubscription = {
          tier,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: true,
        };
        await clearLocalTierOverride();
        await saveSubscription(simulatedSubscription);
        console.log(`🎉 User subscribed to ${tier} (simulated dev fallback)`);
        return true;
      }

      throw new Error(
        'Subscription purchase unavailable: RevenueCat is not configured for this build.'
      );
    } catch (error) {
      console.error('Error subscribing to tier:', error);
      throw error;
    }
  };

  const upgradeToPremium = async () => subscribeToTier('premium');

  const startFreeTrial = async () => {
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    const trialSubscription: UserSubscription = {
      tier: 'entry',
      status: 'trial',
      expiresAt: trialEndsAt,
      autoRenew: false,
      trialEndsAt,
    };
    
    await saveSubscription(trialSubscription);
    
    // Track trial start
    console.log('🆓 User started free trial!');
  };

  const clearLocalTierOverride = async () => {
    await deleteSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY);
  };

  const downgradeToFree = async () => {
    await setSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY, 'free');
    await saveSubscription(buildFreeSubscription());
    console.log('📉 Subscription set to free (local)');
  };

  const downgradeToEntry = async () => {
    const entry = buildEntrySubscription();
    setSubscription(entry);
    await setSecureItem(SUBSCRIPTION_LOCAL_OVERRIDE_KEY, 'entry');
    await setSecureJson(SUBSCRIPTION_STORAGE_KEY, entry);
    await clearPremiumRefineContext();
    console.log('📉 Subscription set to entry (local override active, premium refine cleared)');
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
    if (localOverride === 'entry') {
      await saveSubscription(buildEntrySubscription());
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
    subscribeToTier,
    upgradeToPremium,
    startFreeTrial,
    downgradeToEntry,
    clearLocalTierOverride,
    openManageSubscriptions,
    refreshSubscription,
    restorePurchases,
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
