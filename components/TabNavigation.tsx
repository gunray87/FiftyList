import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { BookOpen, Clock, Target, X, Star, ChevronRight } from 'lucide-react-native';

interface Tab {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  count: number;
}

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  tabs: Tab[];
  primaryColor: string;
  isDark?: boolean;
  backgroundColor?: string;
}

export default function TabNavigation({ activeTab, onTabChange, tabs, primaryColor, isDark = false, backgroundColor }: TabNavigationProps) {
  return (
    <View 
      style={[
        styles.container, 
        isDark && styles.darkContainer,
        backgroundColor && { backgroundColor }
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Category navigation"
    >
      <View style={styles.scrollContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          accessibilityLabel="Scrollable category tabs"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            const IconComponent = tab.icon;
            
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tab,
                  isActive && { backgroundColor: `${primaryColor}15` },
                  isDark && styles.darkTab,
                  isDark && isActive && styles.darkActiveTab
                ]}
                onPress={() => onTabChange(tab.key)}
                accessibilityRole="tab"
                accessibilityLabel={`${tab.label} category, ${tab.count} items`}
                accessibilityHint={`Switch to ${tab.label} category`}
                accessibilityState={{ selected: isActive }}
              >
                <View style={[
                  styles.iconContainer,
                  isActive && { backgroundColor: `${primaryColor}25` },
                  isDark && styles.darkIconContainer,
                  isDark && isActive && styles.darkActiveIconContainer
                ]}>
                  <IconComponent 
                    size={18} 
                    color={isActive ? primaryColor : (isDark ? '#9CA3AF' : '#6B7280')} 
                    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                  />
                </View>
                <Text 
                  style={[
                    styles.tabLabel,
                    { color: isActive ? primaryColor : (isDark ? '#D1D5DB' : '#6B7280') }
                  ]}
                  {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                >
                  {tab.label}
                </Text>
                <View 
                  style={[
                    styles.badge,
                    { backgroundColor: isActive ? primaryColor : (isDark ? '#374151' : '#E5E7EB') }
                  ]}
                  {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                >
                  <Text style={[
                    styles.badgeText,
                    { color: isActive ? '#FFFFFF' : (isDark ? '#D1D5DB' : '#6B7280') }
                  ]}>
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        
        {/* Scrollable indicator */}
        <View 
          style={[styles.scrollIndicator, isDark && styles.darkScrollIndicator]}
          {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
        >
          <ChevronRight 
            size={14} 
            color={isDark ? '#6B7280' : '#9CA3AF'} 
          />
        </View>
      </View>
      
      {/* Bottom hint text */}
      <View style={styles.hintContainer}>
        <Text 
          style={[styles.hintText, isDark && styles.darkHintText]}
          accessibilityLabel="Swipe left and right to see all categories"
          accessibilityRole="text"
        >
          ← Swipe to see all categories →
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  darkContainer: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 1,
  },
  scrollContainer: {
    position: 'relative',
  },
  scrollContent: {
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 4,
    borderRadius: 12,
    gap: 8,
  },
  darkTab: {
    backgroundColor: 'transparent',
  },
  darkActiveTab: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  darkIconContainer: {
    backgroundColor: '#374151',
  },
  darkActiveIconContainer: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  tabLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  scrollIndicator: {
    position: 'absolute',
    right: 8,
    top: '50%',
    transform: [{ translateY: -7 }],
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  darkScrollIndicator: {
    backgroundColor: 'rgba(31, 41, 55, 0.9)',
  },
  hintContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  darkHintText: {
    color: '#6B7280',
  },
});