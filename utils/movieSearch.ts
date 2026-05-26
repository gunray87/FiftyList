// Movie search: local catalog + OMDb API (+ optional TMDB supplement)

import { getTmdbApiKey, TMDB_BASE_URL } from './tmdbConfig';
import { getOmdbApiKey, OMDB_BASE_URL } from './omdbConfig';
import { stripDirectedByPrefix } from './formatDirectorDisplay';
import { COMPREHENSIVE_MOVIE_DATA } from '@/data/comprehensiveMovieCatalog';

const ONLINE_RESULT_CAP = 8;

export type OmdbSearchIssue = 'missing_key' | 'invalid_key' | 'api_error' | null;

let lastOmdbSearchIssue: OmdbSearchIssue = null;

export function getLastOmdbSearchIssue(): OmdbSearchIssue {
  return lastOmdbSearchIssue;
}

export function isOmdbApiKeyConfigured(): boolean {
  return Boolean(getOmdbApiKey());
}
const TOTAL_RESULT_CAP = 15;

export interface MovieSearchResult {
  id: string;
  title: string;
  author: string;
  year: number;
  description: string;
  thumbnail?: string | null;
  rating: number;
  source: 'omdb' | 'tmdb' | 'hardcoded' | 'fallback';
  imdbId?: string;
}

type OmdbSearchItem = {
  Title?: string;
  Year?: string;
  imdbID?: string;
  Poster?: string;
  Type?: string;
};

type OmdbDetail = {
  Response?: string;
  Error?: string;
  Title?: string;
  Year?: string;
  Director?: string;
  Plot?: string;
  Poster?: string;
  imdbRating?: string;
  imdbID?: string;
};

function parseOmdbYear(yearRaw?: string): number {
  if (!yearRaw) return new Date().getFullYear();
  const match = yearRaw.match(/\d{4}/);
  return match ? Number(match[0]) : new Date().getFullYear();
}

function parseOmdbRating(imdbRating?: string): number {
  const n = Number(imdbRating);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round((n / 2) * 10) / 10;
}

function posterOrNull(poster?: string): string | null {
  if (!poster || poster === 'N/A') return null;
  return poster;
}

function movieDedupeKey(title: string, year: number): string {
  return `${title.toLowerCase().trim()}|${year}`;
}

function mergeMovieResultLists(lists: MovieSearchResult[][]): MovieSearchResult[] {
  const seen = new Set<string>();
  const merged: MovieSearchResult[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = movieDedupeKey(item.title, item.year);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
      if (merged.length >= TOTAL_RESULT_CAP) return merged;
    }
  }
  return merged;
}

async function fetchOmdbDetail(imdbId: string): Promise<OmdbDetail | null> {
  const apiKey = getOmdbApiKey();
  if (!apiKey || !imdbId) return null;
  try {
    const url = `${OMDB_BASE_URL}?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}&plot=short`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as OmdbDetail;
    if (data.Response !== 'True') return null;
    return data;
  } catch {
    return null;
  }
}

function mapOmdbDetailToResult(detail: OmdbDetail): MovieSearchResult | null {
  const imdbId = detail.imdbID?.trim();
  const title = detail.Title?.trim();
  if (!imdbId || !title) return null;
  const director = stripDirectedByPrefix(detail.Director || '') || 'Unknown Director';
  return {
    id: `omdb-${imdbId}`,
    title,
    author: director,
    year: parseOmdbYear(detail.Year),
    description: detail.Plot && detail.Plot !== 'N/A' ? detail.Plot : 'No description available',
    thumbnail: posterOrNull(detail.Poster),
    rating: parseOmdbRating(detail.imdbRating),
    source: 'omdb',
    imdbId,
  };
}

function classifyOmdbError(message?: string): OmdbSearchIssue {
  if (!message) return 'api_error';
  const lower = message.toLowerCase();
  if (lower.includes('invalid api key')) return 'invalid_key';
  return 'api_error';
}

