# JLS Finance Suite — Full Audit Report

**Audit Date:** 2026-07-24
**App:** JLS Suite v1.0.20 (versionCode 22)
**Platform:** Android (Capacitor v7.4.4)
**Package:** com.jls.loanbook

---

## EXECUTIVE SUMMARY

This audit covers **Performance**, **UX**, **Android Release Readiness**, and **Play Store Compliance**. A total of **34 findings** were identified: **2 Critical**, **6 High**, **14 Medium**, **12 Low**.

The most critical issues involve **hardcoded keystore credentials in version control** and **minification/ProGuard disabled for release builds**. Several performance concerns exist around bundle size and the 5-second splash screen. UX is generally good with proper loading/error patterns, but missing offline awareness and `alert()` calls degrade the experience.

---

## CRITICAL

### C1. Hardcoded Keystore Credentials in `gradle.properties` (Security)
- **File:** `android/gradle.properties` — lines 29–32
- **Issue:** Keystore password (`123456`), key alias, and key password are stored in **plaintext** and committed to version control.
- **Impact:** Anyone with repo access can sign releases as the developer. This is a severe security vulnerability.
- **Fix:** Remove these lines. Use `~/.gradle/gradle.properties` or environment variables on the CI server. Add `upload-key.jks` to `.gitignore`.

### C2. ProGuard/R8 Minification Disabled for Release Build
- **File:** `android/app/build.gradle` — lines 37–38
- **Issue:** `minifyEnabled false` and `shrinkResources false` in the `release` build type. ProGuard rules exist at `android/app/proguard-rules.pro` but are **never applied**.
- **Impact:** APK/AAB size is ~30–50% larger than necessary. Java/ Kotlin code is not obfuscated, making reverse engineering trivial.
- **Fix:** Set `minifyEnabled true` and `shrinkResources true`. Test thoroughly after enabling — the proguard rules file looks comprehensive.

---

## HIGH

### H1. Bundle Size — 2.1 MB Total JS (Mobile Concern)
- **File:** Built output in `dist/assets/`
- **Issue:** Total JS across chunks is **2.1 MB** (uncompressed):
  - `index-Cu3uD48X.js` — 875 KB (main app)
  - `vendor-firebase-Cd4VI_c8.js` — 584 KB (Firebase)
  - `vendor-pdf-hNnKGPve.js` — 398 KB (jsPDF)
  - `vendor-motion-B7is8PWk.js` — 117 KB (framer-motion)
- **Impact:** Slow cold starts on low-end Android devices. Initial download/install size is inflated.
- **Fix:**
  - Lazy-load jsPDF (`jspdf` + `jspdf-autotable`) since it's only used on specific pages.
  - Consider replacing framer-motion with CSS animations (many in the app are already pure CSS).
  - Enable code splitting more aggressively; the Dashboard imports jsPDF at the top level but only uses it on one action.

### H2. Logo Asset Too Large (539 KB)
- **File:** `dist/assets/logo-DI42e9mg.png`
- **Issue:** The logo PNG is 539 KB. For mobile, this should be < 50 KB.
- **Impact:** Slower splash screen load and increased install size.
- **Fix:** Compress to WebP at ~80% quality or reduce dimensions.

### H3. 5-Second Splash Screen Delays App Start
- **File:** `components/AnimatedSplash.tsx` — line 12
- **Issue:** `setTimeout(onFinish, 5000)` — the animated splash runs for a full 5 seconds. The Capacitor splash screen is configured for 1500ms (`capacitor.config.ts` line 12), but the React-level animated splash doubles this.
- **Impact:** Users wait ~5+ seconds before seeing any content. High risk of early abandonment.
- **Fix:** Reduce to 2000ms max, or make skipable. Consider combining Capacitor splash with the animated intro.

