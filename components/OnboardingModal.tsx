import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { X, Check, BookOpen, Film, Star, Heart, Zap, TrendingUp } from 'lucide-react-native';

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
  mediaTypes: ('books' | 'movies' | 'tv')[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

const GENRE_OPTIONS = [
  { id: 'fantasy', label: 'Fantasy', icon: Zap, color: '#8B5CF6' },
  { id: 'scifi', label: 'Science Fiction', icon: TrendingUp, color: '#06B6D4' },
  { id: 'mystery', label: 'Mystery & Thriller', icon: Star, color: '#EF4444' },
  { id: 'adventure', label: 'Adventure', icon: Heart, color: '#10B981' },
  { id: 'literary', label: 'Literary Fiction', icon: BookOpen, color: '#F59E0B' },
  { id: 'contemporary', label: 'Contemporary', icon: TrendingUp, color: '#EC4899' },
  { id: 'romance', label: 'Romance', icon: Heart, color: '#F43F5E' },
  { id: 'horror', label: 'Horror', icon: Zap, color: '#7C3AED' },
  { id: 'historical', label: 'Historical Fiction', icon: BookOpen, color: '#B45309' },
  { id: 'nonfiction', label: 'Non-Fiction', icon: Star, color: '#059669' },
  { id: 'youngadult', label: 'Young Adult', icon: Heart, color: '#DC2626' },
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

  const toggleMediaType = (mediaType: 'books' | 'movies' | 'tv') => {
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

  const renderStep1 = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>What genres interest you?</Text>
      <Text style={styles.stepSubtitle}>Select all that appeal to you</Text>
      
      <ScrollView style={styles.optionsContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.optionsGrid}>
          {GENRE_OPTIONS.map((genre) => {
            const IconComponent = genre.icon;
            const isSelected = interests.favoriteGenres.includes(genre.id);
            
            return (
              <TouchableOpacity
                key={genre.id}
                style={[
                  styles.optionCard,
                  isSelected && { borderColor: genre.color, backgroundColor: `${genre.color}15` }
                ]}
                onPress={() => toggleGenre(genre.id)}
              >
                <IconComponent 
                  size={24} 
                  color={isSelected ? genre.color : '#6B7280'} 
                />
                <Text style={[
                  styles.optionLabel,
                  isSelected && { color: genre.color, fontWeight: '600' }
                ]}>
                  {genre.label}
                </Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: genre.color }]}>
                    <Check size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
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
            
            return (
              <TouchableOpacity
                key={format.id}
                style={[
                  styles.optionCard,
                  isSelected && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
                ]}
                onPress={() => toggleFormat(format.id)}
              >
                <IconComponent 
                  size={24} 
                  color={isSelected ? '#8B5CF6' : '#6B7280'} 
                />
                <Text style={[
                  styles.optionLabel,
                  isSelected && { color: '#8B5CF6', fontWeight: '600' }
                ]}>
                  {format.label}
                </Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                    <Check size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
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
            
            return (
              <TouchableOpacity
                key={goal.id}
                style={[
                  styles.optionCard,
                  isSelected && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
                ]}
                onPress={() => toggleGoal(goal.id)}
              >
                <IconComponent 
                  size={24} 
                  color={isSelected ? '#8B5CF6' : '#6B7280'} 
                />
                <Text style={[
                  styles.optionLabel,
                  isSelected && { color: '#8B5CF6', fontWeight: '600' }
                ]}>
                  {goal.label}
                </Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                    <Check size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
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
            
            return (
              <TouchableOpacity
                key={mood.id}
                style={[
                  styles.optionCard,
                  isSelected && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
                ]}
                onPress={() => toggleMood(mood.id)}
              >
                <IconComponent 
                  size={24} 
                  color={isSelected ? '#8B5CF6' : '#6B7280'} 
                />
                <Text style={[
                  styles.optionLabel,
                  isSelected && { color: '#8B5CF6', fontWeight: '600' }
                ]}>
                  {mood.label}
                </Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                    <Check size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
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
                style={[
                  styles.experienceCard,
                  isSelected && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
                ]}
                onPress={() => setExperienceLevel(level.id as any)}
              >
                <Text style={[
                  styles.experienceTitle,
                  isSelected && { color: '#8B5CF6', fontWeight: '600' }
                ]}>
                  {level.label}
                </Text>
                <Text style={[
                  styles.experienceDescription,
                  isSelected && { color: '#8B5CF6' }
                ]}>
                  {level.description}
                </Text>
                {isSelected && (
                  <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                    <Check size={12} color="#FFFFFF" />
                  </View>
                )}
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
          <TouchableOpacity
            style={[
              styles.mediaTypeCard,
              interests.mediaTypes.includes('books') && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
            ]}
            onPress={() => toggleMediaType('books')}
          >
            <BookOpen size={32} color={interests.mediaTypes.includes('books') ? '#8B5CF6' : '#6B7280'} />
            <Text style={[
              styles.mediaTypeLabel,
              interests.mediaTypes.includes('books') && { color: '#8B5CF6', fontWeight: '600' }
            ]}>
              Books
            </Text>
            {interests.mediaTypes.includes('books') && (
              <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                <Check size={12} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.mediaTypeCard,
              interests.mediaTypes.includes('movies') && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
            ]}
            onPress={() => toggleMediaType('movies')}
          >
            <Film size={32} color={interests.mediaTypes.includes('movies') ? '#8B5CF6' : '#6B7280'} />
            <Text style={[
              styles.mediaTypeLabel,
              interests.mediaTypes.includes('movies') && { color: '#8B5CF6', fontWeight: '600' }
            ]}>
              Movies
            </Text>
            {interests.mediaTypes.includes('movies') && (
              <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                <Check size={12} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.mediaTypeCard,
              interests.mediaTypes.includes('tv') && { borderColor: '#8B5CF6', backgroundColor: '#8B5CF615' }
            ]}
            onPress={() => toggleMediaType('tv')}
          >
            <Film size={32} color={interests.mediaTypes.includes('tv') ? '#8B5CF6' : '#6B7280'} />
            <Text style={[
              styles.mediaTypeLabel,
              interests.mediaTypes.includes('tv') && { color: '#8B5CF6', fontWeight: '600' }
            ]}>
              TV Shows
            </Text>
            {interests.mediaTypes.includes('tv') && (
              <View style={[styles.checkmark, { backgroundColor: '#8B5CF6' }]}>
                <Check size={12} color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
          
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(step / 6) * 100}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{step} of 6</Text>
          </View>
          
          <TouchableOpacity onPress={handleSkip} style={styles.closeButton}>
            <X size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {renderCurrentStep()}
        </View>

        {/* Footer */}
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
              style={[
                styles.nextButton,
                !canProceed() && styles.nextButtonDisabled
              ]}
              onPress={() => setStep(step + 1)}
              disabled={!canProceed()}
            >
              <Text style={[
                styles.nextButtonText,
                !canProceed() && styles.nextButtonTextDisabled
              ]}>
                Next
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[
                styles.completeButton,
                !canProceed() && styles.nextButtonDisabled
              ]}
              onPress={handleComplete}
              disabled={!canProceed()}
            >
              <Text style={[
                styles.completeButtonText,
                !canProceed() && styles.nextButtonTextDisabled
              ]}>
                Get Started
              </Text>
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
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  skipButton: {
    padding: 8,
  },
  skipText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '500',
  },
  progressContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#8B5CF6',
    borderRadius: 2,
  },
  progressText: {
    marginTop: 8,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  closeButton: {
    padding: 8,
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
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 16,
    color: '#6B7280',
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
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  optionLabel: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  experienceContainer: {
    gap: 16,
  },
  experienceCard: {
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 20,
    position: 'relative',
  },
  experienceTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  experienceDescription: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  mediaTypesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  mediaTypeCard: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mediaTypeLabel: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backButtonText: {
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  nextButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  nextButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  nextButtonTextDisabled: {
    color: '#9CA3AF',
  },
  completeButton: {
    backgroundColor: '#10B981',
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  completeButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
