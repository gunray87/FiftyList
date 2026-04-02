import { notificationService } from './notificationService';
import { Alert } from 'react-native';

export const testNotificationSystem = async () => {
  try {
    console.log('🧪 Testing notification system...');
    
    // Test 1: Initialize the service
    await notificationService.initialize();
    console.log('✅ Notification service initialized');
    
    // Test 2: Get current settings
    const settings = await notificationService.getSettings();
    console.log('✅ Current settings:', settings);
    
    // Test 3: Schedule a test notification
    const testId = await notificationService.scheduleCustomReminder(
      '🧪 Test Notification',
      'This is a test notification from FiftyList!',
      new Date(Date.now() + 10000) // 10 seconds from now
    );
    console.log('✅ Test notification scheduled with ID:', testId);
    
    // Test 4: Get scheduled notifications
    const scheduled = await notificationService.getScheduledNotifications();
    console.log('✅ Scheduled notifications:', scheduled.length);
    
    Alert.alert(
      'Notification Test',
      'Test notification scheduled for 10 seconds from now. Check your device notifications!',
      [{ text: 'OK' }]
    );
    
    return true;
  } catch (error) {
    console.error('❌ Notification test failed:', error);
    Alert.alert(
      'Test Failed',
      'Notification test failed. Please check your notification permissions.',
      [{ text: 'OK' }]
    );
    return false;
  }
};

export const testMilestoneNotifications = async () => {
  try {
    console.log('🧪 Testing milestone notifications...');
    
    // Test completion milestone
    await notificationService.checkMilestoneNotifications(10, 0);
    console.log('✅ Completion milestone test completed');
    
    // Test addition milestone
    await notificationService.checkMilestoneNotifications(0, 25);
    console.log('✅ Addition milestone test completed');
    
    Alert.alert(
      'Milestone Test',
      'Milestone notification tests completed. Check for notifications!',
      [{ text: 'OK' }]
    );
    
    return true;
  } catch (error) {
    console.error('❌ Milestone test failed:', error);
    return false;
  }
};

export const testActivityThreshold = async () => {
  try {
    console.log('🧪 Testing activity threshold...');
    
    await notificationService.checkActivityThreshold(5);
    console.log('✅ Activity threshold test completed');
    
    Alert.alert(
      'Activity Test',
      'Activity threshold test completed. Check for notifications!',
      [{ text: 'OK' }]
    );
    
    return true;
  } catch (error) {
    console.error('❌ Activity threshold test failed:', error);
    return false;
  }
};
