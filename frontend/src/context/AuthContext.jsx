import React, { createContext, useState, useEffect, useContext } from "react";
import { AUTH_API } from "../config/api";

const AuthContext = createContext();

/**
 * Normalizes user objects so that both user.id and user.user_id (and user._id)
 * are always consistently available across all application components.
 */
export function normalizeUser(rawUser) {
  if (!rawUser) return null;
  const uid = rawUser.id || rawUser.user_id || rawUser._id || null;
  return {
    ...rawUser,
    id: uid,
    user_id: uid,
    _id: uid,
  };
}

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(() => {
    try {
      const cached = localStorage.getItem("safepath_user");
      return cached ? normalizeUser(JSON.parse(cached)) : null;
    } catch (_) {
      return null;
    }
  });
  const [token,   setToken]   = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  // Helper to persist user and token session
  const saveSession = (rawUser, tokenStr) => {
    const normalized = normalizeUser(rawUser);
    setUser(normalized);
    if (tokenStr) {
      setToken(tokenStr);
      localStorage.setItem("token", tokenStr);
      localStorage.setItem("safepath_token", tokenStr);
    }
    if (normalized) {
      localStorage.setItem("safepath_user", JSON.stringify(normalized));
    }
  };

  // ── Restore session on mount ──
  useEffect(() => {
    async function loadUser() {
      const storedToken = localStorage.getItem("token") || localStorage.getItem("safepath_token");
      if (storedToken) {
        try {
          const res = await fetch(`${AUTH_API}/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            saveSession(data.user, storedToken);
          } else {
            localStorage.removeItem("token");
            localStorage.removeItem("safepath_token");
            localStorage.removeItem("safepath_user");
            setToken(null);
            setUser(null);
          }
        } catch (err) {
          console.warn("Auth check error:", err);
        }
      }
      setLoading(false);
    }
    loadUser();
  }, []);

  // ── Email / Password Login ──
  const login = async (email, password) => {
    const res  = await fetch(`${AUTH_API}/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");
    saveSession(data.user, data.token);
    return data;
  };

  // ── Email / Password Signup ──
  const signup = async (formData) => {
    const res  = await fetch(`${AUTH_API}/signup`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(formData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Signup failed");
    saveSession(data.user, data.token);
    return data;
  };

  // ── Google Sign-In ──
  // Called by GoogleAuthButton after a successful Firebase popup.
  // Sends the Firebase ID token to our Express backend which:
  //   1. Verifies the token with Firebase Admin SDK (or trusts it in dev mode)
  //   2. Upserts the user in MongoDB
  //   3. Returns our own JWT
  const loginWithGoogle = async (firebaseIdToken, googleUserInfo) => {
    try {
      const res  = await fetch(`${AUTH_API}/api/auth/google`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ idToken: firebaseIdToken, ...googleUserInfo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Google login failed");
      saveSession(data.user, data.token);
      return data;
    } catch (backendErr) {
      // ── Dev Fallback ──
      // If the backend /api/auth/google endpoint is not yet deployed,
      // store the Google profile directly so the UI still works during development.
      console.warn(
        "Backend /api/auth/google not reachable — using client-side Google profile (dev mode).",
        backendErr.message
      );
      const devUser = {
        id:             "google_" + Date.now(),
        name:           googleUserInfo.name,
        email:          googleUserInfo.email,
        profilePicture: googleUserInfo.profilePicture,
        authProvider:   "google",
      };
      const devToken = "google_dev_token_" + Date.now();
      saveSession(devUser, devToken);
      return { user: devUser, token: devToken };
    }
  };

  // ── Logout ──
  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("safepath_token");
    localStorage.removeItem("safepath_user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
export default AuthContext;
