export interface Book {
  id: number;
  title: string;
  author: string;
  publicationYear: number;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
  /** Catalog / synopsis text (search, APIs), separate from personal notes */
  description?: string;
  notes?: string;
  rating?: number;
  format?: 'text' | 'audio' | 'ebook';
  percentage?: number;
  source?: string;
  completedDate?: string;
  dateStarted?: string;
  dateAdded?: string;
  dateAbandoned?: string;
  isAllTime?: boolean;
}

export interface Movie {
  id: number;
  title: string;
  author: string; // Director
  publicationYear: number;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
  /** Catalog / synopsis text (search, APIs), separate from personal notes */
  description?: string;
  notes?: string;
  rating?: number;
  format?: 'streaming' | 'theater' | 'bluray' | 'dvd';
  percentage?: number;
  source?: string;
  completedDate?: string;
  dateStarted?: string;
  dateAdded?: string;
  dateAbandoned?: string;
  isAllTime?: boolean;
}

export interface BookData {
  completed: Book[];
  inProgress: Book[];
  planned: Book[];
  fails: Book[];
  allTime: Book[];
}

export interface MovieData {
  completed: Movie[];
  inProgress: Movie[];
  planned: Movie[];
  fails: Movie[];
  allTime: Movie[];
}

export interface FormData {
  title: string;
  author: string;
  publicationYear: number;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
  description: string;
  notes: string;
  rating: number;
  format: string;
  percentage: number;
  source: string;
  completedDate: string;
  isAllTime: boolean;
}

// Activity Logging System Types
export type ActivityType = 
  | 'added' 
  | 'completed' 
  | 'moved' 
  | 'updated' 
  | 'deleted' 
  | 'rated' 
  | 'started' 
  | 'abandoned';

export type ItemType = 'book' | 'movie';

export interface ActivityLog {
  id: string;
  timestamp: string; // ISO string
  type: ActivityType;
  itemType: ItemType;
  itemId: number;
  itemTitle: string;
  itemAuthor: string;
  fromCategory?: string;
  toCategory?: string;
  metadata?: {
    rating?: number;
    notes?: string;
    format?: string;
    percentage?: number;
    source?: string;
  };
}

export interface SharingOptions {
  timeRange: 'lastWeek' | 'lastMonth' | 'last3Months' | 'last6Months' | 'lastYear' | 'custom';
  customStartDate?: string;
  customEndDate?: string;
  includeTypes: ActivityType[];
  includeCategories: string[];
  includeItemTypes: ItemType[];
  format: 'summary' | 'detailed' | 'list';
}

export type ExportYearFilter = number | 'all';

export interface ExportSections {
  overview: boolean;
  books: boolean;
  movies: boolean;
  yearlyBreakdown: boolean;
}

export interface ExportCategoryToggles {
  completed: boolean;
  inProgress: boolean;
  planned: boolean;
  fails: boolean;
  allTime: boolean;
}

export interface ExportOptions {
  year: ExportYearFilter;
  sections: ExportSections;
  categories: ExportCategoryToggles;
}

export interface ReminderSettings {
  enabled: boolean;
  frequency: 'weekly' | 'monthly' | 'custom';
  customDays?: number;
  triggerType: 'time' | 'activity' | 'milestone' | 'combination';
  activityThreshold?: number;
  milestoneType?: 'completion' | 'addition' | 'rating';
  lastSent?: string;
  nextScheduled?: string;
}

// Enhanced API Search Results
export interface BookSearchResult {
  id: string;
  title: string;
  author: string;
  year?: number | null;
  description?: string | null;
  rating?: number | null;
  thumbnail?: string | null;
  isbn?: string | null;
  pageCount?: number | null;
  genres?: string[] | null;
  availability?: {
    [platform: string]: {
      price: number;
      inStock: boolean;
    };
  } | null;
}

export interface MovieSearchResult {
  id: string;
  title: string;
  director: string;
  year?: number | null;
  description?: string | null;
  rating?: number | null;
  thumbnail?: string | null;
  genres?: string[] | null;
  cast?: string[] | null;
  runtime?: number | null;
  availability?: {
    [platform: string]: {
      price: number;
      inStock: boolean;
    };
  } | null;
}