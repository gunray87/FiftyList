import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  Share,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { X, Share2, Calendar, Filter, Eye, Copy, Check, Bell } from 'lucide-react-native';
import { SharingOptions, ActivityType, ItemType } from '@/types';
import { ActivitySharing } from '@/utils/activitySharing';
import * as Clipboard from 'expo-clipboard';
import { alertAfterShareError, runAfterShareSheetDismissed } from '@/utils/postShareFlow';
import NotificationSettingsModal from './NotificationSettingsModal';

interface ActivitySharingModalProps {
  visible: boolean;
  onClose: () => void;
  primaryColor: string;
  isDark?: boolean;
}

const TIME_RANGE_OPTIONS = [
  { key: 'lastWeek', label: 'Last Week' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: 'last3Months', label: 'Last 3 Months' },
  { key: 'last6Months', label: 'Last 6 Months' },
  { key: 'lastYear', label: 'Last Year' },
  { key: 'custom', label: 'Custom Range' },
];

const ACTIVITY_TYPE_OPTIONS = [
  { key: 'added', label: 'Added Items' },
  { key: 'completed', label: 'Completed Items' },
  { key: 'started', label: 'Started Items' },
  { key: 'moved', label: 'Moved Items' },
  { key: 'rated', label: 'Rated Items' },
];

const ITEM_TYPE_OPTIONS = [
  { key: 'book', label: 'Books' },
  { key: 'movie', label: 'Movies' },
];

const FORMAT_OPTIONS = [
  { key: 'summary', label: 'Summary' },
  { key: 'detailed', label: 'Detailed' },
  { key: 'list', label: 'List' },
];

