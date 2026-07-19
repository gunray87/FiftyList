
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  AccessibilityInfo,
  ActivityIndicator,
  Image,
  Alert,
  Keyboard,
  InteractionManager,
} from 'react-native';
import { X, Star, Search, Book, Film, ChevronRight } from 'lucide-react-native';
import { FormData, Book as BookType, Movie } from '@/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useSubscription } from '@/hooks/useSubscription';
import { searchMovies, MovieSearchResult, getLastOmdbSearchIssue } from '@/utils/movieSearch';
import { searchBooks, searchBooksAPI, BookSearchResult } from '@/utils/bookSearch';
import { DataQualityGate } from './DataQualityGate';
import UpgradeModal from './UpgradeModal';
import { llmPremiumPost, getLlmProxyBaseUrl } from '@/utils/llmProxyRequest';
import { isLlmPremiumFeatureActive, isLlmProxyReady } from '@/utils/llmFeatureGate';

interface AddEditModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (data: FormData) => void;
  editingItem?: BookType | Movie;
  isBook: boolean;
  primaryColor: string;
  isDark?: boolean;
  suggestionData?: {
    title: string;
    author: string;
    publicationYear: number;
    format: string;
    notes?: string;
    description?: string;
    rating: number;
  };
}

interface SearchResult {
  id: string;
  title: string;
  author: string;
  publicationYear?: number;
  description?: string;
  thumbnail?: string | null;
  rating?: number;
  source?: 'omdb' | 'tmdb' | 'hardcoded' | 'fallback' | 'google' | 'local';
}

function searchResultsSourceLabel(isBook: boolean, results: SearchResult[]): string {
  if (isBook) {
    if (results.some((r) => r.id.startsWith('google-'))) {
      return '🌐 Results from Google Books API';
    }
    return '📚 Results from local book catalog';
  }
  const hasOmdb = results.some((r) => r.id.startsWith('omdb-') || r.source === 'omdb');
  const hasTmdb = results.some((r) => r.id.startsWith('tmdb-') || r.source === 'tmdb');
  if (hasOmdb || hasTmdb) return '🌐 Results from OMDb';
  return '📚 Results from local movie catalog';
}

/** Parse YYYY-MM-DD without UTC shift (fixes off-by-one for some locales vs `Date` parsing). */
function parseCompletedDateParts(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return {
    year: parseInt(m[1], 10),
    month: parseInt(m[2], 10),
    day: parseInt(m[3], 10),
  };
}

const DATE_PICKER_ROW_HEIGHT = 38;
const DATE_PICKER_VIEWPORT_HEIGHT = 120;
const YEARS_BEFORE = 55;
const YEARS_AFTER = 2;

function clampDayToMonth(year: number, month: number, day: number) {
  const max = new Date(year, month, 0).getDate();
  return Math.min(day, max);
}

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

