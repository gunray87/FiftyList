import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text, Alert, Share, Modal, TextInput, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Film, Clock, Target, X, Star } from 'lucide-react-native';
import { useDataStore } from '@/hooks/useDataStore';
import { useAppSettings } from '@/hooks/useAppSettings';
import Header from '@/components/Header';
import GoalProgress from '@/components/GoalProgress';
import TabNavigation from '@/components/TabNavigation';
import ItemCard from '@/components/ItemCard';
import DraggableItemCard from '@/components/DraggableItemCard';
import AddEditModal from '@/components/AddEditModal';
import ImportModal from '@/components/ImportModal';
import SearchBar from '@/components/SearchBar';
import YearFolderSelector from '../../components/YearFolderSelector';
import ActivitySharingModal from '@/components/ActivitySharingModal';
import ExportOptionsModal from '@/components/ExportOptionsModal';
import { fieldMatchesQuery } from '@/utils/searchMatch';
import { alertAfterShareError, shareExportViaMessages } from '@/utils/postShareFlow';
import { ExportOptions } from '@/types';
import { ListSortBy, parseQuickListIntent } from '@/utils/llmListSearch';

const PREMIUM_LIST_SEARCH_MAX_CHARS = 120;

export default function MoviesScreen() {
  const { 
    movies, 
    movieGoal, 
    addMovie, 
    updateMovie, 
    deleteMovie, 
    reorderMovies, 
    setMovieGoal, 
    generateComprehensiveExport, 
    importItems,
    forceUpdate 
  } = useDataStore();
  const { settings, isLoading: isSettingsLoading } = useAppSettings();

  const [activeTab, setActiveTab] = useState('completed');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingMovie, setEditingMovie] = useState<any | undefined>();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempGoal, setTempGoal] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showExportOptionsModal, setShowExportOptionsModal] = useState(false);
  const [showSharingModal, setShowSharingModal] = useState(false);
  const [panelView, setPanelView] = useState<'goal' | 'categories'>('categories');
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (isSettingsLoading) return;
    setActiveTab(settings.defaultMovieListTab);
    if (settings.defaultMovieListTab === 'completed') {
      setSelectedYear(currentYear);
    } else {
      setSelectedYear('all');
    }
  }, [isSettingsLoading, settings.defaultMovieListTab, currentYear]);
  
  // Enhanced state monitoring for movies screen
  useEffect(() => {
    console.log('🎬 Movies screen - Movies state updated:', {
      completed: movies.completed.length,
      inProgress: movies.inProgress.length,
      planned: movies.planned.length,
      fails: movies.fails.length,
      allTime: movies.allTime.length,
      forceUpdate: forceUpdate,
    });
    
    if (movies.planned.length > 0) {
      console.log('🎬 Movies screen - Current planned movies:', movies.planned.map(movie => ({
        id: movie.id,
        title: movie.title,
        author: movie.author,
        category: movie.category
      })));
    }
  }, [movies, forceUpdate]);
  
  // Helper function to get completion year from a movie
  const getCompletionYear = (movie: any): number | null => {
    if (!movie.completedDate) return null;
    const date = new Date(movie.completedDate);
    return date.getFullYear();
  };

  // Count completed movies by completion year (not release year)
  const completedThisYear = movies.completed.filter(movie => {
    const completionYear = getCompletionYear(movie);
    return completionYear === currentYear;
  }).length;

  const getMovieRecencyTimestamp = (movie: any, category: string): number => {
    const pick = () => {
      if (category === 'completed') return movie.completedDate;
      if (category === 'inProgress') return movie.dateStarted;
      if (category === 'planned') return movie.dateAdded;
      if (category === 'fails') return movie.dateAbandoned;
      return movie.completedDate || movie.dateAdded || movie.dateStarted || movie.dateAbandoned;
    };
    const value = pick();
    if (value) {
      const ts = new Date(value).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
    return typeof movie.id === 'number' ? movie.id : 0;
  };

  const listSearchIntent = useMemo(() => parseQuickListIntent(searchQuery), [searchQuery]);

  useEffect(() => {
    const category = listSearchIntent?.category;
    if (!category) return;
    if (activeTab !== category) {
      setActiveTab(category);
    }
  }, [listSearchIntent?.category, activeTab]);

  // Dynamic tabs that respect the year filter
  const tabs = useMemo(() => {
    // Calculate completed count based on year filter
    let completedCount = movies.completed.length;
    if (selectedYear !== 'all') {
      completedCount = movies.completed.filter(movie => {
        const completionYear = getCompletionYear(movie);
        return completionYear === selectedYear;
      }).length;
    }

    return [
      { key: 'completed', label: 'Done', icon: Film, count: completedCount },
      { key: 'inProgress', label: 'Watching', icon: Clock, count: movies.inProgress.length },
      { key: 'planned', label: 'Planned', icon: Target, count: movies.planned.length },
      { key: 'fails', label: 'Stopped', icon: X, count: movies.fails.length },
      { key: 'allTime', label: 'All Time', icon: Star, count: movies.allTime.length },
    ];
  }, [movies, selectedYear]);

  // Get available years from completed movies based on completion date
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    movies.completed.forEach(movie => {
      const completionYear = getCompletionYear(movie);
      if (completionYear) {
        years.add(completionYear);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [movies.completed]);

  // Filter movies based on search query and selected year (using completion date)
  const filteredMovies = useMemo(() => {
    let currentMovies = movies[activeTab as keyof typeof movies] || [];
    
    console.log(`🎬 Filtering movies for tab "${activeTab}":`, {
      totalInCategory: currentMovies.length,
      searchQuery: searchQuery.trim(),
      selectedYear: selectedYear,
    });
    
    // Filter by completion year for completed movies
    if (activeTab === 'completed' && selectedYear !== 'all') {
      currentMovies = currentMovies.filter(movie => {
        const completionYear = getCompletionYear(movie);
        return completionYear === selectedYear;
      });
    }
    
    if (listSearchIntent) {
      const includes = (field: unknown, target?: string) =>
        !target || fieldMatchesQuery(typeof field === 'string' ? field : '', target.toLowerCase());
      currentMovies = currentMovies.filter((movie: any) => {
        const yearOk = !listSearchIntent.year || movie.publicationYear === listSearchIntent.year;
        return (
          yearOk &&
          includes(movie.title, listSearchIntent.titleIncludes?.toLowerCase()) &&
          includes(movie.author, listSearchIntent.authorIncludes?.toLowerCase()) &&
          (includes(movie.notes, listSearchIntent.notesIncludes?.toLowerCase()) ||
            includes(movie.description, listSearchIntent.notesIncludes?.toLowerCase())) &&
          includes(movie.source, listSearchIntent.sourceIncludes?.toLowerCase())
        );
      });
    }

    if (!searchQuery.trim()) {
      console.log(`🎬 No search query, returning ${currentMovies.length} movies for "${activeTab}"`);
      return currentMovies;
    }

    const queryToUse = (listSearchIntent?.textQuery || (!listSearchIntent ? searchQuery : '')).toLowerCase().trim();
    const filtered = !queryToUse
      ? currentMovies
      : currentMovies.filter(movie =>
          fieldMatchesQuery(movie.title, queryToUse) ||
          fieldMatchesQuery(movie.author, queryToUse) ||
          fieldMatchesQuery(movie.description, queryToUse) ||
          fieldMatchesQuery(movie.notes, queryToUse) ||
          fieldMatchesQuery(movie.source, queryToUse) ||
          (movie.publicationYear != null && String(movie.publicationYear).includes(queryToUse))
        );
    
    console.log(`🎬 Search filtered ${currentMovies.length} -> ${filtered.length} movies`);
    return filtered;
  }, [movies, activeTab, searchQuery, selectedYear, forceUpdate, listSearchIntent]);

  // Lists are now deterministic by recency (newest first), so manual reorder is disabled.
  const canReorder = false;

  const sortedMovies = useMemo(() => {
    const sortBy: ListSortBy = listSearchIntent?.sortBy || settings.defaultListSortOrder;
    return [...filteredMovies].sort((a: any, b: any) => {
      if (sortBy === 'oldest') {
        const diff = getMovieRecencyTimestamp(a, activeTab) - getMovieRecencyTimestamp(b, activeTab);
        if (diff !== 0) return diff;
      } else if (sortBy === 'rating_desc') {
        const diff = (b.rating || 0) - (a.rating || 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'rating_asc') {
        const diff = (a.rating || 0) - (b.rating || 0);
        if (diff !== 0) return diff;
      } else if (sortBy === 'title_asc') {
        const diff = String(a.title || '').localeCompare(String(b.title || ''));
        if (diff !== 0) return diff;
      } else if (sortBy === 'title_desc') {
        const diff = String(b.title || '').localeCompare(String(a.title || ''));
        if (diff !== 0) return diff;
      } else {
        const diff = getMovieRecencyTimestamp(b, activeTab) - getMovieRecencyTimestamp(a, activeTab);
        if (diff !== 0) return diff;
      }
      return (typeof b.id === 'number' ? b.id : 0) - (typeof a.id === 'number' ? a.id : 0);
    });
  }, [filteredMovies, activeTab, listSearchIntent?.sortBy, settings.defaultListSortOrder]);

  const handleAddMovie = () => {
    setEditingMovie(undefined);
    setShowAddModal(true);
  };

  const handleEditMovie = (movie: any) => {
    setEditingMovie(movie);
    setShowAddModal(true);
  };

  const handleDeleteMovie = (movieId: number) => {
    deleteMovie(movieId, activeTab as any);
  };

  const handleReorderMovie = (fromIndex: number, toIndex: number) => {
    if (canReorder && fromIndex !== toIndex) {
      reorderMovies(activeTab as any, fromIndex, toIndex);
    }
  };

  const handleEditGoal = () => {
    setTempGoal(movieGoal.toString());
    setShowGoalModal(true);
  };

  const handleSaveGoal = () => {
    const newGoal = parseInt(tempGoal) || 1;
    setMovieGoal(newGoal);
    setShowGoalModal(false);
  };

  const handleSaveMovie = (formData: any) => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    if (editingMovie) {
      const updatedMovie: any = {
        ...editingMovie,
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && !editingMovie.dateStarted && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && !editingMovie.dateAdded && { dateAdded: currentDate }),
        ...(formData.category === 'fails' && !editingMovie.dateAbandoned && { dateAbandoned: currentDate }),
      };
      updateMovie(editingMovie.id, updatedMovie);
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

  const handleExport = async () => {
    setShowExportOptionsModal(true);
  };

  const runExportWithOptions = async (exportOptions: ExportOptions) => {
    console.log('📤 Export button pressed');
    console.log('📤 Platform:', Platform.OS);
    console.log('📤 Share API available:', !!Share.share);
    
    setIsExporting(true);
    
    try {
      console.log('📤 Generating export text...');
      const exportText = generateComprehensiveExport(exportOptions);
      console.log('📤 Export text generated, length:', exportText.length);
      
      if (exportText.length === 0) {
        Alert.alert(
          'No Data to Export',
          'You don\'t have any books or movies in your lists yet. Add some items first, then try exporting again.',
          [{ text: 'OK' }]
        );
        setIsExporting(false);
        return;
      }
      
      // Platform-aware export handling
      if (Platform.OS === 'web') {
        console.log('📤 Using web export method');
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
        console.log('📤 Web export completed');
        
        Alert.alert(
          'Export Successful!',
          'Your reading list has been downloaded as a text file.',
          [{ text: 'OK' }]
        );
      } else {
        console.log('📤 Using mobile export method');
        // For mobile, show export data in alert first, then try to share
        Alert.alert(
          'Export Ready',
          'Your data has been prepared for export. Would you like to share it now?',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                console.log('📤 Export cancelled by user');
              }
            },
            {
              text: 'Messages',
              onPress: async () => {
                try {
                  const opened = await shareExportViaMessages(exportText);
                  if (!opened) {
                    Alert.alert(
                      'Messages Not Available',
                      'SMS/iMessage is not available on this device. Try Share instead.',
                      [{ text: 'OK' }]
                    );
                  }
                } catch (smsError) {
                  console.error('❌ Messages share error:', smsError);
                  alertAfterShareError(
                    'Messages Error',
                    'Could not open Messages. Please try Share instead.'
                  );
                }
              }
            },
            {
              text: 'Share',
              onPress: async () => {
                try {
                  console.log('📤 Attempting to share export data...');
                  if (Share.share) {
                    const result = await Share.share({
                      message: exportText,
                      title: 'FiftyList — My Complete Reading & Watching List',
                    });
                    
                    console.log('📤 Share result:', result);
                    
                    if (Platform.OS !== 'ios') {
                      if (result.action === Share.sharedAction) {
                        console.log('📤 Mobile share completed successfully');
                        Alert.alert(
                          'Export Successful!', 
                          'Your reading list has been shared successfully.',
                          [{ text: 'OK' }]
                        );
                      } else if (result.action === Share.dismissedAction) {
                        console.log('📤 Share was dismissed by user');
                        Alert.alert(
                          'Export Cancelled', 
                          'The share was cancelled. You can try again anytime.',
                          [{ text: 'OK' }]
                        );
                      } else {
                        console.log('📤 Share action unknown:', result.action);
                        Alert.alert(
                          'Export Status Unknown', 
                          'The export may have been completed. Check your share options.',
                          [{ text: 'OK' }]
                        );
                      }
                    }
                  } else {
                    console.log('📤 Share API not available');
                    Alert.alert(
                      'Share Not Available',
                      'Sharing is not available on this device. Your export data has been prepared.',
                      [{ text: 'OK' }]
                    );
                  }
                } catch (shareError) {
                  console.error('❌ Share error:', shareError);
                  alertAfterShareError(
                    'Share Error',
                    'Failed to share export data. Your data has been prepared.'
                  );
                }
              }
            }
          ]
        );
      }
    } catch (error) {
      console.error('❌ Error in handleExport:', error);
      
      // Enhanced error handling with platform-specific messages
      const errorMessage = Platform.OS === 'web' 
        ? 'Failed to download export file. Please try again.'
        : 'Failed to export data. Please try again.';
        
      Alert.alert('Export Error', errorMessage);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = (importedBooks: any[], importedMovies: any[]) => {
    importItems(importedBooks, importedMovies);
    setShowImportModal(false);
  };

  const handleTabChange = (tab: string) => {
    console.log(`🎬 Switching to tab: ${tab}`);
    setActiveTab(tab);
    setSearchQuery(''); // Clear search when switching tabs
    // Reset year filter when switching away from completed
    if (tab !== 'completed') {
      setSelectedYear('all');
    } else {
      setSelectedYear(currentYear);
    }
  };

  useEffect(() => {
    if (activeTab !== 'completed' && panelView === 'goal') {
      setPanelView('categories');
    }
  }, [activeTab, panelView]);

  const getSearchPlaceholder = () => {
    const tabLabels: { [key: string]: string } = {
      completed: 'Search completed movies...',
      inProgress: 'Search watching list...',
      planned: 'Search planned movies...',
      fails: 'Search stopped movies...',
      allTime: 'Search favorites...',
    };
    return tabLabels[activeTab] || 'Search movies...';
  };

  const renderEmptyState = () => {
    const isSearching = searchQuery.trim().length > 0;
    const isYearFiltered = activeTab === 'completed' && selectedYear !== 'all';
    
    return (
      <View style={styles.emptyState}>
        <Film size={48} color="#6B7280" />
        <Text style={styles.emptyText}>
          {isSearching ? 'No movies found' : isYearFiltered ? 'No movies completed' : 'No movies in this category'}
        </Text>
        <Text style={styles.emptySubtext}>
          {isSearching 
            ? `Try adjusting your search for "${searchQuery}"` 
            : isYearFiltered
            ? `Try selecting a different year or "All Years"`
            : canReorder 
            ? 'Add your first movie to get started. You can drag to reorder items in this list.'
            : 'Add your first movie to get started'
          }
        </Text>
      </View>
    );
  };

  const renderListHeader = () => (
    <View>
      {canReorder && filteredMovies.length > 0 && (
        <View style={styles.reorderHint}>
          <Text style={styles.reorderHintText}>
            💡 Drag items to reorder your list
          </Text>
        </View>
      )}
    </View>
  );

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    // Add safety checks to prevent crashes
    if (!item || !item.id || !item.title || !item.author) {
      console.warn('⚠️ Invalid item in renderItem:', item);
      return null;
    }

    const displayIndex =
      settings.defaultListNumbering === 'highestTop'
        ? sortedMovies.length - index - 1
        : index;

    try {
      if (canReorder) {
        return (
          <DraggableItemCard
            item={item}
            index={displayIndex}
            onEdit={() => handleEditMovie(item)}
            onDelete={() => handleDeleteMovie(item.id)}
            onDragEnd={handleReorderMovie}
            isBook={false}
            primaryColor="#3B82F6"
            isDark={true}
            canReorder={true}
          />
        );
      } else {
        return (
          <ItemCard
            item={item}
            index={displayIndex}
            onEdit={() => handleEditMovie(item)}
            onDelete={() => handleDeleteMovie(item.id)}
            isBook={false}
            primaryColor="#3B82F6"
            isDark={true}
          />
        );
      }
    } catch (error) {
      console.error('❌ Error rendering item:', error, item);
      return null;
    }
  };

  return (
    <SafeAreaView
      style={[styles.container, Platform.OS === 'web' && styles.webContainer]}
      edges={['top']}
    >
      <Header
        title="Movies"
        onAddPress={handleAddMovie}
        onExportPress={handleExport}
        onImportPress={() => setShowImportModal(true)}
        onSearchPress={() => setShowSearch(!showSearch)}
        onSharePress={() => setShowSharingModal(true)}
        primaryColor="#3B82F6"
        secondaryColor="#2563EB"
        isDark={true}
        backgroundColor="#111827"
        isExporting={isExporting}
      />
      
      {/* Year Folder Selector - only show for completed movies */}
      {activeTab === 'completed' && availableYears.length > 0 && (
        <YearFolderSelector
          availableYears={availableYears}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          primaryColor="#3B82F6"
          isDark={true}
          backgroundColor="#111827"
        />
      )}
      
      <View style={styles.panelToggleWrap}>
        <TouchableOpacity
          style={[
            styles.panelToggleButton,
            panelView === 'categories' && styles.panelToggleButtonActive,
          ]}
          onPress={() => setPanelView('categories')}
          accessibilityRole="button"
          accessibilityLabel="Show list categories"
        >
          <Text
            style={[
              styles.panelToggleText,
              panelView === 'categories' && styles.panelToggleTextActive,
            ]}
          >
            Categories
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.panelToggleButton,
            panelView === 'goal' && styles.panelToggleButtonActive,
            activeTab !== 'completed' && styles.panelToggleButtonDisabled,
          ]}
          onPress={() => {
            if (activeTab === 'completed') setPanelView('goal');
          }}
          accessibilityRole="button"
          accessibilityLabel="Show goal progress"
        >
          <Text
            style={[
              styles.panelToggleText,
              panelView === 'goal' && styles.panelToggleTextActive,
              activeTab !== 'completed' && styles.panelToggleTextDisabled,
            ]}
          >
            Goal
          </Text>
        </TouchableOpacity>
      </View>

      {panelView === 'goal' && activeTab === 'completed' ? (
        <GoalProgress
          completed={completedThisYear}
          goal={movieGoal}
          year={currentYear}
          onEditGoal={handleEditGoal}
          primaryColor="#3B82F6"
          secondaryColor="#2563EB"
          isDark={true}
          backgroundColor="#111827"
          completedItems={movies.completed}
          selectedYear={selectedYear}
          showGoalTable={true}
        />
      ) : (
        <TabNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabs={tabs}
          primaryColor="#3B82F6"
          isDark={true}
          backgroundColor="#111827"
        />
      )}

      {/* Search Bar - Show only when search is activated */}
      {showSearch && (
        <>
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={(q) => setSearchQuery(q.slice(0, PREMIUM_LIST_SEARCH_MAX_CHARS))}
            placeholder={getSearchPlaceholder()}
            isDark={true}
            backgroundColor="#111827"
            maxLength={PREMIUM_LIST_SEARCH_MAX_CHARS}
          />
          {listSearchIntent?.explanationShort ? (
            <View style={styles.llmSearchStatusRow}>
              <Text style={styles.llmSearchStatusText}>{listSearchIntent.explanationShort}</Text>
            </View>
          ) : null}
        </>
      )}

      <FlatList
        data={sortedMovies}
        keyExtractor={(item, index) =>
          item != null && item.id != null && !Number.isNaN(item.id)
            ? `movie-${item.id}`
            : `movie-missing-id-${index}`
        }
        renderItem={renderItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === 'web' && styles.webListContent
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        extraData={forceUpdate} // Force re-render when this changes
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
      />

      <AddEditModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveMovie}
        editingItem={editingMovie}
        isBook={false}
        primaryColor="#3B82F6"
        isDark={true}
      />

      <ImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        isDark={true}
      />

      {/* Activity Sharing Modal */}
      <ActivitySharingModal
        visible={showSharingModal}
        onClose={() => setShowSharingModal(false)}
        primaryColor="#3B82F6"
        isDark={true}
      />

      <ExportOptionsModal
        visible={showExportOptionsModal}
        onClose={() => setShowExportOptionsModal(false)}
        onConfirm={(opts) => {
          setShowExportOptionsModal(false);
          runExportWithOptions(opts);
        }}
        primaryColor="#3B82F6"
        isDark={true}
      />

      {/* Goal Edit Modal */}
      <Modal
        visible={showGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGoalModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Movies Goal</Text>
            <Text style={styles.modalSubtitle}>
              How many movies do you want to watch in {currentYear}?
            </Text>
            
            <TextInput
              style={styles.modalInput}
              value={tempGoal}
              onChangeText={setTempGoal}
              keyboardType="numeric"
              placeholder="Enter goal"
              placeholderTextColor="#6B7280"
              autoFocus
              selectTextOnFocus
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.modalCancelButton} 
                onPress={() => setShowGoalModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.modalSaveButton} 
                onPress={handleSaveGoal}
              >
                <Text style={styles.modalSaveText}>Save Goal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  webContainer: {
    minHeight: '100vh',
    height: '100vh',
    maxHeight: '100vh',
  },
  listContent: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  webListContent: {
    paddingBottom: 0,
    minHeight: '100%',
  },
  panelToggleWrap: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 0,
    marginBottom: 8,
    backgroundColor: 'rgba(17,24,39,0.6)',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#1F2937',
  },
  panelToggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  panelToggleButtonActive: {
    backgroundColor: '#1F2937',
  },
  panelToggleButtonDisabled: {
    opacity: 0.55,
  },
  panelToggleText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#9CA3AF',
  },
  panelToggleTextActive: {
    color: '#60A5FA',
  },
  panelToggleTextDisabled: {
    color: '#6B7280',
  },
  llmSearchStatusRow: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  llmSearchStatusText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#DBEAFE',
  },
  reorderHint: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    alignItems: 'center',
  },
  reorderHintText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#D1D5DB',
    opacity: 0.8,
    textAlign: 'center',
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
    color: '#D1D5DB',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#374151',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#4B5563',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: '#374151',
    color: '#FFFFFF',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#D1D5DB',
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});