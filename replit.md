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

### Quick Build Steps:
1. Download entire project from Replit
2. Open `android` folder in Android Studio
3. Add `google-services.json` from Firebase Console
4. Generate signing key: `keytool -genkey -v -keystore release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jls-finance`
5. Build: Build > Generate Signed Bundle / APK > Android App Bundle
6. Upload AAB to Play Console

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

## Configuration
- Vite is configured to allow all hosts for Replit proxy compatibility
- Uses HashRouter for client-side routing
- Firebase authentication is required for protected routes
- Capacitor configured with appId: com.jls.financesuite

## Deployment
- Static deployment configured
- Build command: `npm run build`
- Public directory: `dist`
