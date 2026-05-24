import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { X, Crown, Check, Zap, TrendingUp } from 'lucide-react-native';
import { FL } from '@/constants/fiftyListTheme';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan: (tier: 'entry' | 'premium') => void;
  isDark?: boolean;
  triggerFeature?: string; // What feature triggered the paywall
}

export default function UpgradeModal({
  visible,
  onClose,
  onSelectPlan,
  isDark = false,
  triggerFeature,
}: UpgradeModalProps) {
  const handleSelectPlan = (tier: 'entry' | 'premium') => {
    onSelectPlan(tier);
  };

  const features = [
    { icon: Zap, text: 'Online Book Search (Google Books API)' },
    { icon: Zap, text: 'Movie Search (OMDb)' },
    { icon: TrendingUp, text: 'Enhanced Multi-Source Search' },
    { icon: TrendingUp, text: 'Price Tracking & Alerts' },
    { icon: TrendingUp, text: 'Advanced AI Recommendations' },
    { icon: Check, text: 'Unlimited Items' },
    { icon: Check, text: 'Priority Support' },
  ];

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, isDark && styles.darkContainer]}>
        {/* Header */}
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <View style={styles.headerLeft}>
            <Crown size={24} color={FL.amber} />
            <Text style={[styles.title, isDark && styles.darkText]}>
              Choose Your Utility Plan
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeButtonGhost, isDark && styles.darkCloseButtonGhost]}>
            <X size={20} color={isDark ? '#9CA3AF' : FL.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Trigger Message */}
          {triggerFeature && (
            <View style={styles.triggerBanner}>
              <Text style={[styles.triggerText, isDark && styles.darkText]}>
                🔒 {triggerFeature} requires a paid tier
              </Text>
            </View>
          )}

          {/* Hero Message */}
          <View style={styles.hero}>
            <Text style={[styles.heroTitle, isDark && styles.darkText]}>
              Unlock Unlimited Search & Advanced Features
            </Text>
            <Text style={[styles.heroSubtitle, isDark && styles.darkSecondaryText]}>
              Search millions of books and movies with rich metadata, get personalized recommendations, and more.
            </Text>
          </View>

          {/* Features List */}
          <View style={[styles.featuresSection, isDark && styles.darkSection]}>
            <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
              Premium Features
            </Text>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <feature.icon size={16} color={FL.white} />
                </View>
                <Text style={[styles.featureText, isDark && styles.darkText]}>
                  {feature.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Pricing Cards */}
          <View style={styles.pricingSection}>
            <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
              Choose Your Monthly Tier
            </Text>

            {/* Premium Tier */}
            <TouchableOpacity
              style={[styles.pricingCard, styles.pricingCardRecommended, isDark && styles.darkPricingCard]}
              onPress={() => handleSelectPlan('premium')}
            >
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>LLM INCLUDED</Text>
              </View>
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, isDark && styles.darkText]}>
                  Premium Utility
                </Text>
                <View style={styles.pricingPrice}>
                  <Text style={[styles.price, isDark && styles.darkText]}>$9.99</Text>
                  <Text style={[styles.pricingPeriod, isDark && styles.darkSecondaryText]}>/month</Text>
                </View>
              </View>
              <Text style={[styles.pricingSavings, isDark && styles.darkSecondaryText]}>
                Includes LLM search and AI-assisted item creation
              </Text>
              <Text style={[styles.pricingEquivalent, isDark && styles.darkTertiaryText]}>
                Best for power users
              </Text>
            </TouchableOpacity>

            {/* Entry Tier */}
            <TouchableOpacity
              style={[styles.pricingCard, isDark && styles.darkPricingCard]}
              onPress={() => handleSelectPlan('entry')}
            >
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, isDark && styles.darkText]}>
                  Entry Utility
                </Text>
                <View style={styles.pricingPrice}>
                  <Text style={[styles.price, isDark && styles.darkText]}>$2.99</Text>
                  <Text style={[styles.pricingPeriod, isDark && styles.darkSecondaryText]}>/month</Text>
                </View>
              </View>
              <Text style={[styles.pricingDescription, isDark && styles.darkSecondaryText]}>
                Core utility features without LLM
              </Text>
            </TouchableOpacity>
          </View>

          {/* Local-first note */}
          <View style={[styles.planNote, isDark && styles.darkPlanNote]}>
            <Text style={[styles.planNoteText, isDark && styles.darkSecondaryText]}>
              💡 Entry and Premium keep your lists on-device. Premium adds AI-powered features.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  darkContainer: {
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  darkHeader: {
    borderBottomColor: '#374151',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  darkText: {
    color: '#FFFFFF',
  },
  closeButtonGhost: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: FL.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  darkCloseButtonGhost: {
    borderColor: '#4B5563',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  triggerBanner: {
    backgroundColor: '#FEF3C7',
    padding: 18,
    borderRadius: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  triggerText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#92400E',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 32,
    gap: 8,
  },
  heroTitle: {
    fontSize: 26,
    fontFamily: 'Inter-Bold',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  heroSubtitle: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 24,
    letterSpacing: 0.1,
  },
  darkSecondaryText: {
    color: '#9CA3AF',
  },
  featuresSection: {
    backgroundColor: FL.card,
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
    borderWidth: 0.5,
    borderColor: FL.border,
  },
  darkSection: {
    backgroundColor: '#1F2937',
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: FL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: FL.textDark,
    flex: 1,
  },
  pricingSection: {
    marginBottom: 24,
  },
  pricingCard: {
    backgroundColor: FL.card,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 0.5,
    borderColor: FL.border,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  darkPricingCard: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  pricingCardRecommended: {
    borderColor: FL.amber,
    backgroundColor: FL.amberTint,
    borderWidth: 1.5,
    shadowColor: FL.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: FL.amber,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: FL.amber,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  recommendedText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  pricingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
  },
  pricingTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  pricingPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  price: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: '#111827',
    letterSpacing: -0.5,
  },
  pricingPeriod: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  pricingSavings: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: FL.amber,
    marginBottom: 4,
  },
  pricingEquivalent: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  darkTertiaryText: {
    color: '#6B7280',
  },
  pricingDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  planNote: {
    backgroundColor: FL.card,
    padding: 18,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: FL.amber,
    borderWidth: 0.5,
    borderColor: FL.border,
  },
  darkPlanNote: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderLeftColor: FL.amber,
  },
  planNoteText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: FL.textDark,
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});
