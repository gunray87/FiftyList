export interface SubscriptionTier {
  id: 'free' | 'entry' | 'premium';
  name: string;
  price: {
    monthly?: number;
  };
  features: {
    unlimitedItems: boolean;
    enhancedSearch: boolean;
    movieSearch: boolean;
    priceTracking: boolean;
    advancedRecommendations: boolean;
    prioritySupport: boolean;
  };
  apiProviders: string[];
  limits: {
    apiCallsPerDay: number;
    searchProviders: string[];
  };
}

export interface UserSubscription {
  tier: 'free' | 'entry' | 'premium';
  status: 'active' | 'expired' | 'cancelled' | 'trial';
  expiresAt: Date;
  autoRenew: boolean;
  trialEndsAt?: Date;
}

export interface SubscriptionFeatures {
  canSearchMovies: boolean;
  canUseEnhancedSearch: boolean;
  canTrackPrices: boolean;
  canGetRecommendations: boolean;
  canUseLLM: boolean;
  hasUnlimitedItems: boolean;
  hasPrioritySupport: boolean;
  canSearchBooks: boolean;
}

/** Paid plans only — shown in upgrade UI and settings. */
export const PAID_SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'entry',
    name: 'Entry Utility',
    price: { monthly: 2.99 },
    features: {
      unlimitedItems: true,
      enhancedSearch: true,
      movieSearch: true,
      priceTracking: false,
      advancedRecommendations: false,
      prioritySupport: false,
    },
    apiProviders: ['google_books', 'tmdb', 'omdb'],
    limits: {
      apiCallsPerDay: 500,
      searchProviders: ['google_books', 'tmdb', 'omdb']
    }
  },
  {
    id: 'premium',
    name: 'Premium',
    price: { monthly: 9.99 },
    features: {
      unlimitedItems: true,
      enhancedSearch: true,
      movieSearch: true,
      priceTracking: true,
      advancedRecommendations: true,
      prioritySupport: true,
    },
    apiProviders: ['google_books', 'open_library', 'goodreads', 'tmdb', 'omdb'],
    limits: {
      apiCallsPerDay: 1000,
      searchProviders: ['google_books', 'open_library', 'goodreads', 'tmdb', 'omdb']
    }
  }
];

/** Internal unsubscribed state (not a selectable plan). */
const FREE_TIER_CONFIG: SubscriptionTier = {
  id: 'free',
  name: 'No Subscription',
  price: {},
  features: {
    unlimitedItems: false,
    enhancedSearch: false,
    movieSearch: false,
    priceTracking: false,
    advancedRecommendations: false,
    prioritySupport: false,
  },
  apiProviders: [],
  limits: {
    apiCallsPerDay: 0,
    searchProviders: [],
  },
};

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [FREE_TIER_CONFIG, ...PAID_SUBSCRIPTION_TIERS];

export function isPaidSubscriptionTier(tier: string | undefined): tier is 'entry' | 'premium' {
  return tier === 'entry' || tier === 'premium';
}

export const getSubscriptionTier = (tierId: string): SubscriptionTier | undefined => {
  if (tierId === 'free') return FREE_TIER_CONFIG;
  return PAID_SUBSCRIPTION_TIERS.find((tier) => tier.id === tierId);
};

export const getSubscriptionFeatures = (subscription: UserSubscription | null): SubscriptionFeatures => {
  if (!subscription) {
    return {
      canSearchMovies: false,
      canUseEnhancedSearch: false,
      canTrackPrices: false,
      canGetRecommendations: false,
      canUseLLM: false,
      hasUnlimitedItems: false,
      hasPrioritySupport: false,
      canSearchBooks: false,
    };
  }

  const tier = getSubscriptionTier(subscription.tier);
  if (!tier) {
    return {
      canSearchMovies: false,
      canUseEnhancedSearch: false,
      canTrackPrices: false,
      canGetRecommendations: false,
      canUseLLM: false,
      hasUnlimitedItems: false,
      hasPrioritySupport: false,
      canSearchBooks: false,
    };
  }

  const isEntryOrPremium = subscription.tier === 'entry' || subscription.tier === 'premium';
  const isPremium = subscription.tier === 'premium';

  return {
    canSearchMovies: isEntryOrPremium && tier.features.movieSearch,
    canUseEnhancedSearch: isEntryOrPremium && tier.features.enhancedSearch,
    canTrackPrices: isPremium && tier.features.priceTracking,
    canGetRecommendations: isPremium && tier.features.advancedRecommendations,
    canUseLLM: isPremium,
    hasUnlimitedItems: tier.features.unlimitedItems,
    hasPrioritySupport: isPremium && tier.features.prioritySupport,
    canSearchBooks: isEntryOrPremium,
  };
};
