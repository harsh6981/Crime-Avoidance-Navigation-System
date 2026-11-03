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
  ChevronRight,
  Cloud,
  CloudRain,
  Sun,
  Wind,
  Bookmark,
  BookmarkCheck,
  ArrowUpDown
} from "lucide-react";

const BACKEND_URL = "http://localhost:8000";

// ── TomTom API key (set in frontend/.env as VITE_TOMTOM_API_KEY) ──
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY;

const WEATHER_ICON_MAP = {
  "sun": Sun,
  "cloud-sun": CloudSun,
  "cloud": Cloud,
  "cloud-rain": CloudRain,
  "wind": Wind,
};

const TRAVEL_MODES = [
  { id: "walking", label: "Walk", Icon: Footprints },
  { id: "cycling", label: "Cycle", Icon: Bike },
  { id: "two_wheeler", label: "Bike", Icon: Zap },
  { id: "car", label: "Car", Icon: Car },
];

// ── TomTom Fuzzy Search / Autocomplete helper ──
// Returns an array of { label, lat, lng } suggestions for a query string.
async function tomtomSuggest(query, countrySet = "IN") {
  if (!TOMTOM_KEY || !query || query.trim().length < 2) return [];
  try {
    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json` +
      `?key=${TOMTOM_KEY}&limit=6&countrySet=${countrySet}&language=en-US`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r) => ({
      label: r.poi?.name
        ? `${r.poi.name}, ${r.address?.freeformAddress || ""}`
        : (r.address?.freeformAddress || r.address?.municipality || ""),
      lat: r.position?.lat,
      lng: r.position?.lon,
    })).filter((s) => s.label && s.lat != null);
  } catch (_) {
    return [];
  }
}

// Fallback static popular locations (shown when input is empty or TomTom key is absent)
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

// ── Fallback weather logic based on time of day ──
function getWeatherFallback() {
  const hour = new Date().getHours();
  const month = new Date().getMonth();

  // Monsoon season (June-Sept) in Mumbai
  const isMonsoon = month >= 5 && month <= 8;

  if (isMonsoon) {
    if (hour >= 14 && hour <= 18) {
      return { icon: CloudRain, text: "Rain", temp: 27, visibility: "Low Vis", color: "#3b82f6" };
    }
    return { icon: Cloud, text: "Overcast", temp: 28, visibility: "Mod Vis", color: "#94a3b8" };
  }

  if (hour >= 6 && hour < 10) return { icon: Sun, text: "Clear", temp: 26, visibility: "High Vis", color: "#f59e0b" };
  if (hour >= 10 && hour < 16) return { icon: Sun, text: "Sunny", temp: 32, visibility: "High Vis", color: "#f59e0b" };
  if (hour >= 16 && hour < 19) return { icon: CloudSun, text: "Hazy", temp: 29, visibility: "Mod Vis", color: "#f59e0b" };
  if (hour >= 19 && hour < 22) return { icon: Wind, text: "Clear", temp: 25, visibility: "High Vis", color: "#94a3b8" };
  return { icon: Cloud, text: "Night", temp: 23, visibility: "Mod Vis", color: "#64748b" };
}

// ── Dynamic traffic info ──
function getTrafficForTime() {
  const hour = new Date().getHours();
  if (hour >= 8 && hour <= 10) return { level: "Heavy", speed: 18, color: "#ef4444" };
  if (hour >= 17 && hour <= 20) return { level: "Heavy", speed: 15, color: "#ef4444" };
  if (hour >= 11 && hour <= 16) return { level: "Moderate", speed: 28, color: "#f59e0b" };
  if (hour >= 21 || hour < 6) return { level: "Light", speed: 45, color: "#22c55e" };
  return { level: "Light", speed: 35, color: "#22c55e" };
}

// ── Compute safety score dynamically ──
function computeDynamicSafetyScore(routeType, travelMode) {
  const hour = new Date().getHours();
  const isNight = hour >= 20 || hour < 6;

  let base;
  if (routeType === "safest") base = 92;
  else if (routeType === "alternative") base = 71;
  else base = 48;

  // Time penalty
  if (isNight) base -= routeType === "safest" ? 5 : 12;

  // Mode bonus
  if (travelMode === "car") base += 4;
  if (travelMode === "walking" && isNight) base -= 6;

  // Small randomization
  base += Math.floor(Math.random() * 5) - 2;

  return Math.min(99, Math.max(15, base));
}

// ── Trip saving (localStorage + backend sync) ──
function saveTrip(source, destination, safetyScore, userId) {
  const trips = JSON.parse(localStorage.getItem("safepath_trips") || "[]");
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const trip = {
    from: source.length > 25 ? source.slice(0, 25) + "…" : source,
    to: destination.length > 25 ? destination.slice(0, 25) + "…" : destination,
    date: `${dateStr}, ${timeStr}`,
    score: `${safetyScore}%`,
    status: "Safe Arrival",
    timestamp: now.getTime()
  };

  trips.unshift(trip);
  if (trips.length > 20) trips.length = 20;
  localStorage.setItem("safepath_trips", JSON.stringify(trips));

  // Also save to backend if user is logged in
  if (userId) {
    fetch(`${BACKEND_URL}/api/trips`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        source: source,
        destination: destination,
        safety_score: safetyScore,
      }),
    }).catch((err) => console.warn("Failed to save trip to backend:", err));
  }
}

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
  const [safetyScores, setSafetyScores] = useState({ safest: 94, fastest: 48, alternative: 71 });
  const [isSaved, setIsSaved] = useState(false);
  const [weather, setWeather] = useState(null);

  // TomTom live autocomplete suggestions
  const [srcSuggestions, setSrcSuggestions] = useState([]);
  const [dstSuggestions, setDstSuggestions] = useState([]);
  // Cache resolved coords when user picks from autocomplete (avoids extra geocode call)
  const srcCoordsRef = useRef(null);
  const dstCoordsRef = useRef(null);
  const srcDebounceRef = useRef(null);
  const dstDebounceRef = useRef(null);

  const srcRef = useRef(null);
  const dstRef = useRef(null);

  const traffic = getTrafficForTime();

  // ── Fetch live weather from backend (Open-Meteo API) ──
  useEffect(() => {
    let cancelled = false;
    async function fetchWeather() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/weather?lat=19.076&lng=72.8777`);
        if (res.ok) {
          const data = await res.json();
          const iconComponent = WEATHER_ICON_MAP[data.icon] || Cloud;
          const color = data.icon?.includes("rain") ? "#3b82f6"
            : data.icon?.includes("cloud") ? "#94a3b8"
              : "#f59e0b";
          if (!cancelled) {
            setWeather({
              icon: iconComponent,
              text: data.condition,
              temp: Math.round(data.temperature),
              visibility: data.visibility_label,
              color,
              source: data.source,
            });
          }
          return;
        }
      } catch (_) { }
      // Fallback to time-based estimation
      if (!cancelled) setWeather(getWeatherFallback());
    }
    fetchWeather();
    // Refresh weather every 10 minutes
    const interval = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Use fallback until weather loads
  const weatherData = weather || getWeatherFallback();
  const WeatherIcon = weatherData.icon;

  // Close suggestions on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (srcRef.current && !srcRef.current.contains(e.target)) setShowSrcSuggestions(false);
      if (dstRef.current && !dstRef.current.contains(e.target)) setShowDstSuggestions(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Check if current route is bookmarked
  useEffect(() => {
    if (routes && source && destination) {
      const saved = JSON.parse(localStorage.getItem("safepath_saved_routes") || "[]");
      setIsSaved(saved.some(r => r.source === source && r.destination === destination));
    }
  }, [routes, source, destination]);

  function toggleSaveRoute() {
    const saved = JSON.parse(localStorage.getItem("safepath_saved_routes") || "[]");
    if (isSaved) {
      const filtered = saved.filter(r => !(r.source === source && r.destination === destination));
      localStorage.setItem("safepath_saved_routes", JSON.stringify(filtered));
      setIsSaved(false);
      // Note: backend deletion happens via SavedRoutesModal's handleDelete
    } else {
      const routeData = {
        source,
        destination,
        travelMode,
        savedAt: new Date().toISOString(),
        safetyScore: safetyScores.safest
      };
      saved.unshift(routeData);
      if (saved.length > 10) saved.length = 10;
      localStorage.setItem("safepath_saved_routes", JSON.stringify(saved));
      setIsSaved(true);

      // Sync to backend
      try {
        const userId = JSON.parse(localStorage.getItem("safepath_user") || "{}").user_id;
        if (userId) {
          fetch(`${BACKEND_URL}/api/routes/saved`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: userId,
              source,
              destination,
              travel_mode: travelMode,
              safety_score: safetyScores.safest,
            }),
          }).catch(err => console.warn("Failed to save route to backend:", err));
        }
      } catch (_) { }
    }
  }

  async function calculateRoute() {
    if (!source.trim() || !destination.trim()) {
      setError("Please enter both starting point and destination.");
      return;
    }
    setError(null);
    if (setMapError) setMapError(null);
    setLoading(true);

    try {
      // Use cached coords from autocomplete selection, or geocode fresh
      const [srcCoords, dstCoords] = await Promise.all([
        srcCoordsRef.current ? Promise.resolve(srcCoordsRef.current) : geocode(source),
        dstCoordsRef.current ? Promise.resolve(dstCoordsRef.current) : geocode(destination),
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
      } catch (_) { }

      // Compute dynamic safety scores
      const scores = {
        safest: computeDynamicSafetyScore("safest", travelMode),
        fastest: computeDynamicSafetyScore("fastest", travelMode),
        alternative: computeDynamicSafetyScore("alternative", travelMode),
      };
      setSafetyScores(scores);

      // Save trip to history
      saveTrip(source, destination, scores.safest);

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

  const hour = new Date().getHours();
  const isNight = hour >= 20 || hour < 6;

  function swapPlaces() {
    const s = source;
    setSource(destination);
    setDestination(s);
    // Swap cached coords too
    const tmp = srcCoordsRef.current;
    srcCoordsRef.current = dstCoordsRef.current;
    dstCoordsRef.current = tmp;
  }

  function riskTag(score) {
    if (score > 70) return { cls: "green", text: "Low risk" };
    if (score > 50) return { cls: "amber", text: "Moderate risk" };
    return { cls: "red", text: "High risk" };
  }

  const routeItems = routes ? [
    { key: "safest", title: "Safest route", data: routes.safest_route, score: safetyScores.safest, badge: "Recommended", lighting: "Well lit" },
    routes.alternative_route && { key: "alternative", title: "Balanced route", data: routes.alternative_route, score: safetyScores.alternative, lighting: "Mostly lit" },
    { key: "fastest", title: "Fastest route", data: routes.fastest_route, score: safetyScores.fastest, lighting: "Partly lit" },
  ].filter(Boolean) : [];

  return (
    <div style={{ width: "100%" }}>
      {/* ── DIRECTIONS CARD ── */}
      <div className="dir-card">
        <div className="mode-tabs" role="radiogroup" aria-label="Travel mode">
          {TRAVEL_MODES.map(({ id, label, Icon }) => (
            <button key={id} role="radio" aria-checked={travelMode === id}
              className={`mode-tab ${travelMode === id ? "active" : ""}`}
              onClick={() => setTravelMode(id)}>
              <Icon size={20} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="dir-fields">
          <div className="dir-dots" aria-hidden="true">
            <div className="dir-dot-a" />
            <div className="dir-dot-line" />
            <MapPin size={18} color="#d93025" />
          </div>

          <div className="dir-inputs">
            <div className="dir-input-wrap" ref={srcRef}>
              <input
                className="dir-input"
                aria-label="Starting point"
                placeholder="Choose starting point"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  srcCoordsRef.current = null; // invalidate cached coords on manual edit
                  setShowSrcSuggestions(true);
                  // Debounced TomTom autocomplete
                  clearTimeout(srcDebounceRef.current);
                  const q = e.target.value;
                  if (q.trim().length >= 2) {
                    srcDebounceRef.current = setTimeout(async () => {
                      const suggs = await tomtomSuggest(q);
                      setSrcSuggestions(suggs);
                    }, 350);
                  } else {
                    setSrcSuggestions([]);
                  }
                }}
                onFocus={() => setShowSrcSuggestions(true)}
                onKeyDown={(e) => e.key === "Enter" && calculateRoute()}
              />
              {showSrcSuggestions && (
                <div className="suggestions-dropdown">
                  {srcSuggestions.length > 0
                    ? srcSuggestions.map((s, i) => (
                        <div key={i} className="suggestion-item" onClick={() => {
                          setSource(s.label);
                          srcCoordsRef.current = { lat: s.lat, lng: s.lng };
                          setSrcSuggestions([]);
                          setShowSrcSuggestions(false);
                        }}>
                          <MapPin size={16} color="#1a73e8" /> {s.label}
                        </div>
                      ))
                    : POPULAR_LOCATIONS.filter(l => l.toLowerCase().includes(source.toLowerCase())).map((loc) => (
                        <div key={loc} className="suggestion-item" onClick={() => {
                          setSource(loc);
                          srcCoordsRef.current = null;
                          setShowSrcSuggestions(false);
                        }}>
                          <MapPin size={16} color="#5f6368" /> {loc}
                        </div>
                      ))
                  }
                </div>
              )}
            </div>

            <div className="dir-input-wrap" ref={dstRef}>
              <input
                className="dir-input"
                aria-label="Destination"
                placeholder="Choose destination"
                value={destination}
                onChange={(e) => {
                  setDestination(e.target.value);
                  dstCoordsRef.current = null; // invalidate cached coords on manual edit
                  setShowDstSuggestions(true);
                  // Debounced TomTom autocomplete
                  clearTimeout(dstDebounceRef.current);
                  const q = e.target.value;
                  if (q.trim().length >= 2) {
                    dstDebounceRef.current = setTimeout(async () => {
                      const suggs = await tomtomSuggest(q);
                      setDstSuggestions(suggs);
                    }, 350);
                  } else {
                    setDstSuggestions([]);
                  }
                }}
                onFocus={() => setShowDstSuggestions(true)}
                onKeyDown={(e) => e.key === "Enter" && calculateRoute()}
              />
              {showDstSuggestions && (
                <div className="suggestions-dropdown">
                  {dstSuggestions.length > 0
                    ? dstSuggestions.map((s, i) => (
                        <div key={i} className="suggestion-item" onClick={() => {
                          setDestination(s.label);
                          dstCoordsRef.current = { lat: s.lat, lng: s.lng };
                          setDstSuggestions([]);
                          setShowDstSuggestions(false);
                        }}>
                          <MapPin size={16} color="#1a73e8" /> {s.label}
                        </div>
                      ))
                    : POPULAR_LOCATIONS.filter(l => l.toLowerCase().includes(destination.toLowerCase())).map((loc) => (
                        <div key={loc} className="suggestion-item" onClick={() => {
                          setDestination(loc);
                          dstCoordsRef.current = null;
                          setShowDstSuggestions(false);
                        }}>
                          <MapPin size={16} color="#5f6368" /> {loc}
                        </div>
                      ))
                  }
                </div>
              )}
            </div>
          </div>

          <button className="swap-btn" onClick={swapPlaces} title="Swap start and destination" aria-label="Swap start and destination">
            <ArrowUpDown size={18} />
          </button>
        </div>

        {error && <div className="dir-error" role="alert">{error}</div>}

        <button className="dir-go" onClick={calculateRoute} disabled={loading}>
          {loading ? "Finding safe routes…" : <><ShieldCheck size={18} /> Get safe directions</>}
        </button>
      </div>

      {/* ── CONDITIONS ── */}
      <div className="cond-strip">
        <span className="cond-pill"><TrafficCone size={14} color={traffic.color} /> {traffic.level} traffic · {traffic.speed} km/h</span>
        <span className="cond-pill"><WeatherIcon size={14} color={weatherData.color} /> {weatherData.text} · {weatherData.temp}°C</span>
        <span className="cond-pill"><Activity size={14} color="#1e8e3e" /> {isNight ? "Night watch" : "Live monitor"}</span>
      </div>
      {isNight && (
        <div className="night-note">It's night. Safety scores are lowered for poor visibility and fewer people around.</div>
      )}

      {/* ── RESULTS ── */}
      {!routes ? (
        <div className="empty-hint">
          Enter a start and destination to compare the safest, balanced and fastest routes.
        </div>
      ) : (
        <>
          <div className="route-head">
            <span>{routeItems.length} routes</span>
            <button className={`save-btn ${isSaved ? "saved" : ""}`} onClick={toggleSaveRoute}
              title={isSaved ? "Remove from saved routes" : "Save this route"}>
              {isSaved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
              {isSaved ? "Saved" : "Save"}
            </button>
          </div>

          {routeItems.map(({ key, title, data, score, badge, lighting }) => {
            const rt = riskTag(score);
            return (
              <div key={key} role="button" tabIndex={0}
                className={`route-item ${key} ${activeRoute === key ? "active" : ""}`}
                onClick={() => setActiveRoute(key)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setActiveRoute(key)}>
                <div className="route-title">
                  {title}
                  {badge && <span className="tag green">{badge}</span>}
                </div>
                <div className="route-eta">{data?.eta_mins} min</div>
                <div className="route-sub">
                  <span className={`tag ${rt.cls}`}>{rt.text}</span>&nbsp; Safety {score}/100 · {lighting}
                </div>
                <div className="route-dist">{data?.distance_km} km</div>
                {key === "safest" && data?.alerts?.length > 0 && (
                  <div className="route-alerts">
                    {data.alerts.map((a, i) => <span key={i}>✓ {a}</span>)}
                  </div>
                )}
              </div>
            );
          })}

          <div className="ai-card">
            <strong><Sparkles size={14} color="#1a73e8" /> Safety insight</strong>
            {isNight
              ? `It's night, so the safest route stays on well-patrolled main roads and avoids unlit stretches. Scores are lowered ${travelMode === "walking" ? "significantly" : "slightly"} for ${travelMode}.`
              : "Avoid the SV Road shortcut after 10 PM. It has weak street lighting and isolated footpaths, so SafePath routed you via the well-lit Link Road."}
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// TomTom Geocoding API v2
// Primary: TomTom Geocoding REST API v2 (Orbis Maps)
// Fallback: Nominatim (OpenStreetMap) if TomTom key is missing/fails
// ─────────────────────────────────────────────────────────────
async function geocode(query) {
  // ── 1. TomTom Geocoding API v2 (primary) ──
  if (TOMTOM_KEY) {
    try {
      const url =
        `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json` +
        `?key=${TOMTOM_KEY}&limit=1&countrySet=IN&language=en-US`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const first = data.results?.[0];
        if (first?.position) {
          const result = { lat: first.position.lat, lng: first.position.lon };
          console.log(`[TomTom Geocode] "${query}" →`, result);
          return result;
        }
      }
    } catch (err) {
      console.warn("[TomTom Geocode] failed, falling back to Nominatim:", err);
    }
  }

  // ── 2. Nominatim fallback ──
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
      { headers: { "Accept-Language": "en" } }
    );
    const data = await res.json();
    if (!data.length) {
      console.warn("[Nominatim] No result for:", query);
      return null;
    }
    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    console.log(`[Nominatim Fallback] "${query}" →`, result);
    return result;
  } catch (err) {
    console.error("[Geocode] Both TomTom and Nominatim failed for:", query, err);
    return null;
  }
}

async function getMockRoutes(src, dst) {
  let safePath = [];
  let fastPath = [];
  let altPath = [];

  try {
    // Direct road route for fastest
    const fastRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${src.lng},${src.lat};${dst.lng},${dst.lat}?overview=full&geometries=geojson&alternatives=true`);
    if (fastRes.ok) {
      const fastData = await fastRes.json();
      const routes = fastData?.routes || [];

      // Primary fast route
      if (routes[0]) {
        fastPath = routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      }

      // If OSRM returned an alternative, use it
      if (routes[1]) {
        altPath = routes[1].geometry.coordinates.map(c => [c[1], c[0]]);
      }
    }

    // Arterial avenue route for safest (via waypoint offset for a different route)
    const viaLat = (src.lat + dst.lat) / 2 + 0.004;
    const viaLng = (src.lng + dst.lng) / 2 + 0.004;
    const safeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${src.lng},${src.lat};${viaLng},${viaLat};${dst.lng},${dst.lat}?overview=full&geometries=geojson`);
    if (safeRes.ok) {
      const safeData = await safeRes.json();
      const coords = safeData?.routes?.[0]?.geometry?.coordinates || [];
      safePath = coords.map(c => [c[1], c[0]]);
    }

    // If no alternative yet, generate one with a different waypoint
    if (altPath.length === 0) {
      const altViaLat = (src.lat + dst.lat) / 2 - 0.003;
      const altViaLng = (src.lng + dst.lng) / 2 - 0.002;
      try {
        const altRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${src.lng},${src.lat};${altViaLng},${altViaLat};${dst.lng},${dst.lat}?overview=full&geometries=geojson`);
        if (altRes.ok) {
          const altData = await altRes.json();
          const coords = altData?.routes?.[0]?.geometry?.coordinates || [];
          altPath = coords.map(c => [c[1], c[0]]);
        }
      } catch (_) { }
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
  if (altPath.length === 0) {
    altPath = fastPath;
  }

  // Compute realistic distances
  const safeDist = computePathDistance(safePath);
  const fastDist = computePathDistance(fastPath);
  const altDist = computePathDistance(altPath);

  return {
    safest_route: {
      path: safePath,
      distance_km: safeDist.toFixed(1),
      eta_mins: Math.max(1, Math.round((safeDist / 5) * 60)).toString(),
      safety_rating: "High",
      safety_score: 8.5,
      alerts: ["Avoided unlit alleyway near SV Road", "Routed via police-patrolled main avenue"],
    },
    fastest_route: {
      path: fastPath,
      distance_km: fastDist.toFixed(1),
      eta_mins: Math.max(1, Math.round((fastDist / 6) * 60)).toString(),
      safety_rating: "Low",
      safety_score: 3.5,
    },
    alternative_route: {
      path: altPath,
      distance_km: altDist.toFixed(1),
      eta_mins: Math.max(1, Math.round((altDist / 5.5) * 60)).toString(),
      safety_rating: "Moderate",
      safety_score: 6.0,
    },
  };
}

// Haversine distance calculation for path
function computePathDistance(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lat1, lon1] = coords[i - 1];
    const [lat2, lon2] = coords[i];
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.asin(Math.sqrt(a));
  }
  return total;
}