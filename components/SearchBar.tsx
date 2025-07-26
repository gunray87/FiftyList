import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Search, X } from 'lucide-react-native';

interface SearchBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  placeholder?: string;
  isDark?: boolean;
  backgroundColor?: string;
}

export default function SearchBar({ 
  searchQuery, 
  onSearchChange, 
  placeholder = "Search...", 
  isDark = false,
  backgroundColor 
}: SearchBarProps) {
  const handleClear = () => {
    onSearchChange('');
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
          style={[styles.searchInput, isDark && styles.darkSearchInput]}
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder={placeholder}
          placeholderTextColor={isDark ? "#6B7280" : "#9CA3AF"}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search input"
          accessibilityHint="Type to search through your books and movies"
          accessibilityRole="searchbox"
        />
        
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
});