### H4. CDN TailwindCSS Loaded in Production (Redundant & Slow)
- **File:** `index.html` — line 17
- **Issue:** `<script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>` loads the full Tailwind CSS CDN script (~300 KB runtime). Yet Tailwind v4 is already compiled into `index-CbA-1P-u.css` (154 KB) during build.
- **Impact:** Double-loading Tailwind — once as pre-built CSS, once as a runtime CDN script. The CDN script disables the pre-built utility classes and re-generates them from scratch. Total CSS-related download: ~450 KB instead of 154 KB.
- **Fix:** **Remove the CDN script tag** from `index.html`. The build pipeline already handles Tailwind via `@tailwindcss/postcss` and `tailwindcss` v4 devDependencies.

### H5. `checkReleaseBuilds false` Suppresses Lint Errors
- **File:** `android/app/build.gradle` — lines 49–52
- **Issue:** `lintOptions { checkReleaseBuilds false; abortOnError false }` hides all lint warnings and errors during release builds.
- **Impact:** Potential issues like missing translations, unused resources, or permission problems will go unnoticed until Play Store review rejection.
- **Fix:** Remove or set `checkReleaseBuilds true` and fix any lint errors properly.

### H6. `alert()` Used for User-Facing Errors (Runtime UX)
- **Files:** Multiple locations:
  - `pages/Dashboard.tsx` — lines 70, 75, 115 (alert after sending notifications)
  - `services/NotificationService.ts` — line 53
  - `pages/Loans.tsx` — lines 223, 226 (delete confirmation uses alert)
- **Impact:** Native `alert()` dialogs are jarring, unstyled, and not dismissable programmatically. This breaks the app's polished Material Design UX.
- **Fix:** Replace with inline toast/snackbar or modal components. `alert()` is acceptable only for critical errors during development.

---

## MEDIUM

### M1. No Offline Indicator / Offline Support Notice
- **Files:** `App.tsx`, all pages
- **Issue:** The app uses Firestore with persistent local cache (`firebaseConfig.ts` lines 30–32), but there is **no UI indicator** when the user is offline. Data may appear stale without explanation.
- **Fix:** Add an `onLine` listener that shows a banner: "You are offline — showing cached data."

### M2. Firestore Listener at App Root Never Unsubscribes on Unmount
- **File:** `components/NotificationListener.tsx` — line 51
- **Issue:** The `onSnapshot` listener on the `notifications` collection is set up and cleaned up correctly in the return function. However, the listener queries with `where('recipientId', 'in', recipients)` — if `recipients` is empty (no user and no customer), the `in` query with an empty array will fail. Firestore `in` queries require at least 1 element.
- **Fix:** Guard the listener setup: if `recipients.length === 0`, skip creating the query.

### M3. Vite Dev Server Exposed on All Interfaces
- **File:** `vite.config.ts` — lines 10–11
- **Issue:** `host: '0.0.0.0'` and `allowedHosts: true` in the dev server config. This is needed for device testing but should be flagged — if accidentally deployed or left running on a network, anyone can access the dev server.
- **Severity:** Low for prod (only in dev mode), Medium as a configuration risk.
- **Fix:** Add a comment that this is for device testing only. Consider using a tunnel solution instead.

### M4. `window.location.href` for Phone Links — Blocks App
- **File:** `pages/Customers.tsx` — line 219
- **Issue:** Uses `window.location.href = 'tel:${customer.phone}'` instead of the Capacitor plugin or an `<a href="tel:...">` tag. On Android, this leaves the app and opens the dialer with no way to return gracefully.
- **Fix:** Use `<a href="tel:${customer.phone}">` or the Capacitor Share plugin for a better UX.

### M5. Menu Accessibility — Icon-Only Buttons Without Labels
- **Files:** Multiple — e.g., `pages/Dashboard.tsx` line 602, `pages/Loans.tsx` lines 664–672, `pages/Customers.tsx` line 216
- **Issue:** Buttons using only `<span class="material-symbols-outlined">` icons with no `aria-label` or `title` attribute. Screen readers cannot describe their action.
- **Fix:** Add `aria-label="Menu"`, `aria-label="Delete"`, etc. to all icon-only buttons.

