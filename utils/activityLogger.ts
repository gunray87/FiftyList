import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityLog, ActivityType, ItemType, Book, BookData, Movie, MovieData } from '@/types';
import { checkMilestoneNotifications, checkActivityThreshold } from './notificationService';

const ACTIVITY_LOG_KEY = 'fiftylist_activity_log';
const ACTIVITY_BACKFILL_KEY = 'fiftylist_activity_backfill_v1';
const LEGACY_SAMPLE_PURGE_KEY = 'fiftylist_activity_purge_samples_v1';

/** Dev-only sample rows previously injected on every launch — not real user activity. */
export function isLegacySampleActivity(activity: ActivityLog): boolean {
  const id = (activity.id || '').trim();
  const title = (activity.itemTitle || '').trim();
  const author = (activity.itemAuthor || '').trim();
  if (id.startsWith('test-')) return true;
  if (/^Test Book \d+$/i.test(title)) return true;
  if (/^Test Movie \d+$/i.test(title)) return true;
  if (/^Test Author/i.test(author)) return true;
  if (/^Test Director/i.test(author)) return true;
  return false;
}
const BOOKS_STORAGE_KEY = 'fiftylist_books_data';
const MOVIES_STORAGE_KEY = 'fiftylist_movies_data';
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
      await this.purgeLegacySampleActivities();
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
    
    let filtered = this.logCache.filter((a) => !isLegacySampleActivity(a));

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

  /** Strip dev sample activities that were appended on each app start in older builds. */
  async purgeLegacySampleActivities(): Promise<number> {
    const before = this.logCache.length;
    if (before === 0) return 0;

    const cleaned = this.logCache.filter((a) => !isLegacySampleActivity(a));
    if (cleaned.length === before) return 0;

    this.logCache = cleaned;
    await this.saveToStorage();
    await AsyncStorage.setItem(LEGACY_SAMPLE_PURGE_KEY, '1');
    console.log(`🧹 Removed ${before - cleaned.length} legacy sample activities from log`);
    return before - cleaned.length;
  }

  /**
   * One-time backfill from saved lists when the activity log is empty (e.g. lists
   * populated before activity logging shipped).
   */
  async backfillFromStoredListsIfEmpty(): Promise<void> {
    await this.initialize();
    await this.purgeLegacySampleActivities();
    if (this.logCache.length > 0) return;

    const alreadyDone = await AsyncStorage.getItem(ACTIVITY_BACKFILL_KEY);
    if (alreadyDone === '1') return;

    try {
      const booksRaw = await AsyncStorage.getItem(BOOKS_STORAGE_KEY);
      const moviesRaw = await AsyncStorage.getItem(MOVIES_STORAGE_KEY);
      const books: BookData = booksRaw
        ? JSON.parse(booksRaw)
        : { completed: [], inProgress: [], planned: [], fails: [], allTime: [] };
      const movies: MovieData = moviesRaw
        ? JSON.parse(moviesRaw)
        : { completed: [], inProgress: [], planned: [], fails: [], allTime: [] };

      const pushEntry = (
        type: ActivityType,
        itemType: ItemType,
        item: Book | Movie,
        toCategory?: string,
        metadata?: Record<string, unknown>
      ) => {
        const ts =
          type === 'completed' && item.completedDate
            ? new Date(item.completedDate).toISOString()
            : type === 'added' && item.dateAdded
              ? new Date(item.dateAdded).toISOString()
              : type === 'started' && item.dateStarted
                ? new Date(item.dateStarted).toISOString()
                : new Date().toISOString();

        this.logCache.push({
          id: `backfill-${type}-${itemType}-${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: ts,
          type,
          itemType,
          itemId: item.id,
          itemTitle: item.title,
          itemAuthor: item.author,
          toCategory,
          metadata,
        });
      };

      const bookBuckets: Array<{ items: Book[]; type: ActivityType; category: string }> = [
        { items: books.completed ?? [], type: 'completed', category: 'completed' },
        { items: books.inProgress ?? [], type: 'started', category: 'inProgress' },
        { items: books.planned ?? [], type: 'added', category: 'planned' },
      ];
      for (const bucket of bookBuckets) {
        for (const book of bucket.items) {
          if (!book?.title) continue;
          pushEntry(bucket.type, 'book', book, bucket.category, {
            rating: book.rating,
            format: book.format,
          });
        }
      }

      const movieBuckets: Array<{ items: Movie[]; type: ActivityType; category: string }> = [
        { items: movies.completed ?? [], type: 'completed', category: 'completed' },
        { items: movies.inProgress ?? [], type: 'started', category: 'inProgress' },
        { items: movies.planned ?? [], type: 'added', category: 'planned' },
      ];
      for (const bucket of movieBuckets) {
        for (const movie of bucket.items) {
          if (!movie?.title) continue;
          pushEntry(bucket.type, 'movie', movie, bucket.category, {
            rating: movie.rating,
            format: movie.format,
          });
        }
      }

      if (this.logCache.length > MAX_LOG_ENTRIES) {
        this.logCache = this.logCache.slice(0, MAX_LOG_ENTRIES);
      }

      await this.saveToStorage();
      await AsyncStorage.setItem(ACTIVITY_BACKFILL_KEY, '1');
      console.log(`📝 Backfilled ${this.logCache.length} activities from saved lists`);
    } catch (error) {
      console.error('Error backfilling activity log:', error);
    }
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
