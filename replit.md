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

## Android App
- Download `android` folder and open in Android Studio
- Build APK: Build > Build Bundle(s) / APK(s) > Build APK(s)
- APK location: `android/app/build/outputs/apk/debug/app-debug.apk`

## Recent Features (Dec 2025)
1. **Foreclosure PDF Certificate** - Auto-generates detailed PDF when loan is pre-closed with full loan details, payment summary, and foreclosure calculation
2. **Extra Payment Feature** - In Due List, can now enter custom amount higher than EMI for extra payments, with PDF preview before save and auto-download after
3. **Amount Received Checkbox** - When foreclosing a loan, checkbox to confirm amount received. When checked, the foreclosure amount is automatically added as credit to cash ledger
4. **Undo Foreclosure** - For loans that were pre-closed, an "Undo Foreclosure" button restores the loan to active status with pending EMIs
5. **Loan Disbursal** - Added Loan Disbursal option in Tools page. Approved loans can be disbursed with date selection, automatic EMI schedule generation, and WhatsApp notification

## Configuration
- Vite is configured to allow all hosts for Replit proxy compatibility
- Uses HashRouter for client-side routing
- Firebase authentication is required for protected routes
- Capacitor configured with appId: com.jls.financesuite

## Deployment
- Static deployment configured
- Build command: `npm run build`
- Public directory: `dist`
