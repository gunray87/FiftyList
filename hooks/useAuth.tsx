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