### M6. `process.env.GEMINI_API_KEY` Inlined at Build Time
- **File:** `vite.config.ts` — lines 18–19
- **Issue:** `process.env.GEMINI_API_KEY` is inlined via `define`. This exposes the API key in the client-side bundle. If this key has any cost implications, it's a risk.
- **Fix:** Ensure the Gemini key is restricted (HTTP referrer or Android app restrictions) in Google Cloud Console, or proxy through a Firebase Function.

### M7. `clearIndexedDbPersistence()` Called After Writes
- **File:** `services/dataService.ts` — lines 24–30, called at lines 103, 114
- **Issue:** `clearIndexedDbPersistence()` is called after mutation operations (create/delete). This function clears ALL offline cache, not just the modified documents. It also throws if there are active listeners/tabs open. The `catch` block silently swallows errors.
- **Impact:** Users will lose offline cache after every write. If a listener is active, this throws and the cache is not cleared, leading to stale reads.
- **Fix:** Do not clear the full cache. Firestore's local cache auto-updates via the SDK. Only call this if there is a specific corruption issue.

### M8. App Version Mismatch (constants.ts vs build.gradle)
- **Files:** `constants.ts` line 2 (`v1.0.8`) vs `package.json` line 4 / `build.gradle` line 17 (`1.0.20`)
- **Issue:** `APP_VERSION` in constants.ts is `"v1.0.8"` but the actual app version is `1.0.20`. Users see the wrong version in Settings.
- **Fix:** Sync the version string or derive it from `package.json` during build.

### M9. No `Content-Rating` Metadata in AAB
- **File:** `android/app/build.gradle`, no content rating configuration
- **Issue:** The Play Console listing says "Everyone" for content rating, but there is no programmatic enforcement. Not a blocker, but could cause issues if Play Store re-rating occurs.
- **Fix:** No code change needed — this is configured in Play Console. Keep the "Everyone" rating consistent with the non-lending nature.

### M10. No Rate Limiting on WhatsApp Reminder Sending
- **File:** `pages/Dashboard.tsx` — lines 82–121
- **Issue:** The `handleSendWhatsappReminders` sends reminders with only a 1.2s delay between sends. For 30+ customers, this runs for 36+ seconds with no user feedback besides a "Sending..." state. Could trigger WhatsApp spam detection.
- **Fix:** Add a progress indicator showing `Sent X / Y`. Respect WhatsApp's rate limits (maybe 1 per 2 seconds).

### M11. `pendingPurchaseCall` in Billing Plugin is Mutable with No Timeout
- **File:** `android/app/src/main/java/com/jls/loanbook/plugins/GooglePlayBillingPlugin.java`
- **Issue:** `pendingPurchaseCall` is a mutable field with no timeout. If a user starts a purchase, switches apps, and never returns, the callback is never resolved/rejected. Subsequent purchases will overwrite the old pending call silently.
- **Fix:** Add a timeout (e.g., 60s) after which the pending call is rejected. Check if a call is already pending before allowing a new purchase.

### M12. No `npm audit` or Dependency Vulnerability Check
- **File:** `package.json`
- **Issue:** No audit script in `package.json` or in the CI (`codemagic.yaml`). Dependencies may contain known vulnerabilities.
- **Fix:** Add `npm audit` to the CI pipeline.

### M13. `localStorage` Used Extensively for Feature Gating
- **Files:** `services/NotificationService.ts` (dedup keys), `components/NotificationListener.tsx` (listener guard), `pages/Dashboard.tsx` (WhatsApp month count)
- **Issue:** Multiple localStorage keys are set but **never cleaned up**. Over time, the keys accumulate and may cause storage bloat or unexpected behavior across sessions.
- **Fix:** Clean up stale keys or use an in-memory Set with shorter TTL.

