import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { X, Star, Search, Book, Film, ChevronRight } from 'lucide-react-native';
import { FormData, Book as BookType, Movie } from '@/types';
import { useAppSettings } from '@/hooks/useAppSettings';

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
    year: number;
    format: string;
    notes: string;
    rating: number;
  };
}

interface SearchResult {
  id: string;
  title: string;
  author: string;
  year?: number;
  description?: string;
  thumbnail?: string;
  rating?: number;
}

export default function AddEditModal({
  visible,
  onClose,
  onSave,
  editingItem,
  isBook,
  primaryColor,
  isDark = false,
  suggestionData,
}: AddEditModalProps) {
  const { settings, isLoading: settingsLoading } = useAppSettings();
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    title: '',
    author: '',
    year: new Date().getFullYear(),
    category: 'completed',
    notes: '',
    rating: 0,
    format: isBook ? 'text' : 'streaming',
    percentage: 100,
    source: '',
    completedDate: '',
    isAllTime: false,
  });

  // Initialize form data with proper defaults
  useEffect(() => {
    if (!visible) return;

    if (editingItem) {
      // Editing existing item - use item's current values
      const editFormData = {
        title: editingItem.title,
        author: editingItem.author,
        year: editingItem.year,
        category: editingItem.category,
        notes: editingItem.notes || '',
        rating: editingItem.rating || 0,
        format: editingItem.format || (isBook ? settings.defaultBookFormat : settings.defaultMovieFormat),
        percentage: editingItem.percentage || 100,
        source: editingItem.source || (isBook ? settings.defaultBookSource : settings.defaultMovieSource),
        completedDate: editingItem.completedDate || '',
        isAllTime: editingItem.isAllTime || false,
      };
      setFormData(editFormData);
    } else if (suggestionData) {
      // Pre-populate with suggestion data
      const suggestionFormData = {
        title: suggestionData.title,
        author: suggestionData.author,
        year: suggestionData.year,
        category: 'planned' as const, // Default to planned for suggestions
        notes: suggestionData.notes,
        rating: suggestionData.rating,
        format: suggestionData.format,
        percentage: 0, // Default for planned items
        source: isBook ? settings.defaultBookSource : settings.defaultMovieSource,
        completedDate: '',
        isAllTime: false,
      };
      setFormData(suggestionFormData);
    } else {
      // Creating new item - use default settings
      const newFormData = {
        title: '',
        author: '',
        year: new Date().getFullYear(),
        category: 'completed' as const,
        notes: '',
        rating: 0,
        format: isBook ? settings.defaultBookFormat : settings.defaultMovieFormat,
        percentage: 100,
        source: isBook ? settings.defaultBookSource : settings.defaultMovieSource,
        completedDate: '',
        isAllTime: false,
      };
      setFormData(newFormData);
    }
  }, [editingItem, isBook, visible, settings, settingsLoading, suggestionData]);

  // Reset search state when modal opens/closes
  useEffect(() => {
    if (visible) {
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
    }
  }, [visible]);

  // Search for books using Google Books API
  const searchBooks = async (query: string) => {
    try {
      const response = await fetch(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10`
      );
      const data = await response.json();
      
      if (data.items) {
        return data.items.map((item: any) => ({
          id: item.id,
          title: item.volumeInfo.title || 'Unknown Title',
          author: item.volumeInfo.authors?.[0] || 'Unknown Author',
          year: item.volumeInfo.publishedDate ? parseInt(item.volumeInfo.publishedDate.substring(0, 4)) : undefined,
          description: item.volumeInfo.description,
          thumbnail: item.volumeInfo.imageLinks?.thumbnail,
          rating: item.volumeInfo.averageRating,
        }));
      }
      return [];
    } catch (error) {
      console.error('Error searching books:', error);
      throw new Error('Failed to search books. Please try again.');
    }
  };

  // Search for movies using TMDB API (free tier)
  const searchMovies = async (query: string) => {
    try {
      // Using TMDB API - you would need to get a free API key from https://www.themoviedb.org/
      // For demo purposes, this is a mock implementation
      // In production, you'd replace this with actual TMDB API calls
      
      // Mock data for demonstration
      const mockResults = [
        {
          id: '1',
          title: query.includes('Oppenheimer') ? 'Oppenheimer' : `${query} (2023)`,
          author: query.includes('Oppenheimer') ? 'Christopher Nolan' : 'Director Name',
          year: 2023,
          description: `A biographical thriller about ${query}`,
          thumbnail: 'https://images.pexels.com/photos/7991579/pexels-photo-7991579.jpeg?auto=compress&cs=tinysrgb&w=300',
          rating: 4.5,
        },
        {
          id: '2',
          title: `${query} 2`,
          author: 'Another Director',
          year: 2022,
          description: `Another movie about ${query}`,
          thumbnail: 'https://images.pexels.com/photos/7991579/pexels-photo-7991579.jpeg?auto=compress&cs=tinysrgb&w=300',
          rating: 4.0,
        },
      ];
      
      return mockResults;
    } catch (error) {
      console.error('Error searching movies:', error);
      throw new Error('Failed to search movies. Please try again.');
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);

    try {
      const results = isBook 
        ? await searchBooks(searchQuery.trim())
        : await searchMovies(searchQuery.trim());
      
      setSearchResults(results);
      
      if (results.length === 0) {
        setSearchError(`No ${isBook ? 'books' : 'movies'} found for "${searchQuery}"`);
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result: SearchResult) => {
    const updatedFormData = {
      ...formData,
      title: result.title,
      author: result.author,
      year: result.year || new Date().getFullYear(),
      rating: result.rating ? Math.round(result.rating) : 0,
      notes: result.description ? result.description.substring(0, 200) + '...' : '',
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
    setFormData(prev => {
      const updates: Partial<FormData> = { category: newCategory };
      
      // When changing to completed, set percentage to 100 and clear progress
      if (newCategory === 'completed') {
        updates.percentage = 100;
      }
      // When changing from completed to other categories, set a default percentage if it's 100
      else if (prev.category === 'completed' && prev.percentage === 100) {
        if (newCategory === 'inProgress') {
          updates.percentage = 50; // Default for in-progress items
        } else if (newCategory === 'planned') {
          updates.percentage = 0; // Default for planned items
        } else if (newCategory === 'fails') {
          updates.percentage = 25; // Default for abandoned items
        } else {
          updates.percentage = 100; // Keep 100 for all-time favorites
        }
      }
      
      const updatedData = { ...prev, ...updates };
      return updatedData;
    });
  };

  const handleSave = () => {
    if (!formData.title.trim() || !formData.author.trim()) {
      AccessibilityInfo.announceForAccessibility('Please fill in both title and author fields');
      return;
    }
    
    // Ensure completed items have 100% progress
    const finalFormData = {
      ...formData,
      percentage: formData.category === 'completed' ? 100 : formData.percentage
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

  const renderSearchResults = () => (
    <ScrollView style={styles.searchResults} showsVerticalScrollIndicator={false}>
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
                {result.title}
              </Text>
              <Text style={[styles.searchResultAuthor, isDark && styles.darkSecondaryText]}>
                by {result.author}
              </Text>
              {result.year && (
                <Text style={[styles.searchResultYear, isDark && styles.darkTertiaryText]}>
                  {result.year}
                </Text>
              )}
              {result.rating && (
                <View style={styles.searchResultRating}>
                  <Star size={12} color="#F59E0B" fill="#F59E0B" />
                  <Text style={[styles.searchResultRatingText, isDark && styles.darkTertiaryText]}>
                    {result.rating.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>
            <ChevronRight size={16} color={isDark ? '#6B7280' : '#9CA3AF'} />
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
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
            style={[styles.searchInput, isDark && styles.darkSearchInput]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={`Search for ${isBook ? 'books' : 'movies'}...`}
            placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            accessibilityLabel="Search input"
            accessibilityHint={`Type to search for ${isBook ? 'books' : 'movies'}`}
          />
        </View>
        <TouchableOpacity
          style={[styles.searchButton, { backgroundColor: primaryColor }]}
          onPress={handleSearch}
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

      {searchError && (
        <View style={styles.errorContainer}>
          <Text style={[styles.errorText, isDark && styles.darkErrorText]}>
            {searchError}
          </Text>
        </View>
      )}

      {searchResults.length > 0 && renderSearchResults()}

      {!isSearching && searchResults.length === 0 && !searchError && searchQuery.trim() === '' && (
        <View style={styles.searchEmptyState}>
          {isBook ? <Book size={48} color={isDark ? "#6B7280" : "#9CA3AF"} /> : <Film size={48} color={isDark ? "#6B7280" : "#9CA3AF"} />}
          <Text style={[styles.emptyStateText, isDark && styles.darkSecondaryText]}>
            Search for {isBook ? 'books' : 'movies'} to auto-populate form fields
          </Text>
          <Text style={[styles.emptyStateSubtext, isDark && styles.darkTertiaryText]}>
            Try searching for titles, authors, or {isBook ? 'ISBN numbers' : 'directors'}
          </Text>
        </View>
      )}
    </View>
  );

  const renderFormView = () => (
    <ScrollView 
      style={styles.content} 
      showsVerticalScrollIndicator={false}
      accessibilityRole="form"
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
            accessibilityHint="Enter the title of the book or movie"
            accessibilityRequired={true}
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
            accessibilityRequired={true}
          />
        </View>

        <View style={styles.row}>
          <View style={[styles.inputGroup, styles.halfWidth]}>
            <Text style={[styles.label, isDark && styles.darkLabel]}>Year</Text>
            <TextInput
              style={[styles.input, isDark && styles.darkInput]}
              value={formData.year.toString()}
              onChangeText={(text) => setFormData(prev => ({ ...prev, year: parseInt(text) || new Date().getFullYear() }))}
              placeholder="Year"
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
                value={formData.percentage.toString()}
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

        {renderStarRating()}

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
          accessibilityRole="banner"
        >
          <Text 
            style={[styles.title, isDark && styles.darkText]}
            accessibilityRole="header"
            accessibilityLevel={1}
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
  searchResults: {
    flex: 1,
    paddingHorizontal: 20,
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
});