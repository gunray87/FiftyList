import { BookSearchResult, MovieSearchResult } from '@/types';
import { searchMovies as searchMoviesUnified } from '@/utils/movieSearch';

class EnhancedAPIService {
  private subscription: any;

  constructor() {
    // This would be injected in a real implementation
    this.subscription = null;
  }

  setSubscription(subscription: any) {
    this.subscription = subscription;
  }

  async searchBooks(query: string): Promise<BookSearchResult[]> {
    console.log(`🔍 Searching books for: "${query}"`);

    if (!this.subscription || this.subscription.tier === 'free') {
      // Free tier: NO API access - must use local database only
      throw new Error('Book API search requires Premium subscription. Free tier users can only search the local database.');
    } else {
      // Premium tier: Multiple APIs, rich data
      return this.searchBooksEnhanced(query);
    }
  }

  async searchMovies(query: string): Promise<MovieSearchResult[]> {
    console.log(`🎬 Searching movies for: "${query}"`);
    
    if (!this.subscription || this.subscription.tier === 'free') {
      // Free tier: No movie search
      throw new Error('Movie search requires Premium subscription. Upgrade to search movies with rich data.');
    } else {
      // Premium tier: TMDB + OMDb integration
      return this.searchMoviesEnhanced(query);
    }
  }

  private async searchGoogleBooksBasic(query: string): Promise<BookSearchResult[]> {
    // Basic Google Books search with limited data
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`
      );
      const data = await response.json();
      
      return data.items?.map((item: any) => ({
        id: item.id,
        title: item.volumeInfo?.title || '',
        author: item.volumeInfo?.authors?.[0] || '',
        // Limited data for free tier
        year: item.volumeInfo?.publishedDate?.split('-')[0] || null,
        description: null, // Premium only
        rating: null, // Premium only
        thumbnail: item.volumeInfo?.imageLinks?.thumbnail || null,
        isbn: null, // Premium only
        pageCount: null, // Premium only
        genres: null, // Premium only
        availability: null, // Premium only
      })) || [];
    } catch (error) {
      console.error('Error searching Google Books:', error);
      return [];
    }
  }

  private async searchBooksEnhanced(query: string): Promise<BookSearchResult[]> {
    // Enhanced search across multiple APIs
    try {
      const [googleBooks, openLibrary, goodreads] = await Promise.all([
        this.searchGoogleBooksEnhanced(query),
        this.searchOpenLibrary(query),
        this.searchGoodreads(query)
      ]);
      
      return this.mergeAndEnrichResults([googleBooks, openLibrary, goodreads]);
    } catch (error) {
      console.error('Error in enhanced book search:', error);
      return [];
    }
  }

  private async searchGoogleBooksEnhanced(query: string): Promise<BookSearchResult[]> {
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`
      );
      const data = await response.json();
      
      return data.items?.map((item: any) => ({
        id: item.id,
        title: item.volumeInfo?.title || '',
        author: item.volumeInfo?.authors?.[0] || '',
        year: item.volumeInfo?.publishedDate?.split('-')[0] || null,
        description: item.volumeInfo?.description || null,
        rating: item.volumeInfo?.averageRating || null,
        thumbnail: item.volumeInfo?.imageLinks?.thumbnail || null,
        isbn: item.volumeInfo?.industryIdentifiers?.[0]?.identifier || null,
        pageCount: item.volumeInfo?.pageCount || null,
        genres: item.volumeInfo?.categories || null,
        availability: null, // Would be populated by price tracking service
      })) || [];
    } catch (error) {
      console.error('Error searching Google Books Enhanced:', error);
      return [];
    }
  }

  private async searchOpenLibrary(query: string): Promise<BookSearchResult[]> {
    try {
      const response = await fetch(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10`
      );
      const data = await response.json();
      
      return data.docs?.map((doc: any) => ({
        id: `openlibrary_${doc.key}`,
        title: doc.title || '',
        author: doc.author_name?.[0] || '',
        year: doc.first_publish_year || null,
        description: null, // Open Library doesn't provide descriptions in search
        rating: null,
        thumbnail: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null,
        isbn: doc.isbn?.[0] || null,
        pageCount: null,
        genres: doc.subject || null,
        availability: null,
      })) || [];
    } catch (error) {
      console.error('Error searching Open Library:', error);
      return [];
    }
  }

  private async searchGoodreads(query: string): Promise<BookSearchResult[]> {
    // Goodreads API requires authentication and has rate limits
    // This is a placeholder for the implementation
    console.log('Goodreads search would be implemented here');
    return [];
  }

  private async searchMoviesEnhanced(query: string): Promise<MovieSearchResult[]> {
    try {
      const results = await searchMoviesUnified(query);
      return results.map((r) => ({
        id: r.id,
        title: r.title,
        director: r.author,
        year: r.year,
        description: r.description,
        rating: r.rating,
        thumbnail: r.thumbnail ?? null,
        genres: null,
        cast: null,
        runtime: null,
        availability: null,
      }));
    } catch (error) {
      console.error('Error in enhanced movie search:', error);
      return [];
    }
  }

  private mergeAndEnrichResults(results: BookSearchResult[][]): BookSearchResult[] {
    // Merge results from multiple APIs, removing duplicates and enriching data
    const merged = new Map<string, BookSearchResult>();
    
    results.flat().forEach(result => {
      const key = `${result.title.toLowerCase()}_${result.author.toLowerCase()}`;
      if (!merged.has(key) || this.isMoreComplete(result, merged.get(key)!)) {
        merged.set(key, result);
      }
    });
    
    return Array.from(merged.values());
  }

  private mergeMovieResults(results: MovieSearchResult[][]): MovieSearchResult[] {
    // Similar merging logic for movies
    return results.flat();
  }

  private isMoreComplete(newResult: BookSearchResult, existingResult: BookSearchResult): boolean {
    // Determine which result has more complete data
    const newScore = this.calculateDataCompleteness(newResult);
    const existingScore = this.calculateDataCompleteness(existingResult);
    return newScore > existingScore;
  }

  private calculateDataCompleteness(result: BookSearchResult): number {
    let score = 0;
    if (result.description) score += 2;
    if (result.rating) score += 1;
    if (result.thumbnail) score += 1;
    if (result.isbn) score += 1;
    if (result.pageCount) score += 1;
    if (result.genres && result.genres.length > 0) score += 1;
    return score;
  }

  async getPriceAlerts(item: BookSearchResult | MovieSearchResult): Promise<any[]> {
    if (!this.subscription || this.subscription.tier === 'free') {
      throw new Error('Price alerts require Premium subscription');
    }
    
    // Price tracking implementation
    console.log('Price alerts would be implemented here');
    return [];
  }

  async getRecommendations(userHistory: any[]): Promise<any[]> {
    if (!this.subscription || this.subscription.tier === 'free') {
      throw new Error('Advanced recommendations require Premium subscription');
    }
    
    // AI-powered recommendations
    console.log('Recommendations would be implemented here');
    return [];
  }
}

// Export singleton instance
export const enhancedAPIService = new EnhancedAPIService();
