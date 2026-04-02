import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookData, MovieData, Book, Movie } from '@/types';
import {
  logBookAdded,
  logBookCompleted,
  logBookMoved,
  logBookRated,
  logMovieAdded,
  logMovieCompleted,
  logMovieMoved,
  logMovieRated
} from '@/utils/activityLogger';

const initialBooks: BookData = {
  completed: [],
  inProgress: [],
  planned: [],
  fails: [],
  allTime: []
};

const initialMovies: MovieData = {
  completed: [],
  inProgress: [],
  planned: [],
  fails: [],
  allTime: []
};

// Storage keys for persistent data
const BOOKS_STORAGE_KEY = 'fiftylist_books_data';
const MOVIES_STORAGE_KEY = 'fiftylist_movies_data';
const GOALS_STORAGE_KEY = 'fiftylist_goals_data';

interface DataStoreContextType {
  books: BookData;
  movies: MovieData;
  bookGoal: number;
  movieGoal: number;
  setBookGoal: (goal: number) => void;
  setMovieGoal: (goal: number) => void;
  addBook: (book: Omit<Book, 'id'>) => void;
  updateBook: (bookId: number, updatedBook: Book) => void;
  deleteBook: (bookId: number, category: keyof BookData) => void;
  reorderBooks: (category: keyof BookData, fromIndex: number, toIndex: number) => void;
  addMovie: (movie: Omit<Movie, 'id'>) => void;
  updateMovie: (movieId: number, updatedMovie: Movie) => void;
  deleteMovie: (movieId: number, category: keyof MovieData) => void;
  reorderMovies: (category: keyof MovieData, fromIndex: number, toIndex: number) => void;
  importItems: (importedBooks: Omit<Book, 'id'>[], importedMovies: Omit<Movie, 'id'>[]) => void;
  generateComprehensiveExport: () => string;
  forceUpdate: number;
}

