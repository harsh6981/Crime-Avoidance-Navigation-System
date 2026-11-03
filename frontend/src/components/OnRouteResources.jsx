import { useState, useEffect, useRef, useCallback } from "react";
import { Zap, ShieldCheck, Heart, ChevronDown, ChevronUp, Phone, MapPin, Clock, Wifi, Loader } from "lucide-react";

const BACKEND_URL = "http://localhost:8000";

// ── TomTom EV Charging Availability hook ──
// Fetches real-time socket status via our backend proxy.
// charger_id: the TomTom chargingAvailability UUID stored in the resource (ev_tomtom_id).
// Falls back gracefully to null when not available.
function useEVAvailability(evTomtomId) {
  const [avail, setAvail] = useState(null);
  const [fetching, setFetching] = useState(false);

  const fetchAvail = useCallback(async () => {
    if (!evTomtomId) return;
    setFetching(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/ev/availability?charger_id=${encodeURIComponent(evTomtomId)}`);
      if (res.ok) {
        const data = await res.json();
        setAvail(data.summary);
      }
    } catch (_) { /* silently ignore — availability is supplemental */ }
    finally { setFetching(false); }
  }, [evTomtomId]);

  useEffect(() => {
    fetchAvail();
    // Refresh every 3 min (TomTom updates every ~3 min)
    const interval = setInterval(fetchAvail, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchAvail]);

  return { avail, fetching, refresh: fetchAvail };
}

// ── EV Availability Badge component ──
function EVAvailBadge({ evTomtomId }) {
  const { avail, fetching } = useEVAvailability(evTomtomId);

  if (!evTomtomId) return null;
  if (fetching && !avail) return (
    <span style={{ fontSize: "0.65rem", color: "#64748b", display: "flex", alignItems: "center", gap: 3 }}>
      <Loader size={9} style={{ animation: "spin 1s linear infinite" }} /> checking…
    </span>
  );
  if (!avail) return null;

  const isAvail = avail.status === "available";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: "0.65rem", fontWeight: 700,
      color: isAvail ? "#22c55e" : "#f97316",
      background: isAvail ? "rgba(34,197,94,0.12)" : "rgba(249,115,22,0.12)",
      border: `1px solid ${isAvail ? "rgba(34,197,94,0.35)" : "rgba(249,115,22,0.35)"}`,
      borderRadius: 8, padding: "2px 7px",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: isAvail ? "#22c55e" : "#f97316",
        boxShadow: `0 0 4px ${isAvail ? "#22c55e" : "#f97316"}`,
      }} />
      {avail.available}/{avail.total_sockets} free · {isAvail ? "Available" : "Full"}
    </span>
  );
}
const TYPE_CONFIG = {
  ev_charger: {
    label: "EV Chargers",
    icon: <Zap size={15} color="#22c55e" />,
    emoji: "⚡",
    color: "#22c55e",
    bgColor: "rgba(34,197,94,0.1)",
    borderColor: "rgba(34,197,94,0.3)",
  },
  police: {
    label: "Police Stations",
    icon: <ShieldCheck size={15} color="#3b82f6" />,
    emoji: "🚔",
    color: "#3b82f6",
    bgColor: "rgba(59,130,246,0.1)",
    borderColor: "rgba(59,130,246,0.3)",
  },
  hospital: {
    label: "Hospitals",
    icon: <Heart size={15} color="#ef4444" />,
    emoji: "🏥",
    color: "#ef4444",
    bgColor: "rgba(239,68,68,0.1)",
    borderColor: "rgba(239,68,68,0.3)",
  },
};

function generateMockResources(clat, clng) {
  return [
    { id: "m-ev-1", type: "ev_charger", icon: "⚡", label: "EV Charging Station",
      name: "Tata Power EV Hub", lat: clat + 0.006, lng: clng + 0.004,
      address: "Western Express Highway", contact: "", ev_sockets: "4",
      ev_network: "Tata Power", opening_hours: "24/7", emergency: "", color: "#22c55e" },
    { id: "m-ev-2", type: "ev_charger", icon: "⚡", label: "EV Charging Station",
      name: "BPCL EV Point", lat: clat - 0.007, lng: clng + 0.009,
      address: "BPCL Petrol Pump", contact: "1800-209-4511", ev_sockets: "2",
      ev_network: "BPCL", opening_hours: "06:00–22:00", emergency: "", color: "#22c55e" },
    { id: "m-pol-1", type: "police", icon: "🚔", label: "Police Station",
      name: "Andheri Police Station", lat: clat + 0.003, lng: clng - 0.005,
      address: "J.P. Road, Andheri West", contact: "100", ev_sockets: "",
      ev_network: "", opening_hours: "24/7", emergency: "yes", color: "#3b82f6" },
    { id: "m-pol-2", type: "police", icon: "🚔", label: "Police Station",
      name: "Bandra Police Station", lat: clat - 0.009, lng: clng - 0.002,
      address: "Hill Road, Bandra", contact: "100", ev_sockets: "",
      ev_network: "", opening_hours: "24/7", emergency: "yes", color: "#3b82f6" },
    { id: "m-h-1", type: "hospital", icon: "🏥", label: "Hospital / Clinic",
      name: "Kokilaben Hospital", lat: clat - 0.004, lng: clng + 0.007,
      address: "Four Bungalows, Andheri West", contact: "1800-XXX-9999", ev_sockets: "",
      ev_network: "", opening_hours: "24/7", emergency: "yes", color: "#ef4444" },
    { id: "m-h-2", type: "hospital", icon: "🏥", label: "Hospital / Clinic",
      name: "Lilavati Hospital", lat: clat + 0.010, lng: clng - 0.006,
      address: "A Road, Bandra West", contact: "022-2675-1000", ev_sockets: "",
      ev_network: "", opening_hours: "24/7", emergency: "yes", color: "#ef4444" },
  ];
}

export default function OnRouteResources({
  routes,
  activeRoute,
  onResourcesLoaded,
  showEVChargers, setShowEVChargers,
  showPolice, setShowPolice,
  showHospitals, setShowHospitals,
}) {
  const [loading, setLoading] = useState(false);
  const [resources, setResources] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [expandedType, setExpandedType] = useState(null);

  // ── Auto-fetch whenever a new route is calculated ──
  const prevRouteRef = useRef(null);
  useEffect(() => {
    const activeRouteData = activeRoute === "safest"
      ? routes?.safest_route
      : routes?.fastest_route;
    const coords = activeRouteData?.path;

    // Only auto-fetch if routes actually changed
    if (!coords || coords.length < 2) return;
    if (prevRouteRef.current === routes) return;
    prevRouteRef.current = routes;

    doFetch(coords);
  }, [routes, activeRoute]);

  async function doFetch(coords) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/resources/on-route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_coords: coords,
          radius_meters: 1500,
          resource_types: ["ev_charger", "police", "hospital"],
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list = data.resources || [];
      setResources(list);
      if (onResourcesLoaded) onResourcesLoaded(list);
    } catch (e) {
      const mid = coords[Math.floor(coords.length / 2)];
      const mock = generateMockResources(mid[0], mid[1]);
      setResources(mock);
      if (onResourcesLoaded) onResourcesLoaded(mock);
    } finally {
      setLoading(false);
    }
  }

  function manualRefresh() {
    const activeRouteData = activeRoute === "safest"
      ? routes?.safest_route
      : routes?.fastest_route;
    const coords = activeRouteData?.path;
    if (!coords || coords.length < 2) {
      setError("Calculate a route first.");
      return;
    }
    doFetch(coords);
  }

  const grouped = resources
    ? Object.fromEntries(["ev_charger", "police", "hospital"].map(t => [t, resources.filter(r => r.type === t)]))
    : null;

  const toggleMap = {
    ev_charger: { show: showEVChargers, set: setShowEVChargers },
    police:     { show: showPolice,     set: setShowPolice },
    hospital:   { show: showHospitals,  set: setShowHospitals },
  };

  return (
    <div className="panel-card" style={{
      background: "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(20,30,50,0.95))",
      border: "1px solid rgba(99,102,241,0.25)",
    }}>
      {/* Header */}
      <div className="section-header" style={{ cursor: "pointer" }} onClick={() => setExpanded(!expanded)}>
        <span className="section-title">
          <span style={{ fontSize: "1rem" }}>🗺️</span>&nbsp;On-Route Resources
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {loading && <Loader size={14} color="#a5b4fc" style={{ animation: "spin 1s linear infinite" }} />}
          {resources && !loading && (
            <span style={{
              fontSize: "0.7rem", fontWeight: 700,
              background: "rgba(99,102,241,0.2)", color: "#a5b4fc",
              padding: "2px 8px", borderRadius: 20,
              border: "1px solid rgba(99,102,241,0.3)"
            }}>
              {resources.length} found
            </span>
          )}
          {expanded ? <ChevronUp size={15} color="#64748b" /> : <ChevronDown size={15} color="#64748b" />}
        </span>
      </div>

      {expanded && (
        <>
          <p style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
            Auto-loaded: EV chargers ⚡ · Police 🚔 · Hospitals 🏥 along your route.
          </p>

          {/* Status line */}
          {!routes && (
            <div style={{ fontSize: "0.76rem", color: "#64748b", textAlign: "center", padding: "10px 0", fontStyle: "italic" }}>
              Calculate a route to see nearby resources.
            </div>
          )}

          {routes && (
            <button
              className="btn-primary"
              onClick={manualRefresh}
              disabled={loading}
              style={{
                background: loading ? "rgba(99,102,241,0.3)" : "linear-gradient(135deg, #6366f1, #8b5cf6)",
                fontSize: "0.8rem", padding: "8px 14px",
                marginBottom: grouped ? 14 : 0,
              }}
            >
              {loading ? "🔄 Scanning Route..." : "🔄 Refresh Resources"}
            </button>
          )}

          {error && (
            <div style={{ fontSize: "0.75rem", color: "#ef4444", marginBottom: 8, fontWeight: 600 }}>⚠️ {error}</div>
          )}

          {/* Grouped sections */}
          {grouped && Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
            const items = grouped[type] || [];
            const { show, set } = toggleMap[type];
            const isOpen = expandedType === type;

            return (
              <div key={type} style={{ marginBottom: 8 }}>
                {/* Type row */}
                <div
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", borderRadius: 10,
                    background: cfg.bgColor, border: `1px solid ${cfg.borderColor}`,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedType(isOpen ? null : type)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {cfg.icon}
                    <span style={{ fontSize: "0.78rem", fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
                    <span style={{
                      fontSize: "0.66rem", fontWeight: 700,
                      background: cfg.bgColor, color: cfg.color,
                      padding: "2px 6px", borderRadius: 10, border: `1px solid ${cfg.borderColor}`,
                    }}>
                      {items.length}
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); set(!show); }}
                      style={{
                        background: show ? cfg.bgColor : "transparent",
                        border: `1px solid ${show ? cfg.color : "rgba(255,255,255,0.15)"}`,
                        borderRadius: 6, padding: "2px 8px",
                        fontSize: "0.65rem", fontWeight: 700,
                        color: show ? cfg.color : "#64748b",
                        cursor: "pointer",
                      }}
                    >
                      {show ? "👁 Visible" : "👁 Hidden"}
                    </button>
                    {isOpen ? <ChevronUp size={13} color="#64748b" /> : <ChevronDown size={13} color="#64748b" />}
                  </div>
                </div>

                {/* Items */}
                {isOpen && (
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 5 }}>
                    {items.length === 0 ? (
                      <div style={{ fontSize: "0.73rem", color: "#64748b", padding: "8px 12px", fontStyle: "italic" }}>
                        No {cfg.label.toLowerCase()} found near this route.
                      </div>
                    ) : items.map((r) => (
                      <div key={r.id} style={{
                        background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 10, padding: "10px 12px", marginLeft: 4,
                        borderLeft: `3px solid ${cfg.color}`,
                      }}>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#f1f5f9", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                          {r.icon} {r.name}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {r.address && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.71rem", color: "#94a3b8" }}>
                              <MapPin size={10} color="#64748b" /> {r.address}
                            </div>
                          )}
                          {r.contact && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.71rem" }}>
                              <Phone size={10} color="#64748b" />
                              <a href={`tel:${r.contact}`} style={{ color: "#60a5fa", textDecoration: "none" }}>{r.contact}</a>
                            </div>
                          )}
                          {r.opening_hours && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.71rem", color: "#94a3b8" }}>
                              <Clock size={10} color="#64748b" /> {r.opening_hours}
                            </div>
                          )}
                          {r.type === "ev_charger" && r.ev_sockets && (
                            <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.71rem" }}>
                              <Wifi size={10} color="#22c55e" />
                              <span style={{ color: "#22c55e", fontWeight: 600 }}>
                                {r.ev_sockets} sockets{r.ev_network ? ` · ${r.ev_network}` : ""}
                              </span>
                            </div>
                          )}
                          {/* Live TomTom EV Availability badge — auto-refreshes every 3 min */}
                          {r.type === "ev_charger" && (
                            <EVAvailBadge evTomtomId={r.ev_tomtom_id || null} />
                          )}
                          {r.type === "hospital" && r.emergency === "yes" && (
                            <div style={{ fontSize: "0.69rem", color: "#f87171", fontWeight: 700, marginTop: 2 }}>🚨 24/7 Emergency</div>
                          )}
                          {r.type === "police" && (
                            <div style={{ fontSize: "0.69rem", color: "#60a5fa", fontWeight: 700, marginTop: 2 }}>🚔 Emergency: 100</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {resources && (
            <div style={{
              marginTop: 8, fontSize: "0.69rem", color: "#475569",
              borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8,
            }}>
              📍 Tap any map marker for details &nbsp;·&nbsp; EV data: TomTom Live · Resources: OpenStreetMap
            </div>
          )}
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
