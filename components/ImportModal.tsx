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
import { X, Upload, FileText, CircleCheck as CheckCircle, CalendarDays, BookOpen, Sparkles } from 'lucide-react-native';
import { Book, Movie } from '@/types';
import { useSubscription } from '@/hooks/useSubscription';

interface ImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (books: Omit<Book, 'id'>[], movies: Omit<Movie, 'id'>[]) => void;
  isDark?: boolean;
}

interface ParsedItem {
  title: string;
  author: string;
  publicationYear?: number;
  rating?: number;
  notes?: string;
  format?: string;
  medium?: string;
  category: 'completed' | 'inProgress' | 'planned' | 'fails' | 'allTime';
  isBook: boolean;
  confidence: number;
}

/**
 * Strip duplicated ordinal prefixes from imported rows while preserving real title numbers.
 * Examples:
 * - "1. 12 The Mission Song" -> "The Mission Song"
 * - "03) 7. Dune" -> "Dune"
 * Keeps genuine numeric titles like "1984" or "12 Angry Men".
 */
function normalizeImportedLine(rawLine: string): string {
  let line = rawLine.trim();
  if (!line) return line;

  const original = line;

  // Remove stacked list ordinals at the start, but stop if the remaining text looks like a real numeric title.
  for (let i = 0; i < 3; i += 1) {
    const match = line.match(/^(\d{1,3})(?:[\]\).:-]|\s)+(.*)$/);
    if (!match) break;

    const rest = match[2].trim();
    if (!rest) break;

    // Preserve well-known numeric-title shapes.
    if (/^(1984|2001\b|11\/22\/63\b|12 Angry Men\b)/i.test(rest)) {
      break;
    }

    // If the next token starts with letters, this prefix was almost certainly list numbering.
    if (/^[A-Za-z"'([{]/.test(rest)) {
      line = rest;
      continue;
    }

    // If another ordinal follows, keep stripping.
    if (/^\d{1,3}(?:[\]\).:-]|\s)+/.test(rest)) {
      line = rest;
      continue;
    }

    break;
  }

  // Handle rows like "53 The Hobbit" where the remaining text is clearly title-first prose.
  const singleOrdinal = line.match(/^(\d{1,3})\s+([A-Z"'(][A-Za-z].*)$/);
  if (singleOrdinal) {
    const candidate = singleOrdinal[2].trim();
    if (!/^(1984|2001\b|11\/22\/63\b|12 Angry Men\b)/i.test(candidate)) {
      line = candidate;
    }
  }

  return line || original;
}

/** Merge rows that point at the same work in the same list (title + author + type + list). */
function dedupeKeyForParsedItem(item: ParsedItem): string {
  const t = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
  const a = item.author.toLowerCase().replace(/\s+/g, ' ').trim();
  return `${item.isBook ? 'b' : 'm'}|${t}|${a}|${item.category}`;
}

function dedupeParsedItems(items: ParsedItem[]): { items: ParsedItem[]; removed: number } {
  const out: ParsedItem[] = [];
  const keyToIndex = new Map<string, number>();
  let removed = 0;
  for (const item of items) {
    const key = dedupeKeyForParsedItem(item);
    if (!keyToIndex.has(key)) {
      keyToIndex.set(key, out.length);
      out.push(item);
    } else {
      const idx = keyToIndex.get(key)!;
      removed += 1;
      if (item.confidence > out[idx].confidence) {
        out[idx] = item;
      }
    }
  }
  return { items: out, removed };
}

const LLM_PROXY_BASE_URL = process.env.EXPO_PUBLIC_LLM_PROXY_BASE_URL;
const ENABLE_LLM_ASSIST = process.env.EXPO_PUBLIC_ENABLE_LLM_ASSIST === 'true';

export default function ImportModal({ visible, onClose, onImport, isDark = false }: ImportModalProps) {
  const { features } = useSubscription();
  const [importText, setImportText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [selectedMedium, setSelectedMedium] = useState<string>('default');
  const [showMediumPicker, setShowMediumPicker] = useState(false);
  const [llmStatusMessage, setLlmStatusMessage] = useState<string | null>(null);

  // Medium options for books and movies
  const bookMediums = [
    { value: 'default', label: 'Default (Text)' },
    { value: 'hardcopy', label: 'Hardcopy' },
    { value: 'paperback', label: 'Paperback' },
    { value: 'hardcover', label: 'Hardcover' },
    { value: 'audio', label: 'Audiobook' },
    { value: 'kindle', label: 'Kindle' },
    { value: 'ebook', label: 'E-book' },
    { value: 'pdf', label: 'PDF' },
    { value: 'library', label: 'Library' },
    { value: 'borrowed', label: 'Borrowed' },
  ];

  const movieMediums = [
    { value: 'default', label: 'Default (Streaming)' },
    { value: 'streaming', label: 'Streaming' },
    { value: 'theater', label: 'Theater' },
    { value: 'bluray', label: 'Blu-ray' },
    { value: 'dvd', label: 'DVD' },
    { value: 'digital', label: 'Digital' },
    { value: 'rental', label: 'Rental' },
    { value: 'library', label: 'Library' },
  ];

  const resetModal = () => {
    setImportText('');
    setParsedItems([]);
    setShowPreview(false);
    setIsProcessing(false);
    setSelectedYear(new Date().getFullYear());
    setShowYearPicker(false);
    setSelectedMedium('default');
    setShowMediumPicker(false);
    setLlmStatusMessage(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  // Intelligent text parsing function
  const parseImportText = (text: string): ParsedItem[] => {
    const lines = text
      .split('\n')
      .map((line) => normalizeImportedLine(line))
      .filter(line => line.trim().length > 0);
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
        let publicationYear: number | undefined;
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

        // Extract publication year
        const yearMatch = itemText.match(/\((\d{4})\)/);
        if (yearMatch) {
          publicationYear = parseInt(yearMatch[1]);
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

        // Extract format and medium
        const formatMatch = itemText.match(/\[(hardcopy|audio|ebook|streaming|theater|blu-ray|dvd|kindle|paperback|hardcover|pdf|digital|rental|library|borrowed)\]/i);
        if (formatMatch) {
          format = formatMatch[1].toLowerCase();
        }

        // Extract medium from text patterns
        let medium = '';
        const mediumPatterns = [
          /(audiobook|audio book|audio)/i,
          /(kindle|ebook|e-book|digital book)/i,
          /(hardcopy|hard copy|physical)/i,
          /(paperback|paper back)/i,
          /(hardcover|hard cover)/i,
          /(pdf)/i,
          /(streaming|netflix|hulu|amazon prime|disney\+)/i,
          /(theater|cinema|movie theater)/i,
          /(blu-ray|bluray|blu ray)/i,
          /(dvd)/i,
          /(digital|digital copy)/i,
          /(rental|rented)/i,
          /(library|borrowed)/i,
        ];

        for (const pattern of mediumPatterns) {
          const match = itemText.match(pattern);
          if (match) {
            medium = match[1].toLowerCase();
            break;
          }
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
        if (publicationYear) confidence += 0.1;
        if (rating) confidence += 0.1;
        if (format) confidence += 0.1;

        if (title && title.length > 1) {
          items.push({
            title,
            author: author || 'Unknown',
            publicationYear,
            rating,
            notes: notes || undefined,
            format: format || undefined,
            medium: medium || undefined,
            category: currentCategory,
            isBook,
            confidence: Math.min(confidence, 1.0)
          });
        }
      }
    }

    return items;
  };

  const scanAndCleanImportText = async (
    text: string
  ): Promise<{
    text: string;
    llm: { duplicatesRemoved: number; warnings: string[]; remainingActions?: number } | null;
  }> => {
    const llmScanEnabled = features.canUseLLM && ENABLE_LLM_ASSIST && Boolean(LLM_PROXY_BASE_URL);
    if (!llmScanEnabled || !LLM_PROXY_BASE_URL) {
      return { text, llm: null };
    }

    try {
      const response = await fetch(`${LLM_PROXY_BASE_URL}/llm/import-clean`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Subscription-Tier': 'premium',
          'X-App-Feature': 'import_clean',
        },
        body: JSON.stringify({
          rawText: text,
          maxItems: 300,
          mediaTypes: ['book', 'movie'],
        }),
      });

      if (!response.ok) {
        try {
          const err = (await response.json()) as { message?: string; error?: string };
          const msg = err?.message || err?.error;
          if (response.status === 403) {
            setLlmStatusMessage('AI clean requires an active premium subscription. Using your original text.');
          } else if (response.status === 429) {
            setLlmStatusMessage('AI import limit reached. Using your original text for this import.');
          } else if (response.status === 503) {
            setLlmStatusMessage('AI is not available (check the LLM proxy and Workers AI binding). Using your original text.');
          } else {
            setLlmStatusMessage(msg || 'AI scan skipped. Using your original text.');
          }
        } catch {
          setLlmStatusMessage('AI scan skipped. Using your original text.');
        }
        return { text, llm: null };
      }

      const payload = (await response.json()) as {
        cleaned_text?: string;
        duplicates_removed?: number;
        warnings?: string[];
        remaining_actions?: number;
      };
      const cleanedText =
        typeof payload?.cleaned_text === 'string' && payload.cleaned_text.trim().length > 0
          ? payload.cleaned_text
          : text;

      const dup =
        typeof payload?.duplicates_removed === 'number' && payload.duplicates_removed >= 0
          ? Math.floor(payload.duplicates_removed)
          : 0;
      const warnings = Array.isArray(payload?.warnings) ? payload.warnings.filter((w) => typeof w === 'string') : [];
      const remaining =
        typeof payload?.remaining_actions === 'number' ? payload.remaining_actions : undefined;

      const parts: string[] = ['AI cleaned the import text.'];
      if (dup > 0) {
        parts.push(`Removed ${dup} duplicate entr${dup === 1 ? 'y' : 'ies'} in the source.`);
      }
      if (remaining !== undefined) {
        parts.push(`Remaining AI actions: ${remaining}.`);
      }
      if (warnings.length) {
        parts.push(warnings.join(' '));
      }
      setLlmStatusMessage(parts.join(' '));

      if (cleanedText !== text) {
        setImportText(cleanedText);
      }

      return {
        text: cleanedText,
        llm: { duplicatesRemoved: dup, warnings, remainingActions: remaining },
      };
    } catch {
      setLlmStatusMessage('AI scan failed. Using your original text.');
      return { text, llm: null };
    }
  };

  const handleParseText = async () => {
    if (!importText.trim()) {
      Alert.alert('No Text', 'Please paste some text to import.');
      return;
    }

    setIsProcessing(true);
    setLlmStatusMessage(null);
    
    // Keep a short delay for loading feedback while parsing/cleaning.
    setTimeout(async () => {
      const { text: textToParse, llm } = await scanAndCleanImportText(importText);
      const parsed = parseImportText(textToParse);
      const { items: uniqueItems, removed: localDupesRemoved } = dedupeParsedItems(parsed);
      if (llm) {
        setLlmStatusMessage((prev) => {
          const base = prev || 'AI cleaned the import text.';
          if (localDupesRemoved > 0) {
            return `${base} Merged ${localDupesRemoved} duplicate preview row${localDupesRemoved === 1 ? '' : 's'}.`;
          }
          return base;
        });
      } else if (localDupesRemoved > 0) {
        setLlmStatusMessage((prev) => {
          const line = `Merged ${localDupesRemoved} duplicate preview row${
            localDupesRemoved === 1 ? '' : 's'
          } (same title, author, and list).`;
          if (prev && prev.trim().length > 0) {
            return `${prev} ${line}`;
          }
          return line;
        });
      }
      setParsedItems(uniqueItems);
      setShowPreview(true);
      setIsProcessing(false);
    }, 1000);
  };

  const handleConfirmImport = () => {
    const books: Omit<Book, 'id'>[] = [];
    const movies: Omit<Movie, 'id'>[] = [];
    const currentDate = new Date().toISOString().split('T')[0];
    // Create completion date using selected year instead of current year
    const completionDate = `${selectedYear}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getDate().toString().padStart(2, '0')}`;

    parsedItems.forEach(item => {
      // Determine the medium to use
      let finalMedium = item.medium;
      if (!finalMedium && selectedMedium !== 'default') {
        finalMedium = selectedMedium;
      }
      
      const baseItem = {
        title: item.title,
        author: item.author,
        publicationYear: item.publicationYear || selectedYear, // Use selected year as fallback
        category: item.category,
        notes: item.notes,
        rating: item.rating,
        format: finalMedium || item.format || (item.isBook ? 'text' : 'streaming'), // Use selected medium as format
        source: finalMedium || (item.isBook ? 'text' : 'streaming'), // Use medium as source
        percentage: item.category === 'completed' ? 100 : (item.category === 'inProgress' ? 50 : undefined),
        ...(item.category === 'completed' && { completedDate: completionDate }),
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
      `Imported ${books.length} books and ${movies.length} movies with year ${selectedYear}.`,
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
          Review and confirm the items below • Default year: {selectedYear} • Default medium: {selectedMedium === 'default' ? 'Auto-detect' : selectedMedium}
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
            <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                          {item.publicationYear || selectedYear}
            {!item.publicationYear && (
                <Text style={[styles.metaText, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>
                  {' '}(default)
                </Text>
              )}
            </Text>
            {item.rating && (
              <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                ⭐ {item.rating}/5
              </Text>
            )}
            {(() => {
              // Calculate the final format that will be applied
              let finalFormat = item.medium;
              if (!finalFormat && selectedMedium !== 'default') {
                finalFormat = selectedMedium;
              }
              finalFormat = finalFormat || item.format || (item.isBook ? 'text' : 'streaming');
              
              return (
                <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                  📄 {finalFormat}
                  {(!item.medium && selectedMedium !== 'default') && (
                    <Text style={[styles.metaText, { color: isDark ? '#60A5FA' : '#3B82F6' }]}>
                      {' '}(default)
                    </Text>
                  )}
                </Text>
              );
            })()}
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
                {features.canUseLLM && ENABLE_LLM_ASSIST && (
                <View style={styles.premiumScanRow}>
                  <Sparkles size={14} color="#2563EB" />
                  <Text style={[styles.instructionsText, styles.premiumScanText]}>
                    Premium: AI normalizes the text, removes duplicate numbering, drops junk, and removes duplicate works before
                    import. The preview also merges any duplicate rows the parser still picks up.
                  </Text>
                </View>
              )}
              
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

            <View style={styles.yearSection}>
              <Text style={[styles.inputLabel, isDark && styles.darkText]}>
                Default Year for Imported Items:
              </Text>
              <View style={styles.yearInputContainer}>
                <TextInput
                  style={[styles.yearInput, isDark && styles.darkYearInput]}
                  value={selectedYear.toString()}
                  onChangeText={(text) => {
                    const year = parseInt(text);
                    const currentYear = new Date().getFullYear();
                    if (year && year >= currentYear - 40 && year <= currentYear + 10) {
                      setSelectedYear(year);
                    }
                  }}
                  placeholder="Enter year"
                  placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
                  keyboardType="numeric"
                  maxLength={4}
                />
                <TouchableOpacity
                  style={[styles.yearPickerButton, isDark && styles.darkYearPickerButton]}
                  onPress={() => setShowYearPicker(!showYearPicker)}
                >
                  <CalendarDays size={18} color={isDark ? '#D1D5DB' : '#374151'} />
                </TouchableOpacity>
              </View>
              
              {showYearPicker && (
                <View style={[styles.yearPickerContainer, isDark && styles.darkYearPickerContainer]}>
                  {/* Decade selector */}
                  <View style={styles.decadeSelector}>
                    <Text style={[styles.decadeLabel, isDark && styles.darkText]}>Decade:</Text>
                    <ScrollView 
                      horizontal 
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.decadeScroll}
                    >
                      {Array.from({ length: 5 }, (_, i) => {
                        const decadeStart = Math.floor((new Date().getFullYear() - 40) / 10) * 10 + (i * 10);
                        const decadeEnd = decadeStart + 9;
                        const isCurrentDecade = selectedYear >= decadeStart && selectedYear <= decadeEnd;
                        return (
                          <TouchableOpacity
                            key={decadeStart}
                            style={[
                              styles.decadeOption,
                              isDark && styles.darkDecadeOption,
                              isCurrentDecade && { backgroundColor: isDark ? '#3B82F6' : '#2563EB' }
                            ]}
                            onPress={() => {
                              setSelectedYear(decadeStart + 5); // Set to middle of decade
                            }}
                          >
                            <Text style={[
                              styles.decadeOptionText,
                              isDark && styles.darkDecadeOptionText,
                              isCurrentDecade && { color: '#FFFFFF' }
                            ]}>
                              {decadeStart}s
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                  
                  {/* Year grid */}
                  <View style={styles.yearGrid}>
                    {(() => {
                      const baseDecade = Math.floor((new Date().getFullYear() - 40) / 10) * 10;
                      const currentDecade = Math.floor((selectedYear - baseDecade) / 10);
                      const decadeStart = baseDecade + (currentDecade * 10);
                      return Array.from({ length: 10 }, (_, i) => {
                        const year = decadeStart + i;
                        return (
                          <TouchableOpacity
                            key={year}
                            style={[
                              styles.yearGridOption,
                              isDark && styles.darkYearGridOption,
                              selectedYear === year && { backgroundColor: isDark ? '#3B82F6' : '#2563EB' }
                            ]}
                            onPress={() => {
                              setSelectedYear(year);
                              setShowYearPicker(false);
                            }}
                          >
                            <Text style={[
                              styles.yearGridOptionText,
                              isDark && styles.darkYearGridOptionText,
                              selectedYear === year && { color: '#FFFFFF' }
                            ]}>
                              {year}
                            </Text>
                          </TouchableOpacity>
                        );
                      });
                    })()}
                  </View>
                  
                  {/* Quick jump buttons */}
                  <View style={styles.quickJumpContainer}>
                    <TouchableOpacity
                      style={[styles.quickJumpButton, isDark && styles.darkQuickJumpButton]}
                      onPress={() => {
                        setSelectedYear(new Date().getFullYear());
                        setShowYearPicker(false);
                      }}
                    >
                      <Text style={[styles.quickJumpText, isDark && styles.darkText]}>This Year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickJumpButton, isDark && styles.darkQuickJumpButton]}
                      onPress={() => {
                        setSelectedYear(new Date().getFullYear() - 1);
                        setShowYearPicker(false);
                      }}
                    >
                      <Text style={[styles.quickJumpText, isDark && styles.darkText]}>Last Year</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.quickJumpButton, isDark && styles.darkQuickJumpButton]}
                      onPress={() => {
                        setSelectedYear(new Date().getFullYear() - 10);
                        setShowYearPicker(false);
                      }}
                    >
                      <Text style={[styles.quickJumpText, isDark && styles.darkText]}>10 Years Ago</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Medium Picker */}
            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, isDark && styles.darkText]}>
                Default Medium:
              </Text>
              <View style={styles.mediumPickerRow}>
                <TouchableOpacity
                  style={[styles.mediumPickerButton, isDark && styles.darkMediumPickerButton]}
                  onPress={() => setShowMediumPicker(!showMediumPicker)}
                >
                  <View style={styles.mediumPickerButtonContent}>
                    <BookOpen size={16} color={isDark ? '#D1D5DB' : '#374151'} />
                    <Text style={[styles.mediumPickerButtonText, isDark && styles.darkText]}>
                      {selectedMedium === 'default' ? 'Default' : 
                       bookMediums.find(m => m.value === selectedMedium)?.label || 
                       movieMediums.find(m => m.value === selectedMedium)?.label || 'Default'}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
              
              {showMediumPicker && (
                <View style={[styles.mediumPickerContainer, isDark && styles.darkMediumPickerContainer]}>
                  <Text style={[styles.mediumSectionTitle, isDark && styles.darkText]}>Books:</Text>
                  <View style={styles.mediumGrid}>
                    {bookMediums.map((medium) => (
                      <TouchableOpacity
                        key={medium.value}
                        style={[
                          styles.mediumOption,
                          isDark && styles.darkMediumOption,
                          selectedMedium === medium.value && { backgroundColor: isDark ? '#3B82F6' : '#2563EB' }
                        ]}
                        onPress={() => {
                          setSelectedMedium(medium.value);
                          setShowMediumPicker(false);
                        }}
                      >
                        <Text style={[
                          styles.mediumOptionText,
                          isDark && styles.darkMediumOptionText,
                          selectedMedium === medium.value && { color: '#FFFFFF' }
                        ]}>
                          {medium.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  <Text style={[styles.mediumSectionTitle, isDark && styles.darkText]}>Movies:</Text>
                  <View style={styles.mediumGrid}>
                    {movieMediums.map((medium) => (
                      <TouchableOpacity
                        key={medium.value}
                        style={[
                          styles.mediumOption,
                          isDark && styles.darkMediumOption,
                          selectedMedium === medium.value && { backgroundColor: isDark ? '#3B82F6' : '#2563EB' }
                        ]}
                        onPress={() => {
                          setSelectedMedium(medium.value);
                          setShowMediumPicker(false);
                        }}
                      >
                        <Text style={[
                          styles.mediumOptionText,
                          isDark && styles.darkMediumOptionText,
                          selectedMedium === medium.value && { color: '#FFFFFF' }
                        ]}>
                          {medium.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
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
                // Add stability props to prevent recycling crashes
                selectTextOnFocus={false}
                autoComplete="off"
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
                  {isProcessing ? 'Scanning & Processing...' : 'Parse & Preview'}
                </Text>
              </TouchableOpacity>
              {llmStatusMessage && (
                <Text style={[styles.scanStatusText, isDark && styles.darkSecondaryText]}>
                  {llmStatusMessage}
                </Text>
              )}
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
  premiumScanText: {
    color: '#2563EB',
    fontFamily: 'Inter-Medium',
    textAlign: 'left',
  },
  premiumScanRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'stretch',
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
  scanStatusText: {
    marginTop: 10,
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
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
  // Year picker styles
  yearSection: {
    marginBottom: 20,
  },
  yearInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  yearInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    textAlign: 'center',
  },
  darkYearInput: {
    backgroundColor: '#1F2937',
    borderColor: '#4B5563',
    color: '#FFFFFF',
  },
  yearPickerButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkYearPickerButton: {
    backgroundColor: '#1F2937',
    borderColor: '#4B5563',
  },
  yearPickerButtonText: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  yearPickerHint: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  yearPickerContainer: {
    marginTop: 8,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  darkYearPickerContainer: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  // Decade selector styles
  decadeSelector: {
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  decadeLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
    marginBottom: 8,
  },
  decadeScroll: {
    paddingHorizontal: 0,
    gap: 8,
  },
  decadeOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkDecadeOption: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  decadeOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  darkDecadeOptionText: {
    color: '#D1D5DB',
  },
  // Year grid styles
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 4,
    marginBottom: 16,
  },
  yearGridOption: {
    width: '18%',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkYearGridOption: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  yearGridOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  darkYearGridOptionText: {
    color: '#D1D5DB',
  },
  // Quick jump styles
  quickJumpContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  quickJumpButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  darkQuickJumpButton: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  quickJumpText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  // Legacy styles for backward compatibility
  yearPickerScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  yearOption: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkYearOption: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  yearOptionText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  darkYearOptionText: {
    color: '#D1D5DB',
  },
  // Medium picker styles
  mediumPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediumPickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkMediumPickerButton: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  mediumPickerButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  mediumPickerButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediumPickerContainer: {
    marginTop: 8,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkMediumPickerContainer: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  mediumSectionTitle: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
    marginBottom: 8,
    marginTop: 12,
  },
  mediumGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  mediumOption: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkMediumOption: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  mediumOptionText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#374151',
  },
  darkMediumOptionText: {
    color: '#D1D5DB',
  },
});