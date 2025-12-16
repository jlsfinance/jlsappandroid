# JLS Finance Suite

## Overview
A React + TypeScript multi-tenant finance management application built with Vite with Capacitor for Android app generation. The application provides loan management, customer tracking, EMI calculations, and financial reporting features with support for multiple finance companies per user.

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
├── android/             # Capacitor Android project (download for APK build)
├── components/          # Reusable UI components
│   └── CompanySelector.tsx  # Company switching dropdown
├── contexts/            # React contexts
│   └── CompanyContext.tsx   # Global company state management
├── pages/               # Route page components
│   ├── SelectCompany.tsx    # Company selection after login
│   └── CreateCompany.tsx    # Create new company form
├── services/            # Data services
├── App.tsx              # Main application with routing
├── firebaseConfig.ts    # Firebase configuration
├── capacitor.config.ts  # Capacitor configuration
├── index.tsx            # React entry point
├── index.html           # HTML template
├── types.ts             # TypeScript type definitions
└── vite.config.ts       # Vite configuration
```

## Multi-Tenancy Architecture (Dec 2025)
The app supports multiple finance companies per user:
- **Company**: Each user can create multiple companies with separate business data
- **CompanyUser**: Links users to companies they have access to with role-based access (owner, admin, user)
- **Data Isolation**: All business data (customers, loans, transactions) is filtered by `companyId`
- **Company Switching**: Users can switch between companies using the dropdown in the header
- **Flow**:
  1. New users register and create their first company in the signup flow
  2. After login, users select which company to work with
  3. All subsequent operations are scoped to the active company

### Firestore Collections
- `companies`: Company profiles (name, address, contact info)
- `company_users`: User-company associations with roles
- `customers`: Customer records with `companyId` field
- `loans`: Loan records with `companyId` field
- `partner_transactions`: Partner transactions with `companyId` field
- `expenses`: Expense records with `companyId` field

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
1. **Multi-Company Support** - One user can create and manage multiple finance companies with complete data isolation
2. **Company Switching** - Easy switching between companies via dropdown in header
3. **Foreclosure PDF Certificate** - Auto-generates detailed PDF when loan is pre-closed
4. **Extra Payment Feature** - Custom amount payments in Due List with PDF preview
5. **Amount Received Checkbox** - Foreclosure amount auto-added to cash ledger when confirmed
6. **Undo Foreclosure** - Restore pre-closed loans to active status

## Configuration
- Vite is configured to allow all hosts for Replit proxy compatibility
- Uses HashRouter for client-side routing
- Firebase authentication is required for protected routes
- Capacitor configured with appId: com.jls.financesuite

## Deployment
- Static deployment configured
- Build command: `npm run build`
- Public directory: `dist`