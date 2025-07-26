import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, Dimensions, AccessibilityInfo, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { TrendingUp, ChevronUp, ChartBar as BarChart3 } from 'lucide-react-native';

interface GoalProgressProps {
  completed: number;
  goal: number;
  year: number;
  onEditGoal: () => void;
  primaryColor: string;
  secondaryColor: string;
  isDark?: boolean;
  backgroundColor?: string;
  completedItems?: Array<{ completedDate?: string; year: number }>;
  selectedYear?: number | 'all';
  showGoalTable?: boolean;
}

export default function GoalProgress({ 
  completed, 
  goal, 
  year, 
  onEditGoal, 
  primaryColor, 
  secondaryColor, 
  isDark = false, 
  backgroundColor,
  completedItems = [],
  selectedYear,
  showGoalTable = true
}: GoalProgressProps) {
  const [expandLevel, setExpandLevel] = useState<'collapsed' | 'basic' | 'detailed'>('collapsed');
  const [basicAnimation] = useState(new Animated.Value(0));
  const [detailedAnimation] = useState(new Animated.Value(0));
  
  const currentYear = new Date().getFullYear();
  const isCurrentYear = selectedYear === currentYear;
  const isSpecificYear = typeof selectedYear === 'number';
  
  // Calculate data for the selected year using completion date
  const yearToShow = isSpecificYear ? selectedYear : currentYear;
  
  // Helper function to get completion year from an item
  const getCompletionYear = (item: { completedDate?: string; year: number }): number | null => {
    if (!item.completedDate) return null;
    const date = new Date(item.completedDate);
    return date.getFullYear();
  };
  
  // Count completed items by completion year (not publication/release year)
  const completedForYear = completedItems.filter(item => {
    const completionYear = getCompletionYear(item);
    return completionYear === yearToShow;
  }).length;
  
  // Only show goal table if:
  // 1. showGoalTable is true AND
  // 2. Either we're showing current year OR we have data for the selected past year
  const shouldShowGoalTable = showGoalTable && (
    isCurrentYear || 
    (isSpecificYear && completedForYear > 0)
  );
  
  const percentage = Math.min((completedForYear / goal) * 100, 100);
  const remaining = Math.max(goal - completedForYear, 0);
  const isOverGoal = completedForYear > goal;

  // Debug logging for validation - MOVED BEFORE CONDITIONAL RETURN
  React.useEffect(() => {
    console.log(`🎯 GoalProgress updated - Year: ${yearToShow}, Completed: ${completedForYear}, Goal: ${goal}, Progress: ${Math.round(percentage)}%`);
  }, [completedForYear, goal, percentage, yearToShow]);

  // Early return AFTER all hooks have been called
  if (!shouldShowGoalTable) {
    return null;
  }

  // Calculate monthly data for the graph using completion dates
  const getMonthlyData = () => {
    const monthlyData = Array(12).fill(0);
    
    // Filter items for the year being displayed and count by completion month
    completedItems
      .filter(item => {
        const completionYear = getCompletionYear(item);
        return completionYear === yearToShow && item.completedDate;
      })
      .forEach(item => {
        const date = new Date(item.completedDate!);
        const month = date.getMonth();
        monthlyData[month]++;
      });

    // Convert to cumulative data
    const cumulativeData = [];
    let cumulative = 0;
    for (let i = 0; i < 12; i++) {
      cumulative += monthlyData[i];
      cumulativeData.push(cumulative);
    }

    return cumulativeData;
  };

  const handleExpand = () => {
    let newLevel: 'collapsed' | 'basic' | 'detailed';
    let announcement = '';

    if (expandLevel === 'collapsed') {
      newLevel = 'basic';
      announcement = 'Goal progress expanded to show basic statistics';
      Animated.timing(basicAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else if (expandLevel === 'basic') {
      newLevel = 'detailed';
      announcement = 'Goal progress expanded to show detailed timeline and graph';
      Animated.timing(detailedAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      newLevel = 'collapsed';
      announcement = 'Goal progress collapsed to minimal view';
      Animated.parallel([
        Animated.timing(basicAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(detailedAnimation, {
          toValue: 0,
          duration: 300,
          useNativeDriver: false,
        })
      ]).start();
    }

    setExpandLevel(newLevel);
    AccessibilityInfo.announceForAccessibility(announcement);
  };

  const renderDetailedGraph = () => {
    const monthlyData = getMonthlyData();
    const screenWidth = Dimensions.get('window').width;
    const graphWidth = screenWidth - 80; // Account for padding
    const graphHeight = 120;
    const maxValue = Math.max(goal, Math.max(...monthlyData));
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const displayMonth = isCurrentYear ? currentMonth : 11; // Show full year for past years
    
    // Calculate points for the line
    const points = monthlyData.map((value, index) => {
      const x = (index / 11) * graphWidth;
      const y = graphHeight - (value / maxValue) * graphHeight;
      return { x, y, value, month: months[index] };
    });

    // Goal line Y position
    const goalY = graphHeight - (goal / maxValue) * graphHeight;

    return (
      <Animated.View style={[
        styles.detailedContainer,
        {
          height: detailedAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 220],
          }),
          opacity: detailedAnimation,
        }
      ]}>
        <View style={styles.detailedHeader}>
          <BarChart3 size={16} color={primaryColor} />
          <Text style={[styles.detailedTitle, isDark && styles.darkText]}>
            {yearToShow} Progress Timeline
            {!isCurrentYear && (
              <Text style={[styles.pastYearIndicator, isDark && styles.darkSecondaryText]}>
                {' (Historical)'}
              </Text>
            )}
          </Text>
        </View>
        
        <View 
          style={[styles.graph, { width: graphWidth, height: graphHeight }]}
          accessibilityRole="image"
          accessibilityLabel={`Progress graph for ${yearToShow}. Current progress: ${completedForYear} out of ${goal} goal. ${Math.round(percentage)}% complete.`}
        >
          {/* Goal line */}
          <View 
            style={[
              styles.goalLine, 
              { 
                top: goalY,
                backgroundColor: isDark ? '#4B5563' : '#E5E7EB'
              }
            ]} 
          />
          <Text 
            style={[
              styles.goalLineLabel, 
              { 
                top: goalY - 10,
                color: isDark ? '#9CA3AF' : '#6B7280'
              }
            ]}
            {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
          >
            Goal: {goal}
          </Text>

          {/* Progress line */}
          <View style={styles.lineContainer}>
            {points.slice(0, displayMonth + 1).map((point, index) => {
              if (index === 0) return null;
              
              const prevPoint = points[index - 1];
              const lineWidth = Math.sqrt(
                Math.pow(point.x - prevPoint.x, 2) + Math.pow(point.y - prevPoint.y, 2)
              );
              const angle = Math.atan2(point.y - prevPoint.y, point.x - prevPoint.x) * (180 / Math.PI);
              
              return (
                <View
                  key={index}
                  style={[
                    styles.lineSegment,
                    {
                      left: prevPoint.x,
                      top: prevPoint.y,
                      width: lineWidth,
                      backgroundColor: primaryColor,
                      transform: [{ rotate: `${angle}deg` }],
                    }
                  ]}
                />
              );
            })}
          </View>

          {/* Data points */}
          {points.slice(0, displayMonth + 1).map((point, index) => (
            <View key={index}>
              <View
                style={[
                  styles.dataPoint,
                  {
                    left: point.x - 3,
                    top: point.y - 3,
                    backgroundColor: primaryColor,
                  }
                ]}
              />
              {/* Month labels */}
              <Text
                style={[
                  styles.monthLabel,
                  {
                    left: point.x - 15,
                    top: graphHeight + 5,
                    color: isDark ? '#9CA3AF' : '#6B7280'
                  }
                ]}
                {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
              >
                {point.month}
              </Text>
              {/* Value labels for significant points */}
              {(index === displayMonth || point.value > 0) && (
                <Text
                  style={[
                    styles.valueLabel,
                    {
                      left: point.x - 8,
                      top: point.y - 20,
                      color: primaryColor
                    }
                  ]}
                  {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                >
                  {point.value}
                </Text>
              )}
            </View>
          ))}
        </View>

        {/* Graph stats */}
        <View 
          style={styles.graphStats}
          accessibilityRole="summary"
          accessibilityLabel={`Statistics: This month ${isCurrentYear ? (monthlyData[currentMonth] || 0) : monthlyData[11]}, Average per month ${isCurrentYear 
            ? Math.round((completedForYear / (currentMonth + 1)) * 10) / 10
            : Math.round((completedForYear / 12) * 10) / 10}, Versus goal ${isOverGoal ? '+' : ''}${completedForYear - goal}`}
        >
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: primaryColor }]}>
              {isCurrentYear ? (monthlyData[currentMonth] || 0) : monthlyData[11]}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.darkSecondaryText]}>
              {isCurrentYear ? 'This Month' : 'Final Month'}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: primaryColor }]}>
              {isCurrentYear 
                ? Math.round((completedForYear / (currentMonth + 1)) * 10) / 10
                : Math.round((completedForYear / 12) * 10) / 10
              }
            </Text>
            <Text style={[styles.statLabel, isDark && styles.darkSecondaryText]}>
              Avg/Month
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: isOverGoal ? '#10B981' : primaryColor }]}>
              {isOverGoal ? '+' : ''}{completedForYear - goal}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.darkSecondaryText]}>
              vs Goal
            </Text>
          </View>
        </View>
      </Animated.View>
    );
  };

  const getExpandIcon = () => {
    if (expandLevel === 'collapsed') {
      return null; // No icon for collapsed state
    } else if (expandLevel === 'basic') {
      return <BarChart3 size={14} color={primaryColor} />;
    } else {
      return <ChevronUp size={14} color={primaryColor} />;
    }
  };

  const getExpandText = () => {
    if (expandLevel === 'collapsed') {
      return 'Tap to expand';
    } else if (expandLevel === 'basic') {
      return 'Tap for details';
    } else {
      return 'Tap to collapse';
    }
  };

  return (
    <View 
      style={[
        styles.container, 
        isDark && styles.darkContainer,
        backgroundColor && { backgroundColor },
        expandLevel !== 'collapsed' && styles.expandedContainer
      ]}
    >
      {/* Minimalist header - always visible */}
      <TouchableOpacity 
        style={styles.compactHeader}
        onPress={handleExpand}
        accessibilityRole="button"
        accessibilityLabel={`Goal progress: ${completedForYear} of ${goal} completed, ${Math.round(percentage)}% progress${!isCurrentYear ? ` for ${yearToShow}` : ` for ${yearToShow}`}. ${expandLevel === 'collapsed' ? 'Expandable for more details' : 'Tap to change view level'}`}
        accessibilityHint={expandLevel === 'collapsed' ? 'Double tap to expand and see basic statistics' : expandLevel === 'basic' ? 'Double tap to see detailed timeline graph' : 'Double tap to collapse to minimal view'}
        accessibilityState={{ expanded: expandLevel !== 'collapsed' }}
      >
        <View style={styles.leftContent}>
          <View style={styles.numbersRow}>
            <Text 
              style={[styles.currentNumber, { color: primaryColor }]}
              {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
            >
              {completedForYear}
            </Text>
            <Text 
              style={[styles.separator, isDark && styles.darkSecondaryText]}
              {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
            >
              /
            </Text>
            <Text 
              style={[styles.goalNumber, isDark && styles.darkSecondaryText]}
              {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
            >
              {goal}
            </Text>
          </View>
          <Text 
            style={[styles.yearLabel, isDark && styles.darkSecondaryText]}
            {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
          >
            {yearToShow} Goal
            {!isCurrentYear && ' (Historical)'}
          </Text>
        </View>
        
        <View style={styles.rightContent}>
          <Text 
            style={[styles.percentageText, { color: primaryColor }]}
            {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
          >
            {Math.round(percentage)}%
          </Text>
          <View style={styles.actionRow}>
            {/* Edit text - only for current year */}
            {isCurrentYear && (
              <Pressable 
                onPress={(e) => {
                  e.stopPropagation();
                  onEditGoal();
                }} 
                style={styles.editButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="link"
                accessibilityLabel="Edit goal"
                accessibilityHint={`Change your goal from ${goal} items`}
              >
                <Text style={[styles.editText, isDark && styles.darkEditText]}>
                  edit
                </Text>
              </Pressable>
            )}
            {/* Expand indicator */}
            <View style={styles.expandIndicator}>
              {getExpandIcon()}
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {/* Compact progress bar - always visible */}
      <View 
        style={styles.progressBarContainer}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: goal, now: completedForYear }}
        accessibilityLabel={`Progress bar showing ${completedForYear} of ${goal} completed`}
      >
        <View style={[styles.progressTrack, isDark && styles.darkProgressTrack]}>
          <LinearGradient
            colors={isOverGoal ? ['#10B981', '#059669'] : [primaryColor, secondaryColor]}
            style={[styles.progressFill, { width: `${percentage}%` }]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          />
        </View>
      </View>

      {/* Expand hint - only when collapsed */}
      {expandLevel === 'collapsed' && (
        <TouchableOpacity 
          style={styles.expandHint}
          onPress={handleExpand}
          accessibilityRole="button"
          accessibilityLabel={getExpandText()}
          accessibilityHint="Expand to see more detailed statistics"
        >
          <Text 
            style={[styles.expandHintText, isDark && styles.darkTertiaryText]}
          >
            {getExpandText()}
          </Text>
        </TouchableOpacity>
      )}

      {/* Basic expanded content */}
      <Animated.View style={[
        styles.basicContainer,
        {
          height: basicAnimation.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 60],
          }),
          opacity: basicAnimation,
        }
      ]}>
        <View 
          style={styles.basicStats}
          accessibilityRole="summary"
          accessibilityLabel={`Basic statistics: ${completedForYear >= goal ? (isCurrentYear ? 'Goal achieved!' : 'Goal was achieved!') : `${remaining} ${isCurrentYear ? 'to go' : 'short of goal'}`}, Average per month ${isCurrentYear 
            ? Math.round((completedForYear / (new Date().getMonth() + 1)) * 10) / 10
            : Math.round((completedForYear / 12) * 10) / 10}`}
        >
          <View style={styles.basicStatItem}>
            <Text style={[styles.basicStatValue, { color: primaryColor }]}>
              {completedForYear >= goal ? '🎉' : remaining}
            </Text>
            <Text style={[styles.basicStatLabel, isDark && styles.darkSecondaryText]}>
              {completedForYear >= goal 
                ? (isCurrentYear ? 'Goal achieved!' : 'Goal was achieved!') 
                : (isCurrentYear ? 'to go' : 'short of goal')
              }
            </Text>
          </View>
          
          <View style={styles.basicStatItem}>
            <Text style={[styles.basicStatValue, { color: primaryColor }]}>
              {isCurrentYear 
                ? Math.round((completedForYear / (new Date().getMonth() + 1)) * 10) / 10
                : Math.round((completedForYear / 12) * 10) / 10
              }
            </Text>
            <Text style={[styles.basicStatLabel, isDark && styles.darkSecondaryText]}>
              avg/month
            </Text>
          </View>

          <TouchableOpacity 
            onPress={(e) => {
              e.stopPropagation();
              handleExpand();
            }}
            style={styles.detailsButton}
            accessibilityRole="button"
            accessibilityLabel={getExpandText()}
            accessibilityHint="Show more detailed statistics and timeline"
          >
            <Text style={[styles.detailsButtonText, { color: primaryColor }]}>
              {getExpandText()}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Detailed expanded content */}
      {renderDetailedGraph()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  darkContainer: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
  },
  expandedContainer: {
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  leftContent: {
    flex: 1,
  },
  numbersRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  currentNumber: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  separator: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    marginHorizontal: 3,
  },
  goalNumber: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
  },
  darkSecondaryText: {
    color: '#9CA3AF',
  },
  yearLabel: {
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    opacity: 0.8,
  },
  rightContent: {
    alignItems: 'flex-end',
    gap: 4,
  },
  percentageText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  editText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkEditText: {
    color: '#9CA3AF',
  },
  expandIndicator: {
    padding: 2,
  },
  progressBarContainer: {
    marginBottom: 6,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  darkProgressTrack: {
    backgroundColor: '#374151',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  expandHint: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  expandHintText: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    opacity: 0.7,
  },
  darkTertiaryText: {
    color: '#6B7280',
  },
  basicContainer: {
    overflow: 'hidden',
  },
  basicStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  basicStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  basicStatValue: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
    marginBottom: 2,
  },
  basicStatLabel: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
  detailsButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
  },
  detailsButtonText: {
    fontSize: 10,
    fontFamily: 'Inter-SemiBold',
  },
  detailedContainer: {
    overflow: 'hidden',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  detailedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  detailedTitle: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
  },
  darkText: {
    color: '#FFFFFF',
  },
  pastYearIndicator: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
  graph: {
    position: 'relative',
    marginBottom: 16,
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    opacity: 0.5,
  },
  goalLineLabel: {
    position: 'absolute',
    right: 0,
    fontSize: 9,
    fontFamily: 'Inter-Regular',
  },
  lineContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  lineSegment: {
    position: 'absolute',
    height: 2,
    transformOrigin: 'left center',
  },
  dataPoint: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  monthLabel: {
    position: 'absolute',
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    width: 30,
  },
  valueLabel: {
    position: 'absolute',
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    textAlign: 'center',
    width: 16,
  },
  graphStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  statItem: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 14,
    fontFamily: 'Inter-Bold',
  },
  statLabel: {
    fontSize: 9,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    textAlign: 'center',
  },
});