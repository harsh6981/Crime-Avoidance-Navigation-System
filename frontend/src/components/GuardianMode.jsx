import { useState, useEffect, useRef, useCallback } from "react";

const BACKEND_URL = "http://localhost:8000";

/**
 * GuardianMode — Background Safety Monitor
 *
 * Watches the user's location while they travel and automatically:
 *   1. Detects if the user deviates into a HIGH RISK zone
 *   2. Detects if the user has been stationary for too long in a red zone
 *   3. Sends an automatic SOS if both conditions are met and user doesn't respond
 *
 * Uses: Geolocation API (browser built-in, no key needed)
 */
export default function GuardianMode({ user, activeRoute, onAlert }) {
  const [enabled, setEnabled]       = useState(false);
  const [status, setStatus]         = useState("idle");   // idle | watching | alert | sos_sent
  const [countdown, setCountdown]   = useState(null);
  const [lastPos, setLastPos]       = useState(null);
  const [riskLevel, setRiskLevel]   = useState(null);     // null | low | moderate | high

  const watchIdRef     = useRef(null);
  const stationaryRef  = useRef(null);  // timer for stationary detection
  const countdownRef   = useRef(null);  // auto-SOS countdown timer
  const lastMoveRef    = useRef(Date.now());
  const statusRef      = useRef("idle"); // mirrors status for use inside intervals

  // ── Start/stop location watching ──
  const startGuardian = useCallback(() => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    setEnabled(true);
    setStatus("watching");
    statusRef.current = "watching";

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => handlePositionUpdate(pos),
      (err) => console.error("Geolocation error:", err),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
  }, []);

  const stopGuardian = useCallback(() => {
    if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    clearInterval(stationaryRef.current);
    clearInterval(countdownRef.current);
    setEnabled(false);
    setStatus("idle");
    statusRef.current = "idle";
    setCountdown(null);
    setRiskLevel(null);
  }, []);

  // ── Handle each GPS position update ──
  async function handlePositionUpdate(pos) {
    const { latitude: lat, longitude: lng } = pos.coords;
    setLastPos({ lat, lng });
    lastMoveRef.current = Date.now();

    // Check risk level at this location
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/hazards/active?min_lat=${lat - 0.002}&max_lat=${lat + 0.002}&min_lng=${lng - 0.002}&max_lng=${lng + 0.002}`
      );
      const data = await res.json();
      const hazards = data.hazards || [];

      const maxSeverity = hazards.length
        ? Math.max(...hazards.map((h) => h.severity || 0))
        : 0;

      const risk = maxSeverity >= 7 ? "high" : maxSeverity >= 4 ? "moderate" : "low";
      setRiskLevel(risk);

      if (risk === "high") {
        onAlert && onAlert({ type: "high_risk_zone", lat, lng, hazards });
        startStationaryCheck(lat, lng);
      } else {
        clearInterval(stationaryRef.current);
      }
    } catch {
      // Backend not reachable, continue silently
    }
  }

  // ── Stationary detection: if in high-risk zone and not moving for 3 min ──
  function startStationaryCheck(lat, lng) {
    clearInterval(stationaryRef.current);
    stationaryRef.current = setInterval(() => {
      const secondsStationary = (Date.now() - lastMoveRef.current) / 1000;

      // 3 minutes stationary in a red zone → start SOS countdown
      if (secondsStationary > 180 && statusRef.current !== "alert" && statusRef.current !== "sos_sent") {
        triggerCountdown(lat, lng);
      }
    }, 30000); // Check every 30 seconds
  }

  // ── 30-second countdown before auto-SOS ──
  function triggerCountdown(lat, lng) {
    setStatus("alert");
    statusRef.current = "alert";
    setCountdown(30);
    onAlert && onAlert({ type: "auto_sos_countdown", lat, lng });

    let remaining = 30;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);

      if (remaining <= 0) {
        clearInterval(countdownRef.current);
        sendAutoSOS(lat, lng);
      }
    }, 1000);
  }

  // ── Cancel the countdown (user confirms they're OK) ──
  function cancelCountdown() {
    clearInterval(countdownRef.current);
    setStatus("watching");
    statusRef.current = "watching";
    setCountdown(null);
  }

  // ── Auto-SOS: send location to trusted contacts ──
  async function sendAutoSOS(lat, lng) {
    setStatus("sos_sent");
    statusRef.current = "sos_sent";
    try {
      await fetch(`${BACKEND_URL}/api/emergency/trigger-sos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user?.id || "anonymous",
          current_location: { lat, lng },
          trigger: "guardian_auto",
        }),
      });
    } catch (e) {
      console.error("Auto-SOS failed:", e);
    }
  }

  // Cleanup on unmount
  useEffect(() => () => stopGuardian(), []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.headerIcon}>👁</span>
        <span style={styles.headerTitle}>Guardian Mode</span>
        <div
          style={{ ...styles.toggle, background: enabled ? "#22c55e" : "#334155" }}
          onClick={enabled ? stopGuardian : startGuardian}
        >
          <div style={{ ...styles.toggleThumb, transform: enabled ? "translateX(18px)" : "translateX(2px)" }} />
        </div>
      </div>

      {enabled && (
        <div style={styles.statusArea}>
          {/* Status row */}
          <div style={styles.statusRow}>
            <div style={{ ...styles.statusDot, background: STATUS_COLORS[status] }} />
            <span style={styles.statusText}>{STATUS_LABELS[status]}</span>
          </div>

          {/* Risk badge */}
          {riskLevel && (
            <div style={{ ...styles.riskBadge, background: RISK_BG[riskLevel], color: RISK_COLOR[riskLevel] }}>
              {RISK_ICONS[riskLevel]} Zone: {riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} Risk
            </div>
          )}

          {/* Auto-SOS countdown */}
          {status === "alert" && countdown !== null && (
            <div style={styles.alertBox}>
              <div style={styles.alertTitle}>⚠️ Are you safe?</div>
              <div style={styles.alertSub}>
                You've been stationary in a high-risk zone.<br />
                Auto-SOS in <strong style={{ color: "#ef4444" }}>{countdown}s</strong>
              </div>
              <div style={styles.alertBtns}>
                <button style={styles.btnSafe} onClick={cancelCountdown}>✓ I'm Safe</button>
                <button style={styles.btnSOS} onClick={() => { clearInterval(countdownRef.current); sendAutoSOS(lastPos?.lat, lastPos?.lng); }}>
                  Send SOS Now
                </button>
              </div>
            </div>
          )}

          {status === "sos_sent" && (
            <div style={{ ...styles.alertBox, borderColor: "#ef4444" }}>
              <div style={{ color: "#ef4444", fontWeight: 700, fontSize: 13 }}>🚨 SOS Sent</div>
              <div style={styles.alertSub}>Your emergency contacts have been notified with your location.</div>
              <button style={styles.btnSafe} onClick={() => { setStatus("watching"); }}>I'm Safe Now</button>
            </div>
          )}

          {/* Current position */}
          {lastPos && (
            <div style={styles.coords}>
              📍 {lastPos.lat.toFixed(5)}, {lastPos.lng.toFixed(5)}
            </div>
          )}
        </div>
      )}

      {!enabled && (
        <p style={styles.desc}>
          Monitors your location while travelling. Sends automatic SOS if you stop in a high-risk zone.
        </p>
      )}
    </div>
  );
}

