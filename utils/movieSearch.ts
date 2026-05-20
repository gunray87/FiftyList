// Movie search utility using TMDB API and hard-coded data
// TMDB API: Free tier with high request limits

import { getTmdbApiKey, TMDB_BASE_URL } from './tmdbConfig';
// Complete movie database from suggestions (500+ titles)
import { COMPREHENSIVE_MOVIE_DATA } from '../app/(tabs)/suggestions';

const TMDB_API_KEY = getTmdbApiKey();

export interface MovieSearchResult {
  id: string;
  title: string;
  author: string;
  year: number;
  description: string;
  thumbnail?: string | null;
  rating: number;
  source: 'tmdb' | 'hardcoded' | 'fallback';
}

// Search TMDB API for movies (free tier: 1000 requests/day)
const searchOMDBMovies = async (query: string): Promise<MovieSearchResult[]> => {
  try {
    console.log(`🔍 Searching TMDB API for: "${query}"`);

    // Check if API key is configured
    if (!TMDB_API_KEY) {
      console.warn('⚠️ TMDB API key not configured. Please set EXPO_PUBLIC_TMDB_API_KEY in .env file');
      return [];
    }

    // TMDB API - free tier with 1000 requests per day
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`
    );
    
    if (!response.ok) {
      console.log(`TMDB API response not ok: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log(`No TMDB results for "${query}"`);
      return [];
    }
    
    // Convert TMDB results to our format
    const tmdbResults = data.results.slice(0, 5).map((movie: any) => ({
      id: `tmdb-${movie.id}`,
      title: movie.title,
      author: movie.original_title !== movie.title ? movie.original_title : 'Unknown Director',
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : new Date().getFullYear(),
      description: movie.overview || 'No description available',
      thumbnail: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null,
      rating: movie.vote_average ? movie.vote_average / 2 : 0, // Convert 10-point scale to 5-point
      source: 'tmdb' as const
    }));
    
    console.log(`✅ Found ${tmdbResults.length} TMDB results for "${query}"`);
    return tmdbResults;
    
  } catch (error) {
    console.error('TMDB API error:', error);
    return [];
  }
};

// Search hard-coded movie data
const searchHardCodedMovies = (query: string): MovieSearchResult[] => {
  try {
    console.log(`🔍 Searching hard-coded movies for: "${query}"`);
    console.log(`🎬 Total movies in database: ${COMPREHENSIVE_MOVIE_DATA.length}`);
    
    const searchTerm = query.toLowerCase().trim();
    
    // Search through title, author, and genres with improved matching
    const results = COMPREHENSIVE_MOVIE_DATA.filter((movie: any) => {
      const titleLower = movie.title.toLowerCase();
      const authorLower = movie.author.toLowerCase();
      const descriptionLower = movie.description ? movie.description.toLowerCase() : '';
      
      // Exact match
      const exactTitleMatch = titleLower.includes(searchTerm);
      const exactAuthorMatch = authorLower.includes(searchTerm);
      const exactDescriptionMatch = descriptionLower.includes(searchTerm);
      
      // Word boundary matches (split search term into words)
      const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
      const titleWordMatch = searchWords.some(word => 
        titleLower.includes(word) || 
        titleLower.split(/\s+/).some((titleWord: string) => titleWord.startsWith(word))
      );
      const authorWordMatch = searchWords.some(word => 
        authorLower.includes(word) || 
        authorLower.split(/\s+/).some((authorWord: string) => authorWord.startsWith(word))
      );
      
      // Genre match
      const genreMatch = movie.genres && movie.genres.some((genre: string) => 
        genre.toLowerCase().includes(searchTerm) ||
        searchWords.some(word => genre.toLowerCase().includes(word))
      );
      
      return exactTitleMatch || exactAuthorMatch || exactDescriptionMatch || 
             titleWordMatch || authorWordMatch || genreMatch;
    }).slice(0, 15); // Limit to 15 results
    
    // Convert to SearchResult format
    const searchResults = results.map((movie: any) => ({
      id: `hardcoded-${movie.title}`,
      title: movie.title,
      author: movie.author,
      year: movie.year,
      description: movie.description,
      thumbnail: null,
      rating: movie.rating,
      source: 'hardcoded' as const
    }));
    
    console.log(`✅ Found ${searchResults.length} hard-coded movie results for "${query}"`);
    return searchResults;
  } catch (error) {
    console.error('Error searching hard-coded movies:', error);
    return [];
  }
};

// Main search function that combines both sources
export const searchMovies = async (query: string): Promise<MovieSearchResult[]> => {
  try {
    console.log(`🔍 Searching movies for: "${query}"`);
    
    // First, search our comprehensive hard-coded database for immediate results
    const hardCodedResults = searchHardCodedMovies(query);

    // If we have enough hard-coded results, return them immediately
    if (hardCodedResults.length >= 10) {
      console.log(`✅ Returning ${hardCodedResults.length} hard-coded movie results for "${query}"`);
      return hardCodedResults.slice(0, 15);
    }

    // If we need more results, search TMDB API for additional results
    const tmdbResults = await searchOMDBMovies(query);
    
    // Combine results, prioritizing hard-coded matches first
    const combinedResults = [...hardCodedResults, ...tmdbResults];
    
    console.log(`✅ Found ${combinedResults.length} total movie results for "${query}"`);
    return combinedResults.slice(0, 15); // Limit to 15 total results
    
  } catch (error) {
    console.error('Error searching movies:', error);
    
    // Fallback to hard-coded data only
    const fallbackResults = COMPREHENSIVE_MOVIE_DATA.filter((movie: any) => 
      movie.title.toLowerCase().includes(query.toLowerCase()) ||
      movie.author.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10).map((movie: any) => ({
      id: `fallback-${movie.title}`,
      title: movie.title,
      author: movie.author,
      year: movie.year,
      description: movie.description,
      thumbnail: null,
      rating: movie.rating,
      source: 'fallback' as const
    }));
    
    return fallbackResults;
  }
};

// Get movie by ID (useful for getting specific movie details)
export const getMovieById = async (id: string): Promise<MovieSearchResult | null> => {
  // Check hard-coded data first
  const hardCodedMovie = COMPREHENSIVE_MOVIE_DATA.find((movie: any) => 
    `hardcoded-${movie.title}` === id || `fallback-${movie.title}` === id
  );
  
  if (hardCodedMovie) {
    return {
      id: `hardcoded-${hardCodedMovie.title}`,
      title: hardCodedMovie.title,
      author: hardCodedMovie.author,
      year: hardCodedMovie.year,
      description: hardCodedMovie.description,
      thumbnail: null,
      rating: hardCodedMovie.rating,
      source: 'hardcoded' as const
    };
  }
  
  // For TMDB IDs, fetch from API
  if (id.startsWith('tmdb-')) {
    try {
      if (!TMDB_API_KEY) {
        console.warn('⚠️ TMDB API key not configured');
        return null;
      }

      const tmdbId = id.replace('tmdb-', '');
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      
      if (response.ok) {
        const movie = await response.json();
        return {
          id: `tmdb-${movie.id}`,
          title: movie.title,
          author: movie.original_title !== movie.title ? movie.original_title : 'Unknown Director',
          year: movie.release_date ? new Date(movie.release_date).getFullYear() : new Date().getFullYear(),
          description: movie.overview || 'No description available',
          thumbnail: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null,
          rating: movie.vote_average ? movie.vote_average / 2 : 0,
          source: 'tmdb' as const
        };
      }
    } catch (error) {
      console.error('Error fetching TMDB movie details:', error);
    }
  }
  
  return null;
};
