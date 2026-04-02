import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserInterests } from '@/components/OnboardingModal';

const USER_INTERESTS_KEY = '@fiftylist_user_interests';
const ONBOARDING_COMPLETED_KEY = '@fiftylist_onboarding_completed';

export interface UserInterestsState {
  interests: UserInterests | null;
  hasCompletedOnboarding: boolean;
  isLoading: boolean;
}

export const useUserInterests = () => {
  const [state, setState] = useState<UserInterestsState>({
    interests: null,
    hasCompletedOnboarding: false,
    isLoading: true,
  });

  // Load user interests from storage
  const loadUserInterests = async () => {
    try {
      const [interestsData, onboardingData] = await Promise.all([
        AsyncStorage.getItem(USER_INTERESTS_KEY),
        AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY),
      ]);

      const interests = interestsData ? JSON.parse(interestsData) : null;
      const hasCompletedOnboarding = onboardingData === 'true';

      setState({
        interests,
        hasCompletedOnboarding,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error loading user interests:', error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  // Save user interests to storage
  const saveUserInterests = async (interests: UserInterests) => {
    try {
      await Promise.all([
        AsyncStorage.setItem(USER_INTERESTS_KEY, JSON.stringify(interests)),
        AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true'),
      ]);

      setState(prev => ({
        ...prev,
        interests,
        hasCompletedOnboarding: true,
      }));
    } catch (error) {
      console.error('Error saving user interests:', error);
    }
  };

  // Skip onboarding
  const skipOnboarding = async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
      setState(prev => ({
        ...prev,
        hasCompletedOnboarding: true,
      }));
    } catch (error) {
      console.error('Error skipping onboarding:', error);
    }
  };

  // Update specific interest categories
  const updateInterests = async (updates: Partial<UserInterests>) => {
    if (!state.interests) return;

    const updatedInterests = { ...state.interests, ...updates };
    await saveUserInterests(updatedInterests);
  };

  // Reset user interests
  const resetInterests = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(USER_INTERESTS_KEY),
        AsyncStorage.removeItem(ONBOARDING_COMPLETED_KEY),
      ]);

      setState({
        interests: null,
        hasCompletedOnboarding: false,
        isLoading: false,
      });
    } catch (error) {
      console.error('Error resetting user interests:', error);
    }
  };

  // Load interests on mount
  useEffect(() => {
    loadUserInterests();
  }, []);

  return {
    ...state,
    saveUserInterests,
    skipOnboarding,
    updateInterests,
    resetInterests,
    loadUserInterests,
  };
};
