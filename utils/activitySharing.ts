import { ActivityLog, SharingOptions } from '@/types';
import { ActivityLogger } from './activityLogger';

export class ActivitySharing {
  private static formatDate(date: string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
  }

  private static formatTimeRange(timeRange: string): string {
    switch (timeRange) {
      case 'lastWeek': return 'this week';
      case 'lastMonth': return 'this month';
      case 'last3Months': return 'the last 3 months';
      case 'last6Months': return 'the last 6 months';
      case 'lastYear': return 'this year';
      default: return 'recently';
    }
  }

  private static groupActivitiesByType(activities: ActivityLog[]) {
    const groups = {
      completed: [] as ActivityLog[],
      added: [] as ActivityLog[],
      moved: [] as ActivityLog[],
      rated: [] as ActivityLog[],
      started: [] as ActivityLog[],
      other: [] as ActivityLog[]
    };

    activities.forEach(activity => {
      if (groups[activity.type as keyof typeof groups]) {
        groups[activity.type as keyof typeof groups].push(activity);
      } else {
        groups.other.push(activity);
      }
    });

    return groups;
  }

  static generateSummaryText(activities: ActivityLog[], options: SharingOptions): string {
    if (activities.length === 0) {
      return `I haven't had any reading or watching activity ${this.formatTimeRange(options.timeRange)}.`;
    }

    const groups = this.groupActivitiesByType(activities);
    const timeRange = this.formatTimeRange(options.timeRange);
    let summary = `Here's what I've been up to ${timeRange}:\n\n`;

    // Completed items
    if (groups.completed.length > 0) {
      const books = groups.completed.filter(a => a.itemType === 'book');
      const movies = groups.completed.filter(a => a.itemType === 'movie');

      if (books.length > 0) {
        summary += `**Books I finished:**\n`;
        books.forEach(book => {
          const rating = book.metadata?.rating ? ` (rated ${book.metadata.rating}/5)` : '';
          summary += `• "${book.itemTitle}" by ${book.itemAuthor}${rating}\n`;
        });
        summary += '\n';
      }

      if (movies.length > 0) {
        summary += `**Movies I watched:**\n`;
        movies.forEach(movie => {
          const rating = movie.metadata?.rating ? ` (rated ${movie.metadata.rating}/5)` : '';
          summary += `• "${movie.itemTitle}" directed by ${movie.itemAuthor}${rating}\n`;
        });
        summary += '\n';
      }
    }

    // Added items
    if (groups.added.length > 0) {
      const books = groups.added.filter(a => a.itemType === 'book');
      const movies = groups.added.filter(a => a.itemType === 'movie');

      if (books.length > 0) {
        summary += `**Books I added to my list:**\n`;
        books.forEach(book => {
          summary += `• "${book.itemTitle}" by ${book.itemAuthor}\n`;
        });
        summary += '\n';
      }

      if (movies.length > 0) {
        summary += `**Movies I added to my list:**\n`;
        movies.forEach(movie => {
          summary += `• "${movie.itemTitle}" directed by ${movie.itemAuthor}\n`;
        });
        summary += '\n';
      }
    }

    // Started items
    if (groups.started.length > 0) {
      const books = groups.started.filter(a => a.itemType === 'book');
      const movies = groups.started.filter(a => a.itemType === 'movie');

      if (books.length > 0) {
        summary += `**Books I started reading:**\n`;
        books.forEach(book => {
          summary += `• "${book.itemTitle}" by ${book.itemAuthor}\n`;
        });
        summary += '\n';
      }

      if (movies.length > 0) {
        summary += `**Movies I started watching:**\n`;
        movies.forEach(movie => {
          summary += `• "${movie.itemTitle}" directed by ${movie.itemAuthor}\n`;
        });
        summary += '\n';
      }
    }

    // Ratings
    if (groups.rated.length > 0) {
      const books = groups.rated.filter(a => a.itemType === 'book');
      const movies = groups.rated.filter(a => a.itemType === 'movie');

      if (books.length > 0 || movies.length > 0) {
        summary += `**Recent ratings:**\n`;
        [...books, ...movies].forEach(item => {
          const rating = item.metadata?.rating;
          if (rating) {
            const type = item.itemType === 'book' ? 'book' : 'movie';
            summary += `• "${item.itemTitle}" (${type}): ${rating}/5 stars\n`;
          }
        });
        summary += '\n';
      }
    }

    // Summary stats
    const totalCompleted = groups.completed.length;
    const totalAdded = groups.added.length;
    const totalStarted = groups.started.length;

    if (totalCompleted > 0 || totalAdded > 0 || totalStarted > 0) {
      summary += `**Summary:** ${totalCompleted} completed, ${totalStarted} in progress, ${totalAdded} added to my list.\n\n`;
    }

    summary += `---\nShared from FiftyList - my reading and watching tracker`;

    return summary;
  }

