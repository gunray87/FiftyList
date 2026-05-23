# Maintenance and updates

How to apply data, config, and dependency changes so FiftyList stays consistent from dev through App Store builds.

---

## 1. Offline book catalog (enriched JSON)

**What it is**  
Books for Suggestions and local “Add Book” search come from **`data/enriched_books_catalog.json`**, loaded and normalized by **`data/comprehensiveBookCatalog.ts`**. The giant inline book list was removed from `app/(tabs)/suggestions.tsx` in favor of this file.

**When you change it**  
Whenever you regenerate or replace `enriched_books.json` (or equivalent export) outside the repo:

1. Copy it into the app tree (recommended):

   ```bash
   npm run sync:enriched-books
   ```

   Defaults: `~/Downloads/enriched_books.json` → `data/enriched_books_catalog.json`  
   Or: `node scripts/sync-enriched-books.mjs /path/to/enriched_books.json`

2. **Commit** `data/enriched_books_catalog.json` (and any script/type tweaks) so CI and EAS use the same data.

3. **Ship a new native build** (TestFlight/App Store). The JSON is bundled at build time; installing an older binary will not pull in new catalog data.

**Why**  
Metro bundles static assets included in the project. Updating only your Downloads folder does not update the app until you sync → commit → rebuild.

**Movies**  
Hardcoded movies live in **`data/comprehensiveMovieCatalog.ts`** (`COMPREHENSIVE_MOVIE_DATA`), same pattern as the book catalog.

---

## 2. Environment variables (Expo public / EAS)

**What they affect**  
`EXPO_PUBLIC_*` values are compiled into the client at **build time** (not read from expo.dev at runtime).

**Examples in this repo**

- **RevenueCat** — `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (`appl_…`), Android `goog_…`, entitlement/package IDs (`eas.json` and/or EAS Dashboard **Production**).
- **LLM assist** — `EXPO_PUBLIC_ENABLE_LLM_ASSIST`, `EXPO_PUBLIC_LLM_PROXY_BASE_URL`.
- Other keys — see `.env.example`.

**When they change**

1. Set variables in **[EAS](https://expo.dev)** for the correct environment (**Production** for store builds), and/or keep `eas.json` `build.production.env` aligned with secrets policy.
2. Run a **new** `eas build` for iOS/Android. Existing installs keep the old baked-in env until users update.

**Why**  
There is no server push of `.env` into already-shipped binaries.

---

## 3. Dependencies and native modules

After `npm install` changes that affect native code (e.g. RevenueCat, new Expo modules):

- Run **`npx expo prebuild`** only if you use a workflow that relies on native projects; managed EAS builds usually pick up config from **`app.json` / plugins** automatically.
- Create a **new build** after lockfile / native-facing dependency bumps.

---

## 4. Quick checklist before a release

- [ ] Book catalog synced and committed (`data/enriched_books_catalog.json`).
- [ ] `eas.json` and EAS Production env vars match RevenueCat dashboard (entitlements, packages, **`appl_`/`goog_` keys only** — never ship secret/API keys meant for backends).
- [ ] LLM flags and proxy URL match the worker you intend to hit in production.
- [ ] Version / build number bumped in **`app.json`** (and store metadata) per store rules.
- [ ] Smoke test on a **release-profile** build: Suggestions books, Add Book search, subscriptions/restore if touched.

---

## 5. This update in one line

**Enriched books:** maintain **`data/enriched_books_catalog.json`** via **`npm run sync-enriched-books`**, commit it, rebuild the app — that is how catalog updates propagate to users.
