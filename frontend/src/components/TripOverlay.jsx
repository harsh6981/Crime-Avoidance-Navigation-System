import { useEffect, useMemo, useRef, useState } from "react";
import { X, Navigation, CheckCircle2, AlertTriangle, LocateFixed } from "lucide-react";

// ── geometry helpers (path is [[lat,lng], ...]) ──
const KM_LAT = 110.574;
function kmLng(lat) { return 111.32 * Math.cos((lat * Math.PI) / 180); }

function buildPath(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = (b[1] - a[1]) * kmLng(a[0]);
    const dy = (b[0] - a[0]) * KM_LAT;
    cum.push(cum[i - 1] + Math.hypot(dx, dy));
  }
  return cum;
}

/** Nearest point on the path: how far along it we are and how far off it we are. */
function progressOnPath(path, cum, pos) {
  let best = { dist: Infinity, along: 0 };
  const kl = kmLng(pos[0]);
  for (let i = 1; i < path.length; i++) {
    const ax = path[i - 1][1] * kl, ay = path[i - 1][0] * KM_LAT;
    const bx = path[i][1] * kl, by = path[i][0] * KM_LAT;
    const px = pos[1] * kl, py = pos[0] * KM_LAT;
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    if (d < best.dist) best = { dist: d, along: cum[i - 1] + t * (cum[i] - cum[i - 1]) };
  }
  return best;
}

function pointAt(path, cum, km) {
  if (km <= 0) return path[0];
  const total = cum[cum.length - 1];
  if (km >= total) return path[path.length - 1];
  let i = 1;
  while (cum[i] < km) i++;
  const t = (km - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
  return [path[i - 1][0] + t * (path[i][0] - path[i - 1][0]), path[i - 1][1] + t * (path[i][1] - path[i - 1][1])];
}

const OFF_ROUTE_KM = 0.1;  // 100 m
const ARRIVE_KM = 0.04;    // 40 m

/**
 * TripOverlay — turn-by-turn-style trip mode (progress, ETA, off-route and arrival).
 * Follows real GPS, or a simulated walker when "Demo" is on (handy on desktop).
 */
export default function TripOverlay({ route, routeName, onPosition, onEnd }) {
  const path = route?.path || [];
  const cum = useMemo(() => buildPath(path), [route]);
  const total = cum[cum.length - 1] || 0;

  const [pos, setPos] = useState(null);
  const [demo, setDemo] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const simKm = useRef(0);

  // Real GPS
  useEffect(() => {
    if (demo) return;
    if (!navigator.geolocation) { setGpsError("This device has no GPS."); return; }
    setGpsError(null);
    const id = navigator.geolocation.watchPosition(
      (p) => setPos([p.coords.latitude, p.coords.longitude]),
      (e) => setGpsError(e.message || "Can't get your location."),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [demo]);

  // Demo mode: walk along the route
  useEffect(() => {
    if (!demo) return;
    simKm.current = 0;
    setGpsError(null);
    const id = setInterval(() => {
      simKm.current = Math.min(total, simKm.current + 0.03);
      setPos(pointAt(path, cum, simKm.current));
    }, 800);
    return () => clearInterval(id);
  }, [demo, route]);

  useEffect(() => { if (pos) onPosition?.(pos); }, [pos]);

  const prog = pos && path.length > 1 ? progressOnPath(path, cum, pos) : null;
  const remaining = prog ? Math.max(0, total - prog.along) : total;
  const offRoute = prog ? prog.dist > OFF_ROUTE_KM : false;
  const arrived = prog ? remaining <= ARRIVE_KM : false;
  const fullEta = Number(route?.eta_mins) || Math.max(1, Math.round((total / 5) * 60));
  const etaMin = total ? Math.max(1, Math.ceil(fullEta * (remaining / total))) : fullEta;
  const arriveAt = new Date(Date.now() + etaMin * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <>
      <div className={`trip-top ${offRoute ? "warn" : arrived ? "done" : ""}`} role="status">
        {arrived ? <CheckCircle2 size={20} /> : offRoute ? <AlertTriangle size={20} /> : <Navigation size={20} />}
        <div>
          <strong>{arrived ? "You've arrived" : offRoute ? "You're off the safe route" : `Navigating · ${routeName}`}</strong>
          <span>
            {gpsError ? gpsError
              : !pos ? "Waiting for GPS…"
                : arrived ? "Stay safe. Trip complete."
                  : offRoute ? "Head back to the highlighted route, or recalculate from the Directions tab."
                    : "Following the safest path. SOS is always one tap away."}
          </span>
        </div>
      </div>

      <div className="trip-bar">
        <button className="trip-end" onClick={onEnd}>
          <X size={18} /> {arrived ? "Done" : "End"}
        </button>
        {!arrived && (
          <div className="trip-stats">
            <div className="big">{etaMin} min</div>
            <div className="sub">{remaining.toFixed(1)} km · arrive {arriveAt}</div>
          </div>
        )}
        <button className={`trip-demo ${demo ? "on" : ""}`} onClick={() => setDemo(!demo)}
          title="Simulate moving along the route (useful without GPS)">
          <LocateFixed size={14} /> {demo ? "Demo on" : "Demo"}
        </button>
      </div>
    </>
  );
}