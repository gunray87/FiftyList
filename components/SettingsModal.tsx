import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
  Share,
  Linking,
  Platform,
} from 'react-native';
import { 
  X, 
  Download, 
  Upload, 
  Info, 
  Mail, 
  FileText, 
  ExternalLink,
  Heart,
  Star,
  Shield,
  RotateCcw,
  Settings as SettingsIcon,
  Share2
} from 'lucide-react-native';
import { useFirstLaunch } from '@/hooks/useFirstLaunch';
import { useUserInterests } from '@/hooks/useUserInterests';
import { useSubscription } from '@/hooks/useSubscription';
import SubscriptionStatusCard from './SubscriptionStatusCard';
import UpgradeModal from './UpgradeModal';
import { useOnboarding } from '@/hooks/OnboardingContext';
import { AppSettingsPanel } from './AppSettingsModal';
import { DismissedSuggestionsPanel } from './DismissedSuggestionsModal';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  onExportPress: () => void;
  onImportPress: () => void;
  onSharePress?: () => void;
  isDark?: boolean;
  isExporting?: boolean;
}

export default function SettingsModal({
  visible,
  onClose,
  onExportPress,
  onImportPress,
  onSharePress,
  isDark = false,
  isExporting = false,
}: SettingsModalProps) {
  const [showAbout, setShowAbout] = useState(false);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [showDismissedSuggestions, setShowDismissedSuggestions] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const { resetFirstLaunch } = useFirstLaunch();
  const { resetInterests } = useUserInterests();
  const { retakeOnboarding } = useOnboarding();
  const { subscription, features, subscribeToTier, restorePurchases, isRevenueCatReady } = useSubscription();

  const handleContactPress = () => {
    const email = 'support@fiftylist.app';
    const subject = 'FiftyList App Feedback';
    const body = 'Hi there! I have some feedback about the FiftyList app:\n\n';
    
    const mailtoUrl = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    
    Linking.canOpenURL(mailtoUrl).then((supported) => {
      if (supported) {
        Linking.openURL(mailtoUrl);
      } else {
        Alert.alert(
          'Email Not Available',
          `Please send your feedback to: ${email}`,
          [
            { text: 'Copy Email', onPress: () => {
              if (Platform.OS === 'web') {
                navigator.clipboard?.writeText(email);
              }
            }},
            { text: 'OK' }
          ]
        );
      }
    });
  };

  const handlePrivacyPress = () => {
    Alert.alert(
      'Privacy Policy',
      'FiftyList stores all your data locally on your device. We do not collect, store, or share any personal information. Your reading and watching lists remain completely private.',
      [{ text: 'OK' }]
    );
  };

  const handleTermsPress = () => {
    Alert.alert(
      'Terms of Service',
      'By using FiftyList, you agree to use the app responsibly for personal tracking of your books and movies. The app is provided as-is for your personal use.',
      [{ text: 'OK' }]
    );
  };

  const handleRateApp = () => {
    Alert.alert(
      'Rate FiftyList',
      'Thank you for using FiftyList! Your feedback helps us improve the app.',
      [
        { text: 'Maybe Later', style: 'cancel' },
        { text: 'Rate App', onPress: () => {
          // In a real app, this would open the app store
          Alert.alert('Thank You!', 'This would open your device\'s app store to rate the app.');
        }}
      ]
    );
  };

  const handleShowTour = () => {
    Alert.alert(
      'Show Welcome Tour',
      'This will restart the welcome tour to help you learn about FiftyList features.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Show Tour', onPress: async () => {
          await resetFirstLaunch();
          onClose();
          Alert.alert('Tour Reset', 'The welcome tour will appear when you restart the app or navigate to a different tab and back.');
        }}
      ]
    );
  };

  const handleAppSettingsPress = () => {
    console.log('📱 App Settings button pressed');
    setShowAppSettings(true);
  };

  const handleAppSettingsClose = () => {
    console.log('📱 App Settings modal closing');
    setShowAppSettings(false);
  };

  const handleDismissedSuggestionsClose = () => {
    setShowDismissedSuggestions(false);
  };

  const handleMainModalClose = () => {
    // Close any sub-modals first
    setShowAbout(false);
    setShowAppSettings(false);
    setShowDismissedSuggestions(false);
    setShowUpgradeModal(false);
    // Then close the main modal
    onClose();
  };

  /** One level back inside the settings sheet (Android back / consistent UX). */
  const handleSheetBack = () => {
    if (showAbout) {
      setShowAbout(false);
    } else if (showAppSettings) {
      setShowAppSettings(false);
    } else if (showDismissedSuggestions) {
      setShowDismissedSuggestions(false);
    } else {
      handleMainModalClose();
    }
  };

  const SettingItem = ({ 
    icon: Icon, 
    title, 
    subtitle, 
    onPress, 
    showArrow = true,
    iconColor = isDark ? '#9CA3AF' : '#6B7280',
    disabled = false
  }: {
    icon: React.ComponentType<any>;
    title: string;
    subtitle?: string;
    onPress: () => void;
    showArrow?: boolean;
    iconColor?: string;
    disabled?: boolean;
  }) => (
    <TouchableOpacity 
      style={[
        styles.settingItem, 
        isDark && styles.darkSettingItem,
        disabled && styles.disabledSettingItem
      ]}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.7}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
    >
      <View style={styles.settingItemLeft}>
        <View style={[styles.iconContainer, isDark && styles.darkIconContainer]}>
          <Icon size={20} color={iconColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[styles.settingTitle, isDark && styles.darkText]}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.settingSubtitle, isDark && styles.darkSecondaryText]}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {showArrow && (
        <ExternalLink size={16} color={isDark ? '#6B7280' : '#9CA3AF'} />
      )}
    </TouchableOpacity>
  );

  const SectionHeader = ({ title }: { title: string }) => (
    <Text style={[styles.sectionHeader, isDark && styles.darkSecondaryText]}>
      {title}
    </Text>
  );

  const settingsSheetVisible = visible && !showUpgradeModal;

  return (
    <>
      {/* Single sheet: swap sub-screens in-place (avoids closing + reopening a second modal). */}
      <Modal
        visible={settingsSheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleSheetBack}
      >
        {showAbout ? (
          <View style={[styles.container, isDark && styles.darkContainer]}>
            <View style={[styles.header, isDark && styles.darkHeader]}>
              <Text style={[styles.title, isDark && styles.darkText]}>About FiftyList</Text>
              <TouchableOpacity
                onPress={() => setShowAbout(false)}
                style={styles.closeButton}
                accessibilityRole="button"
                accessibilityLabel="Back to Settings"
              >
                <X size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <Text style={[styles.aboutText, isDark && styles.darkText]}>
                <Text style={styles.aboutBold}>FiftyList</Text> is your personal companion for tracking books and movies. Set yearly goals, organize your lists, and discover your reading and watching patterns.
              </Text>
              <Text style={[styles.aboutSubheading, isDark && styles.darkText]}>Features:</Text>
              <Text style={[styles.aboutText, isDark && styles.darkText]}>
                • Track completed, in-progress, planned, and favorite items{'\n'}
                • Set and monitor yearly goals{'\n'}
                • Detailed statistics and progress tracking{'\n'}
                • Export and import your data{'\n'}
                • Beautiful, intuitive interface{'\n'}
                • Complete privacy - all data stays on your device
              </Text>
              <Text style={[styles.aboutSubheading, isDark && styles.darkText]}>Privacy First:</Text>
              <Text style={[styles.aboutText, isDark && styles.darkText]}>
                Your data never leaves your device. We don't collect, store, or share any personal information. Your reading and watching habits remain completely private.
              </Text>
              <View style={styles.aboutVersion}>
                <Text style={[styles.aboutVersionText, isDark && styles.darkSecondaryText]}>Version 1.0.0</Text>
                <Text style={[styles.aboutVersionText, isDark && styles.darkSecondaryText]}>Built with React Native & Expo</Text>
              </View>
            </ScrollView>
          </View>
        ) : showAppSettings ? (
          <AppSettingsPanel onClose={handleAppSettingsClose} isDark={isDark} />
        ) : showDismissedSuggestions ? (
          <DismissedSuggestionsPanel onClose={handleDismissedSuggestionsClose} isDark={isDark} />
        ) : (
        <View style={[styles.container, isDark && styles.darkContainer]}>
          <View style={[styles.header, isDark && styles.darkHeader]}>
            <Text style={[styles.title, isDark && styles.darkText]}>
              Settings
            </Text>
            <TouchableOpacity onPress={handleMainModalClose} style={styles.closeButton}>
              <X size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Subscription Section */}
            <SectionHeader title="Subscription" />
            <SubscriptionStatusCard
              subscription={subscription}
              features={features}
              onUpgradePress={() => {
                console.log('⚙️ Opening upgrade modal from Settings');
                setShowUpgradeModal(true);
              }}
              isDark={isDark}
            />
            <Text style={[styles.subscriptionDebugText, isDark && styles.darkTertiaryText]}>
              Billing status: {isRevenueCatReady ? 'RevenueCat configured' : 'RevenueCat not configured'} ·
              {' '}Tier: {subscription?.tier ?? 'none'}
            </Text>
            {isRevenueCatReady && (
              <View style={[styles.section, isDark && styles.darkSection, styles.restoreSection]}>
                <SettingItem
                  icon={RotateCcw}
                  title="Restore Purchases"
                  subtitle="Recover premium access on this device"
                  onPress={async () => {
                    try {
                      await restorePurchases();
                      Alert.alert('Restore Complete', 'Your purchase status has been refreshed.');
                    } catch {
                      Alert.alert('Restore Failed', 'Unable to restore purchases right now.');
                    }
                  }}
                  iconColor="#6366F1"
                />
              </View>
            )}

            {/* App Settings Section */}
            <SectionHeader title="App Settings" />
            <View style={[styles.section, isDark && styles.darkSection]}>
              <SettingItem
                icon={SettingsIcon}
                title="Default Preferences"
                subtitle="Set default format and source for new items"
                onPress={handleAppSettingsPress}
                iconColor="#8B5CF6"
              />
              <View style={[styles.separator, isDark && styles.darkSeparator]} />
              <SettingItem
                icon={Info}
                title="Dismissed Suggestions"
                subtitle="Manage your dismissed recommendations"
                onPress={() => setShowDismissedSuggestions(true)}
                iconColor="#8B5CF6"
              />
            </View>

            {/* Data Management Section */}
            <SectionHeader title="Data Management" />
            <View style={[styles.section, isDark && styles.darkSection]}>
              <SettingItem
                icon={Download}
                title={isExporting ? "Exporting..." : "Export Data"}
                subtitle={isExporting ? "Preparing your data..." : "Share or backup your complete list"}
                onPress={() => {
                  if (!isExporting) {
                    onExportPress();
                    // Close modal immediately since export will show its own alert
                    handleMainModalClose();
                  }
                }}
                iconColor="#10B981"
                disabled={isExporting}
              />
              <View style={[styles.separator, isDark && styles.darkSeparator]} />
              <SettingItem
                icon={Upload}
                title="Import Data"
                subtitle="Add books and movies from text"
                onPress={() => {
                  onImportPress();
                  handleMainModalClose();
                }}
                iconColor="#3B82F6"
              />
              <View style={[styles.separator, isDark && styles.darkSeparator]} />
              <SettingItem
                icon={Share2}
                title="Share Activity"
                subtitle="Share your reading and watching progress"
                onPress={() => {
                  onSharePress?.();
                  handleMainModalClose();
                }}
                iconColor="#8B5CF6"
              />
            </View>

            {/* Help Section */}
            <SectionHeader title="Help" />
            <View style={[styles.section, isDark && styles.darkSection]}>
              <SettingItem
                icon={RotateCcw}
                title="Show Welcome Tour"
                subtitle="Learn about FiftyList features"
                onPress={handleShowTour}
                iconColor="#8B5CF6"
              />
              <View style={[styles.separator, isDark && styles.darkSeparator]} />
              <SettingItem
                icon={Heart}
                title="Retake Interest Survey"
                subtitle="Update your reading and watching preferences"
                onPress={() => {
                  resetInterests();
                  retakeOnboarding();
                  handleMainModalClose();
                }}
                iconColor="#F59E0B"
              />
            </View>

            {/* About Section */}
            <SectionHeader title="About" />
            <View style={[styles.section, isDark && styles.darkSection]}>
              <SettingItem
                icon={Info}
                title="About FiftyList"
                subtitle="Version 1.0.0"
                onPress={() => setShowAbout(true)}
                iconColor="#8B5CF6"
              />
              <View style={[styles.separator, isDark && styles.darkSeparator]} />
              <SettingItem
                icon={Star}
                title="Rate the App"
                subtitle="Help us improve with your feedback"
                onPress={handleRateApp}
                iconColor="#F59E0B"
              />
            </View>

            {/* Support Section */}
            <SectionHeader title="Support" />
            <View style={[styles.section, isDark && styles.darkSection]}>
              <SettingItem
                icon={Mail}
                title="Contact Support"
                subtitle="Get help or send feedback"
                onPress={handleContactPress}
                iconColor="#EF4444"
              />
            </View>

            {/* Legal Section */}
            <SectionHeader title="Legal" />
            <View style={[styles.section, isDark && styles.darkSection]}>
              <SettingItem
                icon={Shield}
                title="Privacy Policy"
                subtitle="How we protect your data"
                onPress={handlePrivacyPress}
                iconColor="#6B7280"
              />
              <View style={[styles.separator, isDark && styles.darkSeparator]} />
              <SettingItem
                icon={FileText}
                title="Terms of Service"
                subtitle="App usage terms and conditions"
                onPress={handleTermsPress}
                iconColor="#6B7280"
              />
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, isDark && styles.darkTertiaryText]}>
                Made with <Heart size={12} color="#EF4444" /> for book and movie lovers
              </Text>
              <Text style={[styles.footerText, isDark && styles.darkTertiaryText]}>
                © 2025 FiftyList
              </Text>
            </View>
          </ScrollView>
        </View>
        )}
      </Modal>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => {
          console.log('❌ Closing upgrade modal');
          setShowUpgradeModal(false);
        }}
        onSelectPlan={async (tier) => {
          try {
            console.log(`💳 User selected ${tier} tier`);
            await subscribeToTier(tier);
            setShowUpgradeModal(false);
            console.log('✅ Upgrade completed successfully');
          } catch (error) {
            console.error('❌ Upgrade failed:', error);
            // In a real app, you'd show an error message
          }
        }}
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
  sectionHeader: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  darkSecondaryText: {
    color: '#9CA3AF',
  },
  section: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    overflow: 'hidden',
  },
  darkSection: {
    backgroundColor: '#1F2937',
  },
  restoreSection: {
    marginTop: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
  },
  darkSettingItem: {
    backgroundColor: '#1F2937',
  },
  disabledSettingItem: {
    opacity: 0.5,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  darkIconContainer: {
    backgroundColor: '#374151',
  },
  textContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#111827',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginLeft: 68,
  },
  darkSeparator: {
    backgroundColor: '#374151',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 4,
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  darkTertiaryText: {
    color: '#6B7280',
  },
  subscriptionDebugText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 8,
    marginHorizontal: 4,
  },
  // About Modal Styles
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  aboutModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 500,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  darkAboutModal: {
    backgroundColor: '#1F2937',
  },
  aboutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  aboutTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  aboutCloseButton: {
    padding: 4,
  },
  aboutContent: {
    padding: 20,
  },
  aboutText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    lineHeight: 20,
    marginBottom: 16,
  },
  aboutBold: {
    fontFamily: 'Inter-SemiBold',
  },
  aboutSubheading: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginTop: 8,
    marginBottom: 8,
  },
  aboutVersion: {
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 4,
  },
  aboutVersionText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
});