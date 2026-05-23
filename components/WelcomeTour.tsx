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
import { Star, Film, Target, X, Sparkles, Check } from 'lucide-react-native';

/** Matches Books screen primary amber (`#D97706`) for continuity with the rest of the app. */
const AMBER_PRIMARY = '#D97706';
const AMBER_ICON_RING = 'rgba(217, 119, 6, 0.15)';
const SAND_BACKDROP = '#E8D9C0';
const DOT_ACTIVE = AMBER_PRIMARY;
const DOT_INACTIVE = '#C8B89A';
const PREVIOUS_BG = '#EDE8D0';
const PREVIOUS_BORDER = '#C8B89A';
const PREVIOUS_LABEL = '#44403C';
const SKIP_BORDER = '#D6C7A8';
const SKIP_ICON = '#78716C';

interface WelcomeTourProps {
  visible: boolean;
  onComplete: () => void;
}

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to FiftyList',
    description:
      'Your companion for books and movies—set goals, keep lists in order, and see how your year is shaping up.',
    icon: Star,
  },
  {
    id: 'track',
    title: 'Track books and movies',
    description:
      'Tap + to add titles, then sort them into completed, in progress, planned, or stopped. Switch tabs to browse each part of your library.',
    icon: Film,
  },
  {
    id: 'goals',
    title: 'Set yearly goals',
    description:
      'Choose targets for books and movies for the year. Watch progress on your lists and dig into year-by-year stats when you want more detail.',
    icon: Target,
  },
  {
    id: 'suggestions',
    title: 'Get AI-powered suggestions',
    description:
      'Open Suggestions for picks tuned to your lists—with separate refine lines for books and movies and an optional taste snapshot when you use premium AI.',
    icon: Sparkles,
  },
  {
    id: 'ready',
    title: "You're ready — let's go",
    description:
      'Use Stats for charts and insights, and Settings to export, import, or adjust defaults. Your library data stays on your device.',
    icon: Check,
  },
];

const DOT_SIZE = 7;
const DOT_GAP = 6;

export default function WelcomeTour({ visible, onComplete }: WelcomeTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      setIsVisible(true);
      startAnimation();
    }
  }, [visible]);

  const startAnimation = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const animateStepChange = (callback: () => void) => {
    Animated.timing(fadeAnim, {
      toValue: 0.4,
      duration: 120,
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
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 300,
        useNativeDriver: true,
      }),
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
  const isLast = currentStep === tourSteps.length - 1;

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
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
        >
          <X size={20} color={SKIP_ICON} />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.container,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.card}>
            <View style={[styles.iconContainer, { backgroundColor: AMBER_ICON_RING }]}>
              <View style={[styles.iconInner, { backgroundColor: AMBER_PRIMARY }]}>
                <IconComponent size={28} color="#FFFFFF" />
              </View>
            </View>

            <View style={styles.content}>
              <Text style={styles.title}>{step.title}</Text>
              <Text style={styles.description}>{step.description}</Text>
            </View>

            <View style={styles.dotRow} accessibilityRole="progressbar">
              {tourSteps.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor: index === currentStep ? DOT_ACTIVE : DOT_INACTIVE,
                      marginHorizontal: DOT_GAP / 2,
                    },
                  ]}
                />
              ))}
            </View>

            <View style={styles.fixedNavigationArea}>
              <View style={styles.navigationContainer}>
                {currentStep > 0 ? (
                  <TouchableOpacity
                    style={[styles.navButton, styles.previousButton]}
                    onPress={handlePrevious}
                    accessibilityRole="button"
                    accessibilityLabel="Previous step"
                  >
                    <Text style={styles.previousButtonText}>Previous</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.navSpacer} />
                )}

                <TouchableOpacity
                  style={[styles.navButton, styles.nextButton]}
                  onPress={handleNext}
                  accessibilityRole="button"
                  accessibilityLabel={isLast ? 'Get started' : 'Next step'}
                >
                  <Text style={styles.nextButtonText}>
                    {isLast ? 'Get started →' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: SAND_BACKDROP,
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: SKIP_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: '#F5F1E8',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    minHeight: 460,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
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
    shadowOpacity: 0.08,
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
    marginBottom: 24,
    minHeight: 140,
    justifyContent: 'center',
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
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    width: '100%',
  },
  stepDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  fixedNavigationArea: {
    width: '100%',
    marginTop: 'auto',
  },
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: 44,
  },
  navSpacer: {
    minWidth: 100,
    height: 44,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
    height: 44,
    minWidth: 100,
    justifyContent: 'center',
  },
  previousButton: {
    backgroundColor: PREVIOUS_BG,
    borderWidth: 1,
    borderColor: PREVIOUS_BORDER,
  },
  nextButton: {
    backgroundColor: AMBER_PRIMARY,
    shadowColor: AMBER_PRIMARY,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  previousButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: PREVIOUS_LABEL,
  },
  nextButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
});
