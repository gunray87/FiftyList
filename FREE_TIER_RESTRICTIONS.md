# Free Tier API Restrictions

## Summary of Changes

The free tier subscription has been updated to **completely disable all API calls**. Free tier users can only use the local hardcoded book/movie database.

---

## What Changed

### Before:
- **Free Tier:** Limited API access (20 calls/day to Google Books)
- **Premium Tier:** Full API access (1000 calls/day to multiple services)

### After:
- **Free Tier:** ❌ NO API access whatsoever
- **Premium Tier:** ✅ Full API access (books + movies)

---

## Updated Tier Comparison

### Free Tier (Basic) - $3.99/year
- ✅ Unlimited items (books/movies)
- ✅ Access to local hardcoded database (1000+ books, 500+ movies)
- ❌ NO online search (API calls blocked)
- ❌ NO enhanced search
- ❌ NO movie API search
- ❌ NO price tracking
- ❌ NO advanced recommendations
- ❌ NO priority support

**API Limits:**
- API calls per day: **0**
- Search providers: **None**
- Local database only

### Premium Tier - $2.99/month or $19.99/year
- ✅ Unlimited items
- ✅ Online book search (Google Books API)
- ✅ Enhanced multi-source search
- ✅ Movie search (TMDB + OMDb)
- ✅ Price tracking
- ✅ Advanced recommendations
- ✅ Priority support

**API Limits:**
- API calls per day: **1,000**
- Search providers: **Google Books, Open Library, Goodreads, TMDB, OMDb**

---

## Technical Implementation

### Files Modified:

1. **`/types/subscription.ts`**
   - Added `canSearchBooks` feature flag
   - Set free tier API limits to 0
   - Removed API providers from free tier
   - Updated feature detection logic

2. **`/utils/bookSearch.ts`**
   - Added documentation about Premium requirement
   - Maintained local database search (works for all tiers)

3. **`/utils/enhancedAPIService.ts`**
   - Blocks free tier from book API search
   - Returns error message requiring upgrade

4. **`/components/AddEditModal.tsx`**
   - Added subscription check before API search
   - Shows upgrade prompt for free users
   - Displays premium requirement message

---

## User Experience

### For Free Tier Users:

1. **Book Search:**
   - ✅ Can search local database (1000+ curated books)
   - ❌ "Search Online" button shows upgrade prompt
   - Shows: "🔒 Online search requires Premium"

2. **Movie Search:**
   - ✅ Can search local database (500+ curated movies)
   - ❌ API search shows: "Movie search requires Premium subscription"

3. **Manual Entry:**
   - ✅ Can still manually add any book/movie
   - ✅ All tracking features work normally
   - ✅ Full CRUD operations available

### For Premium Tier Users:

1. **Book Search:**
   - ✅ Local database search
   - ✅ Google Books API search
   - ✅ Enhanced multi-source search
   - ✅ Rich metadata (covers, descriptions, ratings)

2. **Movie Search:**
   - ✅ Local database search
   - ✅ TMDB API search
   - ✅ OMDb API integration
   - ✅ Movie posters, cast, descriptions

---

## Feature Flags

The subscription system uses these feature flags:

```typescript
interface SubscriptionFeatures {
  canSearchMovies: boolean;      // Premium only
  canUseEnhancedSearch: boolean; // Premium only
  canTrackPrices: boolean;       // Premium only
  canGetRecommendations: boolean; // Premium only
  hasUnlimitedItems: boolean;    // Both tiers
  hasPrioritySupport: boolean;   // Premium only
  canSearchBooks: boolean;       // Premium only (NEW)
}
```

### Free Tier Features:
```typescript
{
  canSearchMovies: false,
  canUseEnhancedSearch: false,
  canTrackPrices: false,
  canGetRecommendations: false,
  hasUnlimitedItems: true,
  hasPrioritySupport: false,
  canSearchBooks: false  // API search disabled
}
```

### Premium Tier Features:
```typescript
{
  canSearchMovies: true,
  canUseEnhancedSearch: true,
  canTrackPrices: true,
  canGetRecommendations: true,
  hasUnlimitedItems: true,
  hasPrioritySupport: true,
  canSearchBooks: true  // API search enabled
}
```

---

## Error Messages

### Free Tier Attempting Book API Search:
```
"Online book search requires Premium subscription. Upgrade to access Google Books API."
```

### Free Tier Attempting Movie API Search:
```
"Movie search requires Premium subscription. Upgrade to search movies with rich data."
```

### Enhanced API Service (Free Tier):
```
"Book API search requires Premium subscription. Free tier users can only search the local database."
```

---

## UI Changes

### Upgrade Prompt (Free Tier):
When free users try to search online, they see:

```
🔒 Online search requires Premium
Upgrade to search Google Books API with enhanced data
```

**Styling:**
- Bordered card with primary color
- Clear messaging
- Non-intrusive design
- Appears only when relevant

---

## Migration Notes

### For Existing Users:
- **No data loss** - all existing data preserved
- **Free tier users** - will notice "Search Online" no longer works
- **Premium users** - no changes, everything works as before

### For New Users:
- Free tier gets full app functionality
- Local database provides 1500+ items to discover
- Clear upgrade path when they want API access

---

## Testing

To test the free tier restrictions:

1. **Set user to free tier:**
```typescript
const subscription = {
  tier: 'free',
  status: 'active',
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  autoRenew: true
};
```

2. **Try to search online:**
   - Should see upgrade prompt
   - API search button disabled
   - Clear messaging about Premium requirement

3. **Set user to premium:**
```typescript
const subscription = {
  tier: 'premium',
  status: 'active',
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  autoRenew: true
};
```

4. **Try to search online:**
   - Should work normally
   - Full API access
   - Rich metadata returned

---

## Business Logic

### Why Remove Free Tier API Access?

1. **Cost Control:** API calls have quotas and potential costs
2. **Value Differentiation:** Clear premium benefit
3. **Local Database:** 1500+ items is substantial for free users
4. **Upgrade Incentive:** Natural conversion point

### Free Tier Still Provides Value:

- ✅ 1000+ curated books in local database
- ✅ 500+ curated movies in local database
- ✅ Full tracking functionality
- ✅ Unlimited items
- ✅ All progress tracking features
- ✅ Export functionality
- ✅ All UI features

---

## Developer Notes

### Checking Subscription in Code:

```typescript
import { useSubscription } from '@/hooks/useSubscription';

const { features } = useSubscription();

// Check if user can search books via API
if (features.canSearchBooks) {
  // Make API call
} else {
  // Show upgrade prompt or use local database
}

// Check if user can search movies via API
if (features.canSearchMovies) {
  // Make API call
} else {
  // Show premium requirement message
}
```

### Adding New Premium Features:

1. Add feature flag to `SubscriptionFeatures` interface
2. Update `getSubscriptionFeatures()` function
3. Add feature to premium tier in `SUBSCRIPTION_TIERS`
4. Check feature flag before allowing access
5. Show appropriate messaging for free users

---

## Related Files

- `/types/subscription.ts` - Subscription tier definitions
- `/hooks/useSubscription.tsx` - Subscription state management
- `/utils/bookSearch.ts` - Book search utilities
- `/utils/movieSearch.ts` - Movie search utilities
- `/utils/enhancedAPIService.ts` - API service with tier checks
- `/components/AddEditModal.tsx` - UI with subscription gates
- `/components/DataQualityGate.tsx` - Feature gating component

---

**Status:** ✅ All changes implemented and tested
**Impact:** Free tier users lose API access but retain full app functionality with local database
**Benefit:** Clear premium value proposition and better cost control
