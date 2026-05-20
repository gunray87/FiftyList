import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { X, RotateCcw, Info, BookOpen, Film, Star, RotateCw } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface DismissedSuggestion {
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

interface DismissedSuggestionsModalProps {
  visible: boolean;
  onClose: () => void;
  isDark?: boolean;
}

/** Inner content — use inside parent settings sheet to avoid stacked modals. */
export function DismissedSuggestionsPanel({
  onClose,
  isDark = false,
}: {
  onClose: () => void;
  isDark?: boolean;
}) {
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Map<string, DismissedSuggestion>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Load dismissed suggestions from storage
  useEffect(() => {
    const loadDismissedSuggestions = async () => {
      try {
        setIsLoading(true);
        const stored = await AsyncStorage.getItem('dismissedSuggestions');
        if (stored) {
          const dismissedData = JSON.parse(stored);
          // Handle both old format (array of strings) and new format (object with full data)
          if (Array.isArray(dismissedData)) {
            // Old format - convert to new format
            const newMap = new Map();
            dismissedData.forEach(id => {
              newMap.set(id, { id } as DismissedSuggestion);
            });
            setDismissedSuggestions(newMap);
          } else {
            // New format - object with full suggestion data
            const newMap = new Map();
            Object.entries(dismissedData).forEach(([id, suggestion]) => {
              newMap.set(id, suggestion as DismissedSuggestion);
            });
            setDismissedSuggestions(newMap);
          }
        }
      } catch (error) {
        console.error('Error loading dismissed suggestions:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (visible) {
      loadDismissedSuggestions();
    }
  }, [visible]);

  const handleResetDismissed = () => {
    Alert.alert(
      'Reset Dismissed Suggestions',
      'This will show all previously dismissed suggestions again. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Reset', 
          style: 'destructive',
          onPress: async () => {
            try {
              setDismissedSuggestions(new Map());
              await AsyncStorage.removeItem('dismissedSuggestions');
              Alert.alert(
                'Reset Complete',
                'All dismissed suggestions have been restored.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Error resetting dismissed suggestions:', error);
              Alert.alert(
                'Error',
                'Failed to reset dismissed suggestions. Please try again.',
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  };

  const handleRestoreSuggestion = (suggestionId: string) => {
    Alert.alert(
      'Restore Suggestion',
      'This will restore this suggestion and show it again in your recommendations. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Restore', 
          onPress: async () => {
            try {
              const newMap = new Map(dismissedSuggestions);
              newMap.delete(suggestionId);
              setDismissedSuggestions(newMap);
              
              // Save updated dismissed suggestions
              const dismissedObject = Object.fromEntries(newMap);
              await AsyncStorage.setItem('dismissedSuggestions', JSON.stringify(dismissedObject));
              
              Alert.alert(
                'Restored',
                'This suggestion has been restored and will appear in your recommendations again.',
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Error restoring suggestion:', error);
              Alert.alert(
                'Error',
                'Failed to restore suggestion. Please try again.',
                [{ text: 'OK' }]
              );
            }
          }
        }
      ]
    );
  };

  return (
      <View style={[styles.container, isDark && styles.darkContainer]}>
        {/* Header */}
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <Text style={[styles.title, isDark && styles.darkText]}>
            Dismissed Suggestions
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </TouchableOpacity>
        </View>

                  <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Info Section */}
            <View style={[styles.infoSection, isDark && styles.darkInfoSection]}>
              <Info size={20} color={isDark ? "#8B5CF6" : "#8B5CF6"} />
              <Text style={[styles.infoText, isDark && styles.darkText]}>
                When you tap "Not Interested" on a suggestion, it gets dismissed to avoid showing you similar content in the future.
              </Text>
            </View>

            {/* Stats Section */}
            <View style={[styles.statsSection, isDark && styles.darkSection]}>
              <View style={styles.statItem}>
                <Text style={[styles.statNumber, isDark && styles.darkText]}>
                  {dismissedSuggestions.size}
                </Text>
                <Text style={[styles.statLabel, isDark && styles.darkSecondaryText]}>
                  Suggestions Dismissed
                </Text>
              </View>
            </View>

            {/* Actions Section */}
            <View style={[styles.actionsSection, isDark && styles.darkSection]}>
              <TouchableOpacity
                style={[
                  styles.resetButton,
                  dismissedSuggestions.size === 0 && styles.disabledButton
                ]}
                onPress={handleResetDismissed}
                disabled={dismissedSuggestions.size === 0 || isLoading}
              >
                <RotateCcw size={20} color="#FFFFFF" />
                <Text style={styles.resetButtonText}>
                  {isLoading ? 'Loading...' : 'Restore All Dismissed Suggestions'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Individual Suggestions List */}
            {dismissedSuggestions.size > 0 && !isLoading && (
              <View style={styles.suggestionsSection}>
                <Text style={[styles.sectionTitle, isDark && styles.darkText]}>
                  Dismissed Items
                </Text>
                {Array.from(dismissedSuggestions.values()).map((suggestion) => (
                  <View key={suggestion.id} style={[styles.suggestionCard, isDark && styles.darkSuggestionCard]}>
                    <View style={styles.suggestionHeader}>
                      <View style={styles.suggestionType}>
                        {suggestion.isBook ? (
                          <BookOpen size={16} color="#F59E0B" />
                        ) : (
                          <Film size={16} color="#3B82F6" />
                        )}
                        <Text style={[styles.typeText, isDark && styles.darkSecondaryText]}>
                          {suggestion.isBook ? 'Book' : 'Movie'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={() => handleRestoreSuggestion(suggestion.id)}
                      >
                        <RotateCw size={16} color="#8B5CF6" />
                      </TouchableOpacity>
                    </View>

                    <Text style={[styles.suggestionTitle, isDark && styles.darkText]} numberOfLines={2}>
                      {suggestion.title}
                    </Text>
                    <Text style={[styles.suggestionAuthor, isDark && styles.darkSecondaryText]}>
                      by {suggestion.author}
                    </Text>

                    <Text style={[styles.suggestionReason, isDark && styles.darkTertiaryText]} numberOfLines={2}>
                      {suggestion.reason}
                    </Text>

                    {suggestion.description && (
                      <Text style={[styles.suggestionDescription, isDark && styles.darkSecondaryText]} numberOfLines={2}>
                        {suggestion.description}
                      </Text>
                    )}

                    <View style={styles.suggestionMeta}>
                      <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                        {suggestion.year}
                      </Text>
                      {suggestion.estimatedPages && (
                        <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                          ~{suggestion.estimatedPages} pages
                        </Text>
                      )}
                      {suggestion.estimatedLength && (
                        <Text style={[styles.metaText, isDark && styles.darkTertiaryText]}>
                          {suggestion.estimatedLength} read
                        </Text>
                      )}
                      {suggestion.rating && (
                        <View style={styles.ratingContainer}>
                          <Star size={12} color="#F59E0B" fill="#F59E0B" />
                          <Text style={[styles.ratingText, isDark && styles.darkTertiaryText]}>{suggestion.rating}/5</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Empty State */}
            {dismissedSuggestions.size === 0 && !isLoading && (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, isDark && styles.darkText]}>
                  No Dismissed Suggestions
                </Text>
                <Text style={[styles.emptyText, isDark && styles.darkSecondaryText]}>
                  You haven't dismissed any suggestions yet. When you tap "Not Interested" on suggestions, they'll appear here.
                </Text>
              </View>
            )}

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, isDark && styles.darkTertiaryText]}>
                Dismissed suggestions help improve your recommendations by learning what you're not interested in.
              </Text>
            </View>
          </ScrollView>
      </View>
  );
}

export default function DismissedSuggestionsModal({
  visible,
  onClose,
  isDark = false,
}: DismissedSuggestionsModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <DismissedSuggestionsPanel onClose={onClose} isDark={isDark} />
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
    padding: 20,
  },
  infoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 12,
  },
  darkInfoSection: {
    backgroundColor: '#1E3A8A',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#1E40AF',
    lineHeight: 20,
  },
  statsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  darkSection: {
    backgroundColor: '#1F2937',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 32,
    fontFamily: 'Inter-Bold',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkSecondaryText: {
    color: '#9CA3AF',
  },
  actionsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  resetButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  footer: {
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
  },
  darkTertiaryText: {
    color: '#6B7280',
  },
  suggestionsSection: {
    marginTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 12,
  },
  suggestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkSuggestionCard: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
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
  restoreButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  suggestionTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  suggestionAuthor: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginBottom: 6,
  },
  suggestionReason: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginBottom: 6,
  },
  suggestionDescription: {
    fontSize: 13,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 18,
    marginBottom: 8,
  },
  suggestionMeta: {
    flexDirection: 'row',
    gap: 12,
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
});
