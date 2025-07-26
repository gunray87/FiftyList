import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Platform, AccessibilityInfo } from 'react-native';
import { Trash2, Star } from 'lucide-react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Book, Movie } from '@/types';

interface ItemCardProps {
  item: Book | Movie;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  isBook: boolean;
  primaryColor: string;
  isDark?: boolean;
  backgroundColor?: string;
}

export default function ItemCard({ item, index, onEdit, onDelete, isBook, primaryColor, isDark = false, backgroundColor }: ItemCardProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeThreshold = -80; // How far to swipe to reveal delete
  const deleteThreshold = -120; // How far to swipe to auto-delete

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getFormatBadge = () => {
    if (!item.format) return null;
    
    const formatConfig = isBook ? {
      text: { label: 'H', color: '#F59E0B', fullName: 'Hardcopy' },
      audio: { label: 'A', color: '#10B981', fullName: 'Audiobook' },
      ebook: { label: 'E', color: '#3B82F6', fullName: 'E-book' },
    } : {
      streaming: { label: 'S', color: '#3B82F6', fullName: 'Streaming' },
      theater: { label: 'T', color: '#8B5CF6', fullName: 'Theater' },
      bluray: { label: 'B', color: '#10B981', fullName: 'Blu-ray' },
      dvd: { label: 'D', color: '#EF4444', fullName: 'DVD' },
    };

    const config = formatConfig[item.format as keyof typeof formatConfig];
    if (!config) return null;

    return (
      <View 
        style={[styles.formatBadge, { borderColor: config.color }]}
        accessibilityLabel={`Format: ${config.fullName}`}
        accessibilityRole="text"
      >
        <Text style={[styles.formatText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>
    );
  };

  const renderStars = () => {
    if (!item.rating) return null;
    
    return (
      <View 
        style={styles.starsContainer}
        accessibilityLabel={`Rating: ${item.rating} out of 5 stars`}
        accessibilityRole="text"
      >
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            size={10}
            color={star <= item.rating! ? '#F59E0B' : (isDark ? '#4B5563' : '#E5E7EB')}
            fill={star <= item.rating! ? '#F59E0B' : 'transparent'}
            {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
          />
        ))}
      </View>
    );
  };

  const renderProgress = () => {
    if (!item.percentage || item.percentage >= 100) return null;
    
    return (
      <View 
        style={styles.progressContainer}
        accessibilityLabel={`Progress: ${item.percentage} percent complete`}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: item.percentage }}
      >
        <View style={[styles.progressTrack, isDark && styles.darkProgressTrack]}>
          <View 
            style={[
              styles.progressFill, 
              { 
                width: `${item.percentage}%`,
                backgroundColor: primaryColor 
              }
            ]} 
          />
        </View>
        <Text style={[styles.progressText, isDark && styles.darkSecondaryText]}>{item.percentage}%</Text>
      </View>
    );
  };

  // Generate comprehensive accessibility label
  const getAccessibilityLabel = () => {
    const itemType = isBook ? 'book' : 'movie';
    const position = item.category === 'allTime' ? `number ${index + 1} favorite` : `number ${index + 1}`;
    const rating = item.rating ? `, rated ${item.rating} out of 5 stars` : '';
    const progress = item.percentage && item.percentage < 100 ? `, ${item.percentage} percent complete` : '';
    const format = item.format ? `, format: ${item.format}` : '';
    const completedDate = item.completedDate ? `, completed on ${formatDate(item.completedDate)}` : '';
    const allTime = item.isAllTime ? ', marked as all-time favorite' : '';
    const notes = item.notes ? `, notes: ${item.notes}` : '';
    
    return `${position} ${itemType}: ${item.title} by ${item.author}${rating}${progress}${format}${completedDate}${allTime}${notes}`;
  };

  const getAccessibilityHint = () => {
    if (Platform.OS === 'web') {
      return 'Tap to edit, or use the delete button to remove this item';
    }
    return 'Tap to edit. Swipe left to reveal delete option, or swipe far left to delete immediately';
  };

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { 
      useNativeDriver: true,
      listener: (event: any) => {
        // Prevent swiping to the right (positive values)
        if (event.nativeEvent.translationX > 0) {
          translateX.setValue(0);
        }
      }
    }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationX } = event.nativeEvent;
      
      // If swiped far enough to auto-delete
      if (translationX < deleteThreshold) {
        // Animate to delete position and trigger delete
        Animated.timing(translateX, {
          toValue: -300,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          handleDelete();
        });
      }
      // If swiped enough to show delete button
      else if (translationX < swipeThreshold) {
        // Snap to delete button position
        Animated.spring(translateX, {
          toValue: swipeThreshold,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
        
        // Announce to screen reader that delete option is available
        AccessibilityInfo.announceForAccessibility('Delete option revealed. Double tap the delete button to remove this item.');
      }
      // If not swiped enough, snap back
      else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }).start();
      }
    }
  };

  const handleTap = () => {
    // Reset swipe position and trigger edit
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
    
    // Announce action to screen reader
    AccessibilityInfo.announceForAccessibility(`Opening edit form for ${item.title}`);
    onEdit();
  };

  const handleDelete = () => {
    // Reset position first
    translateX.setValue(0);
    
    Alert.alert(
      `Delete ${isBook ? 'Book' : 'Movie'}`,
      `Are you sure you want to delete "${item.title}"?`,
      [
        { 
          text: 'Cancel', 
          style: 'cancel',
          onPress: () => {
            // Reset position if cancelled
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
              tension: 100,
              friction: 8,
            }).start();
            AccessibilityInfo.announceForAccessibility('Delete cancelled');
          }
        },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => {
            AccessibilityInfo.announceForAccessibility(`${item.title} deleted`);
            onDelete();
          }
        },
      ]
    );
  };

  const handleDeleteButtonPress = () => {
    handleDelete();
  };

  // For web platform, use simple touch handlers instead of gesture handler
  if (Platform.OS === 'web') {
    return (
      <View style={[
        styles.container, 
        isDark && styles.darkContainer,
        backgroundColor && { backgroundColor }
      ]}>
        <TouchableOpacity 
          style={styles.touchableContent}
          onPress={handleTap}
          activeOpacity={0.95}
          accessibilityRole="listitem"
          accessibilityLabel={getAccessibilityLabel()}
          accessibilityHint={getAccessibilityHint()}
          accessibilityActions={[
            { name: 'activate', label: 'Edit item' },
            { name: 'longpress', label: 'Delete item' }
          ]}
          onAccessibilityAction={(event) => {
            switch (event.nativeEvent.actionName) {
              case 'activate':
                handleTap();
                break;
              case 'longpress':
                handleDelete();
                break;
            }
          }}
        >
          <View style={styles.content}>
            {/* Left side: Index and main content */}
            <View style={styles.mainContent}>
              <View style={styles.indexContainer}>
                <Text 
                  style={[styles.index, { color: primaryColor }]}
                  {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                >
                  {index + 1}
                </Text>
              </View>
              
              <View style={styles.details}>
                {/* Title and Author row */}
                <View style={styles.titleAuthorRow}>
                  <Text 
                    style={[styles.title, isDark && styles.darkText]} 
                    numberOfLines={1}
                    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                  >
                    {item.title}
                  </Text>
                  <Text 
                    style={[styles.authorSeparator, isDark && styles.darkSecondaryText]}
                    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                  >
                    {' by '}
                  </Text>
                  <Text 
                    style={[styles.author, isDark && styles.darkSecondaryText]} 
                    numberOfLines={1}
                    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                  >
                    {item.author}
                  </Text>
                  {item.isAllTime && (
                    <View 
                      style={styles.allTimeBadge}
                      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                    >
                      <Star size={8} color="#F59E0B" fill="#F59E0B" />
                    </View>
                  )}
                </View>
                
                {/* Meta row: Format, Rating, Date */}
                <View style={styles.metaRow}>
                  {getFormatBadge()}
                  {renderStars()}
                  {item.completedDate && (
                    <Text 
                      style={[styles.completedDate, isDark && styles.darkTertiaryText]}
                      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                    >
                      {formatDate(item.completedDate)}
                    </Text>
                  )}
                </View>
                
                {/* Progress bar if applicable */}
                {renderProgress()}
                
                {/* Notes if present */}
                {item.notes && (
                  <Text 
                    style={[styles.notes, isDark && styles.darkTertiaryText]} 
                    numberOfLines={1}
                    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                  >
                    {item.notes}
                  </Text>
                )}
              </View>
            </View>
            
            {/* Web-specific actions */}
            <View style={styles.webActions}>
              <TouchableOpacity 
                style={styles.editButton} 
                onPress={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.title}`}
                accessibilityHint="Opens the edit form for this item"
              >
                <Text style={[styles.editText, isDark && styles.darkEditText]}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.deleteButton} 
                onPress={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
                accessibilityHint="Removes this item from your list"
              >
                <Trash2 size={14} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[
      styles.container, 
      isDark && styles.darkContainer,
      backgroundColor && { backgroundColor }
    ]}>
      {/* Delete button background - positioned behind the card */}
      <Animated.View 
        style={[
          styles.deleteBackground,
          {
            opacity: translateX.interpolate({
              inputRange: [swipeThreshold, 0],
              outputRange: [1, 0],
              extrapolate: 'clamp',
            }),
          }
        ]}
      >
        <TouchableOpacity 
          style={styles.deleteButtonContainer}
          onPress={handleDeleteButtonPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.title}`}
          accessibilityHint="Removes this item from your list"
        >
          <Trash2 size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Main card content with pan gesture */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-20, 20]}
      >
        <Animated.View 
          style={[
            styles.cardContent,
            {
              transform: [{ translateX }]
            }
          ]}
        >
          <TouchableOpacity 
            style={styles.touchableContent}
            onPress={handleTap}
            activeOpacity={0.95}
            accessibilityRole="button"
            accessibilityLabel={getAccessibilityLabel()}
            accessibilityHint={getAccessibilityHint()}
            accessibilityActions={[
              { name: 'activate', label: 'Edit item' },
              { name: 'longpress', label: 'Delete item' }
            ]}
            onAccessibilityAction={(event) => {
              switch (event.nativeEvent.actionName) {
                case 'activate':
                  handleTap();
                  break;
                case 'longpress':
                  handleDelete();
                  break;
              }
            }}
          >
            <View style={styles.content}>
              {/* Left side: Index and main content */}
              <View style={styles.mainContent}>
                <View style={styles.indexContainer}>
                  <Text 
                    style={[styles.index, { color: primaryColor }]}
                    {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                  >
                    {index + 1}
                  </Text>
                </View>
                
                <View style={styles.details}>
                  {/* Title and Author row */}
                  <View style={styles.titleAuthorRow}>
                    <Text 
                      style={[styles.title, isDark && styles.darkText]} 
                      numberOfLines={1}
                      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                    >
                      {item.title}
                    </Text>
                    <Text 
                      style={[styles.authorSeparator, isDark && styles.darkSecondaryText]}
                      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                    >
                      {' by '}
                    </Text>
                    <Text 
                      style={[styles.author, isDark && styles.darkSecondaryText]} 
                      numberOfLines={1}
                      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                    >
                      {item.author}
                    </Text>
                    {item.isAllTime && (
                      <View 
                        style={styles.allTimeBadge}
                        {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                      >
                        <Star size={8} color="#F59E0B" fill="#F59E0B" />
                      </View>
                    )}
                  </View>
                  
                  {/* Meta row: Format, Rating, Date */}
                  <View style={styles.metaRow}>
                    {getFormatBadge()}
                    {renderStars()}
                    {item.completedDate && (
                      <Text 
                        style={[styles.completedDate, isDark && styles.darkTertiaryText]}
                        {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                      >
                        {formatDate(item.completedDate)}
                      </Text>
                    )}
                  </View>
                  
                  {/* Progress bar if applicable */}
                  {renderProgress()}
                  
                  {/* Notes if present */}
                  {item.notes && (
                    <Text 
                      style={[styles.notes, isDark && styles.darkTertiaryText]} 
                      numberOfLines={1}
                      {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
                    >
                      {item.notes}
                    </Text>
                  )}
                </View>
              </View>
              
              {/* Swipe indicator */}
              <View 
                style={styles.swipeIndicator}
                {...(Platform.OS === 'web' ? { 'aria-hidden': true } : { accessibilityElementsHidden: true, importantForAccessibility: 'no' })}
              >
                <View style={[styles.swipeHint, isDark && styles.darkSwipeHint]} />
                <View style={[styles.swipeHint, isDark && styles.darkSwipeHint]} />
                <View style={[styles.swipeHint, isDark && styles.darkSwipeHint]} />
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  darkContainer: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 0.5,
  },
  deleteBackground: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 120,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  deleteButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 12,
    width: '100%',
    height: '100%',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  cardContent: {
    backgroundColor: 'inherit',
    zIndex: 2,
    position: 'relative',
  },
  touchableContent: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'flex-start',
    backgroundColor: 'inherit',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  indexContainer: {
    width: 20,
    alignItems: 'center',
    marginRight: 10,
    paddingTop: 2,
  },
  index: {
    fontSize: 12,
    fontFamily: 'Inter-SemiBold',
  },
  details: {
    flex: 1,
    gap: 3,
  },
  titleAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#111827',
    lineHeight: 18,
    flexShrink: 1,
  },
  darkText: {
    color: '#FFFFFF',
  },
  authorSeparator: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 16,
    flexShrink: 0,
  },
  author: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#6B7280',
    lineHeight: 16,
    flexShrink: 1,
  },
  darkSecondaryText: {
    color: '#D1D5DB',
  },
  allTimeBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  formatBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  formatText: {
    fontSize: 9,
    fontFamily: 'Inter-SemiBold',
    lineHeight: 12,
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 1,
  },
  completedDate: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    lineHeight: 12,
  },
  darkTertiaryText: {
    color: '#9CA3AF',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    backgroundColor: '#F3F4F6',
    borderRadius: 1.5,
  },
  darkProgressTrack: {
    backgroundColor: '#374151',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  progressText: {
    fontSize: 10,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
    lineHeight: 12,
  },
  notes: {
    fontSize: 10,
    fontFamily: 'Inter-Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
    lineHeight: 14,
  },
  swipeIndicator: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginLeft: 8,
    paddingVertical: 8,
  },
  swipeHint: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#D1D5DB',
    opacity: 0.5,
  },
  darkSwipeHint: {
    backgroundColor: '#6B7280',
  },
  // Web-specific styles
  webActions: {
    marginLeft: 8,
    justifyContent: 'center',
    gap: 8,
  },
  editButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#6B7280',
  },
  darkEditText: {
    color: '#9CA3AF',
  },
  deleteButton: {
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});