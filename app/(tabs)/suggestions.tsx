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
import { COMPREHENSIVE_MOVIE_DATA } from '@/data/comprehensiveMovieCatalog';
import {
  extractMoodSignals,
  moodSignalsAreActionable,
  orderLovedHighlightsForRefine,
  scoreRowAgainstMood,
  boostScoreWithLlmMoodIntent,
  type MoodSignals,
} from '@/utils/suggestionMoodSignals';
import { fetchMoodIntentFromProxy, type LlmMoodIntent } from '@/utils/llmMoodIntent';
import { ENABLE_LLM_ASSIST, isLlmPremiumFeatureActive, isLlmProxyReady } from '@/utils/llmFeatureGate';
import {
  clearPremiumRefineContext,
  PREMIUM_SUGGESTION_CONTEXT_BOOKS_KEY,
  PREMIUM_SUGGESTION_CONTEXT_LEGACY_KEY,
  PREMIUM_SUGGESTION_CONTEXT_MOVIES_KEY,
  TASTE_PROFILE_CACHE_KEY,
} from '@/utils/premiumRefineContext';
import {
  buildTasteProfileSnapshot,
  shouldIncludeFormatSuggestion,
} from '@/utils/tasteProfileSummary';
import { fetchTasteProfileNarrative } from '@/utils/llmTasteProfile';
import {
  buildListTasteReason,
  buildListTasteSignals,
  buildSemanticSimilarReason,
  clipTitleForSuggestionReason,
  ensureDistinctSuggestionReasons,
  isGenericSuggestionReason,
  listTasteMatchScore,
  stableTemplatePick,
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
  return isGenericSuggestionReason(reason);
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
    return {
      ...s,
      reason: buildSemanticSimilarReason(
        semantic[1],
        { title: s.title, author: s.author, genres: s.genres || [] },
        s.id
      ),
    };
  }
  return {
    ...s,
    reason: buildListTasteReason(
      { title: s.title, author: s.author, genres: s.genres || [] },
      listSignals,
      { ...refine, variationKey: s.id, templateSlot: stableTemplatePick(s.id, 16) }
    ),
  };
}

const TASTE_PROFILE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Fixed scroll viewport for taste tab (~6 lines); panel height does not grow with text. */
const TASTE_SNAPSHOT_SCROLL_HEIGHT = 132;

