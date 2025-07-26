import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { X, BookOpen, Film, Settings, RotateCcw } from 'lucide-react-native';
import { useAppSettings, AppSettings } from '@/hooks/useAppSettings';

interface AppSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  isDark?: boolean;
}

export default function AppSettingsModal({
  visible,
  onClose,
  isDark = false,
}: AppSettingsModalProps) {
  const { settings, updateSettings, resetSettings, isLoading, DEFAULT_SETTINGS } = useAppSettings();
  const [localSettings, setLocalSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local settings when modal opens or settings change
  useEffect(() => {
    if (visible) {
      console.log('📱 Modal opened, syncing settings:', settings);
      setLocalSettings(settings);
    }
  }, [visible, settings]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      console.log('📱 Saving settings:', localSettings);
      await updateSettings(localSettings);
      Alert.alert(
        'Settings Saved',
        'Your default preferences have been updated and will be applied to new items.',
        [{ text: 'OK', onPress: onClose }]
      );
    } catch (error) {
      console.error('📱 Error saving settings:', error);
      Alert.alert(
        'Error',
        'Failed to save settings. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Settings',
      'This will reset all app settings to their default values. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await resetSettings();
              setLocalSettings(DEFAULT_SETTINGS);
              Alert.alert('Settings Reset', 'All settings have been reset to defaults.');
            } catch (error) {
              Alert.alert('Error', 'Failed to reset settings. Please try again.');
            }
          },
        },
      ]
    );
  };

  const FormatSelector = ({
    title,
    options,
    selectedValue,
    onValueChange,
    icon: Icon,
  }: {
    title: string;
    options: { value: string; label: string }[];
    selectedValue: string;
    onValueChange: (value: string) => void;
    icon: React.ComponentType<any>;
  }) => (
    <View style={styles.settingGroup}>
      <View style={styles.settingHeader}>
        <Icon size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
        <Text style={[styles.settingTitle, isDark && styles.darkText]}>
          {title}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.optionsContainer}>
          {options.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.optionButton,
                isDark && styles.darkOptionButton,
                selectedValue === option.value && styles.selectedOption,
                selectedValue === option.value && { backgroundColor: '#3B82F6' },
              ]}
              onPress={() => onValueChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selectedValue === option.value }}
              accessibilityLabel={option.label}
            >
              <Text
                style={[
                  styles.optionText,
                  isDark && styles.darkOptionText,
                  selectedValue === option.value && styles.selectedOptionText,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const SourceInput = ({
    title,
    value,
    onValueChange,
    placeholder,
    icon: Icon,
  }: {
    title: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder: string;
    icon: React.ComponentType<any>;
  }) => (
    <View style={styles.settingGroup}>
      <View style={styles.settingHeader}>
        <Icon size={20} color={isDark ? '#9CA3AF' : '#6B7280'} />
        <Text style={[styles.settingTitle, isDark && styles.darkText]}>
          {title}
        </Text>
      </View>
      <TextInput
        style={[styles.sourceInput, isDark && styles.darkSourceInput]}
        value={value}
        onChangeText={onValueChange}
        placeholder={placeholder}
        placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
        accessibilityLabel={title}
        accessibilityHint={`Set default source for ${title.toLowerCase()}`}
      />
      <Text style={[styles.sourceHint, isDark && styles.darkSecondaryText]}>
        This will be pre-filled when adding new items
      </Text>
    </View>
  );

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
          <Text style={[styles.title, isDark && styles.darkText]}>
            App Settings
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={[styles.loadingText, isDark && styles.darkText]}>
              Loading settings...
            </Text>
          </View>
        ) : (
          <>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              {/* Books Section */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
                  📚 Book Defaults
                </Text>
                <Text style={[styles.sectionDescription, isDark && styles.darkSecondaryText]}>
                  Set default format and source for new books
                </Text>

                <FormatSelector
                  title="Default Book Format"
                  icon={BookOpen}
                  options={[
                    { value: 'text', label: 'Hardcopy' },
                    { value: 'audio', label: 'Audio' },
                    { value: 'ebook', label: 'eBook' },
                  ]}
                  selectedValue={localSettings.defaultBookFormat}
                  onValueChange={(value) => {
                    console.log('📱 Updating book format to:', value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      defaultBookFormat: value as any,
                    }));
                  }}
                />

                <SourceInput
                  title="Default Book Source"
                  icon={BookOpen}
                  value={localSettings.defaultBookSource}
                  onValueChange={(value) => {
                    console.log('📱 Updating book source to:', value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      defaultBookSource: value,
                    }));
                  }}
                  placeholder="e.g., Amazon, Kindle, Libby, Local Library"
                />
              </View>

              {/* Movies Section */}
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
                  🎬 Movie Defaults
                </Text>
                <Text style={[styles.sectionDescription, isDark && styles.darkSecondaryText]}>
                  Set default format and source for new movies
                </Text>

                <FormatSelector
                  title="Default Movie Format"
                  icon={Film}
                  options={[
                    { value: 'streaming', label: 'Streaming' },
                    { value: 'theater', label: 'Theater' },
                    { value: 'bluray', label: 'Blu-ray' },
                    { value: 'dvd', label: 'DVD' },
                  ]}
                  selectedValue={localSettings.defaultMovieFormat}
                  onValueChange={(value) => {
                    console.log('📱 Updating movie format to:', value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      defaultMovieFormat: value as any,
                    }));
                  }}
                />

                <SourceInput
                  title="Default Movie Source"
                  icon={Film}
                  value={localSettings.defaultMovieSource}
                  onValueChange={(value) => {
                    console.log('📱 Updating movie source to:', value);
                    setLocalSettings((prev) => ({
                      ...prev,
                      defaultMovieSource: value,
                    }));
                  }}
                  placeholder="e.g., Netflix, Amazon Prime, Disney+, Local Theater"
                />
              </View>

              {/* Info Section */}
              <View style={[styles.infoSection, isDark && styles.darkInfoSection]}>
                <Settings size={20} color={isDark ? '#60A5FA' : '#3B82F6'} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoTitle, isDark && styles.darkText]}>
                    How Default Settings Work
                  </Text>
                  <Text style={[styles.infoText, isDark && styles.darkSecondaryText]}>
                    • Default format and source will be pre-selected when adding new items{'\n'}
                    • You can still change these values for individual items{'\n'}
                    • Settings only apply to new items, not existing ones{'\n'}
                    • Leave source fields empty if you don't want a default
                  </Text>
                </View>
              </View>

              {/* Current Settings Debug (only in development) */}
              {__DEV__ && (
                <View style={[styles.debugSection, isDark && styles.darkInfoSection]}>
                  <Text style={[styles.debugTitle, isDark && styles.darkText]}>
                    Debug: Current Settings
                  </Text>
                  <Text style={[styles.debugText, isDark && styles.darkSecondaryText]}>
                    Loaded: {JSON.stringify(settings, null, 2)}{'\n\n'}
                    Local: {JSON.stringify(localSettings, null, 2)}
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={[styles.footer, isDark && styles.darkFooter]}>
              <TouchableOpacity
                style={[styles.resetButton, isDark && styles.darkResetButton]}
                onPress={handleReset}
                accessibilityRole="button"
                accessibilityLabel="Reset all settings to defaults"
                disabled={isSaving}
              >
                <RotateCcw size={16} color={isDark ? '#9CA3AF' : '#6B7280'} />
                <Text style={[styles.resetButtonText, isDark && styles.darkResetButtonText]}>
                  Reset to Defaults
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.savingButton]}
                onPress={handleSave}
                accessibilityRole="button"
                accessibilityLabel="Save settings"
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Settings</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 20,
  },
  darkSecondaryText: {
    color: '#9CA3AF',
  },
  settingGroup: {
    marginBottom: 24,
  },
  settingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  optionsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  optionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkOptionButton: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  selectedOption: {
    borderColor: '#3B82F6',
  },
  optionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkOptionText: {
    color: '#D1D5DB',
  },
  selectedOptionText: {
    color: '#FFFFFF',
  },
  sourceInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#111827',
    backgroundColor: '#F9FAFB',
    marginBottom: 6,
  },
  darkSourceInput: {
    borderColor: '#4B5563',
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
  },
  sourceHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  infoSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  darkInfoSection: {
    backgroundColor: '#1F2937',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 18,
  },
  debugSection: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  debugTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#92400E',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#92400E',
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  darkFooter: {
    borderTopColor: '#374151',
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  darkResetButton: {
    backgroundColor: '#374151',
  },
  resetButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkResetButtonText: {
    color: '#D1D5DB',
  },
  saveButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savingButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});