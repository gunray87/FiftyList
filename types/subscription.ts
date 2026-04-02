export interface SubscriptionTier {
  id: 'free' | 'premium';
  name: string;
  price: {
    monthly?: number;
    yearly: number;
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
  tier: 'free' | 'premium';
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
  hasUnlimitedItems: boolean;
  hasPrioritySupport: boolean;
  canSearchBooks: boolean; // New: Controls book API search access
}

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [
  {
    id: 'free',
    name: 'Basic',
    price: { yearly: 3.99 },
    features: {
      unlimitedItems: true,
      enhancedSearch: false,
      movieSearch: false,
      priceTracking: false,
      advancedRecommendations: false,
      prioritySupport: false,
    },
    apiProviders: [], // No API access for free tier
    limits: {
      apiCallsPerDay: 0, // No API calls allowed
      searchProviders: [] // No search providers
    }
  },
  {
    id: 'premium',
    name: 'Premium',
    price: { monthly: 2.99, yearly: 19.99 },
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

export const getSubscriptionTier = (tierId: string): SubscriptionTier | undefined => {
  return SUBSCRIPTION_TIERS.find(tier => tier.id === tierId);
};

export const getSubscriptionFeatures = (subscription: UserSubscription | null): SubscriptionFeatures => {
  if (!subscription) {
    return {
      canSearchMovies: false,
      canUseEnhancedSearch: false,
      canTrackPrices: false,
      canGetRecommendations: false,
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
      hasUnlimitedItems: false,
      hasPrioritySupport: false,
      canSearchBooks: false,
    };
  }

  // Free tier has NO API access at all
  const isPremium = subscription.tier === 'premium';

  return {
    canSearchMovies: isPremium && tier.features.movieSearch,
    canUseEnhancedSearch: isPremium && tier.features.enhancedSearch,
    canTrackPrices: isPremium && tier.features.priceTracking,
    canGetRecommendations: isPremium && tier.features.advancedRecommendations,
    hasUnlimitedItems: tier.features.unlimitedItems,
    hasPrioritySupport: isPremium && tier.features.prioritySupport,
    canSearchBooks: isPremium, // Only premium can search via API
  };
};
