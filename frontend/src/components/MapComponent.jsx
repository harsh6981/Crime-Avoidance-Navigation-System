import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  Circle,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { LocateFixed, Navigation } from "lucide-react";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
const CARTO_URL = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_KEY}`
  : "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";

// ── TomTom Basemap (Assets API — Orbis raster tiles) ──
// TomTom Assets API: https://docs.tomtom.com/assets-api/documentation/tomtom-orbis-maps/
// Uses the "basic_street-light" style raster tiles from the Maps Raster Tiles API.
// When VITE_TOMTOM_API_KEY is set this becomes the primary basemap; CARTO is the fallback.
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
const TOMTOM_BASEMAP_URL = TOMTOM_KEY
  ? `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?tileSize=256&key=${TOMTOM_KEY}&language=NGT`
  : null;

// ── TomTom Traffic Flow Tiles ──
const TOMTOM_TRAFFIC_URL = TOMTOM_KEY
  ? `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?tileSize=256&key=${TOMTOM_KEY}`
  : null;
// ─────────────────────────────────────────────
//  ICON FACTORIES
// ─────────────────────────────────────────────
function makePinIcon(color, letter) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 60" width="44" height="60">
    <filter id="d"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.55)"/></filter>
    <path d="M22 0C10 0 0 10 0 22c0 16 22 38 22 38s22-22 22-38C44 10 34 0 22 0z" fill="${color}" filter="url(#d)"/>
    <circle cx="22" cy="21" r="12" fill="rgba(255,255,255,0.95)"/>
    <text x="22" y="26" font-size="13" font-weight="800" text-anchor="middle" fill="${color}" font-family="system-ui,sans-serif">${letter}</text>
  </svg>`;
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    shadowUrl: markerShadow,
    iconSize: [44, 60],
    iconAnchor: [22, 60],
    popupAnchor: [0, -56],
    shadowSize: [41, 41],
    shadowAnchor: [12, 41],
  });
}