export default function AddEditModal({
  visible,
  onClose,
  onSave,
  editingItem,
  isBook = true,
  primaryColor = '#3B82F6',
  isDark = false,
  suggestionData,
}: AddEditModalProps) {
  const { settings, isLoading: settingsLoading } = useAppSettings();
  const { features, subscription, subscribeToPremium } = useSubscription();
  const llmProxyBaseUrl = getLlmProxyBaseUrl() ?? '';
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showAPISearchButton, setShowAPISearchButton] = useState(false);
  const [isAPISearching, setIsAPISearching] = useState(false);
  const [isLLMDraftLoading, setIsLLMDraftLoading] = useState(false);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const monthScrollRef = useRef<ScrollView>(null);
  const dayScrollRef = useRef<ScrollView>(null);
  const yearScrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Get current date for default values
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1; // getMonth() returns 0-11
  const currentDay = currentDate.getDate();

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState(currentDay);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    author: '',
    publicationYear: new Date().getFullYear(),
    category: 'completed',
    description: '',
    notes: '',
    rating: 0,
    format: isBook ? 'text' : 'streaming',
    percentage: 100,
    source: '',
    completedDate: `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`,
    isAllTime: false,
  });

  const syncPickerControlsFromISO = useCallback((iso: string) => {
    const raw = parseCompletedDateParts(iso);
    if (!raw) return;
    const safeDay = clampDayToMonth(raw.year, raw.month, raw.day);
    const normalized = `${raw.year}-${pad2(raw.month)}-${pad2(safeDay)}`;
    setSelectedYear(raw.year);
    setSelectedMonth(raw.month);
    setSelectedDay(safeDay);
    if (normalized !== iso.trim()) {
      setFormData(prev => ({ ...prev, completedDate: normalized }));
    }
  }, []);

  const yearOptions = useMemo(() => {
    const low = Math.min(currentYear - YEARS_BEFORE, selectedYear);
    const high = Math.max(currentYear + YEARS_AFTER, selectedYear);
    return Array.from({ length: high - low + 1 }, (_, i) => low + i);
  }, [currentYear, selectedYear]);

  // Initialize form data with proper defaults
  useEffect(() => {
    if (!visible) return;

    if (editingItem) {
      // Editing existing item - use item's current values
      const editFormData = {
        title: editingItem.title,
        author: editingItem.author,
        publicationYear: editingItem.publicationYear,
        category: editingItem.category,
        description: editingItem.description || '',
        notes: editingItem.notes || '',
        rating: editingItem.rating || 0,
        format: editingItem.format || (isBook ? settings.defaultBookFormat : settings.defaultMovieFormat),
        percentage: editingItem.percentage || 100,
        source: editingItem.source || (isBook ? settings.defaultBookSource : settings.defaultMovieSource),
        completedDate: editingItem.completedDate || `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`,
        isAllTime: editingItem.isAllTime || false,
      };
      setFormData(editFormData);
      syncPickerControlsFromISO(editFormData.completedDate);
    } else if (suggestionData) {
      // Pre-populate with suggestion data
      const suggestionFormData = {
        title: suggestionData.title,
        author: suggestionData.author,
        publicationYear: suggestionData.publicationYear,
        category: 'planned' as const, // Default to planned for suggestions
        description: suggestionData.description ?? '',
        notes: suggestionData.notes ?? '',
        rating: suggestionData.rating,
        format: suggestionData.format,
        percentage: 0, // Default for planned items
        source: isBook ? settings.defaultBookSource : settings.defaultMovieSource,
        completedDate: `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`,
        isAllTime: false,
      };
      setFormData(suggestionFormData);
      syncPickerControlsFromISO(suggestionFormData.completedDate);
    } else {
      // Creating new item - use default settings
      const newFormData = {
        title: '',
        author: '',
        publicationYear: new Date().getFullYear(),
        category: 'completed' as const,
        description: '',
        notes: '',
        rating: 0,
        format: isBook ? settings.defaultBookFormat : settings.defaultMovieFormat,
        percentage: 100,
        source: isBook ? settings.defaultBookSource : settings.defaultMovieSource,
        completedDate: `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`,
        isAllTime: false,
      };
      setFormData(newFormData);
      syncPickerControlsFromISO(newFormData.completedDate);
    }
  }, [
    editingItem,
    isBook,
    visible,
    settings,
    settingsLoading,
    suggestionData,
    syncPickerControlsFromISO,
    currentMonth,
    currentYear,
    currentDay,
  ]);

  // Scroll each column so the highlighted row sits in view (matches "Selected:" line).
  useEffect(() => {
    if (!visible || formData.category !== 'completed') return;
    let cancelled = false;
    const scroll = () => {
      if (cancelled) return;
      const pad = DATE_PICKER_VIEWPORT_HEIGHT / 2 - DATE_PICKER_ROW_HEIGHT / 2;
      monthScrollRef.current?.scrollTo({
        y: Math.max(0, (selectedMonth - 1) * DATE_PICKER_ROW_HEIGHT - pad),
        animated: false,
      });
      dayScrollRef.current?.scrollTo({
        y: Math.max(0, (selectedDay - 1) * DATE_PICKER_ROW_HEIGHT - pad),
        animated: false,
      });
      const yi = yearOptions.indexOf(selectedYear);
      if (yi >= 0) {
        yearScrollRef.current?.scrollTo({
          y: Math.max(0, yi * DATE_PICKER_ROW_HEIGHT - pad),
          animated: false,
        });
      }
    };
    const id = requestAnimationFrame(scroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [visible, selectedMonth, selectedDay, selectedYear, formData.category, yearOptions]);

  // Reset search state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
    }
  }, [visible]);

  // Helper functions for date picker
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month, 0).getDate();
  };

  const formatDateForDisplay = (dateString: string) => {
    if (!dateString) return 'Select date';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const updateCompletedDate = (year: number, month: number, day: number) => {
    const formattedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    setFormData(prev => ({ ...prev, completedDate: formattedDate }));
  };

  const handleDateChange = (type: 'year' | 'month' | 'day', value: number) => {
    let newYear = selectedYear;
    let newMonth = selectedMonth;
    let newDay = selectedDay;

    switch (type) {
      case 'year':
        newYear = value;
        break;
      case 'month':
        newMonth = value;
        // Adjust day if it exceeds the new month's days
        const daysInNewMonth = getDaysInMonth(newYear, newMonth);
        if (newDay > daysInNewMonth) {
          newDay = daysInNewMonth;
        }
        break;
      case 'day':
        newDay = value;
        break;
    }

    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
    setSelectedDay(newDay);
    updateCompletedDate(newYear, newMonth, newDay);
  };

  // Search for books using local database only
  const searchBooksLocal = async (query: string) => {
    try {
      console.log(`📚 Local book search requested for: "${query}"`);
      
      const results = await searchBooks(query);

      console.log(`✅ Found ${results.length} local book results for "${query}"`);
      return results.map((r) => ({ ...r, source: 'local' as const }));
    } catch (error) {
      console.error('Error searching local books:', error);
      return [];
    }
  };

  // Search for books using API
  const searchBooksAPIOnly = async (query: string) => {
    try {
      console.log(`📚 API book search requested for: "${query}"`);
      
      const results = await searchBooksAPI(query);

      console.log(`✅ Found ${results.length} API book results for "${query}"`);
      return results.map((r) => ({ ...r, source: 'google' as const }));
    } catch (error) {
      console.error('Error searching API books:', error);
      return [];
    }
  };

  // Search for movies using the shared utility
  const searchMoviesFunction = async (query: string) => {
    try {
      const results = await searchMovies(query);
      return results.map((result: MovieSearchResult) => ({
        id: result.id,
        title: result.title,
        author: result.author,
        publicationYear: result.year,
        description: result.description,
        thumbnail: result.thumbnail,
        rating: result.rating,
        source: result.source,
      }));
    } catch (error) {
      console.error('Error searching movies:', error);
      return [];
    }
  };

  const llmAssistConfigured = isLlmProxyReady(llmProxyBaseUrl);
  const llmAssistEnabled = isLlmPremiumFeatureActive(features, llmProxyBaseUrl);

  const dismissSearchKeyboard = useCallback(() => {
    searchInputRef.current?.blur();
    Keyboard.dismiss();
    if (Platform.OS === 'ios') {
      InteractionManager.runAfterInteractions(() => {
        Keyboard.dismiss();
      });
    }
  }, []);

  const handleLLMItemDraft = async () => {
    if (!llmProxyBaseUrl || !llmAssistConfigured) {
      Alert.alert(
        'AI unavailable',
        __DEV__
          ? 'LLM proxy is not loaded. Set EXPO_PUBLIC_LLM_PROXY_BASE_URL and EXPO_PUBLIC_ENABLE_LLM_ASSIST=true in .env, then restart Metro with: npx expo start --clear'
          : 'This build does not include the AI proxy URL. Install the latest TestFlight build.'
      );
      return;
    }

    if (!features.canUseLLM && !(__DEV__ && llmAssistConfigured)) {
      Alert.alert(
        'Premium feature',
        'AI item drafting requires an active Premium subscription. Upgrade in Settings to enable it.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View plans', onPress: () => setShowUpgradeModal(true) },
        ]
      );
      return;
    }

    if (!llmAssistEnabled) {
      Alert.alert('AI unavailable', 'AI drafting could not be enabled for this session. Try Restore Purchases in Settings.');
      return;
    }

    const draftTitle = formData.title.trim() || (showSearch ? searchQuery.trim() : '');
    const draftAuthor = formData.author.trim();
    const draftDescription = formData.description.trim();
    const draftNotes = formData.notes.trim();

    const hasInput = draftTitle || draftAuthor || draftDescription || draftNotes;
    if (!hasInput) {
      Alert.alert(
        'Add Some Context',
        'Enter a title, author/director, description, or notes before using AI draft.'
      );
      return;
    }

    setIsLLMDraftLoading(true);
    setLlmStatusMessage(null);

    try {
      const result = await llmPremiumPost<{
        draft?: {
          title?: string;
          author?: string;
          publicationYear?: number;
          notes?: string;
          description?: string;
        };
        remaining_actions?: number;
        message?: string;
      }>(
        '/llm/item-draft',
        'item_draft',
        {
          mediaType: isBook ? 'book' : 'movie',
          title: draftTitle,
          author: draftAuthor,
          description: draftDescription,
          notes: draftNotes,
        },
        15000
      );

      if (!result.ok) {
        const serverMsg = result.message?.trim();
        const fallback =
          result.status === 403
            ? 'Premium AI requires an active subscription.'
            : result.status === 0
              ? 'AI assist is not configured for this build, or the request timed out.'
              : `AI draft failed (${result.status})`;
        throw new Error(serverMsg && serverMsg.length > 0 ? serverMsg : fallback);
      }

      const payload = result.data;
      const draft = payload?.draft ?? {};

      setFormData((prev) => {
        const nextNotes =
          typeof draft.notes === 'string' && draft.notes.trim()
            ? draft.notes.trim()
            : prev.notes;
        const nextDescription =
          typeof draft.description === 'string' && draft.description.trim()
            ? draft.description.trim()
            : !prev.description.trim() && nextNotes
              ? nextNotes
              : prev.description;
        return {
          ...prev,
          title:
            typeof draft.title === 'string' && draft.title.trim() ? draft.title.trim() : prev.title || draftTitle,
          author:
            typeof draft.author === 'string' && draft.author.trim() ? draft.author.trim() : prev.author,
          publicationYear:
            typeof draft.publicationYear === 'number' && draft.publicationYear > 0
              ? draft.publicationYear
              : prev.publicationYear,
          notes: nextNotes,
          description: nextDescription,
        };
      });

      if (showSearch) {
        setShowSearch(false);
      }

      if (typeof payload?.remaining_actions === 'number') {
        setLlmStatusMessage(`AI actions remaining this period: ${payload.remaining_actions}`);
      } else {
        setLlmStatusMessage('AI draft applied.');
      }
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Try again later.';
      Alert.alert('AI Draft Failed', raw.includes('timed out') || raw.includes('not configured')
        ? raw
        : `Could not complete AI draft. ${raw}`);
    } finally {
      setIsLLMDraftLoading(false);
    }
  };

  const performSearch = async (query: string) => {
    setIsSearching(true);
    setSearchError(null);
    setShowAPISearchButton(false);

    try {
      if (isBook) {
        const localResults = await searchBooksLocal(query);
        setSearchResults(localResults);

        if (localResults.length === 0 && features.canSearchBooks) {
          setSearchError(null);
          setIsAPISearching(true);
          try {
            const apiResults = await searchBooksAPIOnly(query);
            if (apiResults.length > 0) {
              setSearchResults(apiResults);
            } else {
              setShowAPISearchButton(true);
              setSearchError(`No books found for "${query}"`);
            }
          } catch {
            setShowAPISearchButton(true);
            setSearchError(`No local results for "${query}". Online search failed — try again.`);
          } finally {
            setIsAPISearching(false);
          }
        } else if (localResults.length === 0) {
          setShowAPISearchButton(true);
          setSearchError(`No books found in local database for "${query}". Try searching online.`);
        } else {
          setSearchError(null);
        }
      } else if (!features.canSearchMovies) {
        setSearchError('Movie search requires Premium subscription. Upgrade to search movies with rich data.');
        setSearchResults([]);
      } else {
        const results = await searchMoviesFunction(query);
        setSearchResults(results);

        if (results.length === 0) {
          setSearchError(`No movies found for "${query}"`);
        } else if (!results.some((r) => r.id.startsWith('omdb-') || r.id.startsWith('tmdb-'))) {
          const omdbIssue = getLastOmdbSearchIssue();
          if (omdbIssue === 'missing_key') {
            setSearchError(
              'Showing local catalog only. Set EXPO_PUBLIC_OMDB_API_KEY in .env and restart Metro for OMDb results.'
            );
          } else if (omdbIssue === 'invalid_key') {
            setSearchError(
              'OMDb rejected your API key. Request a free key at omdbapi.com/apikey.aspx, update EXPO_PUBLIC_OMDB_API_KEY in .env, then restart Metro with cache cleared (npx expo start --clear).'
            );
          } else {
            setSearchError('Showing local catalog only. Online movie search is unavailable right now.');
          }
        } else {
          setSearchError(null);
        }
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const submitSearch = useCallback(() => {
    dismissSearchKeyboard();
    const query = searchQuery.trim();
    if (!query) return;
    void performSearch(query);
  }, [dismissSearchKeyboard, searchQuery, isBook, features.canSearchMovies]);

  const performAPISearch = async (query: string) => {
    if (!features.canSearchBooks) {
      setSearchError('Online book search requires Premium subscription. Upgrade to access Google Books API.');
      return;
    }

    setIsAPISearching(true);
    setSearchError(null);

    try {
      const apiResults = await searchBooksAPIOnly(query);

      if (apiResults.length > 0) {
        setSearchResults(apiResults);
        setSearchError(null);
      } else {
        setSearchError(`No books found online for "${query}"`);
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'API search failed');
    } finally {
      setIsAPISearching(false);
    }
  };

  const submitAPISearch = useCallback(() => {
    dismissSearchKeyboard();
    const query = searchQuery.trim();
    if (!query) return;
    void performAPISearch(query);
  }, [dismissSearchKeyboard, searchQuery, features.canSearchBooks]);

  const handleSelectSearchResult = (result: SearchResult) => {
    dismissSearchKeyboard();
    const updatedFormData = {
      ...formData,
      title: result.title,
      author: result.author,
      publicationYear: result.publicationYear || new Date().getFullYear(),
      rating: result.rating ? Math.round(result.rating) : 0,
      description: result.description?.trim() || '',
      notes: '',
      // Keep the current default format and source
      format: isBook ? settings.defaultBookFormat : settings.defaultMovieFormat,
      source: isBook ? settings.defaultBookSource : settings.defaultMovieSource,
    };

    setFormData(updatedFormData);
    
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
    
    AccessibilityInfo.announceForAccessibility(
      `Selected ${result.title} by ${result.author}. Form has been populated with details.`
    );
  };

  // Handle category change and automatically adjust percentage
  const handleCategoryChange = (newCategory: FormData['category']) => {
    let completionDateToAlign: string | null = null;

    setFormData(prev => {
      const updates: Partial<FormData> = { category: newCategory };

      // When changing to completed, set percentage to 100 and ensure a completion date exists
      if (newCategory === 'completed') {
        updates.percentage = 100;
        if (!prev.completedDate?.trim()) {
          updates.completedDate = `${currentYear}-${pad2(currentMonth)}-${pad2(currentDay)}`;
        }
      }
      // When changing from completed to other categories, set a default percentage if it's 100
      else if (prev.category === 'completed' && prev.percentage === 100) {
        if (newCategory === 'inProgress') {
          updates.percentage = 50;
        } else if (newCategory === 'planned') {
          updates.percentage = 0;
        } else if (newCategory === 'fails') {
          updates.percentage = 25;
        } else {
          updates.percentage = 100;
        }
      }

      const updatedData = { ...prev, ...updates };
      if (newCategory === 'completed' && updatedData.completedDate?.trim()) {
        completionDateToAlign = updatedData.completedDate.trim();
      }
      return updatedData;
    });

    if (completionDateToAlign) {
      const iso = completionDateToAlign;
      setTimeout(() => syncPickerControlsFromISO(iso), 0);
    }
  };

  const handleSave = () => {
    if (!formData.title.trim() || !formData.author.trim()) {
      AccessibilityInfo.announceForAccessibility('Please fill in both title and author fields');
      return;
    }
    
    // Ensure completed items have 100% progress; all-time list items are always favorites
    const finalFormData = {
      ...formData,
      percentage: formData.category === 'completed' ? 100 : formData.percentage,
      ...(formData.category === 'allTime' ? { isAllTime: true } : {}),
    };
    
    AccessibilityInfo.announceForAccessibility(
      editingItem 
        ? `${finalFormData.title} updated successfully`
        : `${finalFormData.title} added successfully`
    );
    
    onSave(finalFormData);
    onClose();
  };

  const handleClose = () => {
    AccessibilityInfo.announceForAccessibility('Form closed');
    onClose();
  };

  const renderStarRating = () => (
    <View style={styles.ratingContainer}>
      <Text style={[styles.label, isDark && styles.darkLabel]}>Rating</Text>
      <View 
        style={styles.starsRow}
        accessibilityRole="radiogroup"
        accessibilityLabel="Rating selection"
      >
        {[1, 2, 3, 4, 5].map(star => (
          <TouchableOpacity
            key={star}
            onPress={() => setFormData(prev => ({ ...prev, rating: star }))}
            accessibilityRole="radio"
            accessibilityLabel={`${star} star${star > 1 ? 's' : ''}`}
            accessibilityState={{ checked: star === formData.rating }}
            accessibilityHint={`Set rating to ${star} star${star > 1 ? 's' : ''}`}
          >
            <Star
              size={24}
              color={star <= formData.rating ? '#F59E0B' : (isDark ? '#4B5563' : '#D1D5DB')}
              fill={star <= formData.rating ? '#F59E0B' : 'transparent'}
            />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          onPress={() => setFormData(prev => ({ ...prev, rating: 0 }))}
          style={styles.clearButton}
          accessibilityRole="button"
          accessibilityLabel="Clear rating"
          accessibilityHint="Remove the current rating"
        >
          <Text style={[styles.clearText, isDark && styles.darkSecondaryText]}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSearchResultList = () => (
    <>
      <View style={styles.resultsSourceBanner}>
        <Text style={[styles.resultsSourceText, isDark && styles.darkSecondaryText]}>
          {searchResultsSourceLabel(isBook, searchResults)}
        </Text>
        {isBook && !features.canSearchBooks && (
          <TouchableOpacity
            onPress={() => {
              console.log('🔒 Upgrade link clicked in results banner');
              setShowUpgradeModal(true);
            }}
            style={styles.upgradeLink}
          >
            <Text style={styles.upgradeLinkText}>Upgrade for Online Search →</Text>
          </TouchableOpacity>
        )}
      </View>

      {searchResults.map((result) => (
        <TouchableOpacity
          key={result.id}
          style={[styles.searchResultItem, isDark && styles.darkSearchResultItem]}
          onPress={() => handleSelectSearchResult(result)}
          accessibilityRole="button"
          accessibilityLabel={`Select ${result.title} by ${result.author}`}
          accessibilityHint="Tap to populate form with this item's details"
        >
          <View style={styles.searchResultContent}>
            {result.thumbnail && (
              <Image
                source={{ uri: result.thumbnail }}
                style={styles.searchResultThumbnail}
                accessibilityRole="image"
                accessibilityLabel={`Cover image for ${result.title}`}
              />
            )}
            <View style={styles.searchResultDetails}>
              <Text style={[styles.searchResultTitle, isDark && styles.darkText]} numberOfLines={2}>
                {result.title || ''}
              </Text>
              <Text style={[styles.searchResultAuthor, isDark && styles.darkSecondaryText]}>
                by {result.author || ''}
              </Text>
              {result.publicationYear != null && result.publicationYear > 0 && (
                <Text style={[styles.searchResultYear, isDark && styles.darkTertiaryText]}>
                  {result.publicationYear}
                </Text>
              )}
              {result.rating != null && result.rating > 0 && (
                <View style={styles.searchResultRating}>
                  <Star size={12} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[styles.searchResultRatingText, isDark && styles.darkTertiaryText]}>
                    {result.rating?.toFixed(1) || '0.0'}
                  </Text>
                </View>
              )}
            </View>
            <ChevronRight size={16} color={isDark ? '#6B7280' : '#9CA3AF'} />
          </View>
        </TouchableOpacity>
      ))}
    </>
  );

  const renderSearchView = () => (
    <View style={styles.searchContainer}>
      <View style={styles.searchHeader}>
        <TouchableOpacity
          onPress={() => setShowSearch(false)}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back to form"
        >
          <X size={20} color={isDark ? "#9CA3AF" : "#6B7280"} />
        </TouchableOpacity>
        <Text style={[styles.searchTitle, isDark && styles.darkText]}>
          Search {isBook ? 'Books' : 'Movies'}
        </Text>
      </View>

      <View style={styles.searchInputContainer}>
        <View style={[styles.searchInputWrapper, isDark && styles.darkSearchInputWrapper]}>
          <Search size={20} color={isDark ? "#6B7280" : "#9CA3AF"} />
          <TextInput
            ref={searchInputRef}
            style={[styles.searchInput, isDark && styles.darkSearchInput]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search for ${isBook ? 'books' : 'movies'}...`}
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            accessibilityLabel="Search input"
            accessibilityHint={`Type to search for ${isBook ? 'books' : 'movies'}`}
            textAlignVertical="center"
            blurOnSubmit
            submitBehavior="submit"
            selectTextOnFocus={false}
            autoComplete="off"
          />
        </View>
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: primaryColor }]}
          onPressIn={dismissSearchKeyboard}
          onPress={submitSearch}
          disabled={!searchQuery.trim() || isSearching}
          accessibilityRole="button"
          accessibilityLabel="Search"
          accessibilityHint="Tap to search for items"
        >
          {isSearching ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Search size={20} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.searchResultsScroll}
        contentContainerStyle={styles.searchResultsScrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
      {llmStatusMessage && (
        <Text style={[styles.llmStatusText, isDark && styles.darkSecondaryText]}>{llmStatusMessage}</Text>
      )}

      {searchError && (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, isDark && styles.darkErrorText]}>
            {searchError || ''}
          </Text>
          {showAPISearchButton && isBook && features.canSearchBooks && (
            <TouchableOpacity
              style={[styles.apiSearchButton, { backgroundColor: primaryColor }]}
              onPressIn={dismissSearchKeyboard}
              onPress={submitAPISearch}
              disabled={isAPISearching}
              accessibilityRole="button"
              accessibilityLabel="Search online for books"
              accessibilityHint="Search Google Books API for additional results"
            >
              {isAPISearching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Search size={16} color="#FFFFFF" />
                  <Text style={styles.apiSearchButtonText}>
                    Search Online
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}
          {showAPISearchButton && isBook && !features.canSearchBooks && (
            <TouchableOpacity 
              style={[styles.upgradePrompt, { borderColor: primaryColor }]}
              onPress={() => {
                console.log('🔒 Upgrade prompt clicked in search');
                setShowUpgradeModal(true);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.upgradePromptText, isDark && styles.darkText]}>
                🔒 Online search requires Premium
              </Text>
              <Text style={[styles.upgradePromptSubtext, isDark && styles.darkSecondaryText]}>
                Tap here to upgrade and search Google Books API with enhanced data
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {searchResults.length > 0 && (
        <View style={styles.searchResults}>{renderSearchResultList()}</View>
      )}

      {!isSearching && searchResults.length === 0 && !searchError && searchQuery.trim() === '' && (
        <View style={styles.searchEmptyState}>
          {isBook ? (
            <>
              <Book size={48} color={isDark ? "#6B7280" : "#9CA3AF"} />
              <Text style={[styles.emptyStateText, isDark && styles.darkSecondaryText]}>
                Search for books to auto-populate form fields
              </Text>
              <Text style={[styles.emptyStateSubtext, isDark && styles.darkTertiaryText]}>
                Try searching for titles, authors, or ISBN numbers
              </Text>
            </>
          ) : (
            <DataQualityGate feature="movie_search">
              <Film size={48} color={isDark ? "#6B7280" : "#9CA3AF"} />
              <Text style={[styles.emptyStateText, isDark && styles.darkSecondaryText]}>
                Search for movies to auto-populate form fields
              </Text>
              <Text style={[styles.emptyStateSubtext, isDark && styles.darkTertiaryText]}>
                Try searching for titles, directors, or actors
              </Text>
            </DataQualityGate>
          )}
        </View>
      )}
      </ScrollView>
    </View>
  );

  const renderFormView = () => (
    <ScrollView 
      style={styles.content} 
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.form}>
        {/* Search Button - only show if not pre-populated with suggestion data */}
        {!suggestionData && (
          <>
            <TouchableOpacity
              style={[styles.searchPromptButton, isDark && styles.darkSearchPromptButton]}
              onPress={() => setShowSearch(true)}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${isBook ? 'books' : 'movies'}`}
              accessibilityHint="Open search to auto-populate form fields"
            >
              <Search size={20} color={primaryColor} />
              <Text style={[styles.searchPromptText, { color: primaryColor }]}>
                Search for {isBook ? 'books' : 'movies'}
              </Text>
              <ChevronRight size={16} color={primaryColor} />
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, isDark && styles.darkDividerLine]} />
              <Text style={[styles.dividerText, isDark && styles.darkSecondaryText]}>or enter manually</Text>
              <View style={[styles.dividerLine, isDark && styles.darkDividerLine]} />
            </View>
            {llmAssistEnabled ? (
              <TouchableOpacity
                style={[styles.llmDraftButton, { borderColor: primaryColor }]}
                onPress={handleLLMItemDraft}
                disabled={isLLMDraftLoading}
                accessibilityRole="button"
                accessibilityLabel="AI draft item details"
                accessibilityHint="Use premium AI to complete item details"
              >
                {isLLMDraftLoading ? (
                  <ActivityIndicator size="small" color={primaryColor} />
                ) : (
                  <Text style={[styles.llmButtonText, { color: primaryColor }]}>
                    AI Draft Item Details
                  </Text>
                )}
              </TouchableOpacity>
            ) : llmAssistConfigured ? (
              <TouchableOpacity
                style={[styles.llmDraftButton, styles.llmDraftButtonLocked, { borderColor: '#D1D5DB' }]}
                onPress={() => setShowUpgradeModal(true)}
                accessibilityRole="button"
                accessibilityLabel="AI draft item details, premium only"
                accessibilityHint="Opens upgrade options for Premium AI drafting"
              >
                <Text style={[styles.llmButtonText, styles.llmButtonTextLocked]}>
                  🔒 AI Draft Item Details (Premium)
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        )}

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>Title *</Text>
          <TextInput
            style={[styles.input, isDark && styles.darkInput]}
            value={formData.title}
            onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
            placeholder="Enter title"
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            accessibilityLabel="Title"
            // Add stability props to prevent recycling crashes
            textAlignVertical="center"
            blurOnSubmit={false}
            selectTextOnFocus={false}
            autoComplete="off"
            accessibilityHint="Enter the title of the book or movie"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>{isBook ? 'Author' : 'Director'} *</Text>
          <TextInput
            style={[styles.input, isDark && styles.darkInput]}
            value={formData.author}
            onChangeText={(text) => setFormData(prev => ({ ...prev, author: text }))}
            placeholder={`Enter ${isBook ? 'author' : 'director'}`}
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            accessibilityLabel={isBook ? 'Author' : 'Director'}
            accessibilityHint={`Enter the ${isBook ? 'author' : 'director'} name`}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.halfWidth]}>
                          <Text style={[styles.label, isDark && styles.darkLabel]}>Publication Year</Text>
                        <TextInput
              style={[styles.input, isDark && styles.darkInput]}
              value={formData.publicationYear?.toString() || ''}
              onChangeText={(text) => setFormData(prev => ({ ...prev, publicationYear: parseInt(text) || new Date().getFullYear() }))}
              placeholder="Publication Year"
              placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
              keyboardType="numeric"
              accessibilityLabel="Year"
              accessibilityHint="Enter the year this was published or released"
            />
          </View>

          {/* Only show progress field for non-completed categories */}
          {formData.category !== 'completed' && (
            <View style={[styles.inputGroup, styles.halfWidth]}>
              <Text style={[styles.label, isDark && styles.darkLabel]}>Progress %</Text>
              <TextInput
                style={[styles.input, isDark && styles.darkInput]}
                value={formData.percentage?.toString() || ''}
                onChangeText={(text) => setFormData(prev => ({ ...prev, percentage: parseInt(text) || 0 }))}
                placeholder="0-100"
                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                keyboardType="numeric"
                accessibilityLabel="Progress percentage"
                accessibilityHint="Enter how much you have completed, from 0 to 100 percent"
              />
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>Format</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            accessibilityLabel="Format selection"
          >
            <View style={styles.formatOptions}>
              {(isBook ? 
                [{ value: 'text', label: 'Hardcopy' }, { value: 'audio', label: 'Audio' }, { value: 'ebook', label: 'eBook' }] :
                [{ value: 'streaming', label: 'Streaming' }, { value: 'theater', label: 'Theater' }, { value: 'bluray', label: 'Blu-ray' }, { value: 'dvd', label: 'DVD' }]
              ).map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.formatOption,
                    isDark && styles.darkFormatOption,
                    formData.format === option.value && { backgroundColor: primaryColor }
                  ]}
                  onPress={() => {
                    setFormData(prev => ({ ...prev, format: option.value }));
                  }}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: formData.format === option.value }}
                  accessibilityHint={`Set format to ${option.label}`}
                >
                  <Text style={[
                    styles.formatOptionText,
                    isDark && styles.darkFormatOptionText,
                    formData.format === option.value && { color: '#FFFFFF' }
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>Category</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            accessibilityRole="radiogroup"
            accessibilityLabel="Category selection"
          >
            <View style={styles.formatOptions}>
              {[
                { value: 'completed', label: 'Completed' },
                { value: 'inProgress', label: isBook ? 'Reading' : 'Watching' },
                { value: 'planned', label: 'Planned' },
                { value: 'fails', label: 'Stopped' },
                { value: 'allTime', label: 'All Time' },
              ].map(option => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.formatOption,
                    isDark && styles.darkFormatOption,
                    formData.category === option.value && { backgroundColor: primaryColor }
                  ]}
                  onPress={() => handleCategoryChange(option.value as any)}
                  accessibilityRole="radio"
                  accessibilityLabel={option.label}
                  accessibilityState={{ checked: formData.category === option.value }}
                  accessibilityHint={`Set category to ${option.label}`}
                >
                  <Text style={[
                    styles.formatOptionText,
                    isDark && styles.darkFormatOptionText,
                    formData.category === option.value && { color: '#FFFFFF' }
                  ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Show progress explanation for completed items */}
        {formData.category === 'completed' && (
          <View style={styles.progressNote}>
            <Text style={[styles.progressNoteText, isDark && styles.darkSecondaryText]}>
              ✓ Completed items are automatically set to 100% progress
            </Text>
          </View>
        )}

        {/* Date picker for completed items */}
        {formData.category === 'completed' && (
          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.darkLabel]}>Completion Date</Text>
            <View style={styles.datePickerContainer}>
              {/* Month Picker */}
              <View style={[styles.datePickerColumn, styles.halfWidth]}>
                <Text style={[styles.datePickerLabel, isDark && styles.darkLabel]}>Month</Text>
                <ScrollView
                  ref={monthScrollRef}
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <TouchableOpacity
                      key={month}
                      style={[
                        styles.datePickerOption,
                        isDark && styles.darkDatePickerOption,
                        selectedMonth === month && { backgroundColor: primaryColor }
                      ]}
                      onPress={() => handleDateChange('month', month)}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        isDark && styles.darkDatePickerOptionText,
                        selectedMonth === month && { color: '#FFFFFF' }
                      ]}>
                        {new Date(2000, month - 1).toLocaleDateString('en-US', { month: 'short' })}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Day Picker */}
              <View style={[styles.datePickerColumn, styles.halfWidth]}>
                <Text style={[styles.datePickerLabel, isDark && styles.darkLabel]}>Day</Text>
                <ScrollView
                  ref={dayScrollRef}
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1).map(day => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.datePickerOption,
                        isDark && styles.darkDatePickerOption,
                        selectedDay === day && { backgroundColor: primaryColor }
                      ]}
                      onPress={() => handleDateChange('day', day)}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        isDark && styles.darkDatePickerOptionText,
                        selectedDay === day && { color: '#FFFFFF' }
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Year Picker */}
              <View style={[styles.datePickerColumn, styles.halfWidth]}>
                <Text style={[styles.datePickerLabel, isDark && styles.darkLabel]}>Year</Text>
                <ScrollView
                  ref={yearScrollRef}
                  style={styles.datePickerScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {yearOptions.map(year => (
                    <TouchableOpacity
                      key={year}
                      style={[
                        styles.datePickerOption,
                        isDark && styles.darkDatePickerOption,
                        selectedYear === year && { backgroundColor: primaryColor }
                      ]}
                      onPress={() => handleDateChange('year', year)}
                    >
                      <Text style={[
                        styles.datePickerOptionText,
                        isDark && styles.darkDatePickerOptionText,
                        selectedYear === year && { color: '#FFFFFF' }
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
            <Text style={[styles.dateDisplay, isDark && styles.darkSecondaryText]}>
              Selected: {formatDateForDisplay(formData.completedDate)}
            </Text>
          </View>
        )}

        {renderStarRating()}

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, isDark && styles.darkInput]}
            value={formData.description}
            onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
            placeholder="Synopsis or summary from search (optional)"
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            multiline
            numberOfLines={3}
            accessibilityLabel="Description"
            accessibilityHint="Catalog or synopsis text, often filled when you pick a search result"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea, isDark && styles.darkInput]}
            value={formData.notes}
            onChangeText={(text) => setFormData(prev => ({ ...prev, notes: text }))}
            placeholder="Personal notes, thoughts, or recommendations..."
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            multiline
            numberOfLines={3}
            accessibilityLabel="Notes"
            accessibilityHint="Add any personal notes, thoughts, or recommendations"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={[styles.label, isDark && styles.darkLabel]}>Source</Text>
          <TextInput
            style={[styles.input, isDark && styles.darkInput]}
            value={formData.source}
            onChangeText={(text) => {
              setFormData(prev => ({ ...prev, source: text }));
            }}
            placeholder={isBook ? 'Amazon, Kindle, Libby, etc.' : 'Netflix, Amazon Prime, Theater, etc.'}
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            accessibilityLabel="Source"
            accessibilityHint={`Where you got this ${isBook ? 'book' : 'movie'} from`}
          />
        </View>

        <TouchableOpacity
          style={styles.checkboxContainer}
          onPress={() => setFormData(prev => ({ ...prev, isAllTime: !prev.isAllTime }))}
          accessibilityRole="checkbox"
          accessibilityLabel="Add to All Time favorites"
          accessibilityState={{ checked: formData.isAllTime }}
          accessibilityHint="Mark this as one of your all-time favorites"
        >
          <View style={[
            styles.checkbox,
            isDark && styles.darkCheckbox,
            formData.isAllTime && { backgroundColor: primaryColor }
          ]}>
            {formData.isAllTime && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={[styles.checkboxLabel, isDark && styles.darkLabel]}>Add to All Time favorites</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // Determine modal title based on context
  const getModalTitle = () => {
    if (editingItem) {
      return `Edit ${isBook ? 'Book' : 'Movie'}`;
    } else {
      return `Add ${isBook ? 'Book' : 'Movie'}`;
    }
  };

  // Determine save button text based on context
  const getSaveButtonText = () => {
    if (editingItem) {
      return `Update ${isBook ? 'Book' : 'Movie'}`;
    } else {
      return `Save ${isBook ? 'Book' : 'Movie'}`;
    }
  };

  return (
    <>
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
      accessibilityViewIsModal={true}
    >
      <KeyboardAvoidingView
        style={[styles.container, isDark && styles.darkContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View 
          style={[styles.header, isDark && styles.darkHeader]}
        >
          <Text 
            style={[styles.title, isDark && styles.darkText]}
          >
            {getModalTitle()}
          </Text>
          <TouchableOpacity 
            onPress={handleClose} 
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close form"
            accessibilityHint="Cancel and return to the list"
          >
            <X size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </TouchableOpacity>
        </View>

        {showSearch ? renderSearchView() : renderFormView()}

        {!showSearch && (
          <View 
            style={[styles.footer, isDark && styles.darkFooter]}
            accessibilityRole="toolbar"
          >
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: primaryColor }]}
              onPress={handleSave}
              accessibilityRole="button"
              accessibilityLabel={getSaveButtonText()}
              accessibilityHint={`${editingItem ? 'Update the existing' : 'Add this new'} ${isBook ? 'book' : 'movie'} to your list`}
            >
              <Text style={styles.saveButtonText}>
                {getSaveButtonText()}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.cancelButton, isDark && styles.darkCancelButton]} 
              onPress={handleClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              accessibilityHint="Cancel and return to the list without saving"
            >
              <Text style={[styles.cancelButtonText, isDark && styles.darkCancelButtonText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>

    {/* Upgrade Modal */}
    <UpgradeModal
      visible={showUpgradeModal}
      onClose={() => setShowUpgradeModal(false)}
      onSelectPlan={async () => {
        try {
          console.log('💳 User selected Premium from AddEditModal');
          const completed = await subscribeToPremium();
          if (!completed) {
            Alert.alert(
              'Purchase not completed',
              'Your plan was not changed. Try again or use Restore Purchases in Settings.'
            );
            return;
          }
          setShowUpgradeModal(false);
        } catch (error) {
          console.error('❌ Upgrade failed:', error);
          Alert.alert(
            'Purchase failed',
            error instanceof Error ? error.message : 'Something went wrong. Please try again.'
          );
        }
      }}
      isDark={isDark}
      triggerFeature="Online Book Search"
    />
  </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  darkContainer: {
    backgroundColor: '#111827',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  darkHeader: {
    borderBottomColor: '#374151',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  darkText: {
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  form: {
    padding: 20,
    gap: 20,
  },
  searchPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  darkSearchPromptButton: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  searchPromptText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  darkDividerLine: {
    backgroundColor: '#374151',
  },
  dividerText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  darkLabel: {
    color: '#D1D5DB',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  darkInput: {
    borderColor: '#4B5563',
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfWidth: {
    flex: 1,
  },
  formatOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  formatOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkFormatOption: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  formatOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkFormatOptionText: {
    color: '#D1D5DB',
  },
  progressNote: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  progressNoteText: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#059669',
  },
  darkSecondaryText: {
    color: '#D1D5DB',
  },
  ratingContainer: {
    gap: 8,
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButton: {
    marginLeft: 8,
  },
  clearText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkCheckbox: {
    borderColor: '#4B5563',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  checkboxLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  darkFooter: {
    borderTopColor: '#374151',
  },
  saveButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  cancelButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  darkCancelButton: {
    backgroundColor: '#374151',
  },
  cancelButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkCancelButtonText: {
    color: '#D1D5DB',
  },
  // Search-specific styles
  searchContainer: {
    flex: 1,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
  },
  searchTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  searchInputContainer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkSearchInputWrapper: {
    backgroundColor: '#1F2937',
    borderColor: '#4B5563',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#111827',
  },
  darkSearchInput: {
    color: '#FFFFFF',
  },
  searchButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  llmDraftButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  llmDraftButtonLocked: {
    backgroundColor: '#F9FAFB',
    opacity: 0.9,
  },
  llmButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  llmButtonTextLocked: {
    color: '#9CA3AF',
    fontFamily: 'Inter-Medium',
  },
  llmStatusText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    marginTop: 8,
    textAlign: 'center',
  },
  errorContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#EF4444',
    textAlign: 'center',
  },
  darkErrorText: {
    color: '#F87171',
  },
  apiSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  apiSearchButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  searchResultsScroll: {
    flex: 1,
  },
  searchResultsScrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  searchResults: {
    paddingHorizontal: 20,
  },
  resultsSourceBanner: {
    backgroundColor: '#EFF6FF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  resultsSourceText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#1E40AF',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  upgradeLink: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  upgradeLinkText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#8B5CF6',
    textDecorationLine: 'underline',
    letterSpacing: 0.1,
  },
  searchResultItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  darkSearchResultItem: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  searchResultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  searchResultThumbnail: {
    width: 60,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  searchResultDetails: {
    flex: 1,
    gap: 4,
  },
  searchResultTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  searchResultAuthor: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  searchResultYear: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  darkTertiaryText: {
    color: '#9CA3AF',
  },
  searchResultRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  searchResultRatingText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
  },
  searchEmptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  // Date picker styles
  datePickerContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  datePickerColumn: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    marginBottom: 4,
  },
  datePickerScroll: {
    height: 120,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
  },
  darkDatePickerScroll: {
    borderColor: '#4B5563',
    backgroundColor: '#1F2937',
  },
  datePickerOption: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkDatePickerOption: {
    backgroundColor: '#1F2937',
  },
  datePickerOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#374151',
  },
  darkDatePickerOptionText: {
    color: '#D1D5DB',
  },
  dateDisplay: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  // Upgrade prompt styles
  upgradePrompt: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
  },
  upgradePromptText: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 4,
    textAlign: 'center',
  },
  upgradePromptSubtext: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
});