### M14. No HTTPS Enforcement Warning for Web Version
- **File:** `capacitor.config.ts` line 8
- **Issue:** `androidScheme: 'https'` is set, which is correct for Capacitor. But the app also runs as a web app (Vite dev server and `base: './'`). On HTTP, any API calls including Firebase credentials could be intercepted.
- **Fix:** Add a warning in the console when served over HTTP in production mode.

---

## LOW

### L1. `Safe Area` CSS Variables Typo in `index.css`
- **File:** `index.css` — line 15
- **Issue:** `--ion-safe-area-top: env(safe-area-inset-top, 0px)` — Ionic-specific variable in a non-Ionic app. Doesn't break anything but is dead code.

### L2. Custom Scrollbar CSS Adds 2 KB to Bundle
- **File:** `index.css` — lines 51–71
- **Issue:** Custom scrollbar styles for an app that hides scrollbars on the main container. The styles are never seen on most screens.

### L3. `console.warn` Fallback for Permissions Not Actionable
- **File:** `components/PermissionRequestor.tsx` — lines 20, 29, 37, 47
- **Issue:** Permission failures are logged to console with no user feedback. Users whose permissions are denied won't know why features don't work.

### L4. `CustomerSessionRedirect` Uses `localStorage` for Auth State
- **File:** `App.tsx` — line 123
- **Issue:** The `customerPortalId` is stored in `localStorage` and used for session redirect. This is vulnerable to XSS but also means clearing browser data breaks the redirect. Not a critical issue since the auth state is also on Firebase.

### L5. No Service Worker / PWA Registration
- **File:** `index.html` — no `<script>` for service worker registration
- **Issue:** Despite Firestore offline cache being configured, there is no service worker for PWA offline support. The web version will not load at all if the device is offline.

### L6. `material-symbols-outlined` Font Downloaded from Google Fonts (No Local Fallback)
- **File:** `index.html` — lines 15–16
- **Issue:** Material Symbols are loaded from `fonts.googleapis.com`. If the device is offline, icons will not render. This affects all navigation and action buttons.
- **Fix:** Bundle the icon font or host it alongside the app for offline support.

### L7. Gradient Text Uses `bg-clip-text` Without `text-fill-color` Fallback
- **Files:** `pages/Dashboard.tsx` line 694, `pages/Loans.tsx` line 601
- **Issue:** `bg-clip-text text-transparent bg-gradient-to-r` may not render correctly on older WebViews (Android 7–8). The text becomes invisible if the gradient fails.
- **Fix:** Add a solid `color` fallback before the gradient classes.

### L8. `autoTable` Uses `any` Types Extensively
- **File:** `pages/Loans.tsx` — lines 315, 474–545
- **Issue:** The PDF generation code heavily uses `as any` casts and `any[]` arrays. This bypasses TypeScript's type checking and could lead to runtime errors if data shapes change.

### L9. `deleteDoc` Cascading Without Transaction
- **File:** `pages/Loans.tsx` — lines 211–219
- **Issue:** Deleting a loan also deletes associated ledger entries, but this is not done in a Firestore transaction. If the process fails mid-way, ledger entries could be orphaned.
- **Fix:** Use `runTransaction` for multi-document deletion.

### L10. Hardcoded Google Client ID Exposed in Bundle
- **Files:** `capacitor.config.ts` line 30, `App.tsx` line 144, `firebaseConfig.ts` line 8
- **Issue:** Google Sign-In client ID and Firebase API key are hardcoded. For a mobile app this is expected (public-facing), but should be confirmed to have proper restriction in Google Cloud Console (Android package name + SHA-1 restriction for OAuth).

### L11. `handleSendNotification` Shows Unescaped Emoji in Alert
- **File:** `pages/Dashboard.tsx` — line 70
- **Issue:** `alert("Notification Sent Successfully! 🚀")` — the rocket emoji may render differently across platforms. Trivial issue.

