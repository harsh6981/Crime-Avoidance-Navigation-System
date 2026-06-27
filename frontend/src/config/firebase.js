// ── Firebase Configuration ──
// To enable Google Auth, create a .env file in the frontend/ folder with:
//
//   VITE_FIREBASE_API_KEY=your_api_key
//   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
//   VITE_FIREBASE_PROJECT_ID=your_project_id
//   VITE_FIREBASE_APP_ID=your_app_id
//
// Get these values from: https://console.firebase.google.com
//  → Your Project → Project Settings → Web App → SDK Config

import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID|| "",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "",
};

// Only initialise if we have real config values
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app = null;
let auth = null;
let googleProvider = null;
let analytics = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  googleProvider = new GoogleAuthProvider();
  analytics = getAnalytics(app);
  googleProvider.addScope("profile");
  googleProvider.addScope("email");
} else {
  console.warn(
    "⚠️  Firebase is not configured. " +
    "Copy frontend/.env.example to frontend/.env and fill in your Firebase project values " +
    "to enable Google Sign-In."
  );
}


export { auth, googleProvider, isConfigured };
