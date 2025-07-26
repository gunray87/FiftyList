import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Upload, FileText, CircleCheck as CheckCircle, CircleAlert as AlertCircle } from 'lucide-react-native';
import { Book, Movie } from '@/types';

interface ImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (books: Omit<Book, 'id'>[], movies: Omit<Movie, 'id'>[]) => void;
  isDark?: boolean;
}

interface ParsedItem {
  title: string;
  author: string;
  year?: number;
  rating?: number;
  notes?: string;
  format?: string;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
  isBook: boolean;
  confidence: number;
}

export default function ImportModal({ visible, onClose, onImport, isDark = false }: ImportModalProps) {
  const [importText, setImportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const resetModal = () => {
    setImportText('');
    setParsedItems([]);
    setShowPreview(false);
    setIsProcessing(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  // Intelligent text parsing function
  const parseImportText = (text: string): ParsedItem[] => {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const items: ParsedItem[] = [];

    // Keywords to identify categories
    const completedKeywords = ['completed', 'finished', 'done', 'read', 'watched', '✅', '✓'];
    const inProgressKeywords = ['reading', 'watching', 'current', 'in progress', '📖', '🎥'];
    const plannedKeywords = ['want to', 'planned', 'to read', 'to watch', 'wishlist', '📋', '🎯'];
    const failsKeywords = ['dnf', 'stopped', 'abandoned', 'did not finish', '❌'];
    const allTimeKeywords = ['favorite', 'all time', 'best', '🏆', '⭐'];

    // Keywords to identify books vs movies
    const bookKeywords = ['book', 'novel', 'author', 'read', 'reading', '📚', 'isbn'];
    const movieKeywords = ['movie', 'film', 'director', 'watched', 'watching', '🎬', 'cinema'];

    let currentCategory: ParsedItem['category'] = 'completed';
    let currentType: 'book' | 'movie' | 'unknown' = 'unknown';

    for (const line of lines) {
      const lowerLine = line.toLowerCase();

      // Check for section headers
      if (lowerLine.includes('book') && (completedKeywords.some(kw => lowerLine.includes(kw)) || lowerLine.includes('completed'))) {
        currentCategory = 'completed';
        currentType = 'book';
        continue;
      }
      if (lowerLine.includes('movie') && (completedKeywords.some(kw => lowerLine.includes(kw)) || lowerLine.includes('completed'))) {
        currentCategory = 'completed';
        currentType = 'movie';
        continue;
      }
      if (inProgressKeywords.some(kw => lowerLine.includes(kw))) {
        currentCategory = 'inProgress';
        if (lowerLine.includes('book') || bookKeywords.some(kw => lowerLine.includes(kw))) {
          currentType = 'book';
        } else if (lowerLine.includes('movie') || movieKeywords.some(kw => lowerLine.includes(kw))) {
          currentType = 'movie';
        }
        continue;
      }
      if (plannedKeywords.some(kw => lowerLine.includes(kw))) {
        currentCategory = 'planned';
        if (lowerLine.includes('book') || bookKeywords.some(kw => lowerLine.includes(kw))) {
          currentType = 'book';
        } else if (lowerLine.includes('movie') || movieKeywords.some(kw => lowerLine.includes(kw))) {
          currentType = 'movie';
        }
        continue;
      }
      if (failsKeywords.some(kw => lowerLine.includes(kw))) {
        currentCategory = 'fails';
        continue;
      }
      if (allTimeKeywords.some(kw => lowerLine.includes(kw))) {
        currentCategory = 'allTime';
        continue;
      }

      // Skip obvious header lines
      if (lowerLine.includes('generated') || lowerLine.includes('export') || lowerLine.includes('═') || lowerLine.includes('─')) {
        continue;
      }

      // Parse individual items
      const itemMatch = line.match(/^(\d+\.?\s*)?(.+)/);
      if (itemMatch) {
        const itemText = itemMatch[2].trim();
        
        // Extract title and author
        let title = '';
        let author = '';
        let year: number | undefined;
        let rating: number | undefined;
        let notes = '';
        let format = '';

        // Common patterns for title and author
        const patterns = [
          /"([^"]+)"\s+by\s+([^(]+)/i,  // "Title" by Author
          /([^-]+)\s+-\s+([^(]+)/i,     // Title - Author
          /([^,]+),\s+([^(]+)/i,        // Title, Author
          /([^(]+)\s+by\s+([^(]+)/i,    // Title by Author
        ];

        let matched = false;
        for (const pattern of patterns) {
          const match = itemText.match(pattern);
          if (match) {
            title = match[1].trim().replace(/^["']|["']$/g, '');
            author = match[2].trim();
            matched = true;
            break;
          }
        }

        // If no pattern matched, try to extract just the title
        if (!matched) {
          const cleanText = itemText.replace(/^\d+\.?\s*/, '').trim();
          if (cleanText.length > 0) {
            title = cleanText.split(/[(\[\-]/)[0].trim();
            author = 'Unknown';
          }
        }

        // Extract year
        const yearMatch = itemText.match(/\((\d{4})\)/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }

        // Extract rating
        const ratingMatch = itemText.match(/(\d+)\/5|⭐\s*(\d+)|★+/);
        if (ratingMatch) {
          if (ratingMatch[1]) {
            rating = parseInt(ratingMatch[1]);
          } else if (ratingMatch[2]) {
            rating = parseInt(ratingMatch[2]);
          } else {
            rating = (itemText.match(/★/g) || []).length;
          }
        }

        // Extract notes
        const notesMatch = itemText.match(/notes?:\s*"([^"]+)"/i) || itemText.match(/notes?:\s*([^-\n]+)/i);
        if (notesMatch) {
          notes = notesMatch[1].trim();
        }

        // Extract format
        const formatMatch = itemText.match(/\[(hardcopy|audio|ebook|streaming|theater|blu-ray|dvd)\]/i);
        if (formatMatch) {
          format = formatMatch[1].toLowerCase();
        }

        // Determine if it's a book or movie
        let isBook = currentType === 'book';
        if (currentType === 'unknown') {
          const bookScore = bookKeywords.reduce((score, kw) => score + (lowerLine.includes(kw) ? 1 : 0), 0);
          const movieScore = movieKeywords.reduce((score, kw) => score + (lowerLine.includes(kw) ? 1 : 0), 0);
          
          if (bookScore > movieScore) {
            isBook = true;
          } else if (movieScore > bookScore) {
            isBook = false;
          } else {
            // Default heuristics
            isBook = !lowerLine.includes('director') && !lowerLine.includes('film');
          }
        }

        // Calculate confidence score
        let confidence = 0.5;
        if (title && author && author !== 'Unknown') confidence += 0.3;
        if (year) confidence += 0.1;
        if (rating) confidence += 0.1;
        if (format) confidence += 0.1;

        if (title && title.length > 1) {
          items.push({
            title,
            author: author || 'Unknown',
            year,
            rating,
            notes: notes || undefined,
            format: format || undefined,
            category: currentCategory,
            isBook,
            confidence: Math.min(confidence, 1.0)
          });
        }
      }
    }

    return items;
  };

  const handleParseText = () => {
    if (!importText.trim()) {
      Alert.alert('No Text', 'Please paste some text to import.');
      return;
    }

    setIsProcessing(true);
    
    // Simulate processing time for better UX
    setTimeout(() => {
      const parsed = parseImportText(importText);
      setParsedItems(parsed);
      setShowPreview(true);
      setIsProcessing(false);
    }, 1000);
  };

  const handleConfirmImport = () => {
    const books: Omit<Book, 'id'>[] = [];
    const movies: Omit<Movie, 'id'>[] = [];
    const currentDate = new Date().toISOString().split('T')[0];

    parsedItems.forEach(item => {
      const baseItem = {
        title: item.title,
        author: item.author,
        year: item.year || new Date().getFullYear(),
        category: item.category,
        notes: item.notes,
        rating: item.rating,
        format: item.format || (item.isBook ? 'text' : 'streaming'),
        percentage: item.category === 'completed' ? 100 : (item.category === 'inProgress' ? 50 : undefined),
        ...(item.category === 'completed' && { completedDate: currentDate }),
        ...(item.category === 'inProgress' && { dateStarted: currentDate }),
        ...(item.category === 'planned' && { dateAdded: currentDate }),
        ...(item.category === 'fails' && { dateAbandoned: currentDate }),
        isAllTime: item.category === 'allTime',
      };

      if (item.isBook) {
        books.push(baseItem as Omit<Book, 'id'>);
      } else {
        movies.push(baseItem as Omit<Movie, 'id'>);
      }
    });

    onImport(books, movies);
    Alert.alert(
      'Import Successful!', 
      `Imported ${books.length} books and ${movies.length} movies.`,
      [{ text: 'OK', onPress: handleClose }]
    );
  };

  const renderPreview = () => (
    <ScrollView style={styles.previewContainer} showsVerticalScrollIndicator={false}>
      <View style={styles.previewHeader}>
        <Text style={[styles.previewTitle, isDark && styles.darkText]}>
          Import Preview ({parsedItems.length} items found)
        </Text>
        <Text style={[styles.previewSubtitle, isDark && styles.darkSecondaryText]}>
          Review and confirm the items below
        </Text>
      </View>

      {parsedItems.map((item, index) => (
        <View key={index} style={[styles.previewItem, isDark && styles.darkPreviewItem]}>
          <View style={styles.previewItemHeader}>
            <View style={styles.previewItemType}>
              <Text style={[styles.typeLabel, { color: item.isBook ? '#F59E0B' : '#3B82F6' }]}>
                {item.isBook ? '📚' : '🎬'} {item.isBook ? 'Book' : 'Movie'}
              </Text>
              <View style={[
                styles.confidenceBadge,
                { backgroundColor: item.confidence > 0.7 ? '#10B981' : item.confidence > 0.5 ? '#F59E0B' : '#EF4444' }
              ]}>
                <Text style={styles.confidenceText}>
                  {Math.round(item.confidence * 100)}%
                </Text>
              </View>
            </View>
            <Text style={[styles.categoryLabel, isDark && styles.darkSecondaryText]}>
              {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
            </Text>
          </View>
          
          <Text style={[styles.previewTitle, isDark && styles.darkText]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.previewAuthor, isDark && styles.darkSecondaryText]}>
            by {item.author}
          </Text>
          
          <View style={styles.previewMeta}>
            {item.year && (
              <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                {item.year}
              </Text>
            )}
            {item.rating && (
              <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                ⭐ {item.rating}/5
              </Text>
            )}
            {item.format && (
              <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                {item.format}
              </Text>
            )}
          </View>
          
          {item.notes && (
            <Text style={[styles.previewNotes, isDark && styles.darkTertiaryText]} numberOfLines={2}>
              "{item.notes}"
            </Text>
          )}
        </View>
      ))}
    </ScrollView>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[styles.container, isDark && styles.darkContainer]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <Text style={[styles.title, isDark && styles.darkText]}>
            Import Data
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </TouchableOpacity>
        </View>

        {!showPreview ? (
          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContentContainer}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.instructionsCard}>
              <FileText size={24} color={isDark ? "#60A5FA" : "#3B82F6"} />
              <Text style={[styles.instructionsTitle, isDark && styles.darkText]}>
                Import Instructions
              </Text>
              <Text style={[styles.instructionsText, isDark && styles.darkSecondaryText]}>
                Paste text from Apple Notes, exported lists, or any formatted text containing your books and movies. 
                The app will intelligently parse titles, authors, ratings, and categories.
              </Text>
              
              <View style={styles.formatExamples}>
                <Text style={[styles.exampleTitle, isDark && styles.darkText]}>Supported formats:</Text>
                <Text style={[styles.exampleText, isDark && styles.darkSecondaryText]}>
                  • "Book Title" by Author Name (2023) ⭐ 4/5{'\n'}
                  • Movie Title - Director (2023){'\n'}
                  • 1. Title by Author{'\n'}
                  • Title, Author Name
                </Text>
              </View>
            </View>

            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, isDark && styles.darkText]}>
                Paste your text below:
              </Text>
              <TextInput
                style={[styles.textInput, isDark && styles.darkTextInput]}
                value={importText}
                onChangeText={setImportText}
                placeholder="Paste your books and movies list here..."
                placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                multiline
                numberOfLines={8}
                textAlignVertical="top"
                scrollEnabled={true}
                blurOnSubmit={false}
              />
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.parseButton,
                  { backgroundColor: isDark ? '#3B82F6' : '#2563EB' },
                  (!importText.trim() || isProcessing) && styles.disabledButton
                ]}
                onPress={handleParseText}
                disabled={!importText.trim() || isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Upload size={20} color="#FFFFFF" />
                )}
                <Text style={styles.parseButtonText}>
                  {isProcessing ? 'Processing...' : 'Parse & Preview'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <>
            {renderPreview()}
            <View style={[styles.footer, isDark && styles.darkFooter]}>
              <TouchableOpacity
                style={[styles.backButton, isDark && styles.darkBackButton]}
                onPress={() => setShowPreview(false)}
              >
                <Text style={[styles.backButtonText, isDark && styles.darkBackButtonText]}>
                  Back to Edit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.importButton, { backgroundColor: '#10B981' }]}
                onPress={handleConfirmImport}
              >
                <CheckCircle size={20} color="#FFFFFF" />
                <Text style={styles.importButtonText}>
                  Import {parsedItems.length} Items
                </Text>
              </TouchableOpacity>
            </View>
          </>
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
  scrollContentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  instructionsCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
    gap: 12,
  },
  instructionsTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    textAlign: 'center',
  },
  instructionsText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  darkSecondaryText: {
    color: '#D1D5DB',
  },
  formatExamples: {
    marginTop: 12,
    alignSelf: 'stretch',
  },
  exampleTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 8,
  },
  exampleText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 18,
  },
  darkTertiaryText: {
    color: '#9CA3AF',
  },
  inputSection: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 12,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#111827',
    backgroundColor: '#F9FAFB',
    minHeight: 160,
    maxHeight: 200,
  },
  darkTextInput: {
    borderColor: '#4B5563',
    backgroundColor: '#1F2937',
    color: '#FFFFFF',
  },
  buttonContainer: {
    paddingTop: 8,
  },
  parseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#2563EB',
  },
  disabledButton: {
    opacity: 0.5,
  },
  parseButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  previewContainer: {
    flex: 1,
    padding: 20,
  },
  previewHeader: {
    marginBottom: 20,
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  previewItem: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkPreviewItem: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  previewItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  previewItemType: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeLabel: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  confidenceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  confidenceText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  categoryLabel: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    textTransform: 'capitalize',
  },
  previewAuthor: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 8,
  },
  previewMeta: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  metaText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
  },
  previewNotes: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  darkFooter: {
    borderTopColor: '#374151',
  },
  backButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  darkBackButton: {
    backgroundColor: '#374151',
  },
  backButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkBackButtonText: {
    color: '#D1D5DB',
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  importButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});