// Comprehensive book search utility
// This file provides access to the comprehensive book database for search functionality

// Import the complete book database from suggestions.tsx
// This contains over 1000 books - much more comprehensive than the small local array
import { COMPREHENSIVE_BOOK_DATA } from '../app/(tabs)/suggestions';

export interface BookSearchResult {
  id: string;
  title: string;
  author: string;
  publicationYear?: number;
  description?: string;
  thumbnail?: string | null;
  rating?: number;
  genres?: string[];
}

// Note: API access requires Premium subscription
// Free tier users can only access the local hardcoded database

// Search the comprehensive local book database
export const searchHardCodedBooks = (query: string): BookSearchResult[] => {
  try {
    console.log(`🔍 Searching hard-coded books for: "${query}"`);
    console.log(`📚 Total books in database: ${COMPREHENSIVE_BOOK_DATA.length}`);
    
    const searchTerm = query.toLowerCase().trim();
    
    // Search through title, author, and genres with improved matching
    const results = COMPREHENSIVE_BOOK_DATA.filter((book: any) => {
      const titleLower = book.title.toLowerCase();
      const authorLower = book.author.toLowerCase();
      const descriptionLower = book.description ? book.description.toLowerCase() : '';
      
      // Exact match
      const exactTitleMatch = titleLower.includes(searchTerm);
      const exactAuthorMatch = authorLower.includes(searchTerm);
      const exactDescriptionMatch = descriptionLower.includes(searchTerm);
      
      // Word boundary matches (split search term into words)
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
      const titleWordMatch = searchWords.some(word => 
        titleLower.includes(word) || 
        titleLower.split(/\s+/).some(titleWord => titleWord.startsWith(word))
      );
      const authorWordMatch = searchWords.some(word => 
        authorLower.includes(word) || 
        authorLower.split(/\s+/).some(authorWord => authorWord.startsWith(word))
      );
      
      // Genre match
      const genreMatch = book.genres && book.genres.some((genre: string) => 
        genre.toLowerCase().includes(searchTerm) ||
        searchWords.some(word => genre.toLowerCase().includes(word))
      );
      
      return exactTitleMatch || exactAuthorMatch || exactDescriptionMatch || 
             titleWordMatch || authorWordMatch || genreMatch;
    }).slice(0, 15); // Limit to 15 results
    
    // Convert to SearchResult format
    const searchResults = results.map((book: any, index: number) => ({
      id: `hardcoded-${book.title}-${book.author}-${index}`,
      title: book.title,
      author: book.author,
      publicationYear: book.year,
      description: book.description,
      thumbnail: null,
      rating: book.rating,
      genres: book.genres
    }));
    
    console.log(`✅ Found ${searchResults.length} hard-coded book results for "${query}"`);
    return searchResults;
  } catch (error) {
    console.error('Error searching hard-coded books:', error);
    return [];
  }
};

// Search Google Books API for additional results
const searchGoogleBooks = async (query: string): Promise<BookSearchResult[]> => {
  try {
    console.log(`🔍 Searching Google Books API for: "${query}"`);
    
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&orderBy=relevance`
    );

    if (!response.ok) {
      console.log(`Google Books API response not ok: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log(`No Google Books results for "${query}"`);
      return [];
    }

    // Convert Google Books results to our format
    const googleResults = data.items.slice(0, 10).map((book: any) => ({
      id: `google-${book.id}`,
      title: book.volumeInfo.title || 'Unknown Title',
      author: book.volumeInfo.authors?.[0] || 'Unknown Author',
      publicationYear: book.volumeInfo.publishedDate ? new Date(book.volumeInfo.publishedDate).getFullYear() : new Date().getFullYear(),
      description: book.volumeInfo.description || 'No description available',
      thumbnail: book.volumeInfo.imageLinks?.thumbnail || null,
      rating: book.volumeInfo.averageRating || 0,
      genres: book.volumeInfo.categories || []
    }));

    console.log(`✅ Found ${googleResults.length} Google Books results for "${query}"`);
    return googleResults;

  } catch (error) {
    console.error('Google Books API error:', error);
    return [];
  }
};

// Main search function that only searches local database
export const searchBooks = async (query: string): Promise<BookSearchResult[]> => {
  try {
    console.log(`🔍 Searching local book database for: "${query}"`);
    
    // Only search our comprehensive local database
    const hardCodedResults = searchHardCodedBooks(query);
    
    console.log(`✅ Found ${hardCodedResults.length} local book results for "${query}"`);
    return hardCodedResults;
    
  } catch (error) {
    console.error('Error searching local books:', error);
    return [];
  }
};

// Separate function to search Google Books API
export const searchBooksAPI = async (query: string): Promise<BookSearchResult[]> => {
  try {
    console.log(`🔍 Searching Google Books API for: "${query}"`);
    
    const googleResults = await searchGoogleBooks(query);
    
    console.log(`✅ Found ${googleResults.length} API book results for "${query}"`);
    return googleResults;
    
  } catch (error) {
    console.error('Error searching Google Books API:', error);
    return [];
  }
};

// Get book by ID (useful for getting specific book details)
export const getBookById = (id: string): BookSearchResult | null => {
  try {
    // Check hard-coded data
    const bookTitle = id.replace('hardcoded-', '').split('-')[0]; // Get title part before first dash
    const hardCodedBook = COMPREHENSIVE_BOOK_DATA.find((book: any) => book.title === bookTitle);
    
    if (hardCodedBook) {
      return {
        id: id, // Keep the original ID with author and index
        title: hardCodedBook.title,
        author: hardCodedBook.author,
        publicationYear: hardCodedBook.year,
        description: hardCodedBook.description,
        thumbnail: null,
        rating: hardCodedBook.rating,
        genres: hardCodedBook.genres
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error getting book by ID:', error);
    return null;
  }
};
