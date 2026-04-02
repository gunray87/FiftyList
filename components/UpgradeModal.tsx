import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { X, Crown, Check, Zap, TrendingUp } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';
import AuthModal from './AuthModal';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan: (plan: 'monthly' | 'yearly') => void;
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
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const handleSelectPlan = (plan: 'monthly' | 'yearly') => {
    if (!user) {
      // User not logged in - show auth modal
      setShowAuth(true);
    } else {
      // User logged in - proceed with upgrade
      onSelectPlan(plan);
    }
  };

  const features = [
    { icon: Zap, text: 'Online Book Search (Google Books API)', highlight: true },
    { icon: Zap, text: 'Movie Search (TMDB + OMDb)', highlight: true },
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
            <Crown size={24} color="#8B5CF6" />
            <Text style={[styles.title, isDark && styles.darkText]}>
              Upgrade to Premium
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Trigger Message */}
          {triggerFeature && (
            <View style={styles.triggerBanner}>
              <Text style={[styles.triggerText, isDark && styles.darkText]}>
                🔒 {triggerFeature} requires Premium
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
                <View style={[
                  styles.featureIcon,
                  feature.highlight && styles.featureIconHighlight
                ]}>
                  <feature.icon
                    size={16}
                    color={feature.highlight ? '#8B5CF6' : '#10B981'}
                  />
                </View>
                <Text style={[
                  styles.featureText,
                  isDark && styles.darkText,
                  feature.highlight && styles.featureTextHighlight
                ]}>
                  {feature.text}
                </Text>
              </View>
            ))}
          </View>

          {/* Pricing Cards */}
          <View style={styles.pricingSection}>
            <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
              Choose Your Plan
            </Text>

            {/* Yearly Plan (Recommended) */}
            <TouchableOpacity
              style={[styles.pricingCard, styles.pricingCardRecommended, isDark && styles.darkPricingCard]}
              onPress={() => handleSelectPlan('yearly')}
            >
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>BEST VALUE</Text>
              </View>
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, isDark && styles.darkText]}>
                  Yearly
                </Text>
                <View style={styles.pricingPrice}>
                  <Text style={[styles.price, isDark && styles.darkText]}>$19.99</Text>
                  <Text style={[styles.pricingPeriod, isDark && styles.darkSecondaryText]}>/year</Text>
                </View>
              </View>
              <Text style={[styles.pricingSavings, isDark && styles.darkSecondaryText]}>
                Save 44% compared to monthly
              </Text>
              <Text style={[styles.pricingEquivalent, isDark && styles.darkTertiaryText]}>
                Just $1.67/month
              </Text>
            </TouchableOpacity>

            {/* Monthly Plan */}
            <TouchableOpacity
              style={[styles.pricingCard, isDark && styles.darkPricingCard]}
              onPress={() => handleSelectPlan('monthly')}
            >
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, isDark && styles.darkText]}>
                  Monthly
                </Text>
                <View style={styles.pricingPrice}>
                  <Text style={[styles.price, isDark && styles.darkText]}>$2.99</Text>
                  <Text style={[styles.pricingPeriod, isDark && styles.darkSecondaryText]}>/month</Text>
                </View>
              </View>
              <Text style={[styles.pricingDescription, isDark && styles.darkSecondaryText]}>
                Flexible monthly subscription
              </Text>
            </TouchableOpacity>
          </View>

          {/* Free Tier Reminder */}
          <View style={[styles.freeTierNote, isDark && styles.darkFreeTierNote]}>
            <Text style={[styles.freeTierText, isDark && styles.darkSecondaryText]}>
              💡 Your current free tier includes access to 1,000+ books and 500+ movies in our local database, unlimited item tracking, and all core features.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>

    {/* Auth Modal */}
    <AuthModal
      visible={showAuth}
      onClose={() => setShowAuth(false)}
      initialMode="signup"
      isDark={isDark}
    />
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
  closeButton: {
    padding: 8,
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
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
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
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  featureIconHighlight: {
    backgroundColor: '#EDE9FE',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.2,
  },
  featureText: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    flex: 1,
  },
  featureTextHighlight: {
    fontFamily: 'Inter-Medium',
  },
  pricingSection: {
    marginBottom: 24,
  },
  pricingCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E2E8F0',
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
    borderColor: '#8B5CF6',
    backgroundColor: '#FAF5FF',
    borderWidth: 3,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    right: 20,
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
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
    color: '#059669',
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
  freeTierNote: {
    backgroundColor: '#EFF6FF',
    padding: 18,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  darkFreeTierNote: {
    backgroundColor: '#1E3A5F',
    borderLeftColor: '#60A5FA',
  },
  freeTierText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#1E40AF',
    lineHeight: 20,
    letterSpacing: 0.1,
  },
});