### L12. No `android:largeHeap` in Manifest
- **File:** `AndroidManifest.xml`
- **Issue:** No `android:largeHeap="true"` on the `<application>` tag. For a financial data app that processes large arrays of loan/deposit data, memory pressure could cause crashes on low-end devices.
- **Fix:** Add `android:largeHeap="true"` if the app consistently uses > 128 MB heap.

---

## PLAY STORE COMPLIANCE CHECKLIST

| Requirement | Status | Notes |
|---|---|---|
| Privacy Policy | ✅ PASS | `privacy-policy.html` + in-app `Privacy.tsx` at `/privacy` |
| Terms of Service | ✅ PASS | `Terms.tsx` at `/terms` |
| Account Deletion | ✅ PASS | Settings page has "Delete Account" |
| Non-Lending Disclosure | ✅ PASS | Prominent in both privacy policy and terms |
| Content Rating ("Everyone") | ✅ PASS | Configured in store listing |
| Category (Finance) | ✅ PASS | Appropriate |
| Ads Declaration | ✅ PASS | No ads — no ad SDKs in dependencies |
| Google Play Billing | ✅ PASS | Custom plugin integrated |
| Push Notification Permission | ✅ PASS | `POST_NOTIFICATIONS` in manifest |
| Camera Permission | ✅ PASS | With `required="false"` feature flag |
| `android:exported="true"` on Launcher | ✅ PASS | Correctly set on main activity |
| `usesCleartextTraffic="false"` | ✅ PASS | Set in manifest |
| Debuggable flag | ⚠️ NOT EXPLICIT | Not set in `<application>` — defaults to false for release builds but should be explicit |
| Minification | ❌ FAIL | `minifyEnabled false` |
| Keystore in VCS | ❌ FAIL | Credentials exposed in `gradle.properties` |

---

## ANDROID MANIFEST REVIEW

| Attribute | Value | Assessment |
|---|---|---|
| `allowBackup` | `true` | ⚠️ Medium risk — app data can be backed up via ADB. Consider `false` or `android:fullBackupContent` |
| `usesCleartextTraffic` | `false` | ✅ Good |
| `launchMode` | `singleTask` | ✅ Correct for Capacitor |
| `exported` (Activity) | `true` | ✅ Required for launcher |
| `exported` (FileProvider) | `false` | ✅ Correct |
| Internet permission | Present | ✅ Required |
| Camera permission | Present | ✅ With `required="false"` |
| POST_NOTIFICATIONS | Present | ✅ Android 13+ |
| READ_MEDIA_IMAGES | Present | ✅ Android 13+ |
| Debuggable | Not set | ⚠️ Defaults to false for release, good |
| FCM icon | `ic_stat_jls` | ✅ Configured |
| FCM color | `colorPrimary` | ✅ Configured |

---

## TOP RECOMMENDATIONS (By Priority)

1. **IMMEDIATE:** Remove keystore passwords from `gradle.properties` and add to `.gitignore`. Rotate the keystore if it has been pushed.
2. **IMMEDIATE:** Enable `minifyEnabled true` and `shrinkResources true` for release builds.
3. **BEFORE RELEASE:** Remove the CDN Tailwind script from `index.html` (line 17) — it doubles CSS bundle size.
4. **BEFORE RELEASE:** Reduce splash screen timeout from 5s to 2s max.
5. **BEFORE RELEASE:** Compress logo PNG to WebP (< 50 KB).
6. **SOON:** Lazy-load jsPDF and framer-motion to reduce initial bundle.
7. **SOON:** Fix the `clearIndexedDbPersistence()` approach — it breaks offline cache on every write.
8. **SOON:** Replace `alert()` calls with proper toast/modal components.
9. **SOON:** Sync `APP_VERSION` in `constants.ts` with actual app version.
10. **LATER:** Evaluate switching from framer-motion to CSS-only animations to save 117 KB.

---

*End of audit — 34 findings (2 Critical, 6 High, 14 Medium, 12 Low)*
