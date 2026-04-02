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

// Database types
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

