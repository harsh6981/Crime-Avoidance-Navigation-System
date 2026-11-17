import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import AnalyticsDashboard from "./components/AnalyticsDashboard";
import CrimeDetailPanel from "./components/CrimeDetailPanel";
import LayerControlPanel from "./components/LayerControlPanel";

// ── Auth pages ──
import Login from "./pages/Login";
import Signup from "./pages/Signup";

import { Shield, History, PhoneCall, AlertTriangle, LogOut, Bookmark, Compass, MapPin, Navigation, X, Clock, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Eye, Lightbulb, Car, Zap, ShieldCheck, Heart, BarChart3, Layers, Search } from "lucide-react";
import { useAuth } from "./context/AuthContext";
import { BACKEND_URL } from "./config/api";
import "./App.css";

// ─────────────────────────────────────────────────────────────
// Saved Routes Modal — syncs with backend + localStorage fallback
// ─────────────────────────────────────────────────────────────
function SavedRoutesModal({ onClose, onLoadRoute, user }) {
  const [saved, setSaved] = useState([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);

  useEffect(() => {
    async function fetchRoutes() {
      // Try backend first if user is logged in
      const uid = user?.user_id || user?.id;
      if (uid) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/routes/saved?user_id=${encodeURIComponent(uid)}`);
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
    const uid = user?.user_id || user?.id;
    // Delete from backend
    if (uid && route._id) {
      try {
        await fetch(`${BACKEND_URL}/api/routes/saved?user_id=${encodeURIComponent(uid)}&route_id=${encodeURIComponent(route._id)}`, {
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
          <div className="modal-title" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--amber)" }}>
            <Bookmark size={20} /> Saved Routes
          </div>
          <X size={20} color="var(--text-3)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {loadingRoutes ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-3)", fontSize: "0.85rem" }}>
            Loading saved routes…
          </div>
        ) : saved.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-3)" }}>
            <Bookmark size={36} style={{ margin: "0 auto 12px", display: "block", opacity: 0.25 }} />
            <div style={{ fontSize: "0.88rem", fontWeight: 600, marginBottom: 4, color: "var(--text-2)" }}>No saved routes yet</div>
            <div style={{ fontSize: "0.78rem" }}>Calculate a route and tap the ★ Save button to bookmark it here.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0", maxHeight: "50vh", overflowY: "auto" }}>
            {saved.map((r, idx) => (
              <div key={r._id || idx} style={{
                background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)",
                borderRadius: 12, padding: 12, cursor: "pointer", transition: "border-color 0.2s, background 0.2s",
              }}
                onClick={() => { if (onLoadRoute) onLoadRoute(r.source, r.destination, r.travelMode); onClose(); }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "rgba(0,212,255,0.3)"; e.currentTarget.style.background = "rgba(0,212,255,0.04)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <MapPin size={14} color="var(--green)" />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{r.source}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <Navigation size={14} color="var(--red)" />
                  <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)" }}>{r.destination}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-3)" }}>
                  <span>Safety: <strong style={{ color: "var(--green)" }}>{r.safetyScore}/100</strong></span>
                  <span>{r.savedAt ? new Date(r.savedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(idx); }}
                    style={{ background: "transparent", border: "none", color: "var(--red)", cursor: "pointer", fontSize: "0.72rem", fontWeight: 600 }}
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
      const uid = user?.user_id || user?.id;
      if (uid) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/trips?user_id=${encodeURIComponent(uid)}`);
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
    const uid = user?.user_id || user?.id;
    if (uid) {
      try {
        await fetch(`${BACKEND_URL}/api/trips?user_id=${encodeURIComponent(uid)}`, { method: "DELETE" });
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
            <History size={20} color="var(--green)" /> Recent Safe Trips
          </div>
          <X size={20} color="var(--text-3)" style={{ cursor: "pointer" }} onClick={onClose} />
        </div>

        {loadingTrips ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-3)", fontSize: "0.85rem" }}>
            Loading trip history…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "10px 0", maxHeight: "50vh", overflowY: "auto" }}>
            {trips.map((t, idx) => (
              <div key={idx} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid var(--line)", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>
                  <span>{t.from} → {t.to}</span>
                  <span style={{ color: "var(--green)" }}>{t.score}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.74rem", color: "var(--text-3)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Clock size={11} /> {t.date}</span>
                  <span style={{ color: "var(--green)" }}>✓ {t.status}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {trips.length > 0 && (
          <button
            className="btn-outline"
            onClick={handleClearHistory}
            style={{ width: "100%", marginTop: 8, color: "var(--red)", borderColor: "rgba(239,68,68,0.3)" }}
          >
            Clear Trip History
          </button>
        )}
        <button className="btn-outline" onClick={onClose} style={{ width: "100%", marginTop: 8 }}>Close History</button>
      </div>
    </div>
  );
}

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
  const [mobileSheetMode, setMobileSheetMode] = useState("half"); // "peek" | "half" | "full"
  const [activeTab, setActiveTab] = useState("directions"); // directions | safety | analytics
  const [tripActive, setTripActive] = useState(false);
  const [tripPos, setTripPos] = useState(null);
  const [navigatingRoute, setNavigatingRoute] = useState(null);
  const [selectedClusterId, setSelectedClusterId] = useState(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__selectCluster = setSelectedClusterId;
      window.__setActiveRoute = setActiveRoute;
    }
  }, []);

  // ── routing state (unchanged) ──
  const [routes, setRoutes] = useState(null);
  const [activeRoute, setActiveRoute] = useState("safest");
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [travelMode, setTravelMode] = useState("walking");
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState(null);

  // Auto-expand mobile sheet to half view when routes arrive
  useEffect(() => {
    if (routes) {
      setMobileSheetMode("half");
    }
  }, [routes]);

  // Layer toggles
  const [showRoadNetwork, setShowRoadNetwork] = useState(false);
  const [showCrimeZones, setShowCrimeZones] = useState(true);
  const [showCrimeClusters, setShowCrimeClusters] = useState(true);
  const [showStreetLighting, setShowStreetLighting] = useState(true);
  const [showTrafficDensity, setShowTrafficDensity] = useState(true);
  const [showHazards, setShowHazards] = useState(true);
  const [showSafeHavens, setShowSafeHavens] = useState(true);
  const [showLayerPanel, setShowLayerPanel] = useState(false);

  // On-route resources (unchanged)
  const [onRouteResources, setOnRouteResources] = useState([]);
  const [showEVChargers, setShowEVChargers] = useState(true);
  const [showPolice, setShowPolice] = useState(true);
  const [showHospitals, setShowHospitals] = useState(true);

  const layerState = {
    roads: showRoadNetwork,
    crime: showCrimeZones,
    clusters: showCrimeClusters,
    lighting: showStreetLighting,
    traffic: showTrafficDensity,
    ev: showEVChargers,
    police: showPolice,
    hospital: showHospitals,
    safeHavens: showSafeHavens,
    hazards: showHazards,
  };

  const handleToggleLayer = (key) => {
    switch (key) {
      case "roads": setShowRoadNetwork((v) => !v); break;
      case "crime": setShowCrimeZones((v) => !v); break;
      case "clusters": setShowCrimeClusters((v) => !v); break;
      case "lighting": setShowStreetLighting((v) => !v); break;
      case "traffic": setShowTrafficDensity((v) => !v); break;
      case "ev": setShowEVChargers((v) => !v); break;
      case "police": setShowPolice((v) => !v); break;
      case "hospital": setShowHospitals((v) => !v); break;
      case "safeHavens": setShowSafeHavens((v) => !v); break;
      case "hazards": setShowHazards((v) => !v); break;
      default: break;
    }
  };

  const handleResetLayers = () => {
    setShowRoadNetwork(false);
    setShowCrimeZones(true);
    setShowCrimeClusters(true);
    setShowStreetLighting(true);
    setShowTrafficDensity(true);
    setShowEVChargers(true);
    setShowPolice(true);
    setShowHospitals(true);
    setShowSafeHavens(true);
    setShowHazards(true);
  };

  const activeLayerCount = Object.values(layerState).filter(Boolean).length;

  function handleGuardianAlert(alert) {
    setGuardianAlert(alert);
    setTimeout(() => setGuardianAlert(null), 5000);
  }

  const activeRouteData = routes
    ? (activeRoute === "safest" ? routes.safest_route : routes.fastest_route)
    : null;
  const routeNames = { safest: "Safest route", fastest: "Fastest route" };

  // ── Touch and Drag Handlers for Mobile Bottom Sheet ──
  const sheetRef = useRef(null);
  const dragStartY = useRef(0);
  const startHeight = useRef(0);
  const isDragging = useRef(false);
  const hasMoved = useRef(false);

  const handleTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    dragStartY.current = e.touches[0].clientY;
    hasMoved.current = false;
    if (sheetRef.current) {
      startHeight.current = sheetRef.current.getBoundingClientRect().height;
      isDragging.current = true;
      sheetRef.current.style.transition = "none";
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current || !sheetRef.current) return;
    const currentY = e.touches[0].clientY;
    const deltaY = dragStartY.current - currentY; // positive = dragged UP
    if (Math.abs(deltaY) > 5) {
      hasMoved.current = true;
    }
    const newHeight = startHeight.current + deltaY;
    const minH = 76;
    const maxH = window.innerHeight * 0.90;
    sheetRef.current.style.height = `${Math.max(minH, Math.min(maxH, newHeight))}px`;
  };

  const handleTouchEnd = (e) => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    sheetRef.current.style.transition = "height 0.3s cubic-bezier(0.16, 1, 0.3, 1)";

    if (!hasMoved.current) {
      sheetRef.current.style.height = "";
      sheetRef.current.style.transition = "";
      return;
    }

    const endY = e.changedTouches[0].clientY;
    const totalDeltaY = dragStartY.current - endY;
    const currentH = sheetRef.current.getBoundingClientRect().height;
    const winH = window.innerHeight;

    let targetMode = "half";
    if (totalDeltaY > 45) {
      targetMode = mobileSheetMode === "peek" ? "half" : "full";
    } else if (totalDeltaY < -45) {
      targetMode = mobileSheetMode === "full" ? "half" : "peek";
    } else {
      if (currentH < winH * 0.28) targetMode = "peek";
      else if (currentH < winH * 0.68) targetMode = "half";
      else targetMode = "full";
    }

    setMobileSheetMode(targetMode);

    setTimeout(() => {
      if (sheetRef.current) {
        sheetRef.current.style.height = "";
        sheetRef.current.style.transition = "";
        window.dispatchEvent(new Event("resize"));
      }
    }, 320);
  };

  const handleMouseDown = (e) => {
    dragStartY.current = e.clientY;
    hasMoved.current = false;
    if (sheetRef.current) {
      startHeight.current = sheetRef.current.getBoundingClientRect().height;
      isDragging.current = true;
      sheetRef.current.style.transition = "none";
    }

    const onMouseMove = (moveEvt) => {
      if (!isDragging.current || !sheetRef.current) return;
      const deltaY = dragStartY.current - moveEvt.clientY;
      if (Math.abs(deltaY) > 5) hasMoved.current = true;
      const newHeight = startHeight.current + deltaY;
      const minH = 76;
      const maxH = window.innerHeight * 0.90;
      sheetRef.current.style.height = `${Math.max(minH, Math.min(maxH, newHeight))}px`;
    };

    const onMouseUp = (upEvt) => {
      isDragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);

      if (sheetRef.current) {
        sheetRef.current.style.transition = "height 0.3s cubic-bezier(0.16, 1, 0.3, 1)";
        if (!hasMoved.current) {
          sheetRef.current.style.height = "";
          sheetRef.current.style.transition = "";
          return;
        }

        const deltaY = dragStartY.current - upEvt.clientY;
        const currentH = sheetRef.current.getBoundingClientRect().height;
        const winH = window.innerHeight;

        let target = "half";
        if (deltaY > 45) target = mobileSheetMode === "peek" ? "half" : "full";
        else if (deltaY < -45) target = mobileSheetMode === "full" ? "half" : "peek";
        else target = currentH < winH * 0.28 ? "peek" : currentH < winH * 0.68 ? "half" : "full";

        setMobileSheetMode(target);
        setTimeout(() => {
          if (sheetRef.current) {
            sheetRef.current.style.height = "";
            sheetRef.current.style.transition = "";
            window.dispatchEvent(new Event("resize"));
          }
        }, 320);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Android Back navigation handler
  useEffect(() => {
    if (mobileSheetMode !== "peek") {
      window.history.pushState({ safepathSheet: mobileSheetMode }, "");
      const handlePopState = () => {
        setMobileSheetMode((curr) => (curr === "full" ? "half" : "peek"));
      };
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, [mobileSheetMode]);

  function startTrip(selectedKey, selectedData) {
    const key = typeof selectedKey === "string" ? selectedKey : activeRoute || "safest";
    let routeObj = (selectedData && typeof selectedData === "object" && Array.isArray(selectedData.path)) ? selectedData : null;
    if (!routeObj && routes) {
      routeObj = key === "safest" ? routes.safest_route : routes.fastest_route;
    }
    if (!routeObj && activeRouteData) {
      routeObj = activeRouteData;
    }

    if (!routeObj) {
      console.warn("[SafePath] Cannot start navigation: No route chosen");
      setMapError("Please calculate a route before starting navigation.");
      return;
    }

    if (!routeObj.path || !Array.isArray(routeObj.path) || routeObj.path.length < 2) {
      console.warn("[SafePath] Incomplete route path:", routeObj);
      setMapError("Route path data is not available. Please try recalculating.");
      return;
    }

    if (key !== activeRoute) {
      setActiveRoute(key);
    }

    setNavigatingRoute(routeObj);
    setMapError(null);
    setTripPos(routeObj.path[0] || null);
    setTripActive(true);
    setPanelCollapsed(true);
    setMobileSheetMode("peek");
    window.dispatchEvent(new Event("resize"));
  }

  function endTrip() {
    setTripActive(false);
    setNavigatingRoute(null);
    setTripPos(null);
    setPanelCollapsed(false);
    setMobileSheetMode("half");
    window.dispatchEvent(new Event("resize"));
  }

  function handleLoadRoute(src, dst, mode) {
    setSource(src);
    setDestination(dst);
    if (mode) setTravelMode(mode);
    setActiveTab("directions");
  }

  return (
    <div className={`app-shell ${panelCollapsed ? "collapsed" : ""}`}>
      {/* ── LEFT PANEL / MOBILE BOTTOM SHEET ── */}
      <aside
        ref={sheetRef}
        className={`side-panel mobile-sheet ${mobileSheetMode} ${tripActive ? "navigating" : ""}`}
      >
        {/* Mobile drag handle with touch and mouse listeners */}
        <div
          className="sheet-drag-handle"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onClick={() => {
            if (!hasMoved.current) {
              setMobileSheetMode((m) => (m === "peek" ? "half" : m === "half" ? "full" : "peek"));
              window.dispatchEvent(new Event("resize"));
            }
          }}
          role="button"
          aria-label="Drag or tap to expand bottom sheet"
        >
          <div className="sheet-handle-bar" />
        </div>

        {/* Mobile peek summary bar (when sheet is in peek mode) */}
        {mobileSheetMode === "peek" && (
          <div className="sheet-peek-bar" onClick={() => { setMobileSheetMode("half"); window.dispatchEvent(new Event("resize")); }}>
            {routes && activeRouteData ? (
              <div className="sheet-peek-content">
                <div className="sheet-peek-info">
                  <div className="sheet-peek-title">
                    <span className="sheet-peek-dot" style={{
                      backgroundColor: activeRoute === "safest" ? "#10b981" : "#eab308"
                    }} />
                    <strong>{routeNames[activeRoute]}</strong>
                    <span className="sheet-peek-score-badge">
                      🛡️ {Math.round(activeRouteData.safety_score ? (activeRouteData.safety_score <= 10 ? activeRouteData.safety_score * 10 : activeRouteData.safety_score) : 88)}/100
                    </span>
                  </div>
                  <div className="sheet-peek-meta">
                    <span>⏱ {activeRouteData.eta_mins} min</span>
                    <span>·</span>
                    <span>📍 {activeRouteData.distance_km} km</span>
                  </div>
                </div>
                <div className="sheet-peek-actions">
                  <button
                    type="button"
                    className="sheet-peek-start-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      startTrip(activeRoute, activeRouteData);
                    }}
                  >
                    <Navigation size={14} /> Start
                  </button>
                  <button
                    type="button"
                    className="sheet-peek-expand-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMobileSheetMode("half");
                      window.dispatchEvent(new Event("resize"));
                    }}
                    aria-label="Expand details"
                  >
                    <ChevronUp size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="sheet-peek-empty">
                <Search size={16} color="var(--cyan)" />
                <div className="sheet-peek-empty-text">
                  {source && destination
                    ? `${source.split(',')[0]} → ${destination.split(',')[0]}`
                    : "Plan safe route in Mumbai…"}
                </div>
                <button
                  type="button"
                  className="sheet-peek-expand-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMobileSheetMode("half");
                    window.dispatchEvent(new Event("resize"));
                  }}
                  aria-label="Expand search"
                >
                  <ChevronUp size={18} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mobile controls bar in half/full mode */}
        {mobileSheetMode !== "peek" && (
          <div
            className="mobile-sheet-controls"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
          >
            <span className="mobile-sheet-title">
              {activeTab === "directions" ? (routes ? "Route Options" : "Plan Safe Route") : activeTab === "safety" ? "Emergency & Safety Tools" : "City Safety Analytics"}
            </span>
            <div className="mobile-sheet-actions">
              <button
                type="button"
                className="mobile-sheet-toggle-btn"
                onClick={() => {
                  setMobileSheetMode((m) => (m === "half" ? "full" : "half"));
                  window.dispatchEvent(new Event("resize"));
                }}
                title={mobileSheetMode === "half" ? "Expand to full screen" : "Collapse to half"}
                aria-label={mobileSheetMode === "half" ? "Expand" : "Collapse"}
              >
                {mobileSheetMode === "half" ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              <button
                type="button"
                className="mobile-sheet-toggle-btn"
                onClick={() => {
                  setMobileSheetMode("peek");
                  window.dispatchEvent(new Event("resize"));
                }}
                title="Minimize to map"
                aria-label="Minimize"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        )}

        <div className="panel-head">
          <div className="brand-icon-wrap"><Shield size={18} color="#00d4ff" /></div>
          <div>
            <span className="brand-name">SafePath</span>
            <span className="brand-tag">Crime-Avoidance Navigation</span>
          </div>
        </div>

        <div className="panel-tabs" role="tablist">
          <button role="tab" aria-selected={activeTab === "directions"}
            className={`panel-tab ${activeTab === "directions" ? "active" : ""}`}
            onClick={() => setActiveTab("directions")}>
            <Navigation size={14} /> Directions
          </button>
          <button role="tab" aria-selected={activeTab === "safety"}
            className={`panel-tab ${activeTab === "safety" ? "active" : ""}`}
            onClick={() => setActiveTab("safety")}>
            <Shield size={14} /> Safety
          </button>
          <button role="tab" aria-selected={activeTab === "analytics"}
            className={`panel-tab ${activeTab === "analytics" ? "active" : ""}`}
            onClick={() => setActiveTab("analytics")}>
            <BarChart3 size={14} /> Analytics
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
              user={user}
            />
          </div>

          {/* Analytics tab */}
          {activeTab === "analytics" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <AnalyticsDashboard onSelectCluster={setSelectedClusterId} />
            </div>
          )}

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

        {/* Sticky Start Navigation CTA for full bottom sheet mode */}
        {mobileSheetMode === "full" && routes && activeRouteData && activeTab === "directions" && (
          <div className="sheet-sticky-footer">
            <button
              type="button"
              className="sheet-full-start-btn"
              onClick={() => startTrip(activeRoute, activeRouteData)}
            >
              <Navigation size={18} />
              <span>Start Navigation · {routeNames[activeRoute]} ({activeRouteData?.eta_mins} min)</span>
            </button>
          </div>
        )}
      </aside>

      <button className="panel-toggle" onClick={() => setPanelCollapsed(!panelCollapsed)}
        aria-label={panelCollapsed ? "Show side panel" : "Hide side panel"}>
        {panelCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* ── MOBILE TOP BAR ── */}
      {!tripActive && (
        <header className="mobile-top-bar" role="banner">
          <div className="mobile-brand-pill">
            <div className="brand-icon-wrap" style={{ width: 28, height: 28, borderRadius: 8 }}>
              <Shield size={15} color="#00d4ff" />
            </div>
            <span className="mobile-brand-name">SafePath</span>
          </div>
          <div className="mobile-top-actions">
            <button
              className={`mobile-action-btn ${showLayerPanel ? "active" : ""}`}
              onClick={() => setShowLayerPanel(!showLayerPanel)}
              title="Map Layers"
              aria-label="Map Layers"
            >
              <Layers size={17} />
            </button>
            <button className="mobile-action-btn" onClick={() => setShowRecentTrips(true)} title="Recent Trips" aria-label="Recent Trips">
              <History size={17} />
            </button>
            {user ? (
              <div style={{ position: "relative" }}>
                <button
                  className="mobile-action-btn mobile-avatar-btn"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  aria-label="Account menu"
                >
                  {user.profilePicture ? <img src={user.profilePicture} alt="" /> : (user.name?.charAt(0) || "U").toUpperCase()}
                </button>
                {showProfileDropdown && (
                  <div className="profile-menu mobile-profile-menu">
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
              <button className="mobile-signin-btn" onClick={() => navigate("/login")}>
                Sign In
              </button>
            )}
          </div>
        </header>
      )}

      {/* ── MAP AREA ── */}
      <div className="map-wrapper">
        <MapView
          routes={routes}
          activeRoute={activeRoute}
          activeRouteData={navigatingRoute || activeRouteData}
          onMapClick={setMapClickCoords}
          mapError={mapError}
          showCrimeZones={showCrimeZones}
          showCrimeClusters={showCrimeClusters}
          showStreetLighting={showStreetLighting}
          showTrafficDensity={showTrafficDensity}
          showRoadNetwork={showRoadNetwork}
          showHazards={showHazards}
          onRouteResources={onRouteResources}
          showEVChargers={showEVChargers}
          showPolice={showPolice}
          showHospitals={showHospitals}
          showSafeHavens={showSafeHavens}
          navigating={tripActive}
          onStartTrip={startTrip}
          followPos={tripPos}
          selectedClusterId={selectedClusterId}
          onSelectCluster={setSelectedClusterId}
          onSelectRoute={setActiveRoute}
        />

        {/* Crime Zone & FIR Detail Panel */}
        {selectedClusterId != null && (
          <CrimeDetailPanel
            clusterId={selectedClusterId}
            onClose={() => setSelectedClusterId(null)}
          />
        )}

        {tripActive && (
          <TripOverlay route={navigatingRoute || activeRouteData} routeName={routeNames[activeRoute]} onPosition={setTripPos} onEnd={endTrip} />
        )}

        {/* Floating Top-Right Controls: Layers Toggle, Recent Trips, User Profile */}
        {!tripActive && (
          <div className="map-top-bar-controls">
            <button
              type="button"
              className={`map-layer-trigger ${showLayerPanel ? "active" : ""}`}
              onClick={() => setShowLayerPanel((v) => !v)}
              title="Configure Map Layers"
              aria-label="Map Layers"
              aria-expanded={showLayerPanel}
            >
              <Layers size={16} />
              <span className="layer-trigger-label">Layers</span>
              <span className="layer-trigger-badge">{activeLayerCount}/10</span>
            </button>

            <button className="round-btn" onClick={() => setShowRecentTrips(true)} title="Recent trips" aria-label="Recent trips">
              <History size={18} />
            </button>

            {user ? (
              <div style={{ position: "relative" }}>
                <button
                  className="round-btn avatar-btn"
                  onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                  aria-label="Account menu"
                  aria-expanded={showProfileDropdown}
                >
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
          </div>
        )}

        {/* Floating Layer Control Panel */}
        <LayerControlPanel
          isOpen={showLayerPanel && !tripActive}
          onClose={() => setShowLayerPanel(false)}
          layerState={layerState}
          onToggleLayer={handleToggleLayer}
          onResetLayers={handleResetLayers}
        />

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

      {/* ── MOBILE BOTTOM NAVIGATION BAR ── */}
      {!tripActive && (
        <nav className="mobile-bottom-nav" role="navigation" aria-label="Primary Mobile Navigation">
          <button
            className={`mob-nav-btn ${activeTab === "directions" && mobileSheetMode !== "peek" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("directions");
              if (mobileSheetMode === "peek") setMobileSheetMode("half");
            }}
            aria-label="Directions"
          >
            <Navigation size={19} />
            <span>Routes</span>
          </button>
          <button
            className={`mob-nav-btn ${activeTab === "safety" && mobileSheetMode !== "peek" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("safety");
              if (mobileSheetMode === "peek") setMobileSheetMode("half");
            }}
            aria-label="Safety Tools"
          >
            <Shield size={19} />
            <span>Safety</span>
          </button>
          <button
            className={`mob-nav-btn ${activeTab === "analytics" && mobileSheetMode !== "peek" ? "active" : ""}`}
            onClick={() => {
              setActiveTab("analytics");
              if (mobileSheetMode === "peek") setMobileSheetMode("half");
            }}
            aria-label="City Analytics"
          >
            <BarChart3 size={19} />
            <span>Analytics</span>
          </button>
          <button
            className="mob-nav-btn"
            onClick={() => setShowSavedRoutes(true)}
            aria-label="Saved Routes"
          >
            <Bookmark size={19} />
            <span>Saved</span>
          </button>
        </nav>
      )}
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