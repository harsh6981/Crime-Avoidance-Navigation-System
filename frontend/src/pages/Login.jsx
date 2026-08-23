import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthCard from "../components/AuthCard";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle2, ArrowLeft } from "lucide-react";

export default function Login() {
  const { login }   = useAuth();
  const navigate    = useNavigate();

  const [email,         setEmail]         = useState("");
  const [password,      setPassword]      = useState("");
  const [rememberMe,    setRememberMe]    = useState(false);
  const [showPassword,  setShowPassword]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [successMsg,    setSuccessMsg]    = useState("");

  // ── Email / Password submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      await login(email, password);
      setSuccessMsg("Logged in successfully! Redirecting…");
      setTimeout(() => navigate("/"), 900);   // → dashboard (map)
    } catch (err) {
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  // ── After Google popup succeeds → navigate to dashboard ──
  const handleGoogleSuccess = () => navigate("/");

  // ── After Google popup fails → show error ──
  const handleGoogleError = (msg) => setError(msg);

  return (
    <AuthCard
      title="Welcome Back"
      subtitle="Sign in to access your saved routes & guardian monitors"
      leftPanelText="SafePath — Navigate Safely. Travel Smarter."
    >
      {/* ── Back to SafePath Button ── */}
      <button
        type="button"
        onClick={() => navigate("/")}
        style={{
          display:        "flex",
          alignItems:     "center",
          gap:            "6px",
          background:     "transparent",
          border:         "none",
          color:          "#64748b",
          fontSize:       "0.8rem",
          fontWeight:     600,
          cursor:         "pointer",
          padding:        "0",
          marginBottom:   "20px",
          transition:     "color 0.2s ease",
          fontFamily:     "inherit",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#22c55e")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#64748b")}
      >
        <ArrowLeft size={15} />
        Back to SafePath
      </button>

      {/* ── Success toast ── */}
      {successMsg && (
        <div style={{
          background: "rgba(34, 197, 94, 0.15)",
          border: "1px solid #22c55e",
          color: "#22c55e",
          padding: "12px 16px",
          borderRadius: "12px",
          fontSize: "0.85rem",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}>
          <CheckCircle2 size={18} /> {successMsg}
        </div>
      )}

      {/* ── Error toast ── */}
      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.15)",
          border: "1px solid #ef4444",
          color: "#ef4444",
          padding: "12px 16px",
          borderRadius: "12px",
          fontSize: "0.85rem",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "16px",
        }}>
          <AlertCircle size={18} /> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Email */}
        <div className="input-group">
          <div className="input-icon-wrapper"><Mail size={16} color="#94a3b8" /></div>
          <input
            className="input-field"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {/* Password */}
        <div className="input-group" style={{ position: "relative" }}>
          <div className="input-icon-wrapper"><Lock size={16} color="#94a3b8" /></div>
          <input
            className="input-field"
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <div
            onClick={() => setShowPassword(!showPassword)}
            style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#94a3b8" }}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </div>
        </div>

        {/* Remember Me & Forgot Password */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "0.8rem", color: "#94a3b8" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              style={{ accentColor: "#22c55e", cursor: "pointer" }}
            />
            Remember me
          </label>
          <span
            style={{ color: "#3b82f6", cursor: "pointer", fontWeight: 600 }}
            onClick={() => alert("Password reset link sent to your email!")}
          >
            Forgot password?
          </span>
        </div>

        {/* Sign In Button */}
        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: "6px" }}>
          {loading ? "Signing In…" : "Sign In"}
        </button>

        {/* ── OR Divider ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "4px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* ── Google Sign-In ── */}
        <GoogleAuthButton onSuccess={handleGoogleSuccess} onError={handleGoogleError} />
      </form>

      {/* ── Switch to Signup ── */}
      <div style={{ textAlign: "center", marginTop: "24px", fontSize: "0.82rem", color: "#94a3b8" }}>
        Don't have an account?{" "}
        <span
          style={{ color: "#22c55e", fontWeight: 700, cursor: "pointer" }}
          onClick={() => navigate("/signup")}
        >
          Create Account
        </span>
      </div>
    </AuthCard>
  );
}
