import { useState, useEffect, useRef } from "react";
import {
  X, Shield, AlertTriangle, Calendar, Clock, MapPin,
  TrendingUp, BarChart2, FileText, ChevronRight, ChevronLeft,
  Search, Filter, CheckCircle2, AlertCircle, Info, RefreshCw
} from "lucide-react";
import { BACKEND_URL, EMULATOR_API_URL, PC_LAN_IP, isCapacitorNative } from "../config/api";
import { cachedFetch } from "../utils/apiCache";

const CATEGORY_COLORS = {
  "Property": "#f59e0b",
  "Violent": "#ef4444",
  "Financial": "#00d4ff",
  "Narcotics/Arms": "#8b5cf6",
  "Other": "#64748b",
};

export default function CrimeDetailPanel({ clusterId, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & pagination state for individual FIR records
  const [showRecords, setShowRecords] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Normalize cluster ID (handles number, string, or object with cluster_id/id)
  const normalizedId = (typeof clusterId === "object" && clusterId !== null)
    ? (clusterId.cluster_id ?? clusterId.id ?? clusterId.zone_id ?? clusterId.police_station ?? "")
    : clusterId;

  const detailsAbortRef = useRef(null);
  const recordsAbortRef = useRef(null);
  const currentReqIdRef = useRef(null);

  // 1. Fetch cluster summary details with deduplication, safety timeout and error handling
  const loadDetails = async () => {
    if (normalizedId == null || normalizedId === "") {
      setLoading(false);
      setError("No valid crime cluster selected.");
      return;
    }

    // If details for this exact cluster are already loaded, avoid flashing loading state
    if (details && (details.cluster_id === normalizedId || details.cluster_id === Number(normalizedId) || details.police_station === normalizedId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (detailsAbortRef.current) {
      detailsAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    detailsAbortRef.current = abortCtrl;
    const reqId = `${normalizedId}-${Date.now()}`;
    currentReqIdRef.current = reqId;

    // Safety timeout: abort after 10 seconds if backend does not respond
    const timeoutTimer = setTimeout(() => {
      if (currentReqIdRef.current === reqId) {
        abortCtrl.abort();
        setError("Request timed out querying PostgreSQL crime records. Please check the backend connection and retry.");
        setLoading(false);
      }
    }, 10000);

    try {
      const data = await cachedFetch(
        `${BACKEND_URL}/api/crime-clusters/${encodeURIComponent(normalizedId)}/details`,
        { signal: abortCtrl.signal },
        300000
      );
      clearTimeout(timeoutTimer);
      if (currentReqIdRef.current === reqId) {
        setDetails(data);
        setLoading(false);
      }
    } catch (err) {
      if (err.name === "AbortError") {
        clearTimeout(timeoutTimer);
        // Only return silently if superseded by another request
        if (currentReqIdRef.current !== reqId) return;
      }

      // If running on Android, try emulator backup host if primary LAN IP failed
      if (isCapacitorNative() && BACKEND_URL !== EMULATOR_API_URL) {
        try {
          const fallback = await cachedFetch(
            `${EMULATOR_API_URL}/api/crime-clusters/${encodeURIComponent(normalizedId)}/details`,
            { signal: abortCtrl.signal },
            300000
          );
          clearTimeout(timeoutTimer);
          if (currentReqIdRef.current === reqId) {
            setDetails(fallback);
            setLoading(false);
            return;
          }
        } catch (_) {}
      }

      clearTimeout(timeoutTimer);
      if (currentReqIdRef.current === reqId) {
        const errMsg = err.name === "AbortError"
          ? "Request was interrupted. Please click Retry."
          : (err.message || `Failed to connect to SafePath backend at ${BACKEND_URL}. Ensure PC server is running.`);
        setError(errMsg);
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadDetails();
    return () => {
      if (detailsAbortRef.current) detailsAbortRef.current.abort();
      if (recordsAbortRef.current) recordsAbortRef.current.abort();
    };
  }, [normalizedId]);

  // 2. Fetch paginated individual crime records when view is expanded
  const [recordsError, setRecordsError] = useState(null);

  const loadRecords = async () => {
    if (normalizedId == null || normalizedId === "" || !showRecords) return;
    setRecordsLoading(true);
    setRecordsError(null);

    if (recordsAbortRef.current) recordsAbortRef.current.abort();
    const abortCtrl = new AbortController();
    recordsAbortRef.current = abortCtrl;

    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: pageSize.toString(),
    });
    if (selectedYear) params.append("year", selectedYear);
    if (selectedCategory) params.append("category", selectedCategory);
    if (selectedStatus) params.append("case_status", selectedStatus);
    if (searchQuery.trim()) params.append("search", searchQuery.trim());

    // 10s safety timeout for records query
    const timeoutTimer = setTimeout(() => {
      abortCtrl.abort();
      setRecordsError("FIR records query timed out. Please retry.");
      setRecordsLoading(false);
    }, 10000);

    try {
      const data = await cachedFetch(
        `${BACKEND_URL}/api/crime-clusters/${encodeURIComponent(normalizedId)}/crimes?${params.toString()}`,
        { signal: abortCtrl.signal },
        120000
      );
      clearTimeout(timeoutTimer);
      setRecords(data.records || []);
      setRecordsTotal(data.total || 0);
      setRecordsLoading(false);
    } catch (err) {
      clearTimeout(timeoutTimer);
      if (err.name === "AbortError") return;
      setRecords([]);
      setRecordsError(err.message || "Failed to load FIR records");
      setRecordsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [normalizedId, showRecords, currentPage, selectedYear, selectedCategory, selectedStatus, searchQuery]);

  if (clusterId == null) return null;

  const totalPages = Math.max(1, Math.ceil(recordsTotal / pageSize));

  return (
    <div className="crime-detail-panel" role="dialog" aria-label="Crime Zone Details">
      {/* Mobile sheet drag handle */}
      <div className="cdp-drag-handle" aria-hidden="true">
        <div className="cdp-handle-bar" />
      </div>

      {/* Panel Header */}
      <div className="cdp-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="cdp-icon-wrap" style={{
            background: details?.risk_score >= 7.0 ? "rgba(239,68,68,0.15)" : "rgba(249,115,22,0.15)",
            border: `1px solid ${details?.risk_score >= 7.0 ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.4)"}`,
          }}>
            <Shield size={18} color={details?.risk_score >= 7.0 ? "#ef4444" : "#f97316"} />
          </div>
          <div>
            <div className="cdp-title">
              {details?.police_station ? `${details.police_station} Police Precinct` : `Crime Cluster #${clusterId}`}
            </div>
            <div className="cdp-subtitle">
              {details?.zone || "Mumbai Metropolitan"} · DBSCAN Cluster #{clusterId}
            </div>
          </div>
        </div>

        <button className="cdp-close-btn" onClick={onClose} title="Close panel" aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {/* Body Content */}
      <div className="cdp-body">
        {loading ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)" }}>
            <RefreshCw size={26} style={{ display: "block", margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: "0.85rem" }}>Querying PostgreSQL crime records…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : error ? (
          <div style={{ padding: "32px 20px", textAlign: "center" }}>
            <AlertCircle size={36} color="var(--red)" style={{ margin: "0 auto 12px", display: "block" }} />
            <div style={{ fontSize: "0.92rem", fontWeight: 700, color: "var(--red)", marginBottom: 6 }}>
              {error}
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-3)", marginBottom: 18, lineHeight: 1.5 }}>
              Could not retrieve cluster analytics from the SafePath backend.
              Ensure PostgreSQL is running and retry the request.
            </div>
            <button
              onClick={loadDetails}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 18px",
                background: "rgba(0,212,255,0.15)",
                border: "1px solid var(--cyan)",
                color: "var(--cyan)",
                borderRadius: 8,
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <RefreshCw size={14} /> Retry Query
            </button>
          </div>
        ) : details ? (
          <>
            {/* Provenance & Transparency Notice */}
            <div className="cdp-notice">
              <Info size={14} style={{ flexShrink: 0, marginTop: 2, color: "var(--cyan)" }} />
              <div>
                <strong>Dataset Provenance:</strong> {details.dataset_source} ({details.reporting_period}).
                Coordinates represent approximate police precinct centroids with synthetic spatial jitter; they do not depict exact GPS incident sites.
              </div>
            </div>

            {/* Quick Stat Cards */}
            <div className="cdp-grid">
              <div className="cdp-stat-card">
                <div className="cdp-stat-label">Total Incidents</div>
                <div className="cdp-stat-val" style={{ color: "var(--cyan)" }}>
                  {details.incident_count.toLocaleString()}
                </div>
                <div className="cdp-stat-sub">2020–2024 Records</div>
              </div>

              <div className="cdp-stat-card">
                <div className="cdp-stat-label">Risk Classification</div>
                <div className="cdp-stat-val" style={{
                  color: details.risk_score >= 7.0 ? "var(--red)" : details.risk_score >= 4.0 ? "var(--orange)" : "var(--green)"
                }}>
                  {details.risk_score.toFixed(1)}/10
                </div>
                <div className="cdp-stat-sub">{details.risk_classification}</div>
              </div>

              <div className="cdp-stat-card">
                <div className="cdp-stat-label">Dominant Crime</div>
                <div className="cdp-stat-val" style={{ color: "var(--amber)", fontSize: "0.95rem" }} title={details.dominant_crime}>
                  {details.dominant_crime}
                </div>
                <div className="cdp-stat-sub">Highest Frequency</div>
              </div>

              <div className="cdp-stat-card">
                <div className="cdp-stat-label">Night Incidents</div>
                <div className="cdp-stat-val" style={{ color: "#a855f7" }}>
                  {details.night_share}%
                </div>
                <div className="cdp-stat-sub">10 PM – 6 AM</div>
              </div>
            </div>

            {/* Yearly Trend Chart */}
            {details.yearly_distribution && details.yearly_distribution.length > 0 && (
              <div className="cdp-section">
                <div className="cdp-section-title">
                  <Calendar size={14} color="var(--cyan)" /> Year-Wise Incident Trend (2020–2024)
                </div>
                <div className="cdp-chart-wrap">
                  {(() => {
                    const maxCount = Math.max(...details.yearly_distribution.map(y => y.count), 1);
                    return details.yearly_distribution.map(item => {
                      const heightPct = Math.round((item.count / maxCount) * 100);
                      const isSelected = selectedYear === item.year.toString();
                      return (
                        <div
                          key={item.year}
                          className={`cdp-bar-col ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedYear(isSelected ? "" : item.year.toString());
                            if (!showRecords) setShowRecords(true);
                            setCurrentPage(1);
                          }}
                          title={`Click to filter: ${item.year} (${item.count.toLocaleString()} crimes)`}
                        >
                          <div className="cdp-bar-count">{item.count}</div>
                          <div className="cdp-bar-track">
                            <div className="cdp-bar-fill" style={{ height: `${heightPct}%` }} />
                          </div>
                          <div className="cdp-bar-label">{item.year}</div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Crime Category Breakdown */}
            {details.categories && details.categories.length > 0 && (
              <div className="cdp-section">
                <div className="cdp-section-title">
                  <BarChart2 size={14} color="var(--orange)" /> Crime Category Breakdown
                </div>
                <div className="cdp-cat-list">
                  {details.categories.map(cat => {
                    const color = CATEGORY_COLORS[cat.category] || CATEGORY_COLORS.Other;
                    const isSelected = selectedCategory === cat.category;
                    return (
                      <div
                        key={cat.category}
                        className={`cdp-cat-item ${isSelected ? "active" : ""}`}
                        onClick={() => {
                          setSelectedCategory(isSelected ? "" : cat.category);
                          if (!showRecords) setShowRecords(true);
                          setCurrentPage(1);
                        }}
                        title={`Filter by ${cat.category}`}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "0.78rem" }}>
                          <span style={{ fontWeight: 600, color: "var(--text)" }}>{cat.category} Crimes</span>
                          <span style={{ color: "var(--text-3)" }}>
                            <strong style={{ color }}>{cat.count.toLocaleString()}</strong> ({cat.percentage}%)
                          </span>
                        </div>
                        <div className="cdp-progress-track">
                          <div className="cdp-progress-fill" style={{ width: `${cat.percentage}%`, background: color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top Specific Crime Types */}
            {details.crime_types && details.crime_types.length > 0 && (
              <div className="cdp-section">
                <div className="cdp-section-title">
                  <AlertTriangle size={14} color="var(--amber)" /> Specific Crime Types Recorded
                </div>
                <div className="cdp-type-grid">
                  {details.crime_types.slice(0, 8).map(ct => (
                    <div key={ct.crime_type} className="cdp-type-chip">
                      <div className="cdp-type-name">{ct.crime_type}</div>
                      <div className="cdp-type-meta">
                        <span>{ct.count} cases</span>
                        <span style={{ color: ct.avg_severity >= 0.7 ? "var(--red)" : "var(--amber)" }}>
                          Sev {(ct.avg_severity * 10).toFixed(0)}/10
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expandable Individual FIR Records */}
            <div className="cdp-section" style={{ borderBottom: "none" }}>
              <button
                className="cdp-toggle-records-btn"
                onClick={() => setShowRecords(!showRecords)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <FileText size={16} color="var(--cyan)" />
                  <span style={{ fontWeight: 600 }}>
                    {showRecords ? "Hide Individual FIR Records" : "View Individual FIR Records"}
                  </span>
                  <span className="cdp-badge-counter">{details.incident_count.toLocaleString()}</span>
                </div>
                <ChevronRight
                  size={16}
                  style={{
                    transform: showRecords ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s ease",
                  }}
                />
              </button>

              {showRecords && (
                <div className="cdp-records-container">
                  {/* Filter Toolbar */}
                  <div className="cdp-filter-bar">
                    <div className="cdp-search-box">
                      <Search size={13} color="var(--text-3)" />
                      <input
                        type="text"
                        placeholder="Search FIR or crime type…"
                        value={searchQuery}
                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")} style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: 0 }}>
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 6 }}>
                      <select
                        className="cdp-select"
                        value={selectedYear}
                        onChange={e => { setSelectedYear(e.target.value); setCurrentPage(1); }}
                        aria-label="Filter by Year"
                      >
                        <option value="">All Years</option>
                        <option value="2020">2020</option>
                        <option value="2021">2021</option>
                        <option value="2022">2022</option>
                        <option value="2023">2023</option>
                        <option value="2024">2024</option>
                      </select>

                      <select
                        className="cdp-select"
                        value={selectedCategory}
                        onChange={e => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                        aria-label="Filter by Category"
                      >
                        <option value="">All Categories</option>
                        <option value="Property">Property</option>
                        <option value="Violent">Violent</option>
                        <option value="Financial">Financial/Cyber</option>
                        <option value="Narcotics/Arms">Narcotics/Arms</option>
                      </select>

                      <select
                        className="cdp-select"
                        value={selectedStatus}
                        onChange={e => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
                        aria-label="Filter by Status"
                      >
                        <option value="">All Statuses</option>
                        <option value="Solved">Solved</option>
                        <option value="Unsolved">Unsolved</option>
                        <option value="Under Investigation">Under Investigation</option>
                      </select>
                    </div>
                  </div>

                  {/* Active filters display */}
                  {(selectedYear || selectedCategory || selectedStatus || searchQuery) && (
                    <div className="cdp-active-filters">
                      <span>Filtering by:</span>
                      {selectedYear && <span className="cdp-filter-pill">{selectedYear} <X size={10} onClick={() => setSelectedYear("")} /></span>}
                      {selectedCategory && <span className="cdp-filter-pill">{selectedCategory} <X size={10} onClick={() => setSelectedCategory("")} /></span>}
                      {selectedStatus && <span className="cdp-filter-pill">{selectedStatus} <X size={10} onClick={() => setSelectedStatus("")} /></span>}
                      {searchQuery && <span className="cdp-filter-pill">"{searchQuery}" <X size={10} onClick={() => setSearchQuery("")} /></span>}
                      <button
                        className="cdp-clear-all"
                        onClick={() => { setSelectedYear(""); setSelectedCategory(""); setSelectedStatus(""); setSearchQuery(""); setCurrentPage(1); }}
                      >
                        Clear All
                      </button>
                    </div>
                  )}

                  {/* Records List */}
                  {recordsLoading ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>
                      <RefreshCw size={20} style={{ display: "block", margin: "0 auto 8px", animation: "spin 1s linear infinite" }} />
                      Loading FIR records…
                    </div>
                  ) : recordsError ? (
                    <div style={{ textAlign: "center", padding: "20px 0" }}>
                      <div style={{ color: "var(--red)", fontSize: "0.82rem", marginBottom: 8 }}>{recordsError}</div>
                      <button
                        onClick={loadRecords}
                        style={{
                          padding: "6px 14px",
                          background: "rgba(0,212,255,0.12)",
                          border: "1px solid var(--cyan)",
                          color: "var(--cyan)",
                          borderRadius: 6,
                          fontSize: "0.76rem",
                          cursor: "pointer",
                        }}
                      >
                        Retry Loading FIRs
                      </button>
                    </div>
                  ) : records.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-3)", fontSize: "0.8rem" }}>
                      No crime records found matching your filters.
                    </div>
                  ) : (
                    <div className="cdp-records-list">
                      {records.map(r => (
                        <div key={r.crime_id} className="cdp-record-card">
                          <div className="cdp-rec-head">
                            <div className="cdp-rec-fir">{r.fir_number}</div>
                            <span
                              className="cdp-rec-status"
                              style={{
                                background: r.case_status === "Solved" ? "rgba(34,197,94,0.15)" : "rgba(245,158,11,0.15)",
                                color: r.case_status === "Solved" ? "var(--green)" : "var(--amber)",
                                borderColor: r.case_status === "Solved" ? "rgba(34,197,94,0.3)" : "rgba(245,158,11,0.3)",
                              }}
                            >
                              {r.case_status === "Solved" ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                              {r.case_status}
                            </span>
                          </div>

                          <div className="cdp-rec-title">
                            <span style={{ fontWeight: 700, color: "var(--text)" }}>{r.crime_type}</span>
                            <span className="cdp-rec-cat" style={{ color: CATEGORY_COLORS[r.crime_category] || "var(--text-3)" }}>
                              · {r.crime_category}
                            </span>
                          </div>

                          <div className="cdp-rec-meta">
                            <span>📅 {r.date_reported || `${r.month_name} ${r.year}`}</span>
                            <span>🕐 {r.shift || r.time_of_day || "Daytime"}</span>
                            <span>⚖ Sev {(r.severity_weight * 10).toFixed(0)}/10</span>
                          </div>

                          <div className="cdp-rec-demo">
                            <span>Demographic: {r.victim_age_group} · {r.victim_gender}</span>
                            <span>Arrested: {r.accused_arrested}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pagination Controls */}
                  {recordsTotal > pageSize && (
                    <div className="cdp-pagination">
                      <button
                        className="cdp-page-btn"
                        disabled={currentPage <= 1 || recordsLoading}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      >
                        <ChevronLeft size={14} /> Previous
                      </button>
                      <span className="cdp-page-info">
                        Page {currentPage} of {totalPages} ({recordsTotal.toLocaleString()} total)
                      </span>
                      <button
                        className="cdp-page-btn"
                        disabled={currentPage >= totalPages || recordsLoading}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

