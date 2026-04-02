import React, { useState, useEffect, useContext, createContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserSubscription, getSubscriptionFeatures, SubscriptionFeatures } from '@/types/subscription';

interface SubscriptionContextType {
  subscription: UserSubscription | null;
  features: SubscriptionFeatures;
  isLoading: boolean;
  upgradeToPremium: () => Promise<void>;
  startFreeTrial: () => Promise<void>;
  cancelSubscription: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | null>(null);

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

  const features = getSubscriptionFeatures(subscription);

  // Load subscription from storage
  useEffect(() => {
    loadSubscription();
  }, []);

  const loadSubscription = async () => {
    try {
      const stored = await AsyncStorage.getItem('user_subscription');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSubscription({
          ...parsed,
          expiresAt: new Date(parsed.expiresAt),
          trialEndsAt: parsed.trialEndsAt ? new Date(parsed.trialEndsAt) : undefined,
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
      await AsyncStorage.setItem('user_subscription', JSON.stringify(newSubscription));
      setSubscription(newSubscription);
    } catch (error) {
      console.error('Error saving subscription:', error);
    }
  };

  const upgradeToPremium = async () => {
    try {
      // In a real app, this would integrate with RevenueCat
      // const offerings = await Purchases.getOfferings();
      // const result = await Purchases.purchasePackage(offerings.current?.monthly);
      
      // For now, simulate the upgrade
      const newSubscription: UserSubscription = {
        tier: 'premium',
        status: 'active',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        autoRenew: true,
      };
      
      await saveSubscription(newSubscription);
      
      // Track upgrade event
      console.log('🎉 User upgraded to Premium!');
    } catch (error) {
      console.error('Error upgrading to Premium:', error);
      throw error;
    }
  };

  const startFreeTrial = async () => {
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
    
    const trialSubscription: UserSubscription = {
      tier: 'premium',
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
    // In a real app, this would check with the payment provider
    await loadSubscription();
  };

  return {
    subscription,
    features,
    isLoading,
    upgradeToPremium,
    startFreeTrial,
    cancelSubscription,
    refreshSubscription,
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
