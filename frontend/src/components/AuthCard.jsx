import React from "react";
import { Shield, Sparkles } from "lucide-react";

export default function AuthCard({ children, title, subtitle, leftPanelText }) {
  return (
    <div style={{
      minHeight: "100vh",
      width: "100vw",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "radial-gradient(circle at 15% 15%, rgba(34, 197, 94, 0.08) 0%, transparent 40%), radial-gradient(circle at 85% 85%, rgba(59, 130, 246, 0.08) 0%, transparent 40%), #080d1a",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      padding: "20px",
      boxSizing: "border-box",
      position: "relative",
      zIndex: 9999,
    }}>
      <div style={{
        display: "flex",
        width: "900px",
        maxWidth: "100%",
        borderRadius: "24px",
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
      }}>
        {/* LEFT BRANDING PANEL */}
        <div style={{
          flex: 1,
          background: "linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(15, 23, 42, 0.95))",
          padding: "40px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRight: "1px solid rgba(255, 255, 255, 0.08)",
          position: "relative",
          display: "none",
          minWidth: "320px"
        }} className="auth-left-panel">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "30px" }}>
              <div style={{
                width: "44px",
                height: "44px",
                borderRadius: "14px",
                background: "linear-gradient(135deg, rgba(34,197,94,0.25), rgba(59,130,246,0.25))",
                border: "1px solid rgba(34,197,94,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#22c55e",
                boxShadow: "0 0 15px rgba(34,197,94,0.4)"
              }}>
                <Shield size={26} />
              </div>
              <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>SafePath</span>
            </div>
            <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#fff", lineHeight: 1.2, marginBottom: "16px" }}>
              Navigate Safely.<br />Travel Smarter.
            </h2>
            <p style={{ color: "#94a3b8", fontSize: "0.92rem", lineHeight: 1.6 }}>
              {leftPanelText || "Join thousands of commuters using real-time crime avoidance routing and AI guardian protection."}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#22c55e", fontSize: "0.8rem", fontWeight: 600 }}>
            <Sparkles size={16} /> Verified AI Safety Infrastructure
          </div>
        </div>

        {/* RIGHT FORM PANEL */}
        <div style={{ flex: 1.2, padding: "40px", boxSizing: "border-box" }}>
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "6px" }}>{title}</h3>
            {subtitle && <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{subtitle}</p>}
          </div>
          {children}
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .auth-left-panel { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
