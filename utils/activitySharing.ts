import { ActivityLog, SharingOptions } from '@/types';
import { ActivityLogger } from './activityLogger';
import {
  buildListFormatRows,
  buildListItemIndex,
  dedupeActivitiesByItemAndType,
  formatCategoryLabel,
  loadStoredListsForShare,
  sanitizeActivitiesForShare,
  shareAccuracyFooter,
} from './shareActivityAccuracy';

export class ActivitySharing {
  private static formatDate(date: string): string {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date;
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  private static formatTimeRange(timeRange: string): string {
    switch (timeRange) {
      case 'lastWeek':
        return 'this week';
      case 'lastMonth':
        return 'this month';
      case 'last3Months':
        return 'the last 3 months';
      case 'last6Months':
        return 'the last 6 months';
      case 'lastYear':
        return 'this year';
      default:
        return 'recently';
    }
  }

  private static formatCreditLine(activity: ActivityLog): string {
    const author = (activity.itemAuthor || '').trim();
    if (!author || /^unknown$/i.test(author)) {
      return `"${activity.itemTitle}"`;
    }
    return activity.itemType === 'book'
      ? `"${activity.itemTitle}" by ${author}`
      : `"${activity.itemTitle}" directed by ${author}`;
  }

  private static formatRatingSuffix(rating?: number): string {
    const r = typeof rating === 'number' && rating >= 1 && rating <= 5 ? rating : undefined;
    return r ? ` (rated ${r}/5)` : '';
  }

  private static groupActivitiesByType(activities: ActivityLog[]) {
    const groups = {
      completed: [] as ActivityLog[],
      added: [] as ActivityLog[],
      moved: [] as ActivityLog[],
      rated: [] as ActivityLog[],
      started: [] as ActivityLog[],
      other: [] as ActivityLog[],
    };

    activities.forEach((activity) => {
      if (groups[activity.type as keyof typeof groups]) {
        groups[activity.type as keyof typeof groups].push(activity);
      } else {
        groups.other.push(activity);
      }
    });

    return groups;
  }

  private static appendFooter(summary: string, omittedCount: number): string {
    summary += shareAccuracyFooter(omittedCount);
    summary += `\n---\nShared from FiftyList — your reading and watching tracker`;
    return summary;
  }

  static generateSummaryText(
    activities: ActivityLog[],
    options: SharingOptions,
    omittedCount: number
  ): string {
    if (activities.length === 0) {
      const empty = `I haven't had any reading or watching activity ${this.formatTimeRange(options.timeRange)}.`;
      return this.appendFooter(empty, omittedCount);
    }

    const groups = this.groupActivitiesByType(activities);
    const timeRange = this.formatTimeRange(options.timeRange);
    let summary = `Here's what I've been up to ${timeRange}:\n\n`;

    if (groups.completed.length > 0) {
      const books = groups.completed.filter((a) => a.itemType === 'book');
      const movies = groups.completed.filter((a) => a.itemType === 'movie');

      if (books.length > 0) {
        summary += `**Books I finished:**\n`;
        books.forEach((book) => {
          summary += `• ${this.formatCreditLine(book)}${this.formatRatingSuffix(book.metadata?.rating)}\n`;
        });
        summary += '\n';
      }

      if (movies.length > 0) {
        summary += `**Movies I watched:**\n`;
        movies.forEach((movie) => {
          summary += `• ${this.formatCreditLine(movie)}${this.formatRatingSuffix(movie.metadata?.rating)}\n`;
        });
        summary += '\n';
      }
    }

    if (groups.added.length > 0) {
      const books = groups.added.filter((a) => a.itemType === 'book');
      const movies = groups.added.filter((a) => a.itemType === 'movie');

      if (books.length > 0) {
        summary += `**Books I added to my list:**\n`;
        books.forEach((book) => {
          summary += `• ${this.formatCreditLine(book)}\n`;
        });
        summary += '\n';
      }

      if (movies.length > 0) {
        summary += `**Movies I added to my list:**\n`;
        movies.forEach((movie) => {
          summary += `• ${this.formatCreditLine(movie)}\n`;
        });
        summary += '\n';
      }
    }

    if (groups.started.length > 0) {
      const books = groups.started.filter((a) => a.itemType === 'book');
      const movies = groups.started.filter((a) => a.itemType === 'movie');

      if (books.length > 0) {
        summary += `**Books I started reading:**\n`;
        books.forEach((book) => {
          summary += `• ${this.formatCreditLine(book)}\n`;
        });
        summary += '\n';
      }

      if (movies.length > 0) {
        summary += `**Movies I started watching:**\n`;
        movies.forEach((movie) => {
          summary += `• ${this.formatCreditLine(movie)}\n`;
        });
        summary += '\n';
      }
    }

    if (groups.rated.length > 0) {
      const rated = groups.rated.filter((a) => a.metadata?.rating);
      if (rated.length > 0) {
        summary += `**Recent ratings:**\n`;
        rated.forEach((item) => {
          const rating = item.metadata?.rating;
          const type = item.itemType === 'book' ? 'book' : 'movie';
          summary += `• ${this.formatCreditLine(item)} (${type}): ${rating}/5 stars\n`;
        });
        summary += '\n';
      }
    }

    const uniqueCompleted = new Set(
      groups.completed.map((a) => `${a.itemType}:${a.itemId}`)
    ).size;
    const uniqueAdded = new Set(groups.added.map((a) => `${a.itemType}:${a.itemId}`)).size;
    const uniqueStarted = new Set(groups.started.map((a) => `${a.itemType}:${a.itemId}`)).size;

    if (uniqueCompleted > 0 || uniqueAdded > 0 || uniqueStarted > 0) {
      summary += `**Summary:** ${uniqueCompleted} finished, ${uniqueStarted} started, ${uniqueAdded} added to my lists.\n\n`;
    }

    return this.appendFooter(summary, omittedCount);
  }

  static generateDetailedText(
    activities: ActivityLog[],
    options: SharingOptions,
    omittedCount: number
  ): string {
    if (activities.length === 0) {
      const empty = `No activity ${this.formatTimeRange(options.timeRange)}.`;
      return this.appendFooter(empty, omittedCount);
    }

    const timeRange = this.formatTimeRange(options.timeRange);
    let detailed = `Detailed activity log ${timeRange}:\n\n`;

    const groupedByDate: Record<string, ActivityLog[]> = {};
    activities.forEach((activity) => {
      const date = new Date(activity.timestamp).toDateString();
      if (!groupedByDate[date]) groupedByDate[date] = [];
      groupedByDate[date].push(activity);
    });

    const sortedDates = Object.keys(groupedByDate).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );

    sortedDates.forEach((date) => {
      const dayActivities = groupedByDate[date];
      detailed += `**${this.formatDate(date)}**\n`;

      dayActivities.forEach((activity) => {
        const time = new Date(activity.timestamp).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        });

        let action = '';
        switch (activity.type) {
          case 'added':
            action = `Added ${this.formatCreditLine(activity)} to ${formatCategoryLabel(
              activity.toCategory,
              activity.itemType
            )}`;
            break;
          case 'completed':
            action = `Finished ${this.formatCreditLine(activity)}`;
            break;
          case 'started':
            action = `Started ${this.formatCreditLine(activity)}`;
            break;
          case 'moved':
            action = `Moved ${this.formatCreditLine(activity)} from ${formatCategoryLabel(
              activity.fromCategory,
              activity.itemType
            )} to ${formatCategoryLabel(activity.toCategory, activity.itemType)}`;
            break;
          case 'rated': {
            const rating = activity.metadata?.rating;
            action = rating
              ? `Rated ${this.formatCreditLine(activity)} ${rating}/5 stars`
              : `Rated ${this.formatCreditLine(activity)}`;
            break;
          }
          default:
            action = `${activity.type} ${this.formatCreditLine(activity)}`;
        }

        const type = activity.itemType === 'book' ? '[Book]' : '[Movie]';
        detailed += `${time} ${type} ${action}\n`;
      });

      detailed += '\n';
    });

    return this.appendFooter(detailed, omittedCount);
  }

  static generateListText(
    activities: ActivityLog[],
    options: SharingOptions,
    index: ReturnType<typeof buildListItemIndex>,
    omittedCount: number
  ): string {
    const rows = buildListFormatRows(activities, index);

    if (rows.length === 0) {
      const empty = `No items ${this.formatTimeRange(options.timeRange)}.`;
      return this.appendFooter(empty, omittedCount);
    }

    const timeRange = this.formatTimeRange(options.timeRange);
    let list = `My reading and watching list ${timeRange}:\n\n`;

    const books = rows.filter((r) => r.activity.itemType === 'book');
    const movies = rows.filter((r) => r.activity.itemType === 'movie');

    if (books.length > 0) {
      list += `**Books (${books.length}):**\n`;
      books.forEach(({ activity, snapshot }) => {
        const status = `[${formatCategoryLabel(snapshot.category, 'book')}] `;
        list += `${status}${this.formatCreditLine(activity)}${this.formatRatingSuffix(
          activity.metadata?.rating
        )}\n`;
      });
      list += '\n';
    }

    if (movies.length > 0) {
      list += `**Movies (${movies.length}):**\n`;
      movies.forEach(({ activity, snapshot }) => {
        const status = `[${formatCategoryLabel(snapshot.category, 'movie')}] `;
        list += `${status}${this.formatCreditLine(activity)}${this.formatRatingSuffix(
          activity.metadata?.rating
        )}\n`;
      });
      list += '\n';
    }

    return this.appendFooter(list, omittedCount);
  }

  static async generateShareableContent(options: SharingOptions): Promise<string> {
    const logger = ActivityLogger.getInstance();

    await logger.backfillFromStoredListsIfEmpty();

    const activities = await logger.getActivities(
      options.timeRange,
      options.includeTypes.length > 0 ? options.includeTypes : undefined,
      options.includeItemTypes.length > 0 ? options.includeItemTypes : undefined
    );

    let filteredActivities = activities;
    if (options.timeRange === 'custom' && options.customStartDate && options.customEndDate) {
      const startDate = new Date(options.customStartDate);
      const endDate = new Date(options.customEndDate);
      endDate.setHours(23, 59, 59, 999);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        filteredActivities = activities.filter((activity) => {
          const activityDate = new Date(activity.timestamp);
          return activityDate >= startDate && activityDate <= endDate;
        });
      }
    }

    const { books, movies } = await loadStoredListsForShare();
    const index = buildListItemIndex(books, movies);
    const { activities: sanitized, omittedCount } = sanitizeActivitiesForShare(
      filteredActivities,
      index
    );
    const deduped = dedupeActivitiesByItemAndType(sanitized);

    switch (options.format) {
      case 'detailed':
        return this.generateDetailedText(deduped, options, omittedCount);
      case 'list':
        return this.generateListText(deduped, options, index, omittedCount);
      case 'summary':
      default:
        return this.generateSummaryText(deduped, options, omittedCount);
    }
  }
}
