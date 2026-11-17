import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Polygon,
  Marker,
  Popup,
  Tooltip,
  Circle,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import L from "leaflet";
import { LocateFixed, Navigation, Shield, AlertTriangle, Maximize2 } from "lucide-react";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { cachedFetch } from "../utils/apiCache";
import { BACKEND_URL } from "../config/api";
import {
  MMR_CENTER,
  MMR_DEFAULT_ZOOM,
  MMR_OUTER_BOUNDARY,
  MMR_CORPORATIONS,
  MMR_STATUS_CONFIG,
} from "../data/mmrBoundaries";

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY;
const CARTO_URL = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${CARTO_KEY}`
  : "https://{s}.basemaps.cartocdn.com/rastertiles/dark_matter/{z}/{x}/{y}{r}.png";

// TomTom Basemap
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY;
const TOMTOM_BASEMAP_URL = TOMTOM_KEY
  ? `https://api.tomtom.com/map/1/tile/basic/main/{z}/{x}/{y}.png?tileSize=256&key=${TOMTOM_KEY}&language=NGT`
  : null;

// TomTom Traffic Flow
const TOMTOM_TRAFFIC_URL = TOMTOM_KEY
  ? `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?tileSize=256&key=${TOMTOM_KEY}`
  : null;

// ── BMC Ward Coverage Data ──────────────────────────────────────────────────
// Authoritative 24 BMC Administrative Wards with data availability classification
const BMC_WARDS = [
  { id: "A",   name: "Colaba / Fort / Nariman Point",      lat: 18.914, lng: 72.818, status: "verified",   stations: ["Colaba", "Cuffe Parade"] },
  { id: "B",   name: "Mazgaon / Dongri / Mandvi",          lat: 18.952, lng: 72.838, status: "proximity",  stations: ["Azad Maidan (border proximity)"] },
  { id: "C",   name: "Girgaon / Marine Lines",             lat: 18.956, lng: 72.814, status: "verified",   stations: ["Marine Lines"] },
  { id: "D",   name: "Malabar Hill / Napean Sea Road",     lat: 18.964, lng: 72.806, status: "verified",   stations: ["Malabar Hill"] },
  { id: "E",   name: "Byculla / Mazagaon / Reay Road",     lat: 18.982, lng: 72.846, status: "no-data",    stations: [] },
  { id: "F/N", name: "Sion / Dharavi / Sewri / Wadala",    lat: 19.040, lng: 72.858, status: "verified",   stations: ["Dharavi", "Sion"] },
  { id: "F/S", name: "Matunga / Mahim (South)",            lat: 19.018, lng: 72.842, status: "no-data",    stations: [] },
  { id: "G/N", name: "Dadar / Parel (North)",              lat: 19.020, lng: 72.848, status: "no-data",    stations: [] },
  { id: "G/S", name: "Worli / Lower Parel",                lat: 19.012, lng: 72.818, status: "verified",   stations: ["Worli"] },
  { id: "H/W", name: "Bandra West / Santacruz",            lat: 19.054, lng: 72.830, status: "verified",   stations: ["Santacruz"] },
  { id: "H/E", name: "Bandra East / Kurla West",           lat: 19.058, lng: 72.855, status: "no-data",    stations: [] },
  { id: "K/W", name: "Andheri West / Juhu / Versova",      lat: 19.115, lng: 72.836, status: "verified",   stations: ["Juhu", "Versova"] },
  { id: "K/E", name: "Andheri East / MIDC",                lat: 19.108, lng: 72.868, status: "proximity",  stations: ["Andheri (border centroid)"] },
  { id: "L",   name: "Kurla / Vidyavihar",                 lat: 19.073, lng: 72.883, status: "verified",   stations: ["Kurla"] },
  { id: "M/W", name: "Chembur West",                       lat: 19.063, lng: 72.900, status: "verified",   stations: ["Chembur"] },
  { id: "M/E", name: "Mankhurd / Govandi",                 lat: 19.046, lng: 72.933, status: "verified",   stations: ["Govandi", "Mankhurd"] },
  { id: "N",   name: "Ghatkopar / Vikhroli",               lat: 19.086, lng: 72.908, status: "verified",   stations: ["Ghatkopar", "Vikhroli"] },
  { id: "P/N", name: "Goregaon North / Malad West",        lat: 19.158, lng: 72.853, status: "no-data",    stations: [] },
  { id: "P/S", name: "Malad / Goregaon South",             lat: 19.187, lng: 72.849, status: "verified",   stations: ["Malad"] },
  { id: "R/N", name: "Borivali North",                     lat: 19.231, lng: 72.857, status: "verified",   stations: ["Borivali"] },
  { id: "R/C", name: "Dahisar",                            lat: 19.265, lng: 72.855, status: "verified",   stations: ["Dahisar"] },
  { id: "R/S", name: "Kandivali / Charkop",                lat: 19.204, lng: 72.855, status: "verified",   stations: ["Kandivali"] },
  { id: "S",   name: "Bhandup / Kanjurmarg",               lat: 19.146, lng: 72.946, status: "verified",   stations: ["Bhandup"] },
  { id: "T",   name: "Mulund / Nahur",                     lat: 19.173, lng: 72.957, status: "verified",   stations: ["Mulund"] },
];
const WARD_STATUS_COLOR = {
  verified:   { fill: "#10b981", stroke: "#059669", label: "Direct Crime Data Available", note: "Direct station coverage" },
  proximity:  { fill: "#f59e0b", stroke: "#d97706", label: "Proximity / Incomplete Data", note: "Border precinct coverage" },
  "no-data":  { fill: "#64748b", stroke: "#475569", label: "No Crime Data Recorded", note: "Unavailable data (NOT zero crime)" },
};

// ─────────────────────────────────────────────
//  ICON FACTORIES
// ─────────────────────────────────────────────
function makePinIcon(color, letter) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 60" width="44" height="60">
    <filter id="d"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="rgba(0,0,0,0.65)"/></filter>
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

