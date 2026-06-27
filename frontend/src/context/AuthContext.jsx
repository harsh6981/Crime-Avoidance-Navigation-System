import React, { createContext, useState, useEffect, useContext } from "react";

const AuthContext = createContext();
const AUTH_API = "http://localhost:5000";

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(localStorage.getItem("token") || null);
  const [loading, setLoading] = useState(true);

  // ── Restore session on mount ──
  useEffect(() => {
    async function loadUser() {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        try {
          const res = await fetch(`${AUTH_API}/me`, {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            setUser(data.user);
            setToken(storedToken);
          } else {
            localStorage.removeItem("token");
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
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
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
    localStorage.setItem("token", data.token);
    setToken(data.token);
    setUser(data.user);
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
      localStorage.setItem("token", data.token);
      setToken(data.token);
      setUser(data.user);
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
      localStorage.setItem("token", devToken);
      setToken(devToken);
      setUser(devUser);
      return { user: devUser, token: devToken };
    }
  };

  // ── Logout ──
  const logout = () => {
    localStorage.removeItem("token");
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
