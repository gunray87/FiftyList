import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BookData, MovieData, Book, Movie } from '@/types';

const initialBooks: BookData = {
  completed: [
    { id: 1, title: "The Wager", author: "David Grann", year: 2024, category: 'completed', rating: 4, format: "text", completedDate: "2024-01-15" },
    { id: 2, title: "The Devil's Star", author: "Jo Nesbo", year: 2024, category: 'completed', rating: 3, format: "text", completedDate: "2024-02-10" }
  ],
  inProgress: [
    { id: 100, title: "James", author: "Percival Everett", year: 2025, category: 'inProgress', percentage: 50, format: "text", dateStarted: "2025-01-20" }
  ],
  planned: [
    { id: 200, title: "Project Hail Mary", author: "Andy Weir", year: 2025, category: 'planned', format: "text", dateAdded: "2025-01-20" }
  ],
  fails: [
    { id: 300, title: "First Life", author: "Unknown", year: 2024, category: 'fails', percentage: 5, format: "text", dateAbandoned: "2024-03-15" }
  ],
  allTime: [
    { id: 400, title: "The Lord of the Rings", author: "J.R.R. Tolkien", year: 2023, category: 'allTime', rating: 5, format: "text", completedDate: "2023-08-15", isAllTime: true, notes: "Life-changing epic fantasy" }
  ]
};

const initialMovies: MovieData = {
  completed: [
    { id: 1, title: "Oppenheimer", author: "Christopher Nolan", year: 2023, category: 'completed', rating: 5, format: "theater", completedDate: "2023-07-21" },
    { id: 2, title: "Dune: Part Two", author: "Denis Villeneuve", year: 2024, category: 'completed', rating: 4, format: "theater", completedDate: "2024-03-01" }
  ],
  inProgress: [
    { id: 100, title: "The Lord of the Rings: Extended Edition", author: "Peter Jackson", year: 2001, category: 'inProgress', percentage: 60, format: "bluray", dateStarted: "2025-01-20" }
  ],
  planned: [
    { id: 200, title: "Blade Runner 2049", author: "Denis Villeneuve", year: 2017, category: 'planned', format: "streaming", dateAdded: "2025-01-20" }
  ],
  fails: [
    { id: 300, title: "The Matrix Resurrections", author: "Lana Wachowski", year: 2021, category: 'fails', percentage: 25, format: "streaming", dateAbandoned: "2024-01-10" }
  ],
  allTime: [
    { id: 400, title: "The Godfather", author: "Francis Ford Coppola", year: 1972, category: 'allTime', rating: 5, format: "bluray", completedDate: "2023-12-25", isAllTime: true, notes: "Masterpiece of cinema" }
  ]
};

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

// FIXED: Simplified global state synchronization
let globalStateVersion = 0;
let stateChangeListeners: ((version: number) => void)[] = [];

const notifyStateChange = () => {
  globalStateVersion++;
  console.log(`🔄 Global state change notification #${globalStateVersion}`);
  
  // Use setTimeout to ensure state updates are processed
  setTimeout(() => {
    stateChangeListeners.forEach(listener => {
      try {
        listener(globalStateVersion);
      } catch (error) {
        console.error('Error in state change listener:', error);
      }
    });
  }, 0);
};

