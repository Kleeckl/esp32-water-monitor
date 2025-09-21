import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Try to import notifications, fall back gracefully if not available
let Notifications = null;
let isExpoGo = false;

try {
  // Check if we're in Expo Go by looking for the expo-constants module
  const Constants = require('expo-constants').default;
  isExpoGo = Constants.executionEnvironment === 'storeClient';
} catch (error) {
  // If expo-constants isn't available, assume we're not in Expo Go
  isExpoGo = false;
}

// Only try to import notifications if we're NOT in Expo Go
if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    // Configure notification behavior only if available
    if (Notifications && Notifications.setNotificationHandler) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
    }
  } catch (error) {
    console.warn('expo-notifications not available:', error.message);
    Notifications = null;
  }
} else {
  console.log('🧪 Running in Expo Go - notifications disabled');
}

class NotificationService {
  constructor() {
    this.isInitialized = false;
    this.isMockMode = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    try {
      // Check if we're in Expo Go first
      if (isExpoGo) {
        console.log('🧪 Expo Go detected - using mock notification mode');
        this.isInitialized = true;
        this.isMockMode = true;
        return;
      }

      // Check if notifications are available
      if (!Notifications) {
        console.log('🧪 Notifications not available - using mock mode');
        this.isInitialized = true;
        this.isMockMode = true;
        return;
      }

      // Check if we can actually use notifications
      try {
        await Notifications.getPermissionsAsync();
      } catch (error) {
        if (error.message.includes('removed from Expo Go') || 
            error.message.includes('development build') ||
            error.message.includes('not supported')) {
          console.log('🧪 Notifications require development build - using mock mode');
          this.isInitialized = true;
          this.isMockMode = true;
          return;
        }
        throw error;
      }

      // Request permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.warn('📱 Notification permissions not granted - using mock mode');
        this.isInitialized = true;
        this.isMockMode = true;
        return;
      }

      // For Android, create notification channel
      if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
        await Notifications.setNotificationChannelAsync('water-testing', {
          name: 'Water Testing Reminders',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      this.isInitialized = true;
      this.isMockMode = false;
      console.log('✅ Notification service initialized successfully');

      // Schedule initial notifications
      await this.scheduleWeeklyReminders();
      
    } catch (error) {
      console.warn('⚠️ Notification setup failed, using mock mode:', error.message);
      this.isInitialized = true;
      this.isMockMode = true;
    }
  }

  async scheduleWeeklyReminders() {
    try {
      if (isExpoGo || !Notifications || !Notifications.scheduleNotificationAsync || this.isMockMode) {
        console.log('🧪 Mock mode: Would schedule weekly water testing reminders (Sundays at 9 AM)');
        return;
      }

      // Cancel existing weekly reminders
      await this.cancelNotificationsByIdentifier('weekly-water-test');

      // Schedule weekly notification for every Sunday at 9 AM
      await Notifications.scheduleNotificationAsync({
        identifier: 'weekly-water-test',
        content: {
          title: '🚰 Weekly Water Test Reminder',
          body: 'Time to test your water quality! Tap to open your testing checklist.',
          data: { 
            type: 'weekly-reminder',
            action: 'open-checklist'
          },
        },
        trigger: {
          weekday: 1, // Sunday (1-7, where 1 is Sunday)
          hour: 9,
          minute: 0,
          repeats: true,
        },
      });

      console.log('✅ Weekly water testing reminders scheduled');
    } catch (error) {
      console.error('Failed to schedule weekly reminders:', error);
    }
  }

  async schedulePostRainNotification(rainDate = new Date()) {
    try {
      if (isExpoGo || !Notifications || !Notifications.scheduleNotificationAsync || this.isMockMode) {
        const notificationTime = new Date(rainDate.getTime() + 24 * 60 * 60 * 1000);
        console.log(`🧪 Mock mode: Would schedule post-rain notification for ${notificationTime.toLocaleString()}`);
        return null;
      }

      // Schedule notification for 24 hours after rain event
      const notificationTime = new Date(rainDate.getTime() + 24 * 60 * 60 * 1000);
      
      // Only schedule if the time is in the future
      if (notificationTime > new Date()) {
        const identifier = `post-rain-${rainDate.toISOString().split('T')[0]}`;
        
        await Notifications.scheduleNotificationAsync({
          identifier,
          content: {
            title: '🌧️ Post-Rain Water Test',
            body: 'Heavy rain detected yesterday. Please test your water quality to ensure safety.',
            data: { 
              type: 'post-rain-reminder',
              rainDate: rainDate.toISOString(),
              action: 'open-checklist'
            },
          },
          trigger: notificationTime,
        });

        console.log(`✅ Post-rain notification scheduled for ${notificationTime}`);
        return identifier;
      }
    } catch (error) {
      console.error('Failed to schedule post-rain notification:', error);
    }
    return null;
  }

  async scheduleTestOverdueNotification(daysOverdue = 7) {
    try {
      // Get the last test date
      const history = await AsyncStorage.getItem('waterTestingHistory');
      const testingHistory = history ? JSON.parse(history) : [];
      
      if (testingHistory.length === 0) {
        // No tests yet, schedule for immediate reminder
        await this.scheduleImmediateReminder('No water tests recorded yet!');
        return;
      }

      const lastTest = new Date(testingHistory[0].timestamp);
      const daysSinceLastTest = Math.floor((new Date() - lastTest) / (1000 * 60 * 60 * 24));
      
      if (daysSinceLastTest >= daysOverdue) {
        await this.scheduleImmediateReminder(
          `Water testing overdue! Last test was ${daysSinceLastTest} days ago.`
        );
      }
    } catch (error) {
      console.error('Failed to check/schedule overdue notification:', error);
    }
  }

  async scheduleImmediateReminder(customMessage) {
    try {
      if (isExpoGo || !Notifications || !Notifications.scheduleNotificationAsync) {
        console.log('🧪 Mock mode: Would show immediate reminder -', customMessage || 'Please test your water quality soon.');
        return;
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Water Test Required',
          body: customMessage || 'Please test your water quality soon.',
          data: { 
            type: 'overdue-reminder',
            action: 'open-checklist'
          },
        },
        trigger: { seconds: 5 }, // Show in 5 seconds
      });
    } catch (error) {
      console.error('Failed to schedule immediate reminder:', error);
    }
  }

  async cancelNotificationsByIdentifier(identifier) {
    try {
      if (isExpoGo || !Notifications || !Notifications.getAllScheduledNotificationsAsync) {
        console.log('🧪 Mock mode: Would cancel notifications with identifier:', identifier);
        return;
      }

      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const toCancel = scheduledNotifications
        .filter(notification => notification.identifier.includes(identifier))
        .map(notification => notification.identifier);
      
      if (toCancel.length > 0 && Notifications.cancelScheduledNotificationsAsync) {
        await Notifications.cancelScheduledNotificationsAsync(toCancel);
        console.log(`Cancelled ${toCancel.length} notifications with identifier: ${identifier}`);
      }
    } catch (error) {
      console.error('Failed to cancel notifications:', error);
    }
  }

  async cancelAllWaterTestingNotifications() {
    try {
      if (isExpoGo || !Notifications || !Notifications.getAllScheduledNotificationsAsync) {
        console.log('🧪 Mock mode: Would cancel all water testing notifications');
        return;
      }

      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const waterTestingNotifications = scheduledNotifications
        .filter(notification => 
          notification.content.data?.type?.includes('reminder') ||
          notification.identifier.includes('water-test') ||
          notification.identifier.includes('post-rain')
        )
        .map(notification => notification.identifier);
      
      if (waterTestingNotifications.length > 0) {
        await Notifications.cancelScheduledNotificationsAsync(waterTestingNotifications);
        console.log(`Cancelled ${waterTestingNotifications.length} water testing notifications`);
      }
    } catch (error) {
      console.error('Failed to cancel water testing notifications:', error);
    }
  }

  async getScheduledNotifications() {
    try {
      if (isExpoGo || !Notifications || !Notifications.getAllScheduledNotificationsAsync) {
        console.log('🧪 Mock mode: Would return scheduled notifications (empty array)');
        return [];
      }

      const notifications = await Notifications.getAllScheduledNotificationsAsync();
      return notifications.filter(notification => 
        notification.content.data?.type?.includes('reminder') ||
        notification.identifier.includes('water-test') ||
        notification.identifier.includes('post-rain')
      );
    } catch (error) {
      console.error('Failed to get scheduled notifications:', error);
      return [];
    }
  }

  // Check for overdue tests and schedule reminders
  async checkAndScheduleOverdueReminders() {
    try {
      // Check weekly testing status
      const weeklyStatus = await AsyncStorage.getItem('weeklyTestingStatus');
      const weekly = weeklyStatus ? JSON.parse(weeklyStatus) : {};
      
      const currentWeek = this.getCurrentWeekKey();
      const currentWeekStatus = weekly[currentWeek];
      
      if (!currentWeekStatus?.tested) {
        // Current week not tested
        const currentDate = new Date();
        const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
        
        // If it's already Wednesday or later, send overdue reminder
        if (dayOfWeek >= 3) {
          await this.scheduleImmediateReminder('Weekly water test overdue!');
        }
      }

      // Check for untested rain events older than 48 hours
      const rainEvents = await AsyncStorage.getItem('rainEvents');
      const rain = rainEvents ? JSON.parse(rainEvents) : [];
      
      const untestedRain = rain.filter(event => {
        if (event.tested) return false;
        const eventDate = new Date(event.date);
        const hoursSinceRain = (new Date() - eventDate) / (1000 * 60 * 60);
        return hoursSinceRain > 48; // More than 48 hours ago
      });

      if (untestedRain.length > 0) {
        await this.scheduleImmediateReminder(
          `${untestedRain.length} rain event(s) need water testing!`
        );
      }

    } catch (error) {
      console.error('Failed to check overdue reminders:', error);
    }
  }

  getCurrentWeekKey() {
    const now = new Date();
    const year = now.getFullYear();
    const week = Math.ceil(
      ((now - new Date(year, 0, 1)) / 86400000 + new Date(year, 0, 1).getDay() + 1) / 7
    );
    return `${year}-W${week}`;
  }

  // Get notification service status
  getServiceStatus() {
    return {
      isInitialized: this.isInitialized,
      isMockMode: this.isMockMode,
      hasNotifications: !!Notifications && !this.isMockMode
    };
  }

  // Schedule vibration deviation alert
  async scheduleVibrationAlert(alertData) {
    try {
      if (isExpoGo || !Notifications || !Notifications.scheduleNotificationAsync) {
        console.log('🧪 Mock mode: Would send vibration alert -', alertData.message);
        return;
      }

      const { axis, deviation, message } = alertData;
      
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠️ Vibration Alert',
          body: `${message}\nCheck the screws and tighten them. Remove any obstructions that are present.`,
          data: { 
            type: 'vibration-alert',
            axis: axis,
            deviation: deviation,
            action: 'check-equipment',
            alertId: alertData.id
          },
          sound: true,
          priority: 'high'
        },
        trigger: {
          seconds: 1, // Immediate notification
        },
      });

      console.log(`✅ Vibration alert scheduled for ${axis} axis (${(deviation * 100).toFixed(1)}% deviation)`);
    } catch (error) {
      console.error('Failed to schedule vibration alert:', error);
    }
  }

  // Handle notification responses
  setupNotificationResponseHandler(navigationRef) {
    if (isExpoGo || !Notifications || !Notifications.addNotificationResponseReceivedListener) {
      console.log('🧪 Notification response handler not available, skipping setup');
      return { remove: () => {} }; // Return mock subscription
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      
      if (data?.action === 'open-checklist' && navigationRef.current) {
        // Navigate to water testing checklist
        navigationRef.current.navigate('WaterTestingChecklist');
      } else if (data?.action === 'check-equipment' && navigationRef.current) {
        // Navigate to vibration stats screen
        navigationRef.current.navigate('VibrationStats');
      }
    });

    return subscription;
  }
}

export default new NotificationService();