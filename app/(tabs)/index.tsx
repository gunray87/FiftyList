import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, FlatList, Text, Alert, Share, Modal, TextInput, TouchableOpacity, Platform, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BookOpen, Clock, Target, X, Star } from 'lucide-react-native';
import { useDataStore } from '@/hooks/useDataStore';
import { useFirstLaunch } from '@/hooks/useFirstLaunch';
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
import WelcomeTour from '@/components/WelcomeTour';
import ExportOptionsModal from '@/components/ExportOptionsModal';
import { fieldMatchesQuery } from '@/utils/searchMatch';
import { alertAfterShareError, shareExportViaMessages } from '@/utils/postShareFlow';
import { ExportOptions } from '@/types';
import { ListSortBy, parseQuickListIntent } from '@/utils/llmListSearch';

const PREMIUM_LIST_SEARCH_MAX_CHARS = 120;

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
  const { settings, isLoading: isSettingsLoading } = useAppSettings();
  const [activeTab, setActiveTab] = useState('completed');
  const [selectedYear, setSelectedYear] = useState<number | 'all'>(new Date().getFullYear());
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingBook, setEditingBook] = useState<any | undefined>();
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [tempGoal, setTempGoal] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showExportOptionsModal, setShowExportOptionsModal] = useState(false);
  const [panelView, setPanelView] = useState<'goal' | 'categories'>('categories');
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (isSettingsLoading) return;
    setActiveTab(settings.defaultBookListTab);
    if (settings.defaultBookListTab === 'completed') {
      setSelectedYear(currentYear);
    } else {
      setSelectedYear('all');
    }
  }, [isSettingsLoading, settings.defaultBookListTab, currentYear]);

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

  const getBookRecencyTimestamp = (book: any, category: string): number => {
    const pick = () => {
      if (category === 'completed') return book.completedDate;
      if (category === 'inProgress') return book.dateStarted;
      if (category === 'planned') return book.dateAdded;
      if (category === 'fails') return book.dateAbandoned;
      return book.completedDate || book.dateAdded || book.dateStarted || book.dateAbandoned;
    };
    const value = pick();
    if (value) {
      const ts = new Date(value).getTime();
      if (!Number.isNaN(ts)) return ts;
    }
    return typeof book.id === 'number' ? book.id : 0;
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
    let completedCount = books.completed.length;
    if (selectedYear !== 'all') {
      completedCount = books.completed.filter(book => {
        const completionYear = getCompletionYear(book);
        return completionYear === selectedYear;
      }).length;
    }

    return [
      { key: 'completed', label: 'Done', icon: BookOpen, count: completedCount },
      { key: 'inProgress', label: 'Reading', icon: Clock, count: books.inProgress.length },
      { key: 'planned', label: 'Planned', icon: Target, count: books.planned.length },
      { key: 'fails', label: 'Stopped', icon: X, count: books.fails.length },
      { key: 'allTime', label: 'All Time', icon: Star, count: books.allTime.length },
    ];
  }, [books, selectedYear]);

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
    
    let workingSet = rawBooks;
    
    // Apply year filter only for completed books
    if (activeTab === 'completed' && selectedYear !== 'all') {
      workingSet = rawBooks.filter(book => {
        const completionYear = getCompletionYear(book);
        return completionYear === selectedYear;
      });
      console.log(`📚 Year filtered (${selectedYear}): ${rawBooks.length} -> ${workingSet.length}`);
    }
    
    // Apply parsed natural-language hints (local only, no network).
    if (listSearchIntent) {
      const includes = (field: unknown, target?: string) =>
        !target || fieldMatchesQuery(typeof field === 'string' ? field : '', target.toLowerCase());

      workingSet = workingSet.filter((book: any) => {
        const yearOk = !listSearchIntent.year || book.publicationYear === listSearchIntent.year;
        return (
          yearOk &&
          includes(book.title, listSearchIntent.titleIncludes?.toLowerCase()) &&
          includes(book.author, listSearchIntent.authorIncludes?.toLowerCase()) &&
          (includes(book.notes, listSearchIntent.notesIncludes?.toLowerCase()) ||
            includes(book.description, listSearchIntent.notesIncludes?.toLowerCase())) &&
          includes(book.source, listSearchIntent.sourceIncludes?.toLowerCase())
        );
      });
    }

    // Apply text search filter as final pass.
    const queryToUse = (listSearchIntent?.textQuery || (!listSearchIntent ? searchQuery : '')).toLowerCase().trim();
    if (queryToUse) {
      const query = queryToUse;
      workingSet = workingSet.filter(book => 
        fieldMatchesQuery(book.title, query) ||
        fieldMatchesQuery(book.author, query) ||
        fieldMatchesQuery(book.description, query) ||
        fieldMatchesQuery(book.notes, query) ||
        fieldMatchesQuery(book.source, query) ||
        (book.publicationYear != null && String(book.publicationYear).includes(query))
      );
      console.log(`📚 Search filtered "${query}": ${workingSet.length} books`);
    }
    
    console.log(`📚 Final filtered result for "${activeTab}": ${workingSet.length} books`);
    return workingSet;
  }, [books, activeTab, searchQuery, selectedYear, forceUpdate, listSearchIntent]);

  // Lists are now deterministic by recency (newest first), so manual reorder is disabled.
  const canReorder = false;

  const sortedBooks = useMemo(() => {
    const sortBy: ListSortBy = listSearchIntent?.sortBy || settings.defaultListSortOrder;
    return [...filteredBooks].sort((a: any, b: any) => {
      if (sortBy === 'oldest') {
        const diff = getBookRecencyTimestamp(a, activeTab) - getBookRecencyTimestamp(b, activeTab);
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
        const diff = getBookRecencyTimestamp(b, activeTab) - getBookRecencyTimestamp(a, activeTab);
        if (diff !== 0) return diff;
      }
      return (typeof b.id === 'number' ? b.id : 0) - (typeof a.id === 'number' ? a.id : 0);
    });
  }, [filteredBooks, activeTab, listSearchIntent?.sortBy, settings.defaultListSortOrder]);

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
                    
                    // iOS: follow-up alerts right after the share sheet dismiss can produce a white screen
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

  useEffect(() => {
    if (activeTab !== 'completed' && panelView === 'goal') {
      setPanelView('categories');
    }
  }, [activeTab, panelView]);

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
          {isSearching ? 'No books found' : isYearFiltered ? 'No books completed' : 'No books in this category'}
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
    // Add safety checks to prevent crashes
    if (!item || !item.id || !item.title || !item.author) {
      console.warn('⚠️ Invalid item in renderItem:', item);
      return null;
    }

    const displayIndex =
      settings.defaultListNumbering === 'highestTop'
        ? sortedBooks.length - index - 1
        : index;

    try {
      if (canReorder) {
        return (
          <DraggableItemCard
            item={item}
            index={displayIndex}
            onEdit={() => handleEditBook(item)}
            onDelete={() => handleDeleteBook(item.id)}
            onDragEnd={handleReorderBook}
            isBook={true}
            primaryColor="#D97706"
            isDark={false}
            canReorder={true}
          />
        );
      } else {
        return (
          <ItemCard
            item={item}
            index={displayIndex}
            onEdit={() => handleEditBook(item)}
            onDelete={() => handleDeleteBook(item.id)}
            isBook={true}
            primaryColor="#D97706"
            isDark={false}
          />
        );
      }
    } catch (error) {
      console.error('❌ Error rendering item:', error, item);
      return null;
    }
  };

  // Don't render anything while checking first launch
  if (isLoading) {
    return null;
  }

  return (
    <SafeAreaView
      style={[styles.container, Platform.OS === 'web' && styles.webContainer]}
      edges={['top']}
    >
      <Header
        title="Books"
        onAddPress={handleAddBook}
        onExportPress={handleExport}
        onImportPress={() => setShowImportModal(true)}
        onSearchPress={() => setShowSearch(!showSearch)}
        primaryColor="#D97706"
        secondaryColor="#B45309"
        isDark={false}
        backgroundColor="#F0E8D8"
        isExporting={isExporting}
      />
      
      {/* Year Folder Selector - only show for completed books */}
      {activeTab === 'completed' && availableYears.length > 0 && (
        <YearFolderSelector
          availableYears={availableYears}
          selectedYear={selectedYear}
          onYearChange={setSelectedYear}
          primaryColor="#D97706"
          isDark={false}
          backgroundColor="#F0E8D8"
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
          goal={bookGoal}
          year={currentYear}
          onEditGoal={handleEditGoal}
          primaryColor="#D97706"
          secondaryColor="#B45309"
          isDark={false}
          backgroundColor="#FFFFFF"
          completedItems={books.completed}
          selectedYear={selectedYear}
          showGoalTable={true}
        />
      ) : (
        <TabNavigation
          activeTab={activeTab}
          onTabChange={handleTabChange}
          tabs={tabs}
          primaryColor="#D97706"
          isDark={false}
          backgroundColor="#EDE8D0"
        />
      )}

      {/* Search Bar - Show only when search is activated */}
      {showSearch && (
        <>
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={(q) => setSearchQuery(q.slice(0, PREMIUM_LIST_SEARCH_MAX_CHARS))}
            placeholder={getSearchPlaceholder()}
            isDark={false}
            backgroundColor="#F0E8D8"
            maxLength={PREMIUM_LIST_SEARCH_MAX_CHARS}
            onSubmitSearch={() => Keyboard.dismiss()}
          />
          {showSearch && listSearchIntent?.explanationShort ? (
            <View style={styles.llmSearchStatusRow}>
              <Text style={styles.llmSearchStatusText}>{listSearchIntent.explanationShort}</Text>
            </View>
          ) : null}
        </>
      )}

      <FlatList
        data={sortedBooks}
        keyExtractor={(item, index) =>
          item != null && item.id != null && !Number.isNaN(item.id)
            ? `book-${item.id}`
            : `book-missing-id-${index}`
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
        keyboardDismissMode="on-drag"
        extraData={`${forceUpdate}-${activeTab}-${sortedBooks.length}-${books.planned.length}`}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={10}
        initialNumToRender={10}
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

      <ExportOptionsModal
        visible={showExportOptionsModal}
        onClose={() => setShowExportOptionsModal(false)}
        onConfirm={(opts) => {
          setShowExportOptionsModal(false);
          runExportWithOptions(opts);
        }}
        primaryColor="#D97706"
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
    backgroundColor: '#F0E8D8',
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
    backgroundColor: '#DDD0BA',
    borderRadius: 12,
    padding: 4,
  },
  panelToggleButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  panelToggleButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  panelToggleButtonDisabled: {
    opacity: 0.55,
  },
  panelToggleText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#6B5B45',
  },
  panelToggleTextActive: {
    color: '#D97706',
  },
  panelToggleTextDisabled: {
    color: '#A8A29E',
  },
  llmSearchStatusRow: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.12)',
  },
  llmSearchStatusText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#92400E',
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