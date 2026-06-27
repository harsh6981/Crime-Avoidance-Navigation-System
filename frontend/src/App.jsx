import { useState } from "react";
import MapView from "./components/MapView";
import RoutePanel from "./components/RoutePanel";
import HeatmapLegend, { HazardReport, SOSButton, AuthModal, ProfileModal, RecentTripsModal } from "./components/index";
import GuardianMode from "./components/GuardianMode";
import TrustedContacts from "./components/TrustedContacts";
import ContactsPanel from "./components/ContactsPanel";
import { Shield, Moon, Sun, User, History, PhoneCall, AlertTriangle, Sparkles, LogOut } from "lucide-react";
import "./App.css";

export default function App() {
  const [user, setUser]                     = useState(null);
  const [showAuth, setShowAuth]             = useState(false);
  const [showProfile, setShowProfile]       = useState(false);
  const [showRecentTrips, setShowRecentTrips] = useState(false);
  const [routes, setRoutes]                 = useState(null);
  const [activeRoute, setActiveRoute]       = useState("safest");
  const [showHazardForm, setShowHazardForm] = useState(false);
  const [showContacts, setShowContacts]     = useState(false);
  const [mapClickCoords, setMapClickCoords] = useState(null);
  const [source, setSource]                 = useState("");
  const [destination, setDestination]       = useState("");
  const [travelMode, setTravelMode]         = useState("walking");
  const [loading, setLoading]               = useState(false);
  const [mapError, setMapError]             = useState(null);
  const [guardianAlert, setGuardianAlert]   = useState(null);
  const [oledTheme, setOledTheme]           = useState(false);

  // Heatmap Layer Toggles State
  const [showCrimeZones, setShowCrimeZones]         = useState(true);
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button className="btn-outline" onClick={() => setShowContacts(true)}>
                <PhoneCall size={15} color="#22c55e" /> Emergency Contacts
              </button>

              <button className="btn-outline" onClick={() => setShowProfile(true)} style={{ background: "rgba(59,130,246,0.15)", borderColor: "rgba(59,130,246,0.4)" }}>
                <User size={15} color="#3b82f6" /> {user.name}
              </button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setShowAuth(true)} style={{ padding: "8px 18px", fontSize: "0.82rem" }}>
              Sign In / Register
            </button>
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

        {/* MAP CONTAINER */}
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

      {/* MODALS */}
      {showAuth && (
        <AuthModal onLogin={setUser} onClose={() => setShowAuth(false)} />
      )}
      {showProfile && (
        <ProfileModal user={user} onClose={() => setShowProfile(false)} />
      )}
      {showRecentTrips && (
        <RecentTripsModal onClose={() => setShowRecentTrips(false)} />
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
    </div>
  );
}