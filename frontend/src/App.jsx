import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

// ── Dashboard-only components (READ ONLY — not touched) ──
import MapView from "./components/MapView";
import RoutePanel from "./components/RoutePanel";
import HeatmapLegend, { HazardReport, SOSButton, RecentTripsModal } from "./components/index";
import GuardianMode from "./components/GuardianMode";
import TrustedContacts from "./components/TrustedContacts";
import ContactsPanel from "./components/ContactsPanel";

// ── Auth pages ──
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import { Shield, Moon, Sun, User, History, PhoneCall, AlertTriangle, Sparkles, LogOut, ChevronDown, Bookmark, Compass } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import "./App.css";

// ─────────────────────────────────────────────────────────────
// Dashboard — contains ALL existing map/routing UI untouched
// ─────────────────────────────────────────────────────────────
function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showRecentTrips,     setShowRecentTrips]     = useState(false);
  const [showSavedRoutes,     setShowSavedRoutes]     = useState(false);
  const [showHazardForm,      setShowHazardForm]      = useState(false);
  const [showContacts,        setShowContacts]        = useState(false);
  const [mapClickCoords,      setMapClickCoords]      = useState(null);
  const [guardianAlert,       setGuardianAlert]       = useState(null);
  const [oledTheme,           setOledTheme]           = useState(false);

  // ── READ ONLY: all routing state lives here unchanged ──
  const [routes,      setRoutes]      = useState(null);
  const [activeRoute, setActiveRoute] = useState("safest");
  const [source,      setSource]      = useState("");
  const [destination, setDestination] = useState("");
  const [travelMode,  setTravelMode]  = useState("walking");
  const [loading,     setLoading]     = useState(false);
  const [mapError,    setMapError]    = useState(null);

  // Heatmap Layer Toggles State
  const [showCrimeZones,     setShowCrimeZones]     = useState(true);
  const [showStreetLighting, setShowStreetLighting] = useState(true);
  const [showTrafficDensity, setShowTrafficDensity] = useState(true);

  function toggleTheme() {
    setOledTheme(!oledTheme);
    if (!oledTheme) {
      document.body.classList.add("oled-theme");
    } else {
      document.body.classList.remove("oled-theme");
    }
  }

  function handleGuardianAlert(alert) {
    setGuardianAlert(alert);
    setTimeout(() => setGuardianAlert(null), 5000);
  }

  return (
    <div className="app-shell">
      {/* ── TOP NAV HEADER ── */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon-wrap">
            <Shield size={22} color="#22c55e" />
          </div>
          <div>
            <span className="brand-name">SafePath</span>
            <span className="brand-tag"><Sparkles size={11} /> AI Navigation v2.0</span>
          </div>
        </div>

        <div className="nav-actions">
          {/* Recent Trips */}
          <button className="btn-outline" onClick={() => setShowRecentTrips(true)} title="Recent Trips">
            <History size={16} /> <span style={{ display: "none", smDisplay: "inline" }}>Trips</span>
          </button>

          {/* OLED / Dark Mode Toggle */}
          <button className="btn-outline" onClick={toggleTheme} title="Toggle OLED Dark Mode">
            {oledTheme ? <Sun size={16} color="#f59e0b" /> : <Moon size={16} color="#3b82f6" />}
          </button>

          {user ? (
            <div style={{ position: "relative" }}>
              <button
                className="btn-outline"
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                style={{ background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.4)", display: "flex", alignItems: "center", gap: 6 }}
              >
                {/* Show profile photo for Google users, icon for email users */}
                {user.profilePicture ? (
                  <img
                    src={user.profilePicture}
                    alt={user.name}
                    style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
                  />
                ) : (
                  <User size={15} color="#3b82f6" />
                )}
                {user.name} <ChevronDown size={14} />
              </button>

              {/* Profile Dropdown Menu */}
              {showProfileDropdown && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: "220px",
                  background: "rgba(15, 23, 42, 0.95)",
                  backdropFilter: "blur(16px)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "14px",
                  padding: "8px 0",
                  zIndex: 200,
                  boxShadow: "0 15px 35px rgba(0,0,0,0.6)"
                }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", marginBottom: "4px" }}>
                    <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fff" }}>{user.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email}</div>
                  </div>

                  <div className="dropdown-item" onClick={() => { setShowRecentTrips(true); setShowProfileDropdown(false); }}>
                    <Compass size={15} color="#3b82f6" /> My Trips
                  </div>

                  <div className="dropdown-item" onClick={() => { setShowSavedRoutes(true); setShowProfileDropdown(false); }}>
                    <Bookmark size={15} color="#f59e0b" /> Saved Routes
                  </div>

                  <div className="dropdown-item" onClick={() => { setShowContacts(true); setShowProfileDropdown(false); }}>
                    <PhoneCall size={15} color="#22c55e" /> Emergency Contacts
                  </div>

                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: "4px", paddingTop: "4px" }}>
                    <div className="dropdown-item" onClick={() => { logout(); setShowProfileDropdown(false); }} style={{ color: "#ef4444" }}>
                      <LogOut size={15} color="#ef4444" /> Logout
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-outline" onClick={() => navigate("/login")}>
                Sign In
              </button>
              <button className="btn-primary" onClick={() => navigate("/signup")} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
                Create Account
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── GUARDIAN ALERT BANNER ── */}
      {guardianAlert && (
        <div style={{
          position:"fixed", top:64, left:0, right:0, zIndex:99,
          background: guardianAlert.type==="high_risk_zone" ? "linear-gradient(135deg, rgba(239,68,68,0.95), rgba(185,28,28,0.95))" : "linear-gradient(135deg, rgba(245,158,11,0.95), rgba(180,83,9,0.95))",
          color:"#fff", padding:"10px 24px", fontSize:"0.85rem", fontWeight:700,
          display:"flex", alignItems:"center", gap:10, boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
        }}>
          <AlertTriangle size={18} />
          {guardianAlert.type==="high_risk_zone"
            ? "WARNING: You've entered a high-crime risk zone. Guardian Mode active."
            : "🚨 Auto-SOS countdown initiated — check guardian panel."}
          <button style={{marginLeft:"auto",background:"transparent",border:"none",color:"#fff",cursor:"pointer"}}
            onClick={() => setGuardianAlert(null)}>✕</button>
        </div>
      )}

      {/* ── MAIN DASHBOARD LAYOUT ── */}
      <main className="main-layout">
        {/* LEFT SIDEBAR PANEL */}
        <aside className="side-panel">
          {/* ── READ ONLY: RoutePanel with all source/destination/routing props ── */}
          <RoutePanel
            source={source}
            setSource={setSource}
            destination={destination}
            setDestination={setDestination}
            travelMode={travelMode}
            setTravelMode={setTravelMode}
            routes={routes}
            setRoutes={setRoutes}
            activeRoute={activeRoute}
            setActiveRoute={setActiveRoute}
            loading={loading}
            setLoading={setLoading}
            setMapError={setMapError}
          />

          <HeatmapLegend
            showCrimeZones={showCrimeZones}
            setShowCrimeZones={setShowCrimeZones}
            showStreetLighting={showStreetLighting}
            setShowStreetLighting={setShowStreetLighting}
            showTrafficDensity={showTrafficDensity}
            setShowTrafficDensity={setShowTrafficDensity}
          />

          <GuardianMode
            user={user}
            activeRoute={activeRoute}
            onAlert={handleGuardianAlert}
          />

          {user && <ContactsPanel user={user} />}

          <button
            className="btn-hazard"
            onClick={() => setShowHazardForm(true)}
          >
            <AlertTriangle size={18} /> Report Safety Hazard
          </button>
        </aside>

        {/* ── READ ONLY: MAP CONTAINER ── */}
        <div className="map-wrapper">
          <MapView
            routes={routes}
            activeRoute={activeRoute}
            onMapClick={setMapClickCoords}
            mapError={mapError}
            showCrimeZones={showCrimeZones}
            showStreetLighting={showStreetLighting}
            showTrafficDensity={showTrafficDensity}
          />
          <SOSButton user={user} />
        </div>
      </main>

      {/* OTHER MODALS */}
      {showRecentTrips && (
        <RecentTripsModal onClose={() => setShowRecentTrips(false)} />
      )}
      {showSavedRoutes && (
        <div className="modal-overlay" onClick={() => setShowSavedRoutes(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">📌 Saved Routes</div>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No saved routes yet. Your favorite safe paths will appear here!</p>
            <button className="btn-outline mt-12" onClick={() => setShowSavedRoutes(false)} style={{ width: "100%" }}>Close</button>
          </div>
        </div>
      )}
      {showHazardForm && (
        <HazardReport
          coords={mapClickCoords}
          user={user}
          onClose={() => setShowHazardForm(false)}
        />
      )}
      {showContacts && (
        <TrustedContacts user={user} onClose={() => setShowContacts(false)} />
      )}

      <style>{`
        .dropdown-item {
          padding: 10px 16px;
          font-size: 0.82rem;
          color: #cbd5e1;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          transition: background 0.15s;
        }
        .dropdown-item:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// App — top-level router: auth pages vs. dashboard
// Map only renders when route is "/"
// ─────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Routes>
      {/* Auth pages — map is NEVER mounted here */}
      <Route path="/login"  element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Dashboard — map loads only on this route */}
      <Route path="/*" element={<Dashboard />} />
    </Routes>
  );
}