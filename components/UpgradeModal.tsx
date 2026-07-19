import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { X, Crown, Check, Search, Sparkles, SlidersHorizontal, Layers, Radar, HeadphonesIcon } from 'lucide-react-native';
import { FL } from '@/constants/fiftyListTheme';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan: (tier: 'premium') => void;
  isDark?: boolean;
  triggerFeature?: string;
}

export default function UpgradeModal({
  visible,
  onClose,
  onSelectPlan,
  isDark = false,
  triggerFeature,
}: UpgradeModalProps) {
  const features = [
    { icon: Search, text: 'Live search via Google Books & OMDb' },
    { icon: Sparkles, text: 'AI-powered book & movie recommendations' },
    { icon: SlidersHorizontal, text: 'Genre & mood filtering' },
    { icon: Layers, text: 'Semantic similarity matching ("more like this")' },
    { icon: Radar, text: 'Enhanced multi-source search' },
    { icon: HeadphonesIcon, text: 'Priority support' },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, isDark && styles.darkContainer]}>
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <View style={styles.headerLeft}>
            <Crown size={24} color={FL.amber} />
            <Text style={[styles.title, isDark && styles.darkText]}>
              Upgrade to Premium
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={[styles.closeButtonGhost, isDark && styles.darkCloseButtonGhost]}>
            <X size={20} color={isDark ? '#9CA3AF' : FL.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {triggerFeature && (
            <View style={styles.triggerBanner}>
              <Text style={styles.triggerText}>
                🔒 {triggerFeature} requires Premium
              </Text>
            </View>
          )}

          <View style={styles.hero}>
            <Text style={[styles.heroTitle, isDark && styles.darkText]}>
              Upgrade to Premium
            </Text>
            <Text style={[styles.heroSubtitle, isDark && styles.darkSecondaryText]}>
              Search any book or movie. Get personalized recommendations. Your data stays private, always.
            </Text>
          </View>

          <View style={[styles.featuresSection, isDark && styles.darkSection]}>
            <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
              What you get
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

          <View style={styles.pricingSection}>
            {/* Annual — primary */}
            <TouchableOpacity
              style={[styles.pricingCard, styles.pricingCardRecommended, isDark && styles.darkPricingCard]}
              onPress={() => onSelectPlan('premium')}
            >
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>SAVE 44%</Text>
              </View>
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, isDark && styles.darkText]}>
                  Annual
                </Text>
                <View style={styles.pricingPrice}>
                  <Text style={[styles.price, isDark && styles.darkText]}>$19.99</Text>
                  <Text style={[styles.pricingPeriod, isDark && styles.darkSecondaryText]}>/year</Text>
                </View>
              </View>
              <Text style={styles.pricingSavings}>
                Less than $2/month
              </Text>
              <Text style={[styles.pricingEquivalent, isDark && styles.darkTertiaryText]}>
                Best value
              </Text>
            </TouchableOpacity>

            {/* Monthly — secondary */}
            <TouchableOpacity
              style={[styles.pricingCard, isDark && styles.darkPricingCard]}
              onPress={() => onSelectPlan('premium')}
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
                Full Premium access, billed monthly
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => onSelectPlan('premium')}
          >
            <Text style={styles.ctaButtonText}>Start 7-Day Free Trial</Text>
          </TouchableOpacity>
          <Text style={[styles.finePrint, isDark && styles.darkTertiaryText]}>
            No credit card required. Cancel anytime.
          </Text>

          <View style={[styles.privacyNote, isDark && styles.darkPlanNote]}>
            <Text style={[styles.privacyNoteText, isDark && styles.darkSecondaryText]}>
              🔒 Your library never leaves your device. FiftyList never sees your data.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
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
    borderColor: '#374151',
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
    marginBottom: 16,
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
  ctaButton: {
    backgroundColor: FL.amber,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: FL.amber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaButtonText: {
    fontSize: 17,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  finePrint: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 24,
  },
  privacyNote: {
    backgroundColor: FL.card,
    padding: 18,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderLeftColor: FL.amber,
    borderWidth: 0.5,
    borderColor: FL.border,
    marginBottom: 32,
  },
  darkPlanNote: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderLeftColor: FL.amber,
  },
  privacyNoteText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: FL.textDark,
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});
