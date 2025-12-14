# JLS Finance Suite

## Overview
A React + TypeScript finance management application built with Vite. The application provides loan management, customer tracking, EMI calculations, and financial reporting features.

## Tech Stack
- React 19 with TypeScript
- Vite 6 for build tooling
- Firebase for authentication
- Tailwind CSS (via CDN) for styling
- React Router for navigation
- jsPDF for PDF generation

## Project Structure
```
/
├── components/       # Reusable UI components
├── pages/           # Route page components
├── services/        # Data services
├── App.tsx          # Main application with routing
├── firebaseConfig.ts # Firebase configuration
├── index.tsx        # React entry point
├── index.html       # HTML template
├── types.ts         # TypeScript type definitions
└── vite.config.ts   # Vite configuration
```

## Development
- Run: `npm run dev` (starts on port 5000)
- Build: `npm run build` (outputs to dist/)

## Configuration
- Vite is configured to allow all hosts for Replit proxy compatibility
- Uses HashRouter for client-side routing
- Firebase authentication is required for protected routes

## Deployment
- Static deployment configured
- Build command: `npm run build`
- Public directory: `dist`
