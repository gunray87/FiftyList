import { createContext, useContext, useEffect, useState } from 'react';
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

import { OnboardingProvider } from '@/hooks/OnboardingContext';
import OnboardingWrapper from '@/components/OnboardingWrapper';
import { getTmdbApiKey, TMDB_BASE_URL } from '@/utils/tmdbConfig';
import { searchBooks } from '@/utils/bookSearch';

SplashScreen.preventAutoHideAsync();

/** Suggestion preload cache shape — matches Google Books branch in preloadBooks. */
async function buildPreloadedBooksFromLocalCatalog(): Promise<any[]> {
  const fantasy = await searchBooks('fantasy');
  const merged = [...fantasy];
  if (merged.length < 10) {
    const fiction = await searchBooks('fiction');
    for (const b of fiction) {
      if (merged.length >= 10) break;
      if (!merged.some((m) => m.title === b.title && m.author === b.author)) {
        merged.push(b);
      }
    }
  }
  return merged.slice(0, 10).map((r) => ({
    title: r.title,
    author: r.author,
    year: r.publicationYear ?? new Date().getFullYear(),
    format: 'text',
    rating: r.rating || 4,
    description: r.description || `A book by ${r.author}.`,
    genres: r.genres?.length ? r.genres : ['fiction'],
    isBook: true,
    source: 'local',
    coverId: r.thumbnail ?? undefined,
    isbn: undefined,
  }));
}

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

  // Preload movies from TMDB
  const preloadMovies = async () => {
    try {
      const apiKey = getTmdbApiKey();
      if (!apiKey) {
        console.warn(
          '⚠️ TMDB API key not configured. Set EXPO_PUBLIC_TMDB_API_KEY in .env or EAS secrets.'
        );
        return;
      }

      console.log('🎬 Preloading popular movies...');
      const response = await fetch(
        `${TMDB_BASE_URL}/movie/popular?api_key=${apiKey}&language=en-US&page=1`
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

  // Startup preload uses the bundled catalog only — avoids Google Books 429 on launch and keeps API quota for user-driven search (Add / Import).
  const preloadBooks = async () => {
    const cacheBooks = (books: any[], label: string) => {
      if (books.length === 0) return;
      apiCache.set('preloaded-books', {
        data: books,
        timestamp: Date.now(),
      });
      console.log(`✅ Preloaded ${books.length} books (${label})`);
    };

    try {
      console.log(
        '📚 Preloading books from local catalog (Google Books is not used at startup — preserves quota).'
      );
      cacheBooks(await buildPreloadedBooksFromLocalCatalog(), 'local catalog');
    } catch (error) {
      console.error('❌ Error preloading books:', error);
      try {
        cacheBooks(await buildPreloadedBooksFromLocalCatalog(), 'local catalog after error');
      } catch {
        console.log('📚 Continuing without preloaded books...');
      }
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
  );
}