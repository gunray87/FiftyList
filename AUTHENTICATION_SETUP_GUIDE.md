# Authentication Setup Guide

## 🎯 Quick Setup (15 minutes)

You now have all the authentication components ready! Follow these steps to complete the setup:

---

## Step 1: Create .env File (2 minutes)

Create a `.env` file in your project root with your Supabase credentials:

```bash
# Supabase Configuration
EXPO_PUBLIC_SUPABASE_URL=https://zpehgzmidozbrkpnzosm.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpwZWhnem1pZG96YnJrcG56b3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MTU1MTMsImV4cCI6MjA3NjI5MTUxM30.EnueyMFukmsVefTRy5zERYoJBoj5rnPiB9FlUWt5v90

# Google Books API (optional - increases rate limits)
# EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=your_google_books_api_key

# TMDB API (existing)
EXPO_PUBLIC_TMDB_API_KEY=1b5adf76a72a13bad99b8fc0c68cb085
```

---

## Step 2: Set Up Database Schema (5 minutes)

1. **Go to Supabase Dashboard**: https://supabase.com/dashboard
2. **Navigate to your project**: `zpehgzmidozbrkpnzosm`
3. **Go to SQL Editor** (left sidebar)
4. **Click "New Query"**
5. **Copy and paste** the contents of `supabase-schema.sql`
6. **Click "Run"** to execute

This will create:
- ✅ `profiles` table for user data
- ✅ `subscriptions` table for subscription management
- ✅ `api_usage` table for rate limiting
- ✅ Automatic triggers for user creation
- ✅ Row Level Security (RLS) policies

---

## Step 3: Enable Email Authentication (2 minutes)

1. **Go to Authentication → Providers** in Supabase dashboard
2. **Enable "Email" provider** (should be enabled by default)
3. **Configure email templates** (optional but recommended):
   - Go to Authentication → Email Templates
   - Customize confirmation, reset password, and magic link emails

---

## Step 4: Test the Implementation (5 minutes)

1. **Restart Expo**:
   ```bash
   npx expo start --ios --clear
   ```

2. **Test Authentication Flow**:
   - Open the app
   - Try to upgrade (Settings → Subscription → "Upgrade to Premium")
   - Should see AuthModal for signup/signin
   - Create a test account
   - Verify user is created in Supabase dashboard

3. **Test Database Integration**:
   - Go to Supabase Dashboard → Table Editor
   - Check `profiles` table for your test user
   - Check `subscriptions` table for free tier subscription

---

## Step 5: Verify Everything Works (1 minute)

### ✅ **Authentication Features**
- [ ] User can sign up with email/password
- [ ] User can sign in
- [ ] User can sign out
- [ ] Profile created automatically on signup
- [ ] Free subscription created automatically
- [ ] Session persists across app restarts

### ✅ **Upgrade Flow**
- [ ] Non-logged-in user sees auth modal when upgrading
- [ ] After signup, upgrade completes automatically
- [ ] Logged-in user can upgrade directly
- [ ] Subscription updates in database
- [ ] Features unlock immediately after upgrade

---

## 🎉 What's Now Working

### **Before (Issues Fixed)**
- ❌ Anonymous trials with no user tracking
- ❌ No way to convert users to paid
- ❌ No user accounts or email collection
- ❌ Premium features were fake (local data only)

### **After (Authentication Implemented)**
- ✅ **Real user accounts** with email/password
- ✅ **Database-backed subscriptions** in Supabase
- ✅ **Authentication required** for upgrades
- ✅ **User profiles** automatically created
- ✅ **Free tier subscriptions** automatically assigned
- ✅ **Session persistence** across app restarts
- ✅ **Foundation for RevenueCat** integration

---

## 🔧 Files Created/Modified

### **New Files Created**
- ✅ `lib/supabase.ts` - Supabase client configuration
- ✅ `hooks/useAuth.tsx` - Authentication context and methods
- ✅ `components/AuthModal.tsx` - Sign up/sign in modal
- ✅ `supabase-schema.sql` - Database schema
- ✅ `AUTHENTICATION_SETUP_GUIDE.md` - This guide

### **Files Modified**
- ✅ `app/_layout.tsx` - Added AuthProvider wrapper
- ✅ `components/UpgradeModal.tsx` - Added authentication requirement
- ✅ `package.json` - Added Supabase dependencies

---

## 🚀 Next Steps (Optional)

### **Phase 3: RevenueCat Integration**
After authentication is working, you can add real payment processing:

1. **Set up RevenueCat dashboard**
2. **Configure App Store Connect / Google Play Console**
3. **Implement purchase flow**
4. **Add webhook handlers**
5. **Connect RevenueCat to Supabase**

### **Phase 4: Google Books API**
Enable real API search for premium users:

1. **Get Google Books API key** (optional)
2. **Update `utils/bookSearch.ts`** with real API calls
3. **Test premium search functionality**

---

## 🐛 Troubleshooting

### **Common Issues**

#### **"Missing Supabase environment variables"**
- ✅ Check `.env` file exists in project root
- ✅ Verify environment variables are correct
- ✅ Restart Expo after creating `.env`

#### **"Auth event: SIGNED_OUT" on startup**
- ✅ This is normal - means no existing session
- ✅ User will need to sign in

#### **Database errors**
- ✅ Check Supabase dashboard for error logs
- ✅ Verify schema was created correctly
- ✅ Check RLS policies are enabled

#### **Modal not appearing**
- ✅ Check console for errors
- ✅ Verify AuthProvider is wrapping the app
- ✅ Check if user is already logged in

---

## 📊 Testing Checklist

### **Authentication Flow**
- [ ] Sign up with new email
- [ ] Check Supabase dashboard for new user
- [ ] Sign in with existing credentials
- [ ] Sign out and verify session cleared
- [ ] Test session persistence (close/reopen app)

### **Upgrade Flow**
- [ ] Open upgrade modal while logged out
- [ ] Auth modal appears
- [ ] Sign up new user
- [ ] Upgrade modal closes after signup
- [ ] User is now logged in
- [ ] Can access premium features

### **Database Integration**
- [ ] User appears in `profiles` table
- [ ] Free subscription created in `subscriptions` table
- [ ] User can upgrade (updates database)
- [ ] Session persists across app restarts

---

## 🎯 Success Criteria

**You'll know it's working when:**
1. ✅ User can create account and sign in
2. ✅ User appears in Supabase database
3. ✅ Upgrade flow requires authentication
4. ✅ Session persists across app restarts
5. ✅ No more anonymous trials

**Total Implementation Time: 15 minutes**
**Difficulty: Easy**
**Prerequisites: Supabase project created**

---

**Ready to test!** 🚀





