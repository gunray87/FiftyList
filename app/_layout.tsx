import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { DataStoreProvider } from '@/hooks/useDataStore';
import { notificationService } from '@/utils/notificationService';
import { ActivityLogger } from '@/utils/activityLogger';
import { SubscriptionProvider } from '@/hooks/useSubscription';
import { AuthProvider } from '@/hooks/useAuth';

import { OnboardingProvider } from '@/hooks/OnboardingContext';
import OnboardingWrapper from '@/components/OnboardingWrapper';
import { createContext, useContext } from 'react';

SplashScreen.preventAutoHideAsync();

// Context for sharing preloaded data
const PreloadedDataContext = createContext<{
  apiCache: Map<string, any>;
  getPreloadedMovies: () => any[];
  getPreloadedBooks: () => any[];
}>({
  apiCache: new Map(),
  getPreloadedMovies: () => [],
  getPreloadedBooks: () => []
});

export const usePreloadedData = () => useContext(PreloadedDataContext);

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  // Global cache for API results
  const [apiCache] = useState(new Map());
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // TMDB API configuration
  const TMDB_API_KEY = '8c247ea0b4b56ed2ff7d41c9a833aa77';
  const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

  // Preload movies from TMDB
  const preloadMovies = async () => {
    try {
      console.log('🎬 Preloading popular movies...');
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&language=en-US&page=1`
      );
      
      if (response.ok) {
        const data = await response.json();
        const movies = (data.results?.slice(0, 10) || []).map((movie: any) => ({
          title: movie.title || 'Unknown Movie',
          author: movie.director || 'Various Directors',
          year: movie.release_date ? new Date(movie.release_date).getFullYear() : 2000,
          format: "streaming",
          rating: Math.round((movie.vote_average || 5) / 2),
          description: movie.overview || `A popular movie released in ${movie.release_date ? new Date(movie.release_date).getFullYear() : 2000}.`,
          genres: ['Movie'],
          isBook: false,
          source: 'tmdb',
          tmdbId: movie.id,
          posterPath: movie.poster_path
        }));
        
        // Cache the results
        apiCache.set('preloaded-movies', { 
          data: movies, 
          timestamp: Date.now() 
        });
        
        console.log(`✅ Preloaded ${movies.length} movies`);
      } else {
        console.warn('⚠️ Failed to preload movies - response not ok');
      }
    } catch (error) {
      console.error('❌ Error preloading movies:', error);
      // Don't throw - just log the error
    }
  };

  // Initialize notification service
  const initializeNotifications = async () => {
    try {
      await notificationService.initialize();
      console.log('🔔 Notification service initialized in app layout');
    } catch (error) {
      console.error('❌ Error initializing notification service:', error);
    }
  };

  // Initialize activity logger
  const initializeActivityLogger = async () => {
    try {
      const logger = ActivityLogger.getInstance();
      await logger.initialize();
      console.log('📝 Activity logger initialized in app layout');
      
      // Temporary: Add sample activities for testing
      await logger.addSampleActivities();
    } catch (error) {
      console.error('❌ Error initializing activity logger:', error);
    }
  };

  // Preload books from Google Books API (with error handling)
  const preloadBooks = async () => {
    try {
      console.log('📚 Preloading popular books from Google Books...');
      
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(
        'https://www.googleapis.com/books/v1/volumes?q=fantasy+fiction&maxResults=10&orderBy=relevance',
        { 
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
          }
        }
      );
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        const books = (data.items?.slice(0, 10) || []).map((item: any) => {
          const volumeInfo = item.volumeInfo;
          const author = volumeInfo.authors?.[0] || 'Unknown Author';
          const year = volumeInfo.publishedDate ? new Date(volumeInfo.publishedDate).getFullYear() : 2000;
          const description = volumeInfo.description || `A fantasy book by ${author} (${year}).`;
          
          return {
            title: volumeInfo.title || 'Unknown Book',
            author: author,
            year: year,
            format: "text",
            rating: volumeInfo.averageRating || 4,
            description: description,
            genres: ['fantasy'],
            isBook: true,
            source: 'googlebooks',
            coverId: volumeInfo.imageLinks?.thumbnail,
            isbn: volumeInfo.industryIdentifiers?.[0]?.identifier
          };
        });
        
        // Cache the results
        apiCache.set('preloaded-books', { 
          data: books, 
          timestamp: Date.now() 
        });
        
        console.log(`✅ Preloaded ${books.length} books from Google Books`);
      } else {
        console.warn(`⚠️ Google Books API response not ok: ${response.status} ${response.statusText}`);
        // Don't fail the app - just skip preloading
      }
    } catch (error) {
      console.error('❌ Error preloading books:', error);
      // Don't throw - just log the error and continue
      console.log('📚 Continuing without preloaded books...');
    }
  };

  // Helper functions to get preloaded data
  const getPreloadedMovies = () => {
    const cached = apiCache.get('preloaded-movies');
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.data || [];
    }
    return [];
  };

  const getPreloadedBooks = () => {
    const cached = apiCache.get('preloaded-books');
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.data || [];
    }
    return [];
  };

  // Preload suggestions when app starts
  useEffect(() => {
    const preloadSuggestions = async () => {
      try {
        console.log('🚀 Starting suggestion preloading...');
        
        // Preload movies and books in parallel with error handling
                     await Promise.allSettled([
               preloadMovies(),
               preloadBooks(),
               initializeNotifications(),
               initializeActivityLogger()
             ]);
        
        console.log('✅ Suggestion preloading completed');
      } catch (error) {
        console.error('❌ Error during suggestion preloading:', error);
        // Don't crash the app if preloading fails
      }
    };

    // Start preloading after a short delay to let the app initialize
    const timer = setTimeout(() => {
      preloadSuggestions();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <DataStoreProvider>
          <PreloadedDataContext.Provider value={{
            apiCache,
            getPreloadedMovies,
            getPreloadedBooks
          }}>
            <OnboardingProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="+not-found" />
              </Stack>
              <StatusBar style="auto" />
              
              {/* Onboarding Modal */}
              <OnboardingWrapper />
            </GestureHandlerRootView>
            </OnboardingProvider>
          </PreloadedDataContext.Provider>
        </DataStoreProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}