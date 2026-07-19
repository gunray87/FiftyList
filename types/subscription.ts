export interface SubscriptionTier {
  id: 'free' | 'premium';
  name: string;
  price: {
    monthly?: number;
    annual?: number;
  };
  features: {
    unlimitedItems: boolean;
    enhancedSearch: boolean;
    movieSearch: boolean;
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
  canSearchBooks: boolean;
  canUseEnhancedSearch: boolean;
  canGetRecommendations: boolean;
  canUseLLM: boolean;
  hasUnlimitedItems: boolean;
  hasPrioritySupport: boolean;
}

const PREMIUM_TIER_CONFIG: SubscriptionTier = {
  id: 'premium',
  name: 'Premium',
  price: { monthly: 2.99, annual: 19.99 },
  features: {
    unlimitedItems: true,
    enhancedSearch: true,
    movieSearch: true,
    advancedRecommendations: true,
    prioritySupport: true,
  },
  apiProviders: ['google_books', 'open_library', 'goodreads', 'tmdb', 'omdb'],
  limits: {
    apiCallsPerDay: 1000,
    searchProviders: ['google_books', 'open_library', 'goodreads', 'tmdb', 'omdb'],
  },
};

const FREE_TIER_CONFIG: SubscriptionTier = {
  id: 'free',
  name: 'No Subscription',
  price: {},
  features: {
    unlimitedItems: false,
    enhancedSearch: false,
    movieSearch: false,
    advancedRecommendations: false,
    prioritySupport: false,
  },
  apiProviders: [],
  limits: {
    apiCallsPerDay: 0,
    searchProviders: [],
  },
};

/** Paid plans only — shown in upgrade UI and settings. */
export const PAID_SUBSCRIPTION_TIERS: SubscriptionTier[] = [PREMIUM_TIER_CONFIG];

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = [FREE_TIER_CONFIG, PREMIUM_TIER_CONFIG];

export function isPaidSubscriptionTier(tier: string | undefined): tier is 'premium' {
  return tier === 'premium';
}

export const getSubscriptionTier = (tierId: string): SubscriptionTier | undefined => {
  if (tierId === 'free') return FREE_TIER_CONFIG;
  if (tierId === 'premium') return PREMIUM_TIER_CONFIG;
  return undefined;
};

const FREE_FEATURES: SubscriptionFeatures = {
  canSearchMovies: false,
  canSearchBooks: false,
  canUseEnhancedSearch: false,
  canGetRecommendations: false,
  canUseLLM: false,
  hasUnlimitedItems: false,
  hasPrioritySupport: false,
};

export const getSubscriptionFeatures = (subscription: UserSubscription | null): SubscriptionFeatures => {
  if (!subscription || subscription.tier !== 'premium') {
    return FREE_FEATURES;
  }

  return {
    canSearchMovies: true,
    canSearchBooks: true,
    canUseEnhancedSearch: true,
    canGetRecommendations: true,
    canUseLLM: true,
    hasUnlimitedItems: true,
    hasPrioritySupport: true,
  };
};
