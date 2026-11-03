import { useState } from "react";
import { BarChart3, Info, X } from "lucide-react";

// Danger Index 0-4 matching Safe-Path-Recommender K-Means output
const DANGER_LEVELS = [
  { mag: 0, label: "Safest",               icon: "green-tick",  color: "#22c55e", bg: "rgba(34,197,94,0.12)",   desc: "Low crime history — freely traverse",        symbol: "✓" },
  { mag: 1, label: "Moderately Safe",      icon: "smiley",      color: "#86efac", bg: "rgba(134,239,172,0.12)", desc: "Minimal incidents — generally safe",          symbol: ":-)" },
  { mag: 2, label: "Be Careful",           icon: "exclamation", color: "#f59e0b", bg: "rgba(245,158,11,0.12)",  desc: "Some recorded crime — stay alert",            symbol: "!" },
  { mag: 3, label: "High Risk",            icon: "danger",      color: "#f97316", bg: "rgba(249,115,22,0.12)",  desc: "Higher crime density — caution advised",      symbol: "!!" },
  { mag: 4, label: "Avoid",               icon: "cross",       color: "#ef4444", bg: "rgba(239,68,68,0.12)",   desc: "High-risk zone — avoid if possible",          symbol: "X" },
];

function safetyToDangerIndex(safetyScore) {
  if (safetyScore >= 8) return 0;
  if (safetyScore >= 6) return 1;
  if (safetyScore >= 4) return 2;
  if (safetyScore >= 2) return 3;
  return 4;
}

function DangerCircle({ index }) {
  const lvl = DANGER_LEVELS[index] || DANGER_LEVELS[2];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 28, height: 28, borderRadius: "50%",
      background: lvl.bg, border: `2px solid ${lvl.color}`,
      fontSize: "0.65rem", fontWeight: 800, color: lvl.color,
      fontFamily: "monospace",
    }}>
      {lvl.symbol}
    </span>
  );
}

function DangerBadge({ index }) {
  const lvl = DANGER_LEVELS[index] || DANGER_LEVELS[2];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      fontSize: "0.72rem", fontWeight: 700,
      color: lvl.color, background: lvl.bg,
      padding: "3px 8px", borderRadius: 8,
      border: `1px solid ${lvl.color}30`,
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%",
        background: `${lvl.color}30`, border: `1.5px solid ${lvl.color}`,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: "0.55rem", fontWeight: 800, fontFamily: "monospace",
      }}>{lvl.symbol}</span>
      {lvl.label}
    </span>
  );
}

function RouteComparisonTable({ routes }) {
  if (!routes) return null;
  const rows = [
    {
      num: 1, routeName: "Safest Route", colorName: "Green", color: "#22c55e",
      distance: routes.safest_route?.distance_km ?? "--",
      duration: routes.safest_route?.eta_mins ?? "--",
      dangerIndex: safetyToDangerIndex(routes.safest_route?.safety_score ?? 8.5),
    },
    {
      num: 2, routeName: "Fastest Route", colorName: "Blue", color: "#3b82f6",
      distance: routes.fastest_route?.distance_km ?? "--",
      duration: routes.fastest_route?.eta_mins ?? "--",
      dangerIndex: safetyToDangerIndex(routes.fastest_route?.safety_score ?? 3.5),
    },
  ];
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        fontSize: "0.75rem", color: "var(--text-primary)",
      }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
            {["#", "Route", "Color", "Distance", "Duration", "Danger Index"].map(h => (
              <th key={h} style={{
                padding: "6px 8px", textAlign: "left",
                color: "var(--text-muted)", fontWeight: 600,
                fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.05em",
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.num} style={{
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              transition: "background 0.15s",
            }}>
              <td style={{ padding: "9px 8px", fontWeight: 800, color: "var(--text-muted)" }}>{r.num}</td>
              <td style={{ padding: "9px 8px", fontWeight: 600 }}>{r.routeName}</td>
              <td style={{ padding: "9px 8px" }}>
                <span style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                }}>
                  <span style={{
                    display: "inline-block", width: 10, height: 10,
                    borderRadius: "50%", background: r.color,
                    boxShadow: `0 0 6px ${r.color}`,
                  }} />
                  {r.colorName}
                </span>
              </td>
              <td style={{ padding: "9px 8px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.distance} km</td>
              <td style={{ padding: "9px 8px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.duration} min</td>
              <td style={{ padding: "9px 8px" }}><DangerBadge index={r.dangerIndex} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LegendModal({ onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "rgba(15,23,42,0.98)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 18, padding: 24, maxWidth: 400, width: "90%",
        boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "#f8fafc" }}>
            Danger Index Legend
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: 16 }}>
          K-Means clustering of NCRB crime data assigns a danger index (0 = safest, 4 = most dangerous) to each path.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DANGER_LEVELS.map(lvl => (
            <div key={lvl.mag} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: lvl.bg, border: `1px solid ${lvl.color}30`,
              borderRadius: 10, padding: "10px 14px",
            }}>
              <DangerCircle index={lvl.mag} />
              <div>
                <div style={{ fontWeight: 700, color: lvl.color, fontSize: "0.82rem" }}>
                  Index {lvl.mag}: {lvl.label}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginTop: 2 }}>{lvl.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SafePathPanel({ routes }) {
  const [showLegend, setShowLegend] = useState(false);

  return (
    <>
      {showLegend && <LegendModal onClose={() => setShowLegend(false)} />}

      <div className="panel-card safepath-panel" style={{
        background: "linear-gradient(135deg, rgba(34,197,94,0.06), rgba(15,23,42,0.9))",
        border: "1px solid rgba(34,197,94,0.2)",
      }}>
        <div className="section-header" style={{ marginBottom: 10 }}>
          <span className="section-title">
            <BarChart3 size={15} color="#22c55e" /> Danger Index — Route Safety
          </span>
          <button
            onClick={() => setShowLegend(true)}
            title="View Legend"
            style={{
              background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
              borderRadius: 8, padding: "3px 10px", cursor: "pointer",
              color: "#22c55e", fontSize: "0.68rem", fontWeight: 700,
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <Info size={11} /> Legend
          </button>
        </div>

        <p style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: 12, lineHeight: 1.55 }}>
          K-Means clustering on NCRB crime data assigns a danger index (0–4) to each route.
          Choose the path with the lowest danger index for safe travel.
        </p>

        {routes ? (
          <RouteComparisonTable routes={routes} />
        ) : (
          <div style={{
            textAlign: "center", padding: "16px 8px",
            color: "#334155", fontSize: "0.75rem",
            border: "1px dashed rgba(34,197,94,0.2)", borderRadius: 10,
          }}>
            <BarChart3 size={22} style={{ margin: "0 auto 6px", display: "block", opacity: 0.35 }} />
            Calculate a route to compare danger indices
          </div>
        )}

        {/* Marker legend row */}
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {DANGER_LEVELS.map(lvl => (
            <span key={lvl.mag} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: "0.64rem", padding: "3px 8px", borderRadius: 20,
              background: lvl.bg, color: lvl.color, fontWeight: 700,
              border: `1px solid ${lvl.color}25`,
            }}>
              <span style={{
                width: 14, height: 14, borderRadius: "50%",
                background: `${lvl.color}25`, border: `1.5px solid ${lvl.color}`,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: "0.5rem", fontWeight: 800,
              }}>{lvl.symbol}</span>
              {lvl.label}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