export default function ActivitySharingModal({
  visible,
  onClose,
  primaryColor,
  isDark = false,
}: ActivitySharingModalProps) {
  const [sharingOptions, setSharingOptions] = useState<SharingOptions>({
    timeRange: 'lastMonth',
    includeTypes: ['added', 'completed', 'started', 'rated'],
    includeCategories: ['completed', 'inProgress', 'planned'],
    includeItemTypes: ['book', 'movie'],
    format: 'summary',
  });

  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  // Generate preview when options change
  useEffect(() => {
    if (visible) {
      generatePreview();
    }
  }, [visible, sharingOptions, customStartDate, customEndDate]);

  const generatePreview = async () => {
    setIsGenerating(true);
    try {
      const options = {
        ...sharingOptions,
        customStartDate: sharingOptions.timeRange === 'custom' ? customStartDate : undefined,
        customEndDate: sharingOptions.timeRange === 'custom' ? customEndDate : undefined,
      };
      
      const content = await ActivitySharing.generateShareableContent(options);
      setPreviewText(content);
    } catch (error) {
      console.error('Error generating preview:', error);
      setPreviewText('Error generating preview. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShare = async () => {
    const trimmed = previewText.trim();
    if (!trimmed || trimmed.startsWith('Error generating preview')) {
      Alert.alert('Nothing to share', 'Choose filters with activity in this range, or add items to your lists first.');
      return;
    }

    const shareContent = {
      message: trimmed,
      title: 'FiftyList — My Reading & Watching Activity',
    };

    const presentShare = async () => {
      try {
        const result = await Share.share(shareContent);
        if (result.action === Share.dismissedAction) return;
      } catch (err) {
        console.error('Error sharing content:', err);
        alertAfterShareError('Error', 'Failed to share content. Please try again.');
      }
    };

    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share(shareContent);
        } else {
          await navigator.clipboard.writeText(trimmed);
          Alert.alert('Copied!', 'Content copied to clipboard');
        }
        return;
      }

      // iOS: do not present the share sheet from inside a pageSheet modal.
      if (Platform.OS === 'ios') {
        onClose();
        runAfterShareSheetDismissed(() => {
          void presentShare();
        });
        return;
      }

      await presentShare();
    } catch (error) {
      console.error('Error sharing content:', error);
      alertAfterShareError('Error', 'Failed to share content. Please try again.');
    }
  };

  const handleCopyToClipboard = async () => {
    const trimmed = previewText.trim();
    if (!trimmed || trimmed.startsWith('Error generating preview')) {
      Alert.alert('Nothing to copy', 'Choose filters with activity in this range, or add items to your lists first.');
      return;
    }

    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(trimmed);
      } else {
        await Clipboard.setStringAsync(trimmed);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      Alert.alert('Error', 'Failed to copy to clipboard');
    }
  };

  const updateSharingOptions = (updates: Partial<SharingOptions>) => {
    setSharingOptions(prev => ({ ...prev, ...updates }));
  };

  const toggleActivityType = (type: ActivityType) => {
    const current = sharingOptions.includeTypes;
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    updateSharingOptions({ includeTypes: updated });
  };

  const toggleItemType = (type: ItemType) => {
    const current = sharingOptions.includeItemTypes;
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    updateSharingOptions({ includeItemTypes: updated });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.container, isDark && styles.darkContainer]}>
        {/* Header */}
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <Text style={[styles.headerTitle, isDark && styles.darkHeaderTitle]}>
            Share Activity
          </Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              onPress={() => setShowNotificationSettings(true)} 
              style={styles.notificationButton}
            >
              <Bell size={20} color={isDark ? '#FFFFFF' : '#000000'} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color={isDark ? '#FFFFFF' : '#000000'} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Time Range Selection */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Calendar size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Time Range
              </Text>
            </View>
            
            <View style={styles.optionsGrid}>
              {TIME_RANGE_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionChip,
                    sharingOptions.timeRange === option.key && [styles.selectedChip, { backgroundColor: primaryColor }],
                    isDark && styles.darkOptionChip,
                  ]}
                  onPress={() => updateSharingOptions({ timeRange: option.key as any })}
                >
                  <Text style={[
                    styles.optionChipText,
                    sharingOptions.timeRange === option.key && styles.selectedChipText,
                    isDark && styles.darkOptionChipText,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom Date Range */}
            {sharingOptions.timeRange === 'custom' && (
              <View style={styles.customDateContainer}>
                <TextInput
                  style={[styles.dateInput, isDark && styles.darkDateInput]}
                  placeholder="Start Date (YYYY-MM-DD)"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  value={customStartDate}
                  onChangeText={setCustomStartDate}
                />
                <TextInput
                  style={[styles.dateInput, isDark && styles.darkDateInput]}
                  placeholder="End Date (YYYY-MM-DD)"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  value={customEndDate}
                  onChangeText={setCustomEndDate}
                />
              </View>
            )}
          </View>

          {/* Activity Types */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Filter size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Activity Types
              </Text>
            </View>
            
            <View style={styles.optionsGrid}>
              {ACTIVITY_TYPE_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionChip,
                    sharingOptions.includeTypes.includes(option.key as ActivityType) && 
                    [styles.selectedChip, { backgroundColor: primaryColor }],
                    isDark && styles.darkOptionChip,
                  ]}
                  onPress={() => toggleActivityType(option.key as ActivityType)}
                >
                  <Text style={[
                    styles.optionChipText,
                    sharingOptions.includeTypes.includes(option.key as ActivityType) && styles.selectedChipText,
                    isDark && styles.darkOptionChipText,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Item Types */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Filter size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Item Types
              </Text>
            </View>
            
            <View style={styles.optionsGrid}>
              {ITEM_TYPE_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionChip,
                    sharingOptions.includeItemTypes.includes(option.key as ItemType) && 
                    [styles.selectedChip, { backgroundColor: primaryColor }],
                    isDark && styles.darkOptionChip,
                  ]}
                  onPress={() => toggleItemType(option.key as ItemType)}
                >
                  <Text style={[
                    styles.optionChipText,
                    sharingOptions.includeItemTypes.includes(option.key as ItemType) && styles.selectedChipText,
                    isDark && styles.darkOptionChipText,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Format Selection */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Eye size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Format
              </Text>
            </View>
            
            <View style={styles.optionsGrid}>
              {FORMAT_OPTIONS.map(option => (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.optionChip,
                    sharingOptions.format === option.key && [styles.selectedChip, { backgroundColor: primaryColor }],
                    isDark && styles.darkOptionChip,
                  ]}
                  onPress={() => updateSharingOptions({ format: option.key as any })}
                >
                  <Text style={[
                    styles.optionChipText,
                    sharingOptions.format === option.key && styles.selectedChipText,
                    isDark && styles.darkOptionChipText,
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Preview */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Eye size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Preview
              </Text>
            </View>
            <Text style={[styles.previewHint, isDark && styles.darkPreviewHint]}>
              Built from your saved lists — titles and authors match what you have now. Removed items are not included.
            </Text>
            
            <View style={[styles.previewContainer, isDark && styles.darkPreviewContainer]}>
              {isGenerating ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={primaryColor} />
                  <Text style={[styles.loadingText, isDark && styles.darkLoadingText]}>
                    Generating preview...
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.previewScroll}>
                  <Text style={[styles.previewText, isDark && styles.darkPreviewText]}>
                    {previewText}
                  </Text>
                </ScrollView>
              )}
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={[styles.footer, isDark && styles.darkFooter]}>
          <TouchableOpacity
            style={[styles.actionButton, styles.copyButton, isDark && styles.darkCopyButton]}
            onPress={handleCopyToClipboard}
          >
            {isCopied ? (
              <Check size={20} color="#10B981" />
            ) : (
              <Copy size={20} color="#6B7280" />
            )}
            <Text style={[styles.actionButtonText, isDark && styles.darkActionButtonText]}>
              {isCopied ? 'Copied!' : 'Copy'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.shareButton, { backgroundColor: primaryColor }]}
            onPress={handleShare}
          >
            <Share2 size={20} color="#FFFFFF" />
            <Text style={styles.shareButtonText}>Share</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        visible={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
        primaryColor={primaryColor}
        isDark={isDark}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  darkContainer: {
    backgroundColor: '#1F2937',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  darkHeader: {
    backgroundColor: '#374151',
    borderBottomColor: '#4B5563',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  darkHeaderTitle: {
    color: '#FFFFFF',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationButton: {
    padding: 4,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginVertical: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkSection: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginLeft: 8,
  },
  darkSectionTitle: {
    color: '#FFFFFF',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkOptionChip: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  selectedChip: {
    borderColor: 'transparent',
  },
  optionChipText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkOptionChipText: {
    color: '#9CA3AF',
  },
  selectedChipText: {
    color: '#FFFFFF',
  },
  customDateContainer: {
    marginTop: 12,
    gap: 8,
  },
  dateInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  darkDateInput: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
    color: '#FFFFFF',
  },
  previewHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 10,
    lineHeight: 17,
  },
  darkPreviewHint: {
    color: '#9CA3AF',
  },
  previewContainer: {
    height: 200,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkPreviewContainer: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  darkLoadingText: {
    color: '#9CA3AF',
  },
  previewScroll: {
    flex: 1,
    padding: 12,
  },
  previewText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    lineHeight: 20,
  },
  darkPreviewText: {
    color: '#D1D5DB',
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  darkFooter: {
    backgroundColor: '#374151',
    borderTopColor: '#4B5563',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  copyButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkCopyButton: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  shareButton: {
    borderWidth: 0,
  },
  actionButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  darkActionButtonText: {
    color: '#9CA3AF',
  },
  shareButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});
