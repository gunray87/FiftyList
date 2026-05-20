import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Platform,
  Share,
  Alert,
  Animated,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, BookOpen, Film, SlidersHorizontal, Star, TrendingUp, Heart, RefreshCw, Plus, Clock, Check, Lightbulb, X } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataStore } from '@/hooks/useDataStore';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useUserInterests } from '@/hooks/useUserInterests';
import { useSubscription } from '@/hooks/useSubscription';
import { usePreloadedData } from '@/app/_layout';
import { getTmdbApiKey, TMDB_BASE_URL } from '@/utils/tmdbConfig';
import Header from '@/components/Header';
import AddEditModal from '@/components/AddEditModal';

import CustomAlert from '@/components/CustomAlert';

import { COMPREHENSIVE_BOOK_DATA } from '@/data/comprehensiveBookCatalog';
import {
  extractMoodSignals,
  moodSignalsAreActionable,
  orderLovedHighlightsForRefine,
  scoreRowAgainstMood,
  boostScoreWithLlmMoodIntent,
  type MoodSignals,
} from '@/utils/suggestionMoodSignals';
import { fetchMoodIntentFromProxy, type LlmMoodIntent } from '@/utils/llmMoodIntent';
import {
  buildTasteProfileSnapshot,
  shouldIncludeFormatSuggestion,
} from '@/utils/tasteProfileSummary';
import { fetchTasteProfileNarrative } from '@/utils/llmTasteProfile';
import {
  buildListTasteReason,
  buildListTasteSignals,
  listTasteMatchScore,
  type ListTasteSignals,
} from '@/utils/listTasteSignals';
import { friendlyLlmErrorMessage } from '@/utils/llmProviderErrors';
import { bookGenreToMovieCatalogGenre, userHasMovieListActivity } from '@/utils/mediaCatalogGenres';
import {
  SUGGESTION_CAVEAT_MAX_CHARS,
  SUGGESTION_EXPLANATION_MAX_CHARS,
  trimSuggestionCopy,
} from '@/utils/suggestionCopyLimits';
import {
  finalizeTasteNarrative,
  TASTE_NARRATIVE_REFINE_MAX_CHARS,
  mergeFilmIntoTasteNarrative,
} from '@/utils/tasteNarrativeFormat';

export { COMPREHENSIVE_BOOK_DATA };

// NLP Content Analysis System
interface NLPContentAnalysis {
  sentiment: {
    score: number; // -1 to 1 (negative to positive)
    magnitude: number; // 0 to 1 (intensity)
    emotions: string[]; // joy, sadness, anger, fear, surprise, disgust
  };
  topics: {
    primary: string[];
    secondary: string[];
    themes: string[];
  };
  complexity: {
    readabilityScore: number; // 0-100 (higher = more complex)
    vocabularyLevel: string; // elementary, intermediate, advanced
    sentenceComplexity: number; // 0-1
  };
  style: {
    tone: string; // formal, casual, academic, conversational
    pacing: string; // fast, moderate, slow
    narrativeStructure: string; // linear, non-linear, episodic
  };
  content: {
    genreIndicators: string[];
    targetAudience: string;
    contentWarnings: string[];
  };
}

// Semantic Similarity System
interface SemanticEmbedding {
  id: string;
  vector: number[];
  metadata: {
    title: string;
    author: string;
    genres: string[];
    description: string;
    topics: string[];
    timestamp: number;
  };
}

interface SemanticCache {
  embeddings: Map<string, SemanticEmbedding>;
  similarityMatrix: Map<string, Map<string, number>>;
  lastUpdated: number;
  cacheSize: number;
  maxCacheSize: number;
}

interface SimilarityResult {
  itemId: string;
  similarity: number;
  reason: string;
  confidence: number;
}

// Enhanced Suggestion interface with semantic features
interface Suggestion {
  id: string;
  title: string;
  author: string;
  year: number;
  format: "text" | "audio" | "streaming";
  rating: number;
  description: string;
  genres: string[];
  isBook: boolean;
  source: 'googlebooks' | 'tmdb' | 'local';
  reason: string;
  confidence: number;
  category: 'adventure' | 'literary' | 'contemporary' | 'award' | 'search' | 'genre' | 'seasonal' | 'trending' | 'similar' | 'author' | 'mood' | 'format' | 'predictive' | 'semantic';
  estimatedPages?: number;
  estimatedLength: string;
  // API-specific fields
  coverId?: number;
  isbn?: string;
  tmdbId?: number;
  posterPath?: string;
  // Additional fields for compatibility
  mood?: string;
  awards?: string[];
  weeksOnList?: number;
  llmCaveat?: string;
  llmFormatSuggestion?: string;
  // NLP Analysis fields
  nlpAnalysis?: NLPContentAnalysis;
  // Semantic Similarity fields
  semanticEmbedding?: number[];
  similarItems?: string[];
  semanticTags?: string[];
}

type SortOption = 'confidence' | 'length' | 'rating' | 'year';
type FilterOption = 'all' | 'books' | 'movies' | 'short' | 'medium' | 'long' | 'semantic';

// Granular rating types
type GranularRating = 'loved' | 'liked' | 'meh' | 'disliked' | null;

const MAX_CANDIDATE_SUGGESTIONS = 240;
const MAX_RENDERED_SUGGESTIONS = 80;
/** How many cards get LLM-written `reason` copy per suggestions refresh. */
const LLM_REFINE_TOP_N = 6;

/** Template / heuristic reasons that should be replaced by LLM (or local polish fallback). */
function reasonNeedsLlmPolish(reason: string): boolean {
  const r = (reason || '').trim();
  if (!r) return true;
  return (
    /^Semantically similar to/i.test(r) ||
    /^Because you enjoy /i.test(r) ||
    /^Highly rated pick from/i.test(r) ||
    /^Popular in /i.test(r) ||
    /^Perfect \w+ reading/i.test(r) ||
    /^Award-winning literary/i.test(r) ||
    /^Predicted /i.test(r) ||
    /^Local recommendation/i.test(r) ||
    /^Recommended for you$/i.test(r)
  );
}

function pickCandidatesForLlmRefine(candidates: Suggestion[], limit: number): Suggestion[] {
  const sorted = [...candidates].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const books = sorted.filter((s) => s.isBook);
  const movies = sorted.filter((s) => !s.isBook);
  const perSide = Math.max(1, Math.floor(limit / 2));
  const picked = new Map<string, Suggestion>();

  const tryPick = (pool: Suggestion[]) => {
    for (const s of pool) {
      if (picked.size >= limit) break;
      if (s.category === 'semantic' || reasonNeedsLlmPolish(s.reason)) {
        picked.set(s.id, s);
      }
    }
  };
  tryPick(books.slice(0, perSide + 2));
  tryPick(movies.slice(0, perSide + 2));
  for (const s of [...books, ...movies, ...sorted]) {
    if (picked.size >= limit) break;
    if (!picked.has(s.id)) picked.set(s.id, s);
  }
  return [...picked.values()].slice(0, limit);
}

function polishReasonIfStillGeneric(
  s: Suggestion,
  listSignals: ListTasteSignals,
  refine?: { refinePhrase?: string; refineGenreSlugs?: string[] }
): Suggestion {
  const semantic = s.reason.match(/^Semantically similar to "(.+)"$/);
  if (semantic) {
    const ref = semantic[1];
    return {
      ...s,
      reason: `If "${ref}" clicked for you, this pick shares similar themes and tone.`,
    };
  }
  return {
    ...s,
    reason: buildListTasteReason(
      { title: s.title, author: s.author, genres: s.genres || [] },
      listSignals,
      refine
    ),
  };
}
const TASTE_PROFILE_CACHE_KEY = 'fiftylist_taste_profile_cache_v7';
const TASTE_PROFILE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Fixed scroll viewport for taste tab (~6 lines); panel height does not grow with text. */
const TASTE_SNAPSHOT_SCROLL_HEIGHT = 132;

type LlmAssistPanelTab = 'refine-books' | 'refine-movies' | 'taste';
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
const NYT_API_KEY = process.env.EXPO_PUBLIC_NYT_API_KEY;
const LLM_PROXY_BASE_URL = process.env.EXPO_PUBLIC_LLM_PROXY_BASE_URL;
const ENABLE_LLM_ASSIST = process.env.EXPO_PUBLIC_ENABLE_LLM_ASSIST === 'true';
const PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY = 'premium_suggestion_llm_context_books';
const PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY = 'premium_suggestion_llm_context_movies';
/** Legacy single refine field — migrated to books on first load. */
const PREMIUM_SUGGESTION_CONTEXT_LEGACY_KEY = 'premium_suggestion_llm_context';

const SAND_BACKGROUND = '#F0E8D8';
const AMBER_PRIMARY = '#D97706';
const AMBER_DARK = '#B45309';
const MOVIE_WARM = '#92400E';
const BORDER_WARM = 'rgba(180, 83, 9, 0.2)';

// LLM proxy request/response models for premium suggestions refine (copy polish on mood-filtered picks).
type SuggestionsRefineMode = 'rerank';
type SuggestionsMediaType = 'book' | 'movie' | 'mixed';

interface SuggestionsRefineCandidate {
  id: string;
  title: string;
  author: string;
  year: number;
  genres: string[];
  rating: number;
  estimatedLength: string;
  confidence: number;
  isBook: boolean;
  similarToTitle?: string;
}

interface SuggestionsRefineRequest {
  mediaType: SuggestionsMediaType;
  mode: SuggestionsRefineMode;
  maxResults: number;
  richTopThree?: boolean;
  userFeatures: {
    preferredGenres: string[];
    avoidGenres: string[];
    lengthPreference?: 'short' | 'medium' | 'long' | 'any';
    minRating?: number;
    recentAuthors: string[];
    additionalContext?: string;
  };
  sessionSignals: {
    activeFilter: FilterOption;
    sortBy: SortOption;
    recentInteractions: Array<{ type: string; itemId: string }>;
  };
  candidates: SuggestionsRefineCandidate[];
  userSummary?: {
    topRated: Array<{
      title: string;
      author: string;
      media: string;
      rating: number;
      format: string | null;
      lengthBucket: string;
    }>;
    aggregates: Record<string, unknown>;
    /** LLM taste snapshot prose — ties card copy to the Taste snapshot tab */
    tasteNarrative?: string;
  };
  lovedHighlights?: Array<{ title: string; author: string; media: string }>;
  refineContext?: {
    phrase: string;
    primaryTitleAnchors: string[];
    secondaryAuthorAnchors: string[];
    primaryGenreSlugs: string[];
  };
  includeFormatSuggestions?: boolean;
}

interface SuggestionsRefineResponse {
  items: Array<{
    id: string;
    score: number;
    reason_short: string;
    explanation?: string;
    caveat?: string;
    format_suggestion?: string;
  }>;
  remaining_actions?: number;
  reset_at?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

type RefineLlmResult =
  | { ok: true; data: SuggestionsRefineResponse }
  | { ok: false; userMessage: string };

async function refineSuggestionsWithLLM(
  payload: SuggestionsRefineRequest
): Promise<RefineLlmResult> {
  if (!LLM_PROXY_BASE_URL) {
    return { ok: false, userMessage: 'LLM proxy URL is not configured.' };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${LLM_PROXY_BASE_URL}/llm/suggestions-refine`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Subscription-Tier': 'premium',
        'X-App-Feature': 'suggestions_refine',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      let userMessage = `Proxy error (${response.status})`;
      try {
        const errBody = (await response.json()) as {
          message?: string;
          details?: string;
          error?: string;
          code?: string;
        };
        if (typeof errBody.message === 'string' && errBody.message.trim()) {
          userMessage = errBody.message.trim();
        } else if (errBody.error === 'premium_required') {
          userMessage = 'Premium required for AI copy.';
        }
        console.warn(
          'suggestions-refine failed',
          response.status,
          errBody.code ?? errBody.error,
          errBody.details ?? response.statusText
        );
      } catch {
        console.warn('suggestions-refine failed', response.status);
      }
      return { ok: false, userMessage: friendlyLlmErrorMessage(userMessage) };
    }
    const data = (await response.json()) as SuggestionsRefineResponse;
    if (!data?.items?.length) {
      return { ok: false, userMessage: 'Proxy returned no suggestion copy.' };
    }
    return { ok: true, data };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    console.warn('suggestions-refine error', e);
    return {
      ok: false,
      userMessage: aborted ? 'AI request timed out — try again.' : 'Could not reach the LLM proxy.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Rating configuration
const RATING_CONFIG = {
  loved: {
    label: 'Loved',
    icon: 'heart',
    color: '#EF4444', // Red
    weight: 2.0, // Highest positive weight
    feedback: 'Excellent! This will help find similar content you\'ll love.'
  },
  liked: {
    label: 'Liked',
    icon: 'thumbs-up',
    color: '#10B981', // Green
    weight: 1.0, // Standard positive weight
    feedback: 'Great! This helps refine your preferences.'
  },
  meh: {
    label: 'Meh',
    icon: 'minus',
    color: '#F59E0B', // Amber
    weight: 0.0, // Neutral weight
    feedback: 'Noted. This helps avoid similar content.'
  },
  disliked: {
    label: 'Disliked',
    icon: 'thumbs-down',
    color: '#6B7280', // Gray
    weight: -1.0, // Negative weight
    feedback: 'Got it. We\'ll avoid similar content.'
  }
};

// Alternative API configurations for high-volume calls
const API_CONFIG = {
  // Local fallback data for reliability
  USE_LOCAL_FALLBACK: true,
  
  // Rate limiting for different APIs
  RATE_LIMITS: {
    localFallback: 0,  // No rate limit
  }
};

// Semantic Similarity Configuration
const SEMANTIC_CONFIG = {
  // Embedding dimensions (simplified for mobile)
  EMBEDDING_DIMENSIONS: 64,
  
  // Similarity thresholds
  SIMILARITY_THRESHOLD: 0.7,
  HIGH_SIMILARITY_THRESHOLD: 0.85,
  
  // Cache settings
  MAX_CACHE_SIZE: 1000,
  CACHE_EXPIRY_HOURS: 24,
  
  // Performance settings
  MAX_SIMILARITY_CALCULATIONS: 50,
  BATCH_SIZE: 10,
  
  // Content filtering settings
  YEAR_FILTERING: {
    ENABLED: true,
    MAX_AGE_YEARS: 2, // Filter out content older than 2 years
    CLASSIC_MAX_AGE_YEARS: 10, // Allow classics up to 10 years old
    CLASSIC_GENRE_MAX_AGE_YEARS: 15, // Allow classic genres up to 15 years old
    CLASSIC_GENRES: ['classic', 'literary', 'non-fiction', 'biography', 'history']
  },
  
  // Feature weights for similarity calculation
  WEIGHTS: {
    title: 0.3,
    author: 0.2,
    genres: 0.25,
    description: 0.15,
    topics: 0.1
  }
};

// Comprehensive movie dataset (books: `COMPREHENSIVE_BOOK_DATA` from `data/enriched_books_catalog.json`)
export const COMPREHENSIVE_MOVIE_DATA = [
  // Adventure Movies
  { title: "Jurassic World: Dominion", author: "Colin Trevorrow", year: 2022, description: "Final installment in the Jurassic World trilogy.", genres: ["adventure", "action", "sci-fi"], rating: 4.0, isBook: false },
  { title: "Mission: Impossible - Dead Reckoning Part One", author: "Christopher McQuarrie", year: 2023, description: "Action-packed spy thriller with Tom Cruise.", genres: ["adventure", "action", "thriller"], rating: 4.2, isBook: false },
  { title: "Indiana Jones and the Dial of Destiny", author: "James Mangold", year: 2023, description: "Harrison Ford's final adventure as Indiana Jones.", genres: ["adventure", "action", "fantasy"], rating: 3.8, isBook: false },
  { title: "The Lost City", author: "Aaron and Adam Nee", year: 2022, description: "Romantic adventure comedy starring Sandra Bullock and Channing Tatum.", genres: ["adventure", "comedy", "romance"], rating: 3.9, isBook: false },
  { title: "Uncharted", author: "Ruben Fleischer", year: 2022, description: "Action-adventure film based on the video game series.", genres: ["adventure", "action", "thriller"], rating: 3.7, isBook: false },
  
  // Popular Movies from Recent Years
  { title: "Oppenheimer", author: "Christopher Nolan", year: 2023, description: "Biographical drama about J. Robert Oppenheimer.", genres: ["drama", "biography", "history"], rating: 4.5, isBook: false },
  { title: "Barbie", author: "Greta Gerwig", year: 2023, description: "Live-action Barbie film.", genres: ["comedy", "fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "Killers of the Flower Moon", author: "Martin Scorsese", year: 2023, description: "Western crime drama about the Osage murders.", genres: ["drama", "crime", "western"], rating: 4.3, isBook: false },
  { title: "Poor Things", author: "Yorgos Lanthimos", year: 2023, description: "Dark comedy fantasy film.", genres: ["comedy", "fantasy", "drama"], rating: 4.1, isBook: false },
  { title: "The Holdovers", author: "Alexander Payne", year: 2023, description: "Comedy-drama about a prep school teacher.", genres: ["comedy", "drama"], rating: 4.0, isBook: false },
  { title: "Past Lives", author: "Celine Song", year: 2023, description: "Romantic drama about childhood sweethearts.", genres: ["drama", "romance"], rating: 4.2, isBook: false },
  { title: "Anatomy of a Fall", author: "Justine Triet", year: 2023, description: "French legal drama thriller.", genres: ["drama", "thriller", "mystery"], rating: 4.3, isBook: false },
  { title: "The Zone of Interest", author: "Jonathan Glazer", year: 2023, description: "Historical drama about the Holocaust.", genres: ["drama", "history", "war"], rating: 4.4, isBook: false },
  { title: "American Fiction", author: "Cord Jefferson", year: 2023, description: "Satirical comedy-drama about race and publishing.", genres: ["comedy", "drama"], rating: 4.1, isBook: false },
  { title: "May December", author: "Todd Haynes", year: 2023, description: "Drama about an actress researching a controversial relationship.", genres: ["drama", "romance"], rating: 4.0, isBook: false },
  
  // Classic Movies
  { title: "The Godfather", author: "Francis Ford Coppola", year: 1972, description: "Crime drama about the Corleone family.", genres: ["drama", "crime"], rating: 4.8, isBook: false },
  { title: "The Shawshank Redemption", author: "Frank Darabont", year: 1994, description: "Drama about friendship in prison.", genres: ["drama", "crime"], rating: 4.9, isBook: false },
  { title: "Pulp Fiction", author: "Quentin Tarantino", year: 1994, description: "Crime anthology film.", genres: ["crime", "drama"], rating: 4.7, isBook: false },
  { title: "Fight Club", author: "David Fincher", year: 1999, description: "Drama about an underground fighting club.", genres: ["drama", "thriller"], rating: 4.6, isBook: false },
  { title: "The Matrix", author: "Lana and Lilly Wachowski", year: 1999, description: "Sci-fi action film about reality and illusion.", genres: ["sci-fi", "action"], rating: 4.7, isBook: false },
  { title: "Inception", author: "Christopher Nolan", year: 2010, description: "Sci-fi thriller about dream infiltration.", genres: ["sci-fi", "thriller"], rating: 4.6, isBook: false },
  { title: "Interstellar", author: "Christopher Nolan", year: 2014, description: "Sci-fi drama about space exploration.", genres: ["sci-fi", "drama"], rating: 4.5, isBook: false },
  { title: "Mad Max: Fury Road", author: "George Miller", year: 2015, description: "Post-apocalyptic action film.", genres: ["action", "adventure"], rating: 4.4, isBook: false },
  { title: "Parasite", author: "Bong Joon-ho", year: 2019, description: "South Korean thriller about class inequality.", genres: ["thriller", "drama"], rating: 4.7, isBook: false },
  { title: "Joker", author: "Todd Phillips", year: 2019, description: "Psychological thriller about the Joker's origin.", genres: ["thriller", "drama"], rating: 4.3, isBook: false },
  
  // Recent Blockbusters
  { title: "Dune", author: "Denis Villeneuve", year: 2021, description: "Sci-fi epic based on Frank Herbert's novel.", genres: ["sci-fi", "adventure"], rating: 4.4, isBook: false },
  { title: "No Time to Die", author: "Cary Joji Fukunaga", year: 2021, description: "James Bond action thriller.", genres: ["action", "thriller"], rating: 4.1, isBook: false },
  { title: "Spider-Man: No Way Home", author: "Jon Watts", year: 2021, description: "Marvel superhero film.", genres: ["action", "adventure", "superhero"], rating: 4.3, isBook: false },
  { title: "The Batman", author: "Matt Reeves", year: 2022, description: "Dark superhero film about Batman.", genres: ["action", "crime", "superhero"], rating: 4.2, isBook: false },
  { title: "Top Gun: Maverick", author: "Joseph Kosinski", year: 2022, description: "Action drama about fighter pilots.", genres: ["action", "drama"], rating: 4.4, isBook: false },
  { title: "Avatar: The Way of Water", author: "James Cameron", year: 2022, description: "Sci-fi adventure sequel.", genres: ["sci-fi", "adventure"], rating: 4.1, isBook: false },
  { title: "Black Panther: Wakanda Forever", author: "Ryan Coogler", year: 2022, description: "Marvel superhero film.", genres: ["action", "adventure", "superhero"], rating: 4.0, isBook: false },
  { title: "Everything Everywhere All at Once", author: "Daniel Kwan and Daniel Scheinert", year: 2022, description: "Sci-fi comedy-drama about multiverses.", genres: ["sci-fi", "comedy", "drama"], rating: 4.6, isBook: false },
  { title: "The Fabelmans", author: "Steven Spielberg", year: 2022, description: "Semi-autobiographical drama about filmmaking.", genres: ["drama", "biography"], rating: 4.2, isBook: false },
  { title: "Tár", author: "Todd Field", year: 2022, description: "Drama about a renowned conductor.", genres: ["drama", "biography"], rating: 4.3, isBook: false },
  
  // Additional Recent Movies (2020-2024)
  { title: "Nomadland", author: "Chloé Zhao", year: 2020, description: "Drama about a woman living in a van.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "The Trial of the Chicago 7", author: "Aaron Sorkin", year: 2020, description: "Historical drama about the 1968 Democratic National Convention.", genres: ["drama", "history"], rating: 4.1, isBook: false },
  { title: "Minari", author: "Lee Isaac Chung", year: 2020, description: "Drama about a Korean-American family.", genres: ["drama"], rating: 4.3, isBook: false },
  { title: "Sound of Metal", author: "Darius Marder", year: 2020, description: "Drama about a drummer losing his hearing.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "Promising Young Woman", author: "Emerald Fennell", year: 2020, description: "Thriller about revenge and justice.", genres: ["thriller", "drama"], rating: 4.1, isBook: false },
  { title: "The Father", author: "Florian Zeller", year: 2020, description: "Drama about dementia and aging.", genres: ["drama"], rating: 4.4, isBook: false },
  { title: "Judas and the Black Messiah", author: "Shaka King", year: 2021, description: "Biographical drama about Fred Hampton.", genres: ["drama", "biography"], rating: 4.2, isBook: false },
  { title: "The Green Knight", author: "David Lowery", year: 2021, description: "Medieval fantasy adventure.", genres: ["fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "The French Dispatch", author: "Wes Anderson", year: 2021, description: "Comedy-drama anthology film.", genres: ["comedy", "drama"], rating: 4.1, isBook: false },
  { title: "Licorice Pizza", author: "Paul Thomas Anderson", year: 2021, description: "Coming-of-age comedy-drama.", genres: ["comedy", "drama"], rating: 4.0, isBook: false },
  { title: "West Side Story", author: "Steven Spielberg", year: 2021, description: "Musical drama about rival gangs.", genres: ["musical", "drama"], rating: 4.2, isBook: false },
  { title: "Nightmare Alley", author: "Guillermo del Toro", year: 2021, description: "Neo-noir psychological thriller.", genres: ["thriller", "drama"], rating: 4.1, isBook: false },
  { title: "The Power of the Dog", author: "Jane Campion", year: 2021, description: "Western drama about toxic masculinity.", genres: ["western", "drama"], rating: 4.3, isBook: false },
  { title: "CODA", author: "Sian Heder", year: 2021, description: "Drama about a hearing child of deaf parents.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "Drive My Car", author: "Ryusuke Hamaguchi", year: 2021, description: "Japanese drama about grief and theater.", genres: ["drama"], rating: 4.4, isBook: false },
  { title: "The Worst Person in the World", author: "Joachim Trier", year: 2021, description: "Norwegian romantic comedy-drama.", genres: ["comedy", "drama", "romance"], rating: 4.1, isBook: false },
  { title: "Flee", author: "Jonas Poher Rasmussen", year: 2021, description: "Animated documentary about a refugee.", genres: ["documentary", "animation"], rating: 4.3, isBook: false },
  { title: "The Lost Daughter", author: "Maggie Gyllenhaal", year: 2021, description: "Psychological drama about motherhood.", genres: ["drama"], rating: 4.0, isBook: false },
  { title: "Parallel Mothers", author: "Pedro Almodóvar", year: 2021, description: "Spanish drama about motherhood.", genres: ["drama"], rating: 4.1, isBook: false },
  { title: "Belfast", author: "Kenneth Branagh", year: 2021, description: "Coming-of-age drama set in Northern Ireland.", genres: ["drama"], rating: 4.2, isBook: false },
  { title: "King Richard", author: "Reinaldo Marcus Green", year: 2021, description: "Biographical drama about Venus and Serena Williams' father.", genres: ["drama", "biography", "sports"], rating: 4.1, isBook: false },
  { title: "Don't Look Up", author: "Adam McKay", year: 2021, description: "Satirical comedy about climate change.", genres: ["comedy", "satire"], rating: 4.0, isBook: false },
  { title: "The Tragedy of Macbeth", author: "Joel Coen", year: 2021, description: "Shakespeare adaptation starring Denzel Washington.", genres: ["drama", "tragedy"], rating: 4.2, isBook: false },
  { title: "Spencer", author: "Pablo Larraín", year: 2021, description: "Biographical drama about Princess Diana.", genres: ["drama", "biography"], rating: 4.1, isBook: false },
  { title: "Tick, Tick... Boom!", author: "Lin-Manuel Miranda", year: 2021, description: "Musical drama about Jonathan Larson.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "The Eyes of Tammy Faye", author: "Michael Showalter", year: 2021, description: "Biographical drama about televangelist Tammy Faye Bakker.", genres: ["drama", "biography"], rating: 4.0, isBook: false },
  { title: "Being the Ricardos", author: "Aaron Sorkin", year: 2021, description: "Biographical drama about Lucille Ball and Desi Arnaz.", genres: ["drama", "biography"], rating: 4.1, isBook: false },
  { title: "Cyrano", author: "Joe Wright", year: 2021, description: "Musical romantic drama.", genres: ["musical", "romance", "drama"], rating: 4.0, isBook: false },
  { title: "The Card Counter", author: "Paul Schrader", year: 2021, description: "Crime drama about a gambler.", genres: ["crime", "drama"], rating: 4.1, isBook: false },
  { title: "The Last Duel", author: "Ridley Scott", year: 2021, description: "Historical drama about a medieval duel.", genres: ["historical", "drama"], rating: 4.2, isBook: false },
  { title: "House of Gucci", author: "Ridley Scott", year: 2021, description: "Biographical crime drama about the Gucci family.", genres: ["crime", "drama", "biography"], rating: 4.0, isBook: false },
  { title: "Shang-Chi and the Legend of the Ten Rings", author: "Destin Daniel Cretton", year: 2021, description: "Marvel superhero film.", genres: ["action", "adventure", "superhero"], rating: 4.0, isBook: false },
  { title: "Eternals", author: "Chloé Zhao", year: 2021, description: "Marvel superhero film about immortal beings.", genres: ["action", "adventure", "superhero"], rating: 3.9, isBook: false },
  { title: "Black Widow", author: "Cate Shortland", year: 2021, description: "Marvel superhero film about Natasha Romanoff.", genres: ["action", "adventure", "superhero"], rating: 4.0, isBook: false },
  { title: "Venom: Let There Be Carnage", author: "Andy Serkis", year: 2021, description: "Superhero film about Venom.", genres: ["action", "adventure", "superhero"], rating: 3.8, isBook: false },
  { title: "The Suicide Squad", author: "James Gunn", year: 2021, description: "DC superhero film about antiheroes.", genres: ["action", "adventure", "superhero"], rating: 4.1, isBook: false },
  { title: "Godzilla vs. Kong", author: "Adam Wingard", year: 2021, description: "Monster film about giant creatures.", genres: ["action", "sci-fi"], rating: 3.9, isBook: false },
  { title: "A Quiet Place Part II", author: "John Krasinski", year: 2021, description: "Horror thriller about sound-sensitive creatures.", genres: ["horror", "thriller"], rating: 4.1, isBook: false },
  { title: "Halloween Kills", author: "David Gordon Green", year: 2021, description: "Horror film about Michael Myers.", genres: ["horror"], rating: 3.8, isBook: false },
  { title: "Candyman", author: "Nia DaCosta", year: 2021, description: "Horror film about an urban legend.", genres: ["horror", "thriller"], rating: 4.0, isBook: false },
  { title: "The Conjuring: The Devil Made Me Do It", author: "Michael Chaves", year: 2021, description: "Horror film about demonic possession.", genres: ["horror"], rating: 3.9, isBook: false },
  { title: "Malignant", author: "James Wan", year: 2021, description: "Horror thriller about a mysterious condition.", genres: ["horror", "thriller"], rating: 3.8, isBook: false },
  { title: "Old", author: "M. Night Shyamalan", year: 2021, description: "Thriller about rapid aging on a beach.", genres: ["thriller", "mystery"], rating: 3.9, isBook: false },
  { title: "The Forever Purge", author: "Everardo Gout", year: 2021, description: "Action thriller about a never-ending purge.", genres: ["action", "thriller"], rating: 3.7, isBook: false },
  { title: "Nobody", author: "Ilya Naishuller", year: 2021, description: "Action thriller about a retired assassin.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "The Marksman", author: "Robert Lorenz", year: 2021, description: "Action thriller about a veteran protecting a boy.", genres: ["action", "thriller"], rating: 3.8, isBook: false },
  { title: "Wrath of Man", author: "Guy Ritchie", year: 2021, description: "Action thriller about a mysterious security guard.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "The Hitman's Wife's Bodyguard", author: "Patrick Hughes", year: 2021, description: "Action comedy about a bodyguard.", genres: ["action", "comedy"], rating: 3.7, isBook: false },
  { title: "F9: The Fast Saga", author: "Justin Lin", year: 2021, description: "Action film about street racing and family.", genres: ["action", "adventure"], rating: 3.8, isBook: false },
  { title: "Mission: Impossible 7", author: "Christopher McQuarrie", year: 2023, description: "Action thriller about Ethan Hunt's mission.", genres: ["action", "thriller"], rating: 4.2, isBook: false },
  { title: "John Wick: Chapter 4", author: "Chad Stahelski", year: 2023, description: "Action thriller about an assassin.", genres: ["action", "thriller"], rating: 4.3, isBook: false },
  { title: "The Equalizer 3", author: "Antoine Fuqua", year: 2023, description: "Action thriller about a retired CIA agent.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "Extraction 2", author: "Sam Hargrave", year: 2023, description: "Action thriller about a mercenary.", genres: ["action", "thriller"], rating: 4.1, isBook: false },
  { title: "The Gray Man", author: "Anthony and Joe Russo", year: 2022, description: "Action thriller about a CIA assassin.", genres: ["action", "thriller"], rating: 4.0, isBook: false },
  { title: "Bullet Train", author: "David Leitch", year: 2022, description: "Action comedy about assassins on a train.", genres: ["action", "comedy"], rating: 4.1, isBook: false },
  { title: "The Northman", author: "Robert Eggers", year: 2022, description: "Historical action drama about a Viking prince.", genres: ["action", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "Ambulance", author: "Michael Bay", year: 2022, description: "Action thriller about a bank robbery gone wrong.", genres: ["action", "thriller"], rating: 3.9, isBook: false },

  { title: "The Adam Project", author: "Shawn Levy", year: 2022, description: "Sci-fi action comedy about time travel.", genres: ["sci-fi", "action", "comedy"], rating: 4.0, isBook: false },
  { title: "Free Guy", author: "Shawn Levy", year: 2021, description: "Sci-fi action comedy about a video game character.", genres: ["sci-fi", "action", "comedy"], rating: 4.1, isBook: false },
  { title: "The Tomorrow War", author: "Chris McKay", year: 2021, description: "Sci-fi action film about time travel and aliens.", genres: ["sci-fi", "action"], rating: 3.9, isBook: false },
  { title: "Chaos Walking", author: "Doug Liman", year: 2021, description: "Sci-fi adventure about a world where thoughts are visible.", genres: ["sci-fi", "adventure"], rating: 3.7, isBook: false },
  { title: "Reminiscence", author: "Lisa Joy", year: 2021, description: "Sci-fi thriller about memory technology.", genres: ["sci-fi", "thriller"], rating: 3.8, isBook: false },
  { title: "Infinite", author: "Antoine Fuqua", year: 2021, description: "Sci-fi action about reincarnation.", genres: ["sci-fi", "action"], rating: 3.6, isBook: false },
  { title: "Boss Level", author: "Joe Carnahan", year: 2021, description: "Sci-fi action about a time loop.", genres: ["sci-fi", "action"], rating: 3.9, isBook: false },
  { title: "Outside the Wire", author: "Mikael Håfström", year: 2021, description: "Sci-fi action about AI and war.", genres: ["sci-fi", "action"], rating: 3.8, isBook: false },
  { title: "Stowaway", author: "Joe Penna", year: 2021, description: "Sci-fi thriller about a space mission.", genres: ["sci-fi", "thriller"], rating: 3.9, isBook: false },
  { title: "Voyagers", author: "Neil Burger", year: 2021, description: "Sci-fi thriller about a space colonization mission.", genres: ["sci-fi", "thriller"], rating: 3.7, isBook: false },
  { title: "Cosmic Sin", author: "Edward Drake", year: 2021, description: "Sci-fi action about space warfare.", genres: ["sci-fi", "action"], rating: 3.5, isBook: false },
  { title: "The Midnight Sky", author: "George Clooney", year: 2020, description: "Sci-fi drama about a dying Earth.", genres: ["sci-fi", "drama"], rating: 3.8, isBook: false },
  { title: "Tenet", author: "Christopher Nolan", year: 2020, description: "Sci-fi thriller about time inversion.", genres: ["sci-fi", "thriller"], rating: 4.2, isBook: false },
  { title: "The Invisible Man", author: "Leigh Whannell", year: 2020, description: "Sci-fi horror about an invisible stalker.", genres: ["sci-fi", "horror"], rating: 4.1, isBook: false },
  { title: "Underwater", author: "William Eubank", year: 2020, description: "Sci-fi horror about deep sea creatures.", genres: ["sci-fi", "horror"], rating: 3.8, isBook: false },
  { title: "The Call of the Wild", author: "Chris Sanders", year: 2020, description: "Adventure drama about a dog in the Yukon.", genres: ["adventure", "drama"], rating: 3.9, isBook: false },
  { title: "Onward", author: "Dan Scanlon", year: 2020, description: "Animated fantasy adventure about magic.", genres: ["animation", "fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "Soul", author: "Pete Docter", year: 2020, description: "Animated fantasy about the meaning of life.", genres: ["animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Wolfwalkers", author: "Tomm Moore", year: 2020, description: "Animated fantasy about Irish mythology.", genres: ["animation", "fantasy"], rating: 4.2, isBook: false },
  { title: "The Croods: A New Age", author: "Joel Crawford", year: 2020, description: "Animated comedy adventure about prehistoric families.", genres: ["animation", "comedy", "adventure"], rating: 3.9, isBook: false },
  { title: "Raya and the Last Dragon", author: "Don Hall", year: 2021, description: "Animated fantasy adventure about dragons.", genres: ["animation", "fantasy", "adventure"], rating: 4.1, isBook: false },
  { title: "Luca", author: "Enrico Casarosa", year: 2021, description: "Animated coming-of-age story about sea monsters.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Encanto", author: "Jared Bush", year: 2021, description: "Animated musical fantasy about a magical family.", genres: ["animation", "musical", "fantasy"], rating: 4.3, isBook: false },
  { title: "Turning Red", author: "Domee Shi", year: 2022, description: "Animated coming-of-age comedy about puberty.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Lightyear", author: "Angus MacLane", year: 2022, description: "Animated sci-fi adventure about space exploration.", genres: ["animation", "sci-fi", "adventure"], rating: 3.9, isBook: false },
  { title: "Strange World", author: "Don Hall", year: 2022, description: "Animated adventure about exploration.", genres: ["animation", "adventure"], rating: 3.8, isBook: false },
  { title: "Puss in Boots: The Last Wish", author: "Joel Crawford", year: 2022, description: "Animated fantasy adventure about a legendary cat.", genres: ["animation", "fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "The Bad Guys", author: "Pierre Perifel", year: 2022, description: "Animated comedy about reformed criminals.", genres: ["animation", "comedy"], rating: 4.0, isBook: false },
  { title: "DC League of Super-Pets", author: "Jared Stern", year: 2022, description: "Animated superhero comedy about pets.", genres: ["animation", "comedy", "superhero"], rating: 3.8, isBook: false },
  { title: "Minions: The Rise of Gru", author: "Kyle Balda", year: 2022, description: "Animated comedy about young Gru and his minions.", genres: ["animation", "comedy"], rating: 4.0, isBook: false },
  { title: "Super Mario Bros. Movie", author: "Aaron Horvath", year: 2023, description: "Animated adventure based on the video game.", genres: ["animation", "adventure", "comedy"], rating: 4.1, isBook: false },
  { title: "Spider-Man: Across the Spider-Verse", author: "Joaquim Dos Santos", year: 2023, description: "Animated superhero film about multiple Spider-Men.", genres: ["animation", "superhero", "adventure"], rating: 4.5, isBook: false },
  { title: "Elemental", author: "Peter Sohn", year: 2023, description: "Animated fantasy romance about elemental beings.", genres: ["animation", "fantasy", "romance"], rating: 4.0, isBook: false },
  { title: "Teenage Mutant Ninja Turtles: Mutant Mayhem", author: "Jeff Rowe", year: 2023, description: "Animated superhero comedy about the turtles.", genres: ["animation", "superhero", "comedy"], rating: 4.1, isBook: false },
  { title: "Trolls Band Together", author: "Walt Dohrn", year: 2023, description: "Animated musical comedy about trolls.", genres: ["animation", "musical", "comedy"], rating: 3.9, isBook: false },
  { title: "Wish", author: "Chris Buck", year: 2023, description: "Animated musical fantasy about wishes.", genres: ["animation", "musical", "fantasy"], rating: 3.8, isBook: false },
  { title: "Migration", author: "Benjamin Renner", year: 2023, description: "Animated adventure comedy about migrating ducks.", genres: ["animation", "adventure", "comedy"], rating: 3.9, isBook: false },
  { title: "Leo", author: "Robert Marianetti", year: 2023, description: "Animated comedy about a talking lizard.", genres: ["animation", "comedy"], rating: 3.8, isBook: false },
  { title: "Chicken Run: Dawn of the Nugget", author: "Sam Fell", year: 2023, description: "Animated adventure comedy about chickens.", genres: ["animation", "adventure", "comedy"], rating: 3.9, isBook: false },
  { title: "Ruby Gillman, Teenage Kraken", author: "Kirk DeMicco", year: 2023, description: "Animated fantasy comedy about a teenage kraken.", genres: ["animation", "fantasy", "comedy"], rating: 3.7, isBook: false },
  { title: "Nimona", author: "Nick Bruno", year: 2023, description: "Animated fantasy adventure about a shapeshifter.", genres: ["animation", "fantasy", "adventure"], rating: 4.2, isBook: false },

  { title: "The Little Mermaid", author: "Rob Marshall", year: 2023, description: "Live-action musical fantasy about a mermaid.", genres: ["musical", "fantasy", "romance"], rating: 4.0, isBook: false },
  { title: "The Color Purple", author: "Blitz Bazawule", year: 2023, description: "Musical drama about African American women.", genres: ["musical", "drama"], rating: 4.2, isBook: false },
  { title: "Wonka", author: "Paul King", year: 2023, description: "Musical fantasy about young Willy Wonka.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Mean Girls", author: "Samantha Jayne", year: 2024, description: "Musical comedy about high school cliques.", genres: ["musical", "comedy"], rating: 4.0, isBook: false },
  { title: "Bob Marley: One Love", author: "Reinaldo Marcus Green", year: 2024, description: "Biographical musical drama about Bob Marley.", genres: ["musical", "drama", "biography"], rating: 4.1, isBook: false },
  { title: "Joker: Folie à Deux", author: "Todd Phillips", year: 2024, description: "Musical thriller sequel about the Joker.", genres: ["musical", "thriller"], rating: 4.2, isBook: false },
  { title: "Mamma Mia! Here We Go Again", author: "Ol Parker", year: 2018, description: "Musical comedy sequel about love and family.", genres: ["musical", "comedy", "romance"], rating: 4.0, isBook: false },
  { title: "La La Land", author: "Damien Chazelle", year: 2016, description: "Musical romantic comedy about aspiring artists.", genres: ["musical", "romance", "comedy"], rating: 4.3, isBook: false },
  { title: "The Greatest Showman", author: "Michael Gracey", year: 2017, description: "Musical biographical drama about P.T. Barnum.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "A Star Is Born", author: "Bradley Cooper", year: 2018, description: "Musical romantic drama about musicians.", genres: ["musical", "romance", "drama"], rating: 4.3, isBook: false },
  { title: "Bohemian Rhapsody", author: "Bryan Singer", year: 2018, description: "Musical biographical drama about Queen.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Rocketman", author: "Dexter Fletcher", year: 2019, description: "Musical biographical drama about Elton John.", genres: ["musical", "drama", "biography"], rating: 4.1, isBook: false },
  { title: "Cats", author: "Tom Hooper", year: 2019, description: "Musical fantasy about cats.", genres: ["musical", "fantasy"], rating: 3.5, isBook: false },
  { title: "In the Heights", author: "Jon M. Chu", year: 2021, description: "Musical drama about a Latino neighborhood.", genres: ["musical", "drama"], rating: 4.2, isBook: false },
  { title: "Dear Evan Hansen", author: "Stephen Chbosky", year: 2021, description: "Musical drama about teen mental health.", genres: ["musical", "drama"], rating: 4.0, isBook: false },
  { title: "Tick, Tick... Boom!", author: "Lin-Manuel Miranda", year: 2021, description: "Musical biographical drama about Jonathan Larson.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Cyrano", author: "Joe Wright", year: 2021, description: "Musical romantic drama.", genres: ["musical", "romance", "drama"], rating: 4.0, isBook: false },
  { title: "Matilda the Musical", author: "Matthew Warchus", year: 2022, description: "Musical fantasy about a gifted girl.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Roald Dahl's Matilda the Musical", author: "Matthew Warchus", year: 2022, description: "Musical fantasy about a gifted girl.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Spirited", author: "Sean Anders", year: 2022, description: "Musical fantasy comedy about Christmas spirits.", genres: ["musical", "fantasy", "comedy"], rating: 4.0, isBook: false },
  { title: "Disenchanted", author: "Adam Shankman", year: 2022, description: "Musical fantasy comedy about fairy tales.", genres: ["musical", "fantasy", "comedy"], rating: 3.9, isBook: false },
  { title: "Lyle, Lyle, Crocodile", author: "Josh Gordon", year: 2022, description: "Musical comedy about a singing crocodile.", genres: ["musical", "comedy"], rating: 3.8, isBook: false },
  { title: "I Wanna Dance with Somebody", author: "Kasi Lemmons", year: 2022, description: "Musical biographical drama about Whitney Houston.", genres: ["musical", "drama", "biography"], rating: 4.0, isBook: false },
  { title: "Elvis", author: "Baz Luhrmann", year: 2022, description: "Musical biographical drama about Elvis Presley.", genres: ["musical", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Weird: The Al Yankovic Story", author: "Eric Appel", year: 2022, description: "Musical biographical comedy about Weird Al.", genres: ["musical", "comedy", "biography"], rating: 4.1, isBook: false },
  
  // Classic Movies (1950s-1990s)
  { title: "Casablanca", author: "Michael Curtiz", year: 1942, description: "Romantic drama set in WWII Morocco.", genres: ["drama", "romance", "war"], rating: 4.8, isBook: false },
  { title: "Citizen Kane", author: "Orson Welles", year: 1941, description: "Drama about a newspaper magnate's life.", genres: ["drama"], rating: 4.7, isBook: false },
  { title: "Gone with the Wind", author: "Victor Fleming", year: 1939, description: "Epic romance set during the Civil War.", genres: ["drama", "romance", "historical"], rating: 4.6, isBook: false },
  { title: "The Wizard of Oz", author: "Victor Fleming", year: 1939, description: "Musical fantasy about a girl's journey to Oz.", genres: ["musical", "fantasy", "adventure"], rating: 4.7, isBook: false },
  { title: "Snow White and the Seven Dwarfs", author: "Walt Disney", year: 1937, description: "Animated fairy tale about a princess.", genres: ["animation", "fantasy", "musical"], rating: 4.5, isBook: false },
  { title: "Psycho", author: "Alfred Hitchcock", year: 1960, description: "Psychological horror about a motel owner.", genres: ["horror", "thriller"], rating: 4.6, isBook: false },
  { title: "Vertigo", author: "Alfred Hitchcock", year: 1958, description: "Psychological thriller about obsession.", genres: ["thriller", "mystery"], rating: 4.5, isBook: false },
  { title: "Rear Window", author: "Alfred Hitchcock", year: 1954, description: "Thriller about a photographer who witnesses a crime.", genres: ["thriller", "mystery"], rating: 4.6, isBook: false },
  { title: "North by Northwest", author: "Alfred Hitchcock", year: 1959, description: "Thriller about mistaken identity.", genres: ["thriller", "adventure"], rating: 4.5, isBook: false },
  { title: "The Birds", author: "Alfred Hitchcock", year: 1963, description: "Horror about birds attacking humans.", genres: ["horror", "thriller"], rating: 4.3, isBook: false },
  { title: "12 Angry Men", author: "Sidney Lumet", year: 1957, description: "Drama about jury deliberation.", genres: ["drama"], rating: 4.8, isBook: false },
  { title: "On the Waterfront", author: "Elia Kazan", year: 1954, description: "Drama about corruption in the docks.", genres: ["drama", "crime"], rating: 4.6, isBook: false },
  { title: "A Streetcar Named Desire", author: "Elia Kazan", year: 1951, description: "Drama about a troubled family in New Orleans.", genres: ["drama"], rating: 4.5, isBook: false },
  { title: "Sunset Boulevard", author: "Billy Wilder", year: 1950, description: "Film noir about a fading silent film star.", genres: ["drama", "noir"], rating: 4.6, isBook: false },
  { title: "Some Like It Hot", author: "Billy Wilder", year: 1959, description: "Comedy about musicians disguised as women.", genres: ["comedy", "romance"], rating: 4.5, isBook: false },
  { title: "The Apartment", author: "Billy Wilder", year: 1960, description: "Romantic comedy about office politics.", genres: ["comedy", "romance"], rating: 4.4, isBook: false },
  { title: "Double Indemnity", author: "Billy Wilder", year: 1944, description: "Film noir about insurance fraud and murder.", genres: ["noir", "crime"], rating: 4.5, isBook: false },
  { title: "The Bridge on the River Kwai", author: "David Lean", year: 1957, description: "War drama about British POWs in Burma.", genres: ["drama", "war"], rating: 4.6, isBook: false },
  { title: "Lawrence of Arabia", author: "David Lean", year: 1962, description: "Epic drama about T.E. Lawrence in WWI.", genres: ["drama", "war", "biography"], rating: 4.7, isBook: false },
  { title: "Doctor Zhivago", author: "David Lean", year: 1965, description: "Epic romance set during the Russian Revolution.", genres: ["drama", "romance", "historical"], rating: 4.4, isBook: false },
  { title: "The Sound of Music", author: "Robert Wise", year: 1965, description: "Musical about a governess in Austria.", genres: ["musical", "drama"], rating: 4.5, isBook: false },
  { title: "West Side Story", author: "Robert Wise", year: 1961, description: "Musical about rival gangs in New York.", genres: ["musical", "drama", "romance"], rating: 4.6, isBook: false },
  { title: "My Fair Lady", author: "George Cukor", year: 1964, description: "Musical about a professor teaching a flower girl.", genres: ["musical", "comedy", "romance"], rating: 4.4, isBook: false },
  { title: "Singin' in the Rain", author: "Stanley Donen", year: 1952, description: "Musical comedy about the transition to sound films.", genres: ["musical", "comedy"], rating: 4.6, isBook: false },
  { title: "An American in Paris", author: "Vincente Minnelli", year: 1951, description: "Musical romance about an American artist in Paris.", genres: ["musical", "romance"], rating: 4.3, isBook: false },
  { title: "Gigi", author: "Vincente Minnelli", year: 1958, description: "Musical romance about a young girl in Paris.", genres: ["musical", "romance"], rating: 4.2, isBook: false },
  { title: "The King and I", author: "Walter Lang", year: 1956, description: "Musical about a British governess in Siam.", genres: ["musical", "drama"], rating: 4.3, isBook: false },
  { title: "Oklahoma!", author: "Fred Zinnemann", year: 1955, description: "Musical about romance in the Oklahoma Territory.", genres: ["musical", "romance"], rating: 4.2, isBook: false },
  { title: "Carousel", author: "Henry King", year: 1956, description: "Musical drama about a carnival barker.", genres: ["musical", "drama"], rating: 4.1, isBook: false },
  { title: "South Pacific", author: "Joshua Logan", year: 1958, description: "Musical romance set during WWII.", genres: ["musical", "romance", "war"], rating: 4.2, isBook: false },
  { title: "The Music Man", author: "Morton DaCosta", year: 1962, description: "Musical comedy about a traveling salesman.", genres: ["musical", "comedy"], rating: 4.3, isBook: false },
  { title: "Mary Poppins", author: "Robert Stevenson", year: 1964, description: "Musical fantasy about a magical nanny.", genres: ["musical", "fantasy"], rating: 4.5, isBook: false },
  { title: "Chitty Chitty Bang Bang", author: "Ken Hughes", year: 1968, description: "Musical fantasy about a magical car.", genres: ["musical", "fantasy"], rating: 4.1, isBook: false },
  { title: "Bedknobs and Broomsticks", author: "Robert Stevenson", year: 1971, description: "Musical fantasy about a witch and children.", genres: ["musical", "fantasy"], rating: 4.0, isBook: false },
  { title: "Willy Wonka & the Chocolate Factory", author: "Mel Stuart", year: 1971, description: "Musical fantasy about a chocolate factory.", genres: ["musical", "fantasy"], rating: 4.3, isBook: false },
  { title: "The Rocky Horror Picture Show", author: "Jim Sharman", year: 1975, description: "Musical horror comedy about aliens.", genres: ["musical", "horror", "comedy"], rating: 4.2, isBook: false },
  { title: "Grease", author: "Randal Kleiser", year: 1978, description: "Musical romance about high school students.", genres: ["musical", "romance", "comedy"], rating: 4.3, isBook: false },
  { title: "Saturday Night Fever", author: "John Badham", year: 1977, description: "Drama about disco dancing in Brooklyn.", genres: ["drama", "musical"], rating: 4.2, isBook: false },
  { title: "Fame", author: "Alan Parker", year: 1980, description: "Musical drama about performing arts students.", genres: ["musical", "drama"], rating: 4.1, isBook: false },
  { title: "Flashdance", author: "Adrian Lyne", year: 1983, description: "Drama about a welder who wants to dance.", genres: ["drama", "musical"], rating: 4.0, isBook: false },
  { title: "Footloose", author: "Herbert Ross", year: 1984, description: "Musical drama about dancing in a small town.", genres: ["musical", "drama"], rating: 4.1, isBook: false },
  { title: "Dirty Dancing", author: "Emile Ardolino", year: 1987, description: "Romantic drama about dance lessons.", genres: ["drama", "romance", "musical"], rating: 4.2, isBook: false },
  { title: "The Little Mermaid", author: "Ron Clements", year: 1989, description: "Animated musical fantasy about a mermaid.", genres: ["animation", "musical", "fantasy"], rating: 4.4, isBook: false },
  { title: "Beauty and the Beast", author: "Gary Trousdale", year: 1991, description: "Animated musical fantasy about love and transformation.", genres: ["animation", "musical", "fantasy"], rating: 4.5, isBook: false },
  { title: "Aladdin", author: "Ron Clements", year: 1992, description: "Animated musical fantasy about a street rat and a genie.", genres: ["animation", "musical", "fantasy"], rating: 4.4, isBook: false },
  { title: "The Lion King", author: "Roger Allers", year: 1994, description: "Animated musical drama about a lion prince.", genres: ["animation", "musical", "drama"], rating: 4.6, isBook: false },
  { title: "Pocahontas", author: "Mike Gabriel", year: 1995, description: "Animated musical drama about Native American history.", genres: ["animation", "musical", "drama"], rating: 4.2, isBook: false },
  { title: "The Hunchback of Notre Dame", author: "Gary Trousdale", year: 1996, description: "Animated musical drama about a deformed bell ringer.", genres: ["animation", "musical", "drama"], rating: 4.1, isBook: false },
  { title: "Hercules", author: "Ron Clements", year: 1997, description: "Animated musical fantasy about Greek mythology.", genres: ["animation", "musical", "fantasy"], rating: 4.0, isBook: false },
  { title: "Mulan", author: "Tony Bancroft", year: 1998, description: "Animated musical adventure about a female warrior.", genres: ["animation", "musical", "adventure"], rating: 4.3, isBook: false },
  { title: "Tarzan", author: "Chris Buck", year: 1999, description: "Animated musical adventure about a man raised by apes.", genres: ["animation", "musical", "adventure"], rating: 4.2, isBook: false },
  { title: "Fantasia", author: "Walt Disney", year: 1940, description: "Animated musical anthology set to classical music.", genres: ["animation", "musical"], rating: 4.4, isBook: false },
  { title: "Dumbo", author: "Walt Disney", year: 1941, description: "Animated musical about a flying elephant.", genres: ["animation", "musical", "fantasy"], rating: 4.2, isBook: false },
  { title: "Bambi", author: "Walt Disney", year: 1942, description: "Animated drama about a young deer.", genres: ["animation", "drama"], rating: 4.3, isBook: false },
  { title: "Cinderella", author: "Walt Disney", year: 1950, description: "Animated musical fantasy about a fairy tale princess.", genres: ["animation", "musical", "fantasy"], rating: 4.4, isBook: false },
  { title: "Alice in Wonderland", author: "Walt Disney", year: 1951, description: "Animated fantasy about a girl's adventures in Wonderland.", genres: ["animation", "fantasy"], rating: 4.2, isBook: false },
  { title: "Peter Pan", author: "Walt Disney", year: 1953, description: "Animated fantasy about a boy who never grows up.", genres: ["animation", "fantasy", "adventure"], rating: 4.3, isBook: false },
  { title: "Lady and the Tramp", author: "Walt Disney", year: 1955, description: "Animated romance about two dogs from different worlds.", genres: ["animation", "romance"], rating: 4.2, isBook: false },
  { title: "Sleeping Beauty", author: "Walt Disney", year: 1959, description: "Animated musical fantasy about a sleeping princess.", genres: ["animation", "musical", "fantasy"], rating: 4.3, isBook: false },
  { title: "101 Dalmatians", author: "Walt Disney", year: 1961, description: "Animated comedy about dogs protecting puppies.", genres: ["animation", "comedy"], rating: 4.2, isBook: false },
  { title: "The Jungle Book", author: "Walt Disney", year: 1967, description: "Animated musical adventure about a boy raised by animals.", genres: ["animation", "musical", "adventure"], rating: 4.3, isBook: false },
  { title: "The Aristocats", author: "Walt Disney", year: 1970, description: "Animated musical comedy about aristocratic cats.", genres: ["animation", "musical", "comedy"], rating: 4.0, isBook: false },
  { title: "Robin Hood", author: "Walt Disney", year: 1973, description: "Animated musical adventure about the legendary outlaw.", genres: ["animation", "musical", "adventure"], rating: 4.1, isBook: false },
  { title: "The Many Adventures of Winnie the Pooh", author: "Walt Disney", year: 1977, description: "Animated musical about a bear and his friends.", genres: ["animation", "musical"], rating: 4.2, isBook: false },
  { title: "The Rescuers", author: "Walt Disney", year: 1977, description: "Animated adventure about mice helping a girl.", genres: ["animation", "adventure"], rating: 4.0, isBook: false },
  { title: "The Fox and the Hound", author: "Walt Disney", year: 1981, description: "Animated drama about an unlikely friendship.", genres: ["animation", "drama"], rating: 4.1, isBook: false },
  { title: "The Black Cauldron", author: "Walt Disney", year: 1985, description: "Animated fantasy adventure about a magical cauldron.", genres: ["animation", "fantasy", "adventure"], rating: 3.8, isBook: false },
  { title: "The Great Mouse Detective", author: "Walt Disney", year: 1986, description: "Animated mystery about a mouse detective.", genres: ["animation", "mystery"], rating: 4.0, isBook: false },
  { title: "Oliver & Company", author: "Walt Disney", year: 1988, description: "Animated musical about a cat and dog in New York.", genres: ["animation", "musical"], rating: 3.9, isBook: false },
  { title: "The Rescuers Down Under", author: "Walt Disney", year: 1990, description: "Animated adventure sequel about mice helping a boy.", genres: ["animation", "adventure"], rating: 4.0, isBook: false },
  { title: "A Goofy Movie", author: "Walt Disney", year: 1995, description: "Animated comedy about Goofy and his son.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Toy Story", author: "Pixar", year: 1995, description: "Animated adventure about toys that come to life.", genres: ["animation", "adventure", "comedy"], rating: 4.6, isBook: false },
  { title: "A Bug's Life", author: "Pixar", year: 1998, description: "Animated adventure about ants fighting grasshoppers.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Toy Story 2", author: "Pixar", year: 1999, description: "Animated adventure sequel about toys.", genres: ["animation", "adventure", "comedy"], rating: 4.5, isBook: false },
  { title: "Monsters, Inc.", author: "Pixar", year: 2001, description: "Animated comedy about monsters who scare children.", genres: ["animation", "comedy", "fantasy"], rating: 4.4, isBook: false },
  { title: "Finding Nemo", author: "Pixar", year: 2003, description: "Animated adventure about a fish searching for his son.", genres: ["animation", "adventure", "comedy"], rating: 4.5, isBook: false },
  { title: "The Incredibles", author: "Pixar", year: 2004, description: "Animated superhero adventure about a family of heroes.", genres: ["animation", "adventure", "superhero"], rating: 4.6, isBook: false },
  { title: "Cars", author: "Pixar", year: 2006, description: "Animated adventure about talking cars.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Ratatouille", author: "Pixar", year: 2007, description: "Animated comedy about a rat who wants to cook.", genres: ["animation", "comedy"], rating: 4.4, isBook: false },
  { title: "WALL-E", author: "Pixar", year: 2008, description: "Animated sci-fi romance about robots.", genres: ["animation", "sci-fi", "romance"], rating: 4.6, isBook: false },
  { title: "Up", author: "Pixar", year: 2009, description: "Animated adventure about an old man and a boy scout.", genres: ["animation", "adventure", "comedy"], rating: 4.7, isBook: false },
  { title: "Toy Story 3", author: "Pixar", year: 2010, description: "Animated adventure about toys dealing with growing up.", genres: ["animation", "adventure", "comedy"], rating: 4.7, isBook: false },
  { title: "Cars 2", author: "Pixar", year: 2011, description: "Animated adventure sequel about talking cars.", genres: ["animation", "adventure", "comedy"], rating: 3.9, isBook: false },
  { title: "Brave", author: "Pixar", year: 2012, description: "Animated fantasy adventure about a Scottish princess.", genres: ["animation", "fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "Monsters University", author: "Pixar", year: 2013, description: "Animated comedy prequel about monsters in college.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Inside Out", author: "Pixar", year: 2015, description: "Animated fantasy about emotions inside a girl's mind.", genres: ["animation", "fantasy", "comedy"], rating: 4.6, isBook: false },
  { title: "The Good Dinosaur", author: "Pixar", year: 2015, description: "Animated adventure about a dinosaur and a boy.", genres: ["animation", "adventure"], rating: 4.0, isBook: false },
  { title: "Finding Dory", author: "Pixar", year: 2016, description: "Animated adventure sequel about a forgetful fish.", genres: ["animation", "adventure", "comedy"], rating: 4.3, isBook: false },
  { title: "Cars 3", author: "Pixar", year: 2017, description: "Animated adventure about an aging race car.", genres: ["animation", "adventure"], rating: 4.1, isBook: false },
  { title: "Coco", author: "Pixar", year: 2017, description: "Animated fantasy about a boy in the Land of the Dead.", genres: ["animation", "fantasy", "adventure"], rating: 4.7, isBook: false },
  { title: "Incredibles 2", author: "Pixar", year: 2018, description: "Animated superhero sequel about a family of heroes.", genres: ["animation", "adventure", "superhero"], rating: 4.4, isBook: false },
  { title: "Toy Story 4", author: "Pixar", year: 2019, description: "Animated adventure about toys finding their purpose.", genres: ["animation", "adventure", "comedy"], rating: 4.5, isBook: false },
  { title: "Onward", author: "Pixar", year: 2020, description: "Animated fantasy adventure about magic in modern times.", genres: ["animation", "fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "Soul", author: "Pixar", year: 2020, description: "Animated fantasy about the meaning of life.", genres: ["animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Luca", author: "Pixar", year: 2021, description: "Animated coming-of-age story about sea monsters.", genres: ["animation", "adventure", "comedy"], rating: 4.2, isBook: false },
  { title: "Turning Red", author: "Pixar", year: 2022, description: "Animated coming-of-age comedy about puberty.", genres: ["animation", "comedy"], rating: 4.1, isBook: false },
  { title: "Lightyear", author: "Pixar", year: 2022, description: "Animated sci-fi adventure about space exploration.", genres: ["animation", "sci-fi", "adventure"], rating: 3.9, isBook: false },
  { title: "Elemental", author: "Pixar", year: 2023, description: "Animated fantasy romance about elemental beings.", genres: ["animation", "fantasy", "romance"], rating: 4.0, isBook: false },
  
  // Modern Blockbusters & Popular Films (2000s-2020s)
  { title: "The Dark Knight", author: "Christopher Nolan", year: 2008, description: "Superhero film about Batman facing the Joker.", genres: ["action", "crime", "superhero"], rating: 4.8, isBook: false },
  { title: "Inception", author: "Christopher Nolan", year: 2010, description: "Sci-fi thriller about dream infiltration.", genres: ["sci-fi", "thriller"], rating: 4.6, isBook: false },
  { title: "Interstellar", author: "Christopher Nolan", year: 2014, description: "Sci-fi drama about space exploration.", genres: ["sci-fi", "drama"], rating: 4.5, isBook: false },
  { title: "Dunkirk", author: "Christopher Nolan", year: 2017, description: "War drama about the evacuation of Dunkirk.", genres: ["war", "drama"], rating: 4.4, isBook: false },
  { title: "Tenet", author: "Christopher Nolan", year: 2020, description: "Sci-fi thriller about time inversion.", genres: ["sci-fi", "thriller"], rating: 4.2, isBook: false },
  { title: "Oppenheimer", author: "Christopher Nolan", year: 2023, description: "Biographical drama about J. Robert Oppenheimer.", genres: ["drama", "biography", "history"], rating: 4.5, isBook: false },
  { title: "The Lord of the Rings: The Fellowship of the Ring", author: "Peter Jackson", year: 2001, description: "Fantasy adventure about a hobbit's quest.", genres: ["fantasy", "adventure"], rating: 4.7, isBook: false },
  { title: "The Lord of the Rings: The Two Towers", author: "Peter Jackson", year: 2002, description: "Fantasy adventure sequel about Middle-earth.", genres: ["fantasy", "adventure"], rating: 4.6, isBook: false },
  { title: "The Lord of the Rings: The Return of the King", author: "Peter Jackson", year: 2003, description: "Fantasy adventure finale about the ring's destruction.", genres: ["fantasy", "adventure"], rating: 4.8, isBook: false },
  { title: "The Hobbit: An Unexpected Journey", author: "Peter Jackson", year: 2012, description: "Fantasy adventure about Bilbo Baggins.", genres: ["fantasy", "adventure"], rating: 4.2, isBook: false },
  { title: "The Hobbit: The Desolation of Smaug", author: "Peter Jackson", year: 2013, description: "Fantasy adventure about the dragon Smaug.", genres: ["fantasy", "adventure"], rating: 4.1, isBook: false },
  { title: "The Hobbit: The Battle of the Five Armies", author: "Peter Jackson", year: 2014, description: "Fantasy adventure about the final battle.", genres: ["fantasy", "adventure"], rating: 4.0, isBook: false },
  { title: "Avatar", author: "James Cameron", year: 2009, description: "Sci-fi adventure about aliens on Pandora.", genres: ["sci-fi", "adventure"], rating: 4.3, isBook: false },
  { title: "Avatar: The Way of Water", author: "James Cameron", year: 2022, description: "Sci-fi adventure sequel about underwater exploration.", genres: ["sci-fi", "adventure"], rating: 4.1, isBook: false },
  { title: "Titanic", author: "James Cameron", year: 1997, description: "Romantic drama about the Titanic disaster.", genres: ["drama", "romance"], rating: 4.5, isBook: false },
  { title: "Terminator 2: Judgment Day", author: "James Cameron", year: 1991, description: "Sci-fi action about a cyborg protecting a boy.", genres: ["sci-fi", "action"], rating: 4.6, isBook: false },
  { title: "Aliens", author: "James Cameron", year: 1986, description: "Sci-fi horror about space marines fighting aliens.", genres: ["sci-fi", "horror"], rating: 4.5, isBook: false },
  { title: "The Terminator", author: "James Cameron", year: 1984, description: "Sci-fi action about a cyborg assassin.", genres: ["sci-fi", "action"], rating: 4.4, isBook: false },
  { title: "True Lies", author: "James Cameron", year: 1994, description: "Action comedy about a spy's double life.", genres: ["action", "comedy"], rating: 4.2, isBook: false },
  { title: "The Abyss", author: "James Cameron", year: 1989, description: "Sci-fi thriller about underwater aliens.", genres: ["sci-fi", "thriller"], rating: 4.1, isBook: false },
  { title: "Spider-Man", author: "Sam Raimi", year: 2002, description: "Superhero film about Peter Parker becoming Spider-Man.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Spider-Man 2", author: "Sam Raimi", year: 2004, description: "Superhero sequel about Spider-Man vs Doctor Octopus.", genres: ["action", "superhero"], rating: 4.5, isBook: false },
  { title: "Spider-Man 3", author: "Sam Raimi", year: 2007, description: "Superhero film about Spider-Man facing multiple villains.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Iron Man", author: "Jon Favreau", year: 2008, description: "Superhero film about Tony Stark becoming Iron Man.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Iron Man 2", author: "Jon Favreau", year: 2010, description: "Superhero sequel about Iron Man vs Whiplash.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Iron Man 3", author: "Shane Black", year: 2013, description: "Superhero film about Iron Man vs the Mandarin.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "Captain America: The First Avenger", author: "Joe Johnston", year: 2011, description: "Superhero film about Steve Rogers becoming Captain America.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "Captain America: The Winter Soldier", author: "Anthony and Joe Russo", year: 2014, description: "Superhero thriller about Captain America vs the Winter Soldier.", genres: ["action", "superhero", "thriller"], rating: 4.5, isBook: false },
  { title: "Captain America: Civil War", author: "Anthony and Joe Russo", year: 2016, description: "Superhero film about Avengers fighting each other.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Thor", author: "Kenneth Branagh", year: 2011, description: "Superhero film about Thor's journey to Earth.", genres: ["action", "superhero", "fantasy"], rating: 4.1, isBook: false },
  { title: "Thor: The Dark World", author: "Alan Taylor", year: 2013, description: "Superhero sequel about Thor vs the Dark Elves.", genres: ["action", "superhero", "fantasy"], rating: 4.0, isBook: false },
  { title: "Thor: Ragnarok", author: "Taika Waititi", year: 2017, description: "Superhero comedy about Thor's battle with Hela.", genres: ["action", "superhero", "comedy"], rating: 4.5, isBook: false },
  { title: "Thor: Love and Thunder", author: "Taika Waititi", year: 2022, description: "Superhero comedy about Thor's love story.", genres: ["action", "superhero", "comedy"], rating: 4.1, isBook: false },
  { title: "The Avengers", author: "Joss Whedon", year: 2012, description: "Superhero film about Earth's mightiest heroes.", genres: ["action", "superhero"], rating: 4.5, isBook: false },
  { title: "Avengers: Age of Ultron", author: "Joss Whedon", year: 2015, description: "Superhero sequel about Avengers vs Ultron.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Avengers: Infinity War", author: "Anthony and Joe Russo", year: 2018, description: "Superhero film about Avengers vs Thanos.", genres: ["action", "superhero"], rating: 4.6, isBook: false },
  { title: "Avengers: Endgame", author: "Anthony and Joe Russo", year: 2019, description: "Superhero finale about Avengers' final battle.", genres: ["action", "superhero"], rating: 4.7, isBook: false },
  { title: "Black Panther", author: "Ryan Coogler", year: 2018, description: "Superhero film about the king of Wakanda.", genres: ["action", "superhero"], rating: 4.6, isBook: false },
  { title: "Black Panther: Wakanda Forever", author: "Ryan Coogler", year: 2022, description: "Superhero sequel about Wakanda's new protector.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Doctor Strange", author: "Scott Derrickson", year: 2016, description: "Superhero film about a surgeon becoming a sorcerer.", genres: ["action", "superhero", "fantasy"], rating: 4.2, isBook: false },
  { title: "Doctor Strange in the Multiverse of Madness", author: "Sam Raimi", year: 2022, description: "Superhero sequel about multiverse exploration.", genres: ["action", "superhero", "fantasy"], rating: 4.1, isBook: false },
  { title: "Guardians of the Galaxy", author: "James Gunn", year: 2014, description: "Superhero comedy about space misfits.", genres: ["action", "superhero", "comedy"], rating: 4.4, isBook: false },
  { title: "Guardians of the Galaxy Vol. 2", author: "James Gunn", year: 2017, description: "Superhero comedy sequel about family.", genres: ["action", "superhero", "comedy"], rating: 4.3, isBook: false },
  { title: "Guardians of the Galaxy Vol. 3", author: "James Gunn", year: 2023, description: "Superhero comedy finale about Rocket's origin.", genres: ["action", "superhero", "comedy"], rating: 4.4, isBook: false },
  { title: "Ant-Man", author: "Peyton Reed", year: 2015, description: "Superhero comedy about a shrinking hero.", genres: ["action", "superhero", "comedy"], rating: 4.1, isBook: false },
  { title: "Ant-Man and the Wasp", author: "Peyton Reed", year: 2018, description: "Superhero comedy sequel about quantum realm.", genres: ["action", "superhero", "comedy"], rating: 4.0, isBook: false },
  { title: "Ant-Man and the Wasp: Quantumania", author: "Peyton Reed", year: 2023, description: "Superhero comedy about quantum realm adventure.", genres: ["action", "superhero", "comedy"], rating: 3.9, isBook: false },
  { title: "Captain Marvel", author: "Anna Boden", year: 2019, description: "Superhero film about Carol Danvers becoming Captain Marvel.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "The Marvels", author: "Nia DaCosta", year: 2023, description: "Superhero film about three heroes teaming up.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Shang-Chi and the Legend of the Ten Rings", author: "Destin Daniel Cretton", year: 2021, description: "Superhero film about a martial artist's journey.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Eternals", author: "Chloé Zhao", year: 2021, description: "Superhero film about immortal beings.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Black Widow", author: "Cate Shortland", year: 2021, description: "Superhero film about Natasha Romanoff's past.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Spider-Man: Homecoming", author: "Jon Watts", year: 2017, description: "Superhero film about young Spider-Man.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Spider-Man: Far From Home", author: "Jon Watts", year: 2019, description: "Superhero sequel about Spider-Man in Europe.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "Spider-Man: No Way Home", author: "Jon Watts", year: 2021, description: "Superhero film about multiverse Spider-Men.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Venom", author: "Ruben Fleischer", year: 2018, description: "Superhero film about Eddie Brock and Venom.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Venom: Let There Be Carnage", author: "Andy Serkis", year: 2021, description: "Superhero sequel about Venom vs Carnage.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Morbius", author: "Daniel Espinosa", year: 2022, description: "Superhero film about a vampire doctor.", genres: ["action", "superhero", "horror"], rating: 3.5, isBook: false },
  { title: "Deadpool", author: "Tim Miller", year: 2016, description: "Superhero comedy about a wisecracking mercenary.", genres: ["action", "superhero", "comedy"], rating: 4.4, isBook: false },
  { title: "Deadpool 2", author: "David Leitch", year: 2018, description: "Superhero comedy sequel about Deadpool's team.", genres: ["action", "superhero", "comedy"], rating: 4.2, isBook: false },
  { title: "Logan", author: "James Mangold", year: 2017, description: "Superhero drama about an aging Wolverine.", genres: ["action", "superhero", "drama"], rating: 4.6, isBook: false },
  { title: "X-Men", author: "Bryan Singer", year: 2000, description: "Superhero film about mutant superheroes.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "X2: X-Men United", author: "Bryan Singer", year: 2003, description: "Superhero sequel about X-Men vs military.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "X-Men: The Last Stand", author: "Brett Ratner", year: 2006, description: "Superhero film about a cure for mutants.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "X-Men: First Class", author: "Matthew Vaughn", year: 2011, description: "Superhero prequel about young X-Men.", genres: ["action", "superhero"], rating: 4.2, isBook: false },
  { title: "X-Men: Days of Future Past", author: "Bryan Singer", year: 2014, description: "Superhero film about time travel to save mutants.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "X-Men: Apocalypse", author: "Bryan Singer", year: 2016, description: "Superhero film about ancient mutant Apocalypse.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Dark Phoenix", author: "Simon Kinberg", year: 2019, description: "Superhero film about Jean Grey's dark powers.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "The New Mutants", author: "Josh Boone", year: 2020, description: "Superhero horror about young mutants.", genres: ["action", "superhero", "horror"], rating: 3.6, isBook: false },
  { title: "Fantastic Four", author: "Tim Story", year: 2005, description: "Superhero film about a family of superheroes.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Fantastic Four: Rise of the Silver Surfer", author: "Tim Story", year: 2007, description: "Superhero sequel about the Silver Surfer.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "Fantastic Four", author: "Josh Trank", year: 2015, description: "Superhero reboot about the Fantastic Four.", genres: ["action", "superhero"], rating: 3.4, isBook: false },
  { title: "Blade", author: "Stephen Norrington", year: 1998, description: "Superhero horror about a vampire hunter.", genres: ["action", "superhero", "horror"], rating: 4.2, isBook: false },
  { title: "Blade II", author: "Guillermo del Toro", year: 2002, description: "Superhero horror sequel about vampire war.", genres: ["action", "superhero", "horror"], rating: 4.1, isBook: false },
  { title: "Blade: Trinity", author: "David S. Goyer", year: 2004, description: "Superhero horror finale about Dracula.", genres: ["action", "superhero", "horror"], rating: 3.8, isBook: false },
  { title: "The Punisher", author: "Jonathan Hensleigh", year: 2004, description: "Superhero action about a vigilante.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Punisher: War Zone", author: "Lexi Alexander", year: 2008, description: "Superhero action about the Punisher's war.", genres: ["action", "superhero"], rating: 3.6, isBook: false },
  { title: "Ghost Rider", author: "Mark Steven Johnson", year: 2007, description: "Superhero film about a demonic motorcyclist.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "Ghost Rider: Spirit of Vengeance", author: "Mark Neveldine", year: 2012, description: "Superhero sequel about Ghost Rider's vengeance.", genres: ["action", "superhero"], rating: 3.5, isBook: false },
  { title: "Daredevil", author: "Mark Steven Johnson", year: 2003, description: "Superhero film about a blind vigilante.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Elektra", author: "Rob Bowman", year: 2005, description: "Superhero film about an assassin.", genres: ["action", "superhero"], rating: 3.6, isBook: false },
  { title: "Hulk", author: "Ang Lee", year: 2003, description: "Superhero film about Bruce Banner and the Hulk.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "The Incredible Hulk", author: "Louis Leterrier", year: 2008, description: "Superhero reboot about the Hulk.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Man of Steel", author: "Zack Snyder", year: 2013, description: "Superhero film about Superman's origin.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Batman v Superman: Dawn of Justice", author: "Zack Snyder", year: 2016, description: "Superhero film about Batman vs Superman.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Suicide Squad", author: "David Ayer", year: 2016, description: "Superhero film about villainous antiheroes.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Wonder Woman", author: "Patty Jenkins", year: 2017, description: "Superhero film about Wonder Woman in WWI.", genres: ["action", "superhero"], rating: 4.4, isBook: false },
  { title: "Wonder Woman 1984", author: "Patty Jenkins", year: 2020, description: "Superhero sequel about Wonder Woman in the 80s.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  { title: "Justice League", author: "Zack Snyder", year: 2017, description: "Superhero film about DC's greatest heroes.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "Zack Snyder's Justice League", author: "Zack Snyder", year: 2021, description: "Director's cut of Justice League.", genres: ["action", "superhero"], rating: 4.3, isBook: false },
  { title: "Aquaman", author: "James Wan", year: 2018, description: "Superhero film about the king of Atlantis.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Aquaman and the Lost Kingdom", author: "James Wan", year: 2023, description: "Superhero sequel about Aquaman's family.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "Shazam!", author: "David F. Sandberg", year: 2019, description: "Superhero comedy about a boy who becomes a hero.", genres: ["action", "superhero", "comedy"], rating: 4.2, isBook: false },
  { title: "Shazam! Fury of the Gods", author: "David F. Sandberg", year: 2023, description: "Superhero comedy sequel about ancient gods.", genres: ["action", "superhero", "comedy"], rating: 3.8, isBook: false },
  { title: "Birds of Prey", author: "Cathy Yan", year: 2020, description: "Superhero film about Harley Quinn and her team.", genres: ["action", "superhero"], rating: 4.0, isBook: false },
  { title: "The Suicide Squad", author: "James Gunn", year: 2021, description: "Superhero film about villainous antiheroes.", genres: ["action", "superhero"], rating: 4.1, isBook: false },
  { title: "Black Adam", author: "Jaume Collet-Serra", year: 2022, description: "Superhero film about an ancient antihero.", genres: ["action", "superhero"], rating: 3.9, isBook: false },
  { title: "The Flash", author: "Andy Muschietti", year: 2023, description: "Superhero film about the Flash's multiverse adventure.", genres: ["action", "superhero"], rating: 3.7, isBook: false },
  { title: "Blue Beetle", author: "Ángel Manuel Soto", year: 2023, description: "Superhero film about a young hero with alien technology.", genres: ["action", "superhero"], rating: 3.8, isBook: false },
  
  // Holiday & Seasonal Movies
  // Christmas Movies
  { title: "It's a Wonderful Life", author: "Frank Capra", year: 1946, description: "Classic Christmas drama about a man who learns the value of his life.", genres: ["drama", "christmas", "fantasy"], rating: 4.7, isBook: false },
  { title: "A Christmas Story", author: "Bob Clark", year: 1983, description: "Comedy about a boy who wants a Red Ryder BB gun for Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.4, isBook: false },
  { title: "Home Alone", author: "Chris Columbus", year: 1990, description: "Comedy about a boy who defends his home from burglars during Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.5, isBook: false },
  { title: "Home Alone 2: Lost in New York", author: "Chris Columbus", year: 1992, description: "Comedy sequel about a boy lost in New York during Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.2, isBook: false },
  { title: "Miracle on 34th Street", author: "George Seaton", year: 1947, description: "Christmas drama about a man who claims to be Santa Claus.", genres: ["drama", "christmas", "family"], rating: 4.5, isBook: false },
  { title: "Miracle on 34th Street", author: "Les Mayfield", year: 1994, description: "Remake of the classic Christmas drama about Santa Claus.", genres: ["drama", "christmas", "family"], rating: 4.1, isBook: false },
  { title: "Elf", author: "Jon Favreau", year: 2003, description: "Comedy about a human raised as an elf who visits New York.", genres: ["comedy", "christmas", "family"], rating: 4.4, isBook: false },
  { title: "The Santa Clause", author: "John Pasquin", year: 1994, description: "Comedy about a man who becomes Santa Claus.", genres: ["comedy", "christmas", "family"], rating: 4.2, isBook: false },
  { title: "The Santa Clause 2", author: "Michael Lembeck", year: 2002, description: "Comedy sequel about Santa finding a wife.", genres: ["comedy", "christmas", "family"], rating: 3.9, isBook: false },
  { title: "The Santa Clause 3: The Escape Clause", author: "Michael Lembeck", year: 2006, description: "Comedy about Santa dealing with Jack Frost.", genres: ["comedy", "christmas", "family"], rating: 3.7, isBook: false },
  { title: "How the Grinch Stole Christmas", author: "Ron Howard", year: 2000, description: "Comedy about the Grinch trying to steal Christmas.", genres: ["comedy", "christmas", "family"], rating: 4.3, isBook: false },
  { title: "The Grinch", author: "Scott Mosier", year: 2018, description: "Animated comedy about the Grinch's heart growing three sizes.", genres: ["animation", "comedy", "christmas"], rating: 4.0, isBook: false },
  { title: "A Christmas Carol", author: "Robert Zemeckis", year: 2009, description: "Animated adaptation of Dickens' classic Christmas story.", genres: ["animation", "drama", "christmas"], rating: 4.1, isBook: false },
  { title: "Scrooged", author: "Richard Donner", year: 1988, description: "Comedy adaptation of A Christmas Carol set in modern times.", genres: ["comedy", "christmas", "fantasy"], rating: 4.2, isBook: false },
  { title: "The Polar Express", author: "Robert Zemeckis", year: 2004, description: "Animated adventure about a magical train to the North Pole.", genres: ["animation", "adventure", "christmas"], rating: 4.3, isBook: false },
  { title: "The Nightmare Before Christmas", author: "Henry Selick", year: 1993, description: "Animated musical about Jack Skellington discovering Christmas.", genres: ["animation", "musical", "christmas"], rating: 4.4, isBook: false },
  { title: "White Christmas", author: "Michael Curtiz", year: 1954, description: "Musical about two performers helping a retired general.", genres: ["musical", "romance", "christmas"], rating: 4.3, isBook: false },
  { title: "Holiday Inn", author: "Mark Sandrich", year: 1942, description: "Musical about a performer who opens a hotel for holidays.", genres: ["musical", "romance", "christmas"], rating: 4.2, isBook: false },
  { title: "Meet Me in St. Louis", author: "Vincente Minnelli", year: 1944, description: "Musical about a family's year in St. Louis.", genres: ["musical", "drama", "christmas"], rating: 4.1, isBook: false },
  { title: "Love Actually", author: "Richard Curtis", year: 2003, description: "Romantic comedy about love stories during Christmas in London.", genres: ["comedy", "romance", "christmas"], rating: 4.3, isBook: false },
  { title: "The Holiday", author: "Nancy Meyers", year: 2006, description: "Romantic comedy about two women swapping homes for Christmas.", genres: ["comedy", "romance", "christmas"], rating: 4.2, isBook: false },
  { title: "Last Christmas", author: "Paul Feig", year: 2019, description: "Romantic comedy about a woman finding love during Christmas.", genres: ["comedy", "romance", "christmas"], rating: 3.8, isBook: false },
  { title: "The Family Stone", author: "Thomas Bezucha", year: 2005, description: "Comedy-drama about a family gathering for Christmas.", genres: ["comedy", "drama", "christmas"], rating: 4.0, isBook: false },
  { title: "Four Christmases", author: "Seth Gordon", year: 2008, description: "Comedy about a couple visiting four different families on Christmas.", genres: ["comedy", "romance", "christmas"], rating: 3.9, isBook: false },
  { title: "Christmas with the Kranks", author: "Joe Roth", year: 2004, description: "Comedy about a couple trying to skip Christmas.", genres: ["comedy", "family", "christmas"], rating: 3.7, isBook: false },
  { title: "Jingle All the Way", author: "Brian Levant", year: 1996, description: "Comedy about a father's quest to find a popular toy for Christmas.", genres: ["comedy", "family", "christmas"], rating: 3.8, isBook: false },
  { title: "Deck the Halls", author: "John Whitesell", year: 2006, description: "Comedy about neighbors competing with Christmas decorations.", genres: ["comedy", "family", "christmas"], rating: 3.6, isBook: false },
  { title: "Fred Claus", author: "David Dobkin", year: 2007, description: "Comedy about Santa's brother coming to the North Pole.", genres: ["comedy", "family", "christmas"], rating: 3.7, isBook: false },
  { title: "Arthur Christmas", author: "Sarah Smith", year: 2011, description: "Animated comedy about Santa's son delivering a missed present.", genres: ["animation", "comedy", "christmas"], rating: 4.1, isBook: false },
  { title: "Rise of the Guardians", author: "Peter Ramsey", year: 2012, description: "Animated adventure about holiday legends protecting children.", genres: ["animation", "adventure", "christmas"], rating: 4.2, isBook: false },
  { title: "Klaus", author: "Sergio Pablos", year: 2019, description: "Animated comedy about a postman helping a toymaker become Santa.", genres: ["animation", "comedy", "christmas"], rating: 4.4, isBook: false },
  { title: "Noelle", author: "Marc Lawrence", year: 2019, description: "Comedy about Santa's daughter taking over the family business.", genres: ["comedy", "family", "christmas"], rating: 3.9, isBook: false },
  { title: "The Christmas Chronicles", author: "Clay Kaytis", year: 2018, description: "Adventure comedy about two siblings helping Santa save Christmas.", genres: ["adventure", "comedy", "christmas"], rating: 4.0, isBook: false },
  { title: "The Christmas Chronicles 2", author: "Chris Columbus", year: 2020, description: "Adventure sequel about saving Christmas from an evil force.", genres: ["adventure", "comedy", "christmas"], rating: 3.8, isBook: false },
  { title: "A Boy Called Christmas", author: "Gil Kenan", year: 2021, description: "Fantasy adventure about a boy's journey to find his father and Christmas.", genres: ["fantasy", "adventure", "christmas"], rating: 4.0, isBook: false },
  { title: "Spirited", author: "Sean Anders", year: 2022, description: "Musical comedy about Christmas spirits reforming a cynic.", genres: ["musical", "comedy", "christmas"], rating: 4.0, isBook: false },
  { title: "Violent Night", author: "Tommy Wirkola", year: 2022, description: "Action comedy about Santa fighting criminals on Christmas Eve.", genres: ["action", "comedy", "christmas"], rating: 3.9, isBook: false },
  { title: "Candy Cane Lane", author: "Reginald Hudlin", year: 2023, description: "Comedy about a man making a deal with an elf for Christmas decorations.", genres: ["comedy", "family", "christmas"], rating: 3.7, isBook: false },
  { title: "Genie", author: "Sam Boyd", year: 2023, description: "Comedy about a man who gets three wishes from a genie during Christmas.", genres: ["comedy", "fantasy", "christmas"], rating: 3.8, isBook: false },
  
  // Halloween Movies
  { title: "Halloween", author: "John Carpenter", year: 1978, description: "Horror film about Michael Myers stalking babysitters.", genres: ["horror", "thriller", "halloween"], rating: 4.5, isBook: false },
  { title: "Halloween II", author: "Rick Rosenthal", year: 1981, description: "Horror sequel about Michael Myers continuing his killing spree.", genres: ["horror", "thriller", "halloween"], rating: 4.1, isBook: false },
  { title: "Halloween III: Season of the Witch", author: "Tommy Lee Wallace", year: 1982, description: "Horror about a doctor investigating mysterious Halloween masks.", genres: ["horror", "thriller", "halloween"], rating: 3.8, isBook: false },
  { title: "Halloween 4: The Return of Michael Myers", author: "Dwight H. Little", year: 1988, description: "Horror about Michael Myers returning to kill his niece.", genres: ["horror", "thriller", "halloween"], rating: 3.9, isBook: false },
  { title: "Halloween 5: The Revenge of Michael Myers", author: "Dominique Othenin-Girard", year: 1989, description: "Horror about Michael Myers seeking revenge on his niece.", genres: ["horror", "thriller", "halloween"], rating: 3.7, isBook: false },
  { title: "Halloween: The Curse of Michael Myers", author: "Joe Chappelle", year: 1995, description: "Horror about Michael Myers and a mysterious cult.", genres: ["horror", "thriller", "halloween"], rating: 3.6, isBook: false },
  { title: "Halloween H20: 20 Years Later", author: "Steve Miner", year: 1998, description: "Horror about Laurie Strode facing Michael Myers again.", genres: ["horror", "thriller", "halloween"], rating: 4.0, isBook: false },
  { title: "Halloween: Resurrection", author: "Rick Rosenthal", year: 2002, description: "Horror about a reality show in Michael Myers' house.", genres: ["horror", "thriller", "halloween"], rating: 3.5, isBook: false },
  { title: "Halloween", author: "Rob Zombie", year: 2007, description: "Horror remake about Michael Myers' origin story.", genres: ["horror", "thriller", "halloween"], rating: 4.0, isBook: false },
  { title: "Halloween II", author: "Rob Zombie", year: 2009, description: "Horror sequel about Michael Myers and his sister.", genres: ["horror", "thriller", "halloween"], rating: 3.8, isBook: false },
  { title: "Halloween", author: "David Gordon Green", year: 2018, description: "Horror sequel about Laurie Strode's final confrontation with Michael Myers.", genres: ["horror", "thriller", "halloween"], rating: 4.2, isBook: false },
  { title: "Halloween Kills", author: "David Gordon Green", year: 2021, description: "Horror sequel about the town fighting back against Michael Myers.", genres: ["horror", "thriller", "halloween"], rating: 3.8, isBook: false },
  { title: "Halloween Ends", author: "David Gordon Green", year: 2022, description: "Horror finale about the final battle between Laurie and Michael.", genres: ["horror", "thriller", "halloween"], rating: 3.9, isBook: false },
  { title: "Hocus Pocus", author: "Kenny Ortega", year: 1993, description: "Comedy about three witches resurrected on Halloween.", genres: ["comedy", "fantasy", "halloween"], rating: 4.3, isBook: false },
  { title: "Hocus Pocus 2", author: "Anne Fletcher", year: 2022, description: "Comedy sequel about the Sanderson sisters returning on Halloween.", genres: ["comedy", "fantasy", "halloween"], rating: 3.9, isBook: false },
  { title: "The Nightmare Before Christmas", author: "Henry Selick", year: 1993, description: "Animated musical about Jack Skellington discovering Christmas.", genres: ["animation", "musical", "halloween"], rating: 4.4, isBook: false },
  { title: "Beetlejuice", author: "Tim Burton", year: 1988, description: "Comedy about a ghost couple hiring a bio-exorcist.", genres: ["comedy", "fantasy", "halloween"], rating: 4.3, isBook: false },
  { title: "The Addams Family", author: "Barry Sonnenfeld", year: 1991, description: "Comedy about a quirky family dealing with a con artist.", genres: ["comedy", "fantasy", "halloween"], rating: 4.2, isBook: false },
  { title: "Addams Family Values", author: "Barry Sonnenfeld", year: 1993, description: "Comedy sequel about the Addams family and a gold digger.", genres: ["comedy", "fantasy", "halloween"], rating: 4.1, isBook: false },
  { title: "Casper", author: "Brad Silberling", year: 1995, description: "Comedy about a friendly ghost and a paranormal expert.", genres: ["comedy", "fantasy", "halloween"], rating: 4.0, isBook: false },
  { title: "The Craft", author: "Andrew Fleming", year: 1996, description: "Horror about four teenage girls practicing witchcraft.", genres: ["horror", "thriller", "halloween"], rating: 4.1, isBook: false },
  { title: "Practical Magic", author: "Griffin Dunne", year: 1998, description: "Romantic comedy about two witch sisters.", genres: ["comedy", "romance", "halloween"], rating: 4.0, isBook: false },
  { title: "Sleepy Hollow", author: "Tim Burton", year: 1999, description: "Horror mystery about the Headless Horseman.", genres: ["horror", "mystery", "halloween"], rating: 4.2, isBook: false },
  { title: "The Haunted Mansion", author: "Rob Minkoff", year: 2003, description: "Comedy about a family trapped in a haunted mansion.", genres: ["comedy", "fantasy", "halloween"], rating: 3.8, isBook: false },
  { title: "Monster House", author: "Gil Kenan", year: 2006, description: "Animated horror comedy about a house that eats people.", genres: ["animation", "horror", "halloween"], rating: 4.1, isBook: false },
  { title: "ParaNorman", author: "Chris Butler", year: 2012, description: "Animated comedy about a boy who can see and talk to ghosts.", genres: ["animation", "comedy", "halloween"], rating: 4.2, isBook: false },
  { title: "The Book of Life", author: "Jorge R. Gutierrez", year: 2014, description: "Animated adventure about a man's journey through the Land of the Dead.", genres: ["animation", "adventure", "halloween"], rating: 4.1, isBook: false },
  { title: "Coco", author: "Lee Unkrich", year: 2017, description: "Animated adventure about a boy's journey to the Land of the Dead.", genres: ["animation", "adventure", "halloween"], rating: 4.5, isBook: false },
  { title: "The Addams Family", author: "Conrad Vernon", year: 2019, description: "Animated comedy about the Addams family moving to a new town.", genres: ["animation", "comedy", "halloween"], rating: 3.9, isBook: false },
  { title: "The Addams Family 2", author: "Greg Tiernan", year: 2021, description: "Animated comedy sequel about the Addams family on a road trip.", genres: ["animation", "comedy", "halloween"], rating: 3.7, isBook: false },
  { title: "Wendell & Wild", author: "Henry Selick", year: 2022, description: "Animated comedy about two demon brothers and a teenage girl.", genres: ["animation", "comedy", "halloween"], rating: 3.8, isBook: false },
  
  // Thanksgiving Movies
  { title: "Planes, Trains and Automobiles", author: "John Hughes", year: 1987, description: "Comedy about two men trying to get home for Thanksgiving.", genres: ["comedy", "thanksgiving"], rating: 4.4, isBook: false },
  { title: "Home for the Holidays", author: "Jodie Foster", year: 1995, description: "Comedy-drama about a family gathering for Thanksgiving.", genres: ["comedy", "drama", "thanksgiving"], rating: 4.1, isBook: false },
  { title: "The Ice Storm", author: "Ang Lee", year: 1997, description: "Drama about two families during Thanksgiving weekend.", genres: ["drama", "thanksgiving"], rating: 4.2, isBook: false },
  { title: "Pieces of April", author: "Peter Hedges", year: 2003, description: "Drama about a young woman cooking Thanksgiving dinner.", genres: ["drama", "thanksgiving"], rating: 4.0, isBook: false },
  { title: "The Blind Side", author: "John Lee Hancock", year: 2009, description: "Drama about a family taking in a homeless teenager.", genres: ["drama", "sports", "thanksgiving"], rating: 4.3, isBook: false },
  { title: "Free Birds", author: "Jimmy Hayward", year: 2013, description: "Animated comedy about turkeys trying to change Thanksgiving.", genres: ["animation", "comedy", "thanksgiving"], rating: 3.8, isBook: false },
  { title: "Addams Family Values", author: "Barry Sonnenfeld", year: 1993, description: "Comedy about the Addams family at summer camp.", genres: ["comedy", "fantasy", "thanksgiving"], rating: 4.1, isBook: false },
  
  // Valentine's Day Movies
  { title: "Valentine's Day", author: "Garry Marshall", year: 2010, description: "Romantic comedy about love stories on Valentine's Day.", genres: ["comedy", "romance", "valentines"], rating: 3.9, isBook: false },
  { title: "The Notebook", author: "Nick Cassavetes", year: 2004, description: "Romantic drama about a couple's love story.", genres: ["drama", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Titanic", author: "James Cameron", year: 1997, description: "Romantic drama about love on the Titanic.", genres: ["drama", "romance", "valentines"], rating: 4.5, isBook: false },
  { title: "La La Land", author: "Damien Chazelle", year: 2016, description: "Musical romantic comedy about aspiring artists.", genres: ["musical", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "500 Days of Summer", author: "Marc Webb", year: 2009, description: "Romantic comedy about a man's relationship with Summer.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "Eternal Sunshine of the Spotless Mind", author: "Michel Gondry", year: 2004, description: "Romantic sci-fi about erasing memories of love.", genres: ["sci-fi", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Before Sunrise", author: "Richard Linklater", year: 1995, description: "Romantic drama about two strangers spending a night together.", genres: ["drama", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "Before Sunset", author: "Richard Linklater", year: 2004, description: "Romantic drama sequel about the couple reuniting.", genres: ["drama", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Before Midnight", author: "Richard Linklater", year: 2013, description: "Romantic drama about the couple's relationship challenges.", genres: ["drama", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "Crazy, Stupid, Love", author: "Glenn Ficarra", year: 2011, description: "Romantic comedy about love and relationships.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "The Proposal", author: "Anne Fletcher", year: 2009, description: "Romantic comedy about a fake engagement.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "27 Dresses", author: "Anne Fletcher", year: 2008, description: "Romantic comedy about a perpetual bridesmaid.", genres: ["comedy", "romance", "valentines"], rating: 4.0, isBook: false },
  { title: "The Wedding Planner", author: "Adam Shankman", year: 2001, description: "Romantic comedy about a wedding planner falling in love.", genres: ["comedy", "romance", "valentines"], rating: 3.9, isBook: false },
  { title: "My Best Friend's Wedding", author: "P.J. Hogan", year: 1997, description: "Romantic comedy about a woman trying to break up a wedding.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "Pretty Woman", author: "Garry Marshall", year: 1990, description: "Romantic comedy about a businessman and a prostitute.", genres: ["comedy", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "When Harry Met Sally", author: "Rob Reiner", year: 1989, description: "Romantic comedy about friends becoming lovers.", genres: ["comedy", "romance", "valentines"], rating: 4.4, isBook: false },
  { title: "Sleepless in Seattle", author: "Nora Ephron", year: 1993, description: "Romantic comedy about love letters and destiny.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "You've Got Mail", author: "Nora Ephron", year: 1998, description: "Romantic comedy about online romance.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "Notting Hill", author: "Roger Michell", year: 1999, description: "Romantic comedy about a bookseller and a movie star.", genres: ["comedy", "romance", "valentines"], rating: 4.2, isBook: false },
  { title: "Four Weddings and a Funeral", author: "Mike Newell", year: 1994, description: "Romantic comedy about love and weddings.", genres: ["comedy", "romance", "valentines"], rating: 4.3, isBook: false },
  { title: "Bridget Jones's Diary", author: "Sharon Maguire", year: 2001, description: "Romantic comedy about a single woman's diary.", genres: ["comedy", "romance", "valentines"], rating: 4.1, isBook: false },
  { title: "Bridget Jones: The Edge of Reason", author: "Beeban Kidron", year: 2004, description: "Romantic comedy sequel about Bridget's relationship.", genres: ["comedy", "romance", "valentines"], rating: 3.9, isBook: false },
  { title: "Bridget Jones's Baby", author: "Sharon Maguire", year: 2016, description: "Romantic comedy about Bridget's unexpected pregnancy.", genres: ["comedy", "romance", "valentines"], rating: 3.8, isBook: false },
  
  // Additional Romantic Comedies
  { title: "How to Lose a Guy in 10 Days", author: "Donald Petrie", year: 2003, description: "Romantic comedy about a bet between a woman and a man.", genres: ["comedy", "romance"], rating: 4.0, isBook: false },
  { title: "13 Going on 30", author: "Gary Winick", year: 2004, description: "Romantic comedy about a girl who wakes up as her 30-year-old self.", genres: ["comedy", "romance", "fantasy"], rating: 4.1, isBook: false },
  { title: "The Devil Wears Prada", author: "David Frankel", year: 2006, description: "Comedy-drama about a young woman working for a demanding fashion editor.", genres: ["comedy", "drama", "fashion"], rating: 4.2, isBook: false },
  { title: "Legally Blonde", author: "Robert Luketic", year: 2001, description: "Comedy about a sorority girl who goes to Harvard Law School.", genres: ["comedy", "romance"], rating: 4.1, isBook: false },
  { title: "Legally Blonde 2: Red, White & Blonde", author: "Charles Herman-Wurmfeld", year: 2003, description: "Comedy sequel about Elle Woods fighting for animal rights.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "Miss Congeniality", author: "Donald Petrie", year: 2000, description: "Comedy about an FBI agent going undercover at a beauty pageant.", genres: ["comedy", "romance", "crime"], rating: 4.0, isBook: false },
  { title: "Miss Congeniality 2: Armed and Fabulous", author: "John Pasquin", year: 2005, description: "Comedy sequel about an FBI agent protecting a beauty pageant.", genres: ["comedy", "romance", "crime"], rating: 3.7, isBook: false },
  { title: "The Princess Diaries", author: "Garry Marshall", year: 2001, description: "Comedy about a teenager discovering she's a princess.", genres: ["comedy", "family", "romance"], rating: 4.1, isBook: false },
  { title: "The Princess Diaries 2: Royal Engagement", author: "Garry Marshall", year: 2004, description: "Comedy sequel about a princess finding love.", genres: ["comedy", "romance"], rating: 3.9, isBook: false },
  { title: "Confessions of a Shopaholic", author: "P.J. Hogan", year: 2009, description: "Romantic comedy about a shopaholic trying to get her life together.", genres: ["comedy", "romance"], rating: 3.9, isBook: false },
  { title: "The Ugly Truth", author: "Robert Luketic", year: 2009, description: "Romantic comedy about a TV producer and a relationship expert.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "He's Just Not That Into You", author: "Ken Kwapis", year: 2009, description: "Romantic comedy about various relationship scenarios.", genres: ["comedy", "romance"], rating: 3.9, isBook: false },
  { title: "The Break-Up", author: "Peyton Reed", year: 2006, description: "Romantic comedy about a couple who break up but continue living together.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "Failure to Launch", author: "Tom Dey", year: 2006, description: "Romantic comedy about a man who still lives with his parents.", genres: ["comedy", "romance"], rating: 3.7, isBook: false },
  { title: "The Wedding Date", author: "Clare Kilner", year: 2005, description: "Romantic comedy about a woman hiring a male escort for her sister's wedding.", genres: ["comedy", "romance"], rating: 3.8, isBook: false },
  { title: "Just Like Heaven", author: "Mark Waters", year: 2005, description: "Romantic comedy about a man who falls in love with a ghost.", genres: ["comedy", "romance", "fantasy"], rating: 3.9, isBook: false },
  { title: "The Family Stone", author: "Thomas Bezucha", year: 2005, description: "Romantic comedy about a woman meeting her boyfriend's family at Christmas.", genres: ["comedy", "romance", "christmas"], rating: 4.0, isBook: false },
  { title: "The Holiday", author: "Nancy Meyers", year: 2006, description: "Romantic comedy about two women swapping homes for Christmas.", genres: ["comedy", "romance", "christmas"], rating: 4.2, isBook: false },
  { title: "Something's Gotta Give", author: "Nancy Meyers", year: 2003, description: "Romantic comedy about love between older adults.", genres: ["comedy", "romance"], rating: 4.1, isBook: false },
  { title: "It's Complicated", author: "Nancy Meyers", year: 2009, description: "Romantic comedy about a divorced woman's complicated love life.", genres: ["comedy", "romance"], rating: 4.0, isBook: false },
  
  // Easter Movies
  { title: "The Ten Commandments", author: "Cecil B. DeMille", year: 1956, description: "Epic drama about Moses leading the Israelites.", genres: ["drama", "history", "easter"], rating: 4.4, isBook: false },
  { title: "Ben-Hur", author: "William Wyler", year: 1959, description: "Epic drama about a Jewish prince seeking revenge.", genres: ["drama", "history", "easter"], rating: 4.5, isBook: false },
  { title: "The Passion of the Christ", author: "Mel Gibson", year: 2004, description: "Drama about the final hours of Jesus Christ.", genres: ["drama", "history", "easter"], rating: 4.2, isBook: false },
  { title: "Braveheart", author: "Mel Gibson", year: 1995, description: "Epic historical drama about Scottish warrior William Wallace fighting for freedom.", genres: ["drama", "history", "war", "action"], rating: 4.5, isBook: false },
  { title: "Lethal Weapon", author: "Richard Donner", year: 1987, description: "Action comedy about two mismatched LAPD detectives.", genres: ["action", "comedy", "crime"], rating: 4.3, isBook: false },
  { title: "Lethal Weapon 2", author: "Richard Donner", year: 1989, description: "Action comedy sequel about detectives fighting South African drug smugglers.", genres: ["action", "comedy", "crime"], rating: 4.2, isBook: false },
  { title: "Lethal Weapon 3", author: "Richard Donner", year: 1992, description: "Action comedy about detectives investigating police corruption.", genres: ["action", "comedy", "crime"], rating: 4.1, isBook: false },
  { title: "Lethal Weapon 4", author: "Richard Donner", year: 1998, description: "Action comedy about detectives fighting Chinese triads.", genres: ["action", "comedy", "crime"], rating: 4.0, isBook: false },
  { title: "Mad Max", author: "George Miller", year: 1979, description: "Post-apocalyptic action film about a police officer seeking revenge.", genres: ["action", "sci-fi", "dystopian"], rating: 4.2, isBook: false },
  { title: "Mad Max 2: The Road Warrior", author: "George Miller", year: 1981, description: "Post-apocalyptic action sequel about protecting a fuel convoy.", genres: ["action", "sci-fi", "dystopian"], rating: 4.4, isBook: false },
  { title: "Mad Max Beyond Thunderdome", author: "George Miller", year: 1985, description: "Post-apocalyptic action about Max in a desert city.", genres: ["action", "sci-fi", "dystopian"], rating: 4.1, isBook: false },
  { title: "Mad Max: Fury Road", author: "George Miller", year: 2015, description: "Post-apocalyptic action about Max helping women escape a tyrant.", genres: ["action", "sci-fi", "dystopian"], rating: 4.5, isBook: false },
  { title: "What Women Want", author: "Nancy Meyers", year: 2000, description: "Romantic comedy about a man who can hear women's thoughts.", genres: ["comedy", "romance", "fantasy"], rating: 4.1, isBook: false },
  { title: "Signs", author: "M. Night Shyamalan", year: 2002, description: "Sci-fi thriller about a family dealing with crop circles and aliens.", genres: ["sci-fi", "thriller", "mystery"], rating: 4.2, isBook: false },
  { title: "We Were Soldiers", author: "Randall Wallace", year: 2002, description: "War drama about the Battle of Ia Drang during the Vietnam War.", genres: ["war", "drama", "history"], rating: 4.1, isBook: false },
  { title: "Apocalypto", author: "Mel Gibson", year: 2006, description: "Action adventure about a Mayan man's journey to save his family.", genres: ["action", "adventure", "history"], rating: 4.3, isBook: false },
  { title: "Hacksaw Ridge", author: "Mel Gibson", year: 2016, description: "War drama about a conscientious objector who saved 75 men in WWII.", genres: ["war", "drama", "history"], rating: 4.4, isBook: false },
  { title: "Risen", author: "Kevin Reynolds", year: 2016, description: "Drama about a Roman soldier investigating Jesus' resurrection.", genres: ["drama", "history", "easter"], rating: 4.0, isBook: false },
  { title: "Hop", author: "Tim Hill", year: 2011, description: "Animated comedy about the Easter Bunny's son.", genres: ["animation", "comedy", "easter"], rating: 3.8, isBook: false },
  { title: "Peter Rabbit", author: "Will Gluck", year: 2018, description: "Animated comedy about Peter Rabbit and his adventures.", genres: ["animation", "comedy", "easter"], rating: 3.9, isBook: false },
  { title: "Peter Rabbit 2: The Runaway", author: "Will Gluck", year: 2021, description: "Animated comedy sequel about Peter Rabbit's city adventure.", genres: ["animation", "comedy", "easter"], rating: 3.7, isBook: false },
  
  // St. Patrick's Day Movies
  { title: "The Quiet Man", author: "John Ford", year: 1952, description: "Romantic drama about an American returning to Ireland.", genres: ["drama", "romance", "stpatricks"], rating: 4.3, isBook: false },
  { title: "Waking Ned Devine", author: "Kirk Jones", year: 1998, description: "Comedy about a village trying to claim lottery winnings.", genres: ["comedy", "stpatricks"], rating: 4.1, isBook: false },
  { title: "The Commitments", author: "Alan Parker", year: 1991, description: "Musical comedy about an Irish soul band.", genres: ["musical", "comedy", "stpatricks"], rating: 4.2, isBook: false },
  { title: "In the Name of the Father", author: "Jim Sheridan", year: 1993, description: "Drama about the Guildford Four case.", genres: ["drama", "stpatricks"], rating: 4.4, isBook: false },
  { title: "My Left Foot", author: "Jim Sheridan", year: 1989, description: "Drama about Christy Brown overcoming cerebral palsy.", genres: ["drama", "biography", "stpatricks"], rating: 4.3, isBook: false },
  { title: "The Wind That Shakes the Barley", author: "Ken Loach", year: 2006, description: "Drama about the Irish War of Independence.", genres: ["drama", "history", "stpatricks"], rating: 4.2, isBook: false },
  { title: "Brooklyn", author: "John Crowley", year: 2015, description: "Romantic drama about an Irish immigrant in 1950s Brooklyn.", genres: ["drama", "romance", "stpatricks"], rating: 4.1, isBook: false },
  { title: "Sing Street", author: "John Carney", year: 2016, description: "Musical comedy about a boy forming a band in 1980s Dublin.", genres: ["musical", "comedy", "stpatricks"], rating: 4.3, isBook: false },
  
  // Independence Day Movies
  { title: "Independence Day", author: "Roland Emmerich", year: 1996, description: "Sci-fi action about aliens attacking Earth on July 4th.", genres: ["sci-fi", "action", "independenceday"], rating: 4.3, isBook: false },
  { title: "Independence Day: Resurgence", author: "Roland Emmerich", year: 2016, description: "Sci-fi action sequel about aliens returning to Earth.", genres: ["sci-fi", "action", "independenceday"], rating: 3.8, isBook: false },
  { title: "The Patriot", author: "Roland Emmerich", year: 2000, description: "War drama about a father fighting in the American Revolution.", genres: ["war", "drama", "independenceday"], rating: 4.2, isBook: false },
  { title: "1776", author: "Peter H. Hunt", year: 1972, description: "Musical about the signing of the Declaration of Independence.", genres: ["musical", "history", "independenceday"], rating: 4.1, isBook: false },
  { title: "National Treasure", author: "Jon Turteltaub", year: 2004, description: "Adventure about a treasure hunter seeking the Declaration of Independence.", genres: ["adventure", "mystery", "independenceday"], rating: 4.0, isBook: false },
  { title: "National Treasure: Book of Secrets", author: "Jon Turteltaub", year: 2007, description: "Adventure sequel about searching for a lost city of gold.", genres: ["adventure", "mystery", "independenceday"], rating: 3.9, isBook: false },
  { title: "Jaws", author: "Steven Spielberg", year: 1975, description: "Thriller about a shark terrorizing a beach town on July 4th.", genres: ["thriller", "horror", "independenceday"], rating: 4.5, isBook: false },
  { title: "Born on the Fourth of July", author: "Oliver Stone", year: 1989, description: "Drama about a Vietnam War veteran's journey.", genres: ["drama", "war", "independenceday"], rating: 4.3, isBook: false },
  
  // New Year's Movies
  { title: "When Harry Met Sally", author: "Rob Reiner", year: 1989, description: "Romantic comedy about friends becoming lovers over New Year's.", genres: ["comedy", "romance", "newyear"], rating: 4.4, isBook: false },
  { title: "New Year's Eve", author: "Garry Marshall", year: 2011, description: "Romantic comedy about love stories on New Year's Eve.", genres: ["comedy", "romance", "newyear"], rating: 3.7, isBook: false },
  { title: "About Time", author: "Richard Curtis", year: 2013, description: "Romantic comedy about a man who can travel through time.", genres: ["comedy", "romance", "newyear"], rating: 4.3, isBook: false },
  { title: "The Apartment", author: "Billy Wilder", year: 1960, description: "Romantic comedy about an office worker lending his apartment.", genres: ["comedy", "romance", "newyear"], rating: 4.4, isBook: false },
  { title: "Ghostbusters II", author: "Ivan Reitman", year: 1989, description: "Comedy about ghostbusters saving New York on New Year's.", genres: ["comedy", "fantasy", "newyear"], rating: 4.0, isBook: false },
  { title: "Ocean's Eleven", author: "Steven Soderbergh", year: 2001, description: "Heist comedy about robbing casinos on New Year's Eve.", genres: ["comedy", "crime", "newyear"], rating: 4.2, isBook: false },
  { title: "Ocean's Twelve", author: "Steven Soderbergh", year: 2004, description: "Heist comedy sequel about a European robbery.", genres: ["comedy", "crime", "newyear"], rating: 4.0, isBook: false },
  { title: "Ocean's Thirteen", author: "Steven Soderbergh", year: 2007, description: "Heist comedy about revenge against a casino owner.", genres: ["comedy", "crime", "newyear"], rating: 4.1, isBook: false },
  
  // Summer Movies
  { title: "Jaws", author: "Steven Spielberg", year: 1975, description: "Thriller about a shark terrorizing a beach town.", genres: ["thriller", "horror", "summer"], rating: 4.5, isBook: false },
  { title: "The Sandlot", author: "David Mickey Evans", year: 1993, description: "Comedy about kids playing baseball during summer.", genres: ["comedy", "family", "summer"], rating: 4.3, isBook: false },
  { title: "Stand by Me", author: "Rob Reiner", year: 1986, description: "Drama about four friends on a summer adventure.", genres: ["drama", "adventure", "summer"], rating: 4.4, isBook: false },
  { title: "The Goonies", author: "Richard Donner", year: 1985, description: "Adventure comedy about kids searching for pirate treasure.", genres: ["adventure", "comedy", "summer"], rating: 4.3, isBook: false },
  { title: "E.T. the Extra-Terrestrial", author: "Steven Spielberg", year: 1982, description: "Sci-fi adventure about a boy helping an alien go home.", genres: ["sci-fi", "adventure", "summer"], rating: 4.6, isBook: false },
  { title: "Jurassic Park", author: "Steven Spielberg", year: 1993, description: "Sci-fi adventure about dinosaurs in a theme park.", genres: ["sci-fi", "adventure", "summer"], rating: 4.7, isBook: false },
  { title: "Independence Day", author: "Roland Emmerich", year: 1996, description: "Sci-fi action about aliens attacking Earth on July 4th.", genres: ["sci-fi", "action", "summer"], rating: 4.3, isBook: false },
  { title: "Men in Black", author: "Barry Sonnenfeld", year: 1997, description: "Sci-fi comedy about secret agents protecting Earth from aliens.", genres: ["sci-fi", "comedy", "summer"], rating: 4.2, isBook: false },
  { title: "Armageddon", author: "Michael Bay", year: 1998, description: "Sci-fi action about drilling into an asteroid to save Earth.", genres: ["sci-fi", "action", "summer"], rating: 4.1, isBook: false },
  { title: "Deep Impact", author: "Mimi Leder", year: 1998, description: "Sci-fi drama about a comet heading toward Earth.", genres: ["sci-fi", "drama", "summer"], rating: 4.0, isBook: false },
  { title: "The Parent Trap", author: "Nancy Meyers", year: 1998, description: "Comedy about twin sisters reuniting their divorced parents.", genres: ["comedy", "family", "summer"], rating: 4.2, isBook: false },
  { title: "Mamma Mia!", author: "Phyllida Lloyd", year: 2008, description: "Musical comedy about a daughter finding her father.", genres: ["musical", "comedy", "summer"], rating: 4.1, isBook: false },
  { title: "Mamma Mia! Here We Go Again", author: "Ol Parker", year: 2018, description: "Musical comedy sequel about love and family.", genres: ["musical", "comedy", "summer"], rating: 4.0, isBook: false },
  { title: "The Sisterhood of the Traveling Pants", author: "Ken Kwapis", year: 2005, description: "Drama about four friends sharing a magical pair of jeans.", genres: ["drama", "romance", "summer"], rating: 4.0, isBook: false },
  { title: "The Sisterhood of the Traveling Pants 2", author: "Sanaa Hamri", year: 2008, description: "Drama sequel about the friends' college experiences.", genres: ["drama", "romance", "summer"], rating: 3.9, isBook: false },
  { title: "Dirty Dancing", author: "Emile Ardolino", year: 1987, description: "Romantic drama about a summer romance at a resort.", genres: ["drama", "romance", "summer"], rating: 4.3, isBook: false },
  { title: "Grease", author: "Randal Kleiser", year: 1978, description: "Musical about summer love and high school romance.", genres: ["musical", "romance", "summer"], rating: 4.4, isBook: false },
  { title: "The Notebook", author: "Nick Cassavetes", year: 2004, description: "Romantic drama about a couple's love story.", genres: ["drama", "romance", "summer"], rating: 4.4, isBook: false },
  { title: "Call Me by Your Name", author: "Luca Guadagnino", year: 2017, description: "Romantic drama about a summer romance in Italy.", genres: ["drama", "romance", "summer"], rating: 4.3, isBook: false },
  { title: "The Way Way Back", author: "Nat Faxon", year: 2013, description: "Comedy-drama about a boy's summer at a water park.", genres: ["comedy", "drama", "summer"], rating: 4.1, isBook: false },
  { title: "Adventureland", author: "Greg Mottola", year: 2009, description: "Comedy-drama about working at an amusement park.", genres: ["comedy", "drama", "summer"], rating: 4.0, isBook: false },
  { title: "The Kings of Summer", author: "Jordan Vogt-Roberts", year: 2013, description: "Comedy about three friends building a house in the woods.", genres: ["comedy", "drama", "summer"], rating: 4.0, isBook: false },
  { title: "Moonrise Kingdom", author: "Wes Anderson", year: 2012, description: "Comedy-drama about young love on a New England island.", genres: ["comedy", "drama", "summer"], rating: 4.2, isBook: false },
  { title: "The Grand Budapest Hotel", author: "Wes Anderson", year: 2014, description: "Comedy about a concierge and his lobby boy.", genres: ["comedy", "adventure", "summer"], rating: 4.3, isBook: false },
  { title: "The Secret Life of Walter Mitty", author: "Ben Stiller", year: 2013, description: "Adventure comedy about a daydreamer's real adventure.", genres: ["adventure", "comedy", "summer"], rating: 4.1, isBook: false },
  { title: "Into the Wild", author: "Sean Penn", year: 2007, description: "Drama about a young man's journey into the wilderness.", genres: ["drama", "adventure", "summer"], rating: 4.3, isBook: false },
  { title: "Wild", author: "Jean-Marc Vallée", year: 2014, description: "Drama about a woman hiking the Pacific Crest Trail.", genres: ["drama", "adventure", "summer"], rating: 4.2, isBook: false },
  { title: "127 Hours", author: "Danny Boyle", year: 2010, description: "Drama about a hiker trapped in a canyon.", genres: ["drama", "adventure", "summer"], rating: 4.1, isBook: false },
  { title: "The Beach", author: "Danny Boyle", year: 2000, description: "Drama about backpackers finding a hidden paradise.", genres: ["drama", "adventure", "summer"], rating: 4.0, isBook: false },
  { title: "The Descendants", author: "Alexander Payne", year: 2011, description: "Drama about a father reconnecting with his daughters.", genres: ["drama", "family", "summer"], rating: 4.2, isBook: false },
  { title: "The Secret Garden", author: "Agnieszka Holland", year: 1993, description: "Drama about an orphan discovering a magical garden.", genres: ["drama", "fantasy", "summer"], rating: 4.1, isBook: false },
  { title: "A Little Princess", author: "Alfonso Cuarón", year: 1995, description: "Drama about a girl's imagination during difficult times.", genres: ["drama", "fantasy", "summer"], rating: 4.2, isBook: false },
  { title: "The Princess Diaries", author: "Garry Marshall", year: 2001, description: "Comedy about a teenager discovering she's a princess.", genres: ["comedy", "family", "summer"], rating: 4.1, isBook: false },
  { title: "The Princess Diaries 2: Royal Engagement", author: "Garry Marshall", year: 2004, description: "Comedy sequel about a princess finding love.", genres: ["comedy", "romance", "summer"], rating: 3.9, isBook: false },
  { title: "Ella Enchanted", author: "Tommy O'Haver", year: 2004, description: "Fantasy comedy about a girl cursed with obedience.", genres: ["fantasy", "comedy", "summer"], rating: 4.0, isBook: false },
  { title: "Enchanted", author: "Kevin Lima", year: 2007, description: "Fantasy comedy about a princess in modern New York.", genres: ["fantasy", "comedy", "summer"], rating: 4.2, isBook: false },
  { title: "The Princess and the Frog", author: "Ron Clements", year: 2009, description: "Animated musical about a princess turned into a frog.", genres: ["animation", "musical", "summer"], rating: 4.1, isBook: false },
  { title: "Tangled", author: "Nathan Greno", year: 2010, description: "Animated musical about Rapunzel's adventure.", genres: ["animation", "musical", "summer"], rating: 4.3, isBook: false },
  { title: "Brave", author: "Mark Andrews", year: 2012, description: "Animated adventure about a Scottish princess.", genres: ["animation", "adventure", "summer"], rating: 4.2, isBook: false },
  { title: "Frozen", author: "Chris Buck", year: 2013, description: "Animated musical about two sisters and magical powers.", genres: ["animation", "musical", "summer"], rating: 4.4, isBook: false },
  { title: "Frozen II", author: "Chris Buck", year: 2019, description: "Animated musical sequel about discovering the past.", genres: ["animation", "musical", "summer"], rating: 4.1, isBook: false },
  { title: "Moana", author: "Ron Clements", year: 2016, description: "Animated musical about a Polynesian princess's ocean journey.", genres: ["animation", "musical", "summer"], rating: 4.3, isBook: false },
  { title: "Raya and the Last Dragon", author: "Don Hall", year: 2021, description: "Animated adventure about a warrior and the last dragon.", genres: ["animation", "adventure", "summer"], rating: 4.1, isBook: false },
  { title: "Encanto", author: "Jared Bush", year: 2021, description: "Animated musical about a magical family in Colombia.", genres: ["animation", "musical", "summer"], rating: 4.3, isBook: false },
  { title: "Turning Red", author: "Domee Shi", year: 2022, description: "Animated comedy about a girl turning into a red panda.", genres: ["animation", "comedy", "summer"], rating: 4.1, isBook: false },
  { title: "Elemental", author: "Peter Sohn", year: 2023, description: "Animated fantasy romance about elemental beings.", genres: ["animation", "fantasy", "summer"], rating: 4.0, isBook: false },
  { title: "Wish", author: "Chris Buck", year: 2023, description: "Animated musical fantasy about wishes.", genres: ["animation", "musical", "summer"], rating: 3.8, isBook: false },
  
  // Women-Focused & Female-Directed Movies
  // Female Directors & Women-Centric Stories
  { title: "Little Women", author: "Greta Gerwig", year: 2019, description: "A modern retelling of Louisa May Alcott's classic about four sisters.", genres: ["drama", "historical", "family"], rating: 4.3, isBook: false },
  { title: "Lady Bird", author: "Greta Gerwig", year: 2017, description: "A coming-of-age story about a teenage girl navigating her senior year.", genres: ["drama", "coming-of-age", "family"], rating: 4.2, isBook: false },
  { title: "Barbie", author: "Greta Gerwig", year: 2023, description: "A fantasy comedy about Barbie discovering the real world.", genres: ["comedy", "fantasy", "feminism"], rating: 4.1, isBook: false },
  { title: "Frances Ha", author: "Noah Baumbach", year: 2012, description: "A comedy-drama about a 27-year-old dancer trying to find her place.", genres: ["comedy", "drama", "coming-of-age"], rating: 4.0, isBook: false },
  { title: "Mistress America", author: "Noah Baumbach", year: 2015, description: "A comedy about a college freshman and her soon-to-be stepsister.", genres: ["comedy", "drama", "family"], rating: 3.9, isBook: false },
  { title: "Lost in Translation", author: "Sofia Coppola", year: 2003, description: "A drama about two Americans forming a bond in Tokyo.", genres: ["drama", "romance", "travel"], rating: 4.3, isBook: false },
  { title: "The Virgin Suicides", author: "Sofia Coppola", year: 1999, description: "A drama about five sisters in 1970s Michigan.", genres: ["drama", "coming-of-age", "mystery"], rating: 4.1, isBook: false },
  { title: "Marie Antoinette", author: "Sofia Coppola", year: 2006, description: "A historical drama about the life of Marie Antoinette.", genres: ["drama", "historical", "biography"], rating: 4.0, isBook: false },
  { title: "Somewhere", author: "Sofia Coppola", year: 2010, description: "A drama about a movie star and his daughter in Los Angeles.", genres: ["drama", "family", "hollywood"], rating: 3.8, isBook: false },
  { title: "The Bling Ring", author: "Sofia Coppola", year: 2013, description: "A crime drama about teenagers robbing celebrities.", genres: ["crime", "drama", "teen"], rating: 3.7, isBook: false },
  { title: "The Beguiled", author: "Sofia Coppola", year: 2017, description: "A thriller about a wounded soldier taken in by a girls' school.", genres: ["thriller", "drama", "historical"], rating: 3.9, isBook: false },
  { title: "On the Rocks", author: "Sofia Coppola", year: 2020, description: "A comedy-drama about a woman investigating her husband with her father.", genres: ["comedy", "drama", "family"], rating: 3.8, isBook: false },
  { title: "Priscilla", author: "Sofia Coppola", year: 2023, description: "A biographical drama about Priscilla Presley's life with Elvis.", genres: ["drama", "biography", "romance"], rating: 4.0, isBook: false },
  { title: "The Hurt Locker", author: "Kathryn Bigelow", year: 2008, description: "A war drama about a bomb disposal team in Iraq.", genres: ["war", "drama", "action"], rating: 4.4, isBook: false },
  { title: "Zero Dark Thirty", author: "Kathryn Bigelow", year: 2012, description: "A thriller about the hunt for Osama bin Laden.", genres: ["thriller", "drama", "war"], rating: 4.2, isBook: false },
  { title: "Point Break", author: "Kathryn Bigelow", year: 1991, description: "An action thriller about an FBI agent infiltrating a surfing gang.", genres: ["action", "thriller", "crime"], rating: 4.1, isBook: false },
  { title: "Strange Days", author: "Kathryn Bigelow", year: 1995, description: "A sci-fi thriller about virtual reality and crime.", genres: ["sci-fi", "thriller", "crime"], rating: 4.0, isBook: false },
  { title: "Near Dark", author: "Kathryn Bigelow", year: 1987, description: "A horror western about a vampire family.", genres: ["horror", "western", "romance"], rating: 3.9, isBook: false },
  { title: "Blue Steel", author: "Kathryn Bigelow", year: 1990, description: "A thriller about a female police officer.", genres: ["thriller", "crime", "drama"], rating: 3.8, isBook: false },
  { title: "The Weight of Water", author: "Kathryn Bigelow", year: 2000, description: "A thriller about a photographer investigating a murder.", genres: ["thriller", "mystery", "drama"], rating: 3.7, isBook: false },
  { title: "K-19: The Widowmaker", author: "Kathryn Bigelow", year: 2002, description: "A war drama about a Soviet submarine crew.", genres: ["war", "drama", "historical"], rating: 3.8, isBook: false },
  { title: "Detroit", author: "Kathryn Bigelow", year: 2017, description: "A crime drama about the 1967 Detroit riots.", genres: ["crime", "drama", "historical"], rating: 4.0, isBook: false },
  { title: "Frida", author: "Julie Taymor", year: 2002, description: "A biographical drama about artist Frida Kahlo.", genres: ["drama", "biography", "art"], rating: 4.2, isBook: false },
  { title: "Across the Universe", author: "Julie Taymor", year: 2007, description: "A musical drama set to Beatles songs.", genres: ["musical", "drama", "romance"], rating: 4.0, isBook: false },
  { title: "The Tempest", author: "Julie Taymor", year: 2010, description: "A fantasy drama adaptation of Shakespeare's play.", genres: ["fantasy", "drama", "shakespeare"], rating: 3.8, isBook: false },
  { title: "Gloria Bell", author: "Sebastián Lelio", year: 2018, description: "A drama about a free-spirited woman in her 50s.", genres: ["drama", "romance", "comedy"], rating: 4.1, isBook: false },
  { title: "A Fantastic Woman", author: "Sebastián Lelio", year: 2017, description: "A drama about a transgender woman dealing with loss.", genres: ["drama", "lgbtq", "romance"], rating: 4.3, isBook: false },
  { title: "Disobedience", author: "Sebastián Lelio", year: 2017, description: "A drama about a woman returning to her Orthodox Jewish community.", genres: ["drama", "romance", "lgbtq"], rating: 4.0, isBook: false },
  { title: "The Wonder", author: "Sebastián Lelio", year: 2022, description: "A drama about a nurse investigating a miracle in 1860s Ireland.", genres: ["drama", "mystery", "historical"], rating: 3.9, isBook: false },
  { title: "The Babadook", author: "Jennifer Kent", year: 2014, description: "A horror film about a mother and son haunted by a monster.", genres: ["horror", "drama", "psychological"], rating: 4.2, isBook: false },
  { title: "The Nightingale", author: "Jennifer Kent", year: 2018, description: "A revenge thriller set in 1825 Tasmania.", genres: ["thriller", "drama", "historical"], rating: 4.1, isBook: false },
  { title: "Monster", author: "Patty Jenkins", year: 2003, description: "A biographical crime drama about serial killer Aileen Wuornos.", genres: ["crime", "drama", "biography"], rating: 4.3, isBook: false },
  { title: "Wonder Woman", author: "Patty Jenkins", year: 2017, description: "A superhero film about Wonder Woman in World War I.", genres: ["action", "adventure", "superhero"], rating: 4.2, isBook: false },
  { title: "Wonder Woman 1984", author: "Patty Jenkins", year: 2020, description: "A superhero sequel set in the 1980s.", genres: ["action", "adventure", "superhero"], rating: 3.8, isBook: false },
  { title: "American Psycho", author: "Mary Harron", year: 2000, description: "A psychological thriller about a wealthy investment banker.", genres: ["thriller", "horror", "psychological"], rating: 4.1, isBook: false },
  { title: "The Notorious Bettie Page", author: "Mary Harron", year: 2005, description: "A biographical drama about pin-up model Bettie Page.", genres: ["drama", "biography", "historical"], rating: 3.9, isBook: false },
  { title: "The Moth Diaries", author: "Mary Harron", year: 2011, description: "A horror film about a boarding school student.", genres: ["horror", "drama", "psychological"], rating: 3.7, isBook: false },
  { title: "Charlie Says", author: "Mary Harron", year: 2018, description: "A drama about the Manson Family women.", genres: ["drama", "crime", "biography"], rating: 3.6, isBook: false },
  { title: "The Piano", author: "Jane Campion", year: 1993, description: "A drama about a mute woman and her daughter in 19th century New Zealand.", genres: ["drama", "romance", "historical"], rating: 4.4, isBook: false },
  { title: "The Portrait of a Lady", author: "Jane Campion", year: 1996, description: "A drama adaptation of Henry James's novel.", genres: ["drama", "romance", "historical"], rating: 4.0, isBook: false },
  { title: "Holy Smoke!", author: "Jane Campion", year: 1999, description: "A drama about a cult deprogrammer and his patient.", genres: ["drama", "romance", "psychological"], rating: 3.8, isBook: false },
  { title: "In the Cut", author: "Jane Campion", year: 2003, description: "A thriller about a teacher investigating a murder.", genres: ["thriller", "drama", "mystery"], rating: 3.7, isBook: false },
  { title: "Bright Star", author: "Jane Campion", year: 2009, description: "A biographical drama about poet John Keats.", genres: ["drama", "romance", "biography"], rating: 4.1, isBook: false },
  { title: "The Power of the Dog", author: "Jane Campion", year: 2021, description: "A western drama about two brothers in 1920s Montana.", genres: ["western", "drama", "psychological"], rating: 4.3, isBook: false },
  { title: "The Water Diary", author: "Jane Campion", year: 2006, description: "A short film about climate change.", genres: ["short", "drama", "environmental"], rating: 3.8, isBook: false },
  { title: "The Party", author: "Sally Potter", year: 2017, description: "A comedy-drama about a political party gone wrong.", genres: ["comedy", "drama", "satire"], rating: 4.0, isBook: false },
  { title: "Orlando", author: "Sally Potter", year: 1992, description: "A fantasy drama about a nobleman who lives for centuries.", genres: ["fantasy", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "The Tango Lesson", author: "Sally Potter", year: 1997, description: "A drama about a filmmaker learning to tango.", genres: ["drama", "romance", "dance"], rating: 3.9, isBook: false },
  { title: "Yes", author: "Sally Potter", year: 2004, description: "A drama about a love affair between a scientist and a chef.", genres: ["drama", "romance", "poetry"], rating: 3.7, isBook: false },
  { title: "Rage", author: "Sally Potter", year: 2009, description: "A drama about a fashion show gone wrong.", genres: ["drama", "satire", "fashion"], rating: 3.6, isBook: false },
  { title: "Ginger & Rosa", author: "Sally Potter", year: 2012, description: "A drama about two teenage friends during the Cuban Missile Crisis.", genres: ["drama", "coming-of-age", "historical"], rating: 3.8, isBook: false },
  { title: "The Roads Not Taken", author: "Sally Potter", year: 2020, description: "A drama about a man with dementia and his daughter.", genres: ["drama", "family", "medical"], rating: 3.7, isBook: false },
  { title: "Lost in La Mancha", author: "Keith Fulton", year: 2002, description: "A documentary about Terry Gilliam's failed Don Quixote film.", genres: ["documentary", "film", "behind-the-scenes"], rating: 4.1, isBook: false },
  { title: "The Hours", author: "Stephen Daldry", year: 2002, description: "A drama about three women connected by Virginia Woolf's novel.", genres: ["drama", "literary", "feminism"], rating: 4.3, isBook: false },
  { title: "Billy Elliot", author: "Stephen Daldry", year: 2000, description: "A drama about a boy who wants to become a ballet dancer.", genres: ["drama", "dance", "coming-of-age"], rating: 4.2, isBook: false },
  { title: "The Reader", author: "Stephen Daldry", year: 2008, description: "A drama about a young man's affair with an older woman.", genres: ["drama", "romance", "historical"], rating: 4.1, isBook: false },
  { title: "Extremely Loud & Incredibly Close", author: "Stephen Daldry", year: 2011, description: "A drama about a boy searching for meaning after 9/11.", genres: ["drama", "family", "mystery"], rating: 3.9, isBook: false },
  { title: "Trash", author: "Stephen Daldry", year: 2014, description: "A drama about three boys finding a wallet in a Brazilian favela.", genres: ["drama", "adventure", "social"], rating: 3.8, isBook: false },
  { title: "The Crown", author: "Various", year: 2016, description: "A drama series about Queen Elizabeth II's reign.", genres: ["drama", "historical", "biography"], rating: 4.4, isBook: false },
  { title: "The Handmaid's Tale", author: "Various", year: 2017, description: "A dystopian drama about women in a totalitarian society.", genres: ["drama", "dystopian", "feminism"], rating: 4.5, isBook: false },
  { title: "Big Little Lies", author: "Various", year: 2017, description: "A drama about wealthy women in Monterey, California.", genres: ["drama", "mystery", "feminism"], rating: 4.3, isBook: false },
  { title: "Killing Eve", author: "Various", year: 2018, description: "A thriller about a security service agent and an assassin.", genres: ["thriller", "drama", "crime"], rating: 4.2, isBook: false },
  { title: "Fleabag", author: "Various", year: 2016, description: "A comedy-drama about a young woman navigating life in London.", genres: ["comedy", "drama", "feminism"], rating: 4.4, isBook: false },
  { title: "I May Destroy You", author: "Michaela Coel", year: 2020, description: "A drama about a writer dealing with sexual assault.", genres: ["drama", "feminism", "social"], rating: 4.3, isBook: false },
  { title: "Chewing Gum", author: "Michaela Coel", year: 2015, description: "A comedy about a young woman exploring her sexuality.", genres: ["comedy", "coming-of-age", "feminism"], rating: 4.1, isBook: false },
  { title: "Normal People", author: "Lenny Abrahamson", year: 2020, description: "A drama about the complex relationship between two teenagers.", genres: ["drama", "romance", "coming-of-age"], rating: 4.3, isBook: false },
  { title: "Conversations with Friends", author: "Lenny Abrahamson", year: 2022, description: "A drama about two college students and their relationships.", genres: ["drama", "romance", "coming-of-age"], rating: 4.0, isBook: false },
  { title: "The Queen's Gambit", author: "Scott Frank", year: 2020, description: "A drama about an orphaned chess prodigy.", genres: ["drama", "sports", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "Unorthodox", author: "Maria Schrader", year: 2020, description: "A drama about a woman leaving her ultra-Orthodox Jewish community.", genres: ["drama", "feminism", "religious"], rating: 4.2, isBook: false },
  { title: "The Undoing", author: "Susanne Bier", year: 2020, description: "A thriller about a therapist whose life unravels.", genres: ["thriller", "drama", "mystery"], rating: 4.1, isBook: false },
  { title: "The Night Manager", author: "Susanne Bier", year: 2016, description: "A thriller about a hotel manager infiltrating an arms dealer's organization.", genres: ["thriller", "drama", "espionage"], rating: 4.2, isBook: false },
  { title: "Bird Box", author: "Susanne Bier", year: 2018, description: "A horror thriller about a mother protecting her children from supernatural entities.", genres: ["horror", "thriller", "post-apocalyptic"], rating: 4.0, isBook: false },
  { title: "The Good Place", author: "Michael Schur", year: 2016, description: "A comedy about a woman who wakes up in the afterlife.", genres: ["comedy", "fantasy", "philosophy"], rating: 4.4, isBook: false },
  { title: "Parks and Recreation", author: "Various", year: 2009, description: "A comedy about government employees in a small town.", genres: ["comedy", "satire", "government"], rating: 4.3, isBook: false },
  { title: "30 Rock", author: "Tina Fey", year: 2006, description: "A comedy about the behind-the-scenes of a sketch comedy show.", genres: ["comedy", "satire", "television"], rating: 4.2, isBook: false },
  { title: "Unbreakable Kimmy Schmidt", author: "Tina Fey", year: 2015, description: "A comedy about a woman adjusting to life after being rescued from a cult.", genres: ["comedy", "satire", "feminism"], rating: 4.1, isBook: false },
  { title: "Girls", author: "Lena Dunham", year: 2012, description: "A comedy-drama about four young women in New York City.", genres: ["comedy", "drama", "feminism"], rating: 4.0, isBook: false },
  { title: "Camping", author: "Lena Dunham", year: 2018, description: "A comedy about a group of friends on a camping trip.", genres: ["comedy", "drama", "friendship"], rating: 3.8, isBook: false },
  { title: "Sharp Objects", author: "Jean-Marc Vallée", year: 2018, description: "A thriller about a journalist investigating murders in her hometown.", genres: ["thriller", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "Gone Girl", author: "David Fincher", year: 2014, description: "A thriller about a man whose wife disappears.", genres: ["thriller", "drama", "mystery"], rating: 4.3, isBook: false },
  { title: "Wild", author: "Jean-Marc Vallée", year: 2014, description: "A drama about a woman hiking the Pacific Crest Trail.", genres: ["drama", "adventure", "biography"], rating: 4.2, isBook: false },
  { title: "Dallas Buyers Club", author: "Jean-Marc Vallée", year: 2013, description: "A biographical drama about a man with AIDS.", genres: ["drama", "biography", "medical"], rating: 4.3, isBook: false },
  { title: "The Young Victoria", author: "Jean-Marc Vallée", year: 2009, description: "A biographical drama about Queen Victoria's early reign.", genres: ["drama", "biography", "historical"], rating: 4.1, isBook: false },
  { title: "Café de Flore", author: "Jean-Marc Vallée", year: 2011, description: "A drama about love and destiny across time.", genres: ["drama", "romance", "fantasy"], rating: 4.0, isBook: false },
  { title: "Demolition", author: "Jean-Marc Vallée", year: 2015, description: "A drama about a man's emotional breakdown after his wife's death.", genres: ["drama", "comedy", "grief"], rating: 3.9, isBook: false },
  { title: "Big Little Lies", author: "Jean-Marc Vallée", year: 2017, description: "A drama about wealthy women in Monterey, California.", genres: ["drama", "mystery", "feminism"], rating: 4.3, isBook: false },
  { title: "Sharp Objects", author: "Jean-Marc Vallée", year: 2018, description: "A thriller about a journalist investigating murders in her hometown.", genres: ["thriller", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "The Undoing", author: "Susanne Bier", year: 2020, description: "A thriller about a therapist whose life unravels.", genres: ["thriller", "drama", "mystery"], rating: 4.1, isBook: false },
  { title: "The Night Manager", author: "Susanne Bier", year: 2016, description: "A thriller about a hotel manager infiltrating an arms dealer's organization.", genres: ["thriller", "drama", "espionage"], rating: 4.2, isBook: false },
  { title: "Bird Box", author: "Susanne Bier", year: 2018, description: "A horror thriller about a mother protecting her children from supernatural entities.", genres: ["horror", "thriller", "post-apocalyptic"], rating: 4.0, isBook: false },
  { title: "The Good Place", author: "Michael Schur", year: 2016, description: "A comedy about a woman who wakes up in the afterlife.", genres: ["comedy", "fantasy", "philosophy"], rating: 4.4, isBook: false },
  { title: "Parks and Recreation", author: "Various", year: 2009, description: "A comedy about government employees in a small town.", genres: ["comedy", "satire", "government"], rating: 4.3, isBook: false },
  { title: "30 Rock", author: "Tina Fey", year: 2006, description: "A comedy about the behind-the-scenes of a sketch comedy show.", genres: ["comedy", "satire", "television"], rating: 4.2, isBook: false },
  { title: "Unbreakable Kimmy Schmidt", author: "Tina Fey", year: 2015, description: "A comedy about a woman adjusting to life after being rescued from a cult.", genres: ["comedy", "satire", "feminism"], rating: 4.1, isBook: false },
  { title: "Girls", author: "Lena Dunham", year: 2012, description: "A comedy-drama about four young women in New York City.", genres: ["comedy", "drama", "feminism"], rating: 4.0, isBook: false },
  { title: "Camping", author: "Lena Dunham", year: 2018, description: "A comedy about a group of friends on a camping trip.", genres: ["comedy", "drama", "friendship"], rating: 3.8, isBook: false },
  { title: "Sharp Objects", author: "Jean-Marc Vallée", year: 2018, description: "A thriller about a journalist investigating murders in her hometown.", genres: ["thriller", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "Gone Girl", author: "David Fincher", year: 2014, description: "A thriller about a man whose wife disappears.", genres: ["thriller", "drama", "mystery"], rating: 4.3, isBook: false },
  { title: "Wild", author: "Jean-Marc Vallée", year: 2014, description: "A drama about a woman hiking the Pacific Crest Trail.", genres: ["drama", "adventure", "biography"], rating: 4.2, isBook: false },
  { title: "Dallas Buyers Club", author: "Jean-Marc Vallée", year: 2013, description: "A biographical drama about a man with AIDS.", genres: ["drama", "biography", "medical"], rating: 4.3, isBook: false },
  { title: "The Young Victoria", author: "Jean-Marc Vallée", year: 2009, description: "A biographical drama about Queen Victoria's early reign.", genres: ["drama", "biography", "historical"], rating: 4.1, isBook: false },
  { title: "Café de Flore", author: "Jean-Marc Vallée", year: 2011, description: "A drama about love and destiny across time.", genres: ["drama", "romance", "fantasy"], rating: 4.0, isBook: false },
  { title: "Demolition", author: "Jean-Marc Vallée", year: 2015, description: "A drama about a man's emotional breakdown after his wife's death.", genres: ["drama", "comedy", "grief"], rating: 3.9, isBook: false },
  
  // Priority Level 1: Documentary Films
  { title: "Planet Earth", author: "Alastair Fothergill", year: 2006, description: "A groundbreaking nature documentary series about Earth's ecosystems.", genres: ["documentary", "nature", "environmental"], rating: 4.8, isBook: false },
  { title: "Blue Planet", author: "Alastair Fothergill", year: 2001, description: "A documentary series exploring the world's oceans and marine life.", genres: ["documentary", "nature", "ocean"], rating: 4.7, isBook: false },
  { title: "Cosmos: A Spacetime Odyssey", author: "Ann Druyan", year: 2014, description: "A documentary series exploring the universe and scientific discoveries.", genres: ["documentary", "science", "space"], rating: 4.6, isBook: false },
  { title: "The Last Dance", author: "Jason Hehir", year: 2020, description: "A documentary about Michael Jordan and the Chicago Bulls dynasty.", genres: ["documentary", "sports", "basketball"], rating: 4.5, isBook: false },
  { title: "Making a Murderer", author: "Laura Ricciardi", year: 2015, description: "A true crime documentary about Steven Avery's case.", genres: ["documentary", "true crime", "legal"], rating: 4.4, isBook: false },
  { title: "The Jinx", author: "Andrew Jarecki", year: 2015, description: "A documentary about real estate heir Robert Durst and his alleged crimes.", genres: ["documentary", "true crime", "mystery"], rating: 4.3, isBook: false },
  { title: "13th", author: "Ava DuVernay", year: 2016, description: "A documentary about racial inequality in the American criminal justice system.", genres: ["documentary", "social justice", "race"], rating: 4.5, isBook: false },
  { title: "Won't You Be My Neighbor?", author: "Morgan Neville", year: 2018, description: "A documentary about Fred Rogers and his impact on children's television.", genres: ["documentary", "biography", "television"], rating: 4.4, isBook: false },
  { title: "Free Solo", author: "Elizabeth Chai Vasarhelyi", year: 2018, description: "A documentary about Alex Honnold's free solo climb of El Capitan.", genres: ["documentary", "adventure", "sports"], rating: 4.6, isBook: false },
  { title: "The Act of Killing", author: "Joshua Oppenheimer", year: 2012, description: "A documentary about Indonesian death squad leaders reenacting their crimes.", genres: ["documentary", "history", "war"], rating: 4.3, isBook: false },
  { title: "Citizenfour", author: "Laura Poitras", year: 2014, description: "A documentary about Edward Snowden and government surveillance.", genres: ["documentary", "politics", "technology"], rating: 4.4, isBook: false },
  { title: "Amy", author: "Asif Kapadia", year: 2015, description: "A documentary about the life and death of singer Amy Winehouse.", genres: ["documentary", "biography", "music"], rating: 4.3, isBook: false },
  { title: "Searching for Sugar Man", author: "Malik Bendjelloul", year: 2012, description: "A documentary about the search for musician Rodriguez.", genres: ["documentary", "music", "mystery"], rating: 4.4, isBook: false },
  { title: "Man on Wire", author: "James Marsh", year: 2008, description: "A documentary about Philippe Petit's high-wire walk between the Twin Towers.", genres: ["documentary", "adventure", "art"], rating: 4.5, isBook: false },
  { title: "March of the Penguins", author: "Luc Jacquet", year: 2005, description: "A documentary about emperor penguins' annual journey.", genres: ["documentary", "nature", "family"], rating: 4.2, isBook: false },
  
  // Priority Level 1: Educational Films
  { title: "Inside Out", author: "Pete Docter", year: 2015, description: "An animated film about emotions and mental health for all ages.", genres: ["animation", "educational", "mental health"], rating: 4.4, isBook: false },
  { title: "The Theory of Everything", author: "James Marsh", year: 2014, description: "A biographical drama about physicist Stephen Hawking.", genres: ["drama", "biography", "science"], rating: 4.2, isBook: false },
  { title: "Hidden Figures", author: "Theodore Melfi", year: 2016, description: "A drama about African American women mathematicians at NASA.", genres: ["drama", "history", "science"], rating: 4.3, isBook: false },
  { title: "The Imitation Game", author: "Morten Tyldum", year: 2014, description: "A drama about Alan Turing and the breaking of the Enigma code.", genres: ["drama", "biography", "technology"], rating: 4.2, isBook: false },
  { title: "A Beautiful Mind", author: "Ron Howard", year: 2001, description: "A biographical drama about mathematician John Nash.", genres: ["drama", "biography", "mental health"], rating: 4.3, isBook: false },
  { title: "Good Will Hunting", author: "Gus Van Sant", year: 1997, description: "A drama about a mathematical genius working through personal issues.", genres: ["drama", "mental health", "education"], rating: 4.4, isBook: false },
  { title: "Dead Poets Society", author: "Peter Weir", year: 1989, description: "A drama about an English teacher inspiring his students through poetry.", genres: ["drama", "education", "poetry"], rating: 4.3, isBook: false },
  { title: "Stand and Deliver", author: "Ramón Menéndez", year: 1988, description: "A drama about a math teacher helping underprivileged students.", genres: ["drama", "education", "inspiration"], rating: 4.2, isBook: false },
  { title: "Freedom Writers", author: "Richard LaGravenese", year: 2007, description: "A drama about a teacher helping at-risk students through writing.", genres: ["drama", "education", "social justice"], rating: 4.1, isBook: false },
  { title: "The Ron Clark Story", author: "Randa Haines", year: 2006, description: "A drama about an innovative teacher working with challenging students.", genres: ["drama", "education", "inspiration"], rating: 4.0, isBook: false },
  
  // Priority Level 1: International Cinema
  { title: "Parasite", author: "Bong Joon-ho", year: 2019, description: "A South Korean thriller about class inequality.", genres: ["thriller", "drama", "social commentary"], rating: 4.7, isBook: false },
  { title: "Roma", author: "Alfonso Cuarón", year: 2018, description: "A Mexican drama about a domestic worker in 1970s Mexico City.", genres: ["drama", "family", "social commentary"], rating: 4.5, isBook: false },
  { title: "Crouching Tiger, Hidden Dragon", author: "Ang Lee", year: 2000, description: "A Chinese martial arts fantasy film.", genres: ["fantasy", "martial arts", "romance"], rating: 4.4, isBook: false },
  { title: "Amélie", author: "Jean-Pierre Jeunet", year: 2001, description: "A French romantic comedy about a whimsical waitress.", genres: ["comedy", "romance", "fantasy"], rating: 4.5, isBook: false },
  { title: "Life Is Beautiful", author: "Roberto Benigni", year: 1997, description: "An Italian comedy-drama about a father protecting his son during the Holocaust.", genres: ["comedy", "drama", "war"], rating: 4.6, isBook: false },
  { title: "Cinema Paradiso", author: "Giuseppe Tornatore", year: 1988, description: "An Italian drama about a filmmaker's childhood memories.", genres: ["drama", "romance", "nostalgia"], rating: 4.5, isBook: false },
  { title: "The Secret in Their Eyes", author: "Juan José Campanella", year: 2009, description: "An Argentine thriller about a retired legal counselor.", genres: ["thriller", "drama", "mystery"], rating: 4.4, isBook: false },
  { title: "A Separation", author: "Asghar Farhadi", year: 2011, description: "An Iranian drama about a couple's divorce and its consequences.", genres: ["drama", "family", "social commentary"], rating: 4.5, isBook: false },
  { title: "The Hunt", author: "Thomas Vinterberg", year: 2012, description: "A Danish drama about a teacher falsely accused of abuse.", genres: ["drama", "social commentary", "justice"], rating: 4.3, isBook: false },
  { title: "The Lives of Others", author: "Florian Henckel von Donnersmarck", year: 2006, description: "A German drama about surveillance in East Germany.", genres: ["drama", "historical", "political"], rating: 4.6, isBook: false },
  { title: "Let the Right One In", author: "Tomas Alfredson", year: 2008, description: "A Swedish horror film about a bullied boy and a vampire girl.", genres: ["horror", "drama", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "The White Ribbon", author: "Michael Haneke", year: 2009, description: "A German drama about mysterious events in a small village.", genres: ["drama", "mystery", "historical"], rating: 4.3, isBook: false },
  { title: "The Diving Bell and the Butterfly", author: "Julian Schnabel", year: 2007, description: "A French drama about a paralyzed man's inner life.", genres: ["drama", "biography", "medical"], rating: 4.4, isBook: false },
  { title: "The Motorcycle Diaries", author: "Walter Salles", year: 2004, description: "A biographical drama about Che Guevara's journey across South America.", genres: ["drama", "biography", "travel"], rating: 4.3, isBook: false },
  { title: "Y Tu Mamá También", author: "Alfonso Cuarón", year: 2001, description: "A Mexican drama about two teenagers on a road trip.", genres: ["drama", "coming-of-age", "road trip"], rating: 4.2, isBook: false },
  
  // Priority Level 1: Independent Films
  { title: "Moonlight", author: "Barry Jenkins", year: 2016, description: "An independent drama about a young African American man's coming-of-age.", genres: ["drama", "coming-of-age", "lgbtq"], rating: 4.5, isBook: false },
  { title: "Lady Bird", author: "Greta Gerwig", year: 2017, description: "An independent coming-of-age comedy-drama about a teenage girl.", genres: ["comedy", "drama", "coming-of-age"], rating: 4.3, isBook: false },
  { title: "The Florida Project", author: "Sean Baker", year: 2017, description: "An independent drama about children living in a motel near Disney World.", genres: ["drama", "family", "social commentary"], rating: 4.2, isBook: false },
  { title: "Beasts of the Southern Wild", author: "Benh Zeitlin", year: 2012, description: "An independent fantasy drama about a young girl in Louisiana.", genres: ["fantasy", "drama", "coming-of-age"], rating: 4.1, isBook: false },
  { title: "Fruitvale Station", author: "Ryan Coogler", year: 2013, description: "An independent drama about the last day of Oscar Grant's life.", genres: ["drama", "biography", "social justice"], rating: 4.2, isBook: false },
  { title: "Short Term 12", author: "Destin Daniel Cretton", year: 2013, description: "An independent drama about a supervisor at a foster care facility.", genres: ["drama", "social work", "family"], rating: 4.3, isBook: false },
  { title: "The Spectacular Now", author: "James Ponsoldt", year: 2013, description: "An independent coming-of-age drama about high school seniors.", genres: ["drama", "romance", "coming-of-age"], rating: 4.1, isBook: false },
  { title: "The Way Way Back", author: "Nat Faxon", year: 2013, description: "An independent coming-of-age comedy-drama about a shy teenager.", genres: ["comedy", "drama", "coming-of-age"], rating: 4.0, isBook: false },
  { title: "The Perks of Being a Wallflower", author: "Stephen Chbosky", year: 2012, description: "An independent drama about a shy freshman in high school.", genres: ["drama", "coming-of-age", "mental health"], rating: 4.2, isBook: false },
  { title: "Mud", author: "Jeff Nichols", year: 2012, description: "An independent drama about two boys helping a fugitive.", genres: ["drama", "adventure", "coming-of-age"], rating: 4.1, isBook: false },
  { title: "Take Shelter", author: "Jeff Nichols", year: 2011, description: "An independent psychological thriller about a man's apocalyptic visions.", genres: ["thriller", "drama", "psychological"], rating: 4.0, isBook: false },
  { title: "Winter's Bone", author: "Debra Granik", year: 2010, description: "An independent drama about a girl searching for her missing father.", genres: ["drama", "mystery", "family"], rating: 4.2, isBook: false },
  { title: "Frozen River", author: "Courtney Hunt", year: 2008, description: "An independent drama about two women smuggling immigrants.", genres: ["drama", "crime", "social commentary"], rating: 4.1, isBook: false },
  { title: "The Station Agent", author: "Tom McCarthy", year: 2003, description: "An independent comedy-drama about a dwarf who inherits a train station.", genres: ["comedy", "drama", "friendship"], rating: 4.0, isBook: false },
  { title: "The Squid and the Whale", author: "Noah Baumbach", year: 2005, description: "An independent comedy-drama about a family's divorce.", genres: ["comedy", "drama", "family"], rating: 4.1, isBook: false },
  
  // Priority Level 1: Short Films
  { title: "Piper", author: "Alan Barillaro", year: 2016, description: "A Pixar short about a baby sandpiper learning to overcome fear.", genres: ["animation", "short", "family"], rating: 4.3, isBook: false },
  { title: "Bao", author: "Domee Shi", year: 2018, description: "A Pixar short about a Chinese-Canadian mother and her dumpling son.", genres: ["animation", "short", "family"], rating: 4.2, isBook: false },
  { title: "Kitbull", author: "Rosana Sullivan", year: 2019, description: "A Pixar short about an unlikely friendship between a cat and a pit bull.", genres: ["animation", "short", "friendship"], rating: 4.4, isBook: false },
  { title: "Float", author: "Bobby Rubio", year: 2019, description: "A Pixar short about a father and his son who can float.", genres: ["animation", "short", "family"], rating: 4.1, isBook: false },
  { title: "Loop", author: "Erica Milsom", year: 2020, description: "A Pixar short about two kids on a canoe trip.", genres: ["animation", "short", "friendship"], rating: 4.0, isBook: false },
  { title: "The Windshield Wiper", author: "Alberto Mielgo", year: 2021, description: "An animated short exploring the nature of love.", genres: ["animation", "short", "romance"], rating: 4.2, isBook: false },
  { title: "The Boy, the Mole, the Fox and the Horse", author: "Charlie Mackesy", year: 2022, description: "An animated short about friendship and kindness.", genres: ["animation", "short", "friendship"], rating: 4.3, isBook: false },
  { title: "Ice Merchants", author: "João Gonzalez", year: 2022, description: "An animated short about a father and son who sell ice.", genres: ["animation", "short", "family"], rating: 4.1, isBook: false },
  { title: "The Flying Sailor", author: "Wendy Tilby", year: 2022, description: "An animated short about a sailor's surreal experience.", genres: ["animation", "short", "surreal"], rating: 4.0, isBook: false },
  { title: "My Year of Dicks", author: "Sara Gunnarsdóttir", year: 2022, description: "An animated short about a teenage girl's dating experiences.", genres: ["animation", "short", "coming-of-age"], rating: 4.1, isBook: false },
  
  // Priority Level 2: Science Fiction Films
  { title: "Blade Runner", author: "Ridley Scott", year: 1982, description: "A neo-noir sci-fi film about a blade runner hunting replicants.", genres: ["sci-fi", "noir", "thriller"], rating: 4.6, isBook: false },
  { title: "Blade Runner 2049", author: "Denis Villeneuve", year: 2017, description: "A sequel to Blade Runner about a new blade runner's discovery.", genres: ["sci-fi", "noir", "thriller"], rating: 4.4, isBook: false },
  { title: "The Fifth Element", author: "Luc Besson", year: 1997, description: "A sci-fi action film about a cab driver saving the world.", genres: ["sci-fi", "action", "adventure"], rating: 4.2, isBook: false },
  { title: "Minority Report", author: "Steven Spielberg", year: 2002, description: "A sci-fi thriller about a police officer accused of a future crime.", genres: ["sci-fi", "thriller", "crime"], rating: 4.3, isBook: false },
  { title: "Total Recall", author: "Paul Verhoeven", year: 1990, description: "A sci-fi action film about a man with implanted memories.", genres: ["sci-fi", "action", "thriller"], rating: 4.1, isBook: false },
  { title: "RoboCop", author: "Paul Verhoeven", year: 1987, description: "A sci-fi action film about a cyborg police officer.", genres: ["sci-fi", "action", "crime"], rating: 4.2, isBook: false },
  { title: "The Terminator", author: "James Cameron", year: 1984, description: "A sci-fi action film about a cyborg assassin from the future.", genres: ["sci-fi", "action", "thriller"], rating: 4.4, isBook: false },
  { title: "Terminator 2: Judgment Day", author: "James Cameron", year: 1991, description: "A sci-fi action sequel about protecting a young boy from a new Terminator.", genres: ["sci-fi", "action", "thriller"], rating: 4.6, isBook: false },
  { title: "Aliens", author: "James Cameron", year: 1986, description: "A sci-fi horror sequel about a rescue mission to an alien-infested colony.", genres: ["sci-fi", "horror", "action"], rating: 4.5, isBook: false },
  { title: "Predator", author: "John McTiernan", year: 1987, description: "A sci-fi action film about a team hunted by an alien creature.", genres: ["sci-fi", "action", "horror"], rating: 4.3, isBook: false },
  { title: "The Thing", author: "John Carpenter", year: 1982, description: "A sci-fi horror film about an alien creature in Antarctica.", genres: ["sci-fi", "horror", "thriller"], rating: 4.4, isBook: false },
  { title: "They Live", author: "John Carpenter", year: 1988, description: "A sci-fi horror film about aliens controlling humanity through media.", genres: ["sci-fi", "horror", "social commentary"], rating: 4.1, isBook: false },
  { title: "The Fly", author: "David Cronenberg", year: 1986, description: "A sci-fi horror film about a scientist's transformation into a fly.", genres: ["sci-fi", "horror", "body horror"], rating: 4.3, isBook: false },
  { title: "Videodrome", author: "David Cronenberg", year: 1983, description: "A sci-fi horror film about a television executive's descent into madness.", genres: ["sci-fi", "horror", "psychological"], rating: 4.0, isBook: false },
  { title: "Scanners", author: "David Cronenberg", year: 1981, description: "A sci-fi horror film about people with telepathic abilities.", genres: ["sci-fi", "horror", "thriller"], rating: 4.1, isBook: false },
  
  // Priority Level 2: Horror Films
  { title: "The Shining", author: "Stanley Kubrick", year: 1980, description: "A psychological horror film about a writer's descent into madness.", genres: ["horror", "psychological", "thriller"], rating: 4.5, isBook: false },
  { title: "The Exorcist", author: "William Friedkin", year: 1973, description: "A horror film about the demonic possession of a young girl.", genres: ["horror", "supernatural", "religious"], rating: 4.4, isBook: false },
  { title: "Halloween", author: "John Carpenter", year: 1978, description: "A slasher film about Michael Myers stalking babysitters.", genres: ["horror", "slasher", "thriller"], rating: 4.3, isBook: false },
  { title: "A Nightmare on Elm Street", author: "Wes Craven", year: 1984, description: "A horror film about a killer who attacks teenagers in their dreams.", genres: ["horror", "supernatural", "slasher"], rating: 4.2, isBook: false },
  { title: "Friday the 13th", author: "Sean S. Cunningham", year: 1980, description: "A slasher film about a killer at a summer camp.", genres: ["horror", "slasher", "thriller"], rating: 4.0, isBook: false },
  { title: "The Texas Chain Saw Massacre", author: "Tobe Hooper", year: 1974, description: "A horror film about a family of cannibals in rural Texas.", genres: ["horror", "slasher", "thriller"], rating: 4.1, isBook: false },
  { title: "Carrie", author: "Brian De Palma", year: 1976, description: "A horror film about a bullied girl with telekinetic powers.", genres: ["horror", "supernatural", "coming-of-age"], rating: 4.2, isBook: false },
  { title: "The Omen", author: "Richard Donner", year: 1976, description: "A horror film about a child who may be the Antichrist.", genres: ["horror", "supernatural", "religious"], rating: 4.1, isBook: false },
  { title: "Rosemary's Baby", author: "Roman Polanski", year: 1968, description: "A psychological horror film about a pregnant woman's paranoia.", genres: ["horror", "psychological", "thriller"], rating: 4.3, isBook: false },
  { title: "The Wicker Man", author: "Robin Hardy", year: 1973, description: "A horror film about a police officer investigating a missing child on a pagan island.", genres: ["horror", "folk horror", "mystery"], rating: 4.2, isBook: false },
  { title: "Don't Look Now", author: "Nicolas Roeg", year: 1973, description: "A psychological horror film about a couple grieving their daughter's death.", genres: ["horror", "psychological", "thriller"], rating: 4.1, isBook: false },
  { title: "Suspiria", author: "Dario Argento", year: 1977, description: "A horror film about a dance academy run by witches.", genres: ["horror", "supernatural", "giallo"], rating: 4.2, isBook: false },
  { title: "The Evil Dead", author: "Sam Raimi", year: 1981, description: "A horror film about friends battling demonic forces in a cabin.", genres: ["horror", "supernatural", "comedy"], rating: 4.1, isBook: false },
  { title: "Evil Dead II", author: "Sam Raimi", year: 1987, description: "A horror comedy sequel about battling demons in a cabin.", genres: ["horror", "comedy", "supernatural"], rating: 4.2, isBook: false },
  { title: "Army of Darkness", author: "Sam Raimi", year: 1992, description: "A horror comedy about a man transported to medieval times.", genres: ["horror", "comedy", "fantasy"], rating: 4.0, isBook: false },
  { title: "Re-Animator", author: "Stuart Gordon", year: 1985, description: "A horror comedy about a medical student who can reanimate the dead.", genres: ["horror", "comedy", "sci-fi"], rating: 4.1, isBook: false },
  { title: "From Beyond", author: "Stuart Gordon", year: 1986, description: "A horror film about scientists experimenting with a device that affects reality.", genres: ["horror", "sci-fi", "body horror"], rating: 4.0, isBook: false },
  
  // Priority Level 2: Mystery Films
  { title: "Chinatown", author: "Roman Polanski", year: 1974, description: "A neo-noir mystery about a private detective investigating corruption.", genres: ["mystery", "noir", "crime"], rating: 4.6, isBook: false },
  { title: "The Maltese Falcon", author: "John Huston", year: 1941, description: "A classic noir mystery about a private detective and a priceless statue.", genres: ["mystery", "noir", "crime"], rating: 4.5, isBook: false },
  { title: "Double Indemnity", author: "Billy Wilder", year: 1944, description: "A classic noir about an insurance salesman involved in murder.", genres: ["mystery", "noir", "crime"], rating: 4.5, isBook: false },
  { title: "The Big Sleep", author: "Howard Hawks", year: 1946, description: "A classic noir mystery about a private detective investigating blackmail.", genres: ["mystery", "noir", "crime"], rating: 4.4, isBook: false },
  { title: "Laura", author: "Otto Preminger", year: 1944, description: "A classic noir mystery about a detective investigating a woman's murder.", genres: ["mystery", "noir", "romance"], rating: 4.3, isBook: false },
  { title: "The Third Man", author: "Carol Reed", year: 1949, description: "A classic noir mystery about an American investigating his friend's death in Vienna.", genres: ["mystery", "noir", "thriller"], rating: 4.5, isBook: false },
  { title: "Touch of Evil", author: "Orson Welles", year: 1958, description: "A classic noir about a Mexican detective investigating a murder on the border.", genres: ["mystery", "noir", "crime"], rating: 4.4, isBook: false },
  { title: "The Long Goodbye", author: "Robert Altman", year: 1973, description: "A neo-noir mystery about a private detective investigating his friend's murder.", genres: ["mystery", "noir", "crime"], rating: 4.2, isBook: false },
  { title: "The Big Lebowski", author: "Joel Coen", year: 1998, description: "A comedy mystery about a slacker caught up in a kidnapping case.", genres: ["mystery", "comedy", "crime"], rating: 4.3, isBook: false },
  { title: "Brick", author: "Rian Johnson", year: 2005, description: "A neo-noir mystery about a high school student investigating his ex-girlfriend's death.", genres: ["mystery", "noir", "teen"], rating: 4.1, isBook: false },
  { title: "Kiss Kiss Bang Bang", author: "Shane Black", year: 2005, description: "A neo-noir comedy mystery about an actor turned detective.", genres: ["mystery", "comedy", "crime"], rating: 4.2, isBook: false },
  { title: "The Nice Guys", author: "Shane Black", year: 2016, description: "A neo-noir comedy mystery about two detectives in 1970s Los Angeles.", genres: ["mystery", "comedy", "crime"], rating: 4.1, isBook: false },
  { title: "Gone Baby Gone", author: "Ben Affleck", year: 2007, description: "A mystery thriller about private detectives investigating a child's disappearance.", genres: ["mystery", "thriller", "crime"], rating: 4.2, isBook: false },
  { title: "Mystic River", author: "Clint Eastwood", year: 2003, description: "A mystery drama about three friends affected by a murder investigation.", genres: ["mystery", "drama", "crime"], rating: 4.3, isBook: false },
  { title: "Zodiac", author: "David Fincher", year: 2007, description: "A mystery thriller about the investigation of the Zodiac Killer.", genres: ["mystery", "thriller", "true crime"], rating: 4.4, isBook: false },
  { title: "Se7en", author: "David Fincher", year: 1995, description: "A mystery thriller about detectives hunting a serial killer.", genres: ["mystery", "thriller", "crime"], rating: 4.5, isBook: false },
  { title: "The Silence of the Lambs", author: "Jonathan Demme", year: 1991, description: "A mystery thriller about an FBI trainee hunting a serial killer.", genres: ["mystery", "thriller", "crime"], rating: 4.6, isBook: false },
  { title: "Red Dragon", author: "Brett Ratner", year: 2002, description: "A mystery thriller about an FBI agent hunting the Tooth Fairy killer.", genres: ["mystery", "thriller", "crime"], rating: 4.1, isBook: false },
  { title: "Hannibal", author: "Ridley Scott", year: 2001, description: "A mystery thriller about Hannibal Lecter's return to Italy.", genres: ["mystery", "thriller", "crime"], rating: 4.0, isBook: false },
  
  // Priority Level 2: Western Films
  { title: "The Good, the Bad and the Ugly", author: "Sergio Leone", year: 1966, description: "A spaghetti western about three gunslingers searching for buried gold.", genres: ["western", "adventure", "action"], rating: 4.7, isBook: false },
  { title: "Once Upon a Time in the West", author: "Sergio Leone", year: 1968, description: "A spaghetti western about a mysterious stranger protecting a widow.", genres: ["western", "drama", "revenge"], rating: 4.6, isBook: false },
  { title: "For a Few Dollars More", author: "Sergio Leone", year: 1965, description: "A spaghetti western about two bounty hunters tracking a gang.", genres: ["western", "action", "revenge"], rating: 4.4, isBook: false },
  { title: "A Fistful of Dollars", author: "Sergio Leone", year: 1964, description: "A spaghetti western about a stranger playing two rival families against each other.", genres: ["western", "action", "revenge"], rating: 4.3, isBook: false },
  { title: "High Noon", author: "Fred Zinnemann", year: 1952, description: "A classic western about a marshal facing a gang alone.", genres: ["western", "drama", "justice"], rating: 4.5, isBook: false },
  { title: "Shane", author: "George Stevens", year: 1953, description: "A classic western about a gunfighter protecting homesteaders.", genres: ["western", "drama", "family"], rating: 4.4, isBook: false },
  { title: "The Searchers", author: "John Ford", year: 1956, description: "A classic western about a Civil War veteran searching for his kidnapped niece.", genres: ["western", "drama", "adventure"], rating: 4.5, isBook: false },
  { title: "Stagecoach", author: "John Ford", year: 1939, description: "A classic western about passengers on a dangerous stagecoach journey.", genres: ["western", "drama", "adventure"], rating: 4.3, isBook: false },
  { title: "The Magnificent Seven", author: "John Sturges", year: 1960, description: "A western about seven gunfighters protecting a Mexican village.", genres: ["western", "action", "adventure"], rating: 4.2, isBook: false },
  { title: "Butch Cassidy and the Sundance Kid", author: "George Roy Hill", year: 1969, description: "A western about two outlaws on the run from the law.", genres: ["western", "adventure", "comedy"], rating: 4.4, isBook: false },
  { title: "The Wild Bunch", author: "Sam Peckinpah", year: 1969, description: "A western about aging outlaws planning one last robbery.", genres: ["western", "action", "drama"], rating: 4.3, isBook: false },
  { title: "Unforgiven", author: "Clint Eastwood", year: 1992, description: "A western about a retired gunslinger taking one last job.", genres: ["western", "drama", "revenge"], rating: 4.6, isBook: false },
  { title: "Dances with Wolves", author: "Kevin Costner", year: 1990, description: "A western about a Union soldier befriending Lakota Indians.", genres: ["western", "drama", "historical"], rating: 4.3, isBook: false },
  { title: "Tombstone", author: "George P. Cosmatos", year: 1993, description: "A western about the gunfight at the O.K. Corral.", genres: ["western", "action", "historical"], rating: 4.2, isBook: false },
  { title: "Open Range", author: "Kevin Costner", year: 2003, description: "A western about cattle drivers defending their way of life.", genres: ["western", "drama", "action"], rating: 4.1, isBook: false },
  { title: "3:10 to Yuma", author: "James Mangold", year: 2007, description: "A western about a rancher escorting a notorious outlaw to prison.", genres: ["western", "drama", "action"], rating: 4.2, isBook: false },
  { title: "True Grit", author: "Joel Coen", year: 2010, description: "A western about a young girl seeking revenge with the help of a marshal.", genres: ["western", "drama", "adventure"], rating: 4.3, isBook: false },
  { title: "Django Unchained", author: "Quentin Tarantino", year: 2012, description: "A western about a freed slave seeking revenge in the antebellum South.", genres: ["western", "action", "revenge"], rating: 4.4, isBook: false },
  { title: "The Hateful Eight", author: "Quentin Tarantino", year: 2015, description: "A western about eight strangers trapped in a cabin during a blizzard.", genres: ["western", "mystery", "thriller"], rating: 4.1, isBook: false },
  { title: "The Revenant", author: "Alejandro González Iñárritu", year: 2015, description: "A western about a frontiersman seeking revenge in the wilderness.", genres: ["western", "drama", "adventure"], rating: 4.4, isBook: false },
  
  // Priority Level 2: Sports Films
  { title: "Rocky", author: "John G. Avildsen", year: 1976, description: "A sports drama about an underdog boxer getting a shot at the title.", genres: ["sports", "drama", "inspiration"], rating: 4.5, isBook: false },
  { title: "Rocky II", author: "Sylvester Stallone", year: 1979, description: "A sports drama sequel about Rocky's rematch with Apollo Creed.", genres: ["sports", "drama", "revenge"], rating: 4.2, isBook: false },
  { title: "Rocky III", author: "Sylvester Stallone", year: 1982, description: "A sports drama about Rocky facing a new challenger.", genres: ["sports", "drama", "friendship"], rating: 4.1, isBook: false },
  { title: "Rocky IV", author: "Sylvester Stallone", year: 1985, description: "A sports drama about Rocky fighting a Soviet boxer during the Cold War.", genres: ["sports", "drama", "patriotism"], rating: 4.0, isBook: false },
  { title: "Raging Bull", author: "Martin Scorsese", year: 1980, description: "A biographical sports drama about boxer Jake LaMotta.", genres: ["sports", "drama", "biography"], rating: 4.6, isBook: false },
  { title: "Million Dollar Baby", author: "Clint Eastwood", year: 2004, description: "A sports drama about a female boxer and her trainer.", genres: ["sports", "drama", "family"], rating: 4.4, isBook: false },
  { title: "The Fighter", author: "David O. Russell", year: 2010, description: "A biographical sports drama about boxer Micky Ward.", genres: ["sports", "drama", "family"], rating: 4.3, isBook: false },
  { title: "Creed", author: "Ryan Coogler", year: 2015, description: "A sports drama about Apollo Creed's son becoming a boxer.", genres: ["sports", "drama", "family"], rating: 4.2, isBook: false },
  { title: "Creed II", author: "Steven Caple Jr.", year: 2018, description: "A sports drama about Adonis Creed facing Viktor Drago.", genres: ["sports", "drama", "revenge"], rating: 4.1, isBook: false },
  { title: "Creed III", author: "Michael B. Jordan", year: 2023, description: "A sports drama about Adonis Creed facing his childhood friend.", genres: ["sports", "drama", "friendship"], rating: 4.2, isBook: false },
  { title: "The Natural", author: "Barry Levinson", year: 1984, description: "A sports drama about a baseball player with a mysterious past.", genres: ["sports", "drama", "mystery"], rating: 4.2, isBook: false },
  { title: "Field of Dreams", author: "Phil Alden Robinson", year: 1989, description: "A sports drama about a farmer building a baseball field.", genres: ["sports", "drama", "fantasy"], rating: 4.3, isBook: false },
  { title: "Bull Durham", author: "Ron Shelton", year: 1988, description: "A sports comedy about minor league baseball players.", genres: ["sports", "comedy", "romance"], rating: 4.1, isBook: false },
  { title: "A League of Their Own", author: "Penny Marshall", year: 1992, description: "A sports comedy about women's baseball during WWII.", genres: ["sports", "comedy", "historical"], rating: 4.2, isBook: false },
  { title: "Remember the Titans", author: "Boaz Yakin", year: 2000, description: "A sports drama about a high school football team during integration.", genres: ["sports", "drama", "historical"], rating: 4.3, isBook: false },
  { title: "Friday Night Lights", author: "Peter Berg", year: 2004, description: "A sports drama about a high school football team in Texas.", genres: ["sports", "drama", "family"], rating: 4.2, isBook: false },
  { title: "The Blind Side", author: "John Lee Hancock", year: 2009, description: "A biographical sports drama about football player Michael Oher.", genres: ["sports", "drama", "family"], rating: 4.1, isBook: false },
  { title: "Moneyball", author: "Bennett Miller", year: 2011, description: "A sports drama about using statistics in baseball management.", genres: ["sports", "drama", "business"], rating: 4.3, isBook: false },
  { title: "42", author: "Brian Helgeland", year: 2013, description: "A biographical sports drama about Jackie Robinson breaking the color barrier.", genres: ["sports", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "Rush", author: "Ron Howard", year: 2013, description: "A biographical sports drama about Formula One racing rivals.", genres: ["sports", "drama", "biography"], rating: 4.2, isBook: false },
  { title: "Ford v Ferrari", author: "James Mangold", year: 2019, description: "A biographical sports drama about Ford's attempt to beat Ferrari at Le Mans.", genres: ["sports", "drama", "biography"], rating: 4.3, isBook: false },
  
  // Priority Level 3: Art House Films
  { title: "Mulholland Drive", author: "David Lynch", year: 2001, description: "A surreal mystery about an aspiring actress in Los Angeles.", genres: ["art house", "mystery", "surreal"], rating: 4.4, isBook: false },
  { title: "Eraserhead", author: "David Lynch", year: 1977, description: "A surreal horror film about a man's nightmarish experiences.", genres: ["art house", "horror", "surreal"], rating: 4.2, isBook: false },
  { title: "Blue Velvet", author: "David Lynch", year: 1986, description: "A neo-noir mystery about dark secrets in a small town.", genres: ["art house", "mystery", "noir"], rating: 4.3, isBook: false },
  { title: "Lost Highway", author: "David Lynch", year: 1997, description: "A surreal thriller about identity and reality.", genres: ["art house", "thriller", "surreal"], rating: 4.1, isBook: false },
  { title: "Inland Empire", author: "David Lynch", year: 2006, description: "A surreal drama about an actress's psychological journey.", genres: ["art house", "drama", "surreal"], rating: 4.0, isBook: false },
  { title: "Persona", author: "Ingmar Bergman", year: 1966, description: "A psychological drama about identity and human connection.", genres: ["art house", "drama", "psychological"], rating: 4.5, isBook: false },
  { title: "The Seventh Seal", author: "Ingmar Bergman", year: 1957, description: "A medieval drama about a knight playing chess with Death.", genres: ["art house", "drama", "philosophical"], rating: 4.4, isBook: false },
  { title: "Wild Strawberries", author: "Ingmar Bergman", year: 1957, description: "A drama about an elderly professor reflecting on his life.", genres: ["art house", "drama", "reflection"], rating: 4.3, isBook: false },
  { title: "Cries and Whispers", author: "Ingmar Bergman", year: 1972, description: "A drama about three sisters dealing with death and grief.", genres: ["art house", "drama", "family"], rating: 4.2, isBook: false },
  { title: "Fanny and Alexander", author: "Ingmar Bergman", year: 1982, description: "A family drama about two children's experiences after their father's death.", genres: ["art house", "drama", "family"], rating: 4.4, isBook: false },
  { title: "8½", author: "Federico Fellini", year: 1963, description: "A surreal drama about a filmmaker's creative crisis.", genres: ["art house", "drama", "surreal"], rating: 4.5, isBook: false },
  { title: "La Dolce Vita", author: "Federico Fellini", year: 1960, description: "A drama about a journalist's search for meaning in Rome.", genres: ["art house", "drama", "social commentary"], rating: 4.4, isBook: false },
  { title: "Nights of Cabiria", author: "Federico Fellini", year: 1957, description: "A drama about a prostitute's search for love and happiness.", genres: ["art house", "drama", "romance"], rating: 4.3, isBook: false },
  { title: "La Strada", author: "Federico Fellini", year: 1954, description: "A drama about a traveling performer and his assistant.", genres: ["art house", "drama", "romance"], rating: 4.2, isBook: false },
  { title: "The 400 Blows", author: "François Truffaut", year: 1959, description: "A coming-of-age drama about a troubled adolescent in Paris.", genres: ["art house", "drama", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "Jules and Jim", author: "François Truffaut", year: 1962, description: "A romantic drama about a love triangle between friends.", genres: ["art house", "drama", "romance"], rating: 4.3, isBook: false },
  { title: "Breathless", author: "Jean-Luc Godard", year: 1960, description: "A crime drama about a criminal on the run in Paris.", genres: ["art house", "crime", "romance"], rating: 4.4, isBook: false },
  { title: "Contempt", author: "Jean-Luc Godard", year: 1963, description: "A drama about a screenwriter's failing marriage.", genres: ["art house", "drama", "romance"], rating: 4.2, isBook: false },
  { title: "Pierrot le Fou", author: "Jean-Luc Godard", year: 1965, description: "A crime drama about lovers on the run.", genres: ["art house", "crime", "romance"], rating: 4.1, isBook: false },
  { title: "Weekend", author: "Jean-Luc Godard", year: 1967, description: "A surreal drama about a couple's journey through chaos.", genres: ["art house", "drama", "surreal"], rating: 4.0, isBook: false },
  
  // Priority Level 3: Foreign Language Films
  { title: "Oldboy", author: "Park Chan-wook", year: 2003, description: "A South Korean thriller about a man seeking revenge after 15 years of imprisonment.", genres: ["foreign", "thriller", "revenge"], rating: 4.5, isBook: false },
  { title: "The Handmaiden", author: "Park Chan-wook", year: 2016, description: "A South Korean thriller about a con artist and a wealthy heiress.", genres: ["foreign", "thriller", "romance"], rating: 4.4, isBook: false },
  { title: "Memories of Murder", author: "Bong Joon-ho", year: 2003, description: "A South Korean crime drama about detectives hunting a serial killer.", genres: ["foreign", "crime", "drama"], rating: 4.3, isBook: false },
  { title: "The Host", author: "Bong Joon-ho", year: 2006, description: "A South Korean monster film about a family fighting a giant creature.", genres: ["foreign", "horror", "family"], rating: 4.2, isBook: false },
  { title: "Train to Busan", author: "Yeon Sang-ho", year: 2016, description: "A South Korean zombie film about passengers on a train during an outbreak.", genres: ["foreign", "horror", "action"], rating: 4.3, isBook: false },
  { title: "The Wailing", author: "Na Hong-jin", year: 2016, description: "A South Korean horror film about a policeman investigating mysterious deaths.", genres: ["foreign", "horror", "mystery"], rating: 4.2, isBook: false },
  { title: "Burning", author: "Lee Chang-dong", year: 2018, description: "A South Korean mystery about a delivery man and his mysterious neighbor.", genres: ["foreign", "mystery", "drama"], rating: 4.3, isBook: false },
  { title: "The Tale of the Princess Kaguya", author: "Isao Takahata", year: 2013, description: "A Japanese animated film about a princess from the moon.", genres: ["foreign", "animation", "fantasy"], rating: 4.4, isBook: false },
  { title: "Grave of the Fireflies", author: "Isao Takahata", year: 1988, description: "A Japanese animated drama about siblings during WWII.", genres: ["foreign", "animation", "drama"], rating: 4.5, isBook: false },
  { title: "Spirited Away", author: "Hayao Miyazaki", year: 2001, description: "A Japanese animated fantasy about a girl in a magical world.", genres: ["foreign", "animation", "fantasy"], rating: 4.6, isBook: false },
  { title: "My Neighbor Totoro", author: "Hayao Miyazaki", year: 1988, description: "A Japanese animated fantasy about sisters and forest spirits.", genres: ["foreign", "animation", "family"], rating: 4.5, isBook: false },
  { title: "Princess Mononoke", author: "Hayao Miyazaki", year: 1997, description: "A Japanese animated fantasy about humans and nature spirits.", genres: ["foreign", "animation", "fantasy"], rating: 4.4, isBook: false },
  { title: "Howl's Moving Castle", author: "Hayao Miyazaki", year: 2004, description: "A Japanese animated fantasy about a young woman and a wizard.", genres: ["foreign", "animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Castle in the Sky", author: "Hayao Miyazaki", year: 1986, description: "A Japanese animated adventure about a floating castle.", genres: ["foreign", "animation", "adventure"], rating: 4.2, isBook: false },
  { title: "Kiki's Delivery Service", author: "Hayao Miyazaki", year: 1989, description: "A Japanese animated fantasy about a young witch.", genres: ["foreign", "animation", "fantasy"], rating: 4.3, isBook: false },
  { title: "Nausicaä of the Valley of the Wind", author: "Hayao Miyazaki", year: 1984, description: "A Japanese animated sci-fi about a princess in a post-apocalyptic world.", genres: ["foreign", "animation", "sci-fi"], rating: 4.2, isBook: false },
  { title: "The Wind Rises", author: "Hayao Miyazaki", year: 2013, description: "A Japanese animated biographical drama about an aircraft designer.", genres: ["foreign", "animation", "biography"], rating: 4.1, isBook: false },
  { title: "Akira", author: "Katsuhiro Otomo", year: 1988, description: "A Japanese animated sci-fi about psychic powers in a cyberpunk world.", genres: ["foreign", "animation", "sci-fi"], rating: 4.4, isBook: false },
  { title: "Ghost in the Shell", author: "Mamoru Oshii", year: 1995, description: "A Japanese animated sci-fi about a cyborg police officer.", genres: ["foreign", "animation", "sci-fi"], rating: 4.3, isBook: false },
  { title: "Perfect Blue", author: "Satoshi Kon", year: 1997, description: "A Japanese animated thriller about a pop star's psychological breakdown.", genres: ["foreign", "animation", "thriller"], rating: 4.2, isBook: false },
  { title: "Paprika", author: "Satoshi Kon", year: 2006, description: "A Japanese animated sci-fi about a device that allows people to enter dreams.", genres: ["foreign", "animation", "sci-fi"], rating: 4.1, isBook: false },
  
  // Priority Level 3: Experimental Films
  { title: "Meshes of the Afternoon", author: "Maya Deren", year: 1943, description: "An experimental short film about a woman's dreamlike experiences.", genres: ["experimental", "short", "surreal"], rating: 4.2, isBook: false },
  { title: "Un Chien Andalou", author: "Luis Buñuel", year: 1929, description: "An experimental short film with surreal imagery.", genres: ["experimental", "short", "surreal"], rating: 4.1, isBook: false },
  { title: "L'Age d'Or", author: "Luis Buñuel", year: 1930, description: "An experimental film about love and social conventions.", genres: ["experimental", "drama", "surreal"], rating: 4.0, isBook: false },
  { title: "The Man with a Movie Camera", author: "Dziga Vertov", year: 1929, description: "An experimental documentary about Soviet urban life.", genres: ["experimental", "documentary", "silent"], rating: 4.3, isBook: false },
  { title: "Battleship Potemkin", author: "Sergei Eisenstein", year: 1925, description: "A revolutionary silent film about a mutiny on a Russian battleship.", genres: ["experimental", "drama", "historical"], rating: 4.4, isBook: false },
  { title: "Strike", author: "Sergei Eisenstein", year: 1925, description: "A silent film about a workers' strike in pre-revolutionary Russia.", genres: ["experimental", "drama", "historical"], rating: 4.2, isBook: false },
  { title: "Ivan the Terrible", author: "Sergei Eisenstein", year: 1944, description: "A historical drama about the Russian tsar Ivan the Terrible.", genres: ["experimental", "drama", "historical"], rating: 4.1, isBook: false },
  { title: "Metropolis", author: "Fritz Lang", year: 1927, description: "A silent sci-fi film about class conflict in a futuristic city.", genres: ["experimental", "sci-fi", "silent"], rating: 4.3, isBook: false },
  { title: "M", author: "Fritz Lang", year: 1931, description: "A crime thriller about a city hunting a child murderer.", genres: ["experimental", "crime", "thriller"], rating: 4.4, isBook: false },
  { title: "The Cabinet of Dr. Caligari", author: "Robert Wiene", year: 1920, description: "A silent horror film with expressionist visuals.", genres: ["experimental", "horror", "silent"], rating: 4.2, isBook: false },
  { title: "Nosferatu", author: "F.W. Murnau", year: 1922, description: "A silent horror film about a vampire in Germany.", genres: ["experimental", "horror", "silent"], rating: 4.3, isBook: false },
  { title: "Sunrise: A Song of Two Humans", author: "F.W. Murnau", year: 1927, description: "A silent romantic drama about a farmer and his wife.", genres: ["experimental", "drama", "romance"], rating: 4.4, isBook: false },
  { title: "The Passion of Joan of Arc", author: "Carl Theodor Dreyer", year: 1928, description: "A silent historical drama about Joan of Arc's trial.", genres: ["experimental", "drama", "historical"], rating: 4.5, isBook: false },
  { title: "Vampyr", author: "Carl Theodor Dreyer", year: 1932, description: "A horror film about a man encountering supernatural forces.", genres: ["experimental", "horror", "supernatural"], rating: 4.1, isBook: false },
  { title: "Ordet", author: "Carl Theodor Dreyer", year: 1955, description: "A drama about faith and miracles in a Danish family.", genres: ["experimental", "drama", "religious"], rating: 4.2, isBook: false },
  { title: "Gertrud", author: "Carl Theodor Dreyer", year: 1964, description: "A drama about a woman's search for true love.", genres: ["experimental", "drama", "romance"], rating: 4.0, isBook: false },
  
  // Priority Level 3: Educational Documentaries
  { title: "The Civil War", author: "Ken Burns", year: 1990, description: "A comprehensive documentary series about the American Civil War.", genres: ["documentary", "history", "educational"], rating: 4.7, isBook: false },
  { title: "Baseball", author: "Ken Burns", year: 1994, description: "A documentary series about the history of baseball in America.", genres: ["documentary", "sports", "history"], rating: 4.5, isBook: false },
  { title: "Jazz", author: "Ken Burns", year: 2001, description: "A documentary series about the history of jazz music.", genres: ["documentary", "music", "history"], rating: 4.4, isBook: false },
  { title: "The War", author: "Ken Burns", year: 2007, description: "A documentary series about World War II from an American perspective.", genres: ["documentary", "history", "war"], rating: 4.6, isBook: false },
  { title: "The National Parks", author: "Ken Burns", year: 2009, description: "A documentary series about America's national parks.", genres: ["documentary", "nature", "history"], rating: 4.3, isBook: false },
  { title: "The Vietnam War", author: "Ken Burns", year: 2017, description: "A comprehensive documentary series about the Vietnam War.", genres: ["documentary", "history", "war"], rating: 4.5, isBook: false },
  { title: "Country Music", author: "Ken Burns", year: 2019, description: "A documentary series about the history of country music.", genres: ["documentary", "music", "history"], rating: 4.2, isBook: false },
  { title: "The Roosevelts", author: "Ken Burns", year: 2014, description: "A documentary series about Theodore, Franklin, and Eleanor Roosevelt.", genres: ["documentary", "biography", "history"], rating: 4.4, isBook: false },
  { title: "The Dust Bowl", author: "Ken Burns", year: 2012, description: "A documentary about the environmental disaster of the 1930s.", genres: ["documentary", "history", "environmental"], rating: 4.3, isBook: false },
  { title: "Prohibition", author: "Ken Burns", year: 2011, description: "A documentary series about the Prohibition era in America.", genres: ["documentary", "history", "social"], rating: 4.2, isBook: false },
  { title: "The Central Park Five", author: "Ken Burns", year: 2012, description: "A documentary about five teenagers wrongly convicted of rape.", genres: ["documentary", "crime", "social justice"], rating: 4.3, isBook: false },
  { title: "Cancer: The Emperor of All Maladies", author: "Barak Goodman", year: 2015, description: "A documentary series about the history and treatment of cancer.", genres: ["documentary", "medical", "science"], rating: 4.4, isBook: false },
  { title: "The Gene", author: "Ken Burns", year: 2020, description: "A documentary series about the history of genetics and DNA.", genres: ["documentary", "science", "medical"], rating: 4.2, isBook: false },
  { title: "The Address", author: "Ken Burns", year: 2014, description: "A documentary about students memorizing the Gettysburg Address.", genres: ["documentary", "education", "history"], rating: 4.1, isBook: false },
  { title: "Defying the Nazis", author: "Ken Burns", year: 2016, description: "A documentary about Americans who helped rescue Jews during WWII.", genres: ["documentary", "history", "war"], rating: 4.3, isBook: false },
  { title: "The Mayo Clinic", author: "Ken Burns", year: 2018, description: "A documentary about the history of the Mayo Clinic.", genres: ["documentary", "medical", "history"], rating: 4.2, isBook: false },
  { title: "Hemingway", author: "Ken Burns", year: 2021, description: "A documentary series about the life and work of Ernest Hemingway.", genres: ["documentary", "biography", "literature"], rating: 4.3, isBook: false },
  { title: "Benjamin Franklin", author: "Ken Burns", year: 2022, description: "A documentary about the life and legacy of Benjamin Franklin.", genres: ["documentary", "biography", "history"], rating: 4.2, isBook: false },
  { title: "The U.S. and the Holocaust", author: "Ken Burns", year: 2022, description: "A documentary about America's response to the Holocaust.", genres: ["documentary", "history", "war"], rating: 4.4, isBook: false },
  { title: "The American Buffalo", author: "Ken Burns", year: 2023, description: "A documentary about the history and near-extinction of the American bison.", genres: ["documentary", "nature", "history"], rating: 4.1, isBook: false },
  
  // Priority Level 3: Anime Films
  { title: "Akira", author: "Katsuhiro Otomo", year: 1988, description: "A Japanese animated sci-fi about psychic powers in a cyberpunk world.", genres: ["anime", "sci-fi", "cyberpunk"], rating: 4.4, isBook: false },
  { title: "Ghost in the Shell", author: "Mamoru Oshii", year: 1995, description: "A Japanese animated sci-fi about a cyborg police officer.", genres: ["anime", "sci-fi", "cyberpunk"], rating: 4.3, isBook: false },
  { title: "Perfect Blue", author: "Satoshi Kon", year: 1997, description: "A Japanese animated thriller about a pop star's psychological breakdown.", genres: ["anime", "thriller", "psychological"], rating: 4.2, isBook: false },
  { title: "Paprika", author: "Satoshi Kon", year: 2006, description: "A Japanese animated sci-fi about a device that allows people to enter dreams.", genres: ["anime", "sci-fi", "surreal"], rating: 4.1, isBook: false },
  { title: "Tokyo Godfathers", author: "Satoshi Kon", year: 2003, description: "A Japanese animated comedy-drama about three homeless people finding a baby.", genres: ["anime", "comedy", "drama"], rating: 4.0, isBook: false },
  { title: "Millennium Actress", author: "Satoshi Kon", year: 2001, description: "A Japanese animated drama about an actress's life and career.", genres: ["anime", "drama", "biography"], rating: 4.1, isBook: false },
  { title: "Your Name", author: "Makoto Shinkai", year: 2016, description: "A Japanese animated romance about two teenagers who swap bodies.", genres: ["anime", "romance", "fantasy"], rating: 4.5, isBook: false },
  { title: "Weathering with You", author: "Makoto Shinkai", year: 2019, description: "A Japanese animated romance about a boy and a girl who can control the weather.", genres: ["anime", "romance", "fantasy"], rating: 4.3, isBook: false },
  { title: "5 Centimeters Per Second", author: "Makoto Shinkai", year: 2007, description: "A Japanese animated romance about distance and relationships.", genres: ["anime", "romance", "drama"], rating: 4.2, isBook: false },
  { title: "The Garden of Words", author: "Makoto Shinkai", year: 2013, description: "A Japanese animated romance about a student and a woman in a garden.", genres: ["anime", "romance", "drama"], rating: 4.1, isBook: false },
  { title: "A Silent Voice", author: "Naoko Yamada", year: 2016, description: "A Japanese animated drama about bullying and redemption.", genres: ["anime", "drama", "coming-of-age"], rating: 4.4, isBook: false },
  { title: "Liz and the Blue Bird", author: "Naoko Yamada", year: 2018, description: "A Japanese animated drama about two high school musicians.", genres: ["anime", "drama", "music"], rating: 4.0, isBook: false },
  { title: "Wolf Children", author: "Mamoru Hosoda", year: 2012, description: "A Japanese animated drama about a mother raising werewolf children.", genres: ["anime", "drama", "fantasy"], rating: 4.3, isBook: false },
  { title: "The Boy and the Beast", author: "Mamoru Hosoda", year: 2015, description: "A Japanese animated fantasy about a boy training with a beast warrior.", genres: ["anime", "fantasy", "adventure"], rating: 4.1, isBook: false },
  { title: "Mirai", author: "Mamoru Hosoda", year: 2018, description: "A Japanese animated fantasy about a boy meeting his future sister.", genres: ["anime", "fantasy", "family"], rating: 4.0, isBook: false },
  { title: "Belle", author: "Mamoru Hosoda", year: 2021, description: "A Japanese animated sci-fi about a girl in a virtual world.", genres: ["anime", "sci-fi", "romance"], rating: 4.2, isBook: false },
  { title: "Redline", author: "Takeshi Koike", year: 2009, description: "A Japanese animated sci-fi about a high-stakes racing competition.", genres: ["anime", "sci-fi", "action"], rating: 4.1, isBook: false },
  { title: "Tekkonkinkreet", author: "Michael Arias", year: 2006, description: "A Japanese animated crime drama about two street kids.", genres: ["anime", "crime", "drama"], rating: 4.0, isBook: false },
  { title: "Mind Game", author: "Masaaki Yuasa", year: 2004, description: "A Japanese animated surreal comedy about a man's second chance at life.", genres: ["anime", "comedy", "surreal"], rating: 4.1, isBook: false },
  { title: "The Night is Short, Walk on Girl", author: "Masaaki Yuasa", year: 2017, description: "A Japanese animated comedy about a night of adventures in Kyoto.", genres: ["anime", "comedy", "romance"], rating: 4.2, isBook: false },
  { title: "Lu Over the Wall", author: "Masaaki Yuasa", year: 2017, description: "A Japanese animated fantasy about a boy and a mermaid.", genres: ["anime", "fantasy", "music"], rating: 4.0, isBook: false },
  { title: "Ride Your Wave", author: "Masaaki Yuasa", year: 2019, description: "A Japanese animated romance about a surfer and her boyfriend's ghost.", genres: ["anime", "romance", "fantasy"], rating: 4.1, isBook: false },
  { title: "In This Corner of the World", author: "Sunao Katabuchi", year: 2016, description: "A Japanese animated drama about a woman during WWII.", genres: ["anime", "drama", "historical"], rating: 4.3, isBook: false },
  { title: "Maquia: When the Promised Flower Blooms", author: "Mari Okada", year: 2018, description: "A Japanese animated fantasy about an immortal girl raising a human child.", genres: ["anime", "fantasy", "drama"], rating: 4.1, isBook: false },
  { title: "Fireworks", author: "Nobuyuki Takeuchi", year: 2017, description: "A Japanese animated romance about a boy who can rewind time.", genres: ["anime", "romance", "fantasy"], rating: 4.0, isBook: false },
  { title: "The Anthem of the Heart", author: "Tatsuyuki Nagai", year: 2015, description: "A Japanese animated drama about a girl who can't speak due to trauma.", genres: ["anime", "drama", "music"], rating: 4.1, isBook: false },
  { title: "Colorful", author: "Keiichi Hara", year: 2010, description: "A Japanese animated drama about a soul getting a second chance at life.", genres: ["anime", "drama", "fantasy"], rating: 4.0, isBook: false },
  { title: "Summer Wars", author: "Mamoru Hosoda", year: 2009, description: "A Japanese animated sci-fi about a virtual world crisis.", genres: ["anime", "sci-fi", "family"], rating: 4.2, isBook: false },
  { title: "The Girl Who Leapt Through Time", author: "Mamoru Hosoda", year: 2006, description: "A Japanese animated sci-fi about a girl who can time travel.", genres: ["anime", "sci-fi", "romance"], rating: 4.3, isBook: false }
];

// Local fallback data for backward compatibility (keeping the old structure)
const LOCAL_BOOK_DATA = {
  adventure: COMPREHENSIVE_BOOK_DATA.filter(book => book.genres.includes("adventure")).slice(0, 10),
  fantasy: COMPREHENSIVE_BOOK_DATA.filter(book => book.genres.includes("fantasy")).slice(0, 10),
  mystery: COMPREHENSIVE_BOOK_DATA.filter(book => book.genres.includes("mystery")).slice(0, 10)
};

export default function SuggestionsScreen() {
  const { 
    books, 
    movies, 
    addBook, 
    addMovie, 
    generateComprehensiveExport, 
    importItems, 
    forceUpdate 
  } = useDataStore();
  
  const { settings } = useAppSettings();
  const { interests } = useUserInterests();
  const { features } = useSubscription();
  const { getPreloadedMovies, getPreloadedBooks } = usePreloadedData();
  
  // Define isDark constant to fix the ReferenceError
  const isDark = false;
  const llmProxyConfigured = Boolean(
    typeof LLM_PROXY_BASE_URL === 'string' && LLM_PROXY_BASE_URL.trim().length > 0
  );
  /** Env + proxy URL; in __DEV__ we show the UI when the proxy URL is set even if assist flag is off. */
  const llmAssistConfigured =
    llmProxyConfigured && (ENABLE_LLM_ASSIST || __DEV__);
  /** Premium (or dev) can call the proxy; free production users see the field but not live refine. */
  const llmRefineEnabled =
    llmAssistConfigured && (features.canUseLLM || __DEV__);
  
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('confidence');

  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalIsBook, setModalIsBook] = useState(true);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<Set<string>>(new Set());
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Map<string, Suggestion>>(new Map());
  const [granularRatings, setGranularRatings] = useState<Map<string, GranularRating>>(new Map());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date>(new Date());
  const [showAlert, setShowAlert] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'success' | 'error' | 'warning' | 'info'
  });
  const [successAnimation, setSuccessAnimation] = useState<Set<string>>(new Set());
  const [immediateFeedback, setImmediateFeedback] = useState<Set<string>>(new Set());

  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set());
  const [llmRefineStatus, setLlmRefineStatus] = useState<string | null>(null);
  const [llmBookRefineContext, setLlmBookRefineContext] = useState('');
  const [llmMovieRefineContext, setLlmMovieRefineContext] = useState('');
  const [llmAssistPanelTab, setLlmAssistPanelTab] = useState<LlmAssistPanelTab>('refine-books');
  // Force re-render when data store updates
  const [localForceUpdate, setLocalForceUpdate] = useState(0);

  useEffect(() => {
    const loadStoredLlmContext = async () => {
      try {
        const [booksStored, moviesStored, legacyStored] = await Promise.all([
          AsyncStorage.getItem(PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY),
          AsyncStorage.getItem(PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY),
          AsyncStorage.getItem(PREMIUM_SUGGESTION_CONTEXT_LEGACY_KEY),
        ]);
        if (typeof booksStored === 'string' && booksStored.length > 0) {
          setLlmBookRefineContext(booksStored.slice(0, 120));
        } else if (typeof legacyStored === 'string' && legacyStored.length > 0) {
          setLlmBookRefineContext(legacyStored.slice(0, 120));
        }
        if (typeof moviesStored === 'string' && moviesStored.length > 0) {
          setLlmMovieRefineContext(moviesStored.slice(0, 120));
        }
      } catch (error) {
        console.warn('⚠️ Failed to load premium suggestion context:', error);
      }
    };

    loadStoredLlmContext();
  }, []);

  useEffect(() => {
    const saveBookRefineContext = async () => {
      try {
        const value = llmBookRefineContext.trim();
        if (value.length === 0) {
          await AsyncStorage.removeItem(PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY);
          return;
        }
        await AsyncStorage.setItem(PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY, value.slice(0, 120));
      } catch (error) {
        console.warn('⚠️ Failed to save book refine context:', error);
      }
    };

    saveBookRefineContext();
  }, [llmBookRefineContext]);

  useEffect(() => {
    const saveMovieRefineContext = async () => {
      try {
        const value = llmMovieRefineContext.trim();
        if (value.length === 0) {
          await AsyncStorage.removeItem(PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY);
          return;
        }
        await AsyncStorage.setItem(PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY, value.slice(0, 120));
      } catch (error) {
        console.warn('⚠️ Failed to save movie refine context:', error);
      }
    };

    saveMovieRefineContext();
  }, [llmMovieRefineContext]);

  const buildSuggestionsRefinePayload = (
    candidates: Suggestion[],
    refineText: string
  ): SuggestionsRefineRequest | null => {
    if (!candidates.length) return null;

    const tasteSnap = buildTasteProfileSnapshot(books, movies);

    const topCandidates = pickCandidatesForLlmRefine(candidates, LLM_REFINE_TOP_N);

    const preferredGenres =
      Array.isArray(interests?.favoriteGenres)
        ? interests.favoriteGenres.slice(0, 6).map((g: string) => String(g).toLowerCase())
        : [];

    const listSignals = buildListTasteSignals(books, movies);
    const recentAuthors = listSignals.topAuthors.slice(0, 6);

    const hasBook = topCandidates.some((c) => c.isBook);
    const hasMovie = topCandidates.some((c) => !c.isBook);
    let mediaType: SuggestionsMediaType = 'mixed';
    if (activeFilter === 'movies') mediaType = 'movie';
    else if (activeFilter === 'books') mediaType = 'book';
    else if (!hasBook && hasMovie) mediaType = 'movie';
    else if (hasBook && !hasMovie) mediaType = 'book';
    else if (hasBook && hasMovie) mediaType = 'mixed';

    const mediaCandidates = topCandidates.map((c) => {
      const similarTo =
        c.category === 'semantic'
          ? c.reason.match(/^Semantically similar to "(.+)"$/)?.[1]
          : undefined;
      return {
        id: c.id,
        title: c.title,
        author: c.author,
        year: c.year,
        genres: c.genres || [],
        rating: c.rating || 0,
        estimatedLength: c.estimatedLength || 'medium',
        confidence: c.confidence || 0,
        isBook: c.isBook,
        ...(similarTo ? { similarToTitle: similarTo.slice(0, 80) } : {}),
      };
    });

    if (!mediaCandidates.length) return null;

    const refineMood = extractMoodSignals(refineText);
    const refineMoodActive = moodSignalsAreActionable(refineMood);

    return {
      mediaType,
      mode: 'rerank',
      maxResults: mediaCandidates.length,
      richTopThree: true,
      userFeatures: {
        preferredGenres,
        avoidGenres: [],
        lengthPreference:
          activeFilter === 'short' || activeFilter === 'medium' || activeFilter === 'long'
            ? activeFilter
            : 'any',
        minRating: 0,
        recentAuthors,
        additionalContext: refineText.trim() || undefined,
      },
      sessionSignals: {
        activeFilter,
        sortBy,
        recentInteractions: [],
      },
      candidates: mediaCandidates,
      userSummary: {
        topRated: tasteSnap.topRated,
        aggregates: tasteSnap.aggregates,
        ...(tasteProfileNarrative?.trim()
          ? {
              tasteNarrative: finalizeTasteNarrative(tasteProfileNarrative).slice(
                0,
                TASTE_NARRATIVE_REFINE_MAX_CHARS
              ),
            }
          : {}),
      },
      lovedHighlights: orderLovedHighlightsForRefine(
        tasteSnap.lovedHighlights,
        refineMoodActive ? refineMood : null
      ),
      ...(refineMoodActive && refineMood
        ? {
            refineContext: {
              phrase: refineText.trim().slice(0, 120),
              primaryTitleAnchors: refineMood.titleAnchors,
              secondaryAuthorAnchors: refineMood.authorAnchors,
              primaryGenreSlugs: refineMood.genreSlugs,
            },
          }
        : {}),
      includeFormatSuggestions: shouldIncludeFormatSuggestion(tasteSnap),
    };
  };

  // Handle saving items from the Add/Edit modal
  const handleSaveItem = (formData: any) => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Determine if it's a book or movie based on the format
    const isBook = formData.format === 'text' || formData.format === 'audio';
    
    if (isBook) {
      const newBook: any = {
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && { dateAdded: currentDate, percentage: 0 }),
        ...(formData.category === 'fails' && { dateAbandoned: currentDate }),
      };
      addBook(newBook);
    } else {
      const newMovie: any = {
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && { dateAdded: currentDate, percentage: 0 }),
        ...(formData.category === 'fails' && { dateAbandoned: currentDate }),
      };
      addMovie(newMovie);
    }
    setShowAddModal(false);
  };

  // Load dismissed suggestions and feedback from storage on component mount
  useEffect(() => {
    const loadFeedbackData = async () => {
      try {
        // Load dismissed suggestions
        const stored = await AsyncStorage.getItem('dismissedSuggestions');
        if (stored) {
          const dismissedData = JSON.parse(stored);
          // Handle both old format (array of strings) and new format (object with full data)
          if (Array.isArray(dismissedData)) {
            // Old format - convert to new format
            const newMap = new Map();
            dismissedData.forEach(id => {
              newMap.set(id, { id } as Suggestion);
            });
            setDismissedSuggestions(newMap);
          } else {
            // New format - object with full suggestion data
            const newMap = new Map();
            Object.entries(dismissedData).forEach(([id, suggestion]) => {
              newMap.set(id, suggestion as Suggestion);
            });
            setDismissedSuggestions(newMap);
          }
        }

        // Load granular ratings
        const storedRatings = await AsyncStorage.getItem('granularRatings');
        if (storedRatings) {
          try {
            const ratingsData = JSON.parse(storedRatings);
            const newMap = new Map();
            Object.entries(ratingsData).forEach(([id, rating]) => {
              if (rating && typeof rating === 'string' && ['loved', 'liked', 'meh', 'disliked'].includes(rating)) {
                newMap.set(id, rating as GranularRating);
              } else {
                console.warn('⚠️ Skipping invalid rating:', rating);
              }
            });
            setGranularRatings(newMap);
          } catch (error) {
            console.error('Error parsing granular ratings:', error);
            setGranularRatings(new Map());
          }
        }
      } catch (error) {
        console.error('Error loading feedback data:', error);
      }
    };

    loadFeedbackData();
  }, []);

  // Clear addedItems when user has empty lists (app restart scenario)
  useEffect(() => {
    const totalBooks = (books?.completed?.length || 0) + 
                      (books?.inProgress?.length || 0) + 
                      (books?.planned?.length || 0) + 
                      (books?.fails?.length || 0) + 
                      (books?.allTime?.length || 0);
    
    const totalMovies = (movies?.completed?.length || 0) + 
                       (movies?.inProgress?.length || 0) + 
                       (movies?.planned?.length || 0) + 
                       (movies?.fails?.length || 0) + 
                       (movies?.allTime?.length || 0);
    
    // If user has no items but addedItems has entries, clear addedItems
    if (totalBooks === 0 && totalMovies === 0 && addedItems.size > 0) {
      console.log('🔄 Clearing addedItems due to empty user lists (app restart)');
      setAddedItems(new Set());
    }
  }, [books, movies, addedItems.size]);

  // Save dismissed suggestions to storage whenever they change
  useEffect(() => {
    const saveDismissedSuggestions = async () => {
      try {
        const dismissedObject = Object.fromEntries(dismissedSuggestions);
        await AsyncStorage.setItem('dismissedSuggestions', JSON.stringify(dismissedObject));
      } catch (error) {
        console.error('Error saving dismissed suggestions:', error);
      }
    };

    if (dismissedSuggestions.size > 0) {
      saveDismissedSuggestions();
    }
  }, [dismissedSuggestions]);

  // Save granular ratings to storage whenever they change
  useEffect(() => {
    const saveGranularRatings = async () => {
      try {
        const ratingsObject = Object.fromEntries(granularRatings);
        await AsyncStorage.setItem('granularRatings', JSON.stringify(ratingsObject));
      } catch (error) {
        console.error('Error saving granular ratings:', error);
      }
    };

    if (granularRatings.size > 0) {
      saveGranularRatings();
    }
  }, [granularRatings]);
  
  useEffect(() => {
    console.log('📊 Suggestions - Force update triggered:', forceUpdate);
    setLocalForceUpdate(prev => prev + 1);
  }, [forceUpdate, books.planned.length, movies.planned.length]);

  // Debug: Track state changes with enhanced logging
  useEffect(() => {
    console.log('📊 Suggestions screen - Books state updated:', {
      completed: books.completed.length,
      inProgress: books.inProgress.length,
      planned: books.planned.length,
      fails: books.fails.length,
      allTime: books.allTime.length,
    });
    
    if (books.planned.length > 0) {
      console.log('📊 Planned books in suggestions screen:', books.planned.map(book => book.title));
    }
  }, [books]);

  useEffect(() => {
    console.log('📊 Suggestions screen - Movies state updated:', {
      completed: movies.completed.length,
      inProgress: movies.inProgress.length,
      planned: movies.planned.length,
      fails: movies.fails.length,
      allTime: movies.allTime.length,
    });
    
    if (movies.planned.length > 0) {
      console.log('📊 Planned movies in suggestions screen:', movies.planned.map(movie => movie.title));
    }
  }, [movies]);

  // Refresh suggestions function
  const handleRefresh = () => {
    if (isRefreshing) return;

    console.log('🔄 Refreshing suggestions...');
    setIsRefreshing(true);
    
    // Simulate refresh delay for better UX
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }

    refreshTimeoutRef.current = setTimeout(() => {
      setLastRefreshTime(new Date());
      setLocalForceUpdate(prev => prev + 1);
      setIsRefreshing(false);
      
      console.log('✅ Suggestions refreshed successfully');
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  // Removed hard-coded getSimilarWorks - now using API exclusively

  // Removed hard-coded genreBooks array - now using API exclusively

  // Removed hard-coded getAwardWinningBooks - now using API exclusively

  const estimatePages = (title: string): number => {
    const safe = String(title ?? '');
    const basePages = 250;
    const titleLength = safe.length;
    return Math.round(basePages + (titleLength * 5) + Math.random() * 100);
  };

  const estimateLength = (title: string): 'short' | 'medium' | 'long' => {
    const pages = estimatePages(String(title ?? ''));
    if (pages < 200) return 'short';
    if (pages < 400) return 'medium';
    return 'long';
  };

  // Helper functions for enhanced analysis
  const getSeason = (month: number): string => {
    if (month >= 2 && month <= 4) return 'Spring';
    if (month >= 5 && month <= 7) return 'Summer';
    if (month >= 8 && month <= 10) return 'Fall';
    return 'Winter';
  };

  const getReadingPace = (daysToComplete: number): string => {
    if (daysToComplete <= 3) return 'fast';
    if (daysToComplete <= 14) return 'moderate';
    if (daysToComplete <= 60) return 'slow';
    return 'very-slow';
  };

  const getCurrentSeason = (): string => {
    return getSeason(new Date().getMonth());
  };

  const genresForListItem = (item: {
    title: string;
    author: string;
    genres?: string[] | null;
  }): string[] => {
    if (Array.isArray(item.genres)) {
      const fromItem = item.genres.filter(
        (g): g is string => typeof g === 'string' && g.trim().length > 0
      );
      if (fromItem.length > 0) return fromItem;
    }
    return inferGenres(item.title, item.author);
  };

  const inferGenres = (title: string, author: string): string[] => {
    const lowerTitle = String(title ?? '').toLowerCase();
    const lowerAuthor = String(author ?? '').toLowerCase();
    
    const genres: string[] = [];
    
    // Mystery & Thriller
    if (lowerTitle.includes('murder') || lowerTitle.includes('death') || lowerTitle.includes('killer') || 
        lowerTitle.includes('detective') || lowerTitle.includes('crime') || lowerTitle.includes('mystery')) {
      genres.push('Mystery', 'Thriller');
    }
    
    // Romance
    if (lowerTitle.includes('love') || lowerTitle.includes('heart') || lowerTitle.includes('romance') || 
        lowerTitle.includes('wedding') || lowerTitle.includes('dating')) {
      genres.push('Romance');
    }
    
    // Science Fiction
    if (lowerTitle.includes('space') || lowerTitle.includes('robot') || lowerTitle.includes('alien') || 
        lowerTitle.includes('future') || lowerTitle.includes('dystopia') || lowerTitle.includes('cyber') ||
        lowerAuthor.includes('asimov') || lowerAuthor.includes('clarke') || lowerAuthor.includes('bradbury')) {
      genres.push('Science Fiction');
    }
    
    // Fantasy
    if (lowerTitle.includes('magic') || lowerTitle.includes('wizard') || lowerTitle.includes('dragon') || 
        lowerTitle.includes('kingdom') || lowerTitle.includes('quest') || lowerTitle.includes('sword') ||
        lowerAuthor.includes('tolkien') || lowerAuthor.includes('martin') || lowerAuthor.includes('rothfuss')) {
      genres.push('Fantasy');
    }
    
    // Adventure
    if (lowerTitle.includes('adventure') || lowerTitle.includes('journey') || lowerTitle.includes('expedition') || 
        lowerTitle.includes('treasure') || lowerTitle.includes('island') || lowerTitle.includes('explorer') ||
        lowerTitle.includes('pirate') || lowerTitle.includes('sailor') || lowerTitle.includes('travel') ||
        lowerAuthor.includes('verne') || lowerAuthor.includes('stevenson') || lowerAuthor.includes('haggard') ||
        lowerAuthor.includes('london') || lowerAuthor.includes('dumas')) {
      genres.push('Adventure');
    }
    
    // Historical Fiction
    if (lowerTitle.includes('war') || lowerTitle.includes('castle') || lowerTitle.includes('king') || 
        lowerTitle.includes('queen') || lowerTitle.includes('medieval') || lowerTitle.includes('ancient')) {
      genres.push('Historical Fiction');
    }
    
    // Contemporary Fiction
    if (lowerTitle.includes('family') || lowerTitle.includes('friendship') || lowerTitle.includes('life') || 
        lowerTitle.includes('modern') || lowerTitle.includes('city') || lowerTitle.includes('relationship')) {
      genres.push('Contemporary Fiction');
    }
    
    // Horror
    if (lowerTitle.includes('horror') || lowerTitle.includes('ghost') || lowerTitle.includes('haunted') || 
        lowerTitle.includes('monster') || lowerTitle.includes('vampire') || lowerTitle.includes('zombie') ||
        lowerAuthor.includes('king') || lowerAuthor.includes('koontz')) {
      genres.push('Horror');
    }
    
    // Literary Fiction
    if (lowerAuthor.includes('roth') || lowerAuthor.includes('franzen') || lowerAuthor.includes('eugenides') ||
        lowerAuthor.includes('foer') || lowerAuthor.includes('wallace')) {
      genres.push('Literary Fiction');
    }
    
    // Non-Fiction
    if (lowerTitle.includes('history') || lowerTitle.includes('biography') || lowerTitle.includes('memoir') || 
        lowerTitle.includes('science') || lowerTitle.includes('philosophy') || lowerTitle.includes('economics')) {
      genres.push('Non-Fiction');
    }
    
    // Young Adult
    if (lowerTitle.includes('teen') || lowerTitle.includes('school') || lowerTitle.includes('coming of age') ||
        lowerAuthor.includes('green') || lowerAuthor.includes('meyer') || lowerAuthor.includes('collins')) {
      genres.push('Young Adult');
    }
    
    return genres.length > 0 ? genres : ['Fiction'];
  };

  const isPastYearContent = (suggestion: Suggestion): boolean => {
    // Year filtering has been disabled - all content is allowed
    return false;
  };

  const isItemAlreadyAdded = (suggestion: Suggestion): boolean => {
    // Validate suggestion
    if (!suggestion || !suggestion.title || !suggestion.author) {
      console.warn('⚠️ Invalid suggestion in isItemAlreadyAdded:', suggestion);
      return false;
    }
    
    // Get all user items from all categories with safety checks
    const allUserItems = [
      ...(books?.completed || []),
      ...(books?.inProgress || []),
      ...(books?.planned || []),
      ...(books?.fails || []),
      ...(books?.allTime || []),
      ...(movies?.completed || []),
      ...(movies?.inProgress || []),
      ...(movies?.planned || []),
      ...(movies?.fails || []),
      ...(movies?.allTime || []),
    ].filter(item => item && item.title && item.author); // Filter out invalid items

    // Check if suggestion matches any existing item
    const isDuplicate = allUserItems.some(item => {
      if (!item || !item.title || !item.author) return false;
      
      // Enhanced normalization function
      const normalizeString = (str: string) => {
        return str
          .toLowerCase()
          .trim()
          .replace(/[^\w\s]/g, '') // Remove punctuation
          .replace(/\s+/g, ' ') // Normalize whitespace
          .replace(/^(the|a|an)\s+/i, '') // Remove articles from beginning
          .replace(/\s+(the|a|an)$/i, '') // Remove articles from end
          .replace(/\s+(vol|volume|part|chapter|book|series)\s*\d*/gi, '') // Remove volume/part indicators
          .replace(/\s*\([^)]*\)/g, '') // Remove parenthetical content
          .replace(/\s*\[[^\]]*\]/g, ''); // Remove bracketed content
      };
      
      const suggestionTitle = normalizeString(suggestion.title);
      const suggestionAuthor = normalizeString(suggestion.author);
      const itemTitle = normalizeString(item.title);
      const itemAuthor = normalizeString(item.author);
      
      // 1. Exact match after normalization
      const exactMatch = suggestionTitle === itemTitle && suggestionAuthor === itemAuthor;
      
      // 2. Author name variations (e.g., "J.K. Rowling" vs "Joanne Rowling")
      const authorVariations = [
        suggestionAuthor,
        suggestionAuthor.replace(/\s+/g, ''), // Remove spaces
        suggestionAuthor.replace(/\./g, ''), // Remove periods
        suggestionAuthor.split(' ').reverse().join(' '), // Reverse name order
      ];
      
      const authorMatch = authorVariations.some(authorVar => {
        const itemAuthorVariations = [
          itemAuthor,
          itemAuthor.replace(/\s+/g, ''),
          itemAuthor.replace(/\./g, ''),
          itemAuthor.split(' ').reverse().join(' '),
        ];
        return itemAuthorVariations.some(itemAuthorVar => 
          authorVar === itemAuthorVar || 
          authorVar.includes(itemAuthorVar) || 
          itemAuthorVar.includes(authorVar)
        );
      });
      
      // 3. Title similarity with author match
      const titleSimilarity = suggestionTitle.includes(itemTitle) || 
                             itemTitle.includes(suggestionTitle) ||
                             suggestionTitle.split(' ').slice(0, 3).join(' ') === itemTitle.split(' ').slice(0, 3).join(' '); // First 3 words match
      
      const partialMatch = titleSimilarity && authorMatch && 
        (suggestionTitle.length > 8 && itemTitle.length > 8); // Only for substantial titles
      
      // 4. Check for common abbreviations and variations
      const commonVariations = [
        { from: 'doctor', to: 'dr' },
        { from: 'professor', to: 'prof' },
        { from: 'mister', to: 'mr' },
        { from: 'misses', to: 'mrs' },
        { from: 'miss', to: 'ms' },
      ];
      
      const normalizedSuggestionAuthor = commonVariations.reduce((str, variation) => 
        str.replace(new RegExp(variation.from, 'gi'), variation.to), suggestionAuthor);
      const normalizedItemAuthor = commonVariations.reduce((str, variation) => 
        str.replace(new RegExp(variation.from, 'gi'), variation.to), itemAuthor);
      
      const abbreviationMatch = normalizedSuggestionAuthor === normalizedItemAuthor && 
                               suggestionTitle === itemTitle;
      
      const isMatch = exactMatch || partialMatch || abbreviationMatch;
      
      if (isMatch) {
        console.log(`🚫 Filtering out duplicate: "${suggestion.title}" by ${suggestion.author} matches "${item.title}" by ${item.author}`);
      }
      
      return isMatch;
    });

    return isDuplicate;
  };

  // Diversity scoring to ensure varied suggestions
  const calculateDiversityScore = (suggestion: Suggestion, existingSuggestions: Suggestion[]): number => {
    let diversityScore = 1.0;
    
    // Check for author diversity
    const authorCount = existingSuggestions.filter(s => s.author === suggestion.author).length;
    if (authorCount > 0) {
      diversityScore -= (authorCount * 0.2); // Penalize repeated authors
    }
    
    // Check for genre diversity
    const genreCount = existingSuggestions.filter(s => 
      s.genres && suggestion.genres && 
      s.genres.some(g => suggestion.genres!.includes(g))
    ).length;
    if (genreCount > 2) {
      diversityScore -= (genreCount * 0.1); // Penalize too many similar genres
    }
    
    // Check for year diversity
    const yearCount = existingSuggestions.filter(s => 
      Math.abs(s.year - suggestion.year) < 5
    ).length;
    if (yearCount > 3) {
      diversityScore -= (yearCount * 0.05); // Penalize too many books from same era
    }
    
    // Bonus for award-winning books
    if (suggestion.awards && suggestion.awards.length > 0) {
      diversityScore += 0.3;
    }
    
    // Bonus for different moods
    const moodKeywords = ['uplifting', 'dark', 'funny', 'emotional', 'thrilling', 'intellectual', 'romantic', 'mysterious'];
    const existingMoods = existingSuggestions.flatMap(s => 
      moodKeywords.filter(mood => 
        (s.description && typeof s.description === 'string' && s.description.toLowerCase().includes(mood)) || 
        (s.reason && typeof s.reason === 'string' && s.reason.toLowerCase().includes(mood))
      )
    );
    const suggestionMoods = moodKeywords.filter(mood => 
      (suggestion.description && typeof suggestion.description === 'string' && suggestion.description.toLowerCase().includes(mood)) || 
      (suggestion.reason && typeof suggestion.reason === 'string' && suggestion.reason.toLowerCase().includes(mood))
    );
    
    const uniqueMoods = suggestionMoods.filter(mood => !existingMoods.includes(mood));
    diversityScore += (uniqueMoods.length * 0.1);
    
    return Math.max(0.1, diversityScore); // Ensure minimum diversity score
  };

  // Generate intelligent suggestions based on user's data
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(true);
  const [isRefreshingForLowCount, setIsRefreshingForLowCount] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [spinValue] = useState(new Animated.Value(0));
  
  // Predictive preloading state
  const [predictiveCache, setPredictiveCache] = useState<Map<string, any[]>>(new Map());
  const [isPredictiveLoading, setIsPredictiveLoading] = useState(false);
  const [userBehaviorPatterns, setUserBehaviorPatterns] = useState<{
    preferredGenres: string[];
    searchHistory: string[];
    interactionTimes: number[];
    activeHours: number[];
    lastInteractionTime: number;
  }>({
    preferredGenres: [],
    searchHistory: [],
    interactionTimes: [],
    activeHours: [],
    lastInteractionTime: Date.now()
  });
  const generationRequestIdRef = useRef(0);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skip first run so we do not double-call generate with the books/movies effect on mount. */
  const refineContextEffectPrimedRef = useRef(false);
  const moodIntentBookRef = useRef<LlmMoodIntent | null>(null);
  const moodIntentMovieRef = useRef<LlmMoodIntent | null>(null);
  const [tasteProfileNarrative, setTasteProfileNarrative] = useState<string | null>(null);
  const hasTasteSnapshot = Boolean(tasteProfileNarrative?.trim());
  const showLlmAssistPanel = llmAssistConfigured || hasTasteSnapshot;

  const normalizeSuggestion = (input: any, fallbackIndex: number): Suggestion | null => {
    if (!input || typeof input !== 'object') return null;

    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const author = typeof input.author === 'string' ? input.author.trim() : '';
    if (!title || !author) return null;

    const numericYear = Number(input.year);
    const year =
      Number.isFinite(numericYear) && numericYear > 0
        ? Math.floor(numericYear)
        : new Date().getFullYear();

    const rawSource = String(input.source || '').toLowerCase();
    const source: Suggestion['source'] =
      rawSource === 'tmdb'
        ? 'tmdb'
        : (rawSource === 'googlebooks' || rawSource === 'api' || rawSource === 'openlibrary' || rawSource === 'nyt')
          ? 'googlebooks'
          : 'local';

    const safeCategory: Suggestion['category'] = (
      [
        'adventure',
        'literary',
        'contemporary',
        'award',
        'search',
        'genre',
        'seasonal',
        'trending',
        'similar',
        'author',
        'mood',
        'format',
        'predictive',
        'semantic',
      ] as const
    ).includes(input.category)
      ? input.category
      : 'genre';

    const isBook = Boolean(input.isBook);
    const format: Suggestion['format'] =
      input.format === 'audio' || input.format === 'streaming' ? input.format : 'text';

    const confidence = Math.max(0, Math.min(100, Number(input.confidence) || 60));
    const rating = Math.max(0, Math.min(5, Number(input.rating) || 0));
    const genres = Array.isArray(input.genres)
      ? input.genres.filter((genre: unknown) => typeof genre === 'string' && genre.trim().length > 0)
      : [];

    return {
      id:
        typeof input.id === 'string' && input.id.trim().length > 0
          ? input.id
          : `normalized-${fallbackIndex}-${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      author,
      year,
      format: isBook ? (format === 'streaming' ? 'text' : format) : 'streaming',
      rating,
      description: typeof input.description === 'string' ? input.description : '',
      genres,
      isBook,
      source,
      reason: typeof input.reason === 'string' && input.reason.trim() ? input.reason : 'Recommended for you',
      confidence,
      category: safeCategory,
      estimatedPages: typeof input.estimatedPages === 'number' ? input.estimatedPages : undefined,
      estimatedLength:
        input.estimatedLength === 'short' || input.estimatedLength === 'medium' || input.estimatedLength === 'long'
          ? input.estimatedLength
          : estimateLength(title),
      coverId: typeof input.coverId === 'number' ? input.coverId : undefined,
      isbn: typeof input.isbn === 'string' ? input.isbn : undefined,
      tmdbId: typeof input.tmdbId === 'number' ? input.tmdbId : undefined,
      posterPath: typeof input.posterPath === 'string' ? input.posterPath : undefined,
      mood: typeof input.mood === 'string' ? input.mood : undefined,
      awards: Array.isArray(input.awards) ? input.awards : undefined,
      weeksOnList: typeof input.weeksOnList === 'number' ? input.weeksOnList : undefined,
      nlpAnalysis: input.nlpAnalysis,
      semanticEmbedding: Array.isArray(input.semanticEmbedding) ? input.semanticEmbedding : undefined,
      similarItems: Array.isArray(input.similarItems) ? input.similarItems : undefined,
      semanticTags: Array.isArray(input.semanticTags) ? input.semanticTags : undefined,
    };
  };

  // Async function to generate suggestions
  const generateSuggestions = async (isLowCountRefresh: boolean = false) => {
    const requestId = ++generationRequestIdRef.current;
    console.log('🔍 ===== GENERATE SUGGESTIONS CALLED =====');
    console.log('🔍 isLowCountRefresh:', isLowCountRefresh);

    console.log('🔍 isSearching:', isSearching);
    
    // Add rate limiting to prevent excessive calls
    const now = Date.now();
    const lastCall = apiCache.get('last-suggestion-generation')?.timestamp || 0;
    if (now - lastCall < 2000 && !isLowCountRefresh) { // 2 second minimum between calls
      console.log('⏳ Rate limiting suggestion generation...');
      return;
    }
    
    apiCache.set('last-suggestion-generation', { data: [], timestamp: now });
    setIsLoadingSuggestions(true);

    try {
    const allSuggestions: Suggestion[] = [];

    const bookMoodSignals: MoodSignals | null = extractMoodSignals(llmBookRefineContext);
    const movieMoodSignals: MoodSignals | null = extractMoodSignals(llmMovieRefineContext);
    const bookMoodActive = moodSignalsAreActionable(bookMoodSignals);
    const movieMoodActive = moodSignalsAreActionable(movieMoodSignals);
    const bookRefinePhrase = llmBookRefineContext.trim();
    const movieRefinePhrase = llmMovieRefineContext.trim();
    const anyMoodActive = bookMoodActive || movieMoodActive;
    const listTasteSignals = buildListTasteSignals(books, movies);
    const includeMovies = userHasMovieListActivity(movies) && activeFilter !== 'books';
    const includeBooks = activeFilter !== 'movies';

    const moodForMedia = (isBook: boolean) =>
      isBook
        ? {
            signals: bookMoodSignals,
            active: bookMoodActive,
            phrase: bookRefinePhrase,
            intent: moodIntentBookRef.current,
          }
        : {
            signals: movieMoodSignals,
            active: movieMoodActive,
            phrase: movieRefinePhrase,
            intent: moodIntentMovieRef.current,
          };
    



    
    // Get user's completed items for analysis
    const completedBooks = books.completed;
    const completedMovies = movies.completed;
    const allTimeItems = [...books.allTime, ...movies.allTime];
    
    // Analyze user preferences
    const favoriteAuthors = new Map<string, number>();
    const favoriteGenres = new Map<string, number>();
    const preferredFormats = new Map<string, number>();
    const moodPatterns = new Map<string, number>();
    
    // Seasonal and temporal analysis
    const seasonalPreferences = new Map<string, number>();
    const readingPace = new Map<string, number>();
    const timeOfDayPreferences = new Map<string, number>();
    
    // Analyze completed items
    [...completedBooks, ...completedMovies].forEach(item => {
      const authorKey = typeof item.author === 'string' && item.author.trim() ? item.author.trim() : 'Unknown';
      // Author/Director preferences
      favoriteAuthors.set(
        authorKey,
        (favoriteAuthors.get(authorKey) || 0) + (item.rating || 3)
      );

      // Format preferences
      if (item.format) {
        preferredFormats.set(
          item.format,
          (preferredFormats.get(item.format) || 0) + 1
        );
      }

      // Genre analysis (use stored genres on movies when available)
      const itemGenres = genresForListItem(item);
      itemGenres.forEach(genre => {
        favoriteGenres.set(
          genre,
          (favoriteGenres.get(genre) || 0) + (item.rating || 3)
        );
      });

      // Enhanced mood analysis from notes
      if (item.notes != null && String(item.notes).trim()) {
        const notes = String(item.notes).toLowerCase();
        
        // Emotional moods
        if (notes.includes('inspiring') || notes.includes('uplifting') || notes.includes('motivational') || notes.includes('empowering')) {
          moodPatterns.set('uplifting', (moodPatterns.get('uplifting') || 0) + 1);
        }
        if (notes.includes('dark') || notes.includes('intense') || notes.includes('gritty') || notes.includes('disturbing')) {
          moodPatterns.set('dark', (moodPatterns.get('dark') || 0) + 1);
        }
        if (notes.includes('funny') || notes.includes('comedy') || notes.includes('humorous') || notes.includes('witty')) {
          moodPatterns.set('funny', (moodPatterns.get('funny') || 0) + 1);
        }
        if (notes.includes('sad') || notes.includes('melancholy') || notes.includes('emotional') || notes.includes('heartbreaking')) {
          moodPatterns.set('emotional', (moodPatterns.get('emotional') || 0) + 1);
        }
        if (notes.includes('thrilling') || notes.includes('exciting') || notes.includes('action') || notes.includes('adventure')) {
          moodPatterns.set('thrilling', (moodPatterns.get('thrilling') || 0) + 1);
        }
        if (notes.includes('thought-provoking') || notes.includes('philosophical') || notes.includes('deep') || notes.includes('complex')) {
          moodPatterns.set('intellectual', (moodPatterns.get('intellectual') || 0) + 1);
        }
        if (notes.includes('romantic') || notes.includes('sweet') || notes.includes('love story') || notes.includes('heartwarming')) {
          moodPatterns.set('romantic', (moodPatterns.get('romantic') || 0) + 1);
        }
        if (notes.includes('mysterious') || notes.includes('suspenseful') || notes.includes('twist') || notes.includes('surprising')) {
          moodPatterns.set('mysterious', (moodPatterns.get('mysterious') || 0) + 1);
        }
        
        // Seasonal and temporal analysis
        if (item.completedDate) {
          const completionDate = new Date(item.completedDate);
          const month = completionDate.getMonth();
          const season = getSeason(month);
          
          // Track seasonal genre preferences
          const itemGenres = inferGenres(item.title, item.author);
          itemGenres.forEach(genre => {
            const seasonalKey = `${season}-${genre}`;
            seasonalPreferences.set(
              seasonalKey,
              (seasonalPreferences.get(seasonalKey) || 0) + (item.rating || 3)
            );
          });
          
          // Track reading pace (if we have dateStarted)
          if (item.dateStarted) {
            const startDate = new Date(item.dateStarted);
            const daysToComplete = Math.ceil((completionDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysToComplete > 0 && daysToComplete < 365) { // Reasonable range
              const paceCategory = getReadingPace(daysToComplete);
              readingPace.set(paceCategory, (readingPace.get(paceCategory) || 0) + 1);
            }
          }
        }
      }
    });

    // Similar author suggestions now handled by API-based genre suggestions

    // Generate genre-based suggestions
    let topGenres = Array.from(favoriteGenres.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    // Use user interests if available and no reading history
    if (interests && interests.favoriteGenres.length > 0 && topGenres.length === 0) {
      console.log('🎯 Using user interests for initial recommendations');
      topGenres = interests.favoriteGenres.map(genre => [genre, 8]); // Default high score for user interests
    }

    const genresToFetch = new Set<string>([...topGenres.map(([genre]) => genre)]);
    if (bookMoodSignals?.genreSlugs?.length) {
      for (const slug of bookMoodSignals.genreSlugs.slice(0, 5)) {
        genresToFetch.add(slug);
      }
    }
    if (movieMoodSignals?.genreSlugs?.length) {
      for (const slug of movieMoodSignals.genreSlugs.slice(0, 5)) {
        genresToFetch.add(slug);
      }
    }
    if (bookMoodSignals?.genreSlugs?.length || movieMoodSignals?.genreSlugs?.length) {
      console.log('🎯 Refine picks: prioritizing genres', [
        ...(bookMoodSignals?.genreSlugs?.slice(0, 5) ?? []),
        ...(movieMoodSignals?.genreSlugs?.slice(0, 5) ?? []),
      ]);
    }
    if (!anyMoodActive && !genresToFetch.has('Adventure')) {
      genresToFetch.add('Adventure');
      console.log('🏔️ Adding Adventure as default genre for variety');
    }

    // Use API for genre suggestions instead of hard-coded data
    for (const genre of genresToFetch) {
      const score = favoriteGenres.get(genre) || 5; // Default score for Adventure
      if (includeBooks) {
        try {
          const genreSuggestions = await getEnhancedGenreSuggestions(
            genre,
            isLowCountRefresh,
            bookMoodSignals
          );
          genreSuggestions.slice(0, 3).forEach((book, index) => {
            allSuggestions.push({
              id: `genre-book-${genre}-${index}`,
              title: book.title,
              author: book.author,
              year: book.year,
              isBook: true,
              reason: buildListTasteReason(
                { title: book.title, author: book.author, genres: [genre] },
                listTasteSignals,
                {
                  refinePhrase: bookMoodActive ? bookRefinePhrase : undefined,
                  refineGenreSlugs: bookMoodSignals?.genreSlugs,
                }
              ),
              confidence: Math.min(90, 65 + (score / 5) * 10),
              category: 'genre' as const,
              format: book.format,
              rating: book.rating,
              description: book.description,
              estimatedPages: estimatePages(book.title),
              estimatedLength: estimateLength(book.title),
              genres: [genre],
              source: book.source || 'api',
            });
          });
        } catch (error) {
          console.warn(`Failed to fetch ${genre} book suggestions from API:`, error);
        }
      }
      if (includeMovies) {
        try {
          const movieGenre = bookGenreToMovieCatalogGenre(String(genre));
          const moviePicks = await fetchMoviesFromHardCodedData(movieGenre, 2, movieMoodSignals);
          moviePicks.forEach((movie, index) => {
            const genreList = Array.isArray(movie.genres) ? movie.genres : [genre];
            allSuggestions.push({
              id: `genre-movie-${genre}-${index}`,
              title: movie.title,
              author: movie.author,
              year: movie.year,
              isBook: false,
              reason: buildListTasteReason(
                { title: movie.title, author: movie.author, genres: genreList },
                listTasteSignals,
                {
                  refinePhrase: movieMoodActive ? movieRefinePhrase : undefined,
                  refineGenreSlugs: movieMoodSignals?.genreSlugs,
                }
              ),
              confidence: Math.min(
                90,
                68 +
                  listTasteMatchScore(
                    { title: movie.title, author: movie.author, genres: genreList },
                    listTasteSignals
                  )
              ),
              category: 'genre' as const,
              format: movie.format,
              rating: movie.rating,
              description: movie.description,
              estimatedLength: estimateLength(movie.title),
              genres: genreList,
              source: movie.source || 'hardcoded',
            });
          });
        } catch (error) {
          console.warn(`Failed to fetch ${genre} movie suggestions:`, error);
        }
      }
    }

    // Generate seasonal suggestions based on current season
    const currentSeason = getCurrentSeason();
    const seasonalGenreKeys = Array.from(seasonalPreferences.keys())
      .filter(key => key.startsWith(currentSeason))
      .sort((a, b) => (seasonalPreferences.get(b) || 0) - (seasonalPreferences.get(a) || 0))
      .slice(0, 2);

    if (!bookMoodActive && !seasonalGenreKeys.some(key => key.includes('Adventure'))) {
      seasonalGenreKeys.push(`${currentSeason}-Adventure`);
      console.log('🏔️ Adding Adventure to seasonal suggestions');
    }

    // Use API for seasonal suggestions
    for (const seasonalKey of seasonalGenreKeys) {
      const genre = seasonalKey.split('-')[1];
      const score = seasonalPreferences.get(seasonalKey) || 0;
      
      if (score > 5) { // Only suggest if user has strong seasonal preference
        try {
          const genreSuggestions = await getEnhancedGenreSuggestions(
            genre,
            isLowCountRefresh,
            bookMoodSignals
          );
          genreSuggestions.slice(0, 1).forEach((book, index) => {
            allSuggestions.push({
              id: `seasonal-${currentSeason}-${genre}-${index}`,
              title: book.title,
              author: book.author,
              year: book.year,
              isBook: true,
              reason: `Perfect ${currentSeason} reading - you enjoy ${genre} books this season`,
              confidence: Math.min(85, 60 + (score / 5) * 10),
              category: 'seasonal',
              format: book.format,
              rating: book.rating,
              description: book.description,
              estimatedPages: estimatePages(book.title),
              estimatedLength: estimateLength(book.title),
              genres: [genre],
              source: book.source || 'api',
            });
          });
        } catch (error) {
          console.warn(`Failed to fetch seasonal ${genre} suggestions from API:`, error);
        }
      }
    }

    // Generate award-winning book suggestions using API
    let topMoods = Array.from(moodPatterns.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2);

    // Use user mood preferences if available and no mood patterns
    if (interests && interests.moodPreferences.length > 0 && topMoods.length === 0) {
      console.log('🎭 Using user mood preferences for recommendations');
      topMoods = interests.moodPreferences.map(mood => [mood, 8]); // Default high score for user preferences
    }

    const includeLiteraryAwards =
      !bookMoodActive ||
      (bookMoodSignals?.genreSlugs?.includes('literary') ?? false) ||
      /\b(literary|booker|pulitzer|prize[\s-]?winning|debut novelist)\b/i.test(llmBookRefineContext);

    // Use API for award-winning books (literary fiction) — skipped when refine clearly points elsewhere
    if (includeLiteraryAwards) {
      try {
        const literaryBooks = await getEnhancedGenreSuggestions(
          'literary',
          isLowCountRefresh,
          bookMoodSignals
        );
        literaryBooks.slice(0, 3).forEach((book, index) => {
          const bookGenres = inferGenres(book.title, book.author);
          const hasMoodMatch = topMoods.some(([mood]) => 
            (book.description && typeof book.description === 'string' && book.description.toLowerCase().includes(mood)) ||
            bookGenres.some(genre => 
              ['Literary Fiction', 'Contemporary Fiction'].includes(genre)
            )
          );

          if (hasMoodMatch || bookGenres.some(genre => favoriteGenres.has(genre))) {
            allSuggestions.push({
              id: `award-${index}`,
              title: book.title,
              author: book.author,
              year: book.year,
              isBook: true,
              reason: `Award-winning literary fiction - matches your reading preferences`,
              confidence: 85,
              category: 'award',
              format: book.format,
              rating: book.rating,
              description: book.description,
              estimatedPages: estimatePages(book.title),
              estimatedLength: estimateLength(book.title),
              genres: bookGenres,
              awards: ['Literary Fiction'],
              source: book.source || 'api',
            });
          }
        });
      } catch (error) {
        console.warn('Failed to fetch award-winning suggestions from API:', error);
      }
    }

    // Generate trending suggestions using API
    const trendingItems: any[] = [];

    const moodMovieGenre =
      movieMoodActive && movieMoodSignals
        ? movieMoodSignals.genreSlugs.includes('horror')
          ? 'horror'
          : movieMoodSignals.genreSlugs.includes('romance')
            ? 'romance'
            : movieMoodSignals.genreSlugs.includes('mystery')
              ? 'thriller'
              : movieMoodSignals.genreSlugs.includes('science fiction')
                ? 'sci-fi'
                : /\b(comedy|funny|humou?r)\b/i.test(movieMoodSignals.rawLower)
                  ? 'comedy'
                  : /\b(drama)\b/i.test(movieMoodSignals.rawLower)
                    ? 'drama'
                    : 'action'
        : 'action';

    const defaultTrendingGenres = ['fantasy', 'contemporary', 'mystery', 'adventure'];
    const trendingBookGenres =
      bookMoodSignals?.genreSlugs?.length && bookMoodActive
        ? [...new Set([...bookMoodSignals.genreSlugs, ...defaultTrendingGenres])].slice(0, 6)
        : defaultTrendingGenres;

    if (includeBooks) {
      for (const genre of trendingBookGenres) {
        try {
          const genreBooks = await getEnhancedGenreSuggestions(
            genre,
            isLowCountRefresh,
            bookMoodSignals
          );
          trendingItems.push(...genreBooks.slice(0, 2));
        } catch (error) {
          console.warn(`Failed to fetch trending ${genre} books from API:`, error);
        }
      }
    }

    // Use preloaded data first, then fetch if needed
    try {
      const preloadedMovies = getPreloadedMovies();
      const preloadedBooks = getPreloadedBooks();

      if (includeMovies) {
        if (preloadedMovies && preloadedMovies.length > 0) {
          console.log('🎬 Using preloaded movies for trending');
          trendingItems.push(...preloadedMovies.slice(0, 6));
        } else {
          try {
            const popularMovies = await fetchMoviesFromHardCodedData(
              moodMovieGenre,
              6,
              movieMoodSignals
            );
            trendingItems.push(...popularMovies);
            console.log('🎬 Added movies to trending from catalog');
          } catch (error) {
            console.warn('Failed to fetch trending movies from hard-coded data:', error);
          }
        }
      }

      if (includeBooks && preloadedBooks && preloadedBooks.length > 0) {
        console.log('📚 Using preloaded books for trending');
        trendingItems.push(...preloadedBooks.slice(0, 5));
      }
    } catch (error) {
      console.error('❌ Error using preloaded data:', error);
    }

    trendingItems.forEach((item, index) => {
      allSuggestions.push({
        id: `trending-${index}`,
        title: item.title,
        author: item.author,
        year: item.year,
        isBook: item.isBook,
        reason: 'Highly rated pick from genre suggestions and our catalogs',
        confidence: 70,
        category: 'trending',
        format: item.format,
        rating: item.rating,
        description: item.description,
        genres: item.genres || [],
        source: item.source || 'local',
        estimatedPages: item.isBook ? estimatePages(item.title) : undefined,
        estimatedLength: estimateLength(item.title),
      });
    });

    // Generate genre-based suggestions using API - limit to avoid API overload
    const genreSuggestions: any[] = [];
    
    const priorityBookGenres =
      bookMoodActive && bookMoodSignals?.genreSlugs?.length
        ? [...new Set([...bookMoodSignals.genreSlugs, 'adventure', 'fantasy', 'mystery'])].slice(0, 5)
        : ['adventure', 'fantasy', 'mystery'];
    const priorityMovieGenres =
      movieMoodActive && movieMoodSignals?.genreSlugs?.length
        ? [...new Set([...movieMoodSignals.genreSlugs, 'action', 'drama', 'thriller'])].slice(0, 5)
        : ['action', 'drama', 'thriller'];

    for (const genre of priorityBookGenres) {
      if (includeBooks) {
        const apiBooks = await fetchBooksWithFallbacks(genre, 6, bookMoodSignals);
        if (apiBooks && apiBooks.length > 0) {
          genreSuggestions.push(...apiBooks);
        }
      }
    }

    if (includeMovies) {
      for (const genre of priorityMovieGenres) {
        try {
          const movieGenre = bookGenreToMovieCatalogGenre(genre);
          const apiMovies = await fetchMoviesFromHardCodedData(movieGenre, 4, movieMoodSignals);
          if (apiMovies.length > 0) {
            genreSuggestions.push(...apiMovies);
          }
        } catch (error) {
          console.warn(`Failed to fetch priority ${genre} movies:`, error);
        }
      }
    }

    genreSuggestions.forEach((work, index) => {
      const genreList = Array.isArray(work.genres)
        ? work.genres.filter((g: unknown): g is string => typeof g === 'string' && g.trim().length > 0)
        : typeof work.genre === 'string' && work.genre.trim()
          ? [work.genre.trim()]
          : [];
      const workMood = moodForMedia(Boolean(work.isBook));
      const listReason = buildListTasteReason(
        { title: work.title, author: work.author, genres: genreList },
        listTasteSignals,
        {
          refinePhrase: workMood.active ? workMood.phrase : undefined,
          refineGenreSlugs: workMood.signals?.genreSlugs,
        }
      );
      const listBoost = listTasteMatchScore(
        { title: work.title, author: work.author, genres: genreList },
        listTasteSignals
      );
      allSuggestions.push({
        id: `genre-${index}`,
        title: work.title,
        author: work.author,
        year: work.year,
        isBook: work.isBook,
        reason: listReason,
        confidence: Math.min(92, 68 + listBoost),
        category: 'genre',
        format: work.format,
        rating: work.rating || 4,
        description: work.description,
        genres: genreList.length > 0 ? genreList : ['general'],
        source: work.source || 'local',
        estimatedPages: work.isBook ? estimatePages(String(work.title ?? '')) : undefined,
        estimatedLength: estimateLength(String(work.title ?? '')),
      });
    });

    // Add predictive suggestions from cache
    const predictions = predictNextUserNeeds();
    console.log('🔮 Adding predictive suggestions for:', predictions);
    
    predictions.forEach(genre => {
      const predictiveSuggestions = getPredictiveSuggestions(genre);
      if (predictiveSuggestions.length > 0) {
        allSuggestions.push(...predictiveSuggestions.slice(0, 5)); // Limit to 5 per genre
        console.log(`✅ Added ${predictiveSuggestions.length} predictive suggestions for ${genre}`);
      }
    });

    // Filter out items that are already in user's lists
    // Temporarily disable aggressive filtering to debug infinite loop
    // Generate semantic similarity suggestions for regular recommendations
    if (allSuggestions.length > 0) {
      console.log('🧠 Generating semantic similarity suggestions for regular recommendations...');
      
      const referenceItem = [...allSuggestions].reduce((best, current) => {
        const mood = moodForMedia(current.isBook);
        if (!mood.active || !mood.signals) {
          return current.confidence > best.confidence ? current : best;
        }
        const scoreFor = (item: (typeof allSuggestions)[0]) =>
          scoreRowAgainstMood(
            {
              title: item.title,
              author: item.author,
              description: item.description,
              genres: item.genres || [],
            },
            mood.signals!
          ) +
          boostScoreWithLlmMoodIntent(
            {
              title: item.title,
              author: item.author,
              description: item.description,
              genres: item.genres || [],
              estimatedLength: item.estimatedLength,
            },
            mood.intent,
            mood.signals!
          );
        return scoreFor(current) > scoreFor(best) ? current : best;
      });
      
      const semanticSuggestions = generateSemanticSuggestions(referenceItem, allSuggestions);
      
      // Add semantic suggestions to the results (filtering out already added items and past year content)
      const filteredSemanticSuggestions = semanticSuggestions.slice(0, 2).filter(suggestion => 
        !isItemAlreadyAdded(suggestion) && !isPastYearContent(suggestion)
      );
      allSuggestions.push(...filteredSemanticSuggestions);
      console.log(`🧠 Added ${filteredSemanticSuggestions.length} semantic similarity suggestions (filtered from ${semanticSuggestions.slice(0, 2).length})`);
    }
    
    // Filter out items that are already in user's lists and past year content
    const normalizedSuggestions = allSuggestions
      .slice(0, MAX_CANDIDATE_SUGGESTIONS)
      .map((suggestion, index) => normalizeSuggestion(suggestion, index))
      .filter((suggestion): suggestion is Suggestion => suggestion !== null);

    const filteredSuggestions = normalizedSuggestions.filter(suggestion => 
      !isItemAlreadyAdded(suggestion) && !isPastYearContent(suggestion)
    );
    
    console.log(`📊 Suggestions generated: ${allSuggestions.length} total, ${filteredSuggestions.length} after filtering duplicates`);

    let pipelineSuggestions = filteredSuggestions;
    if (anyMoodActive) {
      const ranked = filteredSuggestions
        .map((s) => {
          const mood = moodForMedia(s.isBook);
          const baseScore = mood.active && mood.signals
            ? scoreRowAgainstMood(
                {
                  title: s.title,
                  author: s.author,
                  description: s.description,
                  genres: s.genres || [],
                },
                mood.signals
              ) +
              boostScoreWithLlmMoodIntent(
                {
                  title: s.title,
                  author: s.author,
                  description: s.description,
                  genres: s.genres || [],
                  estimatedLength: s.estimatedLength,
                },
                mood.intent,
                mood.signals
              )
            : 0;
          return { s, score: baseScore };
        })
        .sort(
          (a, b) =>
            b.score - a.score ||
            (b.s.confidence || 0) - (a.s.confidence || 0)
        );
      const strong = ranked.filter((x) => x.score >= 2);
      pipelineSuggestions =
        strong.length >= 12
          ? strong.map((x) => x.s)
          : ranked.slice(0, Math.max(18, Math.ceil(ranked.length * 0.55))).map((x) => x.s);
      pipelineSuggestions = pipelineSuggestions.map((s) => {
        if (!reasonNeedsLlmPolish(s.reason)) return s;
        const mood = moodForMedia(s.isBook);
        if (!mood.active || !mood.signals) return s;
        return {
          ...s,
          reason: buildListTasteReason(
            { title: s.title, author: s.author, genres: s.genres || [] },
            listTasteSignals,
            { refinePhrase: mood.phrase, refineGenreSlugs: mood.signals.genreSlugs }
          ),
        };
      });
      console.log(
        `🎯 Mood-aligned pool: ${filteredSuggestions.length} -> ${pipelineSuggestions.length} (refine picks)`
      );
    }

    const mergeLlmRefineBatch = async (
      pipeline: Suggestion[],
      refineText: string,
      isBook: boolean
    ): Promise<{ pipeline: Suggestion[]; status: string | null }> => {
      const mediaPipeline = pipeline.filter((s) => s.isBook === isBook);
      const mood = moodForMedia(isBook);
      const refineMoodActive = moodSignalsAreActionable(extractMoodSignals(refineText));
      if (!llmRefineEnabled || mediaPipeline.length === 0) {
        return { pipeline, status: null };
      }
      if (!refineText.trim() && !refineMoodActive) {
        return { pipeline, status: null };
      }

      const payload = buildSuggestionsRefinePayload(mediaPipeline, refineText);
      if (!payload) {
        return { pipeline, status: null };
      }

      const refinedResult = await refineSuggestionsWithLLM(payload);
      if (refinedResult.ok) {
        const refined = refinedResult.data;
        const byId = new Map(refined.items.map((item) => [item.id, item]));
        const merged = pipeline.map((suggestion) => {
          if (suggestion.isBook !== isBook) return suggestion;
          const llm = byId.get(suggestion.id);
          if (!llm) {
            return reasonNeedsLlmPolish(suggestion.reason)
              ? polishReasonIfStillGeneric(suggestion, listTasteSignals, {
                  refinePhrase: mood.active ? mood.phrase : undefined,
                  refineGenreSlugs: mood.signals?.genreSlugs,
                })
              : suggestion;
          }
          const primaryReason = trimSuggestionCopy(
            (typeof llm.explanation === 'string' && llm.explanation.trim().length > 0
              ? llm.explanation.trim()
              : llm.reason_short) || suggestion.reason,
            SUGGESTION_EXPLANATION_MAX_CHARS
          );
          const caveat =
            typeof llm.caveat === 'string' && llm.caveat.trim().length > 0
              ? trimSuggestionCopy(llm.caveat, SUGGESTION_CAVEAT_MAX_CHARS)
              : undefined;
          const formatSuggestion =
            typeof llm.format_suggestion === 'string' && llm.format_suggestion.trim().length > 0
              ? llm.format_suggestion.trim()
              : undefined;
          if (mood.active) {
            return {
              ...suggestion,
              reason: primaryReason,
              ...(caveat ? { llmCaveat: caveat } : {}),
              ...(formatSuggestion ? { llmFormatSuggestion: formatSuggestion } : {}),
            };
          }
          return {
            ...suggestion,
            confidence: Math.max(suggestion.confidence, Math.min(100, llm.score)),
            reason: primaryReason,
            ...(caveat ? { llmCaveat: caveat } : {}),
            ...(formatSuggestion ? { llmFormatSuggestion: formatSuggestion } : {}),
          };
        });
        const ra = refined.remaining_actions;
        const nearlyOut =
          typeof ra === 'number' && Number.isFinite(ra) && ra > 0 && ra <= 10;
        return {
          pipeline: mood.active ? merged : merged.sort((a, b) => b.confidence - a.confidence),
          status: nearlyOut ? `Few refinements left (${ra})` : null,
        };
      }

      return {
        pipeline: pipeline.map((s) =>
          s.isBook !== isBook
            ? s
            : reasonNeedsLlmPolish(s.reason)
              ? polishReasonIfStillGeneric(s, listTasteSignals, {
                  refinePhrase: mood.active ? mood.phrase : undefined,
                  refineGenreSlugs: mood.signals?.genreSlugs,
                })
              : s
        ),
        status: refinedResult.userMessage,
      };
    };

    let finalSuggestions = pipelineSuggestions;
    let refineStatus: string | null = null;
    if (llmRefineEnabled && pipelineSuggestions.length > 0) {
      if (includeBooks) {
        const bookBatch = await mergeLlmRefineBatch(
          finalSuggestions,
          llmBookRefineContext,
          true
        );
        finalSuggestions = bookBatch.pipeline;
        refineStatus = bookBatch.status ?? refineStatus;
      }
      if (includeMovies) {
        const movieBatch = await mergeLlmRefineBatch(
          finalSuggestions,
          llmMovieRefineContext,
          false
        );
        finalSuggestions = movieBatch.pipeline;
        refineStatus = movieBatch.status ?? refineStatus;
      }
      setLlmRefineStatus(refineStatus);
    } else {
      setLlmRefineStatus(null);
    }

    finalSuggestions = finalSuggestions.map((s) => {
      if (!reasonNeedsLlmPolish(s.reason)) return s;
      const mood = moodForMedia(s.isBook);
      return {
        ...s,
        reason: buildListTasteReason(
          { title: s.title, author: s.author, genres: s.genres || [] },
          listTasteSignals,
          mood.active
            ? { refinePhrase: mood.phrase, refineGenreSlugs: mood.signals?.genreSlugs }
            : undefined
        ),
      };
    });

    if (requestId === generationRequestIdRef.current) {
      setSuggestions(finalSuggestions.slice(0, MAX_RENDERED_SUGGESTIONS));
    }
    } catch (err) {
      console.error('❌ generateSuggestions failed:', err);
    } finally {
      if (requestId === generationRequestIdRef.current) {
        setIsLoadingSuggestions(false);
        setIsRefreshingForLowCount(false);
      }
    }
  };

  // Call generateSuggestions when books or movies change
  useEffect(() => {
    // Add debouncing to prevent excessive calls
    const timeoutId = setTimeout(() => {
      generateSuggestions();
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [books, movies]);

  useEffect(() => {
    if (!refineContextEffectPrimedRef.current) {
      refineContextEffectPrimedRef.current = true;
      return;
    }
    const timeoutId = setTimeout(() => {
      void (async () => {
        const bookPhrase = llmBookRefineContext.trim();
        const moviePhrase = llmMovieRefineContext.trim();
        if (llmRefineEnabled && bookPhrase.length >= 2) {
          moodIntentBookRef.current = await fetchMoodIntentFromProxy(bookPhrase);
        } else {
          moodIntentBookRef.current = null;
        }
        if (llmRefineEnabled && moviePhrase.length >= 2) {
          moodIntentMovieRef.current = await fetchMoodIntentFromProxy(moviePhrase);
        } else {
          moodIntentMovieRef.current = null;
        }
        generateSuggestions(true);
      })();
    }, 650);
    return () => clearTimeout(timeoutId);
  }, [llmBookRefineContext, llmMovieRefineContext, llmRefineEnabled]);

  useEffect(() => {
    if (!llmRefineEnabled) {
      setTasteProfileNarrative(null);
      return;
    }
    const tid = setTimeout(() => {
      void (async () => {
        try {
          const snap = buildTasteProfileSnapshot(books, movies);
          const raw = await AsyncStorage.getItem(TASTE_PROFILE_CACHE_KEY);
          let cached: { hash?: string; narrative?: string; cachedAt?: string } = {};
          if (raw) {
            try {
              cached = JSON.parse(raw) as { hash?: string; narrative?: string; cachedAt?: string };
            } catch {
              /* ignore */
            }
          }
          const cacheAge =
            typeof cached.cachedAt === 'string'
              ? Date.now() - new Date(cached.cachedAt).getTime()
              : Number.POSITIVE_INFINITY;
          const finalizeSnapshot = (raw: string) =>
            mergeFilmIntoTasteNarrative(
              finalizeTasteNarrative(raw),
              snap.aggregates.mediaSummary.listedMovies,
              snap.topRatedMovies.map((m) => ({ title: m.title, author: m.author })),
              snap.aggregates.topMovieGenres
            );

          if (
            cached.hash === snap.summaryHash &&
            typeof cached.narrative === 'string' &&
            cached.narrative.trim().length > 0 &&
            cacheAge < TASTE_PROFILE_CACHE_MAX_AGE_MS
          ) {
            setTasteProfileNarrative(finalizeSnapshot(cached.narrative));
            return;
          }
          const { narrative } = await fetchTasteProfileNarrative({
            summaryHash: snap.summaryHash,
            topRated: snap.topRated,
            topRatedBooks: snap.topRatedBooks,
            topRatedMovies: snap.topRatedMovies,
            aggregates: snap.aggregates,
          });
          if (narrative) {
            const finalized = finalizeSnapshot(narrative);
            await AsyncStorage.setItem(
              TASTE_PROFILE_CACHE_KEY,
              JSON.stringify({
                hash: snap.summaryHash,
                narrative: finalized,
                cachedAt: new Date().toISOString(),
              })
            );
            setTasteProfileNarrative(finalized);
          }
        } catch (e) {
          console.warn('taste profile fetch failed', e);
        }
      })();
    }, 2000);
    return () => clearTimeout(tid);
  }, [books, movies, llmRefineEnabled]);

  /** Re-run refine when taste narrative arrives so card copy can use the snapshot. */
  useEffect(() => {
    if (!llmRefineEnabled || !tasteProfileNarrative?.trim()) return;
    const tid = setTimeout(() => {
      if (suggestions.length > 0) {
        generateSuggestions(true);
      }
    }, 500);
    return () => clearTimeout(tid);
  }, [tasteProfileNarrative, llmRefineEnabled]);

  // Manage semantic cache periodically
  useEffect(() => {
    const cacheInterval = setInterval(() => {
      manageSemanticCache();
    }, 5 * 60 * 1000); // Every 5 minutes
    
    return () => clearInterval(cacheInterval);
  }, []);

  // Spinning animation for loading indicator
  useEffect(() => {
    if (isLoadingSuggestions) {
      spinValue.setValue(0);
      const spinAnimation = Animated.loop(
        Animated.timing(spinValue, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      );
      spinAnimation.start();
      
      return () => {
        spinAnimation.stop();
        spinValue.setValue(0);
      };
    }
  }, [isLoadingSuggestions, spinValue]);

  // Separate effect for auto-refresh when suggestions are low
  useEffect(() => {
    if (suggestions.length > 0 && !isRefreshingForLowCount) {
      const filteredSuggestions = suggestions.filter(suggestion => !granularRatings.has(suggestion.id) || granularRatings.get(suggestion.id) !== 'disliked');
      
      // Only trigger refresh if we have very few suggestions after filtering
      if (filteredSuggestions.length < 3) {
        console.log(`📡 Low suggestion count (${filteredSuggestions.length}) - triggering refresh`);
        setIsRefreshingForLowCount(true);
        setTimeout(() => {
          generateSuggestions(true);
        }, 2000); // Increased delay to prevent rapid calls
      }
    }
      }, [suggestions, granularRatings, isRefreshingForLowCount]);

  // Removed automatic search trigger to prevent infinite loops
  // Search will only be triggered manually via onSubmitEditing

  // Filter and sort suggestions
  const filteredAndSortedSuggestions = useMemo(() => {
    console.log('🔍 Starting filtering with', suggestions.length, 'suggestions');

    console.log('🔍 isSearching:', isSearching);
    console.log('🔍 Suggestions categories:', suggestions.map(s => ({ title: s.title || 'Unknown', category: s.category || 'unknown' })));
    
    // Safety check - ensure suggestions is an array
    if (!Array.isArray(suggestions)) {
      console.warn('⚠️ Suggestions is not an array:', suggestions);
      return [];
    }
    
    let filtered = suggestions;

    // Filter out thumbs down suggestions
            filtered = filtered.filter(suggestion => suggestion && suggestion.id && (!granularRatings.has(suggestion.id) || granularRatings.get(suggestion.id) !== 'disliked'));
    
    // Remove duplicates based on title and author
    const seenItems = new Set<string>();
    filtered = filtered.filter(suggestion => {
      if (!suggestion || !suggestion.title || !suggestion.author) {
        console.warn('⚠️ Invalid suggestion found:', suggestion);
        return false;
      }
      
      const key = `${suggestion.title.toLowerCase().trim()}-${suggestion.author.toLowerCase().trim()}-${suggestion.year || 0}-${suggestion.isBook ? 'book' : 'movie'}`;
      if (seenItems.has(key)) {
        return false; // Remove duplicate silently to reduce log noise
      }
      seenItems.add(key);
      return true;
    });
    
    // Removed auto-refresh logic from useMemo to prevent infinite loops
    
    // Boost confidence for thumbs up suggestions
    filtered = filtered.map(suggestion => {
      if (!suggestion || typeof suggestion !== 'object') {
        console.warn('⚠️ Invalid suggestion in map operation:', suggestion);
        return null;
      }
      
      // Ensure suggestion has required properties
      if (!suggestion.title || !suggestion.author || typeof suggestion.title !== 'string' || typeof suggestion.author !== 'string') {
        console.warn('⚠️ Suggestion missing required properties:', { title: suggestion.title, author: suggestion.author });
        return null;
      }
      
      let confidenceBoost = 0;
      
      if (granularRatings.size > 0) {
        const lovedGenres = Array.from(granularRatings.entries())
          .filter(([_, rating]) => rating === 'loved')
          .flatMap(([id, _]) => {
            const suggestion = suggestions.find(s => s.id === id);
            return suggestion?.genres || [];
          })
          .filter(genre => genre && typeof genre === 'string' && genre.trim().length > 0);
        
        const lovedAuthors = Array.from(granularRatings.entries())
          .filter(([_, rating]) => rating === 'loved')
          .map(([id, _]) => {
            const suggestion = suggestions.find(s => s.id === id);
            return suggestion?.author || '';
          })
          .filter(author => author && typeof author === 'string' && author.trim().length > 0);
        
        // Debug logging to see what we're working with
        if (lovedGenres.length > 0 || lovedAuthors.length > 0) {
          console.log(`🔍 Processing loved content data for ${suggestion.title}:`, {
            lovedGenres: lovedGenres,
            lovedAuthors: lovedAuthors,
            suggestionGenres: suggestion.genres,
            suggestionAuthor: suggestion.author
          });
        }
        
        // Boost confidence for same genres (loved content gets higher weight)
        if (suggestion.genres && Array.isArray(suggestion.genres) && suggestion.genres.some(genre => 
          genre && typeof genre === 'string' && lovedGenres.some(lovedGenre => 
            lovedGenre && typeof lovedGenre === 'string' && 
            (lovedGenre.toLowerCase().includes(genre.toLowerCase()) || 
             genre.toLowerCase().includes(lovedGenre.toLowerCase()))
          )
        )) {
          confidenceBoost += 25; // Higher boost for loved content
          console.log(`❤️ Boosting confidence for ${suggestion.title} due to loved genre match`);
        }
        
        // Boost confidence for same authors (loved content gets higher weight)
        if (suggestion.author && typeof suggestion.author === 'string' && lovedAuthors.some(author => 
          author && typeof author === 'string' && 
          (suggestion.author.toLowerCase().includes(author.toLowerCase()) || 
           author.toLowerCase().includes(suggestion.author.toLowerCase()))
        )) {
          confidenceBoost += 30; // Higher boost for loved content
          console.log(`❤️ Boosting confidence for ${suggestion.title} due to loved author match`);
        }
      }
      
      return {
        ...suggestion,
        confidence: Math.min(95, suggestion.confidence + confidenceBoost)
      };
    }).filter((suggestion): suggestion is Suggestion => suggestion !== null); // Remove any null values



    // Apply type and genre filters
    if (activeFilter === 'books') {
      filtered = filtered.filter(s => s.isBook);
    } else if (activeFilter === 'movies') {
      console.log('🎬 Movies filter applied - checking suggestions with isBook property');
      const movieSuggestions = filtered.filter(s => !s.isBook);
      console.log(`🎯 Found ${movieSuggestions.length} movie suggestions:`, movieSuggestions.map(s => s.title));
      filtered = movieSuggestions;

    } else if (activeFilter === 'short' || activeFilter === 'medium' || activeFilter === 'long') {
      filtered = filtered.filter(s => s.estimatedLength === activeFilter);
    } else if (activeFilter === 'semantic') {
      // Show only semantic similarity suggestions
      filtered = filtered.filter(s => s.category === 'semantic');
      
      // If no semantic suggestions, generate some based on current suggestions
      if (filtered.length === 0 && suggestions.length > 0) {
        console.log('🧠 No semantic suggestions found, generating new ones...');
        const referenceItem = suggestions[0];
        const semanticSuggestions = generateSemanticSuggestions(referenceItem, suggestions);
        // Filter out already added items and past year content from semantic suggestions
        filtered = semanticSuggestions.filter(suggestion => 
          !isItemAlreadyAdded(suggestion) && !isPastYearContent(suggestion)
        );
      }
    }

    // Apply diversity scoring to ensure varied suggestions
    const scoredSuggestions = filtered.map(suggestion => ({
      ...suggestion,
      diversityScore: calculateDiversityScore(suggestion, filtered.filter(s => s.id !== suggestion.id))
    }));

    // Sort suggestions with diversity consideration
    scoredSuggestions.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          // Combine confidence with diversity score
          const aScore = (a.confidence * 0.7) + (a.diversityScore * 30);
          const bScore = (b.confidence * 0.7) + (b.diversityScore * 30);
          return bScore - aScore;
        case 'length':
          const aPages = a.estimatedPages || 0;
          const bPages = b.estimatedPages || 0;
          return aPages - bPages;
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'year':
          return b.year - a.year;
        default:
          // Default combines confidence with diversity
          const aDefaultScore = (a.confidence * 0.7) + (a.diversityScore * 30);
          const bDefaultScore = (b.confidence * 0.7) + (b.diversityScore * 30);
          return bDefaultScore - aDefaultScore;
      }
    });

    // Remove diversity score from final output
    let sortedSuggestions = scoredSuggestions.map(({ diversityScore, ...suggestion }) => suggestion);

    const listSignals = buildListTasteSignals(books, movies);
    sortedSuggestions = sortedSuggestions.map((suggestion) => {
      const listBoost = listTasteMatchScore(
        { title: suggestion.title, author: suggestion.author, genres: suggestion.genres || [] },
        listSignals
      );
      if (listBoost <= 0) return suggestion;
      return {
        ...suggestion,
        confidence: Math.min(95, suggestion.confidence + listBoost),
      };
    });
    sortedSuggestions.sort((a, b) => b.confidence - a.confidence);

    console.log('🔍 Final filtered and sorted suggestions:', sortedSuggestions.length);
    console.log('🔍 Final suggestions:', sortedSuggestions.map(s => ({ title: s.title, category: s.category })));

    return sortedSuggestions;
      }, [suggestions, activeFilter, sortBy, dismissedSuggestions, granularRatings, books, movies]);

  // Completely rewritten handleAddToList with proper state management and NO rating pre-population
  const handleAddToList = async (suggestion: Suggestion) => {
    console.log('🎯 Starting handleAddToList for:', suggestion.title);
    
    // Prevent duplicate additions
    if (addedItems.has(suggestion.id) || isProcessing.has(suggestion.id)) {
      console.log('⚠️ Item already added or processing:', suggestion.id);
      setAlertConfig({
        title: 'Already Added',
        message: `"${suggestion.title}" is already in your list or being processed.`,
        type: 'warning'
      });
      setShowAlert(true);
      return;
    }

    // Mark as processing immediately
    setIsProcessing(prev => new Set(prev).add(suggestion.id));

    try {
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Determine format prioritizing user preferences over suggestion formats
      const determineFormat = () => {
        if (suggestion.isBook) {
          // For books, prioritize user's default format over suggestion format
          // Only use suggestion format if it's specific (not generic "text")
          if (suggestion.format && suggestion.format !== 'text') {
            return suggestion.format;
          }
          return settings.defaultBookFormat;
        } else {
          // For movies, prioritize user's default format over suggestion format
          // Only use suggestion format if it's specific (not generic "streaming")
          if (suggestion.format && suggestion.format !== 'streaming') {
            return suggestion.format;
          }
          return settings.defaultMovieFormat;
        }
      };

      const usedFormat = determineFormat();
      
      // Create the base item with all required fields and proper defaults
      // IMPORTANT: Do NOT pre-populate rating - always set to 0 for planned items
      const baseItem = {
        title: suggestion.title,
        author: suggestion.author,
        publicationYear: suggestion.year, // FIXED: Use suggestion.year instead of suggestion.publicationYear
        category: 'planned' as const,
        notes: `Suggested: ${suggestion.reason}`,
        rating: 0, // FIXED: Always 0 for suggestions, no pre-population
        format: usedFormat,
        percentage: 0, // Always 0 for planned items
        source: suggestion.isBook ? settings.defaultBookSource : settings.defaultMovieSource,
        dateAdded: currentDate,
        isAllTime: false,
      };

      console.log('📝 Created base item:', baseItem);
      console.log('⚙️ Using default settings:', {
        bookFormat: settings.defaultBookFormat,
        movieFormat: settings.defaultMovieFormat,
        bookSource: settings.defaultBookSource,
        movieSource: settings.defaultMovieSource
      });
      console.log('🎯 Format decision:', {
        suggestionFormat: suggestion.format,
        usedFormat: usedFormat,
        isBook: suggestion.isBook,
        defaultFormat: suggestion.isBook ? settings.defaultBookFormat : settings.defaultMovieFormat
      });

      // Add to the appropriate list with proper error handling
      if (suggestion.isBook) {
        console.log('📚 Adding book:', baseItem);
        addBook({
          ...baseItem,
          format: usedFormat as "text" | "audio" | "ebook" | undefined
        });
        console.log('📚 Book addition completed');
        
      } else {
        console.log('🎬 Adding movie:', baseItem);
        addMovie({
          ...baseItem,
          format: usedFormat as "streaming" | "theater" | "bluray" | "dvd" | undefined
        });
        console.log('🎬 Movie addition completed');
      }

      // Mark as added in local state
      setAddedItems(prev => {
        const newSet = new Set(prev);
        newSet.add(suggestion.id);
        console.log('✅ Marked as added in local state:', suggestion.id);
        return newSet;
      });

      // Force immediate re-render
      setLocalForceUpdate(prev => prev + 1);

      // Clear immediate feedback and show success animation
      setImmediateFeedback(prev => {
        const newSet = new Set(prev);
        newSet.delete(suggestion.id);
        return newSet;
      });
      
      console.log('🎉 Showing success animation for:', suggestion.id);
      setSuccessAnimation(prev => {
        const newSet = new Set(prev).add(suggestion.id);
        console.log('🎉 Success animation state updated:', Array.from(newSet));
        return newSet;
      });
      
      // Hide success animation after 1000ms (increased for visibility)
      setTimeout(() => {
        console.log('🎉 Hiding success animation for:', suggestion.id);
        setSuccessAnimation(prev => {
          const newSet = new Set(prev);
          newSet.delete(suggestion.id);
          console.log('🎉 Success animation state after hiding:', Array.from(newSet));
          return newSet;
        });
      }, 1000);

      console.log('✅ Successfully completed handleAddToList');

    } catch (error) {
      console.error('❌ Error in handleAddToList:', error);
      
      // Detailed error reporting
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setAlertConfig({
        title: 'Addition Failed',
        message: `Failed to add "${suggestion.title}" to your list.\n\nError: ${errorMessage}\n\nPlease try again or restart the app.`,
        type: 'error'
      });
      setShowAlert(true);
    } finally {
      // Remove from processing set
      setIsProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(suggestion.id);
        return newSet;
      });
    }
  };

  const handleGranularRating = (suggestion: Suggestion, rating: GranularRating) => {
    const currentRating = granularRatings.get(suggestion.id);
    
    if (currentRating === rating) {
      // If same rating is clicked again, remove it (toggle off)
      console.log(`🔄 Removing ${rating} rating for suggestion:`, suggestion.title);
      setGranularRatings(prev => {
        const newMap = new Map(prev);
        newMap.delete(suggestion.id);
        return newMap;
      });
    } else {
      // Set new rating
      console.log(`${RATING_CONFIG[rating!].icon} ${rating} rating for suggestion:`, suggestion.title);
      
      setGranularRatings(prev => new Map(prev).set(suggestion.id, rating));
      
      // Update behavior patterns for predictive preloading
              updateUserBehaviorPatterns('thumbs_up', {
        rating: rating,
        weight: RATING_CONFIG[rating!].weight,
        genres: suggestion.genres || [],
        title: suggestion.title,
        author: suggestion.author
      });
      
      // Generate semantic similarity suggestions for loved content
      if (rating === 'loved') {
        console.log('🧠 Generating semantic suggestions based on loved rating...');
        const semanticSuggestions = generateSemanticSuggestions(suggestion, suggestions);
        
        if (semanticSuggestions.length > 0) {
          // Add semantic suggestions to the current suggestions (filtering out already added items)
          setSuggestions(prev => {
            const newSuggestions = [...prev];
            semanticSuggestions.slice(0, 2).forEach(semanticSuggestion => {
              // Check if this semantic suggestion is already in the list, already added to user's lists, or is past year content
              const exists = newSuggestions.some(s => s.id === semanticSuggestion.id);
              const alreadyAdded = isItemAlreadyAdded(semanticSuggestion);
              const isPastYear = isPastYearContent(semanticSuggestion);
              if (!exists && !alreadyAdded && !isPastYear) {
                newSuggestions.push(semanticSuggestion);
              }
            });
            return newSuggestions;
          });
          
          console.log(`🧠 Added ${semanticSuggestions.slice(0, 2).length} semantic suggestions based on loved rating`);
        }
      }
      
      // No popup - just silently record the feedback
    }
  };



  /** Badge copy from ordinal position in feed (confidence-sorted): first rows never all duplicate one label when n≥2. */
  const matchBadgeLabel = (
    confidence: number,
    indexInFeed: number,
    feedTotal: number
  ) => {
    const c = Math.max(0, Math.min(100, Number.isFinite(confidence) ? confidence : 0));
    if (c < 38) return 'Worth exploring';
    const n = Math.max(feedTotal, 1);
    const idx = Math.min(Math.max(indexInFeed, 0), n - 1);
    if (n <= 1) {
      if (c >= 86) return 'Great match';
      if (c >= 68) return 'Strong match';
      return 'Worth exploring';
    }

    // First two picks always differentiate (fixes “every card says Great” at top of long lists).
    if (idx === 0) return 'Great match';
    if (idx === 1) return 'Strong match';

    const tail = idx - 2;
    const tailN = Math.max(n - 2, 1);
    const firstBreak = Math.max(1, Math.floor(tailN / 3));
    const secondBreak = Math.max(firstBreak + 1, Math.floor((2 * tailN) / 3));
    if (tail < firstBreak) return 'Great match';
    if (tail < secondBreak) return 'Strong match';
    return 'Worth exploring';
  };

  const toggleDescriptionExpansion = (suggestionId: string) => {
    setExpandedDescriptions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(suggestionId)) {
        newSet.delete(suggestionId);
      } else {
        newSet.add(suggestionId);
      }
      return newSet;
    });
  };

  const renderSuggestionCard = ({
    item: suggestion,
    index,
  }: {
    item: Suggestion;
    index: number;
  }) => {
    const isAdded = addedItems.has(suggestion.id);
    const isProcessingItem = isProcessing.has(suggestion.id);
    const isShowingSuccess = successAnimation.has(suggestion.id);
    const isShowingImmediateFeedback = immediateFeedback.has(suggestion.id);
    const isLoved = granularRatings.get(suggestion.id) === 'loved';
    const addAccent = suggestion.isBook ? AMBER_PRIMARY : MOVIE_WARM;

    return (
      <View style={styles.suggestionCard}>
        <TouchableOpacity
          style={styles.favoriteCornerHit}
          onPress={() => handleGranularRating(suggestion, 'loved')}
          accessibilityRole="button"
          accessibilityLabel={
            isLoved ? `Remove ${suggestion.title} from favorites signals` : `Love ${suggestion.title}`
          }
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Heart
            size={22}
            color={isLoved ? AMBER_PRIMARY : '#A8A29E'}
            {...(isLoved ? { fill: AMBER_PRIMARY } : { fill: 'none' })}
            strokeWidth={2}
          />
        </TouchableOpacity>

        <View style={styles.suggestionCardBody}>
          <Pressable
            disabled={
              !suggestion.description || expandedDescriptions.has(suggestion.id)
            }
            onPress={() => {
              if (suggestion.description) {
                toggleDescriptionExpansion(suggestion.id);
              }
            }}
            style={({ pressed }) => [
              styles.suggestionPressableOutline,
              Boolean(suggestion.description) &&
                !expandedDescriptions.has(suggestion.id) &&
                pressed &&
                styles.suggestionPressablePressed,
            ]}
            accessibilityRole={
              suggestion.description && !expandedDescriptions.has(suggestion.id)
                ? 'button'
                : 'none'
            }
            accessibilityLabel={
              suggestion.description && !expandedDescriptions.has(suggestion.id)
                ? 'Show detail for this recommendation'
                : undefined
            }
          >
            <View style={styles.suggestionHeader}>
              <View style={styles.suggestionType}>
                {suggestion.isBook ? (
                  <BookOpen size={16} color={AMBER_PRIMARY} />
                ) : (
                  <Film size={16} color={MOVIE_WARM} />
                )}
                <Text style={styles.typeText}>{suggestion.isBook ? 'Book' : 'Movie'}</Text>
              </View>
              <View style={styles.matchQualityPill}>
                <Text style={styles.matchQualityPillText}>
                  {matchBadgeLabel(
                    suggestion.confidence,
                    index,
                    filteredAndSortedSuggestions.length
                  )}
                </Text>
              </View>
            </View>

            <Text style={styles.suggestionTitle} numberOfLines={3}>
              {suggestion.title}
            </Text>
            <Text style={styles.suggestionReasonLead} numberOfLines={4}>
              {suggestion.reason}
            </Text>
            {suggestion.llmCaveat ? (
              <Text style={styles.suggestionLlmCaveat} numberOfLines={2}>
                {suggestion.llmCaveat}
              </Text>
            ) : null}
            {suggestion.llmFormatSuggestion ? (
              <View style={styles.suggestionFormatChip}>
                <Text style={styles.suggestionFormatChipText}>
                  {suggestion.llmFormatSuggestion === 'audio'
                    ? 'Audio-friendly'
                    : suggestion.llmFormatSuggestion === 'text'
                      ? 'Print / ebook'
                      : suggestion.llmFormatSuggestion === 'streaming'
                        ? 'Streaming'
                        : suggestion.llmFormatSuggestion}
                </Text>
              </View>
            ) : null}
            <Text style={styles.suggestionAuthor}>by {suggestion.author}</Text>

            <View style={styles.suggestionMetaCompact}>
              {suggestion.rating ? (
                <View style={styles.ratingContainer}>
                  <Star size={13} color={AMBER_PRIMARY} fill={AMBER_PRIMARY} />
                  <Text style={styles.ratingTextStrong}>{Number(suggestion.rating).toFixed(1)}</Text>
                </View>
              ) : null}
              {suggestion.estimatedPages ? (
                <Text style={styles.metaTextInline}>{suggestion.rating ? ' · ' : ''}~{suggestion.estimatedPages} pp</Text>
              ) : null}
              {!suggestion.isBook && suggestion.estimatedLength ? (
                <Text style={styles.metaTextInline}>
                  {suggestion.rating || suggestion.estimatedPages ? ' · ' : ''}
                  {suggestion.estimatedLength}
                </Text>
              ) : null}
            </View>

            {suggestion.category === 'semantic' && (
              <View style={styles.semanticTag}>
                <Lightbulb size={12} color={AMBER_DARK} />
                <Text style={styles.semanticTagText}>Semantically similar</Text>
              </View>
            )}

            {suggestion.description && !expandedDescriptions.has(suggestion.id) ? (
              <Text style={styles.detailRevealHint}>Tap card for synopsis</Text>
            ) : null}
          </Pressable>

          {suggestion.description && expandedDescriptions.has(suggestion.id) ? (
            <View style={styles.expandedDetailBlock}>
              <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => toggleDescriptionExpansion(suggestion.id)}
                accessibilityRole="button"
                accessibilityLabel="Hide synopsis"
              >
                <Text style={styles.detailCollapse}>Show less</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.addButtonFullWidth,
              { backgroundColor: addAccent },
              (isShowingSuccess || isShowingImmediateFeedback) && styles.successButtonWarm,
              !isShowingSuccess &&
                !isShowingImmediateFeedback &&
                (isAdded || isProcessingItem) &&
                styles.addedButtonWarm,
            ]}
            onPress={() => {
              setImmediateFeedback((prev) => new Set(prev).add(suggestion.id));
              handleAddToList(suggestion);
            }}
            disabled={isAdded || isProcessingItem || isShowingSuccess || isShowingImmediateFeedback}
            accessibilityRole="button"
            accessibilityLabel={isAdded ? `${suggestion.title} added to list` : `Add ${suggestion.title} to list`}
            accessibilityHint={
              isAdded ? 'This item has been added to your planned list' : 'Adds this pick to your planned list'
            }
          >
            {isShowingSuccess || isShowingImmediateFeedback ? (
              <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
            ) : (
              <Plus size={18} color="#FFFFFF" strokeWidth={2.5} />
            )}
            <Text style={styles.addButtonText}>
              {isShowingSuccess || isShowingImmediateFeedback
                ? 'Added!'
                : isProcessingItem
                  ? 'Adding…'
                  : isAdded
                    ? `Added to ${suggestion.isBook ? 'books' : 'movies'}`
                    : 'Add to list'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.notForMeButton}
            onPress={() => handleGranularRating(suggestion, 'disliked')}
            accessibilityRole="button"
            accessibilityLabel={`Not for me — hide ${suggestion.title}`}
            accessibilityHint="We will show fewer picks like this"
          >
            <Text style={styles.notForMeText}>Not for me</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const filterOptions = [
    { key: 'all', label: 'All', icon: Sparkles },
    { key: 'books', label: 'Books', icon: BookOpen },
    { key: 'movies', label: 'Movies', icon: Film },
    { key: 'short', label: 'Short', icon: Clock },
    { key: 'medium', label: 'Medium', icon: TrendingUp },
    { key: 'long', label: 'Long', icon: Heart },
    { key: 'semantic', label: 'Similar', icon: Lightbulb },
  ];

  const sortOptions = [
    { key: 'confidence', label: 'Confidence' },
    { key: 'length', label: 'Length' },
    { key: 'rating', label: 'Rating' },
    { key: 'year', label: 'Year' },
  ];

  const handleExport = async () => {
    try {
      const exportText = generateComprehensiveExport();
      
      // Platform-aware export handling
      if (Platform.OS === 'web') {
        // For web, create a downloadable file
        const blob = new Blob([exportText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fiftylist-export-${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        // For mobile, use Share API
        if (Share.share) {
          await Share.share({
            message: exportText,
            title: 'FiftyList — My Complete Reading & Watching List',
          });
        } else {
          // Fallback for platforms where Share is not available
          Alert.alert(
            'Export Complete', 
            'Your data has been prepared for export. Please copy the text from the console.',
            [
              { text: 'OK', onPress: () => console.log('Export data:', exportText) }
            ]
          );
        }
      }
    } catch (error) {
      console.error('Error sharing:', error);
      
      // Enhanced error handling with platform-specific messages
      const errorMessage = Platform.OS === 'web' 
        ? 'Failed to download export file. Please try again.'
        : 'Failed to export data. Please try again.';
        
      Alert.alert('Export Error', errorMessage);
    }
  };

  // External API integration for large book catalogs
  const fetchBooksFromAPI = async (genre: string, limit: number = 20): Promise<any[]> => {
    if (!GOOGLE_BOOKS_API_KEY) {
      return [];
    }

    try {
      // Example: Google Books API
      const query = encodeURIComponent(`${genre} fiction`);
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=${limit}&orderBy=relevance&key=${GOOGLE_BOOKS_API_KEY}`
      );
      
      if (!response.ok) {
        console.warn('API request failed, returning empty array');
        return [];
      }
      
      const data = await response.json();
      return data.items?.map((item: any) => ({
        title: item.volumeInfo.title,
        author: item.volumeInfo.authors?.[0] || 'Unknown Author',
        year: item.volumeInfo.publishedDate?.split('-')[0] || 2000,
        format: "text",
        rating: 4,
        description: item.volumeInfo.description || 'No description available',
        genres: [genre],
        isBook: true,
        source: 'api'
      })) || [];
      
    } catch (error) {
      console.error('Error fetching from API:', error);
      return [];
    }
  };



  // NYT Bestsellers API integration
  const fetchNYTBestsellers = async (category: string = 'combined-fiction'): Promise<any[]> => {
    if (!NYT_API_KEY) {
      return [];
    }

    try {
      const response = await fetch(
        `https://api.nytimes.com/svc/books/v3/lists/current/${category}.json?api-key=${NYT_API_KEY}`
      );
      
      if (!response.ok) {
        return [];
      }
      
      const data = await response.json();
      return data.results?.books?.map((book: any) => ({
        title: book.title,
        author: book.author,
        year: new Date().getFullYear(),
        format: "text",
        rating: 4,
        description: book.description || 'New York Times Bestseller',
        genres: ['Bestseller'],
        isBook: true,
        source: 'nyt',
        weeksOnList: book.weeks_on_list
      })) || [];
      
    } catch (error) {
      console.error('Error fetching NYT bestsellers:', error);
      return [];
    }
  };



  // Cache for API results to avoid repeated calls
  const apiCache = new Map<string, { data: any[], timestamp: number }>();
  const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

  // Semantic similarity cache
  const semanticCache: SemanticCache = {
    embeddings: new Map(),
    similarityMatrix: new Map(),
    lastUpdated: Date.now(),
    cacheSize: 0,
    maxCacheSize: SEMANTIC_CONFIG.MAX_CACHE_SIZE
  };

  // Enhanced genre suggestions (catalog-first; optional mood re-ranks within genre)
  const getEnhancedGenreSuggestions = async (
    genre: string,
    isLowCountRefresh: boolean = false,
    mood: MoodSignals | null = null
  ): Promise<any[]> => {
    try {
      const limit = isLowCountRefresh ? 30 : 20; // Fetch more content for low count refresh
      console.log(`📚 Fetching ${genre} books from catalog (limit: ${limit})...`);
      const apiBooks = await fetchBooksFromHardCodedData(genre, limit, mood);
      
      if (apiBooks.length > 0) {
        console.log(`✅ Found ${apiBooks.length} ${genre} books from catalog`);
        return apiBooks;
      }
    } catch (error) {
      console.warn(`⚠️ Google Books API failed for ${genre}, using local fallback:`, error);
    }
    
    // Fallback to local data
    console.log(`📚 Using local fallback data for ${genre}`);
    return await fetchBooksFromLocalFallback(genre, isLowCountRefresh ? 30 : 20);
  };

  // TMDB API functions
  const fetchMoviesFromTMDB = async (category: 'popular' | 'top_rated' | 'now_playing', limit: number = 10): Promise<any[]> => {
    const cacheKey = `tmdb-movies-${category}-${limit}`;
    const now = Date.now();
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log(`🎬 Using cached TMDB movies data for ${category}`);
      return cached.data;
    }

    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) {
        console.warn(
          '⚠️ TMDB API key not configured. Set EXPO_PUBLIC_TMDB_API_KEY in .env or EAS secrets.'
        );
        return [];
      }

      console.log(`🌐 Fetching ${limit} ${category} movies from TMDB...`);

      const response = await fetch(
        `${TMDB_BASE_URL}/movie/${category}?api_key=${apiKey}&language=en-US&page=1`
      );
      
      if (!response.ok) {
        throw new Error(`TMDB API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        console.warn(`No movies found for category: ${category}`);
        return [];
      }

      const movies = data.results
        .filter((movie: any) => movie.title && movie.release_date)
        .map((movie: any) => ({
          title: movie.title,
          author: movie.director || 'Various Directors',
          year: new Date(movie.release_date).getFullYear(),
          format: "streaming",
          rating: Math.round(movie.vote_average / 2), // Convert 10-point scale to 5-point
          description: movie.overview || `A ${movie.genre_ids?.length ? 'popular' : ''} movie released in ${new Date(movie.release_date).getFullYear()}.`,
          genres: ['Movie'],
          isBook: false,
          source: 'tmdb',
          tmdbId: movie.id,
          posterPath: movie.poster_path
        }))
        .slice(0, limit);

      // Cache the results
      apiCache.set(cacheKey, { data: movies, timestamp: now });
      
      console.log(`✅ Fetched ${movies.length} ${category} movies from TMDB`);
      return movies;
      
    } catch (error) {
      console.error(`❌ Error fetching from TMDB for ${category}:`, error);
      return [];
    }
  };



  // OpenLibrary API function removed - using Google Books API + local fallback instead
  /*
  const fetchBooksFromOpenLibrary = async (genre: string, limit: number = 20): Promise<any[]> => {
    // Rate limiting: ensure we don't exceed 1 request per 3 seconds to avoid API overload
    const now = Date.now();
    const lastRequestTime = apiCache.get('last-openlibrary-request')?.timestamp || 0;
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < 3000) {
      console.log(`⏱️ Rate limiting: waiting ${3000 - timeSinceLastRequest}ms before next OpenLibrary request`);
      await new Promise(resolve => setTimeout(resolve, 3000 - timeSinceLastRequest));
    }
    const cacheKey = `openlibrary-${genre}-${limit}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
      console.log(`📚 Using cached OpenLibrary data for ${genre}`);
      return cached.data;
    }

    try {
      console.log(`🌐 Fetching ${limit} ${genre} books from OpenLibrary...`);
      
      // Map genre names to better search terms
      const searchTerms = {
        'fantasy': 'fantasy fiction',
        'scifi': 'science fiction',
        'mystery': 'mystery fiction',
        'adventure': 'adventure fiction',
        'literary': 'literary fiction',
        'contemporary': 'contemporary fiction',
        'romance': 'romance fiction',
        'horror': 'horror fiction',
        'historical': 'historical fiction',
        'young adult': 'young adult fiction'
      };

      let searchTerm = searchTerms[genre as keyof typeof searchTerms] || `${genre} fiction`;
      
      // Special handling for adventure to include outdoor adventure non-fiction
      if (genre === 'adventure') {
        console.log('🏔️ Adventure genre detected - will search for both fiction and outdoor adventure non-fiction');
        // We'll handle this with multiple searches below
      }
      
      let allBooks: any[] = [];
      
      if (genre === 'adventure') {
        // For adventure, search multiple categories to get outdoor adventure books
        const adventureSearches = [
          'adventure fiction',
          'outdoor adventure',
          'mountain climbing',
          'wilderness survival',
          'expedition',
          'exploration'
        ];
        
        console.log('🏔️ Searching multiple adventure categories:', adventureSearches);
        
        // Search each category and combine results
        for (const searchTerm of adventureSearches) {
          const query = encodeURIComponent(searchTerm);
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / adventureSearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          } else if (response.status === 500) {
            console.warn(`⚠️ OpenLibrary API server error (500) for "${searchTerm}" - skipping`);
          } else {
            console.warn(`⚠️ OpenLibrary API error ${response.status} for "${searchTerm}" - skipping`);
          }
          
          // Rate limiting between requests
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else if (genre === 'literary') {
        // For literary fiction, search multiple categories
        const literarySearches = [
          'literary fiction',
          'modern literature',
          'contemporary literature',
          'award winning fiction',
          'booker prize',
          'pulitzer prize fiction',
          'national book award'
        ];
        
        console.log('📖 Searching multiple literary categories:', literarySearches);
        
        for (const searchTerm of literarySearches) {
          const query = encodeURIComponent(searchTerm);
                      const response = await fetch(
              `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / literarySearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
            );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else if (genre === 'contemporary') {
        // For contemporary fiction, search multiple categories
        const contemporarySearches = [
          'contemporary fiction',
          'modern fiction',
          '21st century fiction',
          'current fiction',
          'recent fiction',
          'modern novels'
        ];
        
        console.log('📚 Searching multiple contemporary categories:', contemporarySearches);
        
        for (const searchTerm of contemporarySearches) {
          const query = encodeURIComponent(searchTerm);
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / contemporarySearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else if (genre === 'award') {
        // For award-winning books, search multiple award categories
        const awardSearches = [
          'pulitzer prize',
          'booker prize',
          'national book award',
          'nobel prize literature',
          'man booker prize',
          'pen faulkner award',
          'national book critics circle'
        ];
        
        console.log('🏆 Searching multiple award categories:', awardSearches);
        
        for (const searchTerm of awardSearches) {
          const query = encodeURIComponent(searchTerm);
          const response = await fetch(
            `https://openlibrary.org/search.json?q=${query}&limit=${Math.ceil(limit / awardSearches.length)}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.docs && data.docs.length > 0) {
              allBooks.push(...data.docs);
              console.log(`✅ Found ${data.docs.length} books for "${searchTerm}"`);
            }
          }
          
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        // For other genres, use single search
        const query = encodeURIComponent(searchTerm);
        const response = await fetch(
          `https://openlibrary.org/search.json?q=${query}&limit=${limit}&fields=title,author_name,first_publish_year,subject,cover_i,key,first_sentence,description&sort=rating`
        );
        
        if (!response.ok) {
          if (response.status === 500) {
            console.warn(`⚠️ OpenLibrary API server error (500) for ${genre} - skipping this genre`);
            return [];
          }
          throw new Error(`OpenLibrary API error: ${response.status}`);
        }
        
        const data = await response.json();
        allBooks = data.docs || [];
      }
      
      if (!allBooks || allBooks.length === 0) {
        console.warn(`No books found for genre: ${genre}`);
        return [];
      }

      const books = allBooks
        .filter((doc: any) => doc.title && doc.author_name && doc.first_publish_year)
        .map((doc: any) => {
          // Use user's preferred format if available, otherwise default to "text"
          let format = "text";
          if (interests && interests.preferredFormats.length > 0) {
            if (interests.preferredFormats.includes('ebook')) {
              format = "ebook";
            } else if (interests.preferredFormats.includes('audiobook')) {
              format = "audiobook";
            } else if (interests.preferredFormats.includes('text')) {
              format = "text";
            }
          }

          // Enhanced genre detection for different book types
          let detectedGenres = [genre];
          if (genre === 'adventure') {
            // Analyze subjects to determine if it's outdoor adventure
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            const author = doc.author_name[0]?.toLowerCase() || '';
            
            // Check for outdoor adventure indicators
            const outdoorKeywords = [
              'mountain', 'climbing', 'expedition', 'wilderness', 'survival',
              'exploration', 'outdoor', 'adventure', 'hiking', 'mountaineering',
              'everest', 'k2', 'alpine', 'rock climbing', 'ice climbing'
            ];
            
            const hasOutdoorContent = outdoorKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            );
            
            if (hasOutdoorContent) {
              detectedGenres = ['Adventure', 'Outdoor Adventure', 'Non-Fiction'];
            }
          } else if (genre === 'literary') {
            // Enhanced detection for literary fiction
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            
            const literaryKeywords = [
              'literary fiction', 'modern literature', 'contemporary literature',
              'booker prize', 'pulitzer prize', 'national book award'
            ];
            
            const hasLiteraryContent = literaryKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            );
            
            if (hasLiteraryContent) {
              detectedGenres = ['Literary Fiction', 'Modern Literature'];
            }
          } else if (genre === 'contemporary') {
            // Enhanced detection for contemporary fiction
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            const year = doc.first_publish_year || 2000;
            
            const contemporaryKeywords = [
              'contemporary fiction', 'modern fiction', '21st century',
              'current fiction', 'recent fiction', 'modern novels'
            ];
            
            const hasContemporaryContent = contemporaryKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            ) || year >= 2000;
            
            if (hasContemporaryContent) {
              detectedGenres = ['Contemporary Fiction', 'Modern Fiction'];
            }
          } else if (genre === 'award') {
            // Enhanced detection for award-winning books
            const subjects = doc.subject || [];
            const title = doc.title.toLowerCase();
            
            const awardKeywords = [
              'pulitzer prize', 'booker prize', 'national book award',
              'nobel prize', 'man booker', 'pen faulkner', 'critics circle'
            ];
            
            const hasAwardContent = awardKeywords.some(keyword => 
              title.includes(keyword) || 
              subjects.some((subject: string) => subject.toLowerCase().includes(keyword))
            );
            
            if (hasAwardContent) {
              detectedGenres = ['Award-Winning', 'Literary Fiction'];
            }
          }

          // Extract the first sentence from the array, preferring English
          const firstSentence = Array.isArray(doc.first_sentence) 
            ? doc.first_sentence.find((sentence: any) => 
                typeof sentence === 'string' && 
                /^[a-zA-Z]/.test(sentence) && 
                sentence.length > 20 &&
                // Additional English filtering - avoid common non-English patterns
                !sentence.includes('à') && 
                !sentence.includes('é') && 
                !sentence.includes('ç') &&
                !sentence.includes('ñ') &&
                !sentence.includes('ü') &&
                !sentence.includes('ö') &&
                !sentence.includes('ä')
              ) || doc.first_sentence.find((sentence: any) => 
                typeof sentence === 'string' && 
                /^[a-zA-Z]/.test(sentence) && 
                sentence.length > 20
              ) || doc.first_sentence[0] || ''
            : doc.first_sentence || '';
          
          // Generate a meaningful description from available data
          let finalDescription = `A ${detectedGenres.join(', ')} book by ${doc.author_name[0] || 'Unknown Author'}.`;
          
          if (doc.description) {
            // If API has a description, use it
            finalDescription = doc.description;
          } else if (firstSentence && firstSentence.length > 30) {
            // If we have a substantial first sentence, create a better description
            const subjects = doc.subject || [];
            const author = doc.author_name[0] || 'Unknown Author';
            const year = doc.first_publish_year || '';
            
            // Extract key subjects for a better description
            const keySubjects = subjects
              .filter((subject: string) => 
                typeof subject === 'string' && 
                subject.length > 3 && 
                !subject.includes('Fiction') &&
                !subject.includes('Reading Level') &&
                !subject.includes('Study') &&
                !subject.includes('Texts')
              )
              .slice(0, 3);
            
            if (keySubjects.length > 0) {
              finalDescription = `A ${keySubjects.join(', ').toLowerCase()} novel by ${author}${year ? ` (${year})` : ''}. ${firstSentence}`;
            } else {
              finalDescription = `A ${detectedGenres.join(', ')} novel by ${author}${year ? ` (${year})` : ''}. ${firstSentence}`;
            }
          }
                      console.log('📚 Book data for', doc.title, ':', {
              has_api_description: !!doc.description,
              api_description_length: doc.description?.length || 0,
              has_first_sentence: !!firstSentence,
              first_sentence_length: firstSentence?.length || 0,
              pages: doc.number_of_pages_median,
              rating: doc.ratings_average,
              rating_count: doc.ratings_count,
              language: doc.language,
              publisher: doc.publisher
            });
          
                     // Perform NLP analysis on the book content
           const analysisText = doc.description || firstSentence || `A ${detectedGenres.join(', ')} book by ${doc.author_name[0] || 'Unknown Author'}.`;
           const nlpAnalysis = performNLPContentAnalysis(
             analysisText,
             doc.title,
             doc.author_name[0] || 'Unknown Author',
             doc.subject || []
           );
           
           return {
             title: doc.title,
             author: doc.author_name[0] || 'Unknown Author',
             year: doc.first_publish_year || 2000,
             format,
             rating: 4,
             description: doc.description || firstSentence || `A ${detectedGenres.join(', ')} book by ${doc.author_name[0] || 'Unknown Author'}.`,
             genres: detectedGenres,
             isBook: true,
             source: 'openlibrary',
             coverId: doc.cover_i,
             openLibraryKey: doc.key,
             nlpAnalysis: nlpAnalysis
           };
        })
        .slice(0, limit);

      // Cache the results
      apiCache.set(cacheKey, { data: books, timestamp: now });
      
      // Track this request for rate limiting
      apiCache.set('last-openlibrary-request', { data: [], timestamp: now });
      
      console.log(`✅ Fetched ${books.length} ${genre} books from OpenLibrary`);
      if (genre === 'adventure') {
        console.log('🏔️ Adventure books returned:', books.map((b: any) => ({ title: b.title, author: b.author, genres: b.genres })));
      }
      return books;
      
    } catch (error) {
      console.error(`❌ Error fetching from OpenLibrary for ${genre}:`, error);
      
      // Try to use cached data even if expired
      const cached = apiCache.get(cacheKey);
      if (cached && cached.data.length > 0) {
        console.log(`📚 Using expired cached data for ${genre} due to API error`);
        return cached.data;
      }
      
      // Simple error handling without complex retry logic
      console.log(`⚠️ Skipping retry for ${genre} to avoid complexity`);
      return [];
    }
  };
  */

  // NLP Content Analysis Functions
  const performNLPContentAnalysis = (text: string, title: string, author: string, subjects: string[] = []): NLPContentAnalysis => {
    const analysis: NLPContentAnalysis = {
      sentiment: analyzeSentiment(text, title, subjects),
      topics: extractTopics(text, title, subjects),
      complexity: analyzeComplexity(text),
      style: analyzeStyle(text, title),
      content: analyzeContent(text, title, subjects)
    };
    
    console.log('🧠 NLP Analysis for', title, ':', analysis);
    return analysis;
  };

  const analyzeSentiment = (text: string, title: string, subjects: string[]): NLPContentAnalysis['sentiment'] => {
    // Simple sentiment analysis based on keyword patterns
    const positiveWords = ['love', 'joy', 'happy', 'beautiful', 'amazing', 'wonderful', 'exciting', 'inspiring', 'hope', 'success', 'victory', 'triumph', 'adventure', 'discovery'];
    const negativeWords = ['death', 'sad', 'angry', 'fear', 'horror', 'tragedy', 'loss', 'pain', 'suffering', 'betrayal', 'war', 'violence', 'darkness', 'despair'];
    const emotionalWords = ['passion', 'rage', 'terror', 'ecstasy', 'melancholy', 'euphoria', 'dread', 'wonder'];
    
    const allText = `${text} ${title} ${subjects.join(' ')}`.toLowerCase();
    
    let positiveScore = 0;
    let negativeScore = 0;
    let emotionalIntensity = 0;
    
    positiveWords.forEach(word => {
      const matches = (allText.match(new RegExp(word, 'g')) || []).length;
      positiveScore += matches * 0.1;
    });
    
    negativeWords.forEach(word => {
      const matches = (allText.match(new RegExp(word, 'g')) || []).length;
      negativeScore += matches * 0.1;
    });
    
    emotionalWords.forEach(word => {
      const matches = (allText.match(new RegExp(word, 'g')) || []).length;
      emotionalIntensity += matches * 0.2;
    });
    
    const sentimentScore = Math.max(-1, Math.min(1, positiveScore - negativeScore));
    const magnitude = Math.min(1, (positiveScore + negativeScore + emotionalIntensity) / 10);
    
    const emotions: string[] = [];
    if (positiveScore > negativeScore) emotions.push('joy');
    if (negativeScore > positiveScore) emotions.push('sadness');
    if (emotionalIntensity > 0.5) emotions.push('surprise');
    if (allText.includes('fear') || allText.includes('horror')) emotions.push('fear');
    if (allText.includes('anger') || allText.includes('rage')) emotions.push('anger');
    
    return {
      score: sentimentScore,
      magnitude: magnitude,
      emotions: emotions
    };
  };

  const extractTopics = (text: string, title: string, subjects: string[]): NLPContentAnalysis['topics'] => {
    // Topic extraction based on keywords and subject analysis
    const allText = `${text} ${title} ${subjects.join(' ')}`.toLowerCase();
    
    const topicKeywords = {
      adventure: ['adventure', 'exploration', 'journey', 'quest', 'expedition', 'climbing', 'mountaineering', 'survival'],
      romance: ['love', 'romance', 'relationship', 'marriage', 'dating', 'passion', 'affair'],
      mystery: ['mystery', 'detective', 'crime', 'investigation', 'clue', 'suspense', 'thriller'],
      fantasy: ['fantasy', 'magic', 'wizard', 'dragon', 'kingdom', 'quest', 'mythical'],
      scifi: ['science fiction', 'space', 'technology', 'future', 'robot', 'alien', 'dystopia'],
      historical: ['history', 'historical', 'war', 'battle', 'ancient', 'medieval', 'victorian'],
      psychological: ['psychology', 'mental', 'mind', 'consciousness', 'therapy', 'trauma', 'memory'],
      philosophical: ['philosophy', 'meaning', 'existence', 'morality', 'ethics', 'truth', 'reality'],
      social: ['society', 'social', 'class', 'inequality', 'politics', 'culture', 'community'],
      nature: ['nature', 'environment', 'wildlife', 'conservation', 'outdoors', 'landscape', 'ecology']
    };
    
    const primary: string[] = [];
    const secondary: string[] = [];
    const themes: string[] = [];
    
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      let score = 0;
      keywords.forEach(keyword => {
        const matches = (allText.match(new RegExp(keyword, 'g')) || []).length;
        score += matches;
      });
      
      if (score > 2) {
        primary.push(topic);
      } else if (score > 0) {
        secondary.push(topic);
      }
    });
    
    // Extract themes from subjects and text
    const themeKeywords = ['coming of age', 'redemption', 'betrayal', 'sacrifice', 'identity', 'freedom', 'justice', 'revenge', 'forgiveness', 'transformation'];
    themeKeywords.forEach(theme => {
      if (allText.includes(theme)) {
        themes.push(theme);
      }
    });
    
    return { primary, secondary, themes };
  };

  const analyzeComplexity = (text: string): NLPContentAnalysis['complexity'] => {
    // Flesch-Kincaid readability analysis
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const syllables = countSyllables(text);
    
    const avgSentenceLength = words.length / Math.max(sentences.length, 1);
    const avgSyllablesPerWord = syllables / Math.max(words.length, 1);
    
    // Simplified Flesch-Kincaid score (0-100, higher = more complex)
    const readabilityScore = Math.min(100, Math.max(0, 
      206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord)
    ));
    
    let vocabularyLevel = 'intermediate';
    if (readabilityScore > 70) vocabularyLevel = 'elementary';
    else if (readabilityScore < 30) vocabularyLevel = 'advanced';
    
    const sentenceComplexity = Math.min(1, avgSentenceLength / 25); // Normalize to 0-1
    
    return {
      readabilityScore,
      vocabularyLevel,
      sentenceComplexity
    };
  };

  const countSyllables = (text: string): number => {
    // Simplified syllable counting
    const words = text.toLowerCase().split(/\s+/);
    let count = 0;
    
    words.forEach(word => {
      // Remove common suffixes that don't add syllables
      word = word.replace(/[.,!?;:]/g, '');
      if (word.length <= 3) {
        count += 1;
      } else {
        // Count vowel groups
        const vowelGroups = word.match(/[aeiouy]+/g) || [];
        count += Math.max(1, vowelGroups.length);
      }
    });
    
    return count;
  };

  const analyzeStyle = (text: string, title: string): NLPContentAnalysis['style'] => {
    const allText = `${text} ${title}`.toLowerCase();
    
    // Tone analysis
    let tone = 'conversational';
    if (allText.includes('research') || allText.includes('study') || allText.includes('analysis')) {
      tone = 'academic';
    } else if (allText.includes('formal') || allText.includes('official') || allText.includes('document')) {
      tone = 'formal';
    } else if (allText.includes('casual') || allText.includes('informal') || allText.includes('chat')) {
      tone = 'casual';
    }
    
    // Pacing analysis
    let pacing = 'moderate';
    const shortSentences = text.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length < 10).length;
    const totalSentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    const shortSentenceRatio = shortSentences / Math.max(totalSentences, 1);
    
    if (shortSentenceRatio > 0.7) pacing = 'fast';
    else if (shortSentenceRatio < 0.3) pacing = 'slow';
    
    // Narrative structure analysis
    let narrativeStructure = 'linear';
    if (allText.includes('flashback') || allText.includes('memory') || allText.includes('past')) {
      narrativeStructure = 'non-linear';
    } else if (allText.includes('episode') || allText.includes('chapter') || allText.includes('story')) {
      narrativeStructure = 'episodic';
    }
    
    return { tone, pacing, narrativeStructure };
  };

  const analyzeContent = (text: string, title: string, subjects: string[]): NLPContentAnalysis['content'] => {
    const allText = `${text} ${title} ${subjects.join(' ')}`.toLowerCase();
    
    // Genre indicators
    const genreIndicators: string[] = [];
    const genrePatterns = {
      'young adult': ['teen', 'adolescent', 'coming of age', 'high school', 'college'],
      'children': ['child', 'kid', 'elementary', 'picture book', 'middle grade'],
      'adult': ['adult', 'mature', 'explicit', 'graphic', 'violence'],
      'academic': ['research', 'study', 'analysis', 'thesis', 'dissertation'],
      'commercial': ['bestseller', 'popular', 'mainstream', 'blockbuster']
    };
    
    Object.entries(genrePatterns).forEach(([genre, keywords]) => {
      if (keywords.some(keyword => allText.includes(keyword))) {
        genreIndicators.push(genre);
      }
    });
    
    // Target audience
    let targetAudience = 'general';
    if (allText.includes('teen') || allText.includes('young adult')) targetAudience = 'young adult';
    else if (allText.includes('child') || allText.includes('kid')) targetAudience = 'children';
    else if (allText.includes('adult') || allText.includes('mature')) targetAudience = 'adult';
    else if (allText.includes('academic') || allText.includes('research')) targetAudience = 'academic';
    
    // Content warnings
    const contentWarnings: string[] = [];
    const warningPatterns = {
      'violence': ['violence', 'blood', 'gore', 'war', 'battle', 'murder'],
      'sexual content': ['sex', 'sexual', 'romance', 'intimate', 'explicit'],
      'language': ['profanity', 'swearing', 'cursing', 'explicit language'],
      'drugs': ['drugs', 'alcohol', 'substance', 'addiction'],
      'trauma': ['trauma', 'abuse', 'mental health', 'depression', 'anxiety']
    };
    
    Object.entries(warningPatterns).forEach(([warning, keywords]) => {
      if (keywords.some(keyword => allText.includes(keyword))) {
        contentWarnings.push(warning);
      }
    });
    
    return { genreIndicators, targetAudience, contentWarnings };
  };

  // Enhanced confidence calculation using NLP analysis
  const calculateNLPConfidence = (suggestion: Suggestion, userPreferences: any): number => {
    if (!suggestion.nlpAnalysis) return suggestion.confidence;
    
    let confidence = suggestion.confidence;
    
    // Boost confidence based on sentiment alignment
    if (userPreferences.moods) {
      const userMoods = Array.from(userPreferences.moods.keys()).map(key => String(key));
      const contentEmotions = suggestion.nlpAnalysis.sentiment.emotions;
      
      if (userMoods.some(mood => contentEmotions.includes(mood))) {
        confidence += 10;
      }
    }
    
    // Boost confidence based on topic alignment
    if (userPreferences.genres) {
      const userGenres = Array.from(userPreferences.genres.keys()).map(key => String(key));
      const contentTopics = [...suggestion.nlpAnalysis.topics.primary, ...suggestion.nlpAnalysis.topics.secondary];
      
      if (userGenres.some(genre => contentTopics.includes(genre))) {
        confidence += 15;
      }
    }
    
    // Adjust confidence based on complexity preference
    if (userPreferences.readingPace) {
      const userPaceKeys = Array.from(userPreferences.readingPace.keys());
      const userPace = userPaceKeys.length > 0 ? String(userPaceKeys[0]) : 'moderate';
      const contentComplexity = suggestion.nlpAnalysis.complexity.readabilityScore;
      
      if (userPace === 'fast' && contentComplexity < 50) confidence += 5;
      else if (userPace === 'slow' && contentComplexity > 70) confidence += 5;
    }
    
    return Math.min(100, confidence);
  };



  // Local fallback function - no API calls, instant results
  const fetchBooksFromLocalFallback = async (genre: string, limit: number = 20): Promise<any[]> => {
    const cacheKey = `local-${genre}-${limit}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`📚 Using cached local data for ${genre}`);
      return cached.data;
    }
    
    try {
      console.log(`🏠 Using local fallback data for ${genre}...`);
      
      const localBooks = LOCAL_BOOK_DATA[genre as keyof typeof LOCAL_BOOK_DATA] || [];
      const books = localBooks.slice(0, limit).map((book, index) => ({
        id: `local-${genre}-${index}`,
        title: book.title,
        author: book.author,
        year: book.year,
        format: "text",
        rating: 4,
        description: book.description,
        genres: book.genres,
        isBook: true,
        source: 'local',
        reason: `Local recommendation for ${genre}`,
        confidence: 70,
        category: 'genre',
        estimatedPages: 300,
        estimatedLength: 'medium'
      }));
      
      // Cache the results
      apiCache.set(cacheKey, { data: books, timestamp: Date.now() });
      
      console.log(`✅ Retrieved ${books.length} ${genre} books from local fallback`);
      return books;
      
    } catch (error) {
      console.error(`❌ Error with local fallback for ${genre}:`, error);
      return [];
    }
  };

  // Enhanced book fetching with multiple fallback options
  const fetchBooksWithFallbacks = async (
    genre: string,
    limit: number = 20,
    mood: MoodSignals | null = null
  ): Promise<any[]> => {
    console.log(`🔄 Fetching books for ${genre} with fallback options...`);

    let books = await fetchBooksFromHardCodedData(genre, limit, mood);
    
    // If hard-coded data returns few results, try broader genre matching
    if (books.length < 5 && API_CONFIG.USE_LOCAL_FALLBACK) {
      console.log(`📚 Hard-coded data returned only ${books.length} results, trying broader genre matching...`);
      const localBooks = await fetchBooksFromLocalFallback(genre, limit);
      
      // Combine results, prioritizing Google Books
      const combinedBooks = [...books, ...localBooks];
      const uniqueBooks = combinedBooks.filter((book, index, self) => 
        index === self.findIndex(b => b.title === book.title && b.author === book.author)
      );
      
      books = uniqueBooks.slice(0, limit);
    }
    
    // If still no results, use local fallback only
    if (books.length === 0 && API_CONFIG.USE_LOCAL_FALLBACK) {
      console.log(`📚 No API results, using local fallback only...`);
      books = await fetchBooksFromLocalFallback(genre, limit);
    }
    
    return books;
  };

  // Semantic Similarity Functions
  const generateSemanticEmbedding = (item: Suggestion): number[] => {
    try {
      // Create a simple but effective embedding based on text features
      const text = `${item.title ?? ''} ${item.author ?? ''} ${item.description ?? ''} ${(item.genres || []).join(' ')}`.toLowerCase();
      
      // Simple hash-based embedding (for mobile performance)
      const embedding = new Array(SEMANTIC_CONFIG.EMBEDDING_DIMENSIONS).fill(0);
      
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const position = charCode % SEMANTIC_CONFIG.EMBEDDING_DIMENSIONS;
        embedding[position] += charCode / 1000;
      }
      
      // Normalize the embedding
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        for (let i = 0; i < embedding.length; i++) {
          embedding[i] /= magnitude;
        }
      }
      
      return embedding;
    } catch (error) {
      console.error('Error generating semantic embedding:', error);
      return new Array(SEMANTIC_CONFIG.EMBEDDING_DIMENSIONS).fill(0);
    }
  };

  const calculateCosineSimilarity = (embedding1: number[], embedding2: number[]): number => {
    try {
      if (embedding1.length !== embedding2.length) {
        return 0;
      }
      
      let dotProduct = 0;
      let magnitude1 = 0;
      let magnitude2 = 0;
      
      for (let i = 0; i < embedding1.length; i++) {
        dotProduct += embedding1[i] * embedding2[i];
        magnitude1 += embedding1[i] * embedding1[i];
        magnitude2 += embedding2[i] * embedding2[i];
      }
      
      magnitude1 = Math.sqrt(magnitude1);
      magnitude2 = Math.sqrt(magnitude2);
      
      if (magnitude1 === 0 || magnitude2 === 0) {
        return 0;
      }
      
      return dotProduct / (magnitude1 * magnitude2);
    } catch (error) {
      console.error('Error calculating cosine similarity:', error);
      return 0;
    }
  };

  const findSemanticSimilarItems = (targetItem: Suggestion, allItems: Suggestion[], limit: number = 5): SimilarityResult[] => {
    try {
      const results: SimilarityResult[] = [];
      
      // Generate or get embedding for target item
      let targetEmbedding = semanticCache.embeddings.get(targetItem.id)?.vector;
      if (!targetEmbedding) {
        targetEmbedding = generateSemanticEmbedding(targetItem);
        semanticCache.embeddings.set(targetItem.id, {
          id: targetItem.id,
          vector: targetEmbedding,
          metadata: {
            title: targetItem.title,
            author: targetItem.author,
            genres: targetItem.genres,
            description: targetItem.description,
            topics: targetItem.nlpAnalysis?.topics.primary || [],
            timestamp: Date.now()
          }
        });
      }
      
      // Calculate similarities with other items
      for (const item of allItems) {
        if (item.id === targetItem.id) continue;
        
        // Check cache first
        const cacheKey = `${targetItem.id}-${item.id}`;
        const cachedSimilarity = semanticCache.similarityMatrix.get(targetItem.id)?.get(item.id);
        
        let similarity = 0;
        if (cachedSimilarity !== undefined) {
          similarity = cachedSimilarity;
        } else {
          // Generate embedding for comparison item
          let itemEmbedding = semanticCache.embeddings.get(item.id)?.vector;
          if (!itemEmbedding) {
            itemEmbedding = generateSemanticEmbedding(item);
            semanticCache.embeddings.set(item.id, {
              id: item.id,
              vector: itemEmbedding,
              metadata: {
                title: item.title,
                author: item.author,
                genres: item.genres,
                description: item.description,
                topics: item.nlpAnalysis?.topics.primary || [],
                timestamp: Date.now()
              }
            });
          }
          
          similarity = calculateCosineSimilarity(targetEmbedding, itemEmbedding);
          
          // Cache the similarity
          if (!semanticCache.similarityMatrix.has(targetItem.id)) {
            semanticCache.similarityMatrix.set(targetItem.id, new Map());
          }
          semanticCache.similarityMatrix.get(targetItem.id)!.set(item.id, similarity);
        }
        
        if (similarity >= SEMANTIC_CONFIG.SIMILARITY_THRESHOLD) {
          results.push({
            itemId: item.id,
            similarity,
            reason: `Semantically similar to "${targetItem.title}"`,
            confidence: similarity * 100
          });
        }
      }
      
      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
        
    } catch (error) {
      console.error('Error finding semantic similar items:', error);
      return [];
    }
  };

  const manageSemanticCache = () => {
    try {
      const now = Date.now();
      const expiryTime = SEMANTIC_CONFIG.CACHE_EXPIRY_HOURS * 60 * 60 * 1000;
      
      // Remove expired embeddings
      for (const [id, embedding] of semanticCache.embeddings) {
        if (now - embedding.metadata.timestamp > expiryTime) {
          semanticCache.embeddings.delete(id);
          semanticCache.similarityMatrix.delete(id);
        }
      }
      
      // Limit cache size
      if (semanticCache.embeddings.size > semanticCache.maxCacheSize) {
        const entries = Array.from(semanticCache.embeddings.entries());
        entries.sort((a, b) => a[1].metadata.timestamp - b[1].metadata.timestamp);
        
        const toRemove = entries.slice(0, entries.length - semanticCache.maxCacheSize);
        for (const [id] of toRemove) {
          semanticCache.embeddings.delete(id);
          semanticCache.similarityMatrix.delete(id);
        }
      }
      
      semanticCache.cacheSize = semanticCache.embeddings.size;
      semanticCache.lastUpdated = now;
      
      console.log(`🧠 Semantic cache managed: ${semanticCache.cacheSize} embeddings, ${semanticCache.similarityMatrix.size} similarity pairs`);
    } catch (error) {
      console.error('Error managing semantic cache:', error);
    }
  };

  const generateSemanticSuggestions = (targetItem: Suggestion, allItems: Suggestion[]): Suggestion[] => {
    try {
      const similarResults = findSemanticSimilarItems(targetItem, allItems, 10);
      
      const semanticSuggestions: Suggestion[] = [];
      
      for (const result of similarResults) {
        const similarItem = allItems.find(item => item.id === result.itemId);
        if (!similarItem) continue;
        
        const semanticSuggestion: Suggestion = {
          ...similarItem,
          id: `semantic-${result.itemId}`,
          reason: result.reason,
          confidence: result.confidence,
          category: 'semantic',
          semanticTags: ['similar', 'recommended']
        };
        
        if (!isItemAlreadyAdded(semanticSuggestion) && !isPastYearContent(semanticSuggestion)) {
          semanticSuggestions.push(semanticSuggestion);
        }
      }
      
      return semanticSuggestions;
      
    } catch (error) {
      console.error('Error generating semantic suggestions:', error);
      return [];
    }
  };

  // Predictive Preloading Functions
  const updateUserBehaviorPatterns = (action: 'search' | 'thumbs_up' | 'thumbs_down' | 'add' | 'view', data?: any) => {
    const now = Date.now();
    const currentHour = new Date().getHours();
    
    setUserBehaviorPatterns(prev => {
      const newPatterns = { ...prev };
      
      // Update interaction times
      newPatterns.interactionTimes.push(now);
      newPatterns.interactionTimes = newPatterns.interactionTimes.slice(-50); // Keep last 50 interactions
      
      // Update active hours
      newPatterns.activeHours.push(currentHour);
      newPatterns.activeHours = newPatterns.activeHours.slice(-100); // Keep last 100 hours
      
      // Update search history
      if (action === 'search' && data?.query) {
        newPatterns.searchHistory.push(data.query);
        newPatterns.searchHistory = newPatterns.searchHistory.slice(-20); // Keep last 20 searches
      }
      
      // Update preferred genres based on thumbs up
      if (action === 'thumbs_up' && data?.genres) {
        data.genres.forEach((genre: string) => {
          if (!newPatterns.preferredGenres.includes(genre)) {
            newPatterns.preferredGenres.push(genre);
          }
        });
        newPatterns.preferredGenres = newPatterns.preferredGenres.slice(-10); // Keep top 10 genres
      }
      
      newPatterns.lastInteractionTime = now;
      return newPatterns;
    });
  };

  const predictNextUserNeeds = () => {
    const patterns = userBehaviorPatterns;
    const predictions: string[] = [];
    
    // Predict based on search history
    if (patterns.searchHistory.length > 0) {
      const recentSearches = patterns.searchHistory.slice(-3);
      recentSearches.forEach(search => {
        // Extract potential genres from search terms
        const searchLower = search.toLowerCase();
        if (searchLower.includes('adventure')) predictions.push('adventure');
        if (searchLower.includes('fantasy')) predictions.push('fantasy');
        if (searchLower.includes('mystery')) predictions.push('mystery');
        if (searchLower.includes('sci-fi') || searchLower.includes('science fiction')) predictions.push('scifi');
        if (searchLower.includes('romance')) predictions.push('romance');
        if (searchLower.includes('thriller')) predictions.push('thriller');
      });
    }
    
    // Predict based on preferred genres
    predictions.push(...patterns.preferredGenres);
    
    // Predict based on time of day
    const currentHour = new Date().getHours();
    if (currentHour >= 6 && currentHour <= 12) {
      // Morning - suggest lighter reads
      predictions.push('contemporary', 'young adult');
    } else if (currentHour >= 18 && currentHour <= 22) {
      // Evening - suggest engaging reads
      predictions.push('thriller', 'mystery');
    }
    
    // Remove duplicates and return unique predictions
    return [...new Set(predictions)].slice(0, 5);
  };

  const preloadPredictedContent = async () => {
    if (isPredictiveLoading) return;
    
    setIsPredictiveLoading(true);
    console.log('🚀 Starting predictive preloading...');
    
    try {
      const predictions = predictNextUserNeeds();
      console.log('🔮 Predicted user needs:', predictions);
      
      // Track that we're preloading
      apiCache.set('last-predictive-preload', { data: [], timestamp: Date.now() });
      
      const preloadPromises = predictions.map(async (genre) => {
        // Check if we already have this in cache
        if (predictiveCache.has(genre)) {
          console.log(`📚 ${genre} already in predictive cache`);
          return;
        }
        
        console.log(`📚 Preloading ${genre} content...`);
        const books = await fetchBooksWithFallbacks(genre, 15);
        
        if (books.length > 0) {
          setPredictiveCache(prev => new Map(prev).set(genre, books));
          console.log(`✅ Preloaded ${books.length} ${genre} books`);
        }
      });
      
      await Promise.allSettled(preloadPromises);
      console.log('✅ Predictive preloading completed');
      
    } catch (error) {
      console.error('❌ Error during predictive preloading:', error);
    } finally {
      setIsPredictiveLoading(false);
    }
  };

  const getPredictiveSuggestions = (genre: string): Suggestion[] => {
    const cachedBooks = predictiveCache.get(genre);
    if (!cachedBooks) return [];
    
    return cachedBooks.map((book, index) => ({
      id: `predictive-${genre}-${index}`,
      title: book.title,
      author: book.author,
      year: book.year,
      isBook: book.isBook,
      reason: `Predicted ${genre} recommendation based on your preferences`,
      confidence: 85, // Higher confidence for predicted content
      category: 'predictive',
      format: book.format,
      rating: book.rating || 4,
      description: book.description,
      genres: [book.genre || genre],
      source: book.source || 'predictive',
      estimatedPages: book.isBook ? estimatePages(book.title) : undefined,
      estimatedLength: estimateLength(book.title),
    }));
  };

  // Trigger predictive preloading based on user behavior
  useEffect(() => {
    const shouldPreload = () => {
      const now = Date.now();
      const timeSinceLastInteraction = now - userBehaviorPatterns.lastInteractionTime;
      
      // Only preload if user has been inactive for 2 minutes AND we haven't preloaded recently
      const lastPreloadTime = apiCache.get('last-predictive-preload')?.timestamp || 0;
      const timeSinceLastPreload = now - lastPreloadTime;
      
      return timeSinceLastInteraction > 120000 && // 2 minutes of inactivity
             timeSinceLastPreload > 300000 && // 5 minutes between preloads
             !isPredictiveLoading;
    };
    
    const preloadInterval = setInterval(() => {
      if (shouldPreload()) {
        preloadPredictedContent();
      }
    }, 60000); // Check every minute instead of every 10 seconds
    
    return () => clearInterval(preloadInterval);
  }, [userBehaviorPatterns.lastInteractionTime, isPredictiveLoading]);

  // Update behavior patterns when user interacts
  useEffect(() => {
    if (suggestions.length > 0) {
      updateUserBehaviorPatterns('view', { count: suggestions.length });
    }
  }, [suggestions]);

  // Hard-coded data function - zero API calls, instant results
  const fetchBooksFromHardCodedData = async (
    genre: string,
    limit: number = 20,
    mood: MoodSignals | null = null
  ): Promise<any[]> => {
    const moodKey =
      mood && moodSignalsAreActionable(mood) ? mood.rawLower.slice(0, 32).replace(/\s+/g, '-') : 'none';
    const cacheKey = `hardcoded-${genre}-${limit}-${moodKey}`;

    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`📚 Using cached hard-coded data for ${genre}`);
      return cached.data;
    }
    
    try {
      console.log(`📚 Fetching ${limit} ${genre} books from hard-coded dataset...`);
      
      // Filter books by genre from comprehensive dataset
      const genreLc = String(genre ?? '').toLowerCase();
      let filteredBooks = COMPREHENSIVE_BOOK_DATA.filter((book) =>
        Array.isArray(book.genres) &&
        book.genres.some((g) => typeof g === 'string' && g.toLowerCase().includes(genreLc))
      );
      
      // If no exact matches, try broader genre matching
      if (filteredBooks.length === 0) {
        const genreMappings: { [key: string]: string[] } = {
          'fantasy': ['fantasy', 'epic', 'magic'],
          'scifi': ['science fiction', 'sci-fi'],
          'science fiction': ['science fiction', 'sci-fi'],
          'mystery': ['mystery', 'thriller', 'crime'],
          'thriller': ['thriller', 'suspense', 'crime'],
          'adventure': ['adventure', 'exploration'],
          'literary': ['literary', 'classic'],
          'contemporary': ['contemporary', 'modern'],
          'romance': ['romance', 'love'],
          'horror': ['horror', 'thriller'],
          'historical': ['historical', 'history'],
          'young adult': ['young adult', 'ya']
        };
        
        const targetGenres = genreMappings[genreLc] || [genre];
        filteredBooks = COMPREHENSIVE_BOOK_DATA.filter(
          (book) =>
            Array.isArray(book.genres) &&
            book.genres.some((g) =>
              typeof g === 'string' &&
              targetGenres.some((tg) => typeof tg === 'string' && g.toLowerCase().includes(tg.toLowerCase()))
            )
        );
      }
      
      let ranked = [...filteredBooks];
      if (mood && moodSignalsAreActionable(mood)) {
        ranked.sort(
          (a, b) =>
            scoreRowAgainstMood(
              { title: a.title, author: a.author, description: a.description, genres: a.genres },
              mood
            ) -
              scoreRowAgainstMood(
                { title: b.title, author: b.author, description: b.description, genres: b.genres },
                mood
              ) ||
            Math.random() - 0.5
        );
      } else {
        ranked.sort(() => Math.random() - 0.5);
      }
      const limitedBooks = ranked.slice(0, limit);
      
      // Transform to match expected format
      const books = limitedBooks.map(book => ({
        title: book.title,
        author: book.author,
        year: book.year,
        format: "text",
        rating: book.rating || 4.0,
        description: book.description,
        genres: book.genres,
        isBook: true,
        source: 'hardcoded',
        coverId: null,
        isbn: null,
        pageCount: null,
        language: 'en',
        awards: book.awards || [],
        estimatedLength:
          typeof book.estimatedLength === 'string' && book.estimatedLength.trim()
            ? book.estimatedLength.trim()
            : 'unknown',
        reason:
          book.dataReason?.trim() || `Suggested from the FiftyList enriched book catalog.`,
        confidence:
          book.dataConfidence === 'high'
            ? 1
            : book.dataConfidence === 'medium'
              ? 0.75
              : book.dataConfidence === 'low'
                ? 0.5
                : 0.85,
      }));
      
      // Cache the results
      apiCache.set(cacheKey, { data: books, timestamp: Date.now() });
      
      console.log(`✅ Fetched ${books.length} ${genre} books from hard-coded dataset`);
      return books;
      
    } catch (error) {
      console.error(`❌ Error fetching from hard-coded data for ${genre}:`, error);
      return [];
    }
  };

  // Hard-coded movie function - zero API calls, instant results
  const fetchMoviesFromHardCodedData = async (
    genre: string,
    limit: number = 20,
    mood: MoodSignals | null = null
  ): Promise<any[]> => {
    const moodKey =
      mood && moodSignalsAreActionable(mood) ? mood.rawLower.slice(0, 32).replace(/\s+/g, '-') : 'none';
    const cacheKey = `hardcoded-movies-${genre}-${limit}-${moodKey}`;

    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`🎬 Using cached hard-coded movie data for ${genre}`);
      return cached.data;
    }
    
    try {
      console.log(`🎬 Fetching ${limit} ${genre} movies from hard-coded dataset...`);
      
      const movieGenreLc = String(genre ?? '').toLowerCase();
      // Filter movies by genre from comprehensive dataset
      let filteredMovies = COMPREHENSIVE_MOVIE_DATA.filter(
        (movie) =>
          Array.isArray(movie.genres) &&
          movie.genres.some((g) => typeof g === 'string' && g.toLowerCase().includes(movieGenreLc))
      );
      
      // If no exact matches, try broader genre matching
      if (filteredMovies.length === 0) {
        const genreMappings: { [key: string]: string[] } = {
          'action': ['action', 'adventure'],
          'comedy': ['comedy', 'humor'],
          'drama': ['drama', 'serious'],
          'thriller': ['thriller', 'suspense'],
          'sci-fi': ['sci-fi', 'science fiction'],
          'horror': ['horror', 'scary'],
          'romance': ['romance', 'love'],
          'documentary': ['documentary', 'non-fiction']
        };
        
        const targetGenres = genreMappings[movieGenreLc] || [genre];
        filteredMovies = COMPREHENSIVE_MOVIE_DATA.filter(
          (movie) =>
            Array.isArray(movie.genres) &&
            movie.genres.some((g) =>
              typeof g === 'string' &&
              targetGenres.some((tg) => typeof tg === 'string' && g.toLowerCase().includes(tg.toLowerCase()))
            )
        );
      }
      
      let ranked = [...filteredMovies];
      if (mood && moodSignalsAreActionable(mood)) {
        ranked.sort(
          (a, b) =>
            scoreRowAgainstMood(
              { title: a.title, author: a.author, description: a.description, genres: a.genres },
              mood
            ) -
              scoreRowAgainstMood(
                { title: b.title, author: b.author, description: b.description, genres: b.genres },
                mood
              ) ||
            Math.random() - 0.5
        );
      } else {
        ranked.sort(() => Math.random() - 0.5);
      }
      const limitedMovies = ranked.slice(0, limit);
      
      // Transform to match expected format
      const movies = limitedMovies.map(movie => ({
        title: movie.title,
        author: movie.author,
        year: movie.year,
        format: "streaming",
        rating: movie.rating || 4.0,
        description: movie.description,
        genres: movie.genres,
        isBook: false,
        source: 'hardcoded',
        posterPath: null,
        tmdbId: null,
        runtime: null,
        language: 'en'
      }));
      
      // Cache the results
      apiCache.set(cacheKey, { data: movies, timestamp: Date.now() });
      
      console.log(`✅ Fetched ${movies.length} ${genre} movies from hard-coded dataset`);
      return movies;
      
    } catch (error) {
      console.error(`❌ Error fetching from hard-coded movie data for ${genre}:`, error);
      return [];
    }
  };

  // Search function using hard-coded data only
  const searchHardCodedData = async (query: string, type: 'books' | 'movies' | 'both' = 'both'): Promise<any[]> => {
    const cacheKey = `search-hardcoded-${query}-${type}`;
    
    // Check cache first
    const cached = apiCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      console.log(`🔍 Using cached search results for "${query}"`);
      return cached.data;
    }
    
    try {
      console.log(`🔍 Searching hard-coded data for "${query}"...`);
      
      const searchTerm = query.toLowerCase();
      let results: any[] = [];
      
      // Search books if requested
      if (type === 'books' || type === 'both') {
        const bookResults = COMPREHENSIVE_BOOK_DATA.filter(book => 
          book.title.toLowerCase().includes(searchTerm) ||
          book.author.toLowerCase().includes(searchTerm) ||
          book.description.toLowerCase().includes(searchTerm) ||
          book.genres.some(g => g.toLowerCase().includes(searchTerm))
        ).map(book => ({
          ...book,
          isBook: true,
          source: 'hardcoded'
        }));
        results.push(...bookResults);
      }
      
      // Search movies if requested
      if (type === 'movies' || type === 'both') {
        const movieResults = COMPREHENSIVE_MOVIE_DATA.filter(movie => 
          movie.title.toLowerCase().includes(searchTerm) ||
          movie.author.toLowerCase().includes(searchTerm) ||
          movie.description.toLowerCase().includes(searchTerm) ||
          movie.genres.some(g => g.toLowerCase().includes(searchTerm))
        ).map(movie => ({
          ...movie,
          isBook: false,
          source: 'hardcoded'
        }));
        results.push(...movieResults);
      }
      
      // Shuffle and limit results
      const shuffled = results.sort(() => Math.random() - 0.5);
      const limitedResults = shuffled.slice(0, 30);
      
      // Cache the results
      apiCache.set(cacheKey, { data: limitedResults, timestamp: Date.now() });
      
      console.log(`✅ Found ${limitedResults.length} results for "${query}" in hard-coded data`);
      return limitedResults;
      
    } catch (error) {
      console.error(`❌ Error searching hard-coded data for "${query}":`, error);
      return [];
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, Platform.OS === 'web' && styles.webContainer]}
      edges={['top']}
    >
      <Header
        title="Suggestions"
        onAddPress={() => {
          Alert.alert(
            'Add Item',
            'What would you like to add?',
            [
              {
                text: 'Cancel',
                style: 'cancel'
              },
              {
                text: 'Book',
                onPress: () => {
                  setModalIsBook(true);
                  setShowAddModal(true);
                }
              },
              {
                text: 'Movie',
                onPress: () => {
                  setModalIsBook(false);
                  setShowAddModal(true);
                }
              }
            ]
          );
        }}
        onExportPress={handleExport}
        onImportPress={() => importItems([], [])}
        primaryColor={AMBER_PRIMARY}
        secondaryColor={AMBER_DARK}
        isDark={false}
        backgroundColor={SAND_BACKGROUND}
      />

      {/* Search functionality now handled by the search input below */}

      {/* Last Refresh Indicator */}
      <View style={styles.refreshIndicator}>
        <Text style={styles.refreshIndicatorText}>
          Last updated: {lastRefreshTime.toLocaleTimeString()}
        </Text>
      </View>

      {llmRefineStatus && (
        <View style={styles.llmRefineStatusRow}>
          <Sparkles size={12} color={AMBER_PRIMARY} />
          <Text style={styles.llmRefineStatusText}>{llmRefineStatus}</Text>
        </View>
      )}

      {/* Predictive Preloading Indicator */}
      {isPredictiveLoading && (
        <View style={styles.predictiveIndicator}>
          <Animated.View style={[styles.predictiveSpinner, { transform: [{ rotate: spinValue.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '360deg']
          })}] }]}>
            <RefreshCw size={12} color={AMBER_PRIMARY} />
          </Animated.View>
          <Text style={styles.predictiveText}>
            🔮 Learning your preferences...
          </Text>
        </View>
      )}

      {/* Semantic Similarity Indicator */}
      {activeFilter === 'semantic' && (
        <View style={styles.semanticIndicator}>
          <Lightbulb size={12} color={AMBER_PRIMARY} />
          <Text style={styles.semanticText}>
            🧠 Showing semantically similar content
          </Text>
        </View>
      )}





      {/* Filters and Sort */}
      <View style={styles.controlsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <View style={styles.filtersContainer}>
            {filterOptions.map((option) => {
              const IconComponent = option.icon;
              const isActive = activeFilter === option.key;
              
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.filterChip,
                    isDark && styles.darkFilterChip,
                    isActive && [styles.activeFilterChip, { backgroundColor: AMBER_PRIMARY }]
                  ]}
                  onPress={() => setActiveFilter(option.key as FilterOption)}
                >
                  <IconComponent 
                    size={14} 
                    color={isActive ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#6B7280')} 
                  />
                  <Text style={[
                    styles.filterText,
                    isDark && styles.darkFilterText,
                    isActive && styles.activeFilterText
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        <TouchableOpacity
          style={[styles.controlActionButton, isRefreshing && styles.refreshingButton]}
          onPress={handleRefresh}
          disabled={isRefreshing}
          accessibilityLabel="Refresh suggestions"
        >
          <RefreshCw 
            size={18} 
            color={isRefreshing ? "#9CA3AF" : AMBER_DARK} 
            style={isRefreshing ? { transform: [{ rotate: '360deg' }] } : undefined}
          />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.controlActionButton}
          onPress={() => setShowFilters(!showFilters)}
          accessibilityLabel="Sort and filter options"
        >
          <SlidersHorizontal size={18} color={AMBER_DARK} />
        </TouchableOpacity>
      </View>

      {/* Sort Options */}
      {showFilters && (
        <View style={styles.sortContainer}>
          <Text style={styles.sortTitle}>Sort by:</Text>
          <View style={styles.sortOptions}>
            {sortOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[
                  styles.sortOption,
                  sortBy === option.key && styles.activeSortOption
                ]}
                onPress={() => {
                  setSortBy(option.key as SortOption);
                  setShowFilters(false);
                }}
              >
                <Text style={[
                  styles.sortOptionText,
                  sortBy === option.key && styles.activeSortOptionText
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {showLlmAssistPanel && (
        <View style={styles.llmAssistPanel}>
          <View style={styles.llmAssistTabRow}>
            <Pressable
              style={[
                styles.llmAssistTab,
                llmAssistPanelTab === 'refine-books' && styles.llmAssistTabActive,
              ]}
              onPress={() => setLlmAssistPanelTab('refine-books')}
              accessibilityRole="tab"
              accessibilityState={{ selected: llmAssistPanelTab === 'refine-books' }}
            >
              <Text
                style={[
                  styles.llmAssistTabText,
                  llmAssistPanelTab === 'refine-books' && styles.llmAssistTabTextActive,
                ]}
              >
                Refine books
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.llmAssistTab,
                llmAssistPanelTab === 'refine-movies' && styles.llmAssistTabActive,
              ]}
              onPress={() => setLlmAssistPanelTab('refine-movies')}
              accessibilityRole="tab"
              accessibilityState={{ selected: llmAssistPanelTab === 'refine-movies' }}
            >
              <Text
                style={[
                  styles.llmAssistTabText,
                  llmAssistPanelTab === 'refine-movies' && styles.llmAssistTabTextActive,
                ]}
              >
                Refine movies
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.llmAssistTab,
                llmAssistPanelTab === 'taste' && styles.llmAssistTabActive,
                !hasTasteSnapshot && styles.llmAssistTabDisabled,
              ]}
              onPress={() => hasTasteSnapshot && setLlmAssistPanelTab('taste')}
              accessibilityRole="tab"
              accessibilityState={{ selected: llmAssistPanelTab === 'taste' }}
            >
              <Text
                style={[
                  styles.llmAssistTabText,
                  llmAssistPanelTab === 'taste' && styles.llmAssistTabTextActive,
                  !hasTasteSnapshot && styles.llmAssistTabTextDisabled,
                ]}
              >
                Taste
              </Text>
            </Pressable>
          </View>

          {llmAssistPanelTab === 'refine-books' ? (
            <View style={styles.llmAssistTabBody}>
              <Text style={styles.llmContextSub}>
                Rebuilds book suggestions from the catalog—genres, copy, and ranking—for this phrase
                only.
              </Text>
              {!llmRefineEnabled && (
                <Text style={styles.llmContextPremiumHint}>
                  Premium unlocks AI refine. In the simulator, subscribe via Settings → Upgrade (dev
                  simulates purchase).
                </Text>
              )}
              {!ENABLE_LLM_ASSIST && __DEV__ && (
                <Text style={styles.llmContextPremiumHint}>
                  Set EXPO_PUBLIC_ENABLE_LLM_ASSIST=true in .env and restart Metro for live proxy
                  calls.
                </Text>
              )}
              <TextInput
                style={[styles.llmContextInput, !llmRefineEnabled && styles.llmContextInputDisabled]}
                placeholder="e.g. adventure nonfiction like Into Thin Air…"
                placeholderTextColor="#A8A29E"
                value={llmBookRefineContext}
                onChangeText={(text) => setLlmBookRefineContext(text.slice(0, 120))}
                maxLength={120}
                multiline={false}
                returnKeyType="done"
                editable={llmRefineEnabled}
              />
              <View style={styles.llmMeterTrack} pointerEvents="none">
                <View
                  style={[
                    styles.llmMeterFill,
                    {
                      width: `${Math.round((llmBookRefineContext.length / 120) * 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ) : llmAssistPanelTab === 'refine-movies' ? (
            <View style={styles.llmAssistTabBody}>
              <Text style={styles.llmContextSub}>
                Rebuilds movie suggestions from the catalog—genres, copy, and ranking—for this
                phrase only.
              </Text>
              {!llmRefineEnabled && (
                <Text style={styles.llmContextPremiumHint}>
                  Premium unlocks AI refine. In the simulator, subscribe via Settings → Upgrade (dev
                  simulates purchase).
                </Text>
              )}
              <TextInput
                style={[styles.llmContextInput, !llmRefineEnabled && styles.llmContextInputDisabled]}
                placeholder="e.g. tense thrillers, A24 dramas…"
                placeholderTextColor="#A8A29E"
                value={llmMovieRefineContext}
                onChangeText={(text) => setLlmMovieRefineContext(text.slice(0, 120))}
                maxLength={120}
                multiline={false}
                returnKeyType="done"
                editable={llmRefineEnabled}
              />
              <View style={styles.llmMeterTrack} pointerEvents="none">
                <View
                  style={[
                    styles.llmMeterFill,
                    {
                      width: `${Math.round((llmMovieRefineContext.length / 120) * 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ) : (
            <View style={styles.llmAssistTabBody}>
              {hasTasteSnapshot ? (
                <ScrollView
                  style={[styles.llmTasteScroll, { maxHeight: TASTE_SNAPSHOT_SCROLL_HEIGHT }]}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                >
                  <Text style={styles.llmTasteProfileText}>{tasteProfileNarrative}</Text>
                </ScrollView>
              ) : (
                <Text style={styles.llmTasteProfilePlaceholder}>
                  {llmRefineEnabled
                    ? 'Your taste snapshot will appear here after we learn from your rated items.'
                    : 'Enable premium AI to generate a taste snapshot from your lists.'}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {/* Suggestions List */}
      <FlatList
        data={filteredAndSortedSuggestions}
        keyExtractor={(item) => item.id}
        renderItem={renderSuggestionCard}
        style={styles.listScroll}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === 'web' && styles.webListContent
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => {
          // Show loading indicator while suggestions are being generated or searching
          if (isLoadingSuggestions || isSearching) {
            const spin = spinValue.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            });

            return (
              <View style={styles.loadingState}>
                <Animated.View style={[styles.loadingSpinner, { transform: [{ rotate: spin }] }]}>
                  <RefreshCw size={48} color={AMBER_PRIMARY} />
                </Animated.View>
                <Text style={styles.loadingText}>
                  {isSearching ? 'Searching...' : 'Loading recommendations...'}
                </Text>
                <Text style={styles.loadingSubtext}>
                  {isSearching 
                    ? `Loading suggestions...`
                    : 'Analyzing your preferences and finding great books and movies'
                  }
                </Text>
              </View>
            );
          }

          // Show empty state when no suggestions are found after loading
          const totalSuggestions = suggestions.length;
          const filteredSuggestions = filteredAndSortedSuggestions.length;
          const dismissedCount = dismissedSuggestions.size;
          const duplicatesFiltered = totalSuggestions - filteredSuggestions;
          
          return (
            <View style={styles.emptyState}>
              <Lightbulb size={48} color="#9CA3AF" />
              <Text style={styles.emptyText}>No suggestions found</Text>
              <Text style={styles.emptySubtext}>
                        {false ? (
          `Try adjusting your search`
                ) : totalSuggestions === 0 ? (
                  'Complete more books and movies to get personalized suggestions'
                ) : (
                  `All ${totalSuggestions} suggestions are either already in your lists or dismissed`
                )}
              </Text>
              {(duplicatesFiltered > 0 || dismissedCount > 0) && (
                <View style={styles.emptyStateDetails}>
                  {duplicatesFiltered > 0 && (
                    <Text style={styles.emptyStateDetail}>
                      • {duplicatesFiltered} already in your lists
                    </Text>
                  )}
                  {dismissedCount > 0 && (
                    <Text style={styles.emptyStateDetail}>
                      • {dismissedCount} dismissed
                    </Text>
                  )}
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Custom Alert */}
      <CustomAlert
        visible={showAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        onConfirm={() => setShowAlert(false)}
        onCancel={() => setShowAlert(false)}
        showCancel={false}
        confirmText="OK"
      />

      {/* Add/Edit Modal */}
      <AddEditModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveItem}
        editingItem={undefined}
        isBook={modalIsBook}
        primaryColor="#8B5CF6"
        isDark={false}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SAND_BACKGROUND,
  },
  listScroll: {
    flex: 1,
    backgroundColor: SAND_BACKGROUND,
  },
  webContainer: {
    minHeight: '100%',
    height: '100%',
    maxHeight: '100%',
  },
  controlsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  filtersScroll: {
    flex: 1,
  },
  filtersContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkFilterChip: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  activeFilterChip: {
    borderColor: AMBER_PRIMARY,
  },
  filterText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkFilterText: {
    color: '#9CA3AF',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  sortButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  controlActionButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER_WARM,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: 'rgba(0,0,0,0.04)',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 6,
    shadowOpacity: 1,
    elevation: 2,
  },
  sortContainer: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sortTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
    marginBottom: 12,
  },
  llmAssistPanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: BORDER_WARM,
    overflow: 'hidden',
    shadowColor: 'rgba(0,0,0,0.06)',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 1,
    elevation: 2,
  },
  llmAssistTabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER_WARM,
    backgroundColor: '#FFFBF5',
  },
  llmAssistTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  llmAssistTabActive: {
    borderBottomColor: AMBER_PRIMARY,
    backgroundColor: '#FFFFFF',
  },
  llmAssistTabDisabled: {
    opacity: 0.45,
  },
  llmAssistTabText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#78716C',
  },
  llmAssistTabTextActive: {
    fontFamily: 'Inter-SemiBold',
    color: AMBER_DARK,
  },
  llmAssistTabTextDisabled: {
    color: '#A8A29E',
  },
  llmAssistTabBody: {
    padding: 16,
  },
  llmContextSub: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#78716C',
    marginBottom: 10,
    lineHeight: 18,
  },
  llmContextInput: {
    height: 44,
    borderWidth: 1,
    borderColor: BORDER_WARM,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#292524',
    backgroundColor: '#FAFAF9',
  },
  llmContextInputDisabled: {
    opacity: 0.55,
    backgroundColor: '#F5F5F4',
  },
  llmContextPremiumHint: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#B45309',
    marginBottom: 8,
    lineHeight: 16,
  },
  llmMeterTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(217,119,6,0.12)',
    marginTop: 8,
    overflow: 'hidden',
  },
  llmMeterFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: 'rgba(217,119,6,0.45)',
    minWidth: 2,
  },
  llmTasteScroll: {
    flexGrow: 0,
  },
  llmTasteProfileText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#44403C',
    lineHeight: 21,
  },
  llmTasteProfilePlaceholder: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#78716C',
    lineHeight: 20,
  },
  sortOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sortOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  activeSortOption: {
    backgroundColor: AMBER_PRIMARY,
  },
  sortOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  activeSortOptionText: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  webListContent: {
    paddingBottom: 40,
    minHeight: '100%',
  },
  suggestionCard: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    paddingTop: 18,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 4,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  favoriteCornerHit: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 2,
    padding: 4,
  },
  suggestionCardBody: {
    paddingRight: 36,
  },
  suggestionPressableOutline: {
    borderRadius: 12,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingBottom: 4,
    marginBottom: -4,
  },
  suggestionPressablePressed: {
    backgroundColor: 'rgba(217, 119, 6, 0.06)',
  },
  expandedDetailBlock: {
    marginTop: 8,
    paddingTop: 4,
  },
  detailRevealHint: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: AMBER_DARK,
    marginTop: 10,
  },
  detailCollapse: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: AMBER_DARK,
    marginTop: 10,
    marginBottom: 2,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  suggestionType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  typeText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#57534E',
  },
  matchQualityPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(217, 119, 6, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.25)',
    maxWidth: '58%',
  },
  matchQualityPillText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: AMBER_DARK,
  },
  suggestionTitle: {
    fontSize: 19,
    fontFamily: 'Inter-SemiBold',
    color: '#1C1917',
    marginBottom: 6,
    lineHeight: 24,
  },
  suggestionReasonLead: {
    fontSize: 15,
    fontFamily: 'Inter-Medium',
    color: AMBER_PRIMARY,
    lineHeight: 22,
    marginBottom: 6,
  },
  suggestionLlmCaveat: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#78716C',
    fontStyle: 'italic',
    lineHeight: 17,
    marginBottom: 6,
  },
  suggestionFormatChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
    marginBottom: 8,
  },
  suggestionFormatChipText: {
    fontSize: 11,
    fontFamily: 'Inter-SemiBold',
    color: AMBER_DARK,
  },
  suggestionAuthor: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#57534E',
    marginBottom: 10,
  },
  suggestionDescription: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#44403C',
    lineHeight: 21,
    marginBottom: 4,
    marginTop: 4,
  },
  suggestionMetaCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 8,
  },
  metaTextInline: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#78716C',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingTextStrong: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#44403C',
  },
  ratingText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
  },
  suggestionMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  buttonContainer: {
    flexDirection: 'column',
    gap: 10,
    marginTop: 4,
  },
  addButtonFullWidth: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 14,
    minHeight: 52,
    width: '100%',
    shadowColor: 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  addedButtonWarm: {
    opacity: 0.78,
  },
  successButtonWarm: {
    opacity: 1,
    transform: [{ scale: 1.03 }],
    shadowColor: AMBER_PRIMARY,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  addButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  notForMeButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(180, 83, 9, 0.35)',
    backgroundColor: '#FAF6F0',
    width: '100%',
  },
  notForMeText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#5C5449',
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyStateDetails: {
    marginTop: 12,
    alignItems: 'center',
  },
  emptyStateDetail: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 4,
  },
  refreshingButton: {
    opacity: 0.5,
  },
  refreshIndicator: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    backgroundColor: 'transparent',
  },
  refreshIndicatorText: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  llmRefineStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  llmRefineStatusText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: AMBER_DARK,
    textAlign: 'center',
    marginLeft: 6,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  loadingSpinner: {
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: AMBER_DARK,
    marginBottom: 8,
    textAlign: 'center',
  },
  loadingSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  predictiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.75)',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  predictiveSpinner: {
    marginRight: 8,
  },
  predictiveText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: AMBER_DARK,
  },
  semanticIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FEF3C7',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  semanticText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
    marginLeft: 8,
  },
  semanticTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 243, 217, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: BORDER_WARM,
  },
  semanticTagText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
    marginLeft: 4,
  },
  yearFilterIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: '#E0F2FE',
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0288D1',
  },
  yearFilterText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#01579B',
  },
});