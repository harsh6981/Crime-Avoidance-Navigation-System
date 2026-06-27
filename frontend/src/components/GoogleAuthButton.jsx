import React, { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider, isConfigured } from "../config/firebase";
import { useAuth } from "../context/AuthContext";

/**
 * GoogleAuthButton
 * ─────────────────
 * Renders a "Continue with Google" button that:
 *  1. Triggers a Firebase Google Sign-In popup
 *  2. Sends the Firebase ID token to our Express backend /api/auth/google
 *  3. Stores the returned JWT and updates AuthContext
 *  4. Calls onSuccess() so the parent (Login / Signup) can redirect
 *
 * Props:
 *  onSuccess  — called after successful auth (no args)
 *  onError    — called with error message string on failure
 *  label      — optional button label (defaults to "Continue with Google")
 */
export default function GoogleAuthButton({ onSuccess, onError, label = "Continue with Google" }) {
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    if (!isConfigured) {
      // Firebase not configured yet — show helpful setup message
      if (onError) {
        onError(
          "Google Sign-In is not set up yet. " +
          "Copy frontend/.env.example → frontend/.env and add your Firebase project credentials."
        );
      }
      return;
    }

    setLoading(true);
    try {
      // Open the Google sign-in popup
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;

      // Get the Firebase ID token to send to our backend
      const idToken = await firebaseUser.getIdToken();

      // Send to Express backend — it will upsert user in MongoDB and return a JWT
      await loginWithGoogle(idToken, {
        name:           firebaseUser.displayName || "",
        email:          firebaseUser.email        || "",
        profilePicture: firebaseUser.photoURL     || "",
      });

      if (onSuccess) onSuccess();
    } catch (err) {
      // User closed the popup → not an error worth showing
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
        setLoading(false);
        return;
      }
      console.error("Google auth error:", err);
      if (onError) onError(err.message || "Google Sign-In failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleAuth}
      disabled={loading}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "10px",
        padding: "12px 16px",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.15)",
        background: loading
          ? "rgba(255,255,255,0.03)"
          : "rgba(255,255,255,0.06)",
        color: "#e2e8f0",
        fontSize: "0.88rem",
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        fontFamily: "inherit",
        opacity: loading ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!loading) {
          e.currentTarget.style.background = "rgba(255,255,255,0.1)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)";
          e.currentTarget.style.transform = "translateY(-1px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!loading) {
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
          e.currentTarget.style.transform = "translateY(0)";
        }
      }}
    >
      {/* Google "G" logo */}
      {!loading ? (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
      ) : (
        // Simple spinner while loading
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
          style={{ animation: "spin 0.8s linear infinite" }}>
          <circle cx="12" cy="12" r="10" fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10"/>
        </svg>
      )}
      {loading ? "Signing in…" : label}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}
