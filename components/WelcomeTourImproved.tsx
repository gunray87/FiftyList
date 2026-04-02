import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import {
  BookOpen,
  Film,
  Target,
  Plus,
  TrendingUp,
  Star,
  ArrowRight,
  X,
  Settings,
  Search,
  Sparkles
} from 'lucide-react-native';

interface WelcomeTourProps {
  visible: boolean;
  onComplete: () => void;
}

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
}

// Simplified tour steps - removed position property (always centered now)
const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to FiftyList!',
    description: 'Your personal companion for tracking books and movies. Set goals, organize your lists, and discover your reading and watching patterns.',
    icon: Star,
  },
  {
    id: 'goals',
    title: 'Set Your Goals',
    description: 'Start by setting yearly goals for books and movies. Track your progress throughout the year with beautiful visualizations.',
    icon: Target,
  },
  {
    id: 'add-items',
    title: 'Add Your First Items',
    description: 'Tap the + button to add books and movies. Organize them into categories: completed, reading/watching, planned, or stopped.',
    icon: Plus,
  },
  {
    id: 'categories',
    title: 'Organize Everything',
    description: 'Switch between categories to see your completed items, current reads, wishlist, and all-time favorites.',
    icon: BookOpen,
  },
  {
    id: 'search',
    title: 'Find Anything Fast',
    description: 'Use the search bar to quickly find any book or movie in your collection by title, author, or notes.',
    icon: Search,
  },
  {
    id: 'suggestions',
    title: 'Discover New Content',
    description: 'Get AI-powered suggestions based on your reading and watching history. Find your next favorite book or movie!',
    icon: Sparkles,
  },
  {
    id: 'stats',
    title: 'Track Your Progress',
    description: 'View detailed statistics, yearly breakdowns, and insights about your reading and watching habits.',
    icon: TrendingUp,
  },
  {
    id: 'settings',
    title: 'Export & Import',
    description: 'Access settings to export your data for backup or import from other sources. Your data stays private on your device.',
    icon: Settings,
  }
];

// Consistent accent color throughout tour
const ACCENT_COLOR = '#8B5CF6';

export default function WelcomeTourImproved({ visible, onComplete }: WelcomeTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Simplified animations - only fade and scale
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      startAnimation();
    }
  }, [visible]);

  // Simplified initial animation - removed slideAnim
  const startAnimation = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300, // Faster than before
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50, // Gentler spring
        friction: 7,
        useNativeDriver: true,
      })
    ]).start();
  };

  // Simplified step transition - crossfade only, faster
  const animateStepChange = (callback: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0.4, // Don't fully fade out
      duration: 120, // Much faster
      useNativeDriver: true,
    }).start(() => {
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      animateStepChange(() => setCurrentStep(currentStep + 1));
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      animateStepChange(() => setCurrentStep(currentStep - 1));
    }
  };

  const handleComplete = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.95,
        duration: 250,
        useNativeDriver: true,
      })
    ]).start(() => {
      setIsVisible(false);
      onComplete();
    });
  };

  const handleSkip = () => {
    handleComplete();
  };

  const step = tourSteps[currentStep];
  const IconComponent = step.icon;
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={handleComplete}
    >
      <View style={styles.overlay}>
        {/* Skip button */}
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
        >
          <X size={20} color="#78716C" />
        </TouchableOpacity>

        {/* Main content - ALWAYS CENTERED, no dynamic positioning */}
        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }] // Only scale, no translateY
            }
          ]}
        >
          {/* Card with fixed minimum height to prevent layout shifts */}
          <View style={styles.card}>
            {/* Icon - consistent styling */}
            <View style={styles.iconContainer}>
              <View style={[styles.iconInner, { backgroundColor: ACCENT_COLOR }]}>
                <IconComponent size={28} color="#FFFFFF" />
              </View>
            </View>

            {/* Content with fixed minimum height */}
            <View style={styles.content}>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.description}>{step.description}</Text>
            </View>

            {/* Progress indicator - single consistent color */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progress}%`,
                      backgroundColor: ACCENT_COLOR // Consistent color
                    }
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                {currentStep + 1} of {tourSteps.length}
              </Text>
            </View>

            {/* Fixed height navigation area - prevents layout shifts */}
            <View style={styles.fixedNavigationArea}>
              {/* Navigation buttons with stable layout */}
              <View style={styles.navigationContainer}>
                {/* Previous button - use opacity instead of conditional rendering */}
                <TouchableOpacity
                  style={[
                    styles.navButton,
                    styles.previousButton,
                    { opacity: currentStep === 0 ? 0 : 1 } // Inline opacity
                  ]}
                  onPress={handlePrevious}
                  disabled={currentStep === 0}
                  pointerEvents={currentStep === 0 ? 'none' : 'auto'}
                  accessibilityRole="button"
                  accessibilityLabel="Previous step"
                >
                  <Text style={styles.previousButtonText}>
                    Previous
                  </Text>
                </TouchableOpacity>

                {/* Next button - always visible, same position */}
                <TouchableOpacity
                  style={[styles.navButton, styles.nextButton]}
                  onPress={handleNext}
                  accessibilityRole="button"
                  accessibilityLabel={currentStep === tourSteps.length - 1 ? "Get started" : "Next step"}
                >
                  <Text style={styles.nextButtonText}>
                    {currentStep === tourSteps.length - 1 ? 'Get Started' : 'Next'}
                  </Text>
                  <ArrowRight size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              {/* Step indicators - consistent styling */}
              <View style={styles.stepIndicators}>
                {tourSteps.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.stepDot,
                      index === currentStep && styles.stepDotActive
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Simplified decorative elements - more subtle */}
        <View style={[styles.decorativeCircle, styles.circle1]} />
        <View style={[styles.decorativeCircle, styles.circle2]} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#1A1611',
    position: 'relative',
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F1E8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // FIXED: Always centered, no dynamic positioning
  container: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center', // Always center
  },
  // FIXED: Minimum height to prevent layout shifts
  card: {
    backgroundColor: '#F5F1E8',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    minHeight: 520, // Fixed minimum height
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E8DCC0',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: `${ACCENT_COLOR}15`,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  iconInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // FIXED: Minimum height to reserve space for varying content
  content: {
    alignItems: 'center',
    marginBottom: 32,
    minHeight: 140, // Reserve space
    justifyContent: 'center', // Center text vertically
  },
  title: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#44403C',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 30,
  },
  description: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: '#78716C',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 28,
    width: '100%',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#E8DCC0',
    borderRadius: 3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  progressText: {
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    color: '#A8A29E',
  },
  // FIXED: Fixed height navigation area
  fixedNavigationArea: {
    width: '100%',
    height: 80,
    justifyContent: 'space-between',
  },
  // FIXED: Stable layout with consistent button positioning
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 44,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 6,
    height: 44,
    minWidth: 100,
    justifyContent: 'center',
  },
  previousButton: {
    backgroundColor: '#E8DCC0',
    borderWidth: 1,
    borderColor: '#D6C7A8',
  },
  nextButton: {
    backgroundColor: ACCENT_COLOR,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  previousButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#78716C',
  },
  nextButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  stepIndicators: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 20,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D6C7A8',
  },
  stepDotActive: {
    backgroundColor: ACCENT_COLOR,
    transform: [{ scale: 1.2 }],
  },
  // Simplified decorative elements
  decorativeCircle: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'rgba(139, 92, 246, 0.05)', // Very subtle
  },
  circle1: {
    width: 180,
    height: 180,
    top: '12%',
    right: '-8%',
  },
  circle2: {
    width: 140,
    height: 140,
    bottom: '18%',
    left: '-6%',
  },
});
