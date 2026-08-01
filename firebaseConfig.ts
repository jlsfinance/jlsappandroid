import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const firebaseConfig = {
  apiKey: "AIzaSyB52JnNNz8ul7lajtCzhdQoC9zKr_ynk-Y",
  authDomain: "jls-finance-company.firebaseapp.com",
  projectId: "jls-finance-company",
  storageBucket: "jls-finance-company.firebasestorage.app",
  messagingSenderId: "550122742532",
  appId: "1:550122742532:web:542c5c87803b3d112ce651"
};

const app = initializeApp(firebaseConfig);

if (typeof self !== 'undefined' && typeof self.location !== 'undefined') {
  if (import.meta.env.DEV) {
    // Local dev: fixed debug token so App-Check-enforced Firestore rules pass.
    // Register this EXACT string in Firebase console → App Check → Debug tokens (project jls-finance-company).
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = 'jls-dev-debug-token';
  }
  const appCheckKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY;
  if (appCheckKey || import.meta.env.DEV) {
    try {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckKey || 'dev-no-key'),
        isTokenAutoRefreshEnabled: true,
      });
    } catch {
      // App Check already initialized (e.g. Vite HMR re-run) — safe to ignore
    }
  }
}

let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  db = getFirestore(app);
}

export { db };
export const auth = getAuth(app);
export const functions = getFunctions(app);
