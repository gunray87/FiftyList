export interface Book {
  id: number;
  title: string;
  author: string;
  year: number;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
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
  year: number;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
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
  year: number;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
  notes: string;
  rating: number;
  format: string;
  percentage: number;
  source: string;
  completedDate: string;
  isAllTime: boolean;
}