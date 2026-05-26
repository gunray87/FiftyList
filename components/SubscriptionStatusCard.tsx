import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Crown, Check, Lock, ChevronRight } from 'lucide-react-native';
import { UserSubscription, SubscriptionFeatures } from '@/types/subscription';
import { FL } from '@/constants/fiftyListTheme';

interface SubscriptionStatusCardProps {
  subscription: UserSubscription | null;
  features: SubscriptionFeatures;
  onUpgradePress: () => void;
  onManageSubscription?: () => void;
  onDowngradeToEntry?: () => void;
  showManageSubscription?: boolean;
  isDark?: boolean;
}

export default function SubscriptionStatusCard({
  subscription,
  features,
  onUpgradePress,
  onManageSubscription,
  onDowngradeToEntry,
  showManageSubscription = false,
  isDark = false
}: SubscriptionStatusCardProps) {
  const tier = subscription?.tier ?? 'free';
  const isPremium = subscription?.tier === 'premium';
  const isEntry = subscription?.tier === 'entry';
  const isTrial = subscription?.status === 'trial';

  return (
    <View style={[styles.card, isDark && styles.darkCard]}>
      <View style={styles.header}>
        <View style={styles.tierBadge}>
          {isPremium && <Crown size={16} color={FL.amber} />}
          <Text style={[styles.tierName, isDark && styles.darkText]}>
            {isPremium ? 'Premium Utility' : isEntry ? 'Entry Utility' : 'No Subscription'}
          </Text>
        </View>
        {isTrial && (
          <View style={styles.trialBadge}>
            <Text style={styles.trialText}>Trial</Text>
          </View>
        )}
      </View>

      <View style={styles.features}>
        <FeatureRow text="Online Book Search (Google Books API)" enabled={features.canSearchBooks} isDark={isDark} />
        <FeatureRow text="Movie Search (OMDb)" enabled={features.canSearchMovies} isDark={isDark} />
        <FeatureRow text="Enhanced Multi-Source Search" enabled={features.canUseEnhancedSearch} isDark={isDark} />
        <FeatureRow text="LLM Search & AI Item Creation" enabled={features.canUseLLM} isDark={isDark} />
        <FeatureRow text="Advanced AI Recommendations" enabled={features.canGetRecommendations} isDark={isDark} />
        <FeatureRow text="Priority Support" enabled={features.hasPrioritySupport} isDark={isDark} />
        <FeatureRow text="Unlimited Items" enabled={features.hasUnlimitedItems} isDark={isDark} />
      </View>

      {tier === 'free' && (
        <View style={[styles.localDbInfo, isDark && styles.darkLocalDbInfo]}>
          <Text style={[styles.localDbText, isDark && styles.darkLocalDbText]}>
            Your lists stay on this device. Subscribe to Entry or Premium for online search and more.
          </Text>
        </View>
      )}

      {tier === 'free' && (
        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={() => {
            console.log('🚀 View plans pressed in SubscriptionStatusCard');
            onUpgradePress();
          }}
        >
          <Text style={styles.upgradeButtonText}>View Entry & Premium Plans</Text>
          <ChevronRight size={16} color={FL.white} />
        </TouchableOpacity>
      )}

      {isEntry && (
        <View style={[styles.localDbInfo, isDark && styles.darkLocalDbInfo]}>
          <Text style={[styles.localDbText, isDark && styles.darkLocalDbText]}>
            Entry includes local tracking and API search. Upgrade to Premium for LLM features.
          </Text>
        </View>
      )}

      {isEntry && (
        <TouchableOpacity
          style={styles.upgradeButton}
          onPress={() => {
            console.log('🚀 Upgrade button pressed in SubscriptionStatusCard');
            onUpgradePress();
          }}
        >
          <Text style={styles.upgradeButtonText}>Upgrade to Premium</Text>
          <ChevronRight size={16} color={FL.white} />
        </TouchableOpacity>
      )}

      {(isPremium || isEntry) && (
        <View style={styles.planActions}>
          {showManageSubscription && onManageSubscription ? (
            <TouchableOpacity
              style={[styles.secondaryButton, isDark && styles.darkSecondaryButton]}
              onPress={onManageSubscription}
            >
              <Text style={[styles.secondaryButtonText, isDark && styles.darkText]}>
                Manage in App Store
              </Text>
            </TouchableOpacity>
          ) : null}
          {isPremium && onDowngradeToEntry ? (
            <TouchableOpacity
              style={[styles.secondaryButton, isDark && styles.darkSecondaryButton]}
              onPress={onDowngradeToEntry}
            >
              <Text style={[styles.secondaryButtonText, isDark && styles.darkText]}>
                Switch to Entry Plan
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {subscription?.expiresAt && (
        <Text style={[styles.expirationText, isDark && styles.darkTertiaryText]}>
          {isPremium ? 'Renews' : 'Expires'} on {new Date(subscription.expiresAt).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
}

function FeatureRow({
  text,
  enabled,
  isDark,
}: {
  text: string;
  enabled: boolean;
  isDark?: boolean;
}) {
  return (
    <View style={styles.featureRow}>
      {enabled ? (
        <View style={styles.featureIconEnabled}>
          <Check size={12} color={FL.white} />
        </View>
      ) : (
        <Lock size={16} color={FL.textMuted} />
      )}
      <Text
        style={[
          styles.featureText,
          !enabled && styles.lockedFeatureText,
          isDark && enabled && styles.darkText,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FL.card,
    padding: 20,
    gap: 16,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: FL.border,
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
    color: FL.textDark,
  },
  darkText: {
    color: FL.white,
  },
  trialBadge: {
    backgroundColor: FL.amberTint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  trialText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: FL.amber,
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
  featureIconEnabled: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: FL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: FL.textDark,
    flex: 1,
  },
  lockedFeatureText: {
    color: FL.textMuted,
  },
  localDbInfo: {
    backgroundColor: FL.card,
    padding: 16,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: FL.amber,
    borderWidth: 0.5,
    borderColor: FL.border,
  },
  darkLocalDbInfo: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  localDbText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: FL.textDark,
    lineHeight: 18,
  },
  darkLocalDbText: {
    color: '#D1D5DB',
  },
  upgradeButton: {
    backgroundColor: FL.amber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 4,
    shadowColor: FL.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeButtonText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: FL.white,
  },
  planActions: {
    gap: 8,
    marginTop: 4,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: FL.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  darkSecondaryButton: {
    borderColor: '#4B5563',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: FL.textDark,
  },
  expirationText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: FL.textMuted,
    textAlign: 'center',
  },
  darkTertiaryText: {
    color: '#6B7280',
  },
});
