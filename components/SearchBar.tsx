import React, { useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Keyboard } from 'react-native';
import { Search, X } from 'lucide-react-native';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  isDark?: boolean;
  backgroundColor?: string;
  maxLength?: number;
  showAIBadge?: boolean;
  aiBadgeActive?: boolean;
  /** Called when the keyboard search/return key is pressed (native). */
  onSubmitSearch?: () => void;
}

export default function SearchBar({ 
  searchQuery, 
  onSearchChange, 
  placeholder = "Search...", 
  isDark = false,
  backgroundColor,
  maxLength = 120,
  showAIBadge = false,
  aiBadgeActive = false,
  onSubmitSearch,
}: SearchBarProps) {
  const inputRef = useRef<TextInput>(null);

  const handleClear = () => {
    onSearchChange('');
  };

  const handleSubmitEditing = () => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    onSubmitSearch?.();
  };

  // Use the provided background color directly
  const containerBg = backgroundColor || (isDark ? '#111827' : '#D6B588');

  return (
    <View 
      style={[
        styles.container,
        { backgroundColor: containerBg }
      ]}
      accessibilityRole="search"
    >
      <View style={[styles.searchContainer, isDark && styles.darkSearchContainer]}>
        <Search 
          size={16} 
          color={isDark ? "#9CA3AF" : "#6B7280"} 
          style={styles.searchIcon}
          {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
        />
        
        <TextInput
          ref={inputRef}
          style={[styles.searchInput, isDark && styles.darkSearchInput]}
          value={searchQuery}
          onChangeText={onSearchChange}
          maxLength={maxLength}
          placeholder={placeholder}
          placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search input"
          accessibilityHint="Type to search through your books and movies"
          accessibilityRole="searchbox"
          // Add stability props to prevent recycling crashes
          textAlignVertical="center"
          blurOnSubmit
          submitBehavior="submit"
          selectTextOnFocus={false}
          autoComplete="off"
          onSubmitEditing={handleSubmitEditing}
        />

        {showAIBadge && (
          <View
            style={[
              styles.aiBadge,
              isDark && styles.darkAIBadge,
              aiBadgeActive && styles.aiBadgeActive,
            ]}
            accessibilityRole="text"
            accessibilityLabel={aiBadgeActive ? 'AI search active' : 'AI search available'}
          >
            <Text
              style={[
                styles.aiBadgeText,
                aiBadgeActive ? styles.aiBadgeTextActive : (isDark ? styles.darkAIBadgeText : undefined),
              ]}
              {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
            >
              AI
            </Text>
          </View>
        )}
        
        {searchQuery.length > 0 && (
          <TouchableOpacity 
            style={styles.clearButton} 
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            accessibilityHint="Clears the current search query"
          >
            <X size={16} color={isDark ? "#9CA3AF" : "#6B7280"} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  darkSearchContainer: {
    backgroundColor: '#374151',
    borderColor: '#4B5563',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#111827',
    paddingVertical: 0,
  },
  darkSearchInput: {
    color: '#FFFFFF',
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },
  aiBadge: {
    marginLeft: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  darkAIBadge: {
    backgroundColor: 'rgba(124, 58, 237, 0.2)',
    borderColor: 'rgba(196, 181, 253, 0.5)',
  },
  aiBadgeActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  aiBadgeText: {
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    color: '#7C3AED',
    letterSpacing: 0.2,
  },
  darkAIBadgeText: {
    color: '#C4B5FD',
  },
  aiBadgeTextActive: {
    color: '#FFFFFF',
  },
});