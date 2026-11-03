import { useState, useEffect } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";

// ── Dashboard-only components (READ ONLY — not touched) ──
import MapView from "./components/MapView";
import RoutePanel from "./components/RoutePanel";
import HeatmapLegend, { HazardReport, SOSButton, RecentTripsModal } from "./components/index";
import GuardianMode from "./components/GuardianMode";
import TrustedContacts from "./components/TrustedContacts";
import ContactsPanel from "./components/ContactsPanel";
import TripOverlay from "./components/TripOverlay";
import OnRouteResources from "./components/OnRouteResources";
import SafePathPanel from "./components/SafePathPanel";

// ── Auth pages ──
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import { Shield, History, PhoneCall, AlertTriangle, LogOut, Bookmark, Compass, MapPin, Navigation, X, Clock, ChevronLeft, ChevronRight, Eye, Lightbulb, Car, Zap, ShieldCheck, Heart } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import "./App.css";

const BACKEND_URL = "http://localhost:8000";

// ─────────────────────────────────────────────────────────────
// Saved Routes Modal — syncs with backend + localStorage fallback
// ─────────────────────────────────────────────────────────────
function SavedRoutesModal({ onClose, onLoadRoute, user }) {
  const [saved, setSaved] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  useEffect(() => {
    async function fetchRoutes() {
      // Try backend first if user is logged in
      if (user?.user_id) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/routes/saved?user_id=${user.user_id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.routes && data.routes.length > 0) {
              setSaved(data.routes.map(r => ({
                ...r,
                source: r.source,
                destination: r.destination,
                travelMode: r.travel_mode,
                safetyScore: r.safety_score,
                savedAt: r.saved_at,
                _id: r._id,
              })));
              setLoadingRoutes(false);
              return;
            }
          }
        } catch (_) { }
      }
      // Fallback to localStorage
      const local = JSON.parse(localStorage.getItem("safepath_saved_routes") || "[]");
      setSaved(local);
      setLoadingRoutes(false);
    }
    fetchRoutes();
  }, [user]);

  async function handleDelete(idx) {
    const route = saved[idx];
    // Delete from backend
    if (user?.user_id && route._id) {
      try {
        await fetch(`${BACKEND_URL}/api/routes/saved?user_id=${user.user_id}&route_id=${route._id}`, {
          method: "DELETE",
        });
      } catch (_) { }
    }
    // Also delete from localStorage
    const localSaved = JSON.parse(localStorage.getItem("safepath_saved_routes") || "[]");
    const filtered = localSaved.filter(r => !(r.source === route.source && r.destination === route.destination));
    localStorage.setItem("safepath_saved_routes", JSON.stringify(filtered));

    const updated = [...saved];
    updated.splice(idx, 1);
    setSaved(updated);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "#e37400" }}>
            <Bookmark size={20} /> Saved Routes
          </div>
          <X size={20} color="#5f6368" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {loadingRoutes ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#5f6368", fontSize: "0.85rem" }}>
            Loading saved routes…
          </div>
        ) : saved.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#5f6368" }}>
            <Bookmark size={36} style={{ margin: "0 auto 12px", display: "block", opacity: 0.3 }} />
            <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 4 }}>No saved routes yet</div>
            <div style={{ fontSize: "0.78rem" }}>Calculate a route and tap the ★ Save button to bookmark it here.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0", maxHeight: "50vh", overflowY: "auto" }}>
            {saved.map((r, idx) => (
              <div key={r._id || idx} style={{
                background: "#f8f9fa", border: "1px solid #dadce0",
                borderRadius: 12, padding: 12, cursor: "pointer", transition: "border-color 0.2s",
              }}
                onClick={() => {
                  if (onLoadRoute) onLoadRoute(r.source, r.destination, r.travelMode);
                  onClose();
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(245,158,11,0.4)"}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = "#dadce0"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <MapPin size={14} color="#1e8e3e" />
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#202124" }}>{r.source}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Navigation size={14} color="#d93025" />
                  <span style={{ fontSize: "0.85rem", fontWeight: 700, color: "#202124" }}>{r.destination}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "#5f6368" }}>
                  <span>Safety: <strong style={{ color: "#1e8e3e" }}>{r.safetyScore}/100</strong></span>
                  <span>{r.savedAt ? new Date(r.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(idx); }}
                    style={{ background: "transparent", border: "none", color: "#d93025", cursor: "pointer", fontSize: "0.72rem", fontWeight: 600 }}
                  >✕ Remove</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn-outline" onClick={onClose} style={{ width: "100%", marginTop: 12 }}>Close</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Dynamic Recent Trips Modal — syncs with backend + localStorage fallback
// ─────────────────────────────────────────────────────────────
function DynamicRecentTripsModal({ onClose, user }) {
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);

  useEffect(() => {
    async function fetchTrips() {
      // Try backend first if user is logged in
      if (user?.user_id) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/trips?user_id=${user.user_id}`);
          if (res.ok) {
            const data = await res.json();
            if (data.trips && data.trips.length > 0) {
              setTrips(data.trips.map(t => ({
                from: t.source?.length > 25 ? t.source.slice(0, 25) + "…" : t.source,
                to: t.destination?.length > 25 ? t.destination.slice(0, 25) + "…" : t.destination,
                date: t.date ? new Date(t.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "",
                score: `${Math.round(t.safety_score)}%`,
                status: t.status || "Safe Arrival",
                _fromBackend: true,
              })));
              setLoadingTrips(false);
              return;
            }
          }
        } catch (_) { }
      }
      // Fallback to localStorage
      const stored = JSON.parse(localStorage.getItem("safepath_trips") || "[]");
      const fallbackTrips = stored.length > 0 ? stored : [
        { from: "Bandra Station", to: "BKC Office Complex", date: "Today, 5:40 PM", score: "96%", status: "Safe Arrival" },
        { from: "Andheri West", to: "Airport Terminal 2", date: "Yesterday, 10:15 PM", score: "92%", status: "Safe Arrival" },
        { from: "Dadar Circle", to: "Marine Drive", date: "25 Jun, 8:30 PM", score: "89%", status: "Safe Arrival" },
      ];
      setTrips(fallbackTrips);
      setLoadingTrips(false);
    }
    fetchTrips();
  }, [user]);

  async function handleClearHistory() {
    if (user?.user_id) {
      try {
        await fetch(`${BACKEND_URL}/api/trips?user_id=${user.user_id}`, { method: "DELETE" });
      } catch (_) { }
    }
    localStorage.removeItem("safepath_trips");
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <div className="modal-header">
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={20} color="#1e8e3e" /> Recent Safe Trips
          </div>
          <X size={20} color="#5f6368" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {loadingTrips ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#5f6368", fontSize: "0.85rem" }}>
            Loading trip history…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "10px 0", maxHeight: "50vh", overflowY: "auto" }}>
            {trips.map((t, idx) => (
              <div key={idx} style={{ background: "#f8f9fa", border: "1px solid #dadce0", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.88rem", fontWeight: 700, marginBottom: 4 }}>
                  <span>{t.from} → {t.to}</span>
                  <span style={{ color: "#1e8e3e" }}>{t.score}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#5f6368" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={12} /> {t.date}</span>
                  <span style={{ color: "#1e8e3e" }}>✓ {t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {trips.length > 0 && (
          <button
            className="btn-outline"
            onClick={handleClearHistory}
            style={{ width: "100%", marginTop: 8, color: "#d93025", borderColor: "rgba(239,68,68,0.3)" }}
          >
            Clear Trip History
          </button>
        )}
        <button className="btn-outline" onClick={onClose} style={{ width: "100%", marginTop: 8 }}>Close History</button>
      </div>
    </div>
  );
}

const LAYER_CHIPS = [
  { key: "crime", label: "Crime zones", Icon: Eye },
  { key: "lighting", label: "Lighting", Icon: Lightbulb },
  { key: "traffic", label: "Traffic", Icon: Car },
  { key: "ev", label: "EV charging", Icon: Zap },
  { key: "police", label: "Police", Icon: ShieldCheck },
  { key: "hospital", label: "Hospitals", Icon: Heart },
];

function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const [showRecentTrips, setShowRecentTrips] = useState(false);
  const [showSavedRoutes, setShowSavedRoutes] = useState(false);
  const [showHazardForm, setShowHazardForm] = useState(false);
  const [showContacts, setShowContacts] = useState(false);
  const [mapClickCoords, setMapClickCoords] = useState(null);
  const [guardianAlert, setGuardianAlert] = useState(null);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState("directions"); // directions | safety
  const [tripActive, setTripActive] = useState(false);
  const [tripPos, setTripPos] = useState(null);

  // ── routing state (unchanged) ──
  const [routes, setRoutes] = useState(null);
  const [activeRoute, setActiveRoute] = useState("safest");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [travelMode, setTravelMode] = useState("walking");
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Layer toggles (unchanged)
  const [showCrimeZones, setShowCrimeZones] = useState(true);
  const [showStreetLighting, setShowStreetLighting] = useState(true);
  const [showTrafficDensity, setShowTrafficDensity] = useState(true);

  // On-route resources (unchanged)
  const [onRouteResources, setOnRouteResources] = useState([]);
  const [showEVChargers, setShowEVChargers] = useState(true);
  const [showPolice, setShowPolice] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);

  const chipState = {
    crime: [showCrimeZones, setShowCrimeZones],
    lighting: [showStreetLighting, setShowStreetLighting],
    traffic: [showTrafficDensity, setShowTrafficDensity],
    ev: [showEVChargers, setShowEVChargers],
    police: [showPolice, setShowPolice],
    hospital: [showHospitals, setShowHospitals],
  };

  function handleGuardianAlert(alert) {
    setGuardianAlert(alert);
    setTimeout(() => setGuardianAlert(null), 5000);
  }

  const activeRouteData = routes
    ? (activeRoute === "safest" ? routes.safest_route : activeRoute === "alternative" ? routes.alternative_route : routes.fastest_route)
    : null;
  const routeNames = { safest: "Safest route", alternative: "Balanced route", fastest: "Fastest route" };

  function startTrip() {
    if (!activeRouteData?.path || activeRouteData.path.length < 2) return;
    setTripPos(null);
    setTripActive(true);
    setPanelCollapsed(true);
  }
  function endTrip() {
    setTripActive(false);
    setTripPos(null);
    setPanelCollapsed(false);
  }

  function handleLoadRoute(src, dst, mode) {
    setSource(src);
    setDestination(dst);
    if (mode) setTravelMode(mode);
    setActiveTab("directions");
  }

  return (
    <div className={`app-shell ${panelCollapsed ? "collapsed" : ""}`}>
      {/* ── LEFT PANEL ── */}
      <aside className="side-panel">
        <div className="panel-head">
          <div className="brand-icon-wrap"><Shield size={20} color="#1e8e3e" /></div>
          <div>
            <span className="brand-name">SafePath</span>
            <span className="brand-tag">Look before you leave</span>
          </div>
        </div>

        <div className="panel-tabs" role="tablist">
          <button role="tab" aria-selected={activeTab === "directions"}
            className={`panel-tab ${activeTab === "directions" ? "active" : ""}`}
            onClick={() => setActiveTab("directions")}>
            <Navigation size={16} /> Directions
          </button>
          <button role="tab" aria-selected={activeTab === "safety"}
            className={`panel-tab ${activeTab === "safety" ? "active" : ""}`}
            onClick={() => setActiveTab("safety")}>
            <Shield size={16} /> Safety tools
          </button>
        </div>

        <div className="panel-body">
          {/* Kept mounted (hidden) so route state and resource fetching survive tab switches */}
          <div className="panel-stack" style={{ display: activeTab === "directions" ? "flex" : "none" }}>
            <RoutePanel
              source={source} setSource={setSource}
              destination={destination} setDestination={setDestination}
              travelMode={travelMode} setTravelMode={setTravelMode}
              routes={routes} setRoutes={setRoutes}
              activeRoute={activeRoute} setActiveRoute={setActiveRoute}
              loading={loading} setLoading={setLoading}
              setMapError={setMapError}
              onStartTrip={startTrip}
            />
          </div>

          <div className="safety-tab" style={{ display: activeTab === "safety" ? "flex" : "none" }}>
            <OnRouteResources
              routes={routes}
              activeRoute={activeRoute}
              onResourcesLoaded={setOnRouteResources}
              showEVChargers={showEVChargers} setShowEVChargers={setShowEVChargers}
              showPolice={showPolice} setShowPolice={setShowPolice}
              showHospitals={showHospitals} setShowHospitals={setShowHospitals}
            />
            <SafePathPanel routes={routes} />
            <GuardianMode user={user} activeRoute={activeRoute} onAlert={handleGuardianAlert} />
            {user && <ContactsPanel user={user} />}
            <button className="btn-hazard" onClick={() => setShowHazardForm(true)}>
              <AlertTriangle size={18} /> Report a safety hazard
            </button>
          </div>
        </div>
      </aside>

      <button className="panel-toggle" onClick={() => setPanelCollapsed(!panelCollapsed)}
        aria-label={panelCollapsed ? "Show side panel" : "Hide side panel"}>
        {panelCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* ── MAP AREA ── */}
      <div className="map-wrapper">
        <MapView
          routes={routes}
          activeRoute={activeRoute}
          onMapClick={setMapClickCoords}
          mapError={mapError}
          showCrimeZones={showCrimeZones}
          showStreetLighting={showStreetLighting}
          showTrafficDensity={showTrafficDensity}
          onRouteResources={onRouteResources}
          showEVChargers={showEVChargers}
          showPolice={showPolice}
          showHospitals={showHospitals}
          navigating={tripActive}
          onStartTrip={startTrip}
          followPos={tripPos}
        />

        {/* Layer chips */}
        {!tripActive && (<div className="map-chips">
          {LAYER_CHIPS.map(({ key, label, Icon }) => {
            const [on, set] = chipState[key];
            return (
              <button key={key} className={`map-chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => set(!on)}>
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </div>)}

        {tripActive && (
          <TripOverlay route={activeRouteData} routeName={routeNames[activeRoute]} onPosition={setTripPos} onEnd={endTrip} />
        )}

        {/* Account cluster */}
        {!tripActive && (<div className="account-cluster">
          <button className="round-btn" onClick={() => setShowRecentTrips(true)} title="Recent trips" aria-label="Recent trips">
            <History size={18} />
          </button>
          {user ? (
            <div style={{ position: "relative" }}>
              <button className="round-btn avatar-btn" onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                aria-label="Account menu" aria-expanded={showProfileDropdown}>
                {user.profilePicture
                  ? <img src={user.profilePicture} alt="" />
                  : (user.name?.charAt(0) || "U").toUpperCase()}
              </button>
              {showProfileDropdown && (
                <div className="profile-menu">
                  <div className="menu-head"><strong>{user.name}</strong><span>{user.email}</span></div>
                  <button className="dropdown-item" onClick={() => { setShowRecentTrips(true); setShowProfileDropdown(false); }}>
                    <Compass size={18} color="#5f6368" /> My trips
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowSavedRoutes(true); setShowProfileDropdown(false); }}>
                    <Bookmark size={18} color="#5f6368" /> Saved routes
                  </button>
                  <button className="dropdown-item" onClick={() => { setShowContacts(true); setShowProfileDropdown(false); }}>
                    <PhoneCall size={18} color="#5f6368" /> Emergency contacts
                  </button>
                  <button className="dropdown-item" style={{ color: "#d93025" }} onClick={() => { logout(); setShowProfileDropdown(false); }}>
                    <LogOut size={18} color="#d93025" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="signin-btn" onClick={() => navigate("/login")}>Sign in</button>
          )}
        </div>)}

        {guardianAlert && (
          <div className={`guardian-toast ${guardianAlert.type === "high_risk_zone" ? "danger" : "warn"}`} role="alert">
            <AlertTriangle size={18} />
            {guardianAlert.type === "high_risk_zone"
              ? "You've entered a high-crime zone. Guardian Mode is active."
              : "Auto-SOS countdown started. Open Safety tools to respond."}
            <button onClick={() => setGuardianAlert(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        <SOSButton user={user} />
      </div>

      {showRecentTrips && <DynamicRecentTripsModal onClose={() => setShowRecentTrips(false)} user={user} />}
      {showSavedRoutes && <SavedRoutesModal onClose={() => setShowSavedRoutes(false)} onLoadRoute={handleLoadRoute} user={user} />}
      {showHazardForm && <HazardReport coords={mapClickCoords} user={user} onClose={() => setShowHazardForm(false)} />}
      {showContacts && <TrustedContacts user={user} onClose={() => setShowContacts(false)} />}
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
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* Dashboard — map loads only on this route */}
      <Route path="/*" element={<Dashboard />} />
    </Routes>
  );
}