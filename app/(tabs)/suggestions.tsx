import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text, TouchableOpacity, ScrollView, Platform, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sparkles, BookOpen, Film, Filter, SlidersHorizontal, Star, TrendingUp, Heart, Zap, Plus } from 'lucide-react-native';
import { useDataStore } from '@/hooks/useDataStore';
import Header from '@/components/Header';
import SearchBar from '@/components/SearchBar';

interface Suggestion {
  id: string;
  title: string;
  author: string;
  year: number;
  isBook: boolean;
  reason: string;
  confidence: number;
  category: 'similar' | 'genre' | 'author' | 'mood' | 'trending' | 'format';
  rating?: number;
  format?: string;
  description?: string;
  estimatedPages?: number;
  estimatedLength?: 'short' | 'medium' | 'long';
  genres?: string[];
  mood?: string;
}

type SortOption = 'confidence' | 'length' | 'rating' | 'year';
type FilterOption = 'all' | 'books' | 'movies' | 'short' | 'medium' | 'long';

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
  
  // Define isDark constant to fix the ReferenceError
  const isDark = false;
  
  const [activeFilter, setActiveFilter] = useState<FilterOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('confidence');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());
  const [isProcessing, setIsProcessing] = useState<Set<string>>(new Set());

  // Force re-render when data store updates
  const [localForceUpdate, setLocalForceUpdate] = useState(0);
  
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

  // Helper functions - moved before useMemo
  const getSimilarWorks = (author: string): any[] => {
    const similarAuthors: { [key: string]: any[] } = {
      'David Grann': [
        { title: "The Lost City of Z", author: "David Grann", year: 2009, isBook: true, format: "text", rating: 4 },
        { title: "Killers of the Flower Moon", author: "David Grann", year: 2017, isBook: true, format: "text", rating: 5 }
      ],
      'Christopher Nolan': [
        { title: "Inception", author: "Christopher Nolan", year: 2010, isBook: false, format: "streaming", rating: 5 },
        { title: "Interstellar", author: "Christopher Nolan", year: 2014, isBook: false, format: "streaming", rating: 4 }
      ],
      'Denis Villeneuve': [
        { title: "Arrival", author: "Denis Villeneuve", year: 2016, isBook: false, format: "streaming", rating: 5 },
        { title: "Blade Runner 2049", author: "Denis Villeneuve", year: 2017, isBook: false, format: "streaming", rating: 4 }
      ]
    };

    return similarAuthors[author] || [];
  };

  const estimatePages = (title: string): number => {
    const basePages = 250;
    const titleLength = title.length;
    return Math.round(basePages + (titleLength * 5) + Math.random() * 100);
  };

  const estimateLength = (title: string): 'short' | 'medium' | 'long' => {
    const pages = estimatePages(title);
    if (pages < 200) return 'short';
    if (pages < 400) return 'medium';
    return 'long';
  };

  const inferGenres = (title: string, author: string): string[] => {
    const lowerTitle = title.toLowerCase();
    const lowerAuthor = author.toLowerCase();
    
    if (lowerTitle.includes('murder') || lowerTitle.includes('death')) return ['Mystery', 'Thriller'];
    if (lowerTitle.includes('love') || lowerTitle.includes('heart')) return ['Romance', 'Contemporary'];
    if (lowerAuthor.includes('nolan') || lowerTitle.includes('space')) return ['Sci-Fi', 'Drama'];
    
    return ['Fiction'];
  };

  const isItemAlreadyAdded = (suggestion: Suggestion): boolean => {
    const allUserItems = [
      ...books.completed,
      ...books.inProgress,
      ...books.planned,
      ...books.fails,
      ...books.allTime,
      ...movies.completed,
      ...movies.inProgress,
      ...movies.planned,
      ...movies.fails,
      ...movies.allTime,
    ];

    return allUserItems.some(item => 
      item.title.toLowerCase() === suggestion.title.toLowerCase() &&
      item.author.toLowerCase() === suggestion.author.toLowerCase()
    );
  };

  // Generate intelligent suggestions based on user's data
  const suggestions = useMemo(() => {
    const allSuggestions: Suggestion[] = [];
    
    // Get user's completed items for analysis
    const completedBooks = books.completed;
    const completedMovies = movies.completed;
    const allTimeItems = [...books.allTime, ...movies.allTime];
    
    // Analyze user preferences
    const favoriteAuthors = new Map<string, number>();
    const favoriteGenres = new Map<string, number>();
    const preferredFormats = new Map<string, number>();
    const moodPatterns = new Map<string, number>();
    
    // Analyze completed items
    [...completedBooks, ...completedMovies].forEach(item => {
      // Author/Director preferences
      favoriteAuthors.set(
        item.author, 
        (favoriteAuthors.get(item.author) || 0) + (item.rating || 3)
      );

      // Format preferences
      if (item.format) {
        preferredFormats.set(
          item.format,
          (preferredFormats.get(item.format) || 0) + 1
        );
      }

      // Analyze notes for mood patterns
      if (item.notes) {
        const notes = item.notes.toLowerCase();
        if (notes.includes('inspiring') || notes.includes('uplifting')) {
          moodPatterns.set('uplifting', (moodPatterns.get('uplifting') || 0) + 1);
        }
        if (notes.includes('dark') || notes.includes('intense')) {
          moodPatterns.set('dark', (moodPatterns.get('dark') || 0) + 1);
        }
        if (notes.includes('funny') || notes.includes('comedy')) {
          moodPatterns.set('funny', (moodPatterns.get('funny') || 0) + 1);
        }
      }
    });

    // Generate similar author suggestions
    const topAuthors = Array.from(favoriteAuthors.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    topAuthors.forEach(([author, score]) => {
      // Generate fictional similar works based on author
      const similarWorks = getSimilarWorks(author);
      similarWorks.forEach((work, index) => {
        allSuggestions.push({
          id: `similar-${author}-${index}`,
          title: work.title,
          author: work.author,
          year: work.year,
          isBook: work.isBook,
          reason: `Because you enjoyed works by ${author}`,
          confidence: Math.min(95, 70 + (score / 5) * 10),
          category: 'similar',
          format: work.format,
          rating: work.rating,
          estimatedPages: work.isBook ? estimatePages(work.title) : undefined,
          estimatedLength: estimateLength(work.title),
          genres: inferGenres(work.title, work.author),
        });
      });
    });

    // Generate trending suggestions
    const trendingItems = [
      { title: "Fourth Wing", author: "Rebecca Yarros", year: 2023, isBook: true, format: "text", rating: 4 },
      { title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Gabrielle Zevin", year: 2022, isBook: true, format: "text", rating: 5 },
      { title: "The Bear", author: "Christopher Storer", year: 2022, isBook: false, format: "streaming", rating: 5 },
      { title: "Wednesday", author: "Alfred Gough", year: 2022, isBook: false, format: "streaming", rating: 4 },
      { title: "Klara and the Sun", author: "Kazuo Ishiguro", year: 2021, isBook: true, format: "text", rating: 4 },
      { title: "Everything Everywhere All at Once", author: "Daniels", year: 2022, isBook: false, format: "streaming", rating: 5 },
    ];

    trendingItems.forEach((item, index) => {
      allSuggestions.push({
        id: `trending-${index}`,
        title: item.title,
        author: item.author,
        year: item.year,
        isBook: item.isBook,
        reason: "Currently trending and highly rated",
        confidence: 70,
        category: 'trending',
        format: item.format,
        rating: item.rating,
        estimatedPages: item.isBook ? estimatePages(item.title) : undefined,
        estimatedLength: estimateLength(item.title),
      });
    });

    // Generate genre-based suggestions
    const genreSuggestions = [
      { title: "The Seven Husbands of Evelyn Hugo", author: "Taylor Jenkins Reid", year: 2017, isBook: true, format: "text", genre: "Contemporary Fiction" },
      { title: "Project Hail Mary", author: "Andy Weir", year: 2021, isBook: true, format: "text", genre: "Science Fiction" },
      { title: "The Midnight Library", author: "Matt Haig", year: 2020, isBook: true, format: "text", genre: "Literary Fiction" },
      { title: "Dune: Part Two", author: "Denis Villeneuve", year: 2024, isBook: false, format: "theater", genre: "Science Fiction" },
      { title: "Knives Out", author: "Rian Johnson", year: 2019, isBook: false, format: "streaming", genre: "Mystery" },
    ];

    genreSuggestions.forEach((work, index) => {
      allSuggestions.push({
        id: `genre-${index}`,
        title: work.title,
        author: work.author,
        year: work.year,
        isBook: work.isBook,
        reason: `Popular in ${work.genre} - a genre you might enjoy`,
        confidence: 75,
        category: 'genre',
        format: work.format,
        estimatedPages: work.isBook ? estimatePages(work.title) : undefined,
        estimatedLength: estimateLength(work.title),
        genres: [work.genre],
      });
    });

    // Filter out items that are already in user's lists
    return allSuggestions.filter(suggestion => !isItemAlreadyAdded(suggestion));
  }, [books, movies]);

  // Filter and sort suggestions
  const filteredAndSortedSuggestions = useMemo(() => {
    let filtered = suggestions;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(suggestion =>
        suggestion.title.toLowerCase().includes(query) ||
        suggestion.author.toLowerCase().includes(query) ||
        suggestion.reason.toLowerCase().includes(query)
      );
    }

    // Apply type filter
    if (activeFilter === 'books') {
      filtered = filtered.filter(s => s.isBook);
    } else if (activeFilter === 'movies') {
      filtered = filtered.filter(s => !s.isBook);
    } else if (activeFilter === 'short' || activeFilter === 'medium' || activeFilter === 'long') {
      filtered = filtered.filter(s => s.estimatedLength === activeFilter);
    }

    // Sort suggestions
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'confidence':
          return b.confidence - a.confidence;
        case 'length':
          const aPages = a.estimatedPages || 0;
          const bPages = b.estimatedPages || 0;
          return aPages - bPages;
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'year':
          return b.year - a.year;
        default:
          return b.confidence - a.confidence;
      }
    });

    return filtered;
  }, [suggestions, searchQuery, activeFilter, sortBy]);

  // Completely rewritten handleAddToList with proper state management and NO rating pre-population
  const handleAddToList = async (suggestion: Suggestion) => {
    console.log('🎯 Starting handleAddToList for:', suggestion.title);
    
    // Prevent duplicate additions
    if (addedItems.has(suggestion.id) || isProcessing.has(suggestion.id)) {
      console.log('⚠️ Item already added or processing:', suggestion.id);
      Alert.alert(
        'Already Added',
        `"${suggestion.title}" is already in your list or being processed.`,
        [{ text: 'OK' }]
      );
      return;
    }

    // Mark as processing immediately
    setIsProcessing(prev => new Set(prev).add(suggestion.id));

    try {
      const currentDate = new Date().toISOString().split('T')[0];
      
      // Create the base item with all required fields and proper defaults
      // IMPORTANT: Do NOT pre-populate rating - always set to 0 for planned items
      const baseItem = {
        title: suggestion.title,
        author: suggestion.author,
        year: suggestion.year,
        category: 'planned' as const,
        notes: `Suggested: ${suggestion.reason}`,
        rating: 0, // FIXED: Always 0 for suggestions, no pre-population
        format: suggestion.format || (suggestion.isBook ? 'text' : 'streaming'),
        percentage: 0, // Always 0 for planned items
        source: '',
        dateAdded: currentDate,
        isAllTime: false,
      };

      console.log('📝 Created base item:', baseItem);

      // Add to the appropriate list with proper error handling
      if (suggestion.isBook) {
        console.log('📚 Adding book:', baseItem);
        addBook(baseItem);
        console.log('📚 Book addition completed');
        
      } else {
        console.log('🎬 Adding movie:', baseItem);
        addMovie(baseItem);
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

      // Success feedback with navigation guidance
      Alert.alert(
        'Successfully Added!',
        `"${suggestion.title}" has been added to your planned ${suggestion.isBook ? 'books' : 'movies'} list.\n\n📍 To view it:\n1. Go to the ${suggestion.isBook ? 'Books' : 'Movies'} tab\n2. Select "Planned" category\n3. Look for "${suggestion.title}"`,
        [{ 
          text: 'Got it!',
          onPress: () => {
            console.log('✅ User acknowledged successful addition');
          }
        }]
      );

      console.log('✅ Successfully completed handleAddToList');

    } catch (error) {
      console.error('❌ Error in handleAddToList:', error);
      
      // Detailed error reporting
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      Alert.alert(
        'Addition Failed',
        `Failed to add "${suggestion.title}" to your list.\n\nError: ${errorMessage}\n\nPlease try again or restart the app.`,
        [{ text: 'OK' }]
      );
    } finally {
      // Remove from processing set
      setIsProcessing(prev => {
        const newSet = new Set(prev);
        newSet.delete(suggestion.id);
        return newSet;
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return '#10B981';
    if (confidence >= 60) return '#F59E0B';
    return '#EF4444';
  };

  const renderSuggestionCard = ({ item: suggestion }: { item: Suggestion }) => {
    const isAdded = addedItems.has(suggestion.id);
    const isProcessingItem = isProcessing.has(suggestion.id);
    
    return (
      <View style={styles.suggestionCard}>
        <View style={styles.suggestionHeader}>
          <View style={styles.suggestionType}>
            {suggestion.isBook ? (
              <BookOpen size={16} color="#F59E0B" />
            ) : (
              <Film size={16} color="#3B82F6" />
            )}
            <Text style={styles.typeText}>
              {suggestion.isBook ? 'Book' : 'Movie'}
            </Text>
          </View>
          <View style={[styles.confidenceBadge, { backgroundColor: getConfidenceColor(suggestion.confidence) }]}>
            <Text style={styles.confidenceText}>{suggestion.confidence}%</Text>
          </View>
        </View>

        <Text style={styles.suggestionTitle} numberOfLines={2}>
          {suggestion.title}
        </Text>
        <Text style={styles.suggestionAuthor}>
          by {suggestion.author}
        </Text>

        <Text style={styles.suggestionReason} numberOfLines={2}>
          {suggestion.reason}
        </Text>

        <View style={styles.suggestionMeta}>
          <Text style={styles.metaText}>
            {suggestion.year}
          </Text>
          {suggestion.estimatedPages && (
            <Text style={styles.metaText}>
              ~{suggestion.estimatedPages} pages
            </Text>
          )}
          {suggestion.estimatedLength && (
            <Text style={styles.metaText}>
              {suggestion.estimatedLength} read
            </Text>
          )}
          {suggestion.rating && (
            <View style={styles.ratingContainer}>
              <Star size={12} color="#F59E0B" fill="#F59E0B" />
              <Text style={styles.ratingText}>{suggestion.rating}/5</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[
            styles.addButton, 
            { backgroundColor: suggestion.isBook ? '#F59E0B' : '#3B82F6' },
            (isAdded || isProcessingItem) && styles.addedButton
          ]}
          onPress={() => handleAddToList(suggestion)}
          disabled={isAdded || isProcessingItem}
          accessibilityRole="button"
          accessibilityLabel={isAdded ? `${suggestion.title} added to list` : `Add ${suggestion.title} to list`}
          accessibilityHint={isAdded ? 'This item has been added to your planned list' : 'Tap to add this item to your planned list'}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={styles.addButtonText}>
            {isProcessingItem 
              ? 'Adding...' 
              : isAdded 
                ? `Added to ${suggestion.isBook ? 'Books' : 'Movies'}` 
                : `Add to ${suggestion.isBook ? 'Books' : 'Movies'}`
            }
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  const filterOptions = [
    { key: 'all', label: 'All', icon: Sparkles },
    { key: 'books', label: 'Books', icon: BookOpen },
    { key: 'movies', label: 'Movies', icon: Film },
    { key: 'short', label: 'Short', icon: Zap },
    { key: 'medium', label: 'Medium', icon: TrendingUp },
    { key: 'long', label: 'Long', icon: Heart },
  ];

  const sortOptions = [
    { key: 'confidence', label: 'Confidence' },
    { key: 'length', label: 'Length' },
    { key: 'rating', label: 'Rating' },
    { key: 'year', label: 'Year' },
  ];

  return (
    <SafeAreaView style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <Header
        title="Suggestions"
        onAddPress={() => {}}
        onExportPress={() => generateComprehensiveExport()}
        onImportPress={() => importItems([], [])}
        primaryColor="#8B5CF6"
        secondaryColor="#7C3AED"
        isDark={false}
        backgroundColor="#F3F4F6"
      />

      {/* Search Bar */}
      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search suggestions..."
        isDark={false}
        backgroundColor="#F3F4F6"
      />

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
                    isActive && [styles.activeFilterChip, { backgroundColor: '#8B5CF6' }]
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
          style={styles.sortButton}
          onPress={() => setShowFilters(!showFilters)}
        >
          <SlidersHorizontal size={16} color="#6B7280" />
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

      {/* Suggestions List */}
      <FlatList
        data={filteredAndSortedSuggestions}
        keyExtractor={(item) => item.id}
        renderItem={renderSuggestionCard}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === 'web' && styles.webListContent
        ]}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <Sparkles size={48} color="#9CA3AF" />
            <Text style={styles.emptyText}>No suggestions found</Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? `Try adjusting your search for "${searchQuery}"` : 'Complete more books and movies to get personalized suggestions'}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  webContainer: {
    minHeight: '100vh',
    height: '100vh',
    maxHeight: '100vh',
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
    borderColor: '#8B5CF6',
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
    backgroundColor: '#8B5CF6',
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
    paddingBottom: 20,
  },
  webListContent: {
    paddingBottom: 40,
    minHeight: '100%',
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  suggestionType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#6B7280',
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  suggestionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionAuthor: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 8,
  },
  suggestionReason: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 12,
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
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#9CA3AF',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addedButton: {
    backgroundColor: '#10B981',
    opacity: 0.7,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
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
});