import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, BookOpen, Film, Star, Heart, Zap, TrendingUp } from 'lucide-react-native';
import { FL } from '@/constants/fiftyListTheme';

interface OnboardingModalProps {
  visible: boolean;
  onComplete: (interests: UserInterests) => void;
  onSkip: () => void;
}

export interface UserInterests {
  favoriteGenres: string[];
  preferredFormats: string[];
  readingGoals: string[];
  moodPreferences: string[];
  mediaTypes: ('books' | 'movies')[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

const GENRE_OPTIONS = [
  { id: 'fantasy', label: 'Fantasy', icon: Zap },
  { id: 'scifi', label: 'Science Fiction', icon: TrendingUp },
  { id: 'mystery', label: 'Mystery & Thriller', icon: Star },
  { id: 'adventure', label: 'Adventure', icon: Heart },
  { id: 'literary', label: 'Literary Fiction', icon: BookOpen },
  { id: 'contemporary', label: 'Contemporary', icon: TrendingUp },
  { id: 'romance', label: 'Romance', icon: Heart },
  { id: 'horror', label: 'Horror', icon: Zap },
  { id: 'historical', label: 'Historical Fiction', icon: BookOpen },
  { id: 'nonfiction', label: 'Non-Fiction', icon: Star },
  { id: 'youngadult', label: 'Young Adult', icon: Heart },
];

const FORMAT_OPTIONS = [
  { id: 'text', label: 'Physical Books', icon: BookOpen },
  { id: 'ebook', label: 'E-books', icon: BookOpen },
  { id: 'audiobook', label: 'Audiobooks', icon: BookOpen },
  { id: 'streaming', label: 'Streaming', icon: Film },
  { id: 'theater', label: 'Movie Theater', icon: Film },
];

const GOAL_OPTIONS = [
  { id: 'explore', label: 'Explore New Genres', icon: TrendingUp },
  { id: 'classics', label: 'Read Classics', icon: Star },
  { id: 'current', label: 'Stay Current', icon: Zap },
  { id: 'escape', label: 'Escape & Entertainment', icon: Heart },
  { id: 'learn', label: 'Learn & Grow', icon: BookOpen },
];

const MOOD_OPTIONS = [
  { id: 'uplifting', label: 'Uplifting & Inspiring', icon: Heart },
  { id: 'thrilling', label: 'Thrilling & Exciting', icon: Zap },
  { id: 'thoughtful', label: 'Thoughtful & Deep', icon: Star },
  { id: 'funny', label: 'Funny & Light', icon: TrendingUp },
  { id: 'mysterious', label: 'Mysterious & Suspenseful', icon: BookOpen },
];

const EXPERIENCE_LEVELS = [
  { id: 'beginner', label: 'Just Getting Started', description: 'New to reading/watching regularly' },
  { id: 'intermediate', label: 'Regular Reader/Watcher', description: 'Enjoy books and movies regularly' },
  { id: 'advanced', label: 'Avid Consumer', description: 'Read/watch extensively across genres' },
];

function SelectionCheckmark() {
  return (
    <View style={styles.checkmark}>
      <Check size={12} color={FL.white} />
    </View>
  );
}

export default function OnboardingModal({ visible, onComplete, onSkip }: OnboardingModalProps) {
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState<UserInterests>({
    favoriteGenres: [],
    preferredFormats: [],
    readingGoals: [],
    moodPreferences: [],
    mediaTypes: ['books'],
    experienceLevel: 'intermediate',
  });

  const toggleGenre = (genreId: string) => {
    setInterests(prev => ({
      ...prev,
      favoriteGenres: prev.favoriteGenres.includes(genreId)
        ? prev.favoriteGenres.filter(id => id !== genreId)
        : [...prev.favoriteGenres, genreId]
    }));
  };

  const toggleFormat = (formatId: string) => {
    setInterests(prev => ({
      ...prev,
      preferredFormats: prev.preferredFormats.includes(formatId)
        ? prev.preferredFormats.filter(id => id !== formatId)
        : [...prev.preferredFormats, formatId]
    }));
  };

  const toggleGoal = (goalId: string) => {
    setInterests(prev => ({
      ...prev,
      readingGoals: prev.readingGoals.includes(goalId)
        ? prev.readingGoals.filter(id => id !== goalId)
        : [...prev.readingGoals, goalId]
    }));
  };

  const toggleMood = (moodId: string) => {
    setInterests(prev => ({
      ...prev,
      moodPreferences: prev.moodPreferences.includes(moodId)
        ? prev.moodPreferences.filter(id => id !== moodId)
        : [...prev.moodPreferences, moodId]
    }));
  };

  const toggleMediaType = (mediaType: 'books' | 'movies') => {
    setInterests(prev => ({
      ...prev,
      mediaTypes: prev.mediaTypes.includes(mediaType)
        ? prev.mediaTypes.filter(type => type !== mediaType)
        : [...prev.mediaTypes, mediaType]
    }));
  };

  const setExperienceLevel = (level: 'beginner' | 'intermediate' | 'advanced') => {
    setInterests(prev => ({ ...prev, experienceLevel: level }));
  };

  const handleComplete = () => {
    onComplete(interests);
  };

  const handleSkip = () => {
    onSkip();
  };

  const renderGridOption = (
    key: string,
    label: string,
    IconComponent: React.ComponentType<{ size: number; color: string }>,
    isSelected: boolean,
    onPress: () => void,
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.optionCard, isSelected && styles.optionCardSelected]}
      onPress={onPress}
    >
      <IconComponent size={24} color={isSelected ? FL.amber : FL.textMuted} />
      <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
        {label}
      </Text>
      {isSelected && <SelectionCheckmark />}
    </TouchableOpacity>
  );

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What genres interest you?</Text>
      <Text style={styles.stepSubtitle}>Select all that appeal to you</Text>
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsGrid}>
          {GENRE_OPTIONS.map((genre) => {
            const IconComponent = genre.icon;
            const isSelected = interests.favoriteGenres.includes(genre.id);
            return renderGridOption(genre.id, genre.label, IconComponent, isSelected, () => toggleGenre(genre.id));
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>How do you prefer to consume content?</Text>
      <Text style={styles.stepSubtitle}>Choose your preferred formats</Text>
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsGrid}>
          {FORMAT_OPTIONS.map((format) => {
            const IconComponent = format.icon;
            const isSelected = interests.preferredFormats.includes(format.id);
            return renderGridOption(format.id, format.label, IconComponent, isSelected, () => toggleFormat(format.id));
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What are your reading goals?</Text>
      <Text style={styles.stepSubtitle}>What do you hope to achieve?</Text>
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsGrid}>
          {GOAL_OPTIONS.map((goal) => {
            const IconComponent = goal.icon;
            const isSelected = interests.readingGoals.includes(goal.id);
            return renderGridOption(goal.id, goal.label, IconComponent, isSelected, () => toggleGoal(goal.id));
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What moods do you enjoy?</Text>
      <Text style={styles.stepSubtitle}>What emotional experience do you seek?</Text>
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsGrid}>
          {MOOD_OPTIONS.map((mood) => {
            const IconComponent = mood.icon;
            const isSelected = interests.moodPreferences.includes(mood.id);
            return renderGridOption(mood.id, mood.label, IconComponent, isSelected, () => toggleMood(mood.id));
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What's your experience level?</Text>
      <Text style={styles.stepSubtitle}>This helps us tailor recommendations</Text>
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.experienceContainer}>
          {EXPERIENCE_LEVELS.map((level) => {
            const isSelected = interests.experienceLevel === level.id;
            return (
              <TouchableOpacity
                key={level.id}
                style={[styles.experienceCard, isSelected && styles.optionCardSelected]}
                onPress={() => setExperienceLevel(level.id as 'beginner' | 'intermediate' | 'advanced')}
              >
                <Text style={[styles.experienceTitle, isSelected && styles.optionLabelSelected]}>
                  {level.label}
                </Text>
                <Text style={[styles.experienceDescription, isSelected && styles.experienceDescriptionSelected]}>
                  {level.description}
                </Text>
                {isSelected && <SelectionCheckmark />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderStep6 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What types of content do you want?</Text>
      <Text style={styles.stepSubtitle}>Select all that apply</Text>
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.mediaTypesContainer}>
          {([
            { id: 'books' as const, label: 'Books', icon: BookOpen },
            { id: 'movies' as const, label: 'Movies', icon: Film },
          ]).map(({ id, label, icon: IconComponent }) => {
            const isSelected = interests.mediaTypes.includes(id);
            return (
              <TouchableOpacity
                key={id}
                style={[styles.mediaTypeCard, isSelected && styles.optionCardSelected]}
                onPress={() => toggleMediaType(id)}
              >
                <IconComponent size={32} color={isSelected ? FL.amber : FL.textMuted} />
                <Text style={[styles.mediaTypeLabel, isSelected && styles.optionLabelSelected]}>
                  {label}
                </Text>
                {isSelected && <SelectionCheckmark />}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );

  const renderCurrentStep = () => {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      default: return renderStep1();
    }
  };

  const canProceed = () => {
    switch (step) {
      case 1: return interests.favoriteGenres.length > 0;
      case 2: return interests.preferredFormats.length > 0;
      case 3: return interests.readingGoals.length > 0;
      case 4: return interests.moodPreferences.length > 0;
      case 5: return interests.experienceLevel !== undefined;
      case 6: return interests.mediaTypes.length > 0;
      default: return false;
    }
  };

  const proceedEnabled = canProceed();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>

          <View style={styles.dotsRow}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <View key={i} style={[styles.dot, step === i && styles.dotActive]} />
            ))}
          </View>

          <TouchableOpacity onPress={handleSkip} style={styles.closeButtonGhost}>
            <X size={18} color={FL.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {renderCurrentStep()}
        </View>

        <View style={styles.footer}>
          {step > 1 && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setStep(step - 1)}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}

          {step < 6 ? (
            <TouchableOpacity
              style={[styles.primaryButton, !proceedEnabled && styles.primaryButtonDisabled]}
              onPress={() => setStep(step + 1)}
              disabled={!proceedEnabled}
            >
              <Text style={styles.primaryButtonText}>Next</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryButton, !proceedEnabled && styles.primaryButtonDisabled]}
              onPress={handleComplete}
              disabled={!proceedEnabled}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: FL.sand,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: FL.border,
  },
  skipButton: {
    minWidth: 52,
    paddingVertical: 8,
  },
  skipText: {
    color: FL.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  dotsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: FL.border,
  },
  dotActive: {
    backgroundColor: FL.amber,
  },
  closeButtonGhost: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: FL.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  stepContainer: {
    flex: 1,
    paddingTop: 40,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: FL.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: FL.textMuted,
    textAlign: 'center',
    marginBottom: 32,
  },
  optionsContainer: {
    flex: 1,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  optionCard: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: FL.card,
    borderWidth: 0.5,
    borderColor: FL.border,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  optionCardSelected: {
    backgroundColor: FL.amberTint,
    borderWidth: 1.5,
    borderColor: FL.amber,
  },
  optionLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: FL.textDark,
    textAlign: 'center',
  },
  optionLabelSelected: {
    color: FL.amber,
    fontWeight: '600',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: FL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  experienceContainer: {
    gap: 16,
  },
  experienceCard: {
    backgroundColor: FL.card,
    borderWidth: 0.5,
    borderColor: FL.border,
    borderRadius: 14,
    padding: 20,
    position: 'relative',
  },
  experienceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: FL.textDark,
    marginBottom: 4,
  },
  experienceDescription: {
    fontSize: 14,
    color: FL.textMuted,
    lineHeight: 20,
  },
  experienceDescriptionSelected: {
    color: FL.amber,
  },
  mediaTypesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  mediaTypeCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: FL.card,
    borderWidth: 0.5,
    borderColor: FL.border,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mediaTypeLabel: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: FL.textDark,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderTopWidth: 0.5,
    borderTopColor: FL.border,
    gap: 12,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backButtonText: {
    fontSize: 16,
    color: FL.textMuted,
    fontWeight: '500',
  },
  primaryButton: {
    width: '100%',
    backgroundColor: FL.amber,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: FL.border,
  },
  primaryButtonText: {
    fontSize: 16,
    color: FL.white,
    fontWeight: '600',
  },
});