export function DataStoreProvider({ children }: { children: ReactNode }) {
  const [books, setBooks] = useState<BookData>(initialBooks);
  const [movies, setMovies] = useState<MovieData>(initialMovies);
  const [bookGoal, setBookGoal] = useState(50);
  const [movieGoal, setMovieGoal] = useState(50);
  const [forceUpdate, setForceUpdate] = useState(0);

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
      
      // Validate category exists
      if (!prevBooks[newBook.category]) {
        console.error('❌ Invalid category:', newBook.category);
        return prevBooks;
      }
      
      // Check for duplicates
      const categoryItems = prevBooks[newBook.category];
      const isDuplicate = categoryItems.some(item => 
        item.title.toLowerCase() === newBook.title.toLowerCase() &&
        item.author.toLowerCase() === newBook.author.toLowerCase()
      );
      
      if (isDuplicate) {
        console.warn('⚠️ Duplicate book detected, skipping:', newBook.title);
        return prevBooks;
      }
      
      // Create new state
      const newBooks = {
        ...prevBooks,
        [newBook.category]: [...prevBooks[newBook.category], newBook]
      };
      
      console.log('📚 New books state after addition:', newBooks);
      console.log(`📚 ${newBook.category} books count: ${newBooks[newBook.category].length}`);
      
      // Trigger immediate state change notification
      notifyStateChange();
      
      return newBooks;
    });

    // Handle all-time favorites
    if (newBook.isAllTime && newBook.category !== 'allTime') {
      setBooks(prevBooks => ({
        ...prevBooks,
        allTime: [...prevBooks.allTime.filter(item => item.id !== newBook.id), { ...newBook, isAllTime: true }]
      }));
    }
    
    console.log('📚 addBook completed for:', newBook.title);
  };

  const updateBook = (bookId: number, updatedBook: Book) => {
    console.log('📚 updateBook called for ID:', bookId);
    
    setBooks(prevBooks => {
      // Find which category the book is currently in
      let oldCategory: keyof BookData | null = null;
      for (const category of Object.keys(prevBooks) as (keyof BookData)[]) {
        if (prevBooks[category].some(book => book.id === bookId)) {
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
      for (const category of Object.keys(newBooks) as (keyof BookData)[]) {
        newBooks[category] = prevBooks[category].filter(book => book.id !== bookId);
      }

      // Add the updated item to the target category
      newBooks[updatedBook.category] = [...newBooks[updatedBook.category], updatedBook];

      console.log('📚 Book updated successfully');
      
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
      
      // Validate category exists
      if (!prevMovies[newMovie.category]) {
        console.error('❌ Invalid category:', newMovie.category);
        return prevMovies;
      }
      
      // Check for duplicates
      const categoryItems = prevMovies[newMovie.category];
      const isDuplicate = categoryItems.some(item => 
        item.title.toLowerCase() === newMovie.title.toLowerCase() &&
        item.author.toLowerCase() === newMovie.author.toLowerCase()
      );
      
      if (isDuplicate) {
        console.warn('⚠️ Duplicate movie detected, skipping:', newMovie.title);
        return prevMovies;
      }
      
      // Create new state
      const newMovies = {
        ...prevMovies,
        [newMovie.category]: [...prevMovies[newMovie.category], newMovie]
      };
      
      console.log('🎬 New movies state after addition:', newMovies);
      console.log(`🎬 ${newMovie.category} movies count: ${newMovies[newMovie.category].length}`);
      
      // Trigger immediate state change notification
      notifyStateChange();
      
      return newMovies;
    });

    // Handle all-time favorites
    if (newMovie.isAllTime && newMovie.category !== 'allTime') {
      setMovies(prevMovies => ({
        ...prevMovies,
        allTime: [...prevMovies.allTime.filter(item => item.id !== newMovie.id), { ...newMovie, isAllTime: true }]
      }));
    }
    
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
      for (const category of Object.keys(newMovies) as (keyof MovieData)[]) {
        newMovies[category] = prevMovies[category].filter(movie => movie.id !== movieId);
      }

      // Add the updated item to the target category
      newMovies[updatedMovie.category] = [...newMovies[updatedMovie.category], updatedMovie];

      console.log('🎬 Movie updated successfully');
      
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

        let itemText = `${index + 1}. "${item.title}" by ${item.author} (${item.year})`;
        
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
      const totalBooks = Object.values(books).flat().length;
      const totalMovies = Object.values(movies).flat().length;
      const booksThisYear = books.completed.filter(book => {
        const completionYear = getCompletionYear(book);
        return completionYear === currentYear;
      }).length;
      const moviesThisYear = movies.completed.filter(movie => {
        const completionYear = getCompletionYear(movie);
        return completionYear === currentYear;
      }).length;
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
      const booksWithRatings = books.completed.filter(book => book.rating && book.rating > 0);
      const moviesWithRatings = movies.completed.filter(movie => movie.rating && movie.rating > 0);
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

      if (books.completed.length > 0) {
        exportText += `✅ COMPLETED BOOKS (${books.completed.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.completed.forEach((book, index) => {
          exportText += formatItem(book, index, true) + '\n';
        });
        exportText += '\n';
      }

      if (books.inProgress.length > 0) {
        exportText += `📖 CURRENTLY READING (${books.inProgress.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.inProgress.forEach((book, index) => {
          exportText += formatItem(book, index, true) + '\n';
        });
        exportText += '\n';
      }

      if (books.planned.length > 0) {
        exportText += `📋 WANT TO READ (${books.planned.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.planned.forEach((book, index) => {
          exportText += formatItem(book, index, true) + '\n';
        });
        exportText += '\n';
      }

      if (books.fails.length > 0) {
        exportText += `❌ STOPPED/DNF BOOKS (${books.fails.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.fails.forEach((book, index) => {
          exportText += formatItem(book, index, true) + '\n';
        });
        exportText += '\n';
      }

      if (books.allTime.length > 0) {
        exportText += `🏆 ALL-TIME FAVORITE BOOKS (${books.allTime.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        books.allTime.forEach((book, index) => {
          exportText += formatItem(book, index, true) + '\n';
        });
        exportText += '\n';
      }

      // Add Movies sections
      exportText += `\n🎬 MOVIES
═══════════════════════════════════════════════════════════\n\n`;

      if (movies.completed.length > 0) {
        exportText += `✅ COMPLETED MOVIES (${movies.completed.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.completed.forEach((movie, index) => {
          exportText += formatItem(movie, index, false) + '\n';
        });
        exportText += '\n';
      }

      if (movies.inProgress.length > 0) {
        exportText += `🎥 CURRENTLY WATCHING (${movies.inProgress.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.inProgress.forEach((movie, index) => {
          exportText += formatItem(movie, index, false) + '\n';
        });
        exportText += '\n';
      }

      if (movies.planned.length > 0) {
        exportText += `📋 WANT TO WATCH (${movies.planned.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.planned.forEach((movie, index) => {
          exportText += formatItem(movie, index, false) + '\n';
        });
        exportText += '\n';
      }

      if (movies.fails.length > 0) {
        exportText += `❌ STOPPED MOVIES (${movies.fails.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.fails.forEach((movie, index) => {
          exportText += formatItem(movie, index, false) + '\n';
        });
        exportText += '\n';
      }

      if (movies.allTime.length > 0) {
        exportText += `🏆 ALL-TIME FAVORITE MOVIES (${movies.allTime.length})\n`;
        exportText += `${'─'.repeat(50)}\n`;
        movies.allTime.forEach((movie, index) => {
          exportText += formatItem(movie, index, false) + '\n';
        });
        exportText += '\n';
      }

      // Add yearly breakdown using completion dates
      const yearlyBooks: { [year: number]: number } = {};
      const yearlyMovies: { [year: number]: number } = {};
      
      books.completed.forEach(book => {
        const completionYear = getCompletionYear(book);
        if (completionYear) {
          yearlyBooks[completionYear] = (yearlyBooks[completionYear] || 0) + 1;
        }
      });
      
      movies.completed.forEach(movie => {
        const completionYear = getCompletionYear(movie);
        if (completionYear) {
          yearlyMovies[completionYear] = (yearlyMovies[completionYear] || 0) + 1;
        }
      });

      if (Object.keys(yearlyBooks).length > 0 || Object.keys(yearlyMovies).length > 0) {
        exportText += `\n📅 YEARLY BREAKDOWN (by completion date)
═══════════════════════════════════════════════════════════\n\n`;
        
        const allYears = new Set([...Object.keys(yearlyBooks), ...Object.keys(yearlyMovies)]);
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

  const value: DataStoreContextType = {
    books,
    movies,
    bookGoal,
    movieGoal,
    setBookGoal,
    setMovieGoal,
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