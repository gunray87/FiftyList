import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text, Alert, Share, Modal, TextInput, TouchableOpacity, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Clock, Target, X, Star } from 'lucide-react-native';
import { useDataStore } from '@/hooks/useDataStore';
import { useFirstLaunch } from '@/hooks/useFirstLaunch';
import Header from '@/components/Header';
import GoalProgress from '@/components/GoalProgress';
import TabNavigation from '@/components/TabNavigation';
import ItemCard from '@/components/ItemCard';
import DraggableItemCard from '@/components/DraggableItemCard';
import AddEditModal from '@/components/AddEditModal';
import ImportModal from '@/components/ImportModal';
import SearchBar from '@/components/SearchBar';
import YearFolderSelector from '../../components/YearFolderSelector';
import WelcomeTour from '@/components/WelcomeTour';

export default function BooksScreen() {
  const { 
    books, 
    bookGoal, 
    addBook, 
    updateBook, 
    deleteBook, 
    reorderBooks, 
    setBookGoal, 
    generateComprehensiveExport, 
    importItems,
    forceUpdate 
  } = useDataStore();
  
  const { isFirstLaunch, isLoading, markAsLaunched } = useFirstLaunch();
  const [activeTab, setActiveTab] = useState('completed');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBook, setEditingBook] = useState<any | undefined>();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempGoal, setTempGoal] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const currentYear = new Date().getFullYear();
  
  // Enhanced state monitoring for books screen
  useEffect(() => {
    console.log('📚 Books screen - Books state updated:', {
      completed: books.completed.length,
      inProgress: books.inProgress.length,
      planned: books.planned.length,
      fails: books.fails.length,
      allTime: books.allTime.length,
      forceUpdate: forceUpdate,
    });
    
    if (books.planned.length > 0) {
      console.log('📚 Books screen - Current planned books:', books.planned.map(book => ({
        id: book.id,
        title: book.title,
        author: book.author,
        category: book.category
      })));
    }
  }, [books, forceUpdate]);
  
  // Helper function to get completion year from a book
  const getCompletionYear = (book: any): number | null => {
    if (!book.completedDate) return null;
    const date = new Date(book.completedDate);
    return date.getFullYear();
  };

  // Count completed books by completion year (not publication year)
  const completedThisYear = books.completed.filter(book => {
    const completionYear = getCompletionYear(book);
    return completionYear === currentYear;
  }).length;

  const tabs = [
    { key: 'completed', label: 'Done', icon: BookOpen, count: books.completed.length },
    { key: 'inProgress', label: 'Reading', icon: Clock, count: books.inProgress.length },
    { key: 'planned', label: 'Planned', icon: Target, count: books.planned.length },
    { key: 'fails', label: 'Stopped', icon: X, count: books.fails.length },
    { key: 'allTime', label: 'All Time', icon: Star, count: books.allTime.length },
  ];

  // Get available years from completed books based on completion date
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    books.completed.forEach(book => {
      const completionYear = getCompletionYear(book);
      if (completionYear) {
        years.add(completionYear);
      }
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [books.completed]);

  // Simplified filtering logic that ensures all planned books are shown
  const filteredBooks = useMemo(() => {
    console.log(`📚 Starting filter for tab "${activeTab}"`);
    
    // Get the raw data for the current tab - this is the source of truth
    const rawBooks = books[activeTab as keyof typeof books] || [];
    
    console.log(`📚 Raw books for "${activeTab}":`, {
      count: rawBooks.length,
      books: rawBooks.map(book => ({ id: book.id, title: book.title, category: book.category }))
    });
    
    // For planned tab, return ALL books without any filtering
    if (activeTab === 'planned') {
      console.log(`📚 PLANNED TAB - Returning ALL ${rawBooks.length} books without any filtering`);
      return rawBooks;
    }
    
    // For other tabs, apply normal filtering logic
    let workingSet = rawBooks;
    
    // Apply year filter only for completed books
    if (activeTab === 'completed' && selectedYear !== 'all') {
      workingSet = rawBooks.filter(book => {
        const completionYear = getCompletionYear(book);
        return completionYear === selectedYear;
      });
      console.log(`📚 Year filtered (${selectedYear}): ${rawBooks.length} -> ${workingSet.length}`);
    }
    
    // Apply search filter only if there's a search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      workingSet = workingSet.filter(book => 
        book.title.toLowerCase().includes(query) ||
        book.author.toLowerCase().includes(query) ||
        (book.notes && book.notes.toLowerCase().includes(query)) ||
        (book.source && book.source.toLowerCase().includes(query)) ||
        book.year.toString().includes(query)
      );
      console.log(`📚 Search filtered "${query}": ${workingSet.length} books`);
    }
    
    console.log(`📚 Final filtered result for "${activeTab}": ${workingSet.length} books`);
    return workingSet;
  }, [books, activeTab, searchQuery, selectedYear, forceUpdate]);

  // Determine if current tab can be reordered (all except completed)
  const canReorder = activeTab !== 'completed';

  const handleAddBook = () => {
    setEditingBook(undefined);
    setShowAddModal(true);
  };

  const handleEditBook = (book: any) => {
    setEditingBook(book);
    setShowAddModal(true);
  };

  const handleDeleteBook = (bookId: number) => {
    deleteBook(bookId, activeTab as any);
  };

  const handleReorderBook = (fromIndex: number, toIndex: number) => {
    if (canReorder && fromIndex !== toIndex) {
      reorderBooks(activeTab as any, fromIndex, toIndex);
    }
  };

  const handleEditGoal = () => {
    setTempGoal(bookGoal.toString());
    setShowGoalModal(true);
  };

  const handleSaveGoal = () => {
    const newGoal = parseInt(tempGoal) || 1;
    setBookGoal(newGoal);
    setShowGoalModal(false);
  };

  const handleSaveBook = (formData: any) => {
    const currentDate = new Date().toISOString().split('T')[0];
    
    if (editingBook) {
      const updatedBook: any = {
        ...editingBook,
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && !editingBook.dateStarted && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && !editingBook.dateAdded && { dateAdded: currentDate }),
        ...(formData.category === 'fails' && !editingBook.dateAbandoned && { dateAbandoned: currentDate }),
      };
      updateBook(editingBook.id, updatedBook);
    } else {
      const newBook: any = {
        ...formData,
        ...(formData.category === 'completed' && !formData.completedDate && { completedDate: currentDate }),
        ...(formData.category === 'inProgress' && { dateStarted: currentDate }),
        ...(formData.category === 'planned' && { dateAdded: currentDate, percentage: 0 }),
        ...(formData.category === 'fails' && { dateAbandoned: currentDate }),
      };
      addBook(newBook);
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
    console.log(`📚 Switching to tab: ${tab}`);
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
      completed: 'Search completed books...',
      inProgress: 'Search reading list...',
      planned: 'Search planned books...',
      fails: 'Search stopped books...',
      allTime: 'Search favorites...',
    };
    return tabLabels[activeTab] || 'Search books...';
  };

  const renderEmptyState = () => {
    const isSearching = searchQuery.trim().length > 0;
    const isYearFiltered = activeTab === 'completed' && selectedYear !== 'all';
    
    return (
      <View style={styles.emptyState}>
        <BookOpen size={48} color="#A8A29E" />
        <Text style={styles.emptyText}>
          {isSearching ? 'No books found' : isYearFiltered ? `No books completed in ${selectedYear}` : 'No books in this category'}
        </Text>
        <Text style={styles.emptySubtext}>
          {isSearching 
            ? `Try adjusting your search for "${searchQuery}"` 
            : isYearFiltered
            ? `Try selecting a different year or "All Years"`
            : canReorder 
            ? 'Add your first book to get started. You can drag to reorder items in this list.'
            : 'Add your first book to get started'
          }
        </Text>
      </View>
    );
  };

  const renderListHeader = () => (
    <View>
      {canReorder && filteredBooks.length > 0 && (
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
          onEdit={() => handleEditBook(item)}
          onDelete={() => handleDeleteBook(item.id)}
          onDragEnd={handleReorderBook}
          isBook={true}
          primaryColor="#D97706"
          isDark={false}
          backgroundColor="#EDE8D0"
          canReorder={true}
        />
      );
    } else {
      return (
        <ItemCard
          item={item}
          index={index}
          onEdit={() => handleEditBook(item)}
          onDelete={() => handleDeleteBook(item.id)}
          isBook={true}
          primaryColor="#D97706"
          isDark={false}
          backgroundColor="#EDE8D0"
        />
      );
    }
  };

  // Don't render anything while checking first launch
  if (isLoading) {
    return null;
  }

  return (
    <SafeAreaView style={[styles.container, Platform.OS === 'web' && styles.webContainer]}>
      <Header
        title="Books"
        onAddPress={handleAddBook}
        onExportPress={handleExport}
        onImportPress={() => setShowImportModal(true)}
        primaryColor="#D97706"
        secondaryColor="#B45309"
        isDark={false}
        backgroundColor="#D6B588"
      />
      
      {/* Year Folder Selector - only show for completed books */}
      {activeTab === 'completed' && availableYears.length > 0 && (
        <YearFolderSelector
          availableYears={availableYears}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          primaryColor="#D97706"
          isDark={false}
          backgroundColor="#D6B588"
        />
      )}
      
      <GoalProgress
        completed={completedThisYear}
        goal={bookGoal}
        year={currentYear}
        onEditGoal={handleEditGoal}
        primaryColor="#D97706"
        secondaryColor="#B45309"
        isDark={false}
        backgroundColor="#EDE8D0"
        completedItems={books.completed}
        selectedYear={selectedYear}
        showGoalTable={activeTab === 'completed'}
      />
      
      <TabNavigation
        activeTab={activeTab}
        onTabChange={handleTabChange}
        tabs={tabs}
        primaryColor="#D97706"
        isDark={false}
        backgroundColor="#EDE8D0"
      />

      {/* Search Bar - Hide for planned tab unless there are multiple items */}
      {(activeTab !== 'planned' || books.planned.length > 1) && (
        <SearchBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          placeholder={getSearchPlaceholder()}
          isDark={false}
          backgroundColor="#D6B588"
        />
      )}

      <FlatList
        data={filteredBooks}
        keyExtractor={(item) => `book-${item.id}`}
        renderItem={renderItem}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={renderEmptyState}
        contentContainerStyle={[
          styles.listContent,
          Platform.OS === 'web' && styles.webListContent
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        extraData={`${forceUpdate}-${activeTab}-${filteredBooks.length}-${books.planned.length}`}
      />

      <AddEditModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleSaveBook}
        editingItem={editingBook}
        isBook={true}
        primaryColor="#D97706"
        isDark={false}
      />

      <ImportModal
        visible={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImport={handleImport}
        isDark={false}
      />

      {/* Welcome Tour */}
      <WelcomeTour
        visible={isFirstLaunch === true}
        onComplete={markAsLaunched}
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
            <Text style={styles.modalTitle}>Edit Books Goal</Text>
            <Text style={styles.modalSubtitle}>
              How many books do you want to read in {currentYear}?
            </Text>
            
            <TextInput
              style={styles.modalInput}
              value={tempGoal}
              onChangeText={setTempGoal}
              keyboardType="numeric"
              placeholder="Enter goal"
              placeholderTextColor="#78716C"
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
    backgroundColor: '#D6B588',
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
    color: '#78716C',
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
    color: '#78716C',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#A8A29E',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#EDE8D0',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: '#D6C7A8',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-SemiBold',
    color: '#44403C',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#78716C',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#D6C7A8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: '#F5F1E8',
    color: '#44403C',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#D6C7A8',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#78716C',
  },
  modalSaveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#D97706',
    alignItems: 'center',
  },
  modalSaveText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});