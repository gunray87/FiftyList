import React, { createContext, useContext, useState } from 'react';
import { UserInterests } from '@/components/OnboardingModal';

interface OnboardingContextType {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
  retakeOnboarding: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export const OnboardingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [showOnboarding, setShowOnboarding] = useState(false);

  const retakeOnboarding = () => {
    setShowOnboarding(true);
  };

  return (
    <OnboardingContext.Provider value={{
      showOnboarding,
      setShowOnboarding,
      retakeOnboarding,
    }}>
      {children}
    </OnboardingContext.Provider>
  );
};

export const useOnboarding = () => {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
};
