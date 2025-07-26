import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppSettings {
  defaultBookFormat: 'text' | 'audio' | 'ebook';
  defaultMovieFormat: 'streaming' | 'theater' | 'bluray' | 'dvd';
  defaultBookSource: string;
  defaultMovieSource: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultBookFormat: 'text',
  defaultMovieFormat: 'streaming',
  defaultBookSource: '',
  defaultMovieSource: '',
};

const SETTINGS_KEY = '@FiftyList:appSettings';

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      
      const savedSettings = await AsyncStorage.getItem(SETTINGS_KEY);
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        // Ensure all required fields exist with defaults
        const mergedSettings = { ...DEFAULT_SETTINGS, ...parsed };
        setSettings(mergedSettings);
      } else {
        setSettings(DEFAULT_SETTINGS);
      }
    } catch (error) {
      console.error('Error loading app settings:', error);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      setSettings(updatedSettings);
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
      return updatedSettings;
    } catch (error) {
      console.error('Error saving app settings:', error);
      throw error;
    }
  };

  const resetSettings = async () => {
    try {
      setSettings(DEFAULT_SETTINGS);
      await AsyncStorage.removeItem(SETTINGS_KEY);
      return DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error resetting app settings:', error);
      throw error;
    }
  };

  return {
    settings,
    updateSettings,
    resetSettings,
    isLoading,
    DEFAULT_SETTINGS,
  };
}