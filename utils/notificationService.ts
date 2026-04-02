import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Storage keys
const NOTIFICATION_SETTINGS_KEY = 'fiftylist_notification_settings';
const SCHEDULED_NOTIFICATIONS_KEY = 'fiftylist_scheduled_notifications';

// Notification types
export type NotificationType = 
  | 'weekly_reminder' 
  | 'monthly_reminder' 
  | 'milestone_completion' 
  | 'milestone_addition' 
  | 'activity_threshold' 
  | 'custom_reminder';

// Notification settings interface
export interface NotificationSettings {
  enabled: boolean;
  weeklyReminder: {
    enabled: boolean;
    dayOfWeek: number; // 0 = Sunday, 1 = Monday, etc.
    time: string; // HH:MM format
  };
  monthlyReminder: {
    enabled: boolean;
    dayOfMonth: number; // 1-31
    time: string; // HH:MM format
  };
  milestoneNotifications: {
    enabled: boolean;
    completionThreshold: number;
    additionThreshold: number;
  };
  activityThreshold: {
    enabled: boolean;
    threshold: number; // Number of activities before notification
  };
}

// Scheduled notification interface
export interface ScheduledNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduledDate: string;
  data?: any;
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export class NotificationService {
  private static instance: NotificationService;
  private settings: NotificationSettings;
  private isInitialized = false;

  private constructor() {
    this.settings = this.getDefaultSettings();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private getDefaultSettings(): NotificationSettings {
    return {
      enabled: true,
      weeklyReminder: {
        enabled: false,
        dayOfWeek: 0, // Sunday
        time: '18:00', // 6 PM
      },
      monthlyReminder: {
        enabled: false,
        dayOfMonth: 1, // 1st of month
        time: '18:00', // 6 PM
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
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Request permissions
      await this.requestPermissions();
      
      // Load settings
      await this.loadSettings();
      
      // Schedule existing notifications
      await this.scheduleExistingNotifications();
      
      this.isInitialized = true;
      console.log('🔔 Notification service initialized');
    } catch (error) {
      console.error('❌ Error initializing notification service:', error);
    }
  }

  private async requestPermissions(): Promise<void> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.warn('⚠️ Notification permissions not granted');
        return;
      }

      // Configure for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    } catch (error) {
      console.error('❌ Error requesting notification permissions:', error);
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (stored) {
        this.settings = { ...this.getDefaultSettings(), ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('❌ Error loading notification settings:', error);
    }
  }

  async saveSettings(): Promise<void> {
    try {
      await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(this.settings));
      console.log('💾 Notification settings saved');
    } catch (error) {
      console.error('❌ Error saving notification settings:', error);
    }
  }

  async getSettings(): Promise<NotificationSettings> {
    await this.initialize();
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<NotificationSettings>): Promise<void> {
    this.settings = { ...this.settings, ...updates };
    await this.saveSettings();
    
    // Reschedule notifications if settings changed
    if (updates.weeklyReminder || updates.monthlyReminder) {
      await this.rescheduleReminders();
    }
  }

  // Weekly reminder scheduling
  async scheduleWeeklyReminder(enabled: boolean, dayOfWeek: number, time: string): Promise<void> {
    if (!enabled) {
      await this.cancelNotificationType('weekly_reminder');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const nextReminder = new Date();
    
    // Set to next occurrence of the specified day and time
    nextReminder.setDate(now.getDate() + (dayOfWeek + 7 - now.getDay()) % 7);
    nextReminder.setHours(hours, minutes, 0, 0);
    
    // If the time has passed today, schedule for next week
    if (nextReminder <= now) {
      nextReminder.setDate(nextReminder.getDate() + 7);
    }

    await this.scheduleNotification({
      id: `weekly_reminder_${Date.now()}`,
      type: 'weekly_reminder',
      title: '📚 Weekly Reading Check-in',
      body: 'Time to share your weekly reading and watching progress!',
      scheduledDate: nextReminder.toISOString(),
      data: { repeat: 'weekly', dayOfWeek, time }
    });

    console.log('📅 Weekly reminder scheduled for:', nextReminder.toLocaleString());
  }

  // Monthly reminder scheduling
  async scheduleMonthlyReminder(enabled: boolean, dayOfMonth: number, time: string): Promise<void> {
    if (!enabled) {
      await this.cancelNotificationType('monthly_reminder');
      return;
    }

    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    const nextReminder = new Date();
    
    // Set to the specified day of next month
    nextReminder.setDate(dayOfMonth);
    nextReminder.setHours(hours, minutes, 0, 0);
    
    // If the date has passed this month, schedule for next month
    if (nextReminder <= now) {
      nextReminder.setMonth(nextReminder.getMonth() + 1);
    }

    await this.scheduleNotification({
      id: `monthly_reminder_${Date.now()}`,
      type: 'monthly_reminder',
      title: '📊 Monthly Activity Summary',
      body: 'Share your monthly reading and watching achievements!',
      scheduledDate: nextReminder.toISOString(),
      data: { repeat: 'monthly', dayOfMonth, time }
    });

    console.log('📅 Monthly reminder scheduled for:', nextReminder.toLocaleString());
  }

  // Milestone notifications
  async checkMilestoneNotifications(completedCount: number, addedCount: number): Promise<void> {
    if (!this.settings.milestoneNotifications.enabled) return;

    const { completionThreshold, additionThreshold } = this.settings.milestoneNotifications;

    // Check completion milestone
    if (completedCount > 0 && completedCount % completionThreshold === 0) {
      await this.scheduleNotification({
        id: `milestone_completion_${Date.now()}`,
        type: 'milestone_completion',
        title: '🎉 Milestone Achieved!',
        body: `Congratulations! You've completed ${completedCount} items! Share your progress!`,
        scheduledDate: new Date().toISOString(),
        data: { milestone: 'completion', count: completedCount }
      });
    }

    // Check addition milestone
    if (addedCount > 0 && addedCount % additionThreshold === 0) {
      await this.scheduleNotification({
        id: `milestone_addition_${Date.now()}`,
        type: 'milestone_addition',
        title: '📖 Growing Your Library!',
        body: `You've added ${addedCount} items to your list! Keep it up!`,
        scheduledDate: new Date().toISOString(),
        data: { milestone: 'addition', count: addedCount }
      });
    }
  }

  // Activity threshold notifications
  async checkActivityThreshold(activityCount: number): Promise<void> {
    if (!this.settings.activityThreshold.enabled) return;

    const { threshold } = this.settings.activityThreshold;

    if (activityCount >= threshold) {
      await this.scheduleNotification({
        id: `activity_threshold_${Date.now()}`,
        type: 'activity_threshold',
        title: '🚀 You\'re on Fire!',
        body: `You've been very active! Share your reading and watching progress!`,
        scheduledDate: new Date().toISOString(),
        data: { threshold, activityCount }
      });
    }
  }

  // Custom reminder scheduling
  async scheduleCustomReminder(title: string, body: string, date: Date): Promise<string> {
    const id = `custom_reminder_${Date.now()}`;
    
    await this.scheduleNotification({
      id,
      type: 'custom_reminder',
      title,
      body,
      scheduledDate: date.toISOString(),
      data: { custom: true }
    });

    return id;
  }

  // Core notification scheduling
  private async scheduleNotification(notification: ScheduledNotification): Promise<void> {
    try {
      const triggerDate = new Date(notification.scheduledDate);
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: notification.title,
          body: notification.body,
          data: notification.data || {},
        },
        trigger: {
          type: 'date',
          date: triggerDate,
        },
      });

      // Store the scheduled notification
      await this.storeScheduledNotification(notification);
      
      console.log('🔔 Notification scheduled:', notification.title);
    } catch (error) {
      console.error('❌ Error scheduling notification:', error);
    }
  }

  // Cancel notifications
  async cancelNotification(id: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
      await this.removeScheduledNotification(id);
      console.log('❌ Notification cancelled:', id);
    } catch (error) {
      console.error('❌ Error cancelling notification:', error);
    }
  }

  async cancelNotificationType(type: NotificationType): Promise<void> {
    try {
      const scheduled = await this.getScheduledNotifications();
      const toCancel = scheduled.filter(n => n.type === type);
      
      for (const notification of toCancel) {
        await this.cancelNotification(notification.id);
      }
    } catch (error) {
      console.error('❌ Error cancelling notification type:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
      await this.clearScheduledNotifications();
      console.log('❌ All notifications cancelled');
    } catch (error) {
      console.error('❌ Error cancelling all notifications:', error);
    }
  }

  // Get scheduled notifications
  async getScheduledNotifications(): Promise<ScheduledNotification[]> {
    try {
      const stored = await AsyncStorage.getItem(SCHEDULED_NOTIFICATIONS_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('❌ Error getting scheduled notifications:', error);
      return [];
    }
  }

  // Storage helpers
  private async storeScheduledNotification(notification: ScheduledNotification): Promise<void> {
    try {
      const existing = await this.getScheduledNotifications();
      const updated = [...existing.filter(n => n.id !== notification.id), notification];
      await AsyncStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('❌ Error storing scheduled notification:', error);
    }
  }

  private async removeScheduledNotification(id: string): Promise<void> {
    try {
      const existing = await this.getScheduledNotifications();
      const updated = existing.filter(n => n.id !== id);
      await AsyncStorage.setItem(SCHEDULED_NOTIFICATIONS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.error('❌ Error removing scheduled notification:', error);
    }
  }

  private async clearScheduledNotifications(): Promise<void> {
    try {
      await AsyncStorage.removeItem(SCHEDULED_NOTIFICATIONS_KEY);
    } catch (error) {
      console.error('❌ Error clearing scheduled notifications:', error);
    }
  }

  // Reschedule existing notifications
  private async scheduleExistingNotifications(): Promise<void> {
    try {
      const scheduled = await this.getScheduledNotifications();
      for (const notification of scheduled) {
        const triggerDate = new Date(notification.scheduledDate);
        if (triggerDate > new Date()) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: notification.title,
              body: notification.body,
              data: notification.data || {},
            },
            trigger: {
              type: 'date',
              date: triggerDate,
            },
          });
        }
      }
    } catch (error) {
      console.error('❌ Error rescheduling existing notifications:', error);
    }
  }

  // Reschedule reminders when settings change
  private async rescheduleReminders(): Promise<void> {
    await this.cancelNotificationType('weekly_reminder');
    await this.cancelNotificationType('monthly_reminder');
    
    if (this.settings.weeklyReminder.enabled) {
      await this.scheduleWeeklyReminder(
        true,
        this.settings.weeklyReminder.dayOfWeek,
        this.settings.weeklyReminder.time
      );
    }
    
    if (this.settings.monthlyReminder.enabled) {
      await this.scheduleMonthlyReminder(
        true,
        this.settings.monthlyReminder.dayOfMonth,
        this.settings.monthlyReminder.time
      );
    }
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();

// Convenience functions
export const scheduleWeeklyReminder = (enabled: boolean, dayOfWeek: number, time: string) =>
  notificationService.scheduleWeeklyReminder(enabled, dayOfWeek, time);

export const scheduleMonthlyReminder = (enabled: boolean, dayOfMonth: number, time: string) =>
  notificationService.scheduleMonthlyReminder(enabled, dayOfMonth, time);

export const checkMilestoneNotifications = (completedCount: number, addedCount: number) =>
  notificationService.checkMilestoneNotifications(completedCount, addedCount);

export const checkActivityThreshold = (activityCount: number) =>
  notificationService.checkActivityThreshold(activityCount);

export const scheduleCustomReminder = (title: string, body: string, date: Date) =>
  notificationService.scheduleCustomReminder(title, body, date);
