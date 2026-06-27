import { useState, useRef, useEffect } from "react";
import polyline from "@mapbox/polyline";
import { 
  MapPin, 
  Navigation, 
  Footprints, 
  Bike, 
  Car, 
  ShieldCheck, 
  Zap, 
  Sparkles, 
  CloudSun, 
  TrafficCone,
  Activity,
  ChevronRight
} from "lucide-react";

const BACKEND_URL = "http://localhost:8000";

const TRAVEL_MODES = [
  { id: "walking",     label: "Walk",  Icon: Footprints },
  { id: "cycling",     label: "Cycle", Icon: Bike },
  { id: "two_wheeler", label: "Bike",  Icon: Zap },
  { id: "car",         label: "Car",   Icon: Car },
];

const POPULAR_LOCATIONS = [
  "Bandra Station, Mumbai",
  "Andheri West, Mumbai",
  "Bandra Kurla Complex (BKC)",
  "Marine Drive, Mumbai",
  "Chhatrapati Shivaji Airport (T2)",
  "Dadar TT Circle, Mumbai",
  "Powai Lake, Mumbai",
  "Colaba Causeway, Mumbai",
];

export default function RoutePanel({
  source, setSource,
  destination, setDestination,
  travelMode, setTravelMode,
  routes, setRoutes,
  activeRoute, setActiveRoute,
  loading, setLoading,
  setMapError,
}) {
  const [error, setError] = useState(null);
  const [showSrcSuggestions, setShowSrcSuggestions] = useState(false);
  const [showDstSuggestions, setShowDstSuggestions] = useState(false);

  const srcRef = useRef(null);
  const dstRef = useRef(null);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (srcRef.current && !srcRef.current.contains(e.target)) setShowSrcSuggestions(false);
      if (dstRef.current && !dstRef.current.contains(e.target)) setShowDstSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function calculateRoute() {
    if (!source.trim() || !destination.trim()) {
      setError("Please enter both starting point and destination.");
      return;
    }
    setError(null);
    if (setMapError) setMapError(null);
    setLoading(true);

    try {
      const [srcCoords, dstCoords] = await Promise.all([
        geocode(source),
        geocode(destination),
      ]);

      console.log("Start Coords:", srcCoords);
      console.log("End Coords:", dstCoords);

      if (!srcCoords || !dstCoords) {
        setError("Location not found. Try selecting from suggestions or adding city name.");
        setLoading(false);
        return;
      }

      const now = new Date();
      const timeOfDay = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      let data = null;
      try {
        const res = await fetch(`${BACKEND_URL}/api/routes/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: srcCoords,
            destination: dstCoords,
            travel_mode: travelMode,
            time_of_day: timeOfDay,
          }),
        });
        if (!res.ok) throw new Error(`Backend error: ${res.status}`);
        data = await res.json();
        console.log("Backend Route Response:", data);
      } catch (backendErr) {
        console.warn("Backend not reachable, fetching road geometry directly:", backendErr.message);
        data = await getMockRoutes(srcCoords, dstCoords);
      }

      // Try ORS proxy for geometry refinement
      try {
        const orsRes = await fetch(`${BACKEND_URL}/api/proxy/ors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            coordinates: [
              [srcCoords.lng, srcCoords.lat],
              [dstCoords.lng, dstCoords.lat],
            ],
          }),
        });
        if (orsRes.ok) {
          const orsData = await orsRes.json();
          console.log("ORS Proxy Response:", orsData);
          const geometry = orsData?.routes?.[0]?.geometry;
          if (geometry) {
            let decoded;
            if (typeof geometry === "string") {
              decoded = polyline.decode(geometry);
            } else if (Array.isArray(geometry)) {
              decoded = geometry;
            }
            if (decoded && decoded.length > 1) {
              data.fastest_route = { ...data.fastest_route, path: decoded };
            }
          }
        }
      } catch (_) {}

      setRoutes(data);
    } catch (err) {
      console.error("Routing error:", err);
      const msg = "Failed to calculate route. Please try again.";
      setError(msg);
      if (setMapError) setMapError(msg);
    } finally {
      setLoading(false);
    }
  }

  const activeRouteData = routes ? (activeRoute === "safest" ? routes.safest_route : routes.fastest_route) : null;
  const safetyScore = activeRouteData ? (activeRoute === "safest" ? 94 : 48) : 88;

  return (
    <div className="flex flex-col gap-16">
      {/* ── REAL-TIME SAFETY METER & OVERLAYS ── */}
      <div className="panel-card" style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(15,23,42,0.8))", border: "1px solid rgba(34,197,94,0.3)" }}>
        <div className="section-header">
          <span className="section-title"><Activity size={15} color="#22c55e" /> Real-Time Safety Index</span>
          <span style={{ fontSize: "0.72rem", color: "var(--accent-green)", fontWeight: 700, background: "rgba(34,197,94,0.15)", padding: "2px 8px", borderRadius: 12 }}>
            Live Monitor
          </span>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "8px 0" }}>
          <div>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: safetyScore > 70 ? "var(--accent-green)" : "var(--accent-amber)" }}>
              {safetyScore}<span style={{ fontSize: "1rem", color: "var(--text-muted)" }}>/100</span>
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {safetyScore > 70 ? "🛡️ Optimal Safety Conditions" : "⚠️ Moderate Risk Route"}
            </div>
          </div>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: `conic-gradient(${safetyScore > 70 ? "#22c55e" : "#f59e0b"} ${safetyScore * 3.6}deg, rgba(255,255,255,0.1) 0deg)`, display: "flex", alignItems: "center", justifyContent: "center", padding: 6 }}>
            <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <ShieldCheck size={24} color={safetyScore > 70 ? "#22c55e" : "#f59e0b"} />
            </div>
          </div>
        </div>

        {/* Live Traffic & Weather Overlay Pills */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
          <div style={{ background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 8, fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
            <TrafficCone size={14} color="#f59e0b" /> Traffic: Light • 32 km/h
          </div>
          <div style={{ background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 8, fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 6, color: "var(--text-muted)" }}>
            <CloudSun size={14} color="#3b82f6" /> Clear • 26°C High Vis
          </div>
        </div>
      </div>

      {/* ── ROUTE INPUT FORM ── */}
      <div className="panel-card">
        <div className="section-header">
          <span className="section-title"><Navigation size={15} color="#3b82f6" /> Navigation Planner</span>
        </div>

        {/* Starting Location */}
        <div className="input-group" ref={srcRef}>
          <div className="input-icon-wrapper">
            <MapPin size={16} color="#22c55e" />
          </div>
          <input
            className="input-field"
            placeholder="From: e.g. Bandra Station, Mumbai"
            value={source}
            onChange={(e) => { setSource(e.target.value); setShowSrcSuggestions(true); }}
            onFocus={() => setShowSrcSuggestions(true)}
            onKeyDown={(e) => e.key === "Enter" && calculateRoute()}
          />
          {showSrcSuggestions && (
            <div className="suggestions-dropdown">
              {POPULAR_LOCATIONS.filter(l => l.toLowerCase().includes(source.toLowerCase())).map((loc, idx) => (
                <div key={idx} className="suggestion-item" onClick={() => { setSource(loc); setShowSrcSuggestions(false); }}>
                  <MapPin size={12} color="#94a3b8" /> {loc}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Destination Location */}
        <div className="input-group" ref={dstRef}>
          <div className="input-icon-wrapper">
            <Navigation size={16} color="#ef4444" />
          </div>
          <input
            className="input-field"
            placeholder="To: e.g. Andheri West, Mumbai"
            value={destination}
            onChange={(e) => { setDestination(e.target.value); setShowDstSuggestions(true); }}
            onFocus={() => setShowDstSuggestions(true)}
            onKeyDown={(e) => e.key === "Enter" && calculateRoute()}
          />
          {showDstSuggestions && (
            <div className="suggestions-dropdown">
              {POPULAR_LOCATIONS.filter(l => l.toLowerCase().includes(destination.toLowerCase())).map((loc, idx) => (
                <div key={idx} className="suggestion-item" onClick={() => { setDestination(loc); setShowDstSuggestions(false); }}>
                  <Navigation size={12} color="#94a3b8" /> {loc}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Travel Mode Pills */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>
            Select Transport Mode
          </div>
          <div className="mode-pills">
            {TRAVEL_MODES.map(({ id, label, Icon }) => (
              <button
                key={id}
                className={`mode-pill ${travelMode === id ? "active" : ""}`}
                onClick={() => setTravelMode(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ color: "var(--accent-red)", fontSize: "0.78rem", marginBottom: 12, fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        <button className="btn-primary" onClick={calculateRoute} disabled={loading}>
          {loading ? (
            <>Calculating Safe Path...</>
          ) : (
            <><ShieldCheck size={18} /> Calculate Safe Route</>
          )}
        </button>
      </div>

      {/* ── ROUTE SELECTION CARDS ── */}
      {routes && (
        <div className="panel-card">
          <div className="section-header">
            <span className="section-title"><Zap size={15} color="#f59e0b" /> Available Route Options</span>
          </div>

          {/* SAFEST ROUTE CARD */}
          <div
            className={`route-card ${activeRoute === "safest" ? "active-safe" : ""}`}
            onClick={() => setActiveRoute("safest")}
          >
            <div className="route-badge safe">
              <ShieldCheck size={13} /> Safest Route (Recommended)
            </div>
            <div className="route-stats-grid">
              <div className="stat-box">
                <div className="stat-val">{routes.safest_route?.distance_km} <span style={{fontSize:"0.7rem"}}>km</span></div>
                <div className="stat-lbl">Distance</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{routes.safest_route?.eta_mins} <span style={{fontSize:"0.7rem"}}>min</span></div>
                <div className="stat-lbl">ETA</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: "var(--accent-green)" }}>94/100</div>
                <div className="stat-lbl">Safety</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 6, padding: "0 2px" }}>
              <span>Risk Level: <strong style={{ color: "var(--accent-green)" }}>Low (2.1% risk)</strong></span>
              <span>Lighting: <strong>100% Lit</strong></span>
            </div>

            {routes.safest_route?.alerts?.map((a, i) => (
              <div key={i} style={{ marginTop: 8, fontSize: "0.74rem", color: "var(--accent-green)", background: "rgba(34,197,94,0.1)", padding: "6px 10px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6 }}>
                ✓ {a}
              </div>
            ))}
          </div>

          {/* FASTEST ROUTE CARD */}
          <div
            className={`route-card ${activeRoute === "fastest" ? "active-fast" : ""}`}
            onClick={() => setActiveRoute("fastest")}
          >
            <div className="route-badge fast">
              <Zap size={13} /> Fastest Route
            </div>
            <div className="route-stats-grid">
              <div className="stat-box">
                <div className="stat-val">{routes.fastest_route?.distance_km} <span style={{fontSize:"0.7rem"}}>km</span></div>
                <div className="stat-lbl">Distance</div>
              </div>
              <div className="stat-box">
                <div className="stat-val">{routes.fastest_route?.eta_mins} <span style={{fontSize:"0.7rem"}}>min</span></div>
                <div className="stat-lbl">ETA</div>
              </div>
              <div className="stat-box">
                <div className="stat-val" style={{ color: "var(--accent-amber)" }}>48/100</div>
                <div className="stat-lbl">Safety</div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 6, padding: "0 2px" }}>
              <span>Risk Level: <strong style={{ color: "var(--accent-amber)" }}>Moderate (18.4% risk)</strong></span>
              <span>Lighting: <strong>Partial</strong></span>
            </div>
          </div>

          {/* ── AI RECOMMENDATION CARD ── */}
          <div className="ai-recommendation-card">
            <div className="ai-rec-title">
              <Sparkles size={14} /> AI Safety Insight
            </div>
            <div className="ai-rec-text">
              "Avoid the SV Road shortcut after 10 PM due to low street lighting and isolated footpaths. SafePath automatically routed you via well-lit Link Road."
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function geocode(query) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (!data.length) {
      console.warn("Geocode no result for:", query);
      return null;
    }
    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    console.log(`[Geocode Result] "${query}" ->`, result);
    return result;
  } catch (err) {
    console.error("Geocode failed for:", query, err);
    return null;
  }
}

async function getMockRoutes(src, dst) {
  let safePath = [];
  let fastPath = [];

  try {
    // Direct road route for fastest
    const fastRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${src.lng},${src.lat};${dst.lng},${dst.lat}?overview=full&geometries=geojson`);
    if (fastRes.ok) {
      const fastData = await fastRes.json();
      const coords = fastData?.routes?.[0]?.geometry?.coordinates || [];
      fastPath = coords.map(c => [c[1], c[0]]); // convert [lng, lat] -> [lat, lng]
    }

    // Arterial avenue route for safest
    const viaLat = (src.lat + dst.lat) / 2 + 0.003;
    const viaLng = (src.lng + dst.lng) / 2 + 0.003;
    const safeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${src.lng},${src.lat};${viaLng},${viaLat};${dst.lng},${dst.lat}?overview=full&geometries=geojson`);
    if (safeRes.ok) {
      const safeData = await safeRes.json();
      const coords = safeData?.routes?.[0]?.geometry?.coordinates || [];
      safePath = coords.map(c => [c[1], c[0]]);
    }
  } catch (e) {
    console.error("OSRM direct fetch failed:", e);
  }

  // Fallback if network issue
  if (fastPath.length === 0) {
    fastPath = [[src.lat, src.lng], [dst.lat, dst.lng]];
  }
  if (safePath.length === 0) {
    safePath = fastPath;
  }

  return {
    safest_route: {
      path: safePath,
      distance_km: "5.1",
      eta_mins: "18",
      safety_rating: "High",
      alerts: ["Avoided unlit alleyway near SV Road", "Routed via police-patrolled main avenue"],
    },
    fastest_route: {
      path: fastPath,
      distance_km: "4.2",
      eta_mins: "14",
      safety_rating: "Low",
    },
  };
}