/** OMDb search + detail fetch for director/plot (https://www.omdbapi.com/). */
async function searchOmdbMovies(query: string): Promise<MovieSearchResult[]> {
  const apiKey = getOmdbApiKey();
  if (!apiKey) {
    lastOmdbSearchIssue = 'missing_key';
    console.warn('⚠️ OMDb API key not configured. Set EXPO_PUBLIC_OMDB_API_KEY in .env');
    return [];
  }

  try {
    console.log(`🔍 Searching OMDb API for: "${query}"`);
    const searchUrl = `${OMDB_BASE_URL}?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(query)}&type=movie&page=1`;
    const response = await fetch(searchUrl);
    if (!response.ok) {
      console.log(`OMDb search response not ok: ${response.status}`);
      lastOmdbSearchIssue = 'api_error';
      return [];
    }

    const data = (await response.json()) as {
      Response?: string;
      Error?: string;
      Search?: OmdbSearchItem[];
    };

    if (data.Response !== 'True' || !Array.isArray(data.Search) || data.Search.length === 0) {
      console.log(`No OMDb results for "${query}"${data.Error ? `: ${data.Error}` : ''}`);
      if (data.Error) {
        lastOmdbSearchIssue = classifyOmdbError(data.Error);
      }
      return [];
    }

    lastOmdbSearchIssue = null;

    const hits = data.Search.filter((item) => item.Type === 'movie' || !item.Type).slice(
      0,
      ONLINE_RESULT_CAP
    );

    const details = await Promise.all(
      hits.map(async (hit) => {
        const imdbId = hit.imdbID?.trim();
        if (!imdbId) return null;
        const detail = await fetchOmdbDetail(imdbId);
        if (detail) return mapOmdbDetailToResult(detail);
        const title = hit.Title?.trim();
        if (!title) return null;
        return {
          id: `omdb-${imdbId}`,
          title,
          author: 'Unknown Director',
          year: parseOmdbYear(hit.Year),
          description: 'No description available',
          thumbnail: posterOrNull(hit.Poster),
          rating: 0,
          source: 'omdb' as const,
          imdbId,
        };
      })
    );

    const results = details.filter((r): r is MovieSearchResult => r != null);
    console.log(`✅ Found ${results.length} OMDb results for "${query}"`);
    return results;
  } catch (error) {
    console.error('OMDb API error:', error);
    lastOmdbSearchIssue = 'api_error';
    return [];
  }
}

async function searchTmdbMovies(query: string): Promise<MovieSearchResult[]> {
  const apiKey = getTmdbApiKey();
  if (!apiKey) return [];

  try {
    console.log(`🔍 Searching TMDB API for: "${query}"`);
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${apiKey}&query=${encodeURIComponent(query)}&language=en-US&page=1&include_adult=false`
    );

    if (!response.ok) {
      console.log(`TMDB API response not ok: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return [];
    }

    const tmdbResults = data.results.slice(0, ONLINE_RESULT_CAP).map((movie: any) => ({
      id: `tmdb-${movie.id}`,
      title: movie.title,
      author: movie.original_title !== movie.title ? movie.original_title : 'Unknown Director',
      year: movie.release_date ? new Date(movie.release_date).getFullYear() : new Date().getFullYear(),
      description: movie.overview || 'No description available',
      thumbnail: movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : null,
      rating: movie.vote_average ? movie.vote_average / 2 : 0,
      source: 'tmdb' as const,
    }));

    console.log(`✅ Found ${tmdbResults.length} TMDB results for "${query}"`);
    return tmdbResults;
  } catch (error) {
    console.error('TMDB API error:', error);
    return [];
  }
}

function tokenizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s,.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** Avoid false positives like "came" matching inside "Cameron". */
function searchWordsMatchTokens(searchWords: string[], tokens: string[]): boolean {
  return searchWords.some(
    (word) =>
      word.length >= 2 &&
      tokens.some((token) => token === word || token.startsWith(word) || word.startsWith(token))
  );
}

function hardcodedMovieMatchesQuery(movie: any, searchTerm: string): boolean {
  const titleLower = movie.title.toLowerCase();
  const authorLower = movie.author.toLowerCase();
  const descriptionLower = movie.description ? movie.description.toLowerCase() : '';
  const searchWords = searchTerm.split(/\s+/).filter((word) => word.length > 0);
  const titleTokens = tokenizeForMatch(movie.title);
  const authorTokens = tokenizeForMatch(movie.author);
  const titleWordMatch =
    searchWordsMatchTokens(searchWords, titleTokens) ||
    searchWords.some((word) => word.length >= 3 && titleLower.includes(word));
  const authorWordMatch = searchWordsMatchTokens(searchWords, authorTokens);
  const genreMatch =
    movie.genres &&
    movie.genres.some(
      (genre: string) =>
        genre.toLowerCase().includes(searchTerm) ||
        searchWords.some((word) => genre.toLowerCase().includes(word))
    );

  return (
    titleLower.includes(searchTerm) ||
    authorLower.includes(searchTerm) ||
    descriptionLower.includes(searchTerm) ||
    titleWordMatch ||
    authorWordMatch ||
    genreMatch
  );
}

