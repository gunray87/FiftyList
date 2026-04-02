import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Crown, Check, X, ChevronRight } from 'lucide-react-native';
import { UserSubscription, SubscriptionFeatures } from '@/types/subscription';

interface SubscriptionStatusCardProps {
  subscription: UserSubscription | null;
  features: SubscriptionFeatures;
  onUpgradePress: () => void;
  isDark?: boolean;
}

export default function SubscriptionStatusCard({
  subscription,
  features,
  onUpgradePress,
  isDark = false
}: SubscriptionStatusCardProps) {
  const isPremium = subscription?.tier === 'premium';
  const isTrial = subscription?.status === 'trial';

  return (
    <View style={[styles.card, isDark && styles.darkCard]}>
      {/* Current Tier Header */}
      <View style={styles.header}>
        <View style={styles.tierBadge}>
          {isPremium && <Crown size={16} color="#F59E0B" />}
          <Text style={[styles.tierName, isDark && styles.darkText]}>
            {isPremium ? 'Premium' : 'Free Tier'}
          </Text>
        </View>
        {isTrial && (
          <View style={styles.trialBadge}>
            <Text style={styles.trialText}>Trial</Text>
          </View>
        )}
      </View>

      {/* Features List */}
      <View style={styles.features}>
        <FeatureRow
          icon={features.canSearchBooks ? Check : X}
          text="Online Book Search (Google Books API)"
          enabled={features.canSearchBooks}
          isDark={isDark}
        />
        <FeatureRow
          icon={features.canSearchMovies ? Check : X}
          text="Movie Search (TMDB + OMDb)"
          enabled={features.canSearchMovies}
          isDark={isDark}
        />
        <FeatureRow
          icon={features.canUseEnhancedSearch ? Check : X}
          text="Enhanced Multi-Source Search"
          enabled={features.canUseEnhancedSearch}
          isDark={isDark}
        />
        <FeatureRow
          icon={features.hasUnlimitedItems ? Check : X}
          text="Unlimited Items"
          enabled={features.hasUnlimitedItems}
          isDark={isDark}
        />
      </View>

      {/* Local Database Info for Free Users */}
      {!isPremium && (
        <View style={styles.localDbInfo}>
          <Text style={[styles.localDbText, isDark && styles.darkSecondaryText]}>
            📚 You have access to 1,000+ books and 500+ movies in our local database
          </Text>
        </View>
      )}

      {/* Upgrade Button for Free Users */}
      {!isPremium && (
        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={() => {
            console.log('🚀 Upgrade button pressed in SubscriptionStatusCard');
            onUpgradePress();
          }}
        >
          <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          <ChevronRight size={16} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* Expiration Info */}
      {subscription?.expiresAt && (
        <Text style={[styles.expirationText, isDark && styles.darkTertiaryText]}>
          {isPremium ? 'Renews' : 'Expires'} on {new Date(subscription.expiresAt).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
}

const FeatureRow = ({ icon: Icon, text, enabled, isDark }: any) => (
  <View style={styles.featureRow}>
    <Icon
      size={16}
      color={enabled ? '#10B981' : '#EF4444'}
    />
    <Text style={[
      styles.featureText,
      !enabled && styles.disabledFeatureText,
      isDark && styles.darkText
    ]}>
      {text}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    gap: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  darkCard: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    shadowOpacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tierName: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  darkText: {
    color: '#FFFFFF',
  },
  trialBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  trialText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: '#1E40AF',
  },
  features: {
    gap: 8,
    paddingVertical: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
  },
  disabledFeatureText: {
    color: '#9CA3AF',
    textDecorationLine: 'line-through',
  },
  darkSecondaryText: {
    color: '#9CA3AF',
  },
  localDbInfo: {
    backgroundColor: '#EEF2FF',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  localDbText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#4F46E5',
    lineHeight: 18,
  },
  upgradeButton: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  expirationText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  darkTertiaryText: {
    color: '#6B7280',
  },
});
