# Authentication & Google Books API Implementation Plan

## Overview

This document provides a complete implementation plan for:
1. **Phase 2: Authentication System** - User accounts, signup/login, subscription management
2. **Google Books API Integration** - Premium feature for authenticated users

---

## Architecture Decision: RevenueCat + Supabase (Recommended)

### Why This Stack?

**RevenueCat** handles:
- ✅ iOS/Android in-app purchases
- ✅ Subscription lifecycle management
- ✅ Receipt validation
- ✅ Cross-platform subscription sync
- ✅ Webhook notifications
- ✅ Analytics and insights
- ✅ Free tier available (up to $10k monthly revenue)

**Supabase** handles:
- ✅ User authentication (email/password, social login)
- ✅ PostgreSQL database
- ✅ Real-time subscriptions
- ✅ Row Level Security (RLS)
- ✅ RESTful API + TypeScript client
- ✅ Free tier with 50k monthly active users

**Google Books API** provides:
- ✅ 1,000 requests/day free quota
- ✅ Rich book metadata
- ✅ Cover images
- ✅ No API key required for basic use (can add for higher limits)

---

## Phase 2: Authentication System Implementation

### Timeline: 2-3 Days Full-Time

---

## Step 1: Set Up Supabase (30 minutes)

### 1.1 Create Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Create new organization: "FiftyList" or your company name
4. Create new project:
   - Name: `fiftylist-production`
   - Database password: Generate strong password (save it!)
   - Region: Choose closest to your users
   - Pricing: Free tier to start

### 1.2 Get API Keys

After project creation (2-3 minutes):
1. Go to Project Settings → API
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: `eyJhbGc...` (safe to expose in app)
   - **service_role key**: `eyJhbGc...` (NEVER expose, backend only)

### 1.3 Add to Environment Variables

Update `.env`:
```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Google Books API (optional - increases rate limits)
EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=AIzaSy...  # Get from Google Cloud Console

# TMDB (you already have this)
EXPO_PUBLIC_TMDB_API_KEY=1b5adf76a72a13bad99b8fc0c68cb085
```

Update `.env.example`:
```bash
# Supabase
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Google Books API
EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=your_google_books_api_key

# TMDB API
EXPO_PUBLIC_TMDB_API_KEY=your_tmdb_api_key
```

---

## Step 2: Install Dependencies (10 minutes)

```bash
# Supabase client
npm install @supabase/supabase-js

# RevenueCat (for in-app purchases)
npx expo install react-native-purchases

# Additional utilities
npm install jwt-decode
```

Update `package.json` will include:
```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "react-native-purchases": "^7.0.0",
    "jwt-decode": "^4.0.0"
  }
}
```

---

## Step 3: Create Database Schema (20 minutes)

### 3.1 Create Tables in Supabase

Go to Supabase Dashboard → SQL Editor → New Query

