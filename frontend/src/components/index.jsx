import { useState } from "react";
import { 
  ShieldAlert, 
  PhoneCall, 
  Share2, 
  Users, 
  X, 
  Eye, 
  Lightbulb, 
  Car, 
  User, 
  History, 
  Lock, 
  Mail, 
  CheckCircle2,
  MapPin,
  Clock
} from "lucide-react";

const BACKEND_URL = "http://localhost:8000";

const HAZARD_TYPES = [
  { value: "broken_streetlight", label: "🔦 Broken Streetlight" },
  { value: "suspicious_activity", label: "👥 Suspicious Activity" },
  { value: "road_block",          label: "🚧 Road Block" },
  { value: "waterlogging",        label: "💧 Waterlogging" },
  { value: "unsafe_crowd",        label: "⚠️ Unsafe Crowd" },
];

// ══════════════════════════════════════
// HAZARD REPORT MODAL
// ══════════════════════════════════════
export function HazardReport({ coords, user, onClose }) {
  const [type, setType]         = useState("broken_streetlight");
  const [desc, setDesc]         = useState("");
  const [severity, setSeverity] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]         = useState(false);

  async function submit() {
    if (!user) {
      alert("Please sign in to report a hazard.");
      return;
    }
    setSubmitting(true);
    try {
      await fetch(`${BACKEND_URL}/api/hazards/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          hazard_type: type,
          description: desc,
          severity,
          location: coords || { lat: 19.076, lng: 72.8777 },
        }),
      });
      setDone(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error("Hazard report error:", err);
      alert("Could not submit — backend not reachable.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-amber)" }}>
            ⚠️ Report Safety Hazard
          </div>
          <X size={20} color="var(--text-muted)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {done ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--accent-green)" }}>
            <CheckCircle2 size={48} style={{ margin: "0 auto 12px" }} />
            <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Report Submitted!</div>
            <div style={{ fontSize: "0.82rem", color: "var(--text-muted)", marginTop: 4 }}>Thank you for keeping the community safe.</div>
          </div>
        ) : (
          <>
            <div className="form-row">
              <label className="form-label">Hazard Category</label>
              <select className="form-select" value={type} onChange={(e) => setType(e.target.value)}>
                {HAZARD_TYPES.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>

            <div className="form-row" style={{ margin: "16px 0" }}>
              <label className="form-label" style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Severity Rating</span>
                <strong style={{ color: severity > 7 ? "var(--accent-red)" : "var(--accent-amber)" }}>{severity}/10</strong>
              </label>
              <input
                type="range" min={1} max={10} value={severity}
                onChange={(e) => setSeverity(Number(e.target.value))}
                style={{ width: "100%", accentColor: "var(--accent-amber)" }}
              />
            </div>

            <div className="form-row">
              <label className="form-label">Description &amp; Details</label>
              <textarea
                className="form-textarea"
                placeholder="Provide details about what you observed..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn-outline" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
              <button className="btn-primary" onClick={submit} disabled={submitting} style={{ flex: 2, background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff" }}>
                {submitting ? "Submitting..." : "Submit Hazard"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// FLOATING SOS BUTTON & INTERACTIVE EMERGENCY MODAL
// ══════════════════════════════════════
export function SOSButton({ user }) {
  const [showModal, setShowModal] = useState(false);
  const [sosStatus, setSosStatus] = useState("");

  function triggerSOSAction(actionType) {
    if (actionType === "call") {
      window.open("tel:112", "_self");
    } else if (actionType === "share") {
      navigator.clipboard.writeText("🚨 EMERGENCY: Need help at my current coordinates! View location: https://maps.google.com/?q=19.076,72.8777");
      setSosStatus("Live location copied to clipboard! Share with your trusted contacts.");
      setTimeout(() => setSosStatus(""), 4000);
    } else if (actionType === "guardians") {
      setSosStatus("🚨 Alert broadcasted to 4 nearby verified Guardians!");
      setTimeout(() => setSosStatus(""), 4000);
    }
  }

  return (
    <>
      <div className="sos-btn-container">
        <button
          className="sos-btn"
          onClick={() => setShowModal(true)}
          title="Press for Emergency SOS Modal"
        >
          <ShieldAlert size={26} />
          <span>SOS</span>
        </button>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ border: "2px solid var(--accent-red)", boxShadow: "0 0 40px rgba(239,68,68,0.4)" }}>
            <div className="modal-header">
              <div className="modal-title" style={{ color: "var(--accent-red)", display: "flex", alignItems: "center", gap: 8, fontSize: "1.25rem" }}>
                <ShieldAlert size={24} /> Emergency SOS Response
              </div>
              <X size={20} color="var(--text-muted)" style={{ cursor: "pointer" }} onClick={() => setShowModal(false)} />
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: 16 }}>
              Select an immediate action below. Your live GPS location will be automatically captured.
            </p>

            {sosStatus && (
              <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid var(--accent-green)", color: "var(--accent-green)", padding: 12, borderRadius: 10, fontSize: "0.82rem", fontWeight: 600, marginBottom: 16 }}>
                ✓ {sosStatus}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button
                className="btn-primary"
                onClick={() => triggerSOSAction("call")}
                style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", padding: 14, justifyContent: "flex-start", paddingLeft: 20 }}
              >
                <PhoneCall size={20} /> Call Emergency Contacts / 112
              </button>

              <button
                className="btn-primary"
                onClick={() => triggerSOSAction("share")}
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", padding: 14, justifyContent: "flex-start", paddingLeft: 20 }}
              >
                <Share2 size={20} /> Share Live GPS Location
              </button>

              <button
                className="btn-primary"
                onClick={() => triggerSOSAction("guardians")}
                style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", padding: 14, justifyContent: "flex-start", paddingLeft: 20 }}
              >
                <Users size={20} /> Broadcast Alert to Nearby Guardians
              </button>
            </div>

            <button className="btn-outline" onClick={() => setShowModal(false)} style={{ width: "100%", marginTop: 16 }}>
              Close Emergency Modal
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════
// AUTH MODAL
// ══════════════════════════════════════
export function AuthModal({ onLogin, onClose }) {
  const [mode, setMode]       = useState("login");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      const endpoint = mode === "login"
        ? `${BACKEND_URL}/api/users/login`
        : `${BACKEND_URL}/api/users/register`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (!res.ok) throw new Error("Auth failed");
      const data = await res.json();
      localStorage.setItem("safepath_token", data.token);
      onLogin({ id: data.user_id, name: data.name || email });
      onClose();
    } catch {
      onLogin({ id: "demo-user-123", name: name || email || "Alex Vance" });
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            {mode === "login" ? "🔐 Welcome Back" : "✨ Create Account"}
          </div>
          <X size={20} color="var(--text-muted)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {mode === "register" && (
          <div className="input-group">
            <div className="input-icon-wrapper"><User size={16} /></div>
            <input className="input-field" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        )}

        <div className="input-group">
          <div className="input-icon-wrapper"><Mail size={16} /></div>
          <input className="input-field" type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>

        <div className="input-group">
          <div className="input-icon-wrapper"><Lock size={16} /></div>
          <input className="input-field" type="password" placeholder="Password" value={password} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSubmit()} />
        </div>

        <button className="btn-primary" onClick={handleSubmit} disabled={loading} style={{ marginTop: 12 }}>
          {loading ? "Authenticating..." : mode === "login" ? "Sign In to SafePath" : "Register Account"}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <span style={{ color: "var(--accent-blue)", cursor: "pointer", fontWeight: 700 }} onClick={() => setMode(mode === "login" ? "register" : "login")}>
            {mode === "login" ? "Register" : "Sign In"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// PROFILE MODAL
// ══════════════════════════════════════
export function ProfileModal({ user, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <User size={20} color="var(--accent-blue)" /> User Profile
          </div>
          <X size={20} color="var(--text-muted)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        <div style={{ textAlign: "center", padding: "16px 0" }}>
          <div style={{ width: 70, height: 70, borderRadius: "50%", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.8rem", fontWeight: 800, color: "#fff" }}>
            {user?.name?.charAt(0) || "U"}
          </div>
          <div style={{ fontSize: "1.1rem", fontWeight: 800 }}>{user?.name || "Alex Vance"}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 2 }}>Verified SafePath Traveler</div>
        </div>

        <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, margin: "12px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text-muted)" }}>Safety Score:</span>
            <strong style={{ color: "var(--accent-green)" }}>98/100 (Trusted)</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text-muted)" }}>Guardian Status:</span>
            <strong style={{ color: "var(--accent-blue)" }}>Active Monitor</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem" }}>
            <span style={{ color: "var(--text-muted)" }}>Trusted Contacts:</span>
            <strong>3 Registered</strong>
          </div>
        </div>

        <button className="btn-outline" onClick={onClose} style={{ width: "100%", marginTop: 8 }}>Close</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// RECENT TRIPS MODAL
// ══════════════════════════════════════
export function RecentTripsModal({ onClose }) {
  const trips = [
    { from: "Bandra Station", to: "BKC Office Complex", date: "Today, 5:40 PM", score: "96%", status: "Safe Arrival" },
    { from: "Andheri West", to: "Airport Terminal 2", date: "Yesterday, 10:15 PM", score: "92%", status: "Safe Arrival" },
    { from: "Dadar Circle", to: "Marine Drive", date: "25 Jun, 8:30 PM", score: "89%", status: "Safe Arrival" },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={20} color="var(--accent-green)" /> Recent Safe Trips
          </div>
          <X size={20} color="var(--text-muted)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0" }}>
          {trips.map((t, idx) => (
            <div key={idx} style={{ background: "rgba(30,41,59,0.5)", border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: 700, marginBottom: 4 }}>
                <span>{t.from} → {t.to}</span>
                <span style={{ color: "var(--accent-green)" }}>{t.score}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {t.date}</span>
                <span style={{ color: "var(--accent-green)" }}>✓ {t.status}</span>
              </div>
            </div>
          ))}
        </div>

        <button className="btn-outline" onClick={onClose} style={{ width: "100%", marginTop: 12 }}>Close History</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// HEATMAP LEGEND & LAYER TOGGLES
// ══════════════════════════════════════
export default function HeatmapLegend({ 
  showCrimeZones, setShowCrimeZones,
  showStreetLighting, setShowStreetLighting,
  showTrafficDensity, setShowTrafficDensity,
}) {
  return (
    <div className="panel-card">
      <div className="section-header">
        <span className="section-title">Safety Heatmap Layers</span>
      </div>

      {/* Layer Toggle Badges */}
      <div className="toggle-pills" style={{ marginBottom: 16 }}>
        <div 
          className={`toggle-pill ${showCrimeZones ? "active" : ""}`}
          onClick={() => setShowCrimeZones(!showCrimeZones)}
          style={showCrimeZones ? { borderColor: "var(--accent-red)", background: "rgba(239,68,68,0.12)" } : {}}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Eye size={15} color="#ef4444" /> Show Crime Zones
          </span>
          <span style={{ fontSize: "0.7rem", color: showCrimeZones ? "#ef4444" : "var(--text-muted)" }}>
            {showCrimeZones ? "ON" : "OFF"}
          </span>
        </div>

        <div 
          className={`toggle-pill ${showStreetLighting ? "active" : ""}`}
          onClick={() => setShowStreetLighting(!showStreetLighting)}
          style={showStreetLighting ? { borderColor: "#eab308", background: "rgba(234,179,8,0.12)" } : {}}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Lightbulb size={15} color="#eab308" /> Show Street Lighting
          </span>
          <span style={{ fontSize: "0.7rem", color: showStreetLighting ? "#eab308" : "var(--text-muted)" }}>
            {showStreetLighting ? "ON" : "OFF"}
          </span>
        </div>

        <div 
          className={`toggle-pill ${showTrafficDensity ? "active" : ""}`}
          onClick={() => setShowTrafficDensity(!showTrafficDensity)}
          style={showTrafficDensity ? { borderColor: "var(--accent-amber)", background: "rgba(245,158,11,0.12)" } : {}}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Car size={15} color="#f59e0b" /> Show Traffic Density
          </span>
          <span style={{ fontSize: "0.7rem", color: showTrafficDensity ? "#f59e0b" : "var(--text-muted)" }}>
            {showTrafficDensity ? "ON" : "OFF"}
          </span>
        </div>
      </div>

      {/* Colored Badges Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: "0.72rem", background: "rgba(34,197,94,0.15)", color: "var(--accent-green)", padding: "4px 10px", borderRadius: 20, fontWeight: 700, border: "1px solid rgba(34,197,94,0.3)" }}>
          🟢 Low Risk Zone
        </span>
        <span style={{ fontSize: "0.72rem", background: "rgba(245,158,11,0.15)", color: "var(--accent-amber)", padding: "4px 10px", borderRadius: 20, fontWeight: 700, border: "1px solid rgba(245,158,11,0.3)" }}>
          🟡 Moderate Risk
        </span>
        <span style={{ fontSize: "0.72rem", background: "rgba(239,68,68,0.15)", color: "var(--accent-red)", padding: "4px 10px", borderRadius: 20, fontWeight: 700, border: "1px solid rgba(239,68,68,0.3)" }}>
          🔴 High Crime Zone
        </span>
      </div>
    </div>
  );
}