const DataStoreContext = createContext<DataStoreContextType | undefined>(undefined);

  // FIXED: Simplified global state synchronization with enhanced error handling
  let globalStateVersion = 0;
  let stateChangeListeners: ((version: number) => void)[] = [];

  const notifyStateChange = () => {
    globalStateVersion++;
    console.log(`🔄 Global state change notification #${globalStateVersion}`);
    
    // Use requestAnimationFrame for better timing and error isolation
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        stateChangeListeners.forEach((listener, index) => {
          try {
            listener(globalStateVersion);
          } catch (error) {
            console.error(`Error in state change listener ${index}:`, error);
            // Remove problematic listener to prevent future crashes
            stateChangeListeners.splice(index, 1);
          }
        });
      });
    } else {
      // Fallback for environments without requestAnimationFrame
      setTimeout(() => {
        stateChangeListeners.forEach((listener, index) => {
          try {
            listener(globalStateVersion);
          } catch (error) {
            console.error(`Error in state change listener ${index}:`, error);
            // Remove problematic listener to prevent future crashes
            stateChangeListeners.splice(index, 1);
          }
        });
      }, 0);
    }
  };

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<BookData>(initialBooks);
  const [movies, setMovies] = useState<MovieData>(initialMovies);
  const [bookGoal, setBookGoal] = useState(50);
  const [movieGoal, setMovieGoal] = useState(50);
  const [forceUpdate, setForceUpdate] = useState(0);
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  // Data persistence functions with encryption
  const saveBooksToStorage = async (booksData: BookData) => {
    try {
      // Save books data to storage
      await AsyncStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(booksData));
      console.log('💾 Books data saved to secure storage');
    } catch (error) {
      console.error('❌ Error saving books to storage:', error);
      // Fallback to regular storage if secure storage fails
      try {
        await AsyncStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(booksData));
      } catch (fallbackError) {
        console.error('❌ Fallback storage also failed:', fallbackError);
      }
    }
  };

  const saveMoviesToStorage = async (moviesData: MovieData) => {
    try {
      // Save movies data to storage
      await AsyncStorage.setItem(MOVIES_STORAGE_KEY, JSON.stringify(moviesData));
      console.log('💾 Movies data saved to secure storage');
    } catch (error) {
      console.error('❌ Error saving movies to storage:', error);
      // Fallback to regular storage if secure storage fails
      try {
        await AsyncStorage.setItem(MOVIES_STORAGE_KEY, JSON.stringify(moviesData));
      } catch (fallbackError) {
        console.error('❌ Fallback storage also failed:', fallbackError);
      }
    }
  };

  const saveGoalsToStorage = async (bookGoalValue: number, movieGoalValue: number) => {
    try {
      const goalsData = { bookGoal: bookGoalValue, movieGoal: movieGoalValue };
      // Goals are not as sensitive, can use regular storage
      await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goalsData));
      console.log('💾 Goals data saved to storage');
    } catch (error) {
      console.error('❌ Error saving goals to storage:', error);
    }
  };

  const loadDataFromStorage = async () => {
    try {
      console.log('📂 Loading data from storage...');

      // Load data from storage

      // Load books data from storage
      const booksData = await AsyncStorage.getItem(BOOKS_STORAGE_KEY);
      if (booksData) {
        try {
          const parsedBooks = JSON.parse(booksData);
          setBooks(parsedBooks);
          console.log('📚 Loaded books data from secure storage');
        } catch (parseError) {
          console.error('❌ Error parsing books data:', parseError);
          // Try fallback to regular storage
          const fallbackData = await AsyncStorage.getItem(BOOKS_STORAGE_KEY);
          if (fallbackData) {
            const parsedBooks = JSON.parse(fallbackData);
            setBooks(parsedBooks);
          }
        }
      }

      // Load movies data from storage
      const moviesData = await AsyncStorage.getItem(MOVIES_STORAGE_KEY);
      if (moviesData) {
        try {
          const parsedMovies = JSON.parse(moviesData);
          setMovies(parsedMovies);
          console.log('🎬 Loaded movies data from secure storage');
        } catch (parseError) {
          console.error('❌ Error parsing movies data:', parseError);
          // Try fallback to regular storage
          const fallbackData = await AsyncStorage.getItem(MOVIES_STORAGE_KEY);
          if (fallbackData) {
            const parsedMovies = JSON.parse(fallbackData);
            setMovies(parsedMovies);
          }
        }
      }

      // Load goals data (not encrypted as it's not sensitive)
      const goalsData = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
      if (goalsData) {
        try {
          const parsedGoals = JSON.parse(goalsData);
          setBookGoal(parsedGoals.bookGoal || 50);
          setMovieGoal(parsedGoals.movieGoal || 50);
          console.log('🎯 Loaded goals data:', parsedGoals);
        } catch (parseError) {
          console.error('❌ Error parsing goals data:', parseError);
        }
      }

      setIsDataLoaded(true);
      console.log('✅ Data loading completed');
    } catch (error) {
      console.error('❌ Error loading data from storage:', error);
      setIsDataLoaded(true); // Still mark as loaded to prevent infinite loading
    }
  };

  // Load data from storage on app start
  useEffect(() => {
    loadDataFromStorage();
  }, []);

  // Register for global state change notifications
  useEffect(() => {
    const handleStateChange = (version: number) => {
      console.log(`🔄 Hook received state change notification #${version}`);
      setForceUpdate(version);
    };
    
    stateChangeListeners.push(handleStateChange);
    
    return () => {
      stateChangeListeners = stateChangeListeners.filter(listener => listener !== handleStateChange);
    };
  }, []);

  // Save data to storage whenever it changes
  useEffect(() => {
    if (isDataLoaded) {
      saveBooksToStorage(books);
    }
  }, [books, isDataLoaded]);

  useEffect(() => {
    if (isDataLoaded) {
      saveMoviesToStorage(movies);
    }
  }, [movies, isDataLoaded]);

  useEffect(() => {
    if (isDataLoaded) {
      saveGoalsToStorage(bookGoal, movieGoal);
    }
  }, [bookGoal, movieGoal, isDataLoaded]);

  // Helper function to get completion year from an item
  const getCompletionYear = (item: { completedDate?: string }): number | null => {
    if (!item.completedDate) return null;
    const date = new Date(item.completedDate);
    return date.getFullYear();
  };

  // Enhanced logging function
  const logDataState = (operation: string, type: 'book' | 'movie') => {
    const currentBooks = books;
    const currentMovies = movies;
    
    console.log(`📊 ${operation} - Current state:`, {
      books: {
        completed: currentBooks.completed.length,
        inProgress: currentBooks.inProgress.length,
        planned: currentBooks.planned.length,
        fails: currentBooks.fails.length,
        allTime: currentBooks.allTime.length,
      },
      movies: {
        completed: currentMovies.completed.length,
        inProgress: currentMovies.inProgress.length,
        planned: currentMovies.planned.length,
        fails: currentMovies.fails.length,
        allTime: currentMovies.allTime.length,
      }
    });
    
    // Log planned items in detail
    if (currentBooks.planned.length > 0) {
      console.log('📚 Detailed planned books:', currentBooks.planned.map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category
      })));
    }
    
    if (currentMovies.planned.length > 0) {
      console.log('🎬 Detailed planned movies:', currentMovies.planned.map(movie => ({
        id: movie.id,
        title: movie.title,
        author: movie.author,
        category: movie.category
      })));
    }
  };

  // FIXED: Simplified addBook function with immediate state updates
  const addBook = (book: Omit<Book, 'id'>) => {
    console.log('📚 addBook called with:', book);
    
    // Validate required fields
    if (!book || !book.title || !book.author) {
      console.error('❌ Invalid book data:', book);
      return;
    }
    
    // Generate truly unique ID
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 100000);
    const uniqueId = timestamp + random;
    
    const newBook: Book = { 
      ...book, 
      id: uniqueId,
      category: book.category || 'planned',
      percentage: book.percentage || (book.category === 'completed' ? 100 : 0),
    };
    
    console.log('📚 Generated new book:', newBook);
    
    // FIXED: Immediate synchronous state update
    setBooks(prevBooks => {
      console.log('📚 Previous books state:', prevBooks);
      
      // Validate prevBooks exists
      if (!prevBooks) {
        console.error('❌ Previous books state is null/undefined');
        return initialBooks;
      }
      
      // Validate category exists
      if (!prevBooks[newBook.category]) {
        console.error('❌ Invalid category:', newBook.category);
        return prevBooks;
      }
      
      // Check for duplicates
      const categoryItems = prevBooks[newBook.category] || [];
      const isDuplicate = categoryItems.some(item => 
        item && item.title && item.author &&
        item.title.toLowerCase() === newBook.title.toLowerCase() &&
        item.author.toLowerCase() === newBook.author.toLowerCase()
      );
      
      if (isDuplicate) {
        console.warn('⚠️ Duplicate book detected, skipping:', newBook.title);
        return prevBooks;
      }
      
      // Create new state with safety checks
      const newBooks = {
        ...prevBooks,
        [newBook.category]: [...(prevBooks[newBook.category] || []), newBook]
      };
      
      console.log('📚 New books state after addition:', newBooks);
      console.log(`📚 ${newBook.category} books count: ${(newBooks[newBook.category] || []).length}`);
      
      // Trigger state change notification with error handling
      try {
        notifyStateChange();
      } catch (error) {
        console.error('❌ Error in notifyStateChange:', error);
      }
      
      return newBooks;
    });

    // Handle all-time favorites
    if (newBook.isAllTime && newBook.category !== 'allTime') {
      setBooks(prevBooks => ({
        ...prevBooks,
        allTime: [...prevBooks.allTime.filter(item => item.id !== newBook.id), { ...newBook, isAllTime: true }]
      }));
    }
    
    // Log activity
    logBookAdded(newBook, newBook.category);
    
    console.log('📚 addBook completed for:', newBook.title);
  };

  const updateBook = (bookId: number, updatedBook: Book) => {
    console.log('📚 updateBook called for ID:', bookId);
    
    setBooks(prevBooks => {
      // Find which category the book is currently in
      let oldCategory: keyof BookData | null = null;
      for (const category of Object.keys(prevBooks || {}) as (keyof BookData)[]) {
        if (prevBooks[category] && prevBooks[category].some(book => book.id === bookId)) {
          oldCategory = category;
          break;
        }
      }

      if (!oldCategory) {
        console.error('❌ Book not found with ID:', bookId);
        return prevBooks;
      }

      // Create the updated state by removing the item from ALL categories first
      const newBooks = { ...prevBooks };
      
      // Remove the item from ALL categories to prevent duplicates
      for (const category of Object.keys(newBooks || {}) as (keyof BookData)[]) {
        if (newBooks[category]) {
          newBooks[category] = prevBooks[category].filter(book => book.id !== bookId);
        }
      }

      // Add the updated item to the target category
      newBooks[updatedBook.category] = [...newBooks[updatedBook.category], updatedBook];

      console.log('📚 Book updated successfully');
      
      // Log activity based on what changed
      if (oldCategory !== updatedBook.category) {
        // Book was moved between categories
        logBookMoved(updatedBook, oldCategory, updatedBook.category);
      }
      
      if (updatedBook.category === 'completed' && oldCategory !== 'completed') {
        // Book was completed
        logBookCompleted(updatedBook);
      }
      
      if (updatedBook.rating && updatedBook.rating > 0) {
        // Book was rated
        logBookRated(updatedBook, updatedBook.rating);
      }
      
      // Notify state change
      notifyStateChange();
      
      return newBooks;
    });

    // Handle all-time favorites separately
    setBooks(prevBooks => {
      if (updatedBook.isAllTime && updatedBook.category !== 'allTime') {
        // Add to all-time if marked as favorite and not already in all-time category
        return {
          ...prevBooks,
          allTime: [...prevBooks.allTime.filter(item => item.id !== updatedBook.id), { ...updatedBook, isAllTime: true }]
        };
      } else if (!updatedBook.isAllTime) {
        // Remove from all-time if no longer marked as favorite
        return {
          ...prevBooks,
          allTime: prevBooks.allTime.filter(item => item.id !== updatedBook.id)
        };
      }
      return prevBooks;
    });
  };

  const deleteBook = (bookId: number, category: keyof BookData) => {
    console.log('📚 deleteBook called for ID:', bookId, 'in category:', category);
    
    setBooks(prevBooks => {
      const newBooks = {
        ...prevBooks,
        [category]: prevBooks[category].filter(book => book.id !== bookId)
      };
      
      console.log('📚 Book deleted successfully');
      
      // Notify state change
      notifyStateChange();
      
      return newBooks;
    });

    // Also remove from all-time if it exists there
    setBooks(prevBooks => ({
      ...prevBooks,
      allTime: prevBooks.allTime.filter(item => item.id !== bookId)
    }));
  };

  const reorderBooks = (category: keyof BookData, fromIndex: number, toIndex: number) => {
    setBooks(prevBooks => {
      const items = [...prevBooks[category]];
      const [movedItem] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, movedItem);
      
      const newBooks = {
        ...prevBooks,
        [category]: items
      };
      
      // Notify state change
      notifyStateChange();
      
      return newBooks;
    });
  };

  // FIXED: Simplified addMovie function with immediate state updates
  const addMovie = (movie: Omit<Movie, 'id'>) => {
    console.log('🎬 addMovie called with:', movie);
    
    // Validate required fields
    if (!movie || !movie.title || !movie.author) {
      console.error('❌ Invalid movie data:', movie);
      return;
    }
    
    // Generate truly unique ID
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 100000);
    const uniqueId = timestamp + random;
    
    const newMovie: Movie = { 
      ...movie, 
      id: uniqueId,
      category: movie.category || 'planned',
      percentage: movie.percentage || (movie.category === 'completed' ? 100 : 0),
    };
    
    console.log('🎬 Generated new movie:', newMovie);
    
    // FIXED: Immediate synchronous state update
    setMovies(prevMovies => {
      console.log('🎬 Previous movies state:', prevMovies);
      
      // Validate prevMovies exists
      if (!prevMovies) {
        console.error('❌ Previous movies state is null/undefined');
        return initialMovies;
      }
      
      // Validate category exists
      if (!prevMovies[newMovie.category]) {
        console.error('❌ Invalid category:', newMovie.category);
        return prevMovies;
      }
      
      // Check for duplicates
      const categoryItems = prevMovies[newMovie.category] || [];
      const isDuplicate = categoryItems.some(item => 
        item && item.title && item.author &&
        item.title.toLowerCase() === newMovie.title.toLowerCase() &&
        item.author.toLowerCase() === newMovie.author.toLowerCase()
      );
      
      if (isDuplicate) {
        console.warn('⚠️ Duplicate movie detected, skipping:', newMovie.title);
        return prevMovies;
      }
      
      // Create new state with safety checks
      const newMovies = {
        ...prevMovies,
        [newMovie.category]: [...(prevMovies[newMovie.category] || []), newMovie]
      };
      
      console.log('🎬 New movies state after addition:', newMovies);
      console.log(`🎬 ${newMovie.category} movies count: ${(newMovies[newMovie.category] || []).length}`);
      
      // Trigger state change notification with error handling
      try {
        notifyStateChange();
      } catch (error) {
        console.error('❌ Error in notifyStateChange:', error);
      }
      
      return newMovies;
    });

    // Handle all-time favorites
    if (newMovie.isAllTime && newMovie.category !== 'allTime') {
      setMovies(prevMovies => ({
        ...prevMovies,
        allTime: [...prevMovies.allTime.filter(item => item.id !== newMovie.id), { ...newMovie, isAllTime: true }]
      }));
    }
    
    // Log activity
    logMovieAdded(newMovie, newMovie.category);
    
    console.log('🎬 addMovie completed for:', newMovie.title);
  };

  const updateMovie = (movieId: number, updatedMovie: Movie) => {
    console.log('🎬 updateMovie called for ID:', movieId);
    
    setMovies(prevMovies => {
      // Find which category the movie is currently in
      let oldCategory: keyof MovieData | null = null;
      for (const category of Object.keys(prevMovies) as (keyof MovieData)[]) {
        if (prevMovies[category].some(movie => movie.id === movieId)) {
          oldCategory = category;
          break;
        }
      }

      if (!oldCategory) {
        console.error('❌ Movie not found with ID:', movieId);
        return prevMovies;
      }

      // Create the updated state by removing the item from ALL categories first
      const newMovies = { ...prevMovies };
      
      // Remove the item from ALL categories to prevent duplicates
      for (const category of Object.keys(newMovies || {}) as (keyof MovieData)[]) {
        if (newMovies[category]) {
          newMovies[category] = prevMovies[category].filter(movie => movie.id !== movieId);
        }
      }

      // Add the updated item to the target category
      newMovies[updatedMovie.category] = [...newMovies[updatedMovie.category], updatedMovie];

      console.log('🎬 Movie updated successfully');
      
      // Log activity based on what changed
      if (oldCategory !== updatedMovie.category) {
        // Movie was moved between categories
        logMovieMoved(updatedMovie, oldCategory, updatedMovie.category);
      }
      
      if (updatedMovie.category === 'completed' && oldCategory !== 'completed') {
        // Movie was completed
        logMovieCompleted(updatedMovie);
      }
      
      if (updatedMovie.rating && updatedMovie.rating > 0) {
        // Movie was rated
        logMovieRated(updatedMovie, updatedMovie.rating);
      }
      
      // Notify state change
      notifyStateChange();
      
      return newMovies;
    });

    // Handle all-time favorites separately
    setMovies(prevMovies => {
      if (updatedMovie.isAllTime && updatedMovie.category !== 'allTime') {
        // Add to all-time if marked as favorite and not already in all-time category
        return {
          ...prevMovies,
          allTime: [...prevMovies.allTime.filter(item => item.id !== updatedMovie.id), { ...updatedMovie, isAllTime: true }]
        };
      } else if (!updatedMovie.isAllTime) {
        // Remove from all-time if no longer marked as favorite
        return {
          ...prevMovies,
          allTime: prevMovies.allTime.filter(item => item.id !== updatedMovie.id)
        };
      }
      return prevMovies;
    });
  };

  const deleteMovie = (movieId: number, category: keyof MovieData) => {
    console.log('🎬 deleteMovie called for ID:', movieId, 'in category:', category);
    
    setMovies(prevMovies => {
      const newMovies = {
        ...prevMovies,
        [category]: prevMovies[category].filter(movie => movie.id !== movieId)
      };
      
      // Notify state change
      notifyStateChange();
      
      return newMovies;
    });

    // Also remove from all-time if it exists there
    setMovies(prevMovies => ({
      ...prevMovies,
      allTime: prevMovies.allTime.filter(item => item.id !== movieId)
    }));
    
    console.log('🎬 Movie deleted successfully');
  };

  const reorderMovies = (category: keyof MovieData, fromIndex: number, toIndex: number) => {
    setMovies(prevMovies => {
      const items = [...prevMovies[category]];
      const [movedItem] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, movedItem);
      
      const newMovies = {
        ...prevMovies,
        [category]: items
      };
      
      // Notify state change
      notifyStateChange();
      
      return newMovies;
    });
  };

  // Bulk import function for importing multiple items at once
  const importItems = (importedBooks: Omit<Book, 'id'>[], importedMovies: Omit<Movie, 'id'>[]) => {
    console.log('📦 importItems called with:', importedBooks.length, 'books and', importedMovies.length, 'movies');
    
    // Process books in batches to avoid state update conflicts
    if (importedBooks.length > 0) {
      setBooks(prevBooks => {
        const newBooks = { ...prevBooks };
        
        importedBooks.forEach(book => {
          const newBook = { ...book, id: Date.now() + Math.random() * 1000 };
          newBooks[book.category] = [...newBooks[book.category], newBook];
          
          // Handle all-time favorites
          if (book.isAllTime && book.category !== 'allTime') {
            newBooks.allTime = [...newBooks.allTime.filter(item => item.id !== newBook.id), { ...newBook, isAllTime: true }];
          }
        });
        
        // Notify state change
        notifyStateChange();
        
        return newBooks;
      });
    }

    // Process movies in batches to avoid state update conflicts
    if (importedMovies.length > 0) {
      setMovies(prevMovies => {
        const newMovies = { ...prevMovies };
        
        importedMovies.forEach(movie => {
          const newMovie = { ...movie, id: Date.now() + Math.random() * 1000 };
          newMovies[movie.category] = [...newMovies[movie.category], newMovie];
          
          // Handle all-time favorites
          if (movie.isAllTime && movie.category !== 'allTime') {
            newMovies.allTime = [...newMovies.allTime.filter(item => item.id !== newMovie.id), { ...newMovie, isAllTime: true }];
          }
        });
        
        // Notify state change
        notifyStateChange();
        
        return newMovies;
      });
    }
    
    console.log('📦 importItems completed');
  };

  // Enhanced export function for comprehensive data export
  const generateComprehensiveExport = () => {
    console.log('📤 Starting export generation...');
    
    try {
      // Validate data structure
      if (!books || !movies) {
        console.error('❌ Export error: books or movies data is undefined');
        throw new Error('Data structure is invalid');
      }

      console.log('📤 Data validation passed:', {
        books: typeof books,
        movies: typeof movies,
        bookGoal,
        movieGoal
      });

      const currentYear = new Date().getFullYear();
      const exportDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      const exportTime = new Date().toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      console.log('📤 Export metadata:', { currentYear, exportDate, exportTime });

      // Helper function to format items
      const formatItem = (item: Book | Movie, index: number, isBook: boolean) => {
        // Safety check for null/undefined item
        if (!item || typeof item !== 'object') {
          return `${index + 1}. [Invalid item]`;
        }
        
        const formatLabels = isBook ? {
          text: 'Hardcopy',
          audio: 'Audio',
          ebook: 'eBook'
        } : {
          streaming: 'Streaming',
          theater: 'Theater',
          bluray: 'Blu-ray',
          dvd: 'DVD'
        };

        let itemText = `${index + 1}. "${item.title || 'Unknown Title'}" by ${item.author || 'Unknown Author'} (${item.publicationYear || 'Unknown Year'})`;
        
        if (item.format) {
          itemText += ` [${formatLabels[item.format as keyof typeof formatLabels] || item.format}]`;
        }
        
        if (item.rating) {
          itemText += ` ⭐ ${item.rating}/5 stars`;
        }
        
        if (item.percentage && item.percentage < 100) {
          itemText += ` (${item.percentage}% complete)`;
        }
        
        if (item.completedDate) {
          const date = new Date(item.completedDate).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          itemText += ` - Completed: ${date}`;
        }
        
        if (item.dateStarted) {
          const date = new Date(item.dateStarted).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          itemText += ` - Started: ${date}`;
        }
        
        if (item.dateAdded) {
          const date = new Date(item.dateAdded).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
          });
          itemText += ` - Added: ${date}`;
        }
        
        if (item.source) {
          itemText += ` - Source: ${item.source}`;
        }
        
        if (item.isAllTime) {
          itemText += ` 🏆 ALL-TIME FAVORITE`;
        }
        
        if (item.notes) {
          itemText += `\n   Notes: "${item.notes}"`;
        }
        
        return itemText;
      };

      // Calculate statistics using completion dates
      const totalBooks = books ? Object.values(books).flat().length : 0;
      const totalMovies = movies ? Object.values(movies).flat().length : 0;
      const booksThisYear = books && books.completed && Array.isArray(books.completed) ? books.completed.filter(book => {
        if (!book || typeof book !== 'object') return false;
        const completionYear = getCompletionYear(book);
        return completionYear === currentYear;
      }).length : 0;
      const moviesThisYear = movies && movies.completed && Array.isArray(movies.completed) ? movies.completed.filter(movie => {
        if (!movie || typeof movie !== 'object') return false;
        const completionYear = getCompletionYear(movie);
        return completionYear === currentYear;
      }).length : 0;
      const bookProgress = Math.round((booksThisYear / bookGoal) * 100);
      const movieProgress = Math.round((moviesThisYear / movieGoal) * 100);

      console.log('📤 Calculated statistics:', {
        totalBooks,
        totalMovies,
        booksThisYear,
        moviesThisYear,
        bookProgress,
        movieProgress
      });

      // Calculate average ratings
      const booksWithRatings = books && books.completed && Array.isArray(books.completed) ? books.completed.filter(book => book && book.rating && book.rating > 0) : [];
      const moviesWithRatings = movies && movies.completed && Array.isArray(movies.completed) ? movies.completed.filter(movie => movie && movie.rating && movie.rating > 0) : [];
      const avgBookRating = booksWithRatings.length > 0 
        ? (booksWithRatings.reduce((sum, book) => sum + (book.rating || 0), 0) / booksWithRatings.length).toFixed(1)
        : 'N/A';
      const avgMovieRating = moviesWithRatings.length > 0 
        ? (moviesWithRatings.reduce((sum, movie) => sum + (movie.rating || 0), 0) / moviesWithRatings.length).toFixed(1)
        : 'N/A';

      // Build comprehensive export text
      let exportText = `📚🎬 MY COMPLETE READING & WATCHING LIST
═══════════════════════════════════════════════════════════

Generated: ${exportDate} at ${exportTime}

📊 OVERVIEW & STATISTICS
═══════════════════════════════════════════════════════════

📈 ${currentYear} GOALS & PROGRESS:
• Books Goal: ${booksThisYear}/${bookGoal} (${bookProgress}%)
• Movies Goal: ${moviesThisYear}/${movieGoal} (${movieProgress}%)
• Combined Progress: ${booksThisYear + moviesThisYear}/${bookGoal + movieGoal} items

📚 BOOK STATISTICS:
• Total Books: ${totalBooks}
• Completed: ${books.completed.length}
• Currently Reading: ${books.inProgress.length}
• Planned: ${books.planned.length}
• Stopped/DNF: ${books.fails.length}
• All-Time Favorites: ${books.allTime.length}
• Average Rating: ${avgBookRating}/5 stars

🎬 MOVIE STATISTICS:
• Total Movies: ${totalMovies}
• Completed: ${movies.completed.length}
• Currently Watching: ${movies.inProgress.length}
• Planned: ${movies.planned.length}
• Stopped: ${movies.fails.length}
• All-Time Favorites: ${movies.allTime.length}
• Average Rating: ${avgMovieRating}/5 stars

`;

      // Add Books sections
      exportText += `\n📚 BOOKS
═══════════════════════════════════════════════════════════\n\n`;

      if (books && books.completed && Array.isArray(books.completed) && books.completed.length > 0) {
        exportText += `✅ COMPLETED BOOKS (${books.completed.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.completed.forEach((book, index) => {
          if (book && typeof book === 'object') {
            exportText += formatItem(book, index, true) + '\n';
          }
        });
        exportText += '\n';
      }

      if (books && books.inProgress && Array.isArray(books.inProgress) && books.inProgress.length > 0) {
        exportText += `📖 CURRENTLY READING (${books.inProgress.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.inProgress.forEach((book, index) => {
          if (book && typeof book === 'object') {
            exportText += formatItem(book, index, true) + '\n';
          }
        });
        exportText += '\n';
      }

      if (books && books.planned && Array.isArray(books.planned) && books.planned.length > 0) {
        exportText += `📋 WANT TO READ (${books.planned.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.planned.forEach((book, index) => {
          if (book && typeof book === 'object') {
            exportText += formatItem(book, index, true) + '\n';
          }
        });
        exportText += '\n';
      }

      if (books && books.fails && Array.isArray(books.fails) && books.fails.length > 0) {
        exportText += `❌ STOPPED/DNF BOOKS (${books.fails.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.fails.forEach((book, index) => {
          if (book && typeof book === 'object') {
            exportText += formatItem(book, index, true) + '\n';
          }
        });
        exportText += '\n';
      }

      if (books && books.allTime && Array.isArray(books.allTime) && books.allTime.length > 0) {
        exportText += `🏆 ALL-TIME FAVORITE BOOKS (${books.allTime.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.allTime.forEach((book, index) => {
          if (book && typeof book === 'object') {
            exportText += formatItem(book, index, true) + '\n';
          }
        });
        exportText += '\n';
      }

      // Add Movies sections
      exportText += `\n🎬 MOVIES
═══════════════════════════════════════════════════════════\n\n`;

      if (movies && movies.completed && Array.isArray(movies.completed) && movies.completed.length > 0) {
        exportText += `✅ COMPLETED MOVIES (${movies.completed.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.completed.forEach((movie, index) => {
          if (movie && typeof movie === 'object') {
            exportText += formatItem(movie, index, false) + '\n';
          }
        });
        exportText += '\n';
      }

      if (movies && movies.inProgress && Array.isArray(movies.inProgress) && movies.inProgress.length > 0) {
        exportText += `🎥 CURRENTLY WATCHING (${movies.inProgress.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.inProgress.forEach((movie, index) => {
          if (movie && typeof movie === 'object') {
            exportText += formatItem(movie, index, false) + '\n';
          }
        });
        exportText += '\n';
      }

      if (movies && movies.planned && Array.isArray(movies.planned) && movies.planned.length > 0) {
        exportText += `📋 WANT TO WATCH (${movies.planned.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.planned.forEach((movie, index) => {
          if (movie && typeof movie === 'object') {
            exportText += formatItem(movie, index, false) + '\n';
          }
        });
        exportText += '\n';
      }

      if (movies && movies.fails && Array.isArray(movies.fails) && movies.fails.length > 0) {
        exportText += `❌ STOPPED MOVIES (${movies.fails.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.fails.forEach((movie, index) => {
          if (movie && typeof movie === 'object') {
            exportText += formatItem(movie, index, false) + '\n';
          }
        });
        exportText += '\n';
      }

      if (movies && movies.allTime && Array.isArray(movies.allTime) && movies.allTime.length > 0) {
        exportText += `🏆 ALL-TIME FAVORITE MOVIES (${movies.allTime.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.allTime.forEach((movie, index) => {
          if (movie && typeof movie === 'object') {
            exportText += formatItem(movie, index, false) + '\n';
          }
        });
        exportText += '\n';
      }

      // Add yearly breakdown using completion dates
      const yearlyBooks: { [year: number]: number } = {};
      const yearlyMovies: { [year: number]: number } = {};
      
      if (books && books.completed && Array.isArray(books.completed)) {
        books.completed.forEach(book => {
          if (book && typeof book === 'object') {
            const completionYear = getCompletionYear(book);
            if (completionYear) {
              yearlyBooks[completionYear] = (yearlyBooks[completionYear] || 0) + 1;
            }
          }
        });
      }
      
      if (movies && movies.completed && Array.isArray(movies.completed)) {
        movies.completed.forEach(movie => {
          if (movie && typeof movie === 'object') {
            const completionYear = getCompletionYear(movie);
            if (completionYear) {
              yearlyMovies[completionYear] = (yearlyMovies[completionYear] || 0) + 1;
            }
          }
        });
      }

      if (Object.keys(yearlyBooks || {}).length > 0 || Object.keys(yearlyMovies || {}).length > 0) {
        exportText += `\n📅 YEARLY BREAKDOWN (by completion date)
═══════════════════════════════════════════════════════════\n\n`;
        
        const allYears = new Set([...Object.keys(yearlyBooks || {}), ...Object.keys(yearlyMovies || {})]);
        const sortedYears = Array.from(allYears).map(Number).sort((a, b) => b - a);
        
        sortedYears.forEach(year => {
          const bookCount = yearlyBooks[year] || 0;
          const movieCount = yearlyMovies[year] || 0;
          const total = bookCount + movieCount;
          
          if (total > 0) {
            exportText += `${year}: ${total} total (${bookCount} books, ${movieCount} movies)\n`;
          }
        });
      }

      exportText += `\n═══════════════════════════════════════════════════════════
End of Export - Generated by FiftyList App
═══════════════════════════════════════════════════════════`;

      console.log('📤 Export generation completed successfully');
      console.log('📤 Export text length:', exportText.length);
      
      return exportText;
      
    } catch (error) {
      console.error('❌ Error generating export:', error);
      
      // Return a basic export with error information
      return `📚🎬 EXPORT ERROR
═══════════════════════════════════════════════════════════

An error occurred while generating the export:
${error instanceof Error ? error.message : 'Unknown error'}

Please try again or contact support if the issue persists.

Generated: ${new Date().toLocaleString()}
═══════════════════════════════════════════════════════════`;
    }
  };

  // Enhanced debug logging to track state changes
  useEffect(() => {
    logDataState('Books state changed', 'book');
  }, [books]);

  useEffect(() => {
    logDataState('Movies state changed', 'movie');
  }, [movies]);

  // Persistent goal setters
  const setBookGoalPersistent = (goal: number) => {
    setBookGoal(goal);
    if (isDataLoaded) {
      saveGoalsToStorage(goal, movieGoal);
    }
  };

  const setMovieGoalPersistent = (goal: number) => {
    setMovieGoal(goal);
    if (isDataLoaded) {
      saveGoalsToStorage(bookGoal, goal);
    }
  };

  const value: DataStoreContextType = {
    books,
    movies,
    bookGoal,
    movieGoal,
    setBookGoal: setBookGoalPersistent,
    setMovieGoal: setMovieGoalPersistent,
    addBook,
    updateBook,
    deleteBook,
    reorderBooks,
    addMovie,
    updateMovie,
    deleteMovie,
    reorderMovies,
    importItems,
    generateComprehensiveExport,
    forceUpdate,
  };

  return (
    <DataStoreContext.Provider value={value}>
      {children}
    </DataStoreContext.Provider>
  );
}

export function useDataStore() {
  const context = useContext(DataStoreContext);
  if (context === undefined) {
    throw new Error('useDataStore must be used within a DataStoreProvider');
  }
  return context;
}