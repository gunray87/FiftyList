import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Calendar, Filter } from 'lucide-react-native';

interface YearFolderSelectorProps {
  availableYears: number[];
  selectedYear: number | 'all';
  onYearChange: (year: number | 'all') => void;
  primaryColor: string;
  isDark?: boolean;
  backgroundColor?: string;
}

export default function YearFolderSelector({
  availableYears,
  selectedYear,
  onYearChange,
  primaryColor,
  isDark = false,
  backgroundColor
}: YearFolderSelectorProps) {
  const currentYear = new Date().getFullYear();
  
  // Create year options with "All Years" first, then years in descending order
  const yearOptions = [
    { key: 'all', label: 'All Years', isSpecial: true },
    ...availableYears.map(year => ({ 
      key: year, 
      label: year.toString(), 
      isSpecial: false,
      isCurrent: year === currentYear 
    }))
  ];

  const renderYearChip = (option: any) => {
    const isSelected = selectedYear === option.key;
    
    return (
      <TouchableOpacity
        key={option.key}
        style={[
          styles.yearChip,
          isDark && styles.darkYearChip,
          isSelected && [
            styles.selectedYearChip,
            { 
              backgroundColor: primaryColor,
              borderColor: primaryColor,
            }
          ]
        ]}
        onPress={() => onYearChange(option.key)}
        activeOpacity={0.8}
      >
        <View style={styles.chipContent}>
          {option.isSpecial && (
            <Calendar 
              size={12} 
              color={isSelected ? '#FFFFFF' : (isDark ? '#9CA3AF' : '#6B7280')} 
            />
          )}
          <Text style={[
            styles.chipText,
            isDark && styles.darkChipText,
            isSelected && styles.selectedChipText
          ]}>
            {option.label}
          </Text>
          {option.isCurrent && !isSelected && (
            <View style={[styles.currentIndicator, { backgroundColor: primaryColor }]} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[
      styles.container,
      isDark && styles.darkContainer,
      { backgroundColor: backgroundColor || (isDark ? '#111827' : '#D6B588') }
    ]}>
      {/* Minimal header */}
      <View style={styles.header}>
        <Filter 
          size={14} 
          color={isDark ? '#9CA3AF' : '#78716C'} 
        />
        <Text style={[styles.headerText, isDark && styles.darkHeaderText]}>
          Year Filter
        </Text>
      </View>
      
      {/* Scrollable year chips */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        <View style={styles.chipsContainer}>
          {yearOptions.map(renderYearChip)}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 6,
    paddingBottom: 4,
    marginHorizontal: 20,
    marginBottom: 2,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(10px)',
  },
  darkContainer: {
    backgroundColor: 'rgba(31, 41, 55, 0.6)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  headerText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#78716C',
    opacity: 0.8,
  },
  darkHeaderText: {
    color: '#D1D5DB',
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 16,
  },
  chipsContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  yearChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  darkYearChip: {
    backgroundColor: 'rgba(55, 65, 81, 0.8)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedYearChip: {
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 0,
  },
  chipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
    color: '#374151',
  },
  darkChipText: {
    color: '#D1D5DB',
  },
  selectedChipText: {
    color: '#FFFFFF',
  },
  currentIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginLeft: 2,
  },
});