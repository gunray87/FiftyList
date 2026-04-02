import React from 'react';
import OnboardingModal from './OnboardingModal';
import { useUserInterests } from '@/hooks/useUserInterests';
import { useOnboarding } from '@/hooks/OnboardingContext';

export default function OnboardingWrapper() {
  const { 
    hasCompletedOnboarding, 
    isLoading, 
    saveUserInterests, 
    skipOnboarding 
  } = useUserInterests();

  const { showOnboarding, setShowOnboarding } = useOnboarding();

  return (
    <OnboardingModal
      visible={(!isLoading && !hasCompletedOnboarding) || showOnboarding}
      onComplete={(interests) => {
        saveUserInterests(interests);
        setShowOnboarding(false);
      }}
      onSkip={() => {
        skipOnboarding();
        setShowOnboarding(false);
      }}
    />
  );
}