  static generateDetailedText(activities: ActivityLog[], options: SharingOptions): string {
    if (activities.length === 0) {
      return `No activity ${this.formatTimeRange(options.timeRange)}.`;
    }

    const timeRange = this.formatTimeRange(options.timeRange);
    let detailed = `Detailed activity log ${timeRange}:\n\n`;

    // Group by date
    const groupedByDate: Record<string, ActivityLog[]> = {};
    activities.forEach(activity => {
      const date = new Date(activity.timestamp).toDateString();
      if (!groupedByDate[date]) {
        groupedByDate[date] = [];
      }
      groupedByDate[date].push(activity);
    });

    // Sort dates
    const sortedDates = Object.keys(groupedByDate).sort((a, b) => 
      new Date(b).getTime() - new Date(a).getTime()
    );

    sortedDates.forEach(date => {
      const activities = groupedByDate[date];
      detailed += `**${this.formatDate(date)}**\n`;
      
      activities.forEach(activity => {
        const time = new Date(activity.timestamp).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
        
        let action = '';
        switch (activity.type) {
          case 'added':
            action = `Added "${activity.itemTitle}" to ${activity.toCategory || 'my list'}`;
            break;
          case 'completed':
            action = `Completed "${activity.itemTitle}"`;
            break;
          case 'started':
            action = `Started "${activity.itemTitle}"`;
            break;
          case 'moved':
            action = `Moved "${activity.itemTitle}" from ${activity.fromCategory} to ${activity.toCategory}`;
            break;
          case 'rated':
            const rating = activity.metadata?.rating;
            action = `Rated "${activity.itemTitle}" ${rating}/5 stars`;
            break;
          default:
            action = `${activity.type} "${activity.itemTitle}"`;
        }

        const type = activity.itemType === 'book' ? '[Book]' : '[Movie]';
        detailed += `${time} ${type} ${action}\n`;
      });
      
      detailed += '\n';
    });

    detailed += `---\nShared from FiftyList`;

    return detailed;
  }

  static generateListText(activities: ActivityLog[], options: SharingOptions): string {
    if (activities.length === 0) {
      return `No items ${this.formatTimeRange(options.timeRange)}.`;
    }

    const timeRange = this.formatTimeRange(options.timeRange);
    let list = `My reading and watching list ${timeRange}:\n\n`;

    // Group by type and status
    const books = activities.filter(a => a.itemType === 'book');
    const movies = activities.filter(a => a.itemType === 'movie');

    if (books.length > 0) {
      list += `**Books (${books.length}):**\n`;
      books.forEach(book => {
        const status = book.type === 'completed' ? '[Done] ' : 
                      book.type === 'started' ? '[Reading] ' : '[List] ';
        const rating = book.metadata?.rating ? ` (${book.metadata.rating}/5)` : '';
        list += `${status} "${book.itemTitle}" by ${book.itemAuthor}${rating}\n`;
      });
      list += '\n';
    }

    if (movies.length > 0) {
      list += `**Movies (${movies.length}):**\n`;
      movies.forEach(movie => {
        const status = movie.type === 'completed' ? '[Watched] ' : 
                      movie.type === 'started' ? '[Watching] ' : '[List] ';
        const rating = movie.metadata?.rating ? ` (${movie.metadata.rating}/5)` : '';
        list += `${status} "${movie.itemTitle}" directed by ${movie.itemAuthor}${rating}\n`;
      });
      list += '\n';
    }

    list += `---\nShared from FiftyList`;

    return list;
  }

  static async generateShareableContent(options: SharingOptions): Promise<string> {
    const logger = ActivityLogger.getInstance();
    
    console.log('🔍 ActivitySharing: Generating content with options:', options);
    
    // Get activities based on options
    const activities = await logger.getActivities(
      options.timeRange,
      options.includeTypes.length > 0 ? options.includeTypes : undefined,
      options.includeItemTypes.length > 0 ? options.includeItemTypes : undefined
    );

    console.log('🔍 ActivitySharing: Retrieved activities:', activities.length, activities);

    // Filter by custom date range if specified
    let filteredActivities = activities;
    if (options.timeRange === 'custom' && options.customStartDate && options.customEndDate) {
      const startDate = new Date(options.customStartDate);
      const endDate = new Date(options.customEndDate);
      filteredActivities = activities.filter(activity => {
        const activityDate = new Date(activity.timestamp);
        return activityDate >= startDate && activityDate <= endDate;
      });
    }

    console.log('🔍 ActivitySharing: Filtered activities:', filteredActivities.length);

    // Generate content based on format
    switch (options.format) {
      case 'summary':
        return this.generateSummaryText(filteredActivities, options);
      case 'detailed':
        return this.generateDetailedText(filteredActivities, options);
      case 'list':
        return this.generateListText(filteredActivities, options);
      default:
        return this.generateSummaryText(filteredActivities, options);
    }
  }
}