// ── Constants ──
const STATUS_COLORS = { idle: "#334155", watching: "#22c55e", alert: "#f59e0b", sos_sent: "#ef4444" };
const STATUS_LABELS = { idle: "Off", watching: "Watching your route…", alert: "Check-in required", sos_sent: "SOS sent" };
const RISK_BG       = { low: "rgba(34,197,94,0.1)", moderate: "rgba(245,158,11,0.1)", high: "rgba(239,68,68,0.12)" };
const RISK_COLOR    = { low: "#22c55e", moderate: "#f59e0b", high: "#ef4444" };
const RISK_ICONS    = { low: "🟢", moderate: "🟡", high: "🔴" };

// ── Inline styles ──
const styles = {
  container: { padding: "14px", borderBottom: "1px solid #1e2d45" },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  headerIcon: { fontSize: 15 },
  headerTitle: { fontWeight: 600, fontSize: 13, flex: 1 },
  toggle: { width: 38, height: 22, borderRadius: 11, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 },
  toggleThumb: { position: "absolute", top: 2, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "transform 0.2s" },
  statusArea: { display: "flex", flexDirection: "column", gap: 8 },
  statusRow: { display: "flex", alignItems: "center", gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  statusText: { fontSize: 11, color: "#94a3b8" },
  riskBadge: { fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, alignSelf: "flex-start" },
  alertBox: { background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: 12 },
  alertTitle: { fontWeight: 700, fontSize: 13, marginBottom: 5, color: "#f59e0b" },
  alertSub: { fontSize: 11, color: "#94a3b8", lineHeight: 1.6, marginBottom: 10 },
  alertBtns: { display: "flex", gap: 7 },
  btnSafe: { flex: 1, background: "#22c55e", color: "#000", border: "none", borderRadius: 6, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  btnSOS: { flex: 1, background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, padding: "7px 0", fontSize: 11, fontWeight: 700, cursor: "pointer" },
  coords: { fontSize: 10, color: "#334155", fontFamily: "monospace" },
  desc: { fontSize: 11, color: "#64748b", lineHeight: 1.6, margin: 0 },
};