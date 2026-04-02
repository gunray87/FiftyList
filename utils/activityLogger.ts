import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityLog, ActivityType, ItemType } from '@/types';
import { checkMilestoneNotifications, checkActivityThreshold } from './notificationService';

const ACTIVITY_LOG_KEY = 'fiftylist_activity_log';
const MAX_LOG_ENTRIES = 1000; // Keep last 1000 activities

export class ActivityLogger {
  private static instance: ActivityLogger;
  private logCache: ActivityLog[] = [];
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      const stored = await AsyncStorage.getItem(ACTIVITY_LOG_KEY);
      if (stored) {
        this.logCache = JSON.parse(stored);
      }
      this.isInitialized = true;
    } catch (error) {
      console.error('Error initializing activity logger:', error);
      this.logCache = [];
      this.isInitialized = true;
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await AsyncStorage.setItem(ACTIVITY_LOG_KEY, JSON.stringify(this.logCache));
    } catch (error) {
      console.error('Error saving activity log:', error);
    }
  }

  async logActivity(
    type: ActivityType,
    itemType: ItemType,
    itemId: number,
    itemTitle: string,
    itemAuthor: string,
    fromCategory?: string,
    toCategory?: string,
    metadata?: any
  ): Promise<void> {
    await this.initialize();

    const activity: ActivityLog = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      itemType,
      itemId,
      itemTitle,
      itemAuthor,
      fromCategory,
      toCategory,
      metadata
    };

    this.logCache.unshift(activity); // Add to beginning

    // Keep only the last MAX_LOG_ENTRIES
    if (this.logCache.length > MAX_LOG_ENTRIES) {
      this.logCache = this.logCache.slice(0, MAX_LOG_ENTRIES);
    }

    await this.saveToStorage();
    console.log(`📝 Activity logged: ${type} ${itemType} "${itemTitle}"`);
    
    // Check for milestone and activity threshold notifications
    await this.checkNotifications();
  }

  async getActivities(
    timeRange?: 'lastWeek' | 'lastMonth' | 'last3Months' | 'last6Months' | 'lastYear',
    types?: ActivityType[],
    itemTypes?: ItemType[]
  ): Promise<ActivityLog[]> {
    await this.initialize();

    console.log('🔍 ActivityLogger: getActivities called with:', { timeRange, types, itemTypes });
    console.log('🔍 ActivityLogger: Total activities in cache:', this.logCache.length);
    
    let filtered = [...this.logCache];

    // Filter by time range
    if (timeRange) {
      const now = new Date();
      let cutoffDate: Date;

      switch (timeRange) {
        case 'lastWeek':
          cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'lastMonth':
          cutoffDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'last3Months':
          cutoffDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'last6Months':
          cutoffDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
          break;
        case 'lastYear':
          cutoffDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          cutoffDate = new Date(0);
      }

      filtered = filtered.filter(activity => 
        new Date(activity.timestamp) >= cutoffDate
      );
    }

    // Filter by activity types
    if (types && types.length > 0) {
      filtered = filtered.filter(activity => types.includes(activity.type));
    }

    // Filter by item types
    if (itemTypes && itemTypes.length > 0) {
      filtered = filtered.filter(activity => itemTypes.includes(activity.itemType));
    }

    return filtered;
  }

  async getActivityStats(timeRange: 'lastWeek' | 'lastMonth' | 'last3Months' | 'last6Months' | 'lastYear' = 'lastMonth') {
    const activities = await this.getActivities(timeRange);
    
    const stats = {
      total: activities.length,
      byType: {} as Record<ActivityType, number>,
      byItemType: {} as Record<ItemType, number>,
      byCategory: {} as Record<string, number>,
      recentActivity: activities.slice(0, 10)
    };

    activities.forEach(activity => {
      // Count by activity type
      stats.byType[activity.type] = (stats.byType[activity.type] || 0) + 1;
      
      // Count by item type
      stats.byItemType[activity.itemType] = (stats.byItemType[activity.itemType] || 0) + 1;
      
      // Count by category (toCategory for moves, or infer from type)
      const category = activity.toCategory || 
        (activity.type === 'completed' ? 'completed' : 
         activity.type === 'added' ? 'planned' : 
         activity.type === 'started' ? 'inProgress' : 'other');
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
    });

    return stats;
  }

  async clearLog(): Promise<void> {
    this.logCache = [];
    await this.saveToStorage();
    console.log('🗑️ Activity log cleared');
  }

  async exportLog(): Promise<ActivityLog[]> {
    await this.initialize();
    return [...this.logCache];
  }

  // Temporary test function to add sample activities
  async addSampleActivities(): Promise<void> {
    const sampleActivities: ActivityLog[] = [
      {
        id: 'test-1',
        timestamp: new Date().toISOString(),
        type: 'completed',
        itemType: 'book',
        itemId: 1,
        itemTitle: 'Test Book 1',
        itemAuthor: 'Test Author 1',
        metadata: { rating: 4 }
      },
      {
        id: 'test-2',
        timestamp: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
        type: 'added',
        itemType: 'movie',
        itemId: 2,
        itemTitle: 'Test Movie 1',
        itemAuthor: 'Test Director 1'
      }
    ];

    this.logCache.push(...sampleActivities);
    await this.saveToStorage();
    console.log('🧪 Sample activities added for testing');
  }

  private async checkNotifications(): Promise<void> {
    try {
      // Count completed and added items
      const completedCount = this.logCache.filter(
        activity => activity.type === 'completed'
      ).length;
      
      const addedCount = this.logCache.filter(
        activity => activity.type === 'added'
      ).length;
      
      const totalActivities = this.logCache.length;
      
      // Check milestone notifications
      await checkMilestoneNotifications(completedCount, addedCount);
      
      // Check activity threshold notifications
      await checkActivityThreshold(totalActivities);
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  }
}

// Convenience functions for common activities
export const logBookAdded = async (book: any, category: string) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('added', 'book', book.id, book.title, book.author, undefined, category, {
    format: book.format,
    source: book.source
  });
};

export const logBookCompleted = async (book: any) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('completed', 'book', book.id, book.title, book.author, undefined, 'completed', {
    rating: book.rating,
    format: book.format,
    completedDate: book.completedDate
  });
};

export const logBookMoved = async (book: any, fromCategory: string, toCategory: string) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('moved', 'book', book.id, book.title, book.author, fromCategory, toCategory);
};

export const logBookRated = async (book: any, rating: number) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('rated', 'book', book.id, book.title, book.author, undefined, undefined, { rating });
};

export const logMovieAdded = async (movie: any, category: string) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('added', 'movie', movie.id, movie.title, movie.author, undefined, category, {
    format: movie.format,
    source: movie.source
  });
};

export const logMovieCompleted = async (movie: any) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('completed', 'movie', movie.id, movie.title, movie.author, undefined, 'completed', {
    rating: movie.rating,
    format: movie.format,
    completedDate: movie.completedDate
  });
};

export const logMovieMoved = async (movie: any, fromCategory: string, toCategory: string) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('moved', 'movie', movie.id, movie.title, movie.author, fromCategory, toCategory);
};

export const logMovieRated = async (movie: any, rating: number) => {
  const logger = ActivityLogger.getInstance();
  await logger.logActivity('rated', 'movie', movie.id, movie.title, movie.author, undefined, undefined, { rating });
};
