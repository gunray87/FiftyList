import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FIRST_LAUNCH_KEY = '@FiftyList:hasLaunched';

export function useFirstLaunch() {
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkFirstLaunch();
  }, []);

  const checkFirstLaunch = async () => {
    try {
      const hasLaunched = await AsyncStorage.getItem(FIRST_LAUNCH_KEY);
      setIsFirstLaunch(hasLaunched === null);
    } catch (error) {
      console.error('Error checking first launch:', error);
      // Default to showing tour if we can't determine
      setIsFirstLaunch(true);
    } finally {
      setIsLoading(false);
    }
  };

  const markAsLaunched = async () => {
    try {
      await AsyncStorage.setItem(FIRST_LAUNCH_KEY, 'true');
      setIsFirstLaunch(false);
    } catch (error) {
      console.error('Error marking as launched:', error);
    }
  };

  const resetFirstLaunch = async () => {
    try {
      await AsyncStorage.removeItem(FIRST_LAUNCH_KEY);
      setIsFirstLaunch(true);
    } catch (error) {
      console.error('Error resetting first launch:', error);
    }
  };

  return {
    isFirstLaunch,
    isLoading,
    markAsLaunched,
    resetFirstLaunch,
  };
}