```sql
-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'premium')),
  status TEXT NOT NULL CHECK (status IN ('active', 'trial', 'expired', 'cancelled')),

  -- RevenueCat integration
  revenue_cat_customer_id TEXT,
  revenue_cat_entitlement_id TEXT,

  -- Subscription details
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  auto_renew BOOLEAN DEFAULT true,

  -- Payment details
  platform TEXT CHECK (platform IN ('ios', 'android', 'stripe', 'web')),
  price_id TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own subscription
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- API usage tracking (for rate limiting)
CREATE TABLE public.api_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  api_name TEXT NOT NULL, -- 'google_books', 'tmdb', 'omdb'
  calls_made INTEGER DEFAULT 0,
  date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, api_name, date)
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own API usage"
  ON public.api_usage
  FOR SELECT
  USING (auth.uid() = user_id);

-- Function to automatically create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );

  -- Create free tier subscription
  INSERT INTO public.subscriptions (user_id, tier, status, expires_at)
  VALUES (
    NEW.id,
    'free',
    'active',
    NOW() + INTERVAL '1 year'
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run function on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

Click "Run" to execute.

### 3.2 Enable Email Authentication

1. Go to Authentication → Providers
2. Enable "Email" provider
3. Configure email templates (optional but recommended):
   - Confirmation email
   - Reset password email
   - Magic link email

---

## Step 4: Create Supabase Client (15 minutes)

**Create file:** `lib/supabase.ts`

```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Database types (will be generated automatically later)
export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: 'free' | 'premium';
  status: 'active' | 'trial' | 'expired' | 'cancelled';
  revenue_cat_customer_id: string | null;
  revenue_cat_entitlement_id: string | null;
  started_at: string;
  expires_at: string | null;
  trial_ends_at: string | null;
  auto_renew: boolean;
  platform: 'ios' | 'android' | 'stripe' | 'web' | null;
  price_id: string | null;
  created_at: string;
  updated_at: string;
}
```

**Install required polyfill:**
```bash
npm install react-native-url-polyfill
```

---

## Step 5: Create Auth Context (30 minutes)

**Create file:** `hooks/useAuth.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, Profile, Subscription } from '@/lib/supabase';
import { Alert } from 'react-native';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  subscription: Subscription | null;
  loading: boolean;

  // Auth methods
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;

  // Profile methods
  updateProfile: (updates: Partial<Profile>) => Promise<void>;

  // Subscription methods
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        loadUserData(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth event:', event);
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          await loadUserData(session.user.id);
        } else {
          setProfile(null);
          setSubscription(null);
          setLoading(false);
        }
      }
    );

    return () => {
      authListener.unsubscribe();
    };
  }, []);

  // Load user profile and subscription
  const loadUserData = async (userId: string) => {
    try {
      setLoading(true);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error loading profile:', profileError);
      } else {
        setProfile(profileData);
      }

      // Load subscription
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (subError) {
        console.error('Error loading subscription:', subError);
      } else {
        setSubscription(subData);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sign up
  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        Alert.alert('Sign Up Error', error.message);
        return { error };
      }

      console.log('✅ User signed up:', data.user?.email);

      // Note: Supabase may require email confirmation
      if (data.user && !data.session) {
        Alert.alert(
          'Confirm Email',
          'Please check your email to confirm your account.'
        );
      }

      return { error: null };
    } catch (error: any) {
      Alert.alert('Error', error.message);
      return { error };
    }
  };

  // Sign in
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        Alert.alert('Sign In Error', error.message);
        return { error };
      }

      console.log('✅ User signed in');
      return { error: null };
    } catch (error: any) {
      Alert.alert('Error', error.message);
      return { error };
    }
  };

  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        Alert.alert('Sign Out Error', error.message);
      } else {
        console.log('✅ User signed out');
      }
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  // Reset password
  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'fiftylist://reset-password',
      });

      if (error) {
        Alert.alert('Error', error.message);
        return { error };
      }

      Alert.alert(
        'Check Email',
        'Password reset instructions have been sent to your email.'
      );
      return { error: null };
    } catch (error: any) {
      Alert.alert('Error', error.message);
      return { error };
    }
  };

  // Update profile
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      // Refresh profile
      await loadUserData(user.id);
      console.log('✅ Profile updated');
    } catch (error: any) {
      Alert.alert('Error updating profile', error.message);
    }
  };

  // Refresh subscription
  const refreshSubscription = async () => {
    if (!user) return;
    await loadUserData(user.id);
  };

  const value = {
    user,
    session,
    profile,
    subscription,
    loading,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updateProfile,
    refreshSubscription,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

---

## Step 6: Update App Root to Include Auth Provider (5 minutes)

**File:** `app/_layout.tsx`

```typescript
import { AuthProvider } from '@/hooks/useAuth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <SubscriptionProvider>
        <OnboardingProvider>
          {/* Your existing layout */}
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            {/* ... other screens */}
          </Stack>
        </OnboardingProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
```

---

## Step 7: Update useSubscription to Use Supabase (30 minutes)

**File:** `hooks/useSubscription.tsx`

Update to pull subscription from Supabase instead of AsyncStorage:

```typescript
import { useAuth } from './useAuth';
import { supabase } from '@/lib/supabase';

export const useSubscription = () => {
  const { subscription: dbSubscription, refreshSubscription } = useAuth();

  // Convert Supabase subscription to local format
  const subscription: UserSubscription | null = dbSubscription ? {
    tier: dbSubscription.tier,
    status: dbSubscription.status,
    expiresAt: new Date(dbSubscription.expires_at || ''),
    autoRenew: dbSubscription.auto_renew,
    trialEndsAt: dbSubscription.trial_ends_at ? new Date(dbSubscription.trial_ends_at) : undefined,
  } : null;

  const features = getSubscriptionFeatures(subscription);

  const upgradeToPremium = async () => {
    // This will be connected to RevenueCat later
    // For now, update database directly (testing only)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from('subscriptions')
      .update({
        tier: 'premium',
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('user_id', user.id);

    await refreshSubscription();
  };

  const startFreeTrial = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await supabase
      .from('subscriptions')
      .update({
        tier: 'premium',
        status: 'trial',
        trial_ends_at: trialEndsAt.toISOString(),
        expires_at: trialEndsAt.toISOString(),
      })
      .eq('user_id', user.id);

    await refreshSubscription();
  };

  return {
    subscription,
    features,
    isLoading: false,
    upgradeToPremium,
    startFreeTrial,
    cancelSubscription: async () => {/* TODO */},
    refreshSubscription,
  };
};
```

---

## Step 8: Create Auth Screens (1 hour)

### 8.1 Create Sign In Screen

**File:** `components/AuthModal.tsx` (update existing or create new)

```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { X, Mail, Lock, User } from 'lucide-react-native';
import { useAuth } from '@/hooks/useAuth';

interface AuthModalProps {
  visible: boolean;
  onClose: () => void;
  initialMode?: 'signin' | 'signup';
  isDark?: boolean;
}

export default function AuthModal({
  visible,
  onClose,
  initialMode = 'signin',
  isDark = false,
}: AuthModalProps) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      alert('Please enter email and password');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        await signUp(email, password, fullName);
      } else {
        await signIn(email, password);
      }
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.container, isDark && styles.darkContainer]}
      >
        {/* Header */}
        <View style={[styles.header, isDark && styles.darkHeader]}>
          <Text style={[styles.title, isDark && styles.darkText]}>
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={isDark ? '#9CA3AF' : '#6B7280'} />
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* Full Name (signup only) */}
          {mode === 'signup' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, isDark && styles.darkLabel]}>Full Name</Text>
              <View style={[styles.inputWrapper, isDark && styles.darkInputWrapper]}>
                <User size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
                <TextInput
                  style={[styles.input, isDark && styles.darkInput]}
                  value={fullName}
                  onChangeText={setFullName}
                  placeholder="John Doe"
                  placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          {/* Email */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.darkLabel]}>Email</Text>
            <View style={[styles.inputWrapper, isDark && styles.darkInputWrapper]}>
              <Mail size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              <TextInput
                style={[styles.input, isDark && styles.darkInput]}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, isDark && styles.darkLabel]}>Password</Text>
            <View style={[styles.inputWrapper, isDark && styles.darkInputWrapper]}>
              <Lock size={20} color={isDark ? '#6B7280' : '#9CA3AF'} />
              <TextInput
                style={[styles.input, isDark && styles.darkInput]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={isDark ? '#6B7280' : '#9CA3AF'}
                secureTextEntry
                autoComplete="password"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle Mode */}
          <View style={styles.toggleContainer}>
            <Text style={[styles.toggleText, isDark && styles.darkSecondaryText]}>
              {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={styles.toggleLink}>
                {mode === 'signin' ? 'Sign Up' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Styles...
const styles = StyleSheet.create({
  // Add comprehensive styles here
  container: { flex: 1, backgroundColor: '#FFF' },
  darkContainer: { backgroundColor: '#111827' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  darkHeader: { borderBottomColor: '#374151' },
  title: { fontSize: 20, fontFamily: 'Inter-SemiBold', color: '#111827' },
  darkText: { color: '#FFF' },
  content: { flex: 1, padding: 20 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontFamily: 'Inter-Medium', color: '#374151', marginBottom: 8 },
  darkLabel: { color: '#D1D5DB' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
  },
  darkInputWrapper: { borderColor: '#4B5563', backgroundColor: '#1F2937' },
  input: { flex: 1, fontSize: 16, fontFamily: 'Inter-Regular', color: '#111827' },
  darkInput: { color: '#FFF' },
  submitButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  submitButtonDisabled: { opacity: 0.6 },
  submitButtonText: { fontSize: 16, fontFamily: 'Inter-SemiBold', color: '#FFF' },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 24,
  },
  toggleText: { fontSize: 14, fontFamily: 'Inter-Regular', color: '#6B7280' },
  darkSecondaryText: { color: '#9CA3AF' },
  toggleLink: { fontSize: 14, fontFamily: 'Inter-SemiBold', color: '#8B5CF6' },
});
```

---

## Step 9: Implement Google Books API (45 minutes)

**Update file:** `utils/bookSearch.ts`

```typescript
// Add at top
const GOOGLE_BOOKS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;

// Update searchBooksAPI function
export const searchBooksAPI = async (query: string): Promise<BookSearchResult[]> => {
  try {
    console.log(`🔍 Searching Google Books API for: "${query}"`);

    // Build API URL
    let apiUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=20&orderBy=relevance`;

    // Add API key if available (increases rate limits)
    if (GOOGLE_BOOKS_API_KEY) {
      apiUrl += `&key=${GOOGLE_BOOKS_API_KEY}`;
    }

    const response = await fetch(apiUrl);

    if (!response.ok) {
      console.error(`Google Books API error: ${response.status}`);
      return [];
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      console.log(`No Google Books results for "${query}"`);
      return [];
    }

    // Convert to our format
    const results = data.items.map((item: any) => ({
      id: `google-${item.id}`,
      title: item.volumeInfo.title || 'Unknown Title',
      author: item.volumeInfo.authors?.[0] || 'Unknown Author',
      publicationYear: item.volumeInfo.publishedDate
        ? parseInt(item.volumeInfo.publishedDate.split('-')[0])
        : new Date().getFullYear(),
      description: item.volumeInfo.description || 'No description available',
      thumbnail: item.volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:') || null,
      rating: item.volumeInfo.averageRating || 0,
      genres: item.volumeInfo.categories || [],
    }));

    console.log(`✅ Found ${results.length} Google Books results`);
    return results;
  } catch (error) {
    console.error('Google Books API error:', error);
    return [];
  }
};
```

---

## Step 10: Connect Everything (30 minutes)

### 10.1 Update UpgradeModal to Show Auth for Non-Logged-In Users

```typescript
// In UpgradeModal.tsx
import { useAuth } from '@/hooks/useAuth';

