import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  BarChart3, Shield, Map, AlertTriangle, TrendingUp,
  MapPin, Database, Info, RefreshCw, CheckCircle2,
  Calendar, FileText, Filter, ArrowUpRight, Scale, PieChart
} from "lucide-react";
import { BACKEND_URL } from "../config/api";
import { cachedFetch } from "../utils/apiCache";

// Spatial crime category colors
const CRIME_COLORS = {
  "murder": "#ef4444",
  "rape": "#dc2626",
  "robbery": "#f97316",
  "burglary": "#fb923c",
  "theft": "#f59e0b",
  "assault": "#eab308",
  "kidnapping": "#84cc16",
  "fraud": "#22c55e",
  "cheating": "#10b981",
  "extortion": "#06b6d4",
  "default": "#64748b",
};

function getRiskColor(label = "") {
  if (label.includes("High")) return "#ef4444";
  if (label.includes("Mod")) return "#f97316";
  return "#22c55e";
}

// ─────────────────────────────────────────────────────────────────────────────
//  YEARLY CRIME TRENDS BAR CHART (Interactive)
// ─────────────────────────────────────────────────────────────────────────────
function YearlyCrimeChart({ yearlyTrends, selectedYear, onSelectYear }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!yearlyTrends || yearlyTrends.length === 0) {
    return <div style={{ color: "#64748b", fontSize: "0.72rem", padding: "16px 0", textAlign: "center" }}>No yearly data available for this range.</div>;
  }

  const maxVal = Math.max(...yearlyTrends.map(y => Math.max(y.registered || 0, y.detected || 0)), 1);
  const chartHeight = 160;
  const paddingX = 25;
  const paddingY = 25;
  const usableWidth = 460;
  const barGroupWidth = usableWidth / yearlyTrends.length;
  const singleBarWidth = Math.min(16, barGroupWidth * 0.35);

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        viewBox={`0 0 ${usableWidth + paddingX * 2} ${chartHeight + paddingY * 2}`}
        style={{ width: "100%", height: "auto", overflow: "visible" }}
      >
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
          const yPos = paddingY + chartHeight * (1 - pct);
          const labelVal = Math.round((maxVal * pct) / 1000);
          return (
            <g key={idx}>
              <line
                x1={paddingX}
                y1={yPos}
                x2={paddingX + usableWidth}
                y2={yPos}
                stroke="rgba(255,255,255,0.06)"
                strokeDasharray="4,4"
              />
              <text
                x={paddingX - 4}
                y={yPos + 3}
                fill="#64748b"
                fontSize="8"
                textAnchor="end"
              >
                {labelVal}k
              </text>
            </g>
          );
        })}

        {/* Bars for each year */}
        {yearlyTrends.map((y, idx) => {
          const isSelected = selectedYear === y.year;
          const isHovered = hoveredIdx === idx;
          const groupCenterX = paddingX + idx * barGroupWidth + barGroupWidth / 2;
          const regBarHeight = Math.max(4, (y.registered / maxVal) * chartHeight);
          const detBarHeight = Math.max(4, (y.detected / maxVal) * chartHeight);
          const regX = groupCenterX - singleBarWidth - 2;
          const detX = groupCenterX + 2;
          const regY = paddingY + chartHeight - regBarHeight;
          const detY = paddingY + chartHeight - detBarHeight;

          return (
            <g
              key={y.year}
              onClick={() => onSelectYear(isSelected ? null : y.year)}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Highlight background when selected */}
              {isSelected && (
                <rect
                  x={groupCenterX - barGroupWidth / 2 + 2}
                  y={paddingY}
                  width={barGroupWidth - 4}
                  height={chartHeight}
                  fill="rgba(0, 212, 255, 0.08)"
                  rx={4}
                  stroke="rgba(0, 212, 255, 0.25)"
                />
              )}

              {/* Registered Bar (Cyan) */}
              <rect
                x={regX}
                y={regY}
                width={singleBarWidth}
                height={regBarHeight}
                rx={3}
                fill={isSelected ? "#00d4ff" : "rgba(0, 212, 255, 0.8)"}
                filter={isSelected || isHovered ? "drop-shadow(0 0 6px #00d4ff)" : undefined}
                className="chart-interactive-bar"
              />

              {/* Detected Bar (Emerald) */}
              <rect
                x={detX}
                y={detY}
                width={singleBarWidth}
                height={detBarHeight}
                rx={3}
                fill={isSelected ? "#10b981" : "rgba(16, 185, 129, 0.85)"}
                filter={isSelected || isHovered ? "drop-shadow(0 0 6px #10b981)" : undefined}
                className="chart-interactive-bar"
              />

              {/* Year Label */}
              <text
                x={groupCenterX}
                y={paddingY + chartHeight + 15}
                fill={isSelected ? "var(--cyan)" : isHovered ? "#fff" : "#94a3b8"}
                fontSize={isSelected ? "10" : "9"}
                fontWeight={isSelected ? "700" : "500"}
                textAnchor="middle"
              >
                {y.year}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Floating Tooltip */}
      {hoveredIdx !== null && yearlyTrends[hoveredIdx] && (
        <div
          className="chart-tooltip-box"
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div style={{ fontWeight: 800, color: "var(--cyan)" }}>Year {yearlyTrends[hoveredIdx].year}</div>
          <div style={{ fontSize: "0.68rem" }}>
            <span style={{ color: "var(--cyan)" }}>● Registered:</span> {yearlyTrends[hoveredIdx].registered?.toLocaleString()}
          </div>
          <div style={{ fontSize: "0.68rem" }}>
            <span style={{ color: "#10b981" }}>● Detected:</span> {yearlyTrends[hoveredIdx].detected?.toLocaleString()}
          </div>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#f59e0b" }}>
            Clearance Rate: {yearlyTrends[hoveredIdx].detection_rate}%
          </div>
        </div>
      )}

      {/* Year Selector Pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8, justifyContent: "center" }}>
        {yearlyTrends.map(y => (
          <button
            key={y.year}
            onClick={() => onSelectYear(selectedYear === y.year ? null : y.year)}
            style={{
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: "0.64rem",
              fontWeight: 600,
              cursor: "pointer",
              border: selectedYear === y.year ? "1px solid var(--cyan)" : "1px solid rgba(255,255,255,0.08)",
              background: selectedYear === y.year ? "rgba(0,212,255,0.2)" : "rgba(255,255,255,0.03)",
              color: selectedYear === y.year ? "var(--cyan)" : "#94a3b8",
            }}
          >
            {y.year}
          </button>
        ))}
      </div>

      {/* Selected Year Detail Card */}
      {selectedYear && (() => {
        const item = yearlyTrends.find(y => y.year === selectedYear);
        if (!item) return null;
        return (
          <div style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: "rgba(0, 212, 255, 0.06)",
            border: "1px solid rgba(0, 212, 255, 0.2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <div style={{ fontSize: "0.74rem", fontWeight: 800, color: "var(--cyan)" }}>
                Selected Year: {item.year}
              </div>
              <div style={{ fontSize: "0.66rem", color: "#94a3b8" }}>
                {item.months_counted} recorded monthly reports
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.68rem" }}>
              <div style={{ color: "#fff" }}>
                <strong>{item.registered?.toLocaleString()}</strong> reg · <strong style={{ color: "#10b981" }}>{item.detected?.toLocaleString()}</strong> det
              </div>
              <span style={{
                fontSize: "0.62rem",
                padding: "1px 6px",
                borderRadius: 4,
                background: "rgba(16,185,129,0.18)",
                color: "#10b981",
                fontWeight: 700,
                border: "1px solid rgba(16,185,129,0.3)"
              }}>
                {item.detection_rate}% Clearance
              </span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MONTHLY CRIME TRENDS LINE CHART (Interactive)
// ─────────────────────────────────────────────────────────────────────────────
function MonthlyLineChart({ monthlyTimeline }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const containerRef = useRef(null);

  if (!monthlyTimeline || monthlyTimeline.length === 0) {
    return <div style={{ color: "#64748b", fontSize: "0.72rem", padding: "16px 0", textAlign: "center" }}>No monthly records found for this period.</div>;
  }

  const chartW = 500;
  const chartH = 150;
  const padL = 35;
  const padR = 15;
  const padT = 20;
  const padB = 25;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const maxVal = Math.max(...monthlyTimeline.map(m => Math.max(m.registered || 0, m.detected || 0)), 1);

  // Generate coordinate points for lines
  const points = monthlyTimeline.map((m, idx) => {
    const x = padL + (idx / Math.max(1, monthlyTimeline.length - 1)) * innerW;
    const yReg = padT + innerH - ((m.registered || 0) / maxVal) * innerH;
    const yDet = padT + innerH - ((m.detected || 0) / maxVal) * innerH;
    return { x, yReg, yDet, data: m };
  });

  const regPathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.yReg.toFixed(1)}`).join(" ");
  const detPathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.yDet.toFixed(1)}`).join(" ");
  const regAreaD = `${regPathD} L ${points[points.length - 1].x.toFixed(1)} ${padT + innerH} L ${points[0].x.toFixed(1)} ${padT + innerH} Z`;
  const detAreaD = `${detPathD} L ${points[points.length - 1].x.toFixed(1)} ${padT + innerH} L ${points[0].x.toFixed(1)} ${padT + innerH} Z`;

  // Handle pointer tracking
  const handlePointerMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const relX = (clientX - rect.left) / rect.width * chartW;
    const clampedX = Math.max(padL, Math.min(chartW - padR, relX));
    const ratio = (clampedX - padL) / innerW;
    const nearestIdx = Math.round(ratio * (monthlyTimeline.length - 1));
    setHoverIndex(nearestIdx);
  };

  const activePoint = hoverIndex !== null && points[hoverIndex] ? points[hoverIndex] : null;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", userSelect: "none" }}
      onMouseMove={handlePointerMove}
      onMouseLeave={() => setHoverIndex(null)}
      onTouchMove={handlePointerMove}
      onTouchEnd={() => setHoverIndex(null)}
    >
      <svg
        viewBox={`0 0 ${chartW} ${chartH}`}
        style={{ width: "100%", height: "auto", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="detGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal gridlines */}
        {[0, 0.5, 1].map((pct, idx) => {
          const y = padT + innerH * (1 - pct);
          const labelVal = Math.round((maxVal * pct) / 1000);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3,3" />
              <text x={padL - 4} y={y + 3} fill="#64748b" fontSize="8" textAnchor="end">{labelVal}k</text>
            </g>
          );
        })}

        {/* Gradient Area Fills */}
        <path d={regAreaD} fill="url(#regGrad)" />
        <path d={detAreaD} fill="url(#detGrad)" />

        {/* Lines */}
        <path d={regPathD} fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d={detPathD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Key date labels on X axis */}
        {points.map((p, i) => {
          const step = Math.max(1, Math.floor(points.length / 5));
          if (i % step !== 0 && i !== points.length - 1) return null;
          return (
            <text
              key={i}
              x={p.x}
              y={chartH - 8}
              fill="#64748b"
              fontSize="8"
              textAnchor="middle"
            >
              {p.data.month}
            </text>
          );
        })}

        {/* Interactive Crosshair & Cursor Dots */}
        {activePoint && (
          <g>
            <line
              x1={activePoint.x}
              y1={padT}
              x2={activePoint.x}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.4)"
              strokeDasharray="2,2"
              strokeWidth="1"
            />
            {/* Registered Point */}
            <circle cx={activePoint.x} cy={activePoint.yReg} r="4.5" fill="#00d4ff" stroke="#0a1020" strokeWidth="1.5" />
            {/* Detected Point */}
            <circle cx={activePoint.x} cy={activePoint.yDet} r="4.5" fill="#10b981" stroke="#0a1020" strokeWidth="1.5" />
          </g>
        )}
      </svg>

      {/* Floating Hover Tooltip */}
      {activePoint && (
        <div
          className="chart-tooltip-box"
          style={{
            position: "absolute",
            top: 5,
            left: `${Math.min(75, Math.max(25, (activePoint.x / chartW) * 100))}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 2 }}>
            Month: {activePoint.data.month}
          </div>
          <div style={{ color: "var(--cyan)" }}>
            ● Registered: <strong>{activePoint.data.registered?.toLocaleString()}</strong>
          </div>
          <div style={{ color: "#10b981" }}>
            ● Detected: <strong>{activePoint.data.detected?.toLocaleString()}</strong>
          </div>
          <div style={{ color: "#f59e0b", fontWeight: 700, marginTop: 1 }}>
            Clearance: {activePoint.data.detection_rate}%
          </div>
        </div>
      )}

      {/* Line Legend */}
      <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 4, fontSize: "0.68rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--cyan)" }}>
          <span style={{ width: 12, height: 3, background: "var(--cyan)", borderRadius: 2 }} />
          Registered Cases
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#10b981" }}>
          <span style={{ width: 12, height: 3, background: "#10b981", borderRadius: 2 }} />
          Detected / Solved
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  CRIME CATEGORY HORIZONTAL BAR CHART & INSPECTOR
// ─────────────────────────────────────────────────────────────────────────────
function CategoryBarChart({ categories, selectedCategory, onSelectCategory }) {
  if (!categories || categories.length === 0) {
    return <div style={{ color: "#64748b", fontSize: "0.72rem", padding: "16px 0", textAlign: "center" }}>No categories recorded for this filter.</div>;
  }

  const maxVal = Math.max(...categories.map(c => c.registered || 1), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {categories.slice(0, 10).map((cat, idx) => {
        const isSelected = selectedCategory === cat.crime_name;
        const regWidth = Math.max(5, Math.round((cat.registered / maxVal) * 100));
        const rateColor = cat.detection_rate >= 80 ? "#10b981" : cat.detection_rate >= 50 ? "#f59e0b" : "#ef4444";

        return (
          <div
            key={idx}
            onClick={() => onSelectCategory(isSelected ? null : cat.crime_name)}
            style={{
              padding: "6px 8px",
              borderRadius: 8,
              background: isSelected ? "rgba(0, 212, 255, 0.08)" : "rgba(255,255,255,0.02)",
              border: isSelected ? "1px solid var(--cyan)" : "1px solid rgba(255,255,255,0.04)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            title="Click to view detailed detection statistics for this category"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <span style={{ fontSize: "0.72rem", fontWeight: isSelected ? 700 : 500, color: isSelected ? "var(--cyan)" : "#e2e8f0" }}>
                {cat.crime_name}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.65rem", color: "#94a3b8" }}>
                  {cat.registered?.toLocaleString()}
                </span>
                <span style={{
                  fontSize: "0.60rem",
                  padding: "1px 5px",
                  borderRadius: 4,
                  background: `${rateColor}20`,
                  color: rateColor,
                  fontWeight: 700,
                  border: `1px solid ${rateColor}35`
                }}>
                  {cat.detection_rate}% Solved
                </span>
              </div>
            </div>

            {/* Dual visual bar: Registered total width, Detected fill */}
            <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden", position: "relative" }}>
              <div
                style={{
                  width: `${regWidth}%`,
                  height: "100%",
                  background: "rgba(0, 212, 255, 0.35)",
                  borderRadius: 3,
                  position: "relative",
                }}
              >
                {/* Detected overlay inside the registered width */}
                <div
                  style={{
                    width: `${Math.min(100, cat.detection_rate)}%`,
                    height: "100%",
                    background: rateColor,
                    borderRadius: 3,
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}

      {/* Selected Category Inspector Card */}
      {selectedCategory && (() => {
        const cat = categories.find(c => c.crime_name === selectedCategory);
        if (!cat) return null;
        const unsolved = Math.max(0, cat.registered - cat.detected);
        const rateColor = cat.detection_rate >= 80 ? "#10b981" : cat.detection_rate >= 50 ? "#f59e0b" : "#ef4444";
        const performance = cat.detection_rate >= 80 ? "High Clearance Efficiency" : cat.detection_rate >= 50 ? "Moderate Detection Rate" : "Low Clearance / Property Crime";

        return (
          <div style={{
            marginTop: 6,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(0, 212, 255, 0.07)",
            border: "1px solid rgba(0, 212, 255, 0.25)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--cyan)" }}>
                {cat.crime_name}
              </div>
              <span style={{ fontSize: "0.62rem", padding: "2px 6px", borderRadius: 4, background: `${rateColor}22`, color: rateColor, fontWeight: 700 }}>
                {performance}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: "0.68rem" }}>
              <div style={{ background: "rgba(0,0,0,0.2)", padding: 6, borderRadius: 6 }}>
                <span style={{ color: "#94a3b8" }}>Registered Cases:</span>
                <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "var(--cyan)", marginTop: 2 }}>
                  {cat.registered?.toLocaleString()}
                </div>
              </div>
              <div style={{ background: "rgba(0,0,0,0.2)", padding: 6, borderRadius: 6 }}>
                <span style={{ color: "#94a3b8" }}>Detected / Solved:</span>
                <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#10b981", marginTop: 2 }}>
                  {cat.detected?.toLocaleString()} ({cat.detection_rate}%)
                </div>
              </div>
            </div>

            <div style={{ marginTop: 6, fontSize: "0.66rem", color: "#cbd5e1" }}>
              • Share of Period Crime: <strong>{cat.share_of_total}%</strong> · Unresolved: <strong>{unsolved.toLocaleString()}</strong>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  REGISTERED VS DETECTED CIRCULAR CLEARANCE GAUGE
// ─────────────────────────────────────────────────────────────────────────────
function RegisteredVsDetectedComparison({ totalRegistered, totalDetected, detectionRate }) {
  const reg = totalRegistered || 0;
  const det = totalDetected || 0;
  const unsolved = Math.max(0, reg - det);
  const rate = detectionRate != null ? detectionRate : (reg > 0 ? (det / reg * 100) : 0);

  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const strokeDashoffset = circ - (Math.min(100, rate) / 100) * circ;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 4px" }}>
      {/* Donut Chart SVG */}
      <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
        <svg viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)", width: "100%", height: "100%" }}>
          {/* Background circle (unsolved) */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.08)"
            strokeWidth="10"
          />
          {/* Detected arc (emerald) */}
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#10b981"
            strokeWidth="10"
            strokeDasharray={circ}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        {/* Center label */}
        <div style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#10b981", lineHeight: 1 }}>
            {rate.toFixed ? rate.toFixed(1) : rate}%
          </div>
          <div style={{ fontSize: "0.55rem", color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".04em", marginTop: 2 }}>
            Clearance
          </div>
        </div>
      </div>

      {/* Side Legend & Numbers */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#10b981", fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981" }} />
            Detected Cases
          </span>
          <strong style={{ color: "#fff" }}>{det.toLocaleString()}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.72rem" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--cyan)", fontWeight: 700 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--cyan)" }} />
            Total Registered
          </span>
          <strong style={{ color: "#fff" }}>{reg.toLocaleString()}</strong>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.68rem" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, color: "#94a3b8" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255,255,255,0.2)" }} />
            Pending / Unsolved
          </span>
          <span style={{ color: "#cbd5e1" }}>{unsolved.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN ANALYTICS DASHBOARD COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function AnalyticsDashboard({ onSelectCluster }) {
  // Spatial and road safety statistics
  const [stats, setStats] = useState(null);
  const [clusters, setClusters] = useState([]);

  // Citywide aggregate crime statistics
  const [cityStats, setCityStats] = useState(null);
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("2018-01-01");
  const [customEnd, setCustomEnd] = useState("2025-11-01");
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [cityStatsLoading, setCityStatsLoading] = useState(false);

  // Selected filters inside charts
  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Tab switcher: "mumbai_stats" | "spatial" | "all"
  const [activeTab, setActiveTab] = useState("mumbai_stats");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  // Fetch full data with optional date parameters
  async function fetchAllData(filter = dateFilter, start = customStart, end = customEnd) {
    setLoading(true);
    setError(null);
    try {
      let dateQuery = "";
      if (filter === "2023-2025") dateQuery = "?start_date=2023-01-01&end_date=2025-12-31";
      else if (filter === "2020-2022") dateQuery = "?start_date=2020-01-01&end_date=2022-12-31";
      else if (filter === "2018-2019") dateQuery = "?start_date=2018-01-01&end_date=2019-12-31";
      else if (filter === "custom" && start && end) dateQuery = `?start_date=${start}&end_date=${end}`;

      const [statsData, clustersRaw, cityData] = await Promise.all([
        cachedFetch(`${BACKEND_URL}/api/analytics/summary`, {}, 120000).catch(() => null),
        cachedFetch(`${BACKEND_URL}/api/crime-clusters`, {}, 300000).catch(() => null),
        cachedFetch(`${BACKEND_URL}/api/crime-statistics/summary${dateQuery}`, {}, 120000).catch(() => null),
      ]);

      const clustersData = Array.isArray(clustersRaw) ? clustersRaw : (clustersRaw?.clusters || []);

      setStats(statsData);
      setClusters(clustersData.slice(0, 9));
      setCityStats(cityData);
      setLastFetched(new Date());
    } catch (err) {
      setError("Could not load analytics. Backend may be offline.");
    } finally {
      setLoading(false);
    }
  }

  // Update only city stats when filter pill is pressed
  async function applyFilter(filter, start = customStart, end = customEnd) {
    setDateFilter(filter);
    if (filter === "custom") {
      setShowCustomRange(true);
    } else {
      setShowCustomRange(false);
    }

    setCityStatsLoading(true);
    try {
      let dateQuery = "";
      if (filter === "2023-2025") dateQuery = "?start_date=2023-01-01&end_date=2025-12-31";
      else if (filter === "2020-2022") dateQuery = "?start_date=2020-01-01&end_date=2022-12-31";
      else if (filter === "2018-2019") dateQuery = "?start_date=2018-01-01&end_date=2019-12-31";
      else if (filter === "custom" && start && end) dateQuery = `?start_date=${start}&end_date=${end}`;

      const data = await cachedFetch(`${BACKEND_URL}/api/crime-statistics/summary${dateQuery}`, {}, 120000);
      if (data) {
        setCityStats(data);
      }
    } catch (e) {
      console.warn("Filter fetch error:", e);
    } finally {
      setCityStatsLoading(false);
    }
  }

  useEffect(() => {
    fetchAllData();
  }, []);

  // Spatial data
  const crimeCategories = stats?.crime_categories || [];
  const totalCrimes = crimeCategories.reduce((s, c) => s + (c.count || 0), 0) || stats?.total_crimes || 0;
  const riskDistribution = stats?.risk_distribution || [
    { label: "High Risk", count: stats?.high_risk_roads || 0 },
    { label: "Moderate Risk", count: stats?.moderate_risk_roads || 0 },
    { label: "Low Risk", count: stats?.safe_roads || 0 },
  ];
  const totalRoads = riskDistribution.reduce((s, r) => s + r.count, 0) || stats?.total_road_edges || 0;

  // Citywide data
  const overview = cityStats?.overview || {};
  const yearlyTrends = cityStats?.yearly_trends || [];
  const monthlyTimeline = cityStats?.monthly_timeline || [];
  const topCategories = cityStats?.top_categories || [];

  if (loading) {
    return (
      <div className="analytics-tab" style={{ alignItems: "center", justifyContent: "center", minHeight: 320 }}>
        <div style={{ textAlign: "center", color: "var(--text-3)" }}>
          <RefreshCw size={28} style={{ display: "block", margin: "0 auto 10px", opacity: .5, animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: ".8rem" }}>Loading SafePath Safety Analytics…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="analytics-tab">
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: ".74rem", fontWeight: 800, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".06em" }}>
            SafePath Safety Analytics
          </div>
          <div style={{ fontSize: ".64rem", color: "#64748b" }}>
            Citywide Police Records & Spatial Road Risk Intelligence
          </div>
        </div>
        <button
          onClick={() => fetchAllData(dateFilter)}
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--text-2)",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: ".66rem",
          }}
          title="Refresh All Analytics"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,.1)", border: "1px solid rgba(239,68,68,.2)", color: "var(--red)", fontSize: ".74rem", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* Primary Tab Switcher */}
      <div style={{
        display: "flex",
        gap: 4,
        marginBottom: 10,
        background: "rgba(255,255,255,0.03)",
        padding: 3,
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <button
          onClick={() => setActiveTab("mumbai_stats")}
          style={{
            flex: 1.2,
            padding: "6px 8px",
            borderRadius: 7,
            border: "none",
            background: activeTab === "mumbai_stats" ? "rgba(0,212,255,0.18)" : "transparent",
            color: activeTab === "mumbai_stats" ? "var(--cyan)" : "#94a3b8",
            fontWeight: activeTab === "mumbai_stats" ? 700 : 500,
            fontSize: "0.68rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            transition: "all 0.15s ease",
          }}
        >
          <Scale size={13} /> Mumbai Crime Statistics (2018–2025)
        </button>

        <button
          onClick={() => setActiveTab("spatial")}
          style={{
            flex: 0.9,
            padding: "6px 8px",
            borderRadius: 7,
            border: "none",
            background: activeTab === "spatial" ? "rgba(0,212,255,0.18)" : "transparent",
            color: activeTab === "spatial" ? "var(--cyan)" : "#94a3b8",
            fontWeight: activeTab === "spatial" ? 700 : 500,
            fontSize: "0.68rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 5,
            transition: "all 0.15s ease",
          }}
        >
          <Map size={13} /> Road & Clusters
        </button>

        <button
          onClick={() => setActiveTab("all")}
          style={{
            flex: 0.6,
            padding: "6px 6px",
            borderRadius: 7,
            border: "none",
            background: activeTab === "all" ? "rgba(0,212,255,0.18)" : "transparent",
            color: activeTab === "all" ? "var(--cyan)" : "#94a3b8",
            fontWeight: activeTab === "all" ? 700 : 500,
            fontSize: "0.68rem",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          Overview
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 1: MUMBAI CRIME STATISTICS (2018–2025)
      ══════════════════════════════════════════════════════════════════════════ */}
      {(activeTab === "mumbai_stats" || activeTab === "all") && (
        <div className="mumbai-stats-container">
          {/* Non-Geographical Notice Banner */}
          <div style={{
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(0,212,255,0.05)",
            border: "1px solid rgba(0,212,255,0.18)",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "var(--cyan)", fontSize: "0.78rem" }}>
                <Scale size={14} /> Mumbai Citywide Crime Statistics
              </div>
              <span style={{ fontSize: "0.60rem", padding: "1px 6px", borderRadius: 4, background: "rgba(0,212,255,0.15)", color: "var(--cyan)", fontWeight: 700 }}>
                Citywide Aggregate
              </span>
            </div>
            <div style={{ fontSize: "0.68rem", color: "#94a3b8", lineHeight: 1.35 }}>
              ⚠️ <strong>Non-Geographical Law Enforcement Data:</strong> Aggregated IPC reports from Mumbai Police records (Dec 2017 – Nov 2025). These citywide figures are <strong>not mapped to geographical road coordinates</strong> and are <strong>not used for routing safety calculations</strong>.
            </div>
          </div>

          {/* Date Range Filter Bar */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <Filter size={12} color="#94a3b8" />
              <span style={{ fontSize: "0.66rem", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".05em" }}>
                Filter Period:
              </span>
            </div>
            <div style={{ display: "flex", gap: 5, overflowX: "auto", paddingBottom: 4 }}>
              {[
                { id: "all", label: "All time" },
                { id: "2018-2019", label: "2018–2019" },
                { id: "2020-2022", label: "2020–2022" },
                { id: "2023-2025", label: "2023–2025" },
                { id: "custom", label: "Custom range" },
              ].map(btn => (
                <button
                  key={btn.id}
                  onClick={() => applyFilter(btn.id)}
                  className={`date-filter-pill ${dateFilter === btn.id ? "active" : ""}`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Custom Date Range Picker */}
            {showCustomRange && (
              <div className="custom-date-inputs">
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: "0.66rem", color: "#94a3b8" }}>From:</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="custom-date-field"
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: "0.66rem", color: "#94a3b8" }}>To:</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="custom-date-field"
                  />
                </div>
                <button
                  onClick={() => applyFilter("custom", customStart, customEnd)}
                  className="custom-date-btn"
                >
                  Apply
                </button>
              </div>
            )}
          </div>

          {/* KPI Cards (All 4 update live with filter) */}
          <div className="stat-grid" style={{ opacity: cityStatsLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
            <StatCard
              icon={<Database size={15} />}
              iconBg="rgba(0,212,255,.14)"
              iconColor="var(--cyan)"
              value={overview?.total_registered != null ? overview.total_registered.toLocaleString() : "567,343"}
              label="Total Registered Cases"
            />
            <StatCard
              icon={<CheckCircle2 size={15} />}
              iconBg="rgba(16,185,129,.14)"
              iconColor="#10b981"
              value={overview?.total_detected != null ? overview.total_detected.toLocaleString() : "360,508"}
              label="Total Detected Cases"
            />
            <StatCard
              icon={<TrendingUp size={15} />}
              iconBg="rgba(245,158,11,.14)"
              iconColor="var(--amber)"
              value={overview?.overall_detection_rate != null ? `${overview.overall_detection_rate}%` : "63.5%"}
              label="Detection Rate"
            />
            <StatCard
              icon={<FileText size={15} />}
              iconBg="rgba(148,163,184,.14)"
              iconColor="#94a3b8"
              value={overview?.total_categories != null ? `${overview.total_categories} Categories` : "27 Categories"}
              label="Crime Categories"
            />
          </div>

          {/* Component 5: Registered vs Detected Visual Comparison */}
          <div className="panel-card">
            <div className="section-header">
              <span className="section-title">
                <PieChart size={14} color="#10b981" /> Registered vs Detected Comparison
              </span>
              <span style={{ fontSize: "0.62rem", color: "#94a3b8" }}>Citywide Clearance</span>
            </div>
            <RegisteredVsDetectedComparison
              totalRegistered={overview?.total_registered}
              totalDetected={overview?.total_detected}
              detectionRate={overview?.overall_detection_rate}
            />
          </div>

          {/* Component 2: Yearly Crime Trends (Interactive Bar Chart) */}
          <div className="panel-card">
            <div className="section-header">
              <span className="section-title">
                <Calendar size={14} color="var(--cyan)" /> Yearly Crime Trends (2018–2025)
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--cyan)" }}>Interactive Bars</span>
            </div>
            <YearlyCrimeChart
              yearlyTrends={yearlyTrends}
              selectedYear={selectedYear}
              onSelectYear={setSelectedYear}
            />
          </div>

          {/* Component 3: Monthly Crime Trends (Interactive Line Chart) */}
          <div className="panel-card">
            <div className="section-header">
              <span className="section-title">
                <TrendingUp size={14} color="var(--cyan)" /> Monthly Crime Trends (Timeline)
              </span>
              <span style={{ fontSize: "0.62rem", color: "#94a3b8" }}>{monthlyTimeline.length} Recorded Months</span>
            </div>
            <MonthlyLineChart monthlyTimeline={monthlyTimeline} />
          </div>

          {/* Component 4: Crime Category Analysis (Horizontal Bar Chart & Selector) */}
          <div className="panel-card">
            <div className="section-header">
              <span className="section-title">
                <BarChart3 size={14} color="var(--orange)" /> Crime Category Analysis
              </span>
              <span style={{ fontSize: "0.62rem", color: "var(--cyan)" }}>Tap category for details</span>
            </div>
            <CategoryBarChart
              categories={topCategories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
            />
          </div>

          {/* Data Attribution Footer */}
          <div className="analytics-disclaimer">
            <Info size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            <strong>Source Documentation:</strong> Mumbai Police Crime Statistics. Extracted from Hugging Face dataset repository (<code>mumbai_crime_statistics_2018_2025.csv</code>). 1,760 monthly records from December 2017 to November 2025. Non-geographical citywide totals.
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          TAB 2: SPATIAL ROAD NETWORK & CLUSTERS SAFETY
      ══════════════════════════════════════════════════════════════════════════ */}
      {(activeTab === "spatial" || activeTab === "all") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: activeTab === "all" ? 14 : 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, fontWeight: 700, color: "var(--cyan)", fontSize: "0.76rem", textTransform: "uppercase", letterSpacing: ".05em" }}>
            <Map size={14} /> Road Network & Spatial Crime Clusters
          </div>

          {/* Spatial Key Stats Grid */}
          <div className="stat-grid">
            <StatCard
              icon={<Database size={15} />}
              iconBg="rgba(0,212,255,.12)"
              iconColor="var(--cyan)"
              value={stats?.total_crime_records?.toLocaleString() || "16,094"}
              label="Road FIR Records"
            />
            <StatCard
              icon={<Map size={15} />}
              iconBg="rgba(34,197,94,.12)"
              iconColor="var(--green)"
              value={(stats?.road_segments_with_scores || stats?.total_road_segments || stats?.total_road_edges)?.toLocaleString() || "123,272"}
              label="Scored Road Edges"
            />
            <StatCard
              icon={<AlertTriangle size={15} />}
              iconBg="rgba(239,68,68,.12)"
              iconColor="var(--red)"
              value={stats?.total_clusters?.toLocaleString() || clusters.length.toString() || "9"}
              label="DBSCAN Clusters"
            />
            <StatCard
              icon={<TrendingUp size={15} />}
              iconBg="rgba(245,158,11,.12)"
              iconColor="var(--amber)"
              value={stats?.avg_safety_score ? (stats.avg_safety_score <= 10 ? `${(stats.avg_safety_score * 10).toFixed(0)}/100` : `${Math.round(stats.avg_safety_score)}/100`) : "59/100"}
              label="Avg Road Score"
            />
          </div>

          {/* Road Risk Distribution */}
          {totalRoads > 0 && (
            <div className="panel-card">
              <div className="section-header">
                <span className="section-title"><Shield size={14} color="var(--cyan)" /> Road Network Risk Distribution</span>
              </div>
              <div className="risk-bar-wrap">
                {riskDistribution.map((r) => {
                  const pct = totalRoads > 0 ? Math.round((r.count / totalRoads) * 100) : 0;
                  return (
                    <div key={r.label} className="risk-bar-item">
                      <span className="risk-bar-label" style={{ color: getRiskColor(r.label) }}>{r.label}</span>
                      <div className="risk-bar-track">
                        <div className="risk-bar-fill" style={{ width: `${pct}%`, background: getRiskColor(r.label) }} />
                      </div>
                      <span className="risk-bar-count">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Spatial Crime Clusters (Clickable to view FIRs) */}
          {clusters.length > 0 && (
            <div className="panel-card">
              <div className="section-header">
                <span className="section-title"><MapPin size={14} color="var(--red)" /> Spatial Clusters ({clusters.length})</span>
                <span style={{ fontSize: ".65rem", color: "var(--cyan)", fontWeight: 600 }}>Tap to view FIRs</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {clusters.slice(0, 9).map((c, i) => {
                  const risk = c.risk_score || 0;
                  const riskColor = risk > 7 ? "var(--red)" : risk > 4 ? "var(--orange)" : "var(--amber)";
                  const title = c.police_station ? `${c.police_station} Precinct` : `Cluster #${c.cluster_id ?? i + 1}`;
                  return (
                    <div
                      key={i}
                      className="cluster-badge"
                      style={{ cursor: "pointer", transition: "transform 0.15s ease, background 0.15s ease" }}
                      onClick={() => onSelectCluster && onSelectCluster(c.cluster_id)}
                      title={`Click to view detailed crime records for ${title}`}
                    >
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: riskColor, flexShrink: 0, boxShadow: `0 0 6px ${riskColor}` }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: ".74rem", fontWeight: 700, color: "var(--text)" }}>
                          {title}
                        </div>
                        <div style={{ fontSize: ".67rem", color: "var(--text-3)" }}>
                          {c.incident_count || "?"} incidents · {c.dominant_crime ? `${c.dominant_crime} · ` : ""}Risk {risk.toFixed ? risk.toFixed(1) : risk}/10
                        </div>
                      </div>
                      <span style={{ fontSize: ".65rem", padding: "2px 7px", borderRadius: 7, background: `${riskColor}18`, color: riskColor, fontWeight: 700, border: `1px solid ${riskColor}30` }}>
                        {risk > 7 ? "High" : risk > 4 ? "Med" : "Low"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Spatial Crime Categories */}
          {crimeCategories.length > 0 && (
            <div className="panel-card">
              <div className="section-header">
                <span className="section-title"><BarChart3 size={14} color="var(--orange)" /> Road Network Crime Categories</span>
              </div>
              <div className="crime-list">
                {crimeCategories.slice(0, 8).map((cat, i) => {
                  const pct = totalCrimes > 0 ? Math.round((cat.count / totalCrimes) * 100) : 0;
                  const color = CRIME_COLORS[cat.crime_type?.toLowerCase()] || CRIME_COLORS.default;
                  return (
                    <div key={i} className="crime-row">
                      <span className="crime-name" title={cat.crime_type}>{cat.crime_type}</span>
                      <div className="crime-bar">
                        <div className="crime-bar-fill" style={{ width: `${Math.max(pct, 2)}%`, background: color }} />
                      </div>
                      <span className="crime-pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Safe Havens */}
          <div className="panel-card">
            <div className="section-header">
              <span className="section-title"><Shield size={14} color="var(--green)" /> Safe Havens</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {[
                { name: "Andheri Police Station", type: "Police", color: "var(--cyan)" },
                { name: "Bandra Police Station", type: "Police", color: "var(--cyan)" },
                { name: "Cooper Hospital", type: "Hospital", color: "var(--red)" },
                { name: "Holy Family Hospital", type: "Hospital", color: "var(--red)" },
              ].map((h, i) => (
                <div key={i} className="cluster-badge">
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: h.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: ".74rem", color: "var(--text-2)" }}>{h.name}</span>
                  <span style={{ fontSize: ".65rem", padding: "1px 6px", borderRadius: 6, background: `${h.color}15`, color: h.color, fontWeight: 600 }}>{h.type}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Spatial Disclaimer */}
          <div className="analytics-disclaimer">
            <Info size={12} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
            Spatial Road Data: 15,594 records (2020–2024) from Mumbai Police FIRs mapped to road segments. 41,735 raw source FIR records preserved in staging database. Coordinates are precinct centroid approximations.
            {lastFetched && (
              <div style={{ marginTop: 4, opacity: .7 }}>
                Last updated: {lastFetched.toLocaleTimeString("en-IN")}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  REUSABLE STAT CARD
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ icon, iconBg, iconColor, value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div className="stat-value" style={{ color: iconColor }}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
