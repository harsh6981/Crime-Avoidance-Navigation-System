import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  CircleMarker,
  Circle,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// ── Custom SVG Icon Generators for Start & Destination Pins ──
const createCustomIcon = (color, symbol) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 12 16 26 16 26s16-14 16-26C32 7.163 24.837 0 16 0z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
      <circle cx="16" cy="15" r="8" fill="#ffffff"/>
      <text x="16" y="19" font-size="10" font-weight="bold" text-anchor="middle" fill="${color}">${symbol}</text>
    </svg>
  `;
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(svg)}`,
    shadowUrl: markerShadow,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
    shadowSize: [41, 41],
  });
};

const startIcon = createCustomIcon("#22c55e", "A");
const endIcon = createCustomIcon("#ef4444", "B");

// ── Auto-fit bounds on route update ──
function FitBounds({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions && positions.length > 1) {
      try {
        const bounds = L.latLngBounds(positions);
        map.fitBounds(bounds, { padding: [50, 50] });
      } catch (_) {}
    }
  }, [positions, map]);
  return null;
}

export default function MapComponent({
  safestCoords = [],
  fastestCoords = [],
  activeRoute = "safest",
  error = null,
  showCrimeZones = true,
  showStreetLighting = true,
  showTrafficDensity = true,
}) {
  const MUMBAI = [19.076, 72.8777];

  const activeCoords = activeRoute === "safest" ? safestCoords : fastestCoords;
  const startPos = activeCoords[0] ?? null;
  const endPos = activeCoords[activeCoords.length - 1] ?? null;
  const hasRoute = activeCoords.length > 1;

  // Mock overlays generated from route or center for interactive demonstration
  const centerLat = startPos ? startPos[0] : MUMBAI[0];
  const centerLng = startPos ? startPos[1] : MUMBAI[1];

  const crimeSpots = [
    [centerLat + 0.005, centerLng + 0.004, "High Crime Area (Unlit Alley)"],
    [centerLat - 0.008, centerLng - 0.003, "Frequent Theft Reported"],
  ];

  const trafficSpots = [
    [centerLat + 0.002, centerLng + 0.008, "Heavy Bottleneck"],
    [centerLat - 0.004, centerLng + 0.002, "Moderate Congestion"],
  ];

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Error Banner */}
      {error && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(239,68,68,0.95)",
            color: "#fff",
            padding: "10px 20px",
            borderRadius: 12,
            fontSize: "0.85rem",
            fontWeight: 700,
            boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* Empty State Prompt */}
      {!hasRoute && !error && (
        <div
          style={{
            position: "absolute",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 1000,
            background: "rgba(15,23,42,0.9)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#94a3b8",
            padding: "10px 20px",
            borderRadius: 12,
            fontSize: "0.82rem",
            fontWeight: 600,
            backdropFilter: "blur(12px)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
          }}
        >
          🗺️ Enter source &amp; destination to map your safe route
        </div>
      )}

      <MapContainer
        center={MUMBAI}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Crime Zones Layer */}
        {showCrimeZones && crimeSpots.map(([lat, lng, label], i) => (
          <Circle
            key={`crime-${i}`}
            center={[lat, lng]}
            radius={250}
            pathOptions={{
              color: "#ef4444",
              fillColor: "#ef4444",
              fillOpacity: 0.35,
              weight: 2,
            }}
          >
            <Popup>🔴 <strong>{label}</strong><br/>Avoid after 10 PM.</Popup>
          </Circle>
        ))}

        {/* Traffic Density Layer */}
        {showTrafficDensity && trafficSpots.map(([lat, lng, label], i) => (
          <Circle
            key={`traffic-${i}`}
            center={[lat, lng]}
            radius={200}
            pathOptions={{
              color: "#f59e0b",
              fillColor: "#f59e0b",
              fillOpacity: 0.25,
              weight: 1,
            }}
          >
            <Popup>🟠 <strong>{label}</strong></Popup>
          </Circle>
        ))}

        {/* Street Lighting Layer (dots along active route) */}
        {showStreetLighting && activeCoords.map((pt, i) => (
          <CircleMarker
            key={`light-${i}`}
            center={pt}
            radius={6}
            pathOptions={{
              color: "#eab308",
              fillColor: "#fef08a",
              fillOpacity: 0.9,
              weight: 1,
            }}
          >
            <Popup>💡 Street Lighting active</Popup>
          </CircleMarker>
        ))}

        {/* Safest route – Solid Green (#22c55e) */}
        {safestCoords.length > 1 && (
          <Polyline
            positions={safestCoords}
            pathOptions={{
              color: "#22c55e",
              weight: activeRoute === "safest" ? 6 : 4,
              opacity: activeRoute === "safest" ? 1 : 0.4,
            }}
          />
        )}

        {/* Fastest route – Dashed Blue (#3b82f6) */}
        {fastestCoords.length > 1 && (
          <Polyline
            positions={fastestCoords}
            pathOptions={{
              color: "#3b82f6",
              weight: activeRoute === "fastest" ? 6 : 4,
              opacity: activeRoute === "fastest" ? 1 : 0.4,
              dashArray: "8, 10",
            }}
          />
        )}

        {/* Start / End markers */}
        {startPos && (
          <Marker position={startPos} icon={startIcon}>
            <Popup>🟢 <strong>Start Point</strong></Popup>
          </Marker>
        )}
        {endPos && startPos !== endPos && (
          <Marker position={endPos} icon={endIcon}>
            <Popup>🏁 <strong>Destination</strong></Popup>
          </Marker>
        )}

        {/* Auto-fit bounds */}
        {hasRoute && <FitBounds positions={activeCoords} />}
      </MapContainer>
    </div>
  );
}
