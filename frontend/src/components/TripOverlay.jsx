import { useEffect, useMemo, useRef, useState } from "react";
import { X, Navigation, CheckCircle2, AlertTriangle, LocateFixed, Compass, Shield } from "lucide-react";
import { Geolocation } from "@capacitor/geolocation";

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

  // Initialize position at route start point so navigation view is immediate
  const [pos, setPos] = useState(path[0] || null);
  const [demo, setDemo] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const simKm = useRef(0);

  // Initialize GPS (Capacitor Geolocation with native Android permission handling)
  useEffect(() => {
    if (demo) return;
    let isMounted = true;
    let webWatchId = null;
    let nativeWatchId = null;

    async function startTracking() {
      try {
        let hasNativeCapacitor = false;
        try {
          const perm = await Geolocation.checkPermissions();
          if (perm.location !== "granted") {
            const req = await Geolocation.requestPermissions();
            if (req.location !== "granted") {
              if (isMounted) {
                setGpsError("Location permission required for live GPS navigation. Tap 'Demo' below to simulate.");
              }
              return;
            }
          }
          hasNativeCapacitor = true;
        } catch (_) {
          // Standard browser or plugin not available
        }

        if (hasNativeCapacitor) {
          nativeWatchId = await Geolocation.watchPosition(
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 },
            (position, err) => {
              if (!isMounted) return;
              if (err) {
                setGpsError(err.message || "Searching for GPS satellites…");
                return;
              }
              if (position?.coords) {
                setGpsError(null);
                setPos([position.coords.latitude, position.coords.longitude]);
              }
            }
          );
        } else if (navigator.geolocation) {
          webWatchId = navigator.geolocation.watchPosition(
            (p) => {
              if (!isMounted) return;
              setGpsError(null);
              setPos([p.coords.latitude, p.coords.longitude]);
            },
            (e) => {
              if (!isMounted) return;
              setGpsError(e.message || "Acquiring GPS fix… Tap 'Demo' to simulate.");
            },
            { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
          );
        } else {
          if (isMounted) setGpsError("This device has no GPS available.");
        }
      } catch (err) {
        if (isMounted) setGpsError("GPS initialization error: " + (err.message || "Failed"));
      }
    }

    startTracking();

    return () => {
      isMounted = false;
      if (webWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(webWatchId);
      }
      if (nativeWatchId !== null) {
        Geolocation.clearWatch({ id: nativeWatchId }).catch(() => {});
      }
    };
  }, [demo]);

  // Demo mode: smoothly walk along the calculated route
  useEffect(() => {
    if (!demo) return;
    simKm.current = 0;
    setGpsError(null);
    const id = setInterval(() => {
      simKm.current = Math.min(total, simKm.current + 0.035);
      setPos(pointAt(path, cum, simKm.current));
    }, 700);
    return () => clearInterval(id);
  }, [demo, route, total, path, cum]);

  useEffect(() => {
    if (pos) onPosition?.(pos);
  }, [pos, onPosition]);

  const routeTotalKm = route?.distance_km != null ? Number(route.distance_km) : total;
  const fullEta = Number(route?.eta_mins) || Math.max(1, Math.round((total / 5) * 60));

  const prog = pos && path.length > 1 ? progressOnPath(path, cum, pos) : null;
  const alongRatio = total > 0 && prog ? Math.min(1, Math.max(0, prog.along / total)) : 0;
  const remainingDist = Math.max(0, routeTotalKm * (1 - alongRatio));
  const offRoute = prog ? prog.dist > OFF_ROUTE_KM : false;
  const arrived = prog ? (total - prog.along) <= ARRIVE_KM : false;
  const etaMin = Math.max(1, Math.round(fullEta * (1 - alongRatio)));
  const arriveAt = new Date(Date.now() + etaMin * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const displayDist = alongRatio === 0 && route?.distance_km != null
    ? String(route.distance_km)
    : remainingDist.toFixed(2);

  return (
    <>
      {/* Top Banner: Guidance and route status */}
      <div className={`trip-top ${offRoute ? "warn" : arrived ? "done" : ""}`} role="status">
        <div className="trip-top-icon">
          {arrived ? <CheckCircle2 size={22} /> : offRoute ? <AlertTriangle size={22} /> : <Navigation size={22} />}
        </div>
        <div className="trip-top-content">
          <strong>
            {arrived ? "You've Arrived at Destination" : offRoute ? "You're off the safe corridor" : `Navigating · ${routeName}`}
          </strong>
          <span>
            {gpsError
              ? gpsError
              : !pos
                ? "Waiting for GPS signal…"
                : arrived
                  ? "Trip complete. Stay safe!"
                  : offRoute
                    ? "Head back towards highlighted route."
                    : "Patrolled safe route active. SOS is 1-tap away."}
          </span>
        </div>
      </div>

      {/* Bottom Bar: ETA, Distance, End Trip and Demo controls */}
      <div className="trip-bar">
        <button
          className="trip-end"
          onClick={onEnd}
          aria-label="End Navigation"
        >
          <X size={18} />
          <span>{arrived ? "Done" : "End"}</span>
        </button>

        {!arrived && (
          <div className="trip-stats">
            <div className="big">{etaMin} <span className="trip-min-label">min</span></div>
            <div className="sub">{displayDist} km · ETA {arriveAt}</div>
          </div>
        )}

        <button
          className={`trip-demo ${demo ? "on" : ""}`}
          onClick={() => setDemo(!demo)}
          title="Simulate moving along route (useful for testing)"
          aria-pressed={demo}
        >
          <LocateFixed size={15} />
          <span>{demo ? "Simulating" : "Demo"}</span>
        </button>
      </div>
    </>
  );
}