function hardcodedMovieId(catalogIndex: number): string {
  return `hardcoded-${catalogIndex}`;
}

const searchHardCodedMovies = (query: string): MovieSearchResult[] => {
  try {
    const searchTerm = query.toLowerCase().trim();
    const seen = new Set<string>();
    const unique: { movie: any; catalogIndex: number }[] = [];

    COMPREHENSIVE_MOVIE_DATA.forEach((movie: any, catalogIndex: number) => {
      if (!hardcodedMovieMatchesQuery(movie, searchTerm)) return;
      const dedupeKey = `${movie.title.toLowerCase().trim()}|${movie.author.toLowerCase().trim()}|${movie.year ?? 0}`;
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      unique.push({ movie, catalogIndex });
    });

    return unique.slice(0, 15).map(({ movie, catalogIndex }) => ({
      id: hardcodedMovieId(catalogIndex),
      title: movie.title,
      author: movie.author,
      year: movie.year,
      description: movie.description,
      thumbnail: null,
      rating: movie.rating,
      source: 'hardcoded' as const,
    }));
  } catch (error) {
    console.error('Error searching hard-coded movies:', error);
    return [];
  }
};

export const searchMovies = async (query: string): Promise<MovieSearchResult[]> => {
  lastOmdbSearchIssue = null;
  try {
    const hardCodedResults = searchHardCodedMovies(query);
    const [omdbResults, tmdbResults] = await Promise.all([
      searchOmdbMovies(query),
      searchTmdbMovies(query),
    ]);

    // Online results first (OMDb primary), then local catalog supplements.
    return mergeMovieResultLists([omdbResults, tmdbResults, hardCodedResults]);
  } catch (error) {
    console.error('Error searching movies:', error);
    return searchHardCodedMovies(query).slice(0, 10);
  }
};

function resolveHardcodedMovie(id: string): any | null {
  if (id.startsWith('hardcoded-')) {
    const suffix = id.slice('hardcoded-'.length);
    const catalogIndex = Number(suffix);
    if (Number.isInteger(catalogIndex) && catalogIndex >= 0) {
      const byIndex = COMPREHENSIVE_MOVIE_DATA[catalogIndex];
      if (byIndex) return byIndex;
    }
    return (
      COMPREHENSIVE_MOVIE_DATA.find((movie: any) => movie.title === suffix) ?? null
    );
  }
  if (id.startsWith('fallback-')) {
    const title = id.slice('fallback-'.length);
    return COMPREHENSIVE_MOVIE_DATA.find((movie: any) => movie.title === title) ?? null;
  }
  return null;
}

export const getMovieById = async (id: string): Promise<MovieSearchResult | null> => {
  const hardCodedMovie = resolveHardcodedMovie(id);
  const hardcodedIndex =
    hardCodedMovie != null ? COMPREHENSIVE_MOVIE_DATA.indexOf(hardCodedMovie) : -1;

  if (hardCodedMovie && hardcodedIndex >= 0) {
    return {
      id: hardcodedMovieId(hardcodedIndex),
      title: hardCodedMovie.title,
      author: hardCodedMovie.author,
      year: hardCodedMovie.year,
      description: hardCodedMovie.description,
      thumbnail: null,
      rating: hardCodedMovie.rating,
      source: 'hardcoded',
    };
  }

  if (id.startsWith('omdb-')) {
    const imdbId = id.replace(/^omdb-/, '');
    const detail = await fetchOmdbDetail(imdbId);
    return detail ? mapOmdbDetailToResult(detail) : null;
  }

  const tmdbApiKey = getTmdbApiKey();
  if (id.startsWith('tmdb-') && tmdbApiKey) {
    try {
      const tmdbId = id.replace('tmdb-', '');
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${tmdbApiKey}&language=en-US`
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
          source: 'tmdb',
        };
      }
    } catch (error) {
      console.error('Error fetching TMDB movie details:', error);
    }
  }

  return null;
};
