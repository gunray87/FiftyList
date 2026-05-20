import React, { useState, useEffect, useContext, createContext } from 'react';
import { UserSubscription, getSubscriptionFeatures, SubscriptionFeatures } from '@/types/subscription';
import {
  getSecureJson,
  migrateKeyFromAsyncStorageToSecureStore,
  setSecureJson,
} from '@/utils/secureStore';
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
  subscribeToTier: (tier: 'entry' | 'premium') => Promise<void>;
  upgradeToPremium: () => Promise<void>;
  startFreeTrial: () => Promise<void>;
  cancelSubscription: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  restorePurchases: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);
const SUBSCRIPTION_STORAGE_KEY = 'user_subscription';

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
      const stored = await getSecureJson<UserSubscription>(SUBSCRIPTION_STORAGE_KEY);
      if (stored) {
        setSubscription({
          ...stored,
          expiresAt: new Date(stored.expiresAt),
          trialEndsAt: stored.trialEndsAt ? new Date(stored.trialEndsAt) : undefined,
        });
      } else {
        // Default to free tier
        setSubscription({
          tier: 'free',
          status: 'active',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          autoRenew: true,
        });
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
      setSubscription({
        tier: 'free',
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        autoRenew: true,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveSubscription = async (newSubscription: UserSubscription) => {
    try {
      await setSecureJson(SUBSCRIPTION_STORAGE_KEY, newSubscription);
      setSubscription(newSubscription);
    } catch (error) {
      console.error('Error saving subscription:', error);
    }
  };

  const subscribeToTier = async (tier: 'entry' | 'premium') => {
    try {
      if (isRevenueCatReady) {
        const purchased = await purchaseRevenueCatTier(tier);
        if (purchased) {
          await saveSubscription(purchased);
          console.log(`🎉 RevenueCat ${tier} purchase completed`);
          return;
        }
        // Either user cancelled purchase flow or purchase result was unavailable.
        return;
      }

      if (__DEV__) {
        // Dev-only simulation for local builds without RevenueCat keys.
        const simulatedSubscription: UserSubscription = {
          tier,
          status: 'active',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: true,
        };
        await saveSubscription(simulatedSubscription);
        console.log(`🎉 User subscribed to ${tier} (simulated dev fallback)`);
        return;
      }

      throw new Error(
        'Subscription purchase unavailable: RevenueCat is not configured for this build.'
      );
    } catch (error) {
      console.error('Error subscribing to tier:', error);
      throw error;
    }
  };

  const upgradeToPremium = async () => {
    await subscribeToTier('premium');
  };

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

  const cancelSubscription = async () => {
    if (subscription) {
      const cancelledSubscription: UserSubscription = {
        ...subscription,
        status: 'cancelled',
        autoRenew: false,
      };
      
      await saveSubscription(cancelledSubscription);
      
      // Track cancellation
      console.log('❌ User cancelled subscription');
    }
  };

  const refreshSubscription = async () => {
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
    cancelSubscription,
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