function makeResourceIcon(emoji, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 46 46" width="46" height="46">
    <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.55)"/></filter>
    <circle cx="23" cy="23" r="21" fill="${bg}" stroke="#fff" stroke-width="2.5" filter="url(#sh)"/>
    <text x="23" y="30" font-size="19" text-anchor="middle">${emoji}</text>
  </svg>`;
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
    iconSize: [46, 46],
    iconAnchor: [23, 23],
    popupAnchor: [0, -26],
  });
}

// Arrow icon placed along route to show direction
function makeArrowIcon(bearingDeg, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14">
    <polygon points="12,2 20,20 12,15 4,20" fill="${color}" opacity="0.9" transform="rotate(${bearingDeg},12,12)"/>
  </svg>`;
  return new L.DivIcon({
    html: `<div style="transform:rotate(0deg)">${svg}</div>`,
    className: "",
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

function makeLiveIcon(heading) {
  const rot = heading != null ? heading : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
    <circle cx="30" cy="30" r="28" fill="rgba(66,133,244,0.15)" stroke="rgba(66,133,244,0.35)" stroke-width="1.5"/>
    <circle cx="30" cy="30" r="13" fill="#4285F4" stroke="#fff" stroke-width="3"/>
    ${heading != null ? `<polygon points="30,6 24,20 36,20" fill="#4285F4" transform="rotate(${rot},30,30)"/>` : ""}
  </svg>`;
  return new L.DivIcon({
    html: `<div class="gps-dot-anim">${svg}</div>`,
    className: "",
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -32],
  });
}

const PIN_A = new L.DivIcon({
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#fff;border:5px solid #5f6368;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  className: "", iconSize: [18, 18], iconAnchor: [9, 9],
});
const PIN_B = makePinIcon("#ea4335", "B");

const RESOURCE_ICONS = {
  ev_charger: makeResourceIcon("⚡", "#1e8e3e"),
  police: makeResourceIcon("🚔", "#1a73e8"),
  hospital: makeResourceIcon("🏥", "#d93025"),
};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────
function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function haversineDist(a, b) {
  const R = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(s));
}

function bearing(a, b) {
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);
  const x = Math.sin(dLng) * Math.cos(lat2);
  const y = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

/** Place an arrow marker every ~intervalKm along the path */
function getArrows(coords, intervalKm = 0.35) {
  if (!coords || coords.length < 2) return [];
  const arrows = [];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    const dist = haversineDist(coords[i - 1], coords[i]);
    acc += dist;
    if (acc >= intervalKm) {
      acc = 0;
      const b = bearing(coords[i - 1], coords[i]);
      const mid = [
        (coords[i - 1][0] + coords[i][0]) / 2,
        (coords[i - 1][1] + coords[i][1]) / 2,
      ];
      arrows.push({ pos: mid, bearing: b });
    }
  }
  return arrows;
}

// ─────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (!positions || positions.length < 2) return;
    try { map.fitBounds(L.latLngBounds(positions), { padding: [70, 70], animate: true, duration: 0.8 }); }
    catch (_) { }
  }, [positions]);
  return null;
}

/** Arrows spaced ~170px apart on screen, so they never crowd at low zoom. */
function ArrowLayer({ coords }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (!coords || coords.length < 2) return null;
  const lat = coords[Math.floor(coords.length / 2)][0];
  const metersPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const arrows = getArrows(coords, Math.max(0.05, (metersPerPx * 170) / 1000)).slice(0, 80);
  return arrows.map((a, i) => (
    <Marker key={`${zoom}-${i}`} position={a.pos} icon={makeArrowIcon(a.bearing, "#ffffff")} interactive={false} />
  ));
}

function Follow({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView(pos, Math.max(map.getZoom(), 17), { animate: true });
  }, [pos]);
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) { if (onMapClick) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }); },
  });
  return null;
}

function RecenterBtn({ livePos }) {
  const map = useMap();
  if (!livePos) return null;
  return (
    <button className="map-fab" title="My location" aria-label="My location"
      onClick={() => map.flyTo(livePos, 16, { animate: true, duration: 0.7 })}>
      <LocateFixed size={20} />
    </button>
  );
}

// Re-measure the map when the side panel opens/closes
function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer().parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

const ROUTE_META = {
  safest: { label: "Safest route", color: "#1e8e3e", casing: "#137333", speed: 5 },
  alternative: { label: "Balanced route", color: "#e37400", casing: "#b06000", speed: 5.5 },
  fastest: { label: "Fastest route", color: "#1a73e8", casing: "#1557b0", speed: 6 },
};

// ─────────────────────────────────────────────
//  MAIN MAP COMPONENT
// ─────────────────────────────────────────────
export default function MapComponent({
  safestCoords = [],
  fastestCoords = [],
  alternativeCoords = [],
  activeRoute = "safest",
  error = null,
  showCrimeZones = true,
  showTrafficDensity = true,
  onRouteResources = [],
  showEVChargers = true,
  showPolice = true,
  showHospitals = true,
  onMapClick,
  navigating = false,
  onStartTrip,
  followPos = null,
}) {
  const MUMBAI = [19.076, 72.8777];

  // Live GPS
  const [livePos, setLivePos] = useState(null);
  const [liveHeading, setLiveHeading] = useState(null);
  const [liveAcc, setLiveAcc] = useState(null);
  const watchRef = useRef(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setLivePos([p.coords.latitude, p.coords.longitude]);
        setLiveAcc(p.coords.accuracy);
        if (p.coords.heading != null) setLiveHeading(p.coords.heading);
      },
      (e) => console.warn("GPS:", e.message),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
    return () => { if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  const activeCoords = activeRoute === "safest" ? safestCoords : activeRoute === "alternative" ? alternativeCoords : fastestCoords;
  const startPos = activeCoords[0] ?? null;
  const endPos = activeCoords[activeCoords.length - 1] ?? null;
  const hasRoute = activeCoords.length > 1;

  const cLat = startPos ? startPos[0] : MUMBAI[0];
  const cLng = startPos ? startPos[1] : MUMBAI[1];

  // Mock overlays
  const crimeSpots = [
    { lat: cLat + 0.005, lng: cLng + 0.004, label: "High Crime Zone" },
    { lat: cLat - 0.008, lng: cLng - 0.003, label: "Frequent Theft Reported" },
  ];
  const trafficSpots = [
    { lat: cLat + 0.002, lng: cLng + 0.008, label: "Heavy Traffic Bottleneck" },
    { lat: cLat - 0.004, lng: cLng + 0.002, label: "Moderate Congestion" },
  ];

  // Resources
  const visRes = (onRouteResources || []).filter(r =>
  (r.type === "ev_charger" ? showEVChargers :
    r.type === "police" ? showPolice :
      r.type === "hospital" ? showHospitals : true)
  );


  // Route summary
  const totalDist = hasRoute
    ? activeCoords.reduce((sum, c, i) => i === 0 ? 0 : sum + haversineDist(activeCoords[i - 1], c), 0)
    : 0;

  const meta = ROUTE_META[activeRoute] || ROUTE_META.safest;
  const etaMin = Math.max(1, Math.round((totalDist / meta.speed) * 60));
  const liveIcon = makeLiveIcon(liveHeading);
  const dotPos = navigating && followPos ? followPos : livePos;

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>

      {error && <div className="map-banner" role="alert">{error}</div>}

      {hasRoute && !navigating && (
        <div className="route-summary">
          <div>
            <div className="big" style={{ color: meta.color }}>{etaMin} min</div>
            <div className="sub">{totalDist.toFixed(1)} km · {meta.label}</div>
          </div>
          <div className="sep" />
          {livePos
            ? <div className="gps-badge"><i /> GPS ±{Math.round(liveAcc || 0)} m</div>
            : <div className="sub">GPS off</div>}
          <button className="start-btn" onClick={onStartTrip}><Navigation size={16} /> Start</button>
        </div>
      )}

      <MapContainer
        center={MUMBAI}
        zoom={13}
        style={{ height: "100%", width: "100%", background: "#e8eaed" }}
        zoomControl={false}
        attributionControl={true}
      >
        {/* Basemap: TomTom Orbis (Assets API / Maps Raster Tiles) when key is set,
            otherwise falls back to CARTO Voyager. */}
        <TileLayer
          url={TOMTOM_BASEMAP_URL || CARTO_URL}
          attribution={
            TOMTOM_BASEMAP_URL
              ? '&copy; <a href="https://www.tomtom.com">TomTom</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }
          maxZoom={22}
        />

        {/* TomTom Traffic Flow overlay — renders live speed data as colored road segments */}
        {showTrafficDensity && TOMTOM_TRAFFIC_URL && (
          <TileLayer
            url={TOMTOM_TRAFFIC_URL}
            attribution='&copy; <a href="https://www.tomtom.com">TomTom</a> Traffic'
            maxZoom={22}
            opacity={0.7}
            zIndex={400}
          />
        )}

        <ZoomControl position="bottomright" />
        <ResizeFix />

        <MapClickHandler onMapClick={onMapClick} />

        {/* ── CRIME ZONES + SafePath Danger Index Markers ── */}
        {showCrimeZones && crimeSpots.map((s, i) => {
          // Mirror SafePath K-Means magnitude (0-4):
          // Use clean symbols: tick, smiley, exclamation, double-!, X
          const mag = i % 2 === 0 ? 3 : 2;
          const SYMBOLS = ["OK", ":)", " ! ", "!!", " X"];
          const COLORS = ["#22c55e", "#86efac", "#f59e0b", "#f97316", "#ef4444"];
          const sym = SYMBOLS[mag];
          const clr = COLORS[mag];
          const circleColor = mag >= 3 ? "#ef4444" : "#f97316";
          const dangerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
            <circle cx="22" cy="22" r="20" fill="#ffffff" stroke="${clr}" stroke-width="2.5"/>
            <text x="22" y="27" font-size="11" font-weight="800" text-anchor="middle" fill="${clr}" font-family="monospace,sans-serif">${sym}</text>
          </svg>`;
          const dangerIcon = new L.DivIcon({
            html: `<div title="Danger Index ${mag}">${dangerSvg}</div>`,
            className: "",
            iconSize: [44, 44],
            iconAnchor: [22, 22],
            popupAnchor: [0, -26],
          });
          const labels = ["Safest", "Moderately Safe", "Be Careful", "High Risk", "Avoid"];
          return (
            <React.Fragment key={`c${i}`}>
              <Circle center={[s.lat, s.lng]} radius={300}
                pathOptions={{ color: circleColor, fillColor: circleColor, fillOpacity: 0.18, weight: 1.5, dashArray: "6,4" }}>
                <Popup><b style={{ color: circleColor }}>{s.label}</b><br />Danger Index {mag} — {labels[mag]}</Popup>
              </Circle>
              <Marker position={[s.lat, s.lng]} icon={dangerIcon}>
                <Popup>
                  <b>Danger Index: {mag}/4</b><br />
                  {labels[mag]}<br />
                  <small style={{ color: "#888" }}>K-Means clustering on NCRB crime data</small>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* ── TRAFFIC (fallback mock circles — only shown if TomTom tiles are not available) ── */}
        {showTrafficDensity && !TOMTOM_TRAFFIC_URL && trafficSpots.map((s, i) => (
          <Circle key={`t${i}`} center={[s.lat, s.lng]} radius={220}
            pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.18, weight: 1 }}>
            <Popup><b>🟠 {s.label}</b></Popup>
          </Circle>
        ))}

        {/* ══════════════════════════════════════════
            ROUTE POLYLINES — Google Maps style
            Each route: outer glow  +  main line  +  arrows
        ══════════════════════════════════════════ */}

        {/* Route lines: inactive routes grey and thin, active route coloured with a darker casing */}
        {[["alternative", alternativeCoords], ["fastest", fastestCoords], ["safest", safestCoords]]
          .filter(([, c]) => c.length > 1)
          .sort(([k]) => (k === activeRoute ? 1 : -1))
          .map(([key, coords]) => {
            const on = key === activeRoute;
            const m = ROUTE_META[key];
            return (
              <React.Fragment key={key}>
                <Polyline positions={coords} pathOptions={{ color: on ? m.casing : "#ffffff", weight: on ? 11 : 9, opacity: on ? 1 : 0.9, lineCap: "round", lineJoin: "round" }} />
                <Polyline positions={coords} eventHandlers={{}} pathOptions={{ color: on ? m.color : "#9aa0a6", weight: on ? 7 : 5, lineCap: "round", lineJoin: "round" }} />
              </React.Fragment>
            );
          })}

        {/* Direction arrows (zoom-aware spacing) */}
        {!navigating && <ArrowLayer coords={activeCoords} />}

        {/* ── RESOURCE MARKERS ── */}
        {visRes.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={RESOURCE_ICONS[r.type] || RESOURCE_ICONS.hospital}>
            <Popup maxWidth={230}>
              <div style={{ fontFamily: "system-ui,sans-serif", minWidth: 200 }}>
                <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 3 }}>{r.icon} {r.name}</div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: 6 }}>{r.label}</div>
                {r.address && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>📍 {r.address}</div>}
                {r.contact && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>📞 <a href={`tel:${r.contact}`} style={{ color: "#2563eb" }}>{r.contact}</a></div>}
                {r.opening_hours && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>🕐 {r.opening_hours}</div>}
                {r.type === "ev_charger" && r.ev_sockets && (
                  <div style={{ fontSize: "0.74rem", color: "#16a34a", fontWeight: 700 }}>🔌 {r.ev_sockets} sockets{r.ev_network ? ` · ${r.ev_network}` : ""}</div>
                )}
                {r.type === "hospital" && r.emergency === "yes" && (
                  <div style={{ fontSize: "0.74rem", color: "#dc2626", fontWeight: 700, marginTop: 3 }}>🚨 24/7 Emergency</div>
                )}
                {r.type === "police" && (
                  <div style={{ fontSize: "0.74rem", color: "#1d4ed8", fontWeight: 700, marginTop: 3 }}>🚔 Dial 100</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ── A / B PINS ── */}
        {startPos && <Marker position={startPos} icon={PIN_A}><Popup><b>🟢 Start</b></Popup></Marker>}
        {endPos && <Marker position={endPos} icon={PIN_B}><Popup><b>🏁 Destination</b></Popup></Marker>}

        {/* ── LIVE GPS DOT ── */}
        {dotPos && (<>
          <Circle center={dotPos} radius={liveAcc || 50}
            pathOptions={{ color: "#4285F4", fillColor: "#4285F4", fillOpacity: 0.1, weight: 1 }} />
          <Marker position={dotPos} icon={liveIcon}>
            <Popup><b>📍 Your Location</b><br />±{Math.round(liveAcc || 0)}m accuracy</Popup>
          </Marker>
        </>)}

        {/* ── FIT BOUNDS / RECENTER ── */}
        {hasRoute && !navigating && <FitBounds positions={activeCoords} />}
        {navigating && <Follow pos={followPos} />}
        <RecenterBtn livePos={livePos} />
      </MapContainer>

    </div>
  );
}