function makeResourceIcon(emoji, bg, border) {
  const bdrColor = border || "rgba(255,255,255,0.3)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">
    <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.6)"/></filter>
    <circle cx="24" cy="24" r="22" fill="${bg}" stroke="${bdrColor}" stroke-width="2.5" filter="url(#sh)"/>
    <text x="24" y="31" font-size="20" text-anchor="middle">${emoji}</text>
  </svg>`;
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -28],
  });
}

function makeClusterIcon(riskScore, incidentCount) {
  const r = Math.min(10, riskScore);
  const color = r >= 7 ? "#ef4444" : r >= 4 ? "#f97316" : "#f59e0b";
  const size = Math.min(60, Math.max(40, 30 + incidentCount * 0.015));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 3}" fill="${color}25" stroke="${color}" stroke-width="2" filter="url(#glow)"/>
    <circle cx="${size/2}" cy="${size/2}" r="${size/4}" fill="${color}60"/>
    <text x="${size/2}" y="${size/2 + 4}" font-size="9" font-weight="800" text-anchor="middle" fill="${color}" font-family="system-ui,sans-serif">${incidentCount}</text>
  </svg>`;
  return new L.DivIcon({
    html: `<div style="animation: pulse 2s ease-in-out infinite;">${svg}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
    popupAnchor: [0, -size/2 - 4],
  });
}

function makeCrimeMarkerIcon(severity) {
  // severity 1-10 → color gradient
  const pct = Math.min(severity / 10, 1);
  const r = Math.round(239 * pct + 245 * (1-pct));
  const g = Math.round(68 * pct + 158 * (1-pct));
  const b = Math.round(68 * pct + 11 * (1-pct));
  const color = `rgb(${r},${g},${b})`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="${color}22" stroke="${color}" stroke-width="2"/>
    <circle cx="18" cy="18" r="6" fill="${color}"/>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function makeSafeHavenIcon(type) {
  const isPolice = type === "police";
  const color = isPolice ? "#00b4d8" : "#ef4444";
  const emoji = isPolice ? "🚔" : "🏥";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 44" width="44" height="44">
    <filter id="sh2"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.65)"/></filter>
    <circle cx="22" cy="22" r="20" fill="${color}22" stroke="${color}" stroke-width="2.5" filter="url(#sh2)"/>
    <text x="22" y="29" font-size="18" text-anchor="middle">${emoji}</text>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -26],
  });
}

function makeArrowIcon(bearingDeg, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12">
    <polygon points="12,2 20,20 12,15 4,20" fill="${color}" opacity="0.9" transform="rotate(${bearingDeg},12,12)"/>
  </svg>`;
  return new L.DivIcon({
    html: `<div>${svg}</div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

function makeLiveIcon(heading) {
  const rot = heading != null ? heading : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60" width="60" height="60">
    <circle cx="30" cy="30" r="28" fill="rgba(0,212,255,0.12)" stroke="rgba(0,212,255,0.3)" stroke-width="1.5"/>
    <circle cx="30" cy="30" r="13" fill="#00b4d8" stroke="#fff" stroke-width="3"/>
    ${heading != null ? `<polygon points="30,6 24,20 36,20" fill="#00b4d8" transform="rotate(${rot},30,30)"/>` : ""}
  </svg>`;
  return new L.DivIcon({
    html: `<div class="gps-dot-anim">${svg}</div>`,
    className: "",
    iconSize: [60, 60],
    iconAnchor: [30, 30],
    popupAnchor: [0, -32],
  });
}

function makeStreetlightIcon() {
  return new L.DivIcon({
    html: `<div style="width:12px;height:12px;border-radius:50%;background:#fbbf24;box-shadow:0 0 10px 3px rgba(251,191,36,0.7);border:1.5px solid #fff;"></div>`,
    className: "",
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -8],
  });
}

function makeEvStationIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="rgba(34,197,94,0.22)" stroke="#22c55e" stroke-width="2.5"/>
    <text x="18" y="24" font-size="16" text-anchor="middle">⚡</text>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

function makeHazardIcon(severity) {
  const color = severity === "high" ? "#ef4444" : "#f59e0b";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
    <circle cx="18" cy="18" r="16" fill="${color}25" stroke="${color}" stroke-width="2.5"/>
    <text x="18" y="24" font-size="16" text-anchor="middle">⚠️</text>
  </svg>`;
  return new L.DivIcon({
    html: svg,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -20],
  });
}

// ── Custom Cluster Badge Generators (Category-Aware & Clean) ──
function createFacilityClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count > 50 ? 40 : count > 20 ? 34 : 28;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#0284c7;border:2px solid #38bdf8;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${count > 99 ? '10' : '11'}px;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createEvClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count > 10 ? 34 : 28;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#16a34a;border:2px solid #4ade80;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.4);"><span style="font-size:10px;margin-right:1px">⚡</span>${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createLightingClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count > 50 ? 36 : count > 20 ? 30 : 24;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#d97706;border:2px solid #fde047;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${count > 99 ? '9' : '10'}px;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createHazardClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const size = count > 10 ? 34 : 28;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:#ea580c;border:2px solid #fb923c;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,0.4);"><span style="font-size:9px;margin-right:1px">⚠️</span>${count}</div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const PIN_A = new L.DivIcon({
  html: '<div style="width:16px;height:16px;border-radius:50%;background:#00d4ff;border:3px solid #fff;box-shadow:0 0 10px rgba(0,212,255,.7)"></div>',
  className: "", iconSize: [16, 16], iconAnchor: [8, 8],
});
const PIN_B = makePinIcon("#ef4444", "B");

function makeCrimeRiskIcon(riskLevel, count, color = "#ef4444") {
  const isHigh = riskLevel?.toLowerCase()?.includes("high") || color === "#ef4444";
  const badgeText = count > 999 ? "1k+" : count > 0 ? count : "!";
  const glow = isHigh ? "rgba(239, 68, 68, 0.75)" : "rgba(245, 158, 11, 0.75)";
  const bg = isHigh ? "linear-gradient(135deg, #ef4444, #991b1b)" : "linear-gradient(135deg, #f59e0b, #b45309)";

  return new L.DivIcon({
    html: `
      <div style="
        position: relative;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: ${bg};
        border: 2px solid #ffffff;
        box-shadow: 0 0 14px ${glow}, 0 3px 8px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      ">
        <span style="font-size: 14px; line-height: 1;">🛡️</span>
        <span style="
          position: absolute;
          top: -4px;
          right: -6px;
          background: #0f172a;
          color: #ffffff;
          border: 1.5px solid ${color};
          border-radius: 10px;
          font-size: 9px;
          font-weight: 800;
          padding: 1px 4px;
          min-width: 14px;
          text-align: center;
        ">${badgeText}</span>
      </div>
    `,
    className: "crime-risk-marker-pin",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
  });
}

const RESOURCE_ICONS = {
  ev_charger: makeResourceIcon("⚡", "#0d2a1a", "rgba(34,197,94,0.5)"),
  police:     makeResourceIcon("🚔", "#0a1a2d", "rgba(0,180,216,0.5)"),
  hospital:   makeResourceIcon("🏥", "#2a0d0d", "rgba(239,68,68,0.5)"),
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
      const mid = [(coords[i-1][0]+coords[i][0])/2, (coords[i-1][1]+coords[i][1])/2];
      arrows.push({ pos: mid, bearing: b });
    }
  }
  return arrows;
}

// Dark popup style helper
const POPUP_STYLE = {
  fontFamily: "'Inter', system-ui, sans-serif",
  color: "#e8f4fd",
  minWidth: 190,
  lineHeight: 1.55,
};

// ─────────────────────────────────────────────
//  SUB-COMPONENTS
// ─────────────────────────────────────────────
/**
 * RouteController:
 * 1. Fits the route bounds strictly ONCE when a brand-new route calculation arrives.
 * 2. Does NOT re-fit when switching between safest/fastest routes.
 * 3. Does NOT re-fit on component re-renders, layer toggles, cluster loading, or panel open/close.
 * 4. Respects manual user zoom and pan (never overrides manual navigation).
 * 5. Provides explicit fitRoute action for user-triggered button.
 */
function RouteController({ routes, activeCoords, onRegisterFitRoute }) {
  const map = useMap();
  const lastFittedRouteKey = useRef(null);
  const userInteractedRef = useRef(false);

  // Track if user explicitly manipulated map view (pan or zoom)
  useMapEvents({
    dragstart: () => { userInteractedRef.current = true; },
    zoomstart: () => { userInteractedRef.current = true; },
  });

  const fitActiveRoute = useCallback(() => {
    if (!activeCoords || !Array.isArray(activeCoords) || activeCoords.length < 2) return;
    const valid = activeCoords.filter((p) => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]));
    if (valid.length < 2) return;
    try {
      map.fitBounds(L.latLngBounds(valid), { padding: [70, 70], animate: true, duration: 0.6 });
    } catch (_) {}
  }, [map, activeCoords]);

  // Expose explicit fit function to parent component
  useEffect(() => {
    if (onRegisterFitRoute) {
      onRegisterFitRoute(() => fitActiveRoute);
    }
  }, [onRegisterFitRoute, fitActiveRoute]);

  // Fit bounds ONLY ONCE when a new route is calculated / loaded
  useEffect(() => {
    if (!routes) {
      lastFittedRouteKey.current = null;
      userInteractedRef.current = false;
      return;
    }

    const safestPath = routes.safest_route?.path;
    const fastestPath = routes.fastest_route?.path;
    if (!safestPath && !fastestPath) return;

    const startPt = safestPath?.[0] || fastestPath?.[0];
    const endPt = safestPath?.[safestPath?.length - 1] || fastestPath?.[fastestPath?.length - 1];
    const routeKey = `${startPt?.[0]?.toFixed(4)}_${startPt?.[1]?.toFixed(4)}->${endPt?.[0]?.toFixed(4)}_${endPt?.[1]?.toFixed(4)}_${safestPath?.length || 0}_${fastestPath?.length || 0}`;

    // Fit bounds strictly once per route set
    if (routeKey !== lastFittedRouteKey.current) {
      lastFittedRouteKey.current = routeKey;
      userInteractedRef.current = false;
      fitActiveRoute();
    }
  }, [routes, fitActiveRoute]);

  return null;
}

function MapInstanceReporter() {
  const map = useMap();
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__leafletMap = map;
    }
    return () => {
      if (typeof window !== "undefined" && window.__leafletMap === map) {
        window.__leafletMap = null;
      }
    };
  }, [map]);
  return null;
}

function ArrowLayer({ coords }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
  const valid = coords.filter((p) => Array.isArray(p) && p.length >= 2 && !isNaN(p[0]) && !isNaN(p[1]));
  if (valid.length < 2) return null;
  const lat = valid[Math.floor(valid.length / 2)][0];
  const metersPerPx = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  const arrows = getArrows(valid, Math.max(0.05, (metersPerPx * 160) / 1000)).slice(0, 80);
  return arrows.map((a, i) => (
    <Marker key={`${zoom}-${i}`} position={a.pos} icon={makeArrowIcon(a.bearing, "#ffffff")} interactive={false} />
  ));
}

function Follow({ pos }) {
  const map = useMap();
  useEffect(() => { if (pos) map.setView(pos, Math.max(map.getZoom(), 17), { animate: true }); }, [pos]);
  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) { if (onMapClick) onMapClick({ lat: e.latlng.lat, lng: e.latlng.lng }); },
  });
  return null;
}

function BoundsWatcher({ onBoundsChange, enabled }) {
  const map = useMap();
  const lastBoundsKey = useRef("");

  const emitBounds = useCallback(() => {
    if (!enabled) return;
    const b = map.getBounds();
    const north = b.getNorth();
    const south = b.getSouth();
    const east = b.getEast();
    const west = b.getWest();
    const key = `${north.toFixed(3)},${south.toFixed(3)},${east.toFixed(3)},${west.toFixed(3)}`;
    if (key !== lastBoundsKey.current) {
      lastBoundsKey.current = key;
      onBoundsChange({ north, south, east, west });
    }
  }, [map, enabled, onBoundsChange]);

  // Only emit when map movement or zoom has finished — not continuously during pan or on initial mount
  useMapEvents({
    moveend: emitBounds,
    zoomend: emitBounds,
  });

  return null;
}

function RecenterBtn({ livePos }) {
  const map = useMap();
  if (!livePos) return null;
  return (
    <button className="map-fab" title="My location" aria-label="My location"
      onClick={() => map.flyTo(livePos, 16, { animate: true, duration: 0.7 })}>
      <LocateFixed size={18} />
    </button>
  );
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer()?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      // Pass { pan: false } so container resize never pans or resets user viewport
      map.invalidateSize({ pan: false });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map]);
  return null;
}

const ROUTE_META = {
  safest:      { label: "Safest route",   color: "#10b981", casing: "#064e3b", activeColor: "#10b981", speed: 5 },
  fastest:     { label: "Fastest route",  color: "#eab308", casing: "#713f12", activeColor: "#eab308", speed: 6 },
};

// ─────────────────────────────────────────────
//  MAP LEGEND (floating bottom-right)
// ─────────────────────────────────────────────
function MapLegend({
  activeRoute = "safest",
  showCrimeZones,
  showCrimeClusters,
  showRouteRiskBands,
  onToggleRiskBands,
  showCoverage,
  onToggleCoverage,
}) {
  if (!showCrimeZones && !showCrimeClusters) return null;
  return (
    <div className="map-legend">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div className="map-legend-title" style={{ margin: 0 }}>Crime Exposure</div>
        <div style={{ display: "flex", gap: 4 }}>
          {onToggleRiskBands && (
            <button
              type="button"
              onClick={onToggleRiskBands}
              className="legend-toggle-btn"
              title="Toggle route segment risk visualization"
              style={{
                background: showRouteRiskBands ? "rgba(0,212,255,0.15)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${showRouteRiskBands ? "var(--cyan)" : "rgba(255,255,255,0.15)"}`,
                color: showRouteRiskBands ? "var(--cyan)" : "#94a3b8",
                fontSize: "0.68rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, cursor: "pointer"
              }}
            >
              {showRouteRiskBands ? "Risk ON" : "Risk OFF"}
            </button>
          )}
          {onToggleCoverage && (
            <button
              type="button"
              onClick={onToggleCoverage}
              className="legend-toggle-btn"
              title="Toggle MMR administrative coverage & boundary overlays"
              style={{
                background: showCoverage ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.06)",
                border: `1px solid ${showCoverage ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                color: showCoverage ? "#10b981" : "#94a3b8",
                fontSize: "0.68rem", fontWeight: 700, padding: "2px 6px", borderRadius: 4, cursor: "pointer"
              }}
            >
              {showCoverage ? "MMR Zones ON" : "MMR Zones"}
            </button>
          )}
        </div>
      </div>

      <div className="map-legend-row">
        <div className="map-legend-dot" style={{ background: "#ef4444", boxShadow: "0 0 6px #ef4444" }} />
        <span>High recorded exposure (Red)</span>
      </div>
      <div className="map-legend-row">
        <div className="map-legend-dot" style={{ background: "#f97316" }} />
        <span>Moderate recorded exposure (Orange)</span>
      </div>
      <div className="map-legend-row">
        <div className="map-legend-dot" style={{ background: "#10b981" }} />
        <span>Lower recorded exposure (Green)</span>
      </div>
      <div className="map-legend-row">
        <div className="map-legend-dot" style={{ background: "#64748b", border: "1px dashed #94a3b8" }} />
        <span>Unavailable crime data</span>
      </div>

      {showCoverage && (
        <>
          <div style={{ marginTop: 6, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: "0.68rem", color: "#94a3b8", fontWeight: 700, marginBottom: 3 }}>
            MMR Administrative Coverage
          </div>
          <div className="map-legend-row">
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981", border: "1px solid #059669" }} />
            <span style={{ fontSize: "0.68rem" }}>Available (BMC Mumbai: 41,735 FIRs)</span>
          </div>
          <div className="map-legend-row">
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b", border: "1px solid #d97706" }} />
            <span style={{ fontSize: "0.68rem" }}>Partial / Proximity (MBMC / Borders)</span>
          </div>
          <div className="map-legend-row">
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#64748b", border: "1px dashed #94a3b8" }} />
            <span style={{ fontSize: "0.68rem" }}>No Data (Thane, Navi Mumbai, etc. — NOT Zero)</span>
          </div>
          <div className="map-legend-row" style={{ marginTop: 3, paddingTop: 3, borderTop: "1px dashed rgba(255,255,255,0.06)" }}>
            <div style={{ width: 12, height: 2, background: "#00d4ff", borderRadius: 1 }} />
            <span style={{ fontSize: "0.66rem", color: "#00d4ff" }}>Road Network: 100% MMR Connected</span>
          </div>
        </>
      )}

      <div className="map-legend-row" style={{ marginTop: 5, paddingTop: 5, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ width: 14, height: 4, borderRadius: 2, background: activeRoute === "safest" ? "#10b981" : "#eab308" }} />
        <span style={{ fontSize: "0.72rem", color: "#e2e8f0" }}>Selected ({activeRoute === "safest" ? "Safest" : "Fastest"})</span>
      </div>
      <div className="map-legend-row">
        <div style={{ width: 14, height: 3, borderRadius: 2, background: "#94a3b8" }} />
        <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>Alternative route</span>
      </div>

      <div style={{ fontSize: "0.62rem", color: "#64748b", marginTop: 4, fontStyle: "italic", lineHeight: 1.2 }}>
        Approximate precinct-level aggregate data
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN MAP COMPONENT
// ─────────────────────────────────────────────
export default function MapComponent({
  safestCoords = [],
  fastestCoords = [],
  routes = null,
  activeRouteData = null,
  activeRoute = "safest",
  error = null,
  showCrimeZones = true,
  showCrimeClusters = true,
  showStreetLighting = true,
  showTrafficDensity = true,
  showRoadNetwork = false,
  showHazards = true,
  onRouteResources = [],
  showEVChargers = true,
  showPolice = true,
  showHospitals = true,
  showSafeHavens = true,
  onMapClick,
  navigating = false,
  onStartTrip,
  followPos = null,
  selectedClusterId = null,
  onSelectCluster = null,
  onSelectRoute = null,
}) {
  const MUMBAI = MMR_CENTER;

  // Live GPS
  const [livePos, setLivePos] = useState(null);
  const [liveHeading, setLiveHeading] = useState(null);
  const [liveAcc, setLiveAcc] = useState(null);
  const watchRef = useRef(null);
  const [showRouteRiskBands, setShowRouteRiskBands] = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);

  // Crime clusters from backend (bounds-keyed cache & request deduplication)
  const [crimeClusters, setCrimeClusters] = useState([]);
  const clusterCacheRef = useRef({}); // key → clusters array
  const fetchDebounceRef = useRef(null);
  const boundsAbortRef = useRef(null);
  const lastFetchedBoundsRef = useRef("");
  const fitRouteRef = useRef(null);

  // Safe havens from backend
  const [safeHavens, setSafeHavens] = useState([]);

  // Verified facilities from backend
  const [streetlights, setStreetlights] = useState([]);
  const [evStations, setEvStations] = useState([]);
  const [activeHazards, setActiveHazards] = useState([]);
  const [viewportRoads, setViewportRoads] = useState([]);

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

  // Fetch crime clusters from backend (initial load with deduplication & caching)
  useEffect(() => {
    if (!showCrimeClusters) return;
    let isMounted = true;
    const abortCtrl = new AbortController();

    if (clusterCacheRef.current["all"]) {
      setCrimeClusters(clusterCacheRef.current["all"]);
      return;
    }

    cachedFetch(`${BACKEND_URL}/api/crime-clusters`, { signal: abortCtrl.signal }, 300000)
      .then((data) => {
        if (!isMounted || !data) return;
        const raw = Array.isArray(data) ? data : (data.clusters || []);
        const valid = raw
          .filter((c) => c && typeof c === "object" && !isNaN(parseFloat(c.centroid_lat)) && !isNaN(parseFloat(c.centroid_lng)))
          .map((c) => ({
            ...c,
            centroid_lat: parseFloat(c.centroid_lat),
            centroid_lng: parseFloat(c.centroid_lng),
            risk_score: parseFloat(c.risk_score != null ? c.risk_score : 5.0),
            incident_count: parseInt(c.incident_count != null ? c.incident_count : 0, 10),
            avg_severity: c.avg_severity != null ? parseFloat(c.avg_severity) : null,
          }));
        clusterCacheRef.current["all"] = valid;
        setCrimeClusters(valid);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[SafePath] Failed to fetch crime clusters:", err);
        }
      });

    return () => {
      isMounted = false;
      abortCtrl.abort();
    };
  }, [showCrimeClusters]);

  // Dynamic bounding-box crime cluster retrieval with deduplication, cancellation & cache
  const handleBoundsChange = useCallback(({ north, south, east, west }) => {
    if (!showCrimeClusters) return;

    // Stable cache key rounded to 3 decimal places (~110m precision)
    const boundsKey = `${north.toFixed(3)},${south.toFixed(3)},${east.toFixed(3)},${west.toFixed(3)}`;
    if (boundsKey === lastFetchedBoundsRef.current) return;

    // Check memory cache first (instant 0ms response, avoids network request)
    if (clusterCacheRef.current[boundsKey]) {
      const cached = clusterCacheRef.current[boundsKey];
      setCrimeClusters((prev) => {
        const map = new Map(prev.map((c) => [c.cluster_id, c]));
        cached.forEach((c) => map.set(c.cluster_id, c));
        return Array.from(map.values());
      });
      return;
    }

    // Debounce map-bound changes (400ms after moveend)
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      // Abort any prior in-flight bounds request
      if (boundsAbortRef.current) {
        boundsAbortRef.current.abort();
      }
      boundsAbortRef.current = new AbortController();

      // 10% padding so panning feels instant
      const latPad = (north - south) * 0.1;
      const lngPad = (east - west) * 0.1;
      const n = (north + latPad).toFixed(4);
      const s = (south - latPad).toFixed(4);
      const e = (east + lngPad).toFixed(4);
      const w = (west - lngPad).toFixed(4);

      lastFetchedBoundsRef.current = boundsKey;

      cachedFetch(`${BACKEND_URL}/api/crime-clusters?north=${n}&south=${s}&east=${e}&west=${w}`, {
        signal: boundsAbortRef.current.signal,
      }, 180000)
        .then((data) => {
          if (!data) return;
          const raw = Array.isArray(data) ? data : (data.clusters || []);
          const valid = raw
            .filter((c) => c && typeof c === "object" && !isNaN(parseFloat(c.centroid_lat)) && !isNaN(parseFloat(c.centroid_lng)))
            .map((c) => ({
              ...c,
              centroid_lat: parseFloat(c.centroid_lat),
              centroid_lng: parseFloat(c.centroid_lng),
              risk_score: parseFloat(c.risk_score != null ? c.risk_score : 5.0),
              incident_count: parseInt(c.incident_count != null ? c.incident_count : 0, 10),
              avg_severity: c.avg_severity != null ? parseFloat(c.avg_severity) : null,
            }));
          clusterCacheRef.current[boundsKey] = valid;
          setCrimeClusters((prev) => {
            const map = new Map(prev.map((c) => [c.cluster_id, c]));
            valid.forEach((c) => map.set(c.cluster_id, c));
            return Array.from(map.values());
          });
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[SafePath] Failed to fetch crime clusters for bounds:", err);
          }
        });
    }, 400);
  }, [showCrimeClusters]);

  // Clean up debounce and pending bounds request on unmount
  useEffect(() => {
    return () => {
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
      if (boundsAbortRef.current) boundsAbortRef.current.abort();
    };
  }, []);

  // Fetch safe havens asynchronously (deferred load to prioritize base map rendering)
  useEffect(() => {
    let isMounted = true;
    const abortCtrl = new AbortController();
    const deferTimer = setTimeout(() => {
      cachedFetch(`${BACKEND_URL}/api/safe-havens`, { signal: abortCtrl.signal }, 300000)
        .then((data) => {
          if (!isMounted || !data) return;
          const raw = Array.isArray(data) ? data : (data.safe_havens || data.havens || []);
          const valid = raw
            .filter((h) => h && typeof h === "object" && !isNaN(parseFloat(h.lat)) && !isNaN(parseFloat(h.lng)))
            .map((h) => {
              const lat = parseFloat(h.lat);
              const lng = parseFloat(h.lng);
              const typeStr = (h.type || "").toLowerCase();
              const category = h.category || (typeStr.includes("police") ? "police" : typeStr.includes("hospital") ? "hospital" : "safe_haven");
              return {
                ...h,
                lat,
                lng,
                category,
                name: h.name || "Safe Haven",
                contact: h.contact || h.contact_number || null,
              };
            });
          setSafeHavens(valid);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[SafePath] Failed to fetch safe havens:", err);
          }
        });
    }, 60);

    return () => {
      isMounted = false;
      clearTimeout(deferTimer);
      abortCtrl.abort();
    };
  }, []);

  // Fetch streetlights asynchronously when enabled (cached)
  useEffect(() => {
    if (!showStreetLighting) return;
    let isMounted = true;
    const abortCtrl = new AbortController();
    const deferTimer = setTimeout(() => {
      cachedFetch(`${BACKEND_URL}/api/streetlights?limit=300`, { signal: abortCtrl.signal }, 300000)
        .then((data) => {
          if (!isMounted || !data) return;
          setStreetlights(data.streetlights || []);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[SafePath] Failed to fetch streetlights:", err);
          }
        });
    }, 80);

    return () => {
      isMounted = false;
      clearTimeout(deferTimer);
      abortCtrl.abort();
    };
  }, [showStreetLighting]);

  // Fetch EV charging stations asynchronously when enabled (cached)
  useEffect(() => {
    if (!showEVChargers) return;
    let isMounted = true;
    const abortCtrl = new AbortController();
    const deferTimer = setTimeout(() => {
      cachedFetch(`${BACKEND_URL}/api/ev/stations?limit=25`, { signal: abortCtrl.signal }, 300000)
        .then((data) => {
          if (!isMounted || !data) return;
          setEvStations(data.stations || []);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[SafePath] Failed to fetch EV stations:", err);
          }
        });
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(deferTimer);
      abortCtrl.abort();
    };
  }, [showEVChargers]);

  // Fetch active hazards asynchronously when enabled (cached)
  useEffect(() => {
    if (!showHazards) return;
    let isMounted = true;
    const abortCtrl = new AbortController();
    const deferTimer = setTimeout(() => {
      cachedFetch(`${BACKEND_URL}/api/hazards/active?min_lat=18.88&max_lat=19.35&min_lng=72.75&max_lng=73.15`, { signal: abortCtrl.signal }, 120000)
        .then((data) => {
          if (!isMounted || !data) return;
          setActiveHazards(data.hazards || []);
        })
        .catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[SafePath] Failed to fetch active hazards:", err);
          }
        });
    }, 120);

    return () => {
      isMounted = false;
      clearTimeout(deferTimer);
      abortCtrl.abort();
    };
  }, [showHazards]);

  // Fetch viewport road network asynchronously when enabled (cached)
  useEffect(() => {
    if (!showRoadNetwork) return;
    let isMounted = true;
    const abortCtrl = new AbortController();
    cachedFetch(`${BACKEND_URL}/api/roads/viewport?min_lat=18.95&max_lat=19.20&min_lng=72.80&max_lng=72.95&limit=350`, { signal: abortCtrl.signal }, 300000)
      .then((data) => {
        if (!isMounted || !data) return;
        setViewportRoads(data.roads || []);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[SafePath] Failed to fetch roads:", err);
        }
      });

    return () => {
      isMounted = false;
      abortCtrl.abort();
    };
  }, [showRoadNetwork]);

  const rawCoords = activeRoute === "safest" ? safestCoords : fastestCoords;
  const activeCoords = useMemo(() => {
    return (Array.isArray(rawCoords) ? rawCoords : []).filter(
      (pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1])
    );
  }, [rawCoords]);
  const startPos = activeCoords.length > 0 ? activeCoords[0] : null;
  const endPos = activeCoords.length > 1 ? activeCoords[activeCoords.length - 1] : null;
  const hasRoute = activeCoords.length > 1;

  const cLat = startPos ? startPos[0] : MUMBAI[0];
  const cLng = startPos ? startPos[1] : MUMBAI[1];

  // Static crime zones with realistic Mumbai data (approximate precinct-level)
  const crimeZones = [
    { lat: 19.1136, lng: 72.8697, label: "Andheri East Zone", severity: 8, crimes: 1240, type: "Theft, Assault" },
    { lat: 19.0596, lng: 72.8295, label: "Bandra Precinct", severity: 6, crimes: 890, type: "Robbery, Fraud" },
    { lat: 19.0330, lng: 72.8484, label: "Mahim Zone", severity: 7, crimes: 650, type: "Theft, Extortion" },
    { lat: 19.0896, lng: 72.8656, label: "Vile Parle", severity: 5, crimes: 520, type: "Burglary, Theft" },
    { lat: 19.0210, lng: 72.8440, label: "Dadar Zone", severity: 6, crimes: 780, type: "Assault, Robbery" },
  ];

  const trafficSpots = [
    { lat: cLat + 0.002, lng: cLng + 0.008, label: "Heavy Traffic Bottleneck" },
    { lat: cLat - 0.004, lng: cLng + 0.002, label: "Moderate Congestion" },
  ];

  // On-route resources
  const visRes = (onRouteResources || []).filter(r =>
    (r.type === "ev_charger" ? showEVChargers :
      r.type === "police" ? showPolice :
        r.type === "hospital" ? showHospitals : true)
  );

  // Route distance / ETA — single source of truth from selected route object
  const routeDistance = activeRouteData?.distance_km != null
    ? String(activeRouteData.distance_km)
    : (hasRoute ? activeCoords.reduce((sum, c, i) => i === 0 ? 0 : sum + haversineDist(activeCoords[i - 1], c), 0).toFixed(2) : "0");

  const meta = ROUTE_META[activeRoute] || ROUTE_META.safest;
  const routeEta = activeRouteData?.eta_mins != null
    ? String(activeRouteData.eta_mins)
    : String(Math.max(1, Math.round(((Number(routeDistance) || 0) / meta.speed) * 60)));
  const liveIcon = makeLiveIcon(liveHeading);
  const dotPos = navigating && followPos ? followPos : livePos;

  // ── High-Performance Layer Memoization (Avoids Re-renders & O(N) calculations) ──
  const visHavens = useMemo(() => {
    if (!showSafeHavens && !showPolice && !showHospitals) return [];
    return safeHavens.filter(h => {
      if (!h || isNaN(h.lat) || isNaN(h.lng)) return false;
      if (h.category === "police") return showPolice;
      if (h.category === "hospital") return showHospitals;
      return showSafeHavens;
    });
  }, [safeHavens, showSafeHavens, showPolice, showHospitals]);

  const validCrimeClusters = useMemo(() => {
    return (crimeClusters || []).filter(c => c && !isNaN(c.centroid_lat) && !isNaN(c.centroid_lng));
  }, [crimeClusters]);

  const memoizedCrimeZones = useMemo(() => {
    if (!showCrimeZones) return [];
    return crimeZones.map((s) => {
      const color = s.severity >= 7 ? "#ef4444" : s.severity >= 5 ? "#f97316" : "#f59e0b";
      const radius = 350 + s.severity * 30;
      let mappedClusterId = s.label.includes("Andheri") ? 5 : s.label.includes("Bandra") ? 8 : s.label.includes("Mahim") ? 1 : s.label.includes("Vile") ? 7 : 0;
      if (crimeClusters && crimeClusters.length > 0) {
        let bestDist = Infinity;
        for (const c of crimeClusters) {
          const d = Math.hypot(c.centroid_lat - s.lat, c.centroid_lng - s.lng);
          if (d < bestDist) {
            bestDist = d;
            mappedClusterId = c.cluster_id;
          }
        }
      }
      return { ...s, color, radius, mappedClusterId };
    });
  }, [showCrimeZones, crimeClusters]);

  const validStreetlights = useMemo(() => {
    if (!showStreetLighting) return [];
    return streetlights.filter(sl => sl && !isNaN(sl.lat) && !isNaN(sl.lng));
  }, [streetlights, showStreetLighting]);

  const validEvStations = useMemo(() => {
    if (!showEVChargers) return [];
    return evStations.filter(ev => ev && !isNaN(ev.lat) && !isNaN(ev.lng));
  }, [evStations, showEVChargers]);

  const validHazards = useMemo(() => {
    if (!showHazards) return [];
    return activeHazards.filter(hz => hz && !isNaN(hz.lat || hz.location?.coordinates?.[1]) && !isNaN(hz.lng || hz.location?.coordinates?.[0]));
  }, [activeHazards, showHazards]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {error && <div className="map-banner" role="alert">{error}</div>}

      {hasRoute && !navigating && (
        <div className="route-summary">
          <div>
            <div className="big" style={{ color: meta.color }}>{routeEta} min</div>
            <div className="sub">{routeDistance} km · {meta.label}</div>
          </div>
          <div className="sep" />
          {livePos
            ? <div className="gps-badge"><i /> GPS ±{Math.round(liveAcc || 0)} m</div>
            : <div className="sub" style={{ color: "var(--text-3)" }}>GPS off</div>}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              className="fit-route-btn"
              title="Center and fit route on map"
              onClick={(e) => {
                e.stopPropagation();
                if (fitRouteRef.current) fitRouteRef.current();
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.2)",
                color: "#e2e8f0",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <Maximize2 size={13} /> Fit Route
            </button>
            <button
              type="button"
              className="start-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onStartTrip) onStartTrip(activeRoute, activeRouteData);
              }}
            >
              <Navigation size={15} /> Start
            </button>
          </div>
        </div>
      )}

      <MapContainer
        center={MUMBAI}
        zoom={MMR_DEFAULT_ZOOM}
        style={{ height: "100%", width: "100%", background: "#0a1020" }}
        zoomControl={false}
        attributionControl={true}
        preferCanvas={true}
        scrollWheelZoom={true}
        wheelDebounceTime={40}
        wheelPxPerZoomLevel={60}
      >
        {/* Basemap — CARTO Dark Matter when no TomTom key */}
        <TileLayer
          url={TOMTOM_BASEMAP_URL || CARTO_URL}
          attribution={
            TOMTOM_BASEMAP_URL
              ? '&copy; <a href="https://www.tomtom.com">TomTom</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }
          maxZoom={22}
        />

        {/* TomTom Traffic overlay */}
        {showTrafficDensity && TOMTOM_TRAFFIC_URL && (
          <TileLayer
            url={TOMTOM_TRAFFIC_URL}
            attribution='&copy; <a href="https://www.tomtom.com">TomTom</a> Traffic'
            maxZoom={22}
            opacity={0.75}
            zIndex={400}
          />
        )}

        <ZoomControl position="bottomright" />
        <ResizeFix />
        <MapInstanceReporter />
        <MapClickHandler onMapClick={onMapClick} />
        <BoundsWatcher onBoundsChange={handleBoundsChange} enabled={showCrimeClusters} />

        {/* ══ OFFICIAL MMR BOUNDARIES & ADMINISTRATIVE COVERAGE LAYER ══ */}
        {showCoverage && (
          <>
            {/* Outer MMRDA Boundary Outline */}
            <Polygon
              positions={MMR_OUTER_BOUNDARY}
              pathOptions={{
                color: "#00d4ff",
                weight: 2,
                dashArray: "8, 6",
                fillColor: "#00d4ff",
                fillOpacity: 0.02,
              }}
            >
              <Tooltip sticky>
                <div style={{ fontWeight: 800, fontSize: "0.80rem", color: "#00d4ff" }}>
                  Official Mumbai Metropolitan Region (MMRDA) Extent
                </div>
                <div style={{ fontSize: "0.70rem", color: "#94a3b8" }}>
                  ~6,328 km² Jurisdictional Boundary · Complete Connected Road Network
                </div>
              </Tooltip>
            </Polygon>

            {/* Municipal Corporation Region Boundaries */}
            {MMR_CORPORATIONS.map((corp) => {
              const cfg = MMR_STATUS_CONFIG[corp.status] || MMR_STATUS_CONFIG["no-data"];
              const isVerified = corp.status === "verified";
              const isProximity = corp.status === "proximity";
              return (
                <Polygon
                  key={`corp-${corp.id}`}
                  positions={corp.polygon}
                  pathOptions={{
                    color: cfg.stroke,
                    weight: isVerified ? 2 : 1.5,
                    dashArray: isVerified ? undefined : isProximity ? "6, 4" : "6, 6",
                    fillColor: cfg.color,
                    fillOpacity: isVerified ? 0.12 : isProximity ? 0.09 : 0.06,
                  }}
                >
                  <Tooltip sticky>
                    <div style={{ fontWeight: 800, fontSize: "0.80rem", color: "#fff" }}>
                      {corp.shortName}
                    </div>
                    <div style={{ fontSize: "0.70rem", color: cfg.color, fontWeight: 700, marginTop: 2 }}>
                      ● {cfg.badge} · {corp.jurisdiction}
                    </div>
                    <div style={{ fontSize: "0.66rem", color: "#94a3b8", marginTop: 1 }}>
                      Road Network: {corp.roadStatus}
                    </div>
                  </Tooltip>
                  <Popup maxWidth={310}>
                    <div style={POPUP_STYLE}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ fontWeight: 800, fontSize: "0.92rem", color: "#fff" }}>
                          {corp.name}
                        </div>
                        <span style={{ fontSize: "0.62rem", padding: "2px 6px", borderRadius: 4, background: cfg.bg, color: cfg.color, fontWeight: 700, border: `1px solid ${cfg.stroke}` }}>
                          {cfg.badge}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginBottom: 3 }}>
                        <strong>Jurisdiction:</strong> {corp.jurisdiction}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#e2e8f0", marginBottom: 3 }}>
                        <strong>Crime Records:</strong> {corp.crimeRecords}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#00d4ff", marginBottom: 5 }}>
                        <strong>Road Routing:</strong> {corp.roadStatus}
                      </div>
                      <div style={{ fontSize: "0.70rem", color: "#cbd5e1", marginBottom: 6, lineHeight: 1.3 }}>
                        {corp.coverageDesc}
                      </div>
                      <div style={{ fontSize: "0.68rem", color: corp.status === "no-data" ? "#f87171" : "#94a3b8", fontStyle: "italic", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 5 }}>
                        ⚠ {cfg.note}
                      </div>
                    </div>
                  </Popup>
                </Polygon>
              );
            })}

            {/* BMC Ward Centroid Circles */}
            {BMC_WARDS.map(ward => {
              const cfg = WARD_STATUS_COLOR[ward.status] || WARD_STATUS_COLOR["no-data"];
              return (
                <Circle
                  key={`ward-${ward.id}`}
                  center={[ward.lat, ward.lng]}
                  radius={1600}
                  pathOptions={{
                    color: cfg.stroke,
                    fillColor: cfg.fill,
                    fillOpacity: ward.status === "no-data" ? 0.08 : 0.16,
                    weight: 1.5,
                    dashArray: ward.status === "no-data" ? "6,5" : ward.status === "proximity" ? "4,4" : undefined,
                  }}
                >
                  <Tooltip permanent={false} direction="top">
                    <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#fff" }}>Ward {ward.id} — {ward.name}</div>
                    <div style={{ fontSize: "0.70rem", color: cfg.fill, marginTop: 2, fontWeight: 700 }}>
                      ● {cfg.label}
                    </div>
                    <div style={{ fontSize: "0.66rem", color: "#cbd5e1", marginTop: 2 }}>
                      {ward.status === "verified"
                        ? `Police Stations: ${ward.stations.join(", ")}`
                        : ward.status === "proximity"
                        ? `Proximity Coverage: ${ward.stations.join(", ")}`
                        : "No recorded crime data (do NOT interpret as zero crime)"}
                    </div>
                  </Tooltip>
                </Circle>
              );
            })}
          </>
        )}

        {/* ══ CRIME CLUSTERS from backend ══ */}
        {showCrimeClusters && (() => {
          const validClusters = (crimeClusters || []).filter(c => c && !isNaN(c.centroid_lat) && !isNaN(c.centroid_lng));
          return (
            <>
              {/* Background risk radius circles — not clustered */}
              {validClusters.map((c, i) => {
                const isSelected = selectedClusterId === c.cluster_id;
                const riskScore = typeof c.risk_score === "number" ? c.risk_score : 5.0;
                const riskColor = riskScore >= 7.0 ? "#ef4444" : riskScore >= 4.0 ? "#f97316" : "#f59e0b";
                const radius = Math.min(600, Math.max(200, (c.incident_count || 50) * 0.4));
                const precinctName = c.police_station ? `${c.police_station} Precinct` : `Crime Cluster #${c.cluster_id ?? i + 1}`;
                return (
                  <React.Fragment key={`cluster-bg-${c.cluster_id ?? i}`}>
                    {isSelected && (
                      <Circle
                        center={[c.centroid_lat, c.centroid_lng]}
                        radius={radius + 90}
                        pathOptions={{ color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.16, weight: 2.5 }}
                      />
                    )}
                    <Circle
                      center={[c.centroid_lat, c.centroid_lng]}
                      radius={radius}
                      pathOptions={{
                        color: isSelected ? "#00d4ff" : riskColor,
                        fillColor: riskColor,
                        fillOpacity: isSelected ? 0.28 : 0.12,
                        weight: isSelected ? 3 : 1.5,
                        dashArray: isSelected ? undefined : "6,4",
                      }}
                      eventHandlers={{ click: () => { if (onSelectCluster) onSelectCluster(c.cluster_id); } }}
                    >
                      <Popup maxWidth={260}>
                        <div style={POPUP_STYLE}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <div style={{ fontWeight: 800, fontSize: "0.92rem", color: isSelected ? "#00d4ff" : riskColor }}>{precinctName}</div>
                            <span style={{ fontSize: "0.62rem", padding: "1px 6px", borderRadius: 4, background: `${riskColor}22`, color: riskColor, fontWeight: 700, border: `1px solid ${riskColor}40` }}>
                              {c.risk_classification || (riskScore >= 7 ? "High Risk" : riskScore >= 4 ? "Moderate Risk" : "Low Risk")}
                            </span>
                          </div>
                          <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginBottom: 5 }}>
                            {c.zone || "Mumbai Division"} · {c.incident_count?.toLocaleString() || "?"} recorded crimes
                          </div>
                          {c.ward && (
                            <div style={{ fontSize: "0.68rem", color: "#10b981", marginBottom: 3 }}>
                              BMC Ward {c.ward} · {c.ward_name}
                            </div>
                          )}
                          <div style={{ fontSize: "0.74rem", color: "#e2e8f0", marginBottom: 2 }}>
                            Dominant: <strong style={{ color: "#f59e0b" }}>{c.dominant_crime || "Theft"}</strong>
                            {c.avg_severity && ` · Sev ${(c.avg_severity * 10).toFixed(0)}/10`}
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 4, fontStyle: "italic" }}>
                            ⚠ Approximate precinct centroid (2020–2024 FIRs)
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (onSelectCluster) onSelectCluster(c.cluster_id); }}
                            style={{ marginTop: 9, width: "100%", padding: "7px 10px", background: "rgba(0,212,255,0.18)", border: "1px solid #00d4ff", color: "#00d4ff", borderRadius: 7, fontWeight: 700, fontSize: "0.74rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}
                          >
                            📊 View Crime Breakdown & FIRs →
                          </button>
                        </div>
                      </Popup>
                    </Circle>
                  </React.Fragment>
                );
              })}

              {/* Pin markers — clustered */}
              <MarkerClusterGroup
                chunkedLoading
                maxClusterRadius={60}
                iconCreateFunction={(cluster) => {
                  const count = cluster.getChildCount();
                  const size = count > 20 ? 44 : count > 10 ? 38 : 32;
                  return L.divIcon({
                    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:rgba(239,68,68,0.85);border:2px solid #ef4444;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${count > 99 ? "10" : "12"}px;box-shadow:0 2px 8px rgba(0,0,0,0.5);">${count}</div>`,
                    className: "",
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2],
                  });
                }}
              >
                {validClusters.map((c, i) => {
                  const isSelected = selectedClusterId === c.cluster_id;
                  const riskScore = typeof c.risk_score === "number" ? c.risk_score : 5.0;
                  const riskColor = riskScore >= 7.0 ? "#ef4444" : riskScore >= 4.0 ? "#f97316" : "#f59e0b";
                  const precinctName = c.police_station ? `${c.police_station} Precinct` : `Crime Cluster #${c.cluster_id ?? i + 1}`;
                  return (
                    <Marker
                      key={`cluster-pin-${c.cluster_id ?? i}`}
                      position={[c.centroid_lat, c.centroid_lng]}
                      icon={makeClusterIcon(riskScore, c.incident_count || 50)}
                      eventHandlers={{ click: () => { if (onSelectCluster) onSelectCluster(c.cluster_id); } }}
                    >
                      <Popup maxWidth={260}>
                        <div style={POPUP_STYLE}>
                          <div style={{ fontWeight: 800, color: isSelected ? "#00d4ff" : riskColor, marginBottom: 3, fontSize: "0.92rem" }}>{precinctName}</div>
                          <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginBottom: 4 }}>
                            {c.zone || "Mumbai Police Division"} · {c.incident_count?.toLocaleString() || "?"} incidents
                          </div>
                          {c.ward && (
                            <div style={{ fontSize: "0.68rem", color: "#10b981", marginBottom: 3 }}>Ward {c.ward} · {c.ward_name}</div>
                          )}
                          <div style={{ fontSize: "0.73rem", color: "#cbd5e1", marginBottom: 4 }}>
                            Dominant Crime: <strong>{c.dominant_crime || "Theft"}</strong>
                          </div>
                          <div style={{ fontSize: "0.68rem", color: "#64748b", marginBottom: 8, fontStyle: "italic" }}>
                            DBSCAN cluster (eps=250m) · Real Mumbai Police FIRs
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); if (onSelectCluster) onSelectCluster(c.cluster_id); }}
                            style={{ width: "100%", padding: "7px 10px", background: "rgba(0,212,255,0.18)", border: "1px solid #00d4ff", color: "#00d4ff", borderRadius: 7, fontWeight: 700, fontSize: "0.74rem", cursor: "pointer" }}
                          >
                            📊 View Detailed Crime Records →
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MarkerClusterGroup>
            </>
          );
        })()}

        {/* ══ STATIC CRIME ZONES (Pre-computed / Memoized) ══ */}
        {showCrimeZones && memoizedCrimeZones.map((s, i) => {
          return (
            <React.Fragment key={`czone-${i}`}>
              <Circle
                center={[s.lat, s.lng]}
                radius={s.radius}
                pathOptions={{
                  color: s.color,
                  fillColor: s.color,
                  fillOpacity: 0.1,
                  weight: 1.5,
                  dashArray: "5,5",
                }}
                eventHandlers={{
                  click: () => {
                    if (onSelectCluster) onSelectCluster(s.mappedClusterId);
                  },
                }}
              >
                <Popup maxWidth={250}>
                  <div style={POPUP_STYLE}>
                    <div style={{ fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: 4 }}>
                      ~{s.crimes.toLocaleString()} recorded incidents
                    </div>
                    <div style={{ fontSize: "0.74rem" }}>Types: {s.type}</div>
                    <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 6, fontStyle: "italic" }}>
                      ⚠ Approximate precinct-level data
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectCluster) onSelectCluster(s.mappedClusterId);
                      }}
                      style={{
                        marginTop: 8,
                        width: "100%",
                        padding: "6px 8px",
                        background: "rgba(0,212,255,0.15)",
                        border: "1px solid #00d4ff",
                        color: "#00d4ff",
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: "0.73rem",
                        cursor: "pointer",
                      }}
                    >
                      📊 Explore Zone FIRs & Stats →
                    </button>
                  </div>
                </Popup>
              </Circle>
              <Marker
                position={[s.lat, s.lng]}
                icon={makeCrimeMarkerIcon(s.severity)}
                eventHandlers={{
                  click: () => {
                    if (onSelectCluster) onSelectCluster(s.mappedClusterId);
                  },
                }}
              >
                <Popup maxWidth={250}>
                  <div style={POPUP_STYLE}>
                    <div style={{ fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Severity {s.severity}/10 · {s.crimes.toLocaleString()} incidents</div>
                    <div style={{ fontSize: "0.74rem", marginTop: 4 }}>Crime types: {s.type}</div>
                    <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 6, fontStyle: "italic" }}>
                      ⚠ Approximate precinct-level data
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectCluster) onSelectCluster(s.mappedClusterId);
                      }}
                      style={{
                        marginTop: 8,
                        width: "100%",
                        padding: "6px 8px",
                        background: "rgba(0,212,255,0.15)",
                        border: "1px solid #00d4ff",
                        color: "#00d4ff",
                        borderRadius: 6,
                        fontWeight: 700,
                        fontSize: "0.73rem",
                        cursor: "pointer",
                      }}
                    >
                      📊 Explore Zone FIRs & Stats →
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* ══ TRAFFIC (fallback circles when no TomTom tiles) ══ */}
        {showTrafficDensity && !TOMTOM_TRAFFIC_URL && trafficSpots.map((s, i) => (
          <Circle key={`t${i}`} center={[s.lat, s.lng]} radius={220}
            pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.14, weight: 1.5, dashArray: "4,4" }}>
            <Popup>
              <div style={POPUP_STYLE}>
                <div style={{ fontWeight: 700, color: "#f59e0b" }}>🟠 {s.label}</div>
              </div>
            </Popup>
          </Circle>
        ))}

        {/* ══ SAFE HAVENS / POLICE / HOSPITALS (Clustered & Expandable) ══ */}
        {visHavens.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={45}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={createFacilityClusterIcon}
          >
            {visHavens.filter(h => h && !isNaN(h.lat) && !isNaN(h.lng)).map((h, i) => (
              <Marker
                key={`haven-${h.id ?? h.haven_id ?? i}`}
                position={[h.lat, h.lng]}
                icon={makeSafeHavenIcon(h.category)}
              >
                <Popup maxWidth={240}>
                  <div style={POPUP_STYLE}>
                    <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 3, color: h.category === "police" ? "#00b4d8" : "#ef4444" }}>
                      {h.category === "police" ? "🚔" : "🏥"} {h.name}
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginBottom: 6, textTransform: "capitalize" }}>
                      {h.category === "police" ? "Police Station" : "Hospital"}
                    </div>
                    {h.address && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>📍 {h.address}</div>}
                    {h.contact && (
                      <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>
                        📞 <a href={`tel:${h.contact}`} style={{ color: "#00d4ff" }}>{h.contact}</a>
                      </div>
                    )}
                    {h.category === "police" && (
                      <div style={{ fontSize: "0.72rem", color: "#00b4d8", fontWeight: 700, marginTop: 4 }}>Dial 100 for emergencies</div>
                    )}
                    {h.category === "hospital" && (
                      <div style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: 700, marginTop: 4 }}>📡 Safe Haven</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {/* ══ STREETLIGHTS (Clustered Public Lighting) ══ */}
        {showStreetLighting && streetlights.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={55}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={createLightingClusterIcon}
          >
            {streetlights.filter(sl => sl && !isNaN(sl.lat) && !isNaN(sl.lng)).map((sl, i) => (
              <Marker
                key={`sl-${sl.id || i}`}
                position={[sl.lat, sl.lng]}
                icon={makeStreetlightIcon()}
              >
                <Popup maxWidth={220}>
                  <div style={POPUP_STYLE}>
                    <div style={{ fontWeight: 800, fontSize: "0.85rem", color: "#fbbf24", marginBottom: 3 }}>
                      💡 Public Streetlight
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginBottom: 3 }}>
                      ID: #{sl.id} · Type: {sl.type || "Street Lamp"}
                    </div>
                    <div style={{ fontSize: "0.70rem", color: "#22c55e", fontWeight: 700 }}>
                      Active Illumination · Municipal Lighting Network
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {/* ══ EV CHARGING STATIONS (Clustered) ══ */}
        {showEVChargers && evStations.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={40}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={createEvClusterIcon}
          >
            {evStations.filter(ev => ev && !isNaN(ev.lat) && !isNaN(ev.lng)).map((ev, i) => (
              <Marker
                key={`ev-${ev.id || i}`}
                position={[ev.lat, ev.lng]}
                icon={makeEvStationIcon()}
              >
                <Popup maxWidth={250}>
                  <div style={POPUP_STYLE}>
                    <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#22c55e", marginBottom: 3 }}>
                      ⚡ {ev.name}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginBottom: 4 }}>
                      {ev.provider} · Status: <strong style={{ color: "#22c55e" }}>{ev.status}</strong>
                    </div>
                    {ev.address && <div style={{ fontSize: "0.72rem", marginBottom: 3 }}>📍 {ev.address}</div>}
                    {ev.connectors && (
                      <div style={{ fontSize: "0.70rem", color: "#38bdf8", marginTop: 2 }}>
                        🔌 Connectors: {Array.isArray(ev.connectors) ? ev.connectors.join(", ") : ev.connectors}
                      </div>
                    )}
                    {ev.power_kw && (
                      <div style={{ fontSize: "0.70rem", color: "#f59e0b", marginTop: 2 }}>
                        ⚡ Max Output: {ev.power_kw} kW Fast Charging
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        )}

        {/* ══ ACTIVE HAZARDS (Clustered) ══ */}
        {showHazards && activeHazards.length > 0 && (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={40}
            spiderfyOnMaxZoom={true}
            showCoverageOnHover={false}
            zoomToBoundsOnClick={true}
            iconCreateFunction={createHazardClusterIcon}
          >
            {activeHazards.filter(hz => hz && !isNaN(hz.lat || hz.location?.coordinates?.[1]) && !isNaN(hz.lng || hz.location?.coordinates?.[0])).map((hz, i) => {
              const hzLat = hz.lat || hz.location?.coordinates?.[1];
              const hzLng = hz.lng || hz.location?.coordinates?.[0];
              return (
                <Marker
                  key={`hazard-${hz.id || hz._id || i}`}
                  position={[hzLat, hzLng]}
                  icon={makeHazardIcon(hz.severity)}
                >
                  <Popup maxWidth={240}>
                    <div style={POPUP_STYLE}>
                      <div style={{ fontWeight: 800, fontSize: "0.88rem", color: "#f59e0b", marginBottom: 3 }}>
                        ⚠️ {hz.hazard_type || hz.type || "Reported Hazard"}
                      </div>
                      <div style={{ fontSize: "0.74rem", color: "#cbd5e1", marginBottom: 4 }}>
                        {hz.description || "Active community safety advisory"}
                      </div>
                      <div style={{ fontSize: "0.70rem", color: "#94a3b8" }}>
                        Severity: <strong style={{ color: hz.severity === "high" ? "#ef4444" : "#f59e0b", textTransform: "capitalize" }}>{hz.severity || "medium"}</strong> · Score: {hz.verification_score ?? 1}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MarkerClusterGroup>
        )}

        {/* ══ ROAD NETWORK SEGMENTS ══ */}
        {showRoadNetwork && viewportRoads.filter(rd => rd && Array.isArray(rd.path) && rd.path.length === 2).map((rd, i) => {
          const roadColor = rd.safety_score >= 7.0 ? "#22c55e" : rd.safety_score >= 4.0 ? "#eab308" : "#ef4444";
          return (
            <Polyline
              key={`road-${rd.edge_id || i}`}
              positions={rd.path}
              pathOptions={{
                color: roadColor,
                weight: rd.road_type === "primary" ? 3.5 : 2.0,
                opacity: 0.75,
              }}
            >
              <Popup maxWidth={220}>
                <div style={POPUP_STYLE}>
                  <div style={{ fontWeight: 800, fontSize: "0.84rem", color: roadColor, marginBottom: 2 }}>
                    🛣️ {rd.road_type.toUpperCase()} ROAD
                  </div>
                  <div style={{ fontSize: "0.74rem", color: "#94a3b8" }}>
                    Safety Score: <strong style={{ color: roadColor }}>{rd.safety_score.toFixed(1)}/10.0</strong>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: rd.is_lit ? "#fbbf24" : "#64748b" }}>
                    {rd.is_lit ? "💡 Street Lighting Active" : "🌑 Unlit Street Segment"}
                  </div>
                  <div style={{ fontSize: "0.70rem", color: "#64748b" }}>
                    Isolation Risk: {(rd.isolation_risk * 100).toFixed(0)}% · {Math.round(rd.length_m)}m
                  </div>
                </div>
              </Popup>
            </Polyline>
          );
        })}

        {/* ══ ON-ROUTE RESOURCES ══ */}
        {visRes.filter(r => r && !isNaN(r.lat) && !isNaN(r.lng)).map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={RESOURCE_ICONS[r.type] || RESOURCE_ICONS.hospital}>
            <Popup maxWidth={240}>
              <div style={POPUP_STYLE}>
                <div style={{ fontWeight: 800, fontSize: "0.9rem", marginBottom: 3 }}>{r.icon} {r.name}</div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: 6 }}>{r.label}</div>
                {r.address && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>📍 {r.address}</div>}
                {r.contact && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>📞 <a href={`tel:${r.contact}`} style={{ color: "#00d4ff" }}>{r.contact}</a></div>}
                {r.opening_hours && <div style={{ fontSize: "0.74rem", marginBottom: 3 }}>🕐 {r.opening_hours}</div>}
                {r.type === "ev_charger" && r.ev_sockets && (
                  <div style={{ fontSize: "0.74rem", color: "#22c55e", fontWeight: 700 }}>🔌 {r.ev_sockets} sockets{r.ev_network ? ` · ${r.ev_network}` : ""}</div>
                )}
                {r.type === "hospital" && r.emergency === "yes" && (
                  <div style={{ fontSize: "0.74rem", color: "#ef4444", fontWeight: 700, marginTop: 3 }}>🚨 24/7 Emergency</div>
                )}
                {r.type === "police" && (
                  <div style={{ fontSize: "0.74rem", color: "#00b4d8", fontWeight: 700, marginTop: 3 }}>🚔 Dial 100</div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* ══ ROUTE POLYLINES ══ */}
        {(() => {
          const routeEntries = [
            { key: "safest", coords: safestCoords, isSelected: activeRoute === "safest" },
            { key: "fastest", coords: fastestCoords, isSelected: activeRoute === "fastest" },
          ]
            .filter((r) => Array.isArray(r.coords) && r.coords.length > 1)
            .sort((a, b) => {
              // Deterministic layering: Unselected routes first (underneath), Selected route last (on top)
              if (a.isSelected && !b.isSelected) return 1;
              if (!a.isSelected && b.isSelected) return -1;
              return 0;
            });

          return routeEntries.map(({ key, coords, isSelected }) => {
            const validCoords = coords.filter(
              (pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1])
            );
            if (validCoords.length < 2) return null;

            if (!isSelected) {
              // ── UNSELECTED ALTERNATIVE ROUTE: GREY ──
              return (
                <React.Fragment key={`unselected-${key}`}>
                  {/* Subtle thin dark border */}
                  <Polyline
                    positions={validCoords}
                    pathOptions={{
                      color: "#09101d",
                      weight: 6.5,
                      opacity: 0.65,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                    eventHandlers={{
                      click: () => onSelectRoute && onSelectRoute(key),
                    }}
                  />
                  {/* Clean, visible GREY route line */}
                  <Polyline
                    positions={validCoords}
                    pathOptions={{
                      color: "#94a3b8",
                      weight: 4.5,
                      opacity: 0.85,
                      lineCap: "round",
                      lineJoin: "round",
                    }}
                    eventHandlers={{
                      click: () => onSelectRoute && onSelectRoute(key),
                    }}
                  >
                    <Tooltip sticky>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#0f172a" }}>
                        Click to select {key === "safest" ? "Safest route (Green)" : "Fastest route (Yellow)"}
                      </div>
                    </Tooltip>
                  </Polyline>
                </React.Fragment>
              );
            }

            // ── SELECTED ROUTE: GREEN FOR SAFEST, YELLOW FOR FASTEST ──
            const activeColor = key === "safest" ? "#10b981" : "#eab308";

            return (
              <React.Fragment key={`selected-${key}`}>
                {/* Crisp dark casing for contrast */}
                <Polyline
                  positions={validCoords}
                  pathOptions={{
                    color: "#0b1324",
                    weight: 8,
                    opacity: 0.85,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />
                {/* Clean, vibrant route line (GREEN or YELLOW) */}
                <Polyline
                  positions={validCoords}
                  pathOptions={{
                    color: activeColor,
                    weight: 5,
                    opacity: 1,
                    lineCap: "round",
                    lineJoin: "round",
                  }}
                />

                {/* Risk band highlights: high/moderate risk segment overlays if enabled */}
                {showRouteRiskBands && activeRouteData?.segments && activeRouteData.segments
                  .filter((seg) => seg && (seg.risk_level === "high" || seg.risk_level === "moderate"))
                  .map((seg, sIdx) => {
                    const rawSegPath = seg.coords || seg.path || [];
                    const segCoords = (Array.isArray(rawSegPath) ? rawSegPath : []).filter(
                      (pt) => Array.isArray(pt) && pt.length >= 2 && !isNaN(pt[0]) && !isNaN(pt[1])
                    );
                    if (segCoords.length < 2) return null;

                    const segColor = seg.risk_color || (seg.risk_level === "high" ? "#ef4444" : "#f97316");
                    return (
                      <React.Fragment key={`risk-seg-${sIdx}`}>
                        <Polyline
                          positions={segCoords}
                          pathOptions={{ color: segColor, weight: 12, opacity: 0.35, lineCap: "round", lineJoin: "round" }}
                        />
                        <Polyline
                          positions={segCoords}
                          pathOptions={{ color: segColor, weight: 5.5, opacity: 1, lineCap: "round", lineJoin: "round" }}
                        >
                          <Tooltip sticky>
                            <div style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                              ⚠️ Segment #{seg.segment_index != null ? seg.segment_index + 1 : sIdx + 1}: {(seg.risk_level || "low").toUpperCase()} RISK · {seg.safety_score}/100
                            </div>
                          </Tooltip>
                          <Popup maxWidth={270}>
                            <div style={POPUP_STYLE}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <span style={{ fontWeight: 800, fontSize: "0.88rem", color: segColor }}>
                                  Route Segment #{seg.segment_index != null ? seg.segment_index + 1 : sIdx + 1}
                                </span>
                                <span style={{
                                  fontSize: "0.62rem",
                                  fontWeight: 800,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: `${segColor}22`,
                                  color: segColor,
                                  border: `1px solid ${segColor}50`,
                                  textTransform: "uppercase",
                                }}>
                                  {seg.risk_level || "low"} Risk
                                </span>
                              </div>
                              <div style={{ fontSize: "0.76rem", color: "#e2e8f0", marginBottom: 3 }}>
                                Local Safety Score: <strong style={{ color: segColor }}>{seg.safety_score}/100</strong>
                              </div>
                              <div style={{ fontSize: "0.74rem", color: "#94a3b8", marginBottom: 3 }}>
                                Nearby recorded crimes: <strong style={{ color: "#f8fafc" }}>{seg.incident_count ?? 0}</strong>
                              </div>
                              {seg.dominant_crimes && (
                                <div style={{ fontSize: "0.74rem", color: "#cbd5e1", marginBottom: 3 }}>
                                  Dominant crime: <strong>{Array.isArray(seg.dominant_crimes) ? seg.dominant_crimes.join(", ") : seg.dominant_crimes}</strong>
                                </div>
                              )}
                              <div style={{ fontSize: "0.72rem", color: "#38bdf8", marginBottom: 3 }}>
                                💡 {seg.lighting_condition || "Adequate Street Lighting"}
                              </div>
                              {seg.precinct_name && (
                                <div style={{ fontSize: "0.70rem", color: "#64748b", marginBottom: 3 }}>
                                  Precinct: {seg.precinct_name}
                                </div>
                              )}
                              <div style={{ fontSize: "0.62rem", color: "#64748b", marginTop: 4, fontStyle: "italic" }}>
                                ⚠ Approximate precinct-level aggregate data
                              </div>
                            </div>
                          </Popup>
                        </Polyline>
                      </React.Fragment>
                    );
                  })}
              </React.Fragment>
            );
          });
        })()}

        {/* ══ ON-ROUTE CRIME RISK OVERLAYS & INTERACTIVE MARKERS ══ */}
        {showRouteRiskBands && activeRouteData?.crime_markers && activeRouteData.crime_markers
          .filter((cm) => cm && !isNaN(parseFloat(cm.lat)) && !isNaN(parseFloat(cm.lng)))
          .map((cm, idx) => {
          const riskColor = cm.risk_color || (cm.risk_level === "high" ? "#ef4444" : cm.risk_level === "moderate" ? "#f97316" : "#10b981");
          const radius = cm.radius_m || 280;
          const isSelected = selectedClusterId === cm.cluster_id;
          return (
            <React.Fragment key={`route-cm-${cm.cluster_id || idx}`}>
              {/* Semi-transparent geographic risk zone overlay (streets remain visible) */}
              <Circle
                center={[cm.lat, cm.lng]}
                radius={radius}
                pathOptions={{
                  color: isSelected ? "#00d4ff" : riskColor,
                  fillColor: riskColor,
                  fillOpacity: 0.18,
                  weight: isSelected ? 2.5 : 1.5,
                  dashArray: "5,5",
                }}
                eventHandlers={{
                  click: () => {
                    if (onSelectCluster && cm.cluster_id != null) onSelectCluster(cm.cluster_id);
                  },
                }}
              />
              {/* Interactive Crime Marker */}
              <Marker
                position={[cm.lat, cm.lng]}
                icon={makeCrimeRiskIcon(cm.risk_level, cm.incident_count, riskColor)}
                eventHandlers={{
                  click: () => {
                    if (onSelectCluster && cm.cluster_id != null) onSelectCluster(cm.cluster_id);
                  },
                }}
              >
                <Popup maxWidth={270}>
                  <div style={POPUP_STYLE}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <div style={{ fontWeight: 800, fontSize: "0.9rem", color: isSelected ? "#00d4ff" : riskColor }}>
                        {cm.police_station || cm.precinct_name || `Precinct Zone #${cm.cluster_id || idx + 1}`}
                      </div>
                      <span style={{
                        fontSize: "0.62rem",
                        fontWeight: 800,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: `${riskColor}22`,
                        color: riskColor,
                        border: `1px solid ${riskColor}40`,
                        textTransform: "uppercase"
                      }}>
                        {cm.risk_level || "Crime"} Risk
                      </span>
                    </div>
                    <div style={{ fontSize: "0.76rem", color: "#94a3b8", marginBottom: 3 }}>
                      Recorded Crimes: <strong style={{ color: "#f8fafc" }}>{cm.incident_count?.toLocaleString()}</strong> incidents
                    </div>
                    <div style={{ fontSize: "0.74rem", color: "#cbd5e1", marginBottom: 3 }}>
                      Most frequent: <strong style={{ color: "#f59e0b" }}>{cm.dominant_crime || "Theft/Assault"}</strong>
                    </div>
                    {cm.dominant_categories && (
                      <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginBottom: 3 }}>
                        Categories: {Array.isArray(cm.dominant_categories) ? cm.dominant_categories.join(", ") : cm.dominant_categories}
                      </div>
                    )}
                    <div style={{ fontSize: "0.70rem", color: "#64748b", marginBottom: 6 }}>
                      Reporting Period: {cm.reporting_period || "2020–2024"} · Real Mumbai FIRs
                    </div>
                    <div style={{ fontSize: "0.64rem", color: "#ef4444", marginBottom: 8, fontStyle: "italic", lineHeight: 1.25 }}>
                      ⚠ {cm.disclaimer || "Approximate precinct-level aggregate data. Does not represent an exact crime location."}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectCluster && cm.cluster_id != null) onSelectCluster(cm.cluster_id);
                      }}
                      style={{
                        width: "100%",
                        padding: "7px 10px",
                        background: "rgba(0,212,255,0.18)",
                        border: "1px solid #00d4ff",
                        color: "#00d4ff",
                        borderRadius: 7,
                        fontWeight: 700,
                        fontSize: "0.74rem",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5
                      }}
                    >
                      📊 View Crime Details →
                    </button>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          );
        })}

        {/* Direction arrows */}
        {!navigating && <ArrowLayer coords={activeCoords} />}

        {/* A / B Pins */}
        {startPos && <Marker position={startPos} icon={PIN_A}><Popup><div style={POPUP_STYLE}><b style={{ color: "#00d4ff" }}>📍 Start</b></div></Popup></Marker>}
        {endPos && <Marker position={endPos} icon={PIN_B}><Popup><div style={POPUP_STYLE}><b style={{ color: "#ef4444" }}>🏁 Destination</b></div></Popup></Marker>}

        {/* Live GPS dot */}
        {dotPos && (<>
          <Circle center={dotPos} radius={liveAcc || 50}
            pathOptions={{ color: "#00d4ff", fillColor: "#00d4ff", fillOpacity: 0.08, weight: 1 }} />
          <Marker position={dotPos} icon={liveIcon}>
            <Popup><div style={POPUP_STYLE}><b style={{ color: "#00d4ff" }}>📍 Your Location</b><br />±{Math.round(liveAcc || 0)}m accuracy</div></Popup>
          </Marker>
        </>)}

        {/* Intelligent route controller & navigation follower */}
        {hasRoute && !navigating && (
          <RouteController
            routes={routes}
            activeCoords={activeCoords}
            onRegisterFitRoute={(fn) => { fitRouteRef.current = fn; }}
          />
        )}
        {navigating && <Follow pos={followPos} />}

        {/* Floating action buttons for explicit user-triggered movement ONLY */}
        <div className="map-fab-group">
          {hasRoute && !navigating && (
            <button
              type="button"
              className="map-fab"
              title="Fit route to screen (center on active route)"
              aria-label="Fit route to screen"
              onClick={() => {
                if (fitRouteRef.current) fitRouteRef.current();
              }}
            >
              <Maximize2 size={18} />
            </button>
          )}
          <RecenterBtn livePos={livePos} />
        </div>
      </MapContainer>

      {/* Floating map legend */}
      <MapLegend
        activeRoute={activeRoute}
        showCrimeZones={showCrimeZones}
        showCrimeClusters={showCrimeClusters}
        showRouteRiskBands={showRouteRiskBands}
        onToggleRiskBands={() => setShowRouteRiskBands((prev) => !prev)}
        showCoverage={showCoverage}
        onToggleCoverage={() => setShowCoverage((prev) => !prev)}
      />
    </div>
  );
}
