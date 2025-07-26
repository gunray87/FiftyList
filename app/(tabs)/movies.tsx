import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text, Alert, Share, Modal, TextInput, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Film, Clock, Target, X, Star } from 'lucide-react-native';
import { useDataStore } from '@/hooks/useDataStore';
import Header from '@/components/Header';
import GoalProgress from '@/components/GoalProgress';
import TabNavigation from '@/components/TabNavigation';
import ItemCard from '@/components/ItemCard';
import DraggableItemCard from '@/components/DraggableItemCard';
import AddEditModal from '@/components/AddEditModal';
import ImportModal from '@/components/ImportModal';
import SearchBar from '@/components/SearchBar';
import YearFolderSelector from '../../components/YearFolderSelector';

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
  
  const [activeTab, setActiveTab] = useState('completed');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingMovie, setEditingMovie] = useState<any | undefined>();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempGoal, setTempGoal] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const currentYear = new Date().getFullYear();
  
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

  const tabs = [
    { key: 'completed', label: 'Done', icon: Film, count: movies.completed.length },
    { key: 'inProgress', label: 'Watching', icon: Clock, count: movies.inProgress.length },
    { key: 'planned', label: 'Planned', icon: Target, count: movies.planned.length },
    { key: 'fails', label: 'Stopped', icon: X, count: movies.fails.length },
    { key: 'allTime', label: 'All Time', icon: Star, count: movies.allTime.length },
  ];

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
    
    // Filter by search query
    if (!searchQuery.trim()) {
      console.log(`🎬 No search query, returning ${currentMovies.length} movies for "${activeTab}"`);
      return currentMovies;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = currentMovies.filter(movie => 
      movie.title.toLowerCase().includes(query) ||
      movie.author.toLowerCase().includes(query) ||
      (movie.notes && movie.notes.toLowerCase().includes(query)) ||
      (movie.source && movie.source.toLowerCase().includes(query)) ||
      movie.year.toString().includes(query)
    );
    
    console.log(`🎬 Search filtered ${currentMovies.length} -> ${filtered.length} movies`);
    return filtered;
  }, [movies, activeTab, searchQuery, selectedYear, forceUpdate]);

  // Determine if current tab can be reordered (all except completed)
  const canReorder = activeTab !== 'completed';

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
    try {
      const exportText = generateComprehensiveExport();
      
      await Share.share({
        message: exportText,
        title: 'My Complete Reading & Watching List',
      });
    } catch (error) {
      console.error('Error sharing:', error);
      Alert.alert('Export Error', 'Failed to export data. Please try again.');
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
          {isSearching ? 'No movies found' : isYearFiltered ? `No movies completed in ${selectedYear}` : 'No movies in this category'}
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
    if (canReorder) {
      return (
        <DraggableItemCard
          item={item}
          index={index}
          onEdit={() => handleEditMovie(item)}
          onDelete={() => handleDeleteMovie(item.id)}
          onDragEnd={handleReorderMovie}
          isBook={false}
          primaryColor="#3B82F6"
          isDark={true}
          backgroundColor="#111827"
          canReorder={true}
        />
      );
    } else {
      return (
        <ItemCard
          item={item}
          index={index}
          onEdit={() => handleEditMovie(item)}
          onDelete={() => handleDeleteMovie(item.id)}
          isBook={false}
          primaryColor="#3B82F6"
          isDark={true}
          backgroundColor="#111827"
        />
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <Header
        title="Movies"
        onAddPress={handleAddMovie}
        onExportPress={handleExport}
        onImportPress={() => setShowImportModal(true)}
        primaryColor="#3B82F6"
        secondaryColor="#2563EB"
        isDark={true}
        backgroundColor="#111827"
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
        showGoalTable={activeTab === 'completed'}
      />
      
      <TabNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tabs={tabs}
        primaryColor="#3B82F6"
        isDark={true}
        backgroundColor="#111827"
      />

      {/* Search Bar - Always visible */}
      <SearchBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder={getSearchPlaceholder()}
        isDark={true}
        backgroundColor="#111827"
      />

      <FlatList
        data={filteredMovies}
        keyExtractor={(item) => item.id.toString()}
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
    paddingBottom: 5,
  },
  webListContent: {
    paddingBottom: 20,
    minHeight: '100%',
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