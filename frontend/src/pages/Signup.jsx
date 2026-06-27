import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AuthCard from "../components/AuthCard";
import GoogleAuthButton from "../components/GoogleAuthButton";
import { User, Mail, Phone, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

export default function Signup() {
  const { signup }  = useAuth();
  const navigate    = useNavigate();

  const [formData, setFormData] = useState({
    name:             "",
    email:            "",
    phone:            "",
    password:         "",
    confirmPassword:  "",
    guardianContact:  "",
    agreeTerms:       false,
  });

  const [showPassword,        setShowPassword]        = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading,             setLoading]             = useState(false);
  const [error,               setError]               = useState("");
  const [successMsg,          setSuccessMsg]          = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  // ── Email / Password signup ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");

    if (!formData.name || !formData.email || !formData.phone || !formData.password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!formData.agreeTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setLoading(true);
    try {
      await signup({
        name:            formData.name,
        email:           formData.email,
        phone:           formData.phone,
        password:        formData.password,
        guardianContact: formData.guardianContact,
      });
      setSuccessMsg("Account created! Redirecting to SafePath…");
      setTimeout(() => navigate("/"), 1200);   // → dashboard (map)
    } catch (err) {
      setError(err.message || "Failed to create account. Email may already exist.");
    } finally {
      setLoading(false);
    }
  };

  // ── After Google popup succeeds ──
  const handleGoogleSuccess = () => navigate("/");
  const handleGoogleError   = (msg) => setError(msg);

  return (
    <AuthCard
      title="Create Account"
      subtitle="Sign up to start navigating with AI safety scores"
      leftPanelText="SafePath — Navigate Safely. Travel Smarter."
    >
      {/* ── Back to SafePath Button ── */}
      <button
        type="button"
        onClick={() => navigate("/")}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "6px",
          background:   "transparent",
          border:       "none",
          color:        "#64748b",
          fontSize:     "0.8rem",
          fontWeight:   600,
          cursor:       "pointer",
          padding:      "0",
          marginBottom: "20px",
          transition:   "color 0.2s ease",
          fontFamily:   "inherit",
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

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* Full Name */}
        <div className="input-group">
          <div className="input-icon-wrapper"><User size={16} color="#94a3b8" /></div>
          <input className="input-field" type="text" name="name" placeholder="Full Name"
            value={formData.name} onChange={handleChange} required />
        </div>

        {/* Email */}
        <div className="input-group">
          <div className="input-icon-wrapper"><Mail size={16} color="#94a3b8" /></div>
          <input className="input-field" type="email" name="email" placeholder="Email Address"
            value={formData.email} onChange={handleChange} required />
        </div>

        {/* Phone */}
        <div className="input-group">
          <div className="input-icon-wrapper"><Phone size={16} color="#94a3b8" /></div>
          <input className="input-field" type="tel" name="phone" placeholder="Phone Number (+91…)"
            value={formData.phone} onChange={handleChange} required />
        </div>

        {/* Guardian Contact */}
        <div className="input-group">
          <div className="input-icon-wrapper"><ShieldCheck size={16} color="#22c55e" /></div>
          <input className="input-field" type="tel" name="guardianContact"
            placeholder="Guardian Contact (Optional for SOS)"
            value={formData.guardianContact} onChange={handleChange} />
        </div>

        {/* Password */}
        <div className="input-group" style={{ position: "relative" }}>
          <div className="input-icon-wrapper"><Lock size={16} color="#94a3b8" /></div>
          <input className="input-field" type={showPassword ? "text" : "password"}
            name="password" placeholder="Password (min 6 characters)"
            value={formData.password} onChange={handleChange} required />
          <div onClick={() => setShowPassword(!showPassword)}
            style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#94a3b8" }}>
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </div>
        </div>

        {/* Confirm Password */}
        <div className="input-group" style={{ position: "relative" }}>
          <div className="input-icon-wrapper"><Lock size={16} color="#94a3b8" /></div>
          <input className="input-field" type={showConfirmPassword ? "text" : "password"}
            name="confirmPassword" placeholder="Confirm Password"
            value={formData.confirmPassword} onChange={handleChange} required />
          <div onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            style={{ position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)", cursor: "pointer", color: "#94a3b8" }}>
            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </div>
        </div>

        {/* Terms Checkbox */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.78rem", color: "#94a3b8", marginTop: "4px" }}>
          <input type="checkbox" name="agreeTerms" id="agreeTerms"
            checked={formData.agreeTerms} onChange={handleChange}
            style={{ accentColor: "#22c55e", cursor: "pointer" }} />
          <label htmlFor="agreeTerms" style={{ cursor: "pointer" }}>
            I agree to the <span style={{ color: "#22c55e", fontWeight: 600 }}>Terms of Service</span> &amp; <span style={{ color: "#22c55e", fontWeight: 600 }}>Privacy Policy</span>
          </label>
        </div>

        <button className="btn-primary" type="submit" disabled={loading} style={{ marginTop: "8px" }}>
          {loading ? "Creating Account…" : "Create Account"}
        </button>

        {/* ── OR Divider ── */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "4px 0" }}>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: "0.75rem", color: "#64748b", textTransform: "uppercase", fontWeight: 600 }}>OR</span>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* ── Google Sign-Up ── */}
        <GoogleAuthButton
          label="Sign up with Google"
          onSuccess={handleGoogleSuccess}
          onError={handleGoogleError}
        />
      </form>

      {/* ── Switch to Login ── */}
      <div style={{ textAlign: "center", marginTop: "20px", fontSize: "0.82rem", color: "#94a3b8" }}>
        Already have an account?{" "}
        <span
          style={{ color: "#22c55e", fontWeight: 700, cursor: "pointer" }}
          onClick={() => navigate("/login")}
        >
          Sign In
        </span>
      </div>
    </AuthCard>
  );
}
