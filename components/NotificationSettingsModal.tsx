import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { X, Bell, Calendar, Clock, Target, Activity } from 'lucide-react-native';
import { NotificationSettings } from '@/utils/notificationService';
import { notificationService } from '@/utils/notificationService';

interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  primaryColor: string;
  isDark?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}${getDaySuffix(i + 1)}`,
}));

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

export default function NotificationSettingsModal({
  visible,
  onClose,
  primaryColor,
  isDark = false,
}: NotificationSettingsModalProps) {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    weeklyReminder: {
      enabled: false,
      dayOfWeek: 0,
      time: '18:00', // 6:00 PM
    },
    monthlyReminder: {
      enabled: false,
      dayOfMonth: 1,
      time: '18:00', // 6:00 PM
    },
    milestoneNotifications: {
      enabled: false,
      completionThreshold: 10,
      additionThreshold: 25,
    },
    activityThreshold: {
      enabled: false,
      threshold: 5,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showHourModal, setShowHourModal] = useState(false);
  const [showMinuteModal, setShowMinuteModal] = useState(false);
  const [selectedType, setSelectedType] = useState<'weekly' | 'monthly'>('weekly');

  // Load settings when modal opens
  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  const loadSettings = async () => {
    try {
      const savedSettings = await notificationService.getSettings();
      setSettings(savedSettings);
    } catch (error) {
      console.error('Error loading notification settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsLoading(true);
    try {
      await notificationService.updateSettings(settings);
      Alert.alert('Success', 'Notification settings saved successfully!');
      onClose();
    } catch (error) {
      console.error('Error saving notification settings:', error);
      Alert.alert('Error', 'Failed to save notification settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = (updates: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const updateWeeklyReminder = (updates: Partial<NotificationSettings['weeklyReminder']>) => {
    setSettings(prev => ({
      ...prev,
      weeklyReminder: { ...prev.weeklyReminder, ...updates }
    }));
  };

  const updateMonthlyReminder = (updates: Partial<NotificationSettings['monthlyReminder']>) => {
    setSettings(prev => ({
      ...prev,
      monthlyReminder: { ...prev.monthlyReminder, ...updates }
    }));
  };

  const updateMilestoneNotifications = (updates: Partial<NotificationSettings['milestoneNotifications']>) => {
    setSettings(prev => ({
      ...prev,
      milestoneNotifications: { ...prev.milestoneNotifications, ...updates }
    }));
  };

  const updateActivityThreshold = (updates: Partial<NotificationSettings['activityThreshold']>) => {
    setSettings(prev => ({
      ...prev,
      activityThreshold: { ...prev.activityThreshold, ...updates }
    }));
  };

  // Time helper functions
  const getDisplayHour = (time24: string): string => {
    try {
      const [hours] = time24.split(':').map(Number);
      let displayHour = hours;
      if (displayHour === 0) displayHour = 12;
      else if (displayHour > 12) displayHour -= 12;
      return displayHour.toString().padStart(2, '0');
    } catch (error) {
      return '06';
    }
  };

  const getDisplayMinute = (time24: string): string => {
    try {
      const [, minutes] = time24.split(':').map(Number);
      return minutes.toString().padStart(2, '0');
    } catch (error) {
      return '00';
    }
  };

  const getDisplayAmPm = (time24: string): string => {
    try {
      const [hours] = time24.split(':').map(Number);
      return hours >= 12 ? 'PM' : 'AM';
    } catch (error) {
      return 'PM';
    }
  };

  const showHourPicker = (type: 'weekly' | 'monthly') => {
    setSelectedType(type);
    setShowHourModal(true);
  };

  const showMinutePicker = (type: 'weekly' | 'monthly') => {
    setSelectedType(type);
    setShowMinuteModal(true);
  };

  const toggleAmPm = (type: 'weekly' | 'monthly') => {
    const currentTime = type === 'weekly' ? settings.weeklyReminder.time : settings.monthlyReminder.time;
    const [hours, minutes] = currentTime.split(':').map(Number);
    let newHours = hours;
    
    if (hours >= 12) {
      newHours = hours - 12;
    } else {
      newHours = hours + 12;
    }
    
    const newTime = `${newHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    
    if (type === 'weekly') {
      updateWeeklyReminder({ time: newTime });
    } else {
      updateMonthlyReminder({ time: newTime });
    }
  };

  const updateTime = (hour: number, minute: number, type: 'weekly' | 'monthly') => {
    const newTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    if (type === 'weekly') {
      updateWeeklyReminder({ time: newTime });
    } else {
      updateMonthlyReminder({ time: newTime });
    }
  };

  const testNotification = async () => {
    try {
      await notificationService.scheduleCustomReminder(
        '🔔 Test Notification',
        'This is a test notification from FiftyList!',
        new Date(Date.now() + 5000) // 5 seconds from now
      );
      Alert.alert('Test Notification', 'A test notification will appear in 5 seconds!');
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert('Error', 'Failed to send test notification. Please check your notification permissions.');
    }
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
            Notification Settings
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={isDark ? '#FFFFFF' : '#000000'} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Global Toggle */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Bell size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Notifications
              </Text>
            </View>
            
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                Enable Notifications
              </Text>
              <Switch
                value={settings.enabled}
                onValueChange={(value) => updateSettings({ enabled: value })}
                trackColor={{ false: '#E5E7EB', true: `${primaryColor}40` }}
                thumbColor={settings.enabled ? primaryColor : '#FFFFFF'}
              />
            </View>
          </View>

          {/* Weekly Reminders */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Calendar size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Weekly Reminders
              </Text>
            </View>
            
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                Weekly Sharing Reminder
              </Text>
              <Switch
                value={settings.weeklyReminder.enabled}
                onValueChange={(value) => updateWeeklyReminder({ enabled: value })}
                trackColor={{ false: '#E5E7EB', true: `${primaryColor}40` }}
                thumbColor={settings.weeklyReminder.enabled ? primaryColor : '#FFFFFF'}
              />
            </View>

            {settings.weeklyReminder.enabled && (
              <View style={styles.subSettings}>
                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Day of Week
                  </Text>
                  <View style={styles.pickerContainer}>
                    {DAYS_OF_WEEK.map(day => (
                      <TouchableOpacity
                        key={day.value}
                        style={[
                          styles.pickerOption,
                          settings.weeklyReminder.dayOfWeek === day.value && 
                          [styles.selectedPickerOption, { backgroundColor: primaryColor }],
                          isDark && styles.darkPickerOption,
                        ]}
                        onPress={() => updateWeeklyReminder({ dayOfWeek: day.value })}
                      >
                        <Text style={[
                          styles.pickerOptionText,
                          settings.weeklyReminder.dayOfWeek === day.value && styles.selectedPickerOptionText,
                          isDark && styles.darkPickerOptionText,
                        ]}>
                          {day.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Time
                  </Text>
                  <View style={styles.timePickerContainer}>
                    {/* Hour Picker */}
                    <TouchableOpacity
                      style={[styles.timePickerButton, isDark && styles.darkTimePickerButton]}
                      onPress={() => showHourPicker('weekly')}
                    >
                      <Text style={[styles.timePickerText, isDark && styles.darkTimePickerText]}>
                        {getDisplayHour(settings.weeklyReminder.time)}
                      </Text>
                    </TouchableOpacity>
                    
                    <Text style={[styles.timeSeparator, isDark && styles.darkText]}>:</Text>
                    
                    {/* Minute Picker */}
                    <TouchableOpacity
                      style={[styles.timePickerButton, isDark && styles.darkTimePickerButton]}
                      onPress={() => showMinutePicker('weekly')}
                    >
                      <Text style={[styles.timePickerText, isDark && styles.darkTimePickerText]}>
                        {getDisplayMinute(settings.weeklyReminder.time)}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* AM/PM Toggle */}
                    <TouchableOpacity
                      style={[styles.ampmButton, isDark && styles.darkAmpmButton]}
                      onPress={() => toggleAmPm('weekly')}
                    >
                      <Text style={[styles.ampmText, isDark && styles.darkAmpmText]}>
                        {getDisplayAmPm(settings.weeklyReminder.time)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Monthly Reminders */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Calendar size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Monthly Reminders
              </Text>
            </View>
            
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                Monthly Sharing Reminder
              </Text>
              <Switch
                value={settings.monthlyReminder.enabled}
                onValueChange={(value) => updateMonthlyReminder({ enabled: value })}
                trackColor={{ false: '#E5E7EB', true: `${primaryColor}40` }}
                thumbColor={settings.monthlyReminder.enabled ? primaryColor : '#FFFFFF'}
              />
            </View>

            {settings.monthlyReminder.enabled && (
              <View style={styles.subSettings}>
                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Day of Month
                  </Text>
                  <View style={styles.pickerContainer}>
                    {DAYS_OF_MONTH.slice(0, 10).map(day => (
                      <TouchableOpacity
                        key={day.value}
                        style={[
                          styles.pickerOption,
                          settings.monthlyReminder.dayOfMonth === day.value && 
                          [styles.selectedPickerOption, { backgroundColor: primaryColor }],
                          isDark && styles.darkPickerOption,
                        ]}
                        onPress={() => updateMonthlyReminder({ dayOfMonth: day.value })}
                      >
                        <Text style={[
                          styles.pickerOptionText,
                          settings.monthlyReminder.dayOfMonth === day.value && styles.selectedPickerOptionText,
                          isDark && styles.darkPickerOptionText,
                        ]}>
                          {day.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Time
                  </Text>
                  <View style={styles.timePickerContainer}>
                    {/* Hour Picker */}
                    <TouchableOpacity
                      style={[styles.timePickerButton, isDark && styles.darkTimePickerButton]}
                      onPress={() => showHourPicker('monthly')}
                    >
                      <Text style={[styles.timePickerText, isDark && styles.darkTimePickerText]}>
                        {getDisplayHour(settings.monthlyReminder.time)}
                      </Text>
                    </TouchableOpacity>
                    
                    <Text style={[styles.timeSeparator, isDark && styles.darkText]}>:</Text>
                    
                    {/* Minute Picker */}
                    <TouchableOpacity
                      style={[styles.timePickerButton, isDark && styles.darkTimePickerButton]}
                      onPress={() => showMinutePicker('monthly')}
                    >
                      <Text style={[styles.timePickerText, isDark && styles.darkTimePickerText]}>
                        {getDisplayMinute(settings.monthlyReminder.time)}
                      </Text>
                    </TouchableOpacity>
                    
                    {/* AM/PM Toggle */}
                    <TouchableOpacity
                      style={[styles.ampmButton, isDark && styles.darkAmpmButton]}
                      onPress={() => toggleAmPm('monthly')}
                    >
                      <Text style={[styles.ampmText, isDark && styles.darkAmpmText]}>
                        {getDisplayAmPm(settings.monthlyReminder.time)}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Milestone Notifications */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Target size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Milestone Notifications
              </Text>
            </View>
            
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                Milestone Alerts
              </Text>
              <Switch
                value={settings.milestoneNotifications.enabled}
                onValueChange={(value) => updateMilestoneNotifications({ enabled: value })}
                trackColor={{ false: '#E5E7EB', true: `${primaryColor}40` }}
                thumbColor={settings.milestoneNotifications.enabled ? primaryColor : '#FFFFFF'}
              />
            </View>

            {settings.milestoneNotifications.enabled && (
              <View style={styles.subSettings}>
                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Completion Threshold
                  </Text>
                  <TextInput
                    style={[styles.numberInput, isDark && styles.darkNumberInput]}
                    value={settings.milestoneNotifications.completionThreshold.toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 1;
                      updateMilestoneNotifications({ completionThreshold: value });
                    }}
                    placeholder="10"
                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Addition Threshold
                  </Text>
                  <TextInput
                    style={[styles.numberInput, isDark && styles.darkNumberInput]}
                    value={settings.milestoneNotifications.additionThreshold.toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 1;
                      updateMilestoneNotifications({ additionThreshold: value });
                    }}
                    placeholder="25"
                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Activity Threshold */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Activity size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Activity Threshold
              </Text>
            </View>
            
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                Activity Alerts
              </Text>
              <Switch
                value={settings.activityThreshold.enabled}
                onValueChange={(value) => updateActivityThreshold({ enabled: value })}
                trackColor={{ false: '#E5E7EB', true: `${primaryColor}40` }}
                thumbColor={settings.activityThreshold.enabled ? primaryColor : '#FFFFFF'}
              />
            </View>

            {settings.activityThreshold.enabled && (
              <View style={styles.subSettings}>
                <View style={styles.settingRow}>
                  <Text style={[styles.settingLabel, isDark && styles.darkText]}>
                    Activity Threshold
                  </Text>
                  <TextInput
                    style={[styles.numberInput, isDark && styles.darkNumberInput]}
                    value={settings.activityThreshold.threshold.toString()}
                    onChangeText={(text) => {
                      const value = parseInt(text) || 1;
                      updateActivityThreshold({ threshold: value });
                    }}
                    placeholder="5"
                    placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                    keyboardType="numeric"
                  />
                </View>
              </View>
            )}
          </View>

          {/* Test Notification */}
          <View style={[styles.section, isDark && styles.darkSection]}>
            <View style={styles.sectionHeader}>
              <Bell size={20} color={primaryColor} />
              <Text style={[styles.sectionTitle, isDark && styles.darkSectionTitle]}>
                Test Notifications
              </Text>
            </View>
            
            <TouchableOpacity
              style={[styles.testButton, { backgroundColor: primaryColor }]}
              onPress={testNotification}
            >
              <Text style={styles.testButtonText}>Send Test Notification</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Footer */}
        <View style={[styles.footer, isDark && styles.darkFooter]}>
          <TouchableOpacity
            style={[styles.footerButton, styles.cancelButton, isDark && styles.darkCancelButton]}
            onPress={onClose}
          >
            <Text style={[styles.footerButtonText, isDark && styles.darkFooterButtonText]}>
              Cancel
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.footerButton, styles.saveButton, { backgroundColor: primaryColor }]}
            onPress={saveSettings}
            disabled={isLoading}
          >
            <Text style={styles.saveButtonText}>
              {isLoading ? 'Saving...' : 'Save Settings'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Hour Picker Modal */}
      <Modal
        visible={showHourModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowHourModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModal, isDark && styles.darkPickerModal]}>
            <View style={[styles.pickerHeader, isDark && styles.darkPickerHeader]}>
              <Text style={[styles.pickerTitle, isDark && styles.darkPickerTitle]}>
                Select Hour
              </Text>
              <TouchableOpacity onPress={() => setShowHourModal(false)}>
                <X size={24} color={isDark ? '#FFFFFF' : '#000000'} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.pickerContent}>
              <View style={styles.hourGrid}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => (
                  <TouchableOpacity
                    key={hour}
                    style={[styles.hourOption, isDark && styles.darkHourOption]}
                    onPress={() => {
                      const currentTime = selectedType === 'weekly' ? settings.weeklyReminder.time : settings.monthlyReminder.time;
                      const [currentHours, minutes] = currentTime.split(':').map(Number);
                      const isAM = currentHours < 12;
                      let newHours = hour;
                      
                      if (!isAM && hour !== 12) {
                        newHours = hour + 12;
                      } else if (isAM && hour === 12) {
                        newHours = 0;
                      }
                      
                      updateTime(newHours, minutes, selectedType);
                      setShowHourModal(false);
                    }}
                  >
                    <Text style={[styles.hourOptionText, isDark && styles.darkHourOptionText]}>
                      {hour.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Minute Picker Modal */}
      <Modal
        visible={showMinuteModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowMinuteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.pickerModal, isDark && styles.darkPickerModal]}>
            <View style={[styles.pickerHeader, isDark && styles.darkPickerHeader]}>
              <Text style={[styles.pickerTitle, isDark && styles.darkPickerTitle]}>
                Select Minutes
              </Text>
              <TouchableOpacity onPress={() => setShowMinuteModal(false)}>
                <X size={24} color={isDark ? '#FFFFFF' : '#000000'} />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.pickerContent}>
              <View style={styles.minuteGrid}>
                {Array.from({ length: 12 }, (_, i) => i * 5).map(minute => (
                  <TouchableOpacity
                    key={minute}
                    style={[styles.minuteOption, isDark && styles.darkMinuteOption]}
                    onPress={() => {
                      const currentTime = selectedType === 'weekly' ? settings.weeklyReminder.time : settings.monthlyReminder.time;
                      const [hours] = currentTime.split(':').map(Number);
                      updateTime(hours, minute, selectedType);
                      setShowMinuteModal(false);
                    }}
                  >
                    <Text style={[styles.minuteOptionText, isDark && styles.darkMinuteOptionText]}>
                      {minute.toString().padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    marginBottom: 16,
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#374151',
    flex: 1,
  },
  darkText: {
    color: '#D1D5DB',
  },
  subSettings: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkPickerOption: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  selectedPickerOption: {
    borderColor: 'transparent',
  },
  pickerOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkPickerOptionText: {
    color: '#9CA3AF',
  },
  selectedPickerOptionText: {
    color: '#FFFFFF',
  },
  timePickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    width: 100,
    textAlign: 'center',
  },
  darkTimeInput: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
    color: '#FFFFFF',
  },
  numberInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    width: 80,
    textAlign: 'center',
  },
  darkNumberInput: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
    color: '#FFFFFF',
  },
  testButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  testButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
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
  footerButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkCancelButton: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  saveButton: {
    borderWidth: 0,
  },
  footerButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  darkFooterButtonText: {
    color: '#9CA3AF',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  // Time Picker Styles
  timePickerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 40,
    alignItems: 'center',
  },
  darkTimePickerButton: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  timePickerText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
  },
  darkTimePickerText: {
    color: '#FFFFFF',
  },
  timeSeparator: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#374151',
    marginHorizontal: 8,
  },
  ampmButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginLeft: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  darkAmpmButton: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  ampmText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  darkAmpmText: {
    color: '#9CA3AF',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModal: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    margin: 20,
    maxHeight: '70%',
    width: '80%',
  },
  darkPickerModal: {
    backgroundColor: '#374151',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  darkPickerHeader: {
    borderBottomColor: '#4B5563',
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  darkPickerTitle: {
    color: '#FFFFFF',
  },
  pickerContent: {
    maxHeight: 300,
  },
  hourGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  hourOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 60,
    alignItems: 'center',
  },
  darkHourOption: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  hourOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
  },
  darkHourOptionText: {
    color: '#FFFFFF',
  },
  minuteGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 12,
    justifyContent: 'center',
  },
  minuteOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    minWidth: 60,
    alignItems: 'center',
  },
  darkMinuteOption: {
    backgroundColor: '#4B5563',
    borderColor: '#6B7280',
  },
  minuteOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
  },
  darkMinuteOptionText: {
    color: '#FFFFFF',
  },
});
