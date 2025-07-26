import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Dimensions,
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
  color: string;
  position?: 'top' | 'center' | 'bottom';
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to FiftyList!',
    description: 'Your personal companion for tracking books and movies. Set goals, organize your lists, and discover your reading and watching patterns.',
    icon: Star,
    color: '#D97706',
    position: 'center'
  },
  {
    id: 'goals',
    title: 'Set Your Goals',
    description: 'Start by setting yearly goals for books and movies. Track your progress throughout the year with beautiful visualizations.',
    icon: Target,
    color: '#10B981',
    position: 'top'
  },
  {
    id: 'add-items',
    title: 'Add Your First Items',
    description: 'Tap the + button to add books and movies. Organize them into categories: completed, reading/watching, planned, or stopped.',
    icon: Plus,
    color: '#3B82F6',
    position: 'top'
  },
  {
    id: 'categories',
    title: 'Organize Everything',
    description: 'Switch between categories to see your completed items, current reads, wishlist, and all-time favorites.',
    icon: BookOpen,
    color: '#F59E0B',
    position: 'center'
  },
  {
    id: 'search',
    title: 'Find Anything Fast',
    description: 'Use the search bar to quickly find any book or movie in your collection by title, author, or notes.',
    icon: Search,
    color: '#EF4444',
    position: 'top'
  },
  {
    id: 'suggestions',
    title: 'Discover New Content',
    description: 'Get AI-powered suggestions based on your reading and watching history. Find your next favorite book or movie!',
    icon: Sparkles,
    color: '#8B5CF6',
    position: 'bottom'
  },
  {
    id: 'stats',
    title: 'Track Your Progress',
    description: 'View detailed statistics, yearly breakdowns, and insights about your reading and watching habits.',
    icon: TrendingUp,
    color: '#06B6D4',
    position: 'bottom'
  },
  {
    id: 'settings',
    title: 'Export & Import',
    description: 'Access settings to export your data for backup or import from other sources. Your data stays private on your device.',
    icon: Settings,
    color: '#78716C',
    position: 'top'
  }
];

export default function WelcomeTour({ visible, onComplete }: WelcomeTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

  const screenHeight = Dimensions.get('window').height;
  const screenWidth = Dimensions.get('window').width;

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      startAnimation();
    }
  }, [visible]);

  const startAnimation = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      })
    ]).start();
  };

  const animateStepChange = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 30,
        duration: 200,
        useNativeDriver: true,
      })
    ]).start(() => {
      callback();
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
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
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 300,
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

  const getContentPosition = () => {
    switch (step.position) {
      case 'top':
        return { justifyContent: 'flex-start', paddingTop: screenHeight * 0.15 };
      case 'bottom':
        return { justifyContent: 'flex-end', paddingBottom: screenHeight * 0.15 };
      default:
        return { justifyContent: 'center' };
    }
  };

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
        {/* Background with warm gradient */}
        <View style={styles.backgroundGradient} />
        
        {/* Skip button */}
        <TouchableOpacity 
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
        >
          <X size={20} color="#78716C" />
        </TouchableOpacity>

        {/* Main content */}
        <Animated.View 
          style={[
            styles.container,
            getContentPosition(),
            {
              opacity: fadeAnim,
              transform: [
                { translateY: slideAnim },
                { scale: scaleAnim }
              ]
            }
          ]}
        >
          {/* Card container */}
          <View style={styles.card}>
            {/* Icon */}
            <View style={[styles.iconContainer, { backgroundColor: `${step.color}15` }]}>
              <View style={[styles.iconInner, { backgroundColor: step.color }]}>
                <IconComponent size={28} color="#FFFFFF" />
              </View>
            </View>

            {/* Content */}
            <View style={styles.content}>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.description}>{step.description}</Text>
            </View>

            {/* Progress indicator */}
            <View style={styles.progressContainer}>
              <View style={styles.progressTrack}>
                <Animated.View 
                  style={[
                    styles.progressFill,
                    { 
                      width: `${progress}%`,
                      backgroundColor: step.color
                    }
                  ]} 
                />
              </View>
              <Text style={styles.progressText}>
                {currentStep + 1} of {tourSteps.length}
              </Text>
            </View>

            {/* Fixed Navigation Area - Consistent positioning */}
            <View style={styles.fixedNavigationArea}>
              {/* Navigation buttons container with consistent layout */}
              <View style={styles.navigationContainer}>
                {/* Previous button - consistent positioning */}
                <TouchableOpacity 
                  style={[
                    styles.navButton, 
                    styles.previousButton,
                    currentStep === 0 && styles.invisibleButton
                  ]}
                  onPress={handlePrevious}
                  disabled={currentStep === 0}
                  accessibilityRole="button"
                  accessibilityLabel="Previous step"
                >
                  <Text style={[
                    styles.previousButtonText,
                    currentStep === 0 && styles.invisibleText
                  ]}>
                    Previous
                  </Text>
                </TouchableOpacity>
                
                {/* Next button - always in the same position */}
                <TouchableOpacity 
                  style={[styles.navButton, styles.nextButton, { backgroundColor: step.color }]}
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

              {/* Step indicators - centered and consistent */}
              <View style={styles.stepIndicators}>
                {tourSteps.map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.stepDot,
                      {
                        backgroundColor: index === currentStep 
                          ? step.color 
                          : '#D6C7A8',
                        transform: [{ scale: index === currentStep ? 1.2 : 1 }]
                      }
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Decorative elements with warm colors */}
        <View style={[styles.decorativeCircle, styles.circle1]} />
        <View style={[styles.decorativeCircle, styles.circle2]} />
        <View style={[styles.decorativeCircle, styles.circle3]} />
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
  backgroundGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1A1611',
    opacity: 0.98,
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
  container: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  card: {
    backgroundColor: '#F5F1E8',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
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
  content: {
    alignItems: 'center',
    marginBottom: 32,
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
  // Fixed navigation area with consistent positioning
  fixedNavigationArea: {
    width: '100%',
    height: 80, // Fixed height to prevent layout shifts
    justifyContent: 'space-between',
  },
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 44, // Fixed height for button area
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    gap: 6,
    height: 44, // Fixed height for consistent button size
    minWidth: 100, // Consistent minimum width for both buttons
    justifyContent: 'center', // Center content within buttons
  },
  previousButton: {
    backgroundColor: '#E8DCC0',
    borderWidth: 1,
    borderColor: '#D6C7A8',
  },
  // Invisible button maintains layout but is not visible/interactive
  invisibleButton: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  nextButton: {
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
  // Invisible text maintains button size but is not visible
  invisibleText: {
    color: 'transparent',
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
    height: 20, // Fixed height for indicators
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    transition: 'all 0.3s ease',
  },
  decorativeCircle: {
    position: 'absolute',
    borderRadius: 1000,
    backgroundColor: 'rgba(214, 181, 136, 0.08)',
  },
  circle1: {
    width: 200,
    height: 200,
    top: '10%',
    right: '-10%',
  },
  circle2: {
    width: 150,
    height: 150,
    bottom: '20%',
    left: '-8%',
  },
  circle3: {
    width: 100,
    height: 100,
    top: '30%',
    left: '10%',
  },
});