export default function UpgradeModal({ ... }: UpgradeModalProps) {
  const { user } = useAuth();
  const [showAuth, setShowAuth] = useState(false);

  const handleSelectPlan = (plan: 'monthly' | 'yearly') => {
    if (!user) {
      // User not logged in - show auth modal
      setShowAuth(true);
    } else {
      // User logged in - proceed with upgrade
      onSelectPlan(plan);
    }
  };

  return (
    <>
      <Modal visible={visible} ...>
        {/* Existing upgrade modal content */}
        {/* Change onPress to use handleSelectPlan instead of onSelectPlan */}
      </Modal>

      {/* Auth Modal */}
      <AuthModal
        visible={showAuth}
        onClose={() => setShowAuth(false)}
        initialMode="signup"
      />
    </>
  );
}
```

---

## Testing Checklist

### Authentication Flow
- [ ] User can sign up with email/password
- [ ] Email confirmation sent (if enabled)
- [ ] User can sign in
- [ ] User can sign out
- [ ] Profile created automatically on signup
- [ ] Free subscription created automatically
- [ ] Session persists across app restarts

### Google Books API
- [ ] Premium users can search Google Books
- [ ] Results show cover images
- [ ] Results show descriptions
- [ ] Results show ratings
- [ ] Free users cannot access Google Books API
- [ ] Error handling works if API fails
- [ ] Rate limiting respected

### Upgrade Flow
- [ ] Non-logged-in user sees auth modal when upgrading
- [ ] After signup, upgrade completes automatically
- [ ] Logged-in user can upgrade directly
- [ ] Subscription updates in database
- [ ] Features unlock immediately after upgrade
- [ ] Trial users see trial status

---

## Next Steps: RevenueCat Integration (Phase 3)

After authentication is working:

1. **Set up RevenueCat**
2. **Configure App Store Connect / Google Play Console**
3. **Implement purchase flow**
4. **Add webhook handlers**
5. **Connect RevenueCat to Supabase**

This will be documented in a separate guide.

---

**Total Implementation Time: 6-8 hours**
**Difficulty: Intermediate**
**Prerequisites: .env configured, dependencies installed**
