# JLS Finance Suite

## Overview
A React + TypeScript finance management application built with Vite with Capacitor for Android app generation. The application provides loan management, customer tracking, EMI calculations, and financial reporting features.

## Tech Stack
- React 19 with TypeScript
- Vite 6 for build tooling
- Firebase for authentication and Firestore database
- Capacitor for Android app generation
- Tailwind CSS (via CDN) for styling
- React Router for navigation
- jsPDF for PDF generation

## Project Structure
```
/
├── android/         # Capacitor Android project (download for APK build)
├── components/      # Reusable UI components
├── pages/           # Route page components
├── services/        # Data services
├── App.tsx          # Main application with routing
├── firebaseConfig.ts # Firebase configuration
├── capacitor.config.ts # Capacitor configuration
├── index.tsx        # React entry point
├── index.html       # HTML template
├── types.ts         # TypeScript type definitions
└── vite.config.ts   # Vite configuration
```

## Development
- Run: `npm run dev` (starts on port 5000)
- Build: `npm run build` (outputs to dist/)
- Capacitor sync: `npm run cap:sync`
- Build + Sync: `npm run cap:build`

## Android App (Play Store Ready)
- **Full Guide**: See `ANDROID_BUILD_GUIDE.md` for detailed instructions
- **Capacitor Version**: 7.x (compatible with Node.js 20)
- **App ID**: com.jls.financesuite
- **Target SDK**: 35 (Android 15)
- **Min SDK**: 23 (Android 6.0)
- **Java Version**: 17 (required for Capacitor stability)
- **Gradle Version**: 8.4 (compatible with Java 17 and Capacitor 7)

### ✅ Capacitor Safe Area Implementation (Status Bar & Navigation Bar)
All of the following fixes are **already implemented** in the project:
1. **CSS Safe Area Padding** - `index.css` uses `env(safe-area-inset-top/bottom)` for automatic padding
2. **Material Design Theme** - `android/app/src/main/res/values/styles.xml` uses `Theme.MaterialComponents.DayNight.NoActionBar`
3. **System Window Handling** - `MainActivity.java` has `WindowCompat.setDecorFitsSystemWindows(true)` for proper window insets
4. **Sidebar Safe Area** - `Sidebar.tsx` component has explicit safe area padding with `env(safe-area-inset-*)`
5. **Scrollable Components** - Menu items have `overflow-y-auto` to prevent content cutoff
6. **Status Bar Configuration** - `capacitor.config.ts` has proper StatusBar plugin config with color matching

### Android Studio Setup Requirements:
1. **Java 17** - Set in Android Studio: Settings → Build, Execution, Deployment → Gradle → Gradle JDK = Java 17
2. **Android Studio Version**: Iguana or Hedgehog (current stable versions)
3. **Gradle**: 8.4 (already configured in gradle-wrapper.properties)
4. **SDK**: Android SDK Platform 35 with Build Tools 35.x

### Quick Build Steps:
1. Download entire project from Replit
2. Open `android` folder in Android Studio
3. If build fails:
   - File → Invalidate Caches & Restart
   - File → Sync with Gradle Files
4. Add `google-services.json` from Firebase Console to `android/app/`
5. Generate signing key: `keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jls-finance`
6. Build: Build > Generate Signed Bundle / APK > Android App Bundle
7. Upload AAB to Play Console

### Update App After Web Changes:
```bash
npm run build
npx cap sync android
```

## Recent Features (Dec 2025)
1. **Foreclosure PDF Certificate** - Auto-generates detailed PDF when loan is pre-closed with full loan details, payment summary, and foreclosure calculation
2. **Extra Payment Feature** - In Due List, can now enter custom amount higher than EMI for extra payments, with PDF preview before save and auto-download after
3. **Amount Received Checkbox** - When foreclosing a loan, checkbox to confirm amount received. When checked, the foreclosure amount is automatically added as credit to cash ledger
4. **Undo Foreclosure** - For loans that were pre-closed, an "Undo Foreclosure" button restores the loan to active status with pending EMIs
5. **Loan Disbursal** - Added Loan Disbursal option in Tools page. Approved loans can be disbursed with date selection, automatic EMI schedule generation, and WhatsApp notification
6. **Role-Based Company Access** - Users assigned admin/agent roles in a company now automatically see that company when they login, no need to add company again
7. **Customer Portal** - Customers can login using phone number (as both user ID and password) to view their loan details and EMI schedule
8. **UPI Payment for EMI** - Customer portal generates QR code and UPI payment link for EMI payments to 9413821007@superyes
9. **Enhanced Loan Top-up** - Top-up now asks for new duration (months), auto-generates new Loan Agreement PDF and Loan Card PDF with updated terms. Preserves the original EMI due day.
10. **Flexible EMI Due Date** - When disbursing a loan, can now select which day of month (1-28) EMI should be due instead of hardcoded 1st

## Configuration
- Vite is configured to allow all hosts for Replit proxy compatibility
- Uses HashRouter for client-side routing
- Firebase authentication is required for protected routes
- Capacitor configured with appId: com.jls.financesuite

## Deployment
- Static deployment configured
- Build command: `npm run build`
- Public directory: `dist`
