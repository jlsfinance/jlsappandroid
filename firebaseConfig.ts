import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, clearIndexedDbPersistence, getDocsFromCache, getDocsFromServer } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyB52JnNNz8ul7lajtCzhdQoC9zKr_ynk-Y",
  authDomain: "jls-finance-company.firebaseapp.com",
  projectId: "jls-finance-company",
  storageBucket: "jls-finance-company.firebasestorage.app",
  messagingSenderId: "550122742532",
  appId: "1:550122742532:web:542c5c87803b3d112ce651"
};

const app = initializeApp(firebaseConfig);

// Enable persistent offline cache so getDocsCached serves data instantly
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch {
  db = getFirestore(app); // already initialized
}

export { db };
export const auth = getAuth(app);
export const functions = getFunctions(app);