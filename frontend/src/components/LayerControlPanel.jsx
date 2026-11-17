import React, { useRef, useEffect } from "react";
import {
  Layers, Shield, Eye, Lightbulb, AlertTriangle,
  ShieldCheck, Heart, Zap, MapPin, Navigation, Car,
  Check, X, RotateCcw
} from "lucide-react";

export const LAYER_GROUPS = [
  {
    id: "safety",
    title: "Safety Intelligence",
    layers: [
      { key: "crime", label: "Crime Zones", icon: Eye, color: "#ef4444", desc: "Historical precinct risk boundaries" },
      { key: "clusters", label: "Crime Clusters", icon: Layers, color: "#f97316", desc: "DBSCAN incident density hotspots" },
      { key: "lighting", label: "Streetlights", icon: Lightbulb, color: "#fbbf24", desc: "Verified municipal street lighting" },
      { key: "hazards", label: "Active Hazards", icon: AlertTriangle, color: "#f59e0b", desc: "Community-reported road hazards" },
    ],
  },
  {
    id: "facilities",
    title: "Emergency Facilities",
    layers: [
      { key: "police", label: "Police Stations", icon: ShieldCheck, color: "#00b4d8", desc: "Verified Mumbai police stations" },
      { key: "hospital", label: "Hospitals", icon: Heart, color: "#ef4444", desc: "Public & private healthcare facilities" },
      { key: "ev", label: "EV Charging", icon: Zap, color: "#22c55e", desc: "Fast chargers & live power ratings" },
      { key: "safeHavens", label: "Safe Havens", icon: MapPin, color: "#38bdf8", desc: "24/7 verified emergency safe points" },
    ],
  },
  {
    id: "navigation",
    title: "Navigation & Roads",
    layers: [
      { key: "roads", label: "Road Network", icon: Navigation, color: "#38bdf8", desc: "Complete connected road graph" },
      { key: "traffic", label: "Live Traffic", icon: Car, color: "#00d4ff", desc: "TomTom live congestion overlay" },
    ],
  },
];

export default function LayerControlPanel({
  layerState,
  onToggleLayer,
  onResetLayers,
  isOpen,
  onClose,
}) {
  const panelRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        // Check if click was on trigger button
        const trigger = document.querySelector(".map-layer-trigger");
        if (trigger && trigger.contains(event.target)) return;
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Count active layers
  const totalLayers = LAYER_GROUPS.reduce((acc, g) => acc + g.layers.length, 0);
  const activeCount = LAYER_GROUPS.reduce(
    (acc, g) => acc + g.layers.filter((l) => layerState[l.key]).length,
    0
  );

  if (!isOpen) return null;

  return (
    <div className="layer-panel-popover" ref={panelRef} role="dialog" aria-label="Map Layer Settings">
      {/* Header */}
      <div className="layer-panel-header">
        <div className="layer-panel-title-wrap">
          <Layers size={16} color="var(--cyan)" />
          <span className="layer-panel-title">Map Layers</span>
          <span className="layer-panel-badge">{activeCount}/{totalLayers} active</span>
        </div>
        <div className="layer-panel-actions">
          {onResetLayers && (
            <button
              type="button"
              className="layer-panel-btn-text"
              onClick={onResetLayers}
              title="Reset to default layers"
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
          <button
            type="button"
            className="layer-panel-close-btn"
            onClick={onClose}
            aria-label="Close layers"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Layer Groups */}
      <div className="layer-panel-body">
        {LAYER_GROUPS.map((group) => (
          <div key={group.id} className="layer-group-section">
            <div className="layer-group-header">
              <span className="layer-group-title">{group.title}</span>
            </div>
            <div className="layer-group-items">
              {group.layers.map((layer) => {
                const isActive = Boolean(layerState[layer.key]);
                const IconComponent = layer.icon;
                return (
                  <div
                    key={layer.key}
                    className={`layer-item-row ${isActive ? "active" : ""}`}
                    onClick={() => onToggleLayer(layer.key)}
                    role="checkbox"
                    aria-checked={isActive}
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggleLayer(layer.key)}
                  >
                    <div className="layer-item-left">
                      <div
                        className="layer-item-icon-box"
                        style={{
                          backgroundColor: isActive ? `${layer.color}20` : "rgba(255,255,255,0.04)",
                          color: isActive ? layer.color : "var(--text-3)",
                          borderColor: isActive ? `${layer.color}50` : "rgba(255,255,255,0.08)",
                        }}
                      >
                        <IconComponent size={14} />
                      </div>
                      <div className="layer-item-info">
                        <span className="layer-item-name">{layer.label}</span>
                        <span className="layer-item-desc">{layer.desc}</span>
                      </div>
                    </div>

                    {/* Toggle Switch */}
                    <div className={`layer-toggle-switch ${isActive ? "on" : ""}`}>
                      <div className="layer-toggle-slider" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

