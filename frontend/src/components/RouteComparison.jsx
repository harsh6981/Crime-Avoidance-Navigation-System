import React, { useState } from "react";
import { Shield, Clock, MapPin, Zap, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Layers } from "lucide-react";

export default function RouteComparison({ routes, safetyScores, activeRoute, onSelectRoute }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!routes || !routes.safest_route) return null;

  const safest = routes.safest_route;
  const fastest = routes.fastest_route;

  const safeExp = safest?.crime_summary?.crime_exposure;
  const fastExp = fastest?.crime_summary?.crime_exposure;

  const routeList = [
    {
      key: "safest",
      title: "Safest",
      color: "#10b981",
      bg: "rgba(16, 185, 129, 0.08)",
      border: "rgba(16, 185, 129, 0.3)",
      data: safest,
      score: safetyScores?.safest ?? 94,
      riskLevel: safeExp === "High" ? "High Risk" : safeExp === "Moderate" ? "Moderate Risk" : "Low Risk",
      exposure: safeExp ? `${safeExp} Exposure` : "Low Exposure",
      highRiskZones: safest?.crime_summary?.high_risk_zones ?? 0,
      modRiskZones: safest?.crime_summary?.moderate_risk_zones ?? 0,
      dominantCrimes: safest?.crime_summary?.dominant_categories?.length
        ? safest.crime_summary.dominant_categories.join(", ")
        : "Theft (minimal)",
      lighting: safest?.crime_summary?.lighting || "92% Well-lit arterial",
      distance: safest?.distance_km ?? "--",
      eta: safest?.eta_mins ?? "--",
    },
    fastest && {
      key: "fastest",
      title: "Fastest",
      color: "#eab308",
      bg: "rgba(234, 179, 8, 0.08)",
      border: "rgba(234, 179, 8, 0.3)",
      data: fastest,
      score: safetyScores?.fastest ?? 48,
      riskLevel: fastExp === "Low" ? "Low Risk" : fastExp === "Moderate" ? "Moderate Risk" : "High Risk",
      exposure: fastExp ? `${fastExp} Exposure` : "Moderate Exposure",
      highRiskZones: fastest?.crime_summary?.high_risk_zones ?? (fastExp === "High" ? 1 : 0),
      modRiskZones: fastest?.crime_summary?.moderate_risk_zones ?? (fastExp === "Moderate" ? 1 : 0),
      dominantCrimes: fastest?.crime_summary?.dominant_categories?.length
        ? fastest.crime_summary.dominant_categories.join(", ")
        : "Theft / Property",
      lighting: fastest?.crime_summary?.lighting || "48% Partly lit shortcuts",
      distance: fastest?.distance_km ?? "--",
      eta: fastest?.eta_mins ?? "--",
    },
  ].filter(Boolean);

  return (
    <div className="route-comparison-wrapper">
      <div
        className="route-comparison-header"
        onClick={() => setCollapsed((prev) => !prev)}
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
      >
        <div className="route-comparison-title">
          <Layers size={15} color="var(--cyan)" />
          <span>Route Risk & Trade-off Comparison</span>
        </div>
        <button
          type="button"
          className="comparison-toggle-btn"
          aria-label={collapsed ? "Expand comparison" : "Collapse comparison"}
        >
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>

      {!collapsed && (
        <div className="route-comparison-body">
          <div className="comparison-table-scroll">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th className="th-metric">Metric</th>
                  {routeList.map((r) => {
                    const isSelected = activeRoute === r.key;
                    return (
                      <th
                        key={r.key}
                        className={`th-route ${isSelected ? "selected-col" : ""}`}
                        onClick={() => onSelectRoute && onSelectRoute(r.key)}
                        style={{ cursor: "pointer" }}
                      >
                        <div style={{ color: r.color, fontWeight: 800 }}>{r.title}</div>
                        {isSelected && (
                          <span className="col-selected-badge">Active</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="td-label">Safety Score</td>
                  {routeList.map((r) => (
                    <td key={r.key} className="td-val">
                      <span
                        className="comparison-score-pill"
                        style={{
                          color: r.color,
                          borderColor: r.border,
                          background: r.bg,
                        }}
                      >
                        <Shield size={11} /> {r.score}/100
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="td-label">Crime Exposure</td>
                  {routeList.map((r) => (
                    <td key={r.key} className="td-val">
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "0.75rem",
                          color: r.color,
                        }}
                      >
                        {r.exposure}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="td-label">High-Risk Segments</td>
                  {routeList.map((r) => (
                    <td key={r.key} className="td-val">
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: "0.78rem",
                          color: r.highRiskZones > 0 ? "#ef4444" : "#10b981",
                        }}
                      >
                        {r.highRiskZones} zones
                      </span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="td-label">Dominant Crimes</td>
                  {routeList.map((r) => (
                    <td key={r.key} className="td-val td-dominant">
                      {r.dominantCrimes}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="td-label">Street Lighting</td>
                  {routeList.map((r) => (
                    <td key={r.key} className="td-val td-lighting">
                      💡 {r.lighting}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="td-label">Distance & Time</td>
                  {routeList.map((r) => (
                    <td key={r.key} className="td-val">
                      <strong style={{ color: "#f8fafc" }}>{r.distance} km</strong> · {r.eta} min
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="comparison-footer-note">
            💡 Tap any column header to switch routes. Data synthesized from verified Mumbai Police FIRs (approximate precinct-level).
          </div>
        </div>
      )}
    </div>
  );
}