type LlmAssistPanelTab = 'refine-books' | 'refine-movies' | 'taste';
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
const NYT_API_KEY = process.env.EXPO_PUBLIC_NYT_API_KEY;
const LLM_PROXY_BASE_URL = process.env.EXPO_PUBLIC_LLM_PROXY_BASE_URL;
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
  const llmAssistConfigured = isLlmProxyReady(LLM_PROXY_BASE_URL);
  const llmRefineEnabled = isLlmPremiumFeatureActive(features, LLM_PROXY_BASE_URL);
  
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
    if (!llmRefineEnabled) return;

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

    void loadStoredLlmContext();
  }, [llmRefineEnabled]);

  useEffect(() => {
    if (!llmRefineEnabled) return;

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

    void saveBookRefineContext();
  }, [llmBookRefineContext, llmRefineEnabled]);

  useEffect(() => {
    if (!llmRefineEnabled) return;

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

    void saveMovieRefineContext();
  }, [llmMovieRefineContext, llmRefineEnabled]);

  /** Free tier: wipe refine UI, storage, and mood state so Premium text cannot keep steering picks. */
  useEffect(() => {
    if (llmRefineEnabled) return;

    const purgePremiumRefine = async () => {
      setLlmBookRefineContext('');
      setLlmMovieRefineContext('');
      setTasteProfileNarrative(null);
      setLlmRefineStatus(null);
      moodIntentBookRef.current = null;
      moodIntentMovieRef.current = null;
      try {
        await clearPremiumRefineContext();
      } catch (error) {
        console.warn('⚠️ Failed to clear premium refine context:', error);
      }
      if (refineContextEffectPrimedRef.current) {
        void generateSuggestions(true);
      }
    };

    void purgePremiumRefine();
  }, [llmRefineEnabled]);

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
  const hasTasteSnapshot = llmRefineEnabled && Boolean(tasteProfileNarrative?.trim());
  const showLlmAssistPanel = llmRefineEnabled && llmAssistConfigured;

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

    const bookRefineSource = llmRefineEnabled ? llmBookRefineContext : '';
    const movieRefineSource = llmRefineEnabled ? llmMovieRefineContext : '';
    const bookMoodSignals: MoodSignals | null = llmRefineEnabled
      ? extractMoodSignals(bookRefineSource)
      : null;
    const movieMoodSignals: MoodSignals | null = llmRefineEnabled
      ? extractMoodSignals(movieRefineSource)
      : null;
    const bookMoodActive = llmRefineEnabled && moodSignalsAreActionable(bookMoodSignals);
    const movieMoodActive = llmRefineEnabled && moodSignalsAreActionable(movieMoodSignals);
    const bookRefinePhrase = bookRefineSource.trim();
    const movieRefinePhrase = movieRefineSource.trim();
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
                  variationKey: `genre-book-${genre}-${index}`,
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
                  variationKey: `genre-movie-${genre}-${index}`,
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
              reason: buildListTasteReason(
                { title: book.title, author: book.author, genres: [genre] },
                listTasteSignals,
                {
                  refinePhrase: bookMoodActive ? bookRefinePhrase : undefined,
                  refineGenreSlugs: bookMoodSignals?.genreSlugs,
                  variationKey: `seasonal-${currentSeason}-${genre}-${index}`,
                  seasonLabel: currentSeason,
                }
              ),
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
      /\b(literary|booker|pulitzer|prize[\s-]?winning|debut novelist)\b/i.test(bookRefineSource);

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
              reason: buildListTasteReason(
                { title: book.title, author: book.author, genres: bookGenres },
                listTasteSignals,
                {
                  refinePhrase: bookMoodActive ? bookRefinePhrase : undefined,
                  refineGenreSlugs: bookMoodSignals?.genreSlugs,
                  variationKey: `award-${index}-${book.title}`,
                }
              ),
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
      const itemGenres = Array.isArray(item.genres) ? item.genres : [];
      allSuggestions.push({
        id: `trending-${index}`,
        title: item.title,
        author: item.author,
        year: item.year,
        isBook: item.isBook,
        reason: buildListTasteReason(
          { title: item.title, author: item.author, genres: itemGenres },
          listTasteSignals,
          {
            refinePhrase:
              item.isBook && bookMoodActive
                ? bookRefinePhrase
                : !item.isBook && movieMoodActive
                  ? movieRefinePhrase
                  : undefined,
            refineGenreSlugs: item.isBook ? bookMoodSignals?.genreSlugs : movieMoodSignals?.genreSlugs,
            variationKey: `trending-${index}-${item.title}`,
          }
        ),
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
          variationKey: `priority-genre-${index}-${work.title}`,
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
      const predictiveSuggestions = getPredictiveSuggestions(genre, listTasteSignals, {
        refinePhrase: bookMoodActive ? bookRefinePhrase : movieMoodActive ? movieRefinePhrase : undefined,
        refineGenreSlugs: bookMoodActive
          ? bookMoodSignals?.genreSlugs
          : movieMoodActive
            ? movieMoodSignals?.genreSlugs
            : undefined,
      });
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
            {
              refinePhrase: mood.phrase,
              refineGenreSlugs: mood.signals.genreSlugs,
              variationKey: s.id,
              templateSlot: stableTemplatePick(s.id, 16),
            }
          ),
        };
      });
      console.log(
        `🎯 Mood-aligned pool: ${filteredSuggestions.length} -> ${pipelineSuggestions.length} (refine picks)`
      );
    }

    const distinctReasonOptions = {
      refinePhrase: anyMoodActive
        ? bookMoodActive
          ? bookRefinePhrase
          : movieRefinePhrase
        : undefined,
      refineGenreSlugs: bookMoodActive
        ? bookMoodSignals?.genreSlugs
        : movieMoodActive
          ? movieMoodSignals?.genreSlugs
          : undefined,
      // Season wording only for `category: 'seasonal'` rows (see listTasteSignals).
      seasonLabel: getCurrentSeason(),
    };
    pipelineSuggestions = ensureDistinctSuggestionReasons(
      pipelineSuggestions,
      listTasteSignals,
      { ...distinctReasonOptions, preserveExistingReasons: false }
    );

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

    finalSuggestions = ensureDistinctSuggestionReasons(
      finalSuggestions,
      listTasteSignals,
      { ...distinctReasonOptions, preserveExistingReasons: true }
    );

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
    if (!llmRefineEnabled) return;

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
            reason: buildSemanticSimilarReason(
              targetItem.title,
              { title: item.title, author: item.author, genres: item.genres },
              `semantic-${targetItem.id}-${item.id}`
            ),
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

  const getPredictiveSuggestions = (
    genre: string,
    listSignals: ListTasteSignals,
    refine?: { refinePhrase?: string; refineGenreSlugs?: string[] }
  ): Suggestion[] => {
    const cachedBooks = predictiveCache.get(genre);
    if (!cachedBooks) return [];
    
    return cachedBooks.map((book, index) => ({
      id: `predictive-${genre}-${index}`,
      title: book.title,
      author: book.author,
      year: book.year,
      isBook: book.isBook,
      reason: buildListTasteReason(
        {
          title: book.title,
          author: book.author,
          genres: Array.isArray(book.genres) ? book.genres : [genre],
        },
        listSignals,
        { ...refine, variationKey: `predictive-${genre}-${index}` }
      ),
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
                  Premium unlocks AI refine. Upgrade in Settings to enable it.
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
                  Premium unlocks AI refine. Upgrade in Settings to enable it.
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