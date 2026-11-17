"""
dry_run_crime_integration.py
============================
SafePath — Crime Integration & Road Safety Score Dry-Run
--------------------------------------------------------
Tasks:
1. Load 15,594 records from `staging_mumbai_crimes` inside the OSM bounding box.
2. Apply calibrated severity weights for all 17 crime types.
3. Run DBSCAN with Haversine metric (without PostGIS).
4. Extract clusters, noise points, centroids, and risk scores.
5. Recalculate road safety scores using the existing SafePath penalty decay model.
6. Compare proposed scores against current road scores in `road_edges`.
7. Generate a comprehensive dry-run report.

DOES NOT MODIFY ANY DATABASE TABLES. READ-ONLY.
"""

import os, sys, time, json
import numpy as np
import psycopg2
from sklearn.cluster import DBSCAN
from sklearn.neighbors import BallTree
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:harsh7@localhost:5432/crime_navigation"
)

EARTH_RADIUS_M = 6371000.0

# ── 1. Severity Weights for all 17 Crime Types ───────────────────────────────
# Scale: 0.05 to 1.00 based on physical violence, threat to life, street vulnerability
SEVERITY_WEIGHTS = {
    # Extreme Violent Crimes (Direct lethal or severe trauma threat)
    "Murder": 1.00,
    "Rape": 0.95,
    "Attempt to Murder": 0.90,
    "Kidnapping": 0.85,
    "Assault": 0.80,

    # Violent Street & Public Disorder Crimes
    "Rioting": 0.75,
    "Eve Teasing / Molestation": 0.75,
    "Arms Act Violation": 0.70,
    "Robbery": 0.65,
    "Hit & Run": 0.60,

    # Illicit & Street Grab Crimes
    "Drug Trafficking": 0.55,
    "Chain Snatching": 0.50,
    "Burglary": 0.50,

    # Opportunistic / Non-Violent Property Crimes
    "Theft": 0.40,
    "Vehicle Theft": 0.35,

    # Digital / White-Collar Crimes (Minimal direct street navigation danger)
    "Fraud / Cheating": 0.15,
    "Cybercrime": 0.10,
}

# DBSCAN Parameters (Haversine in radians)
# 400 meters clustering radius
CLUSTER_EPS_METERS = 400.0
CLUSTER_EPS_RAD = CLUSTER_EPS_METERS / EARTH_RADIUS_M
DBSCAN_MIN_SAMPLES = 10

# Road Safety Impact Radius
# 350 meters influence zone around crime occurrences
CRIME_INFLUENCE_RADIUS_METERS = 350.0
CRIME_INFLUENCE_RADIUS_RAD = CRIME_INFLUENCE_RADIUS_METERS / EARTH_RADIUS_M


def db_connect():
    url = DATABASE_URL.replace("postgresql://", "")
    user_pass, rest = url.split("@", 1)
    user, pw = user_pass.split(":", 1)
    host_port, dbname = rest.rsplit("/", 1)
    host, port = host_port.split(":")
    return psycopg2.connect(host=host, port=int(port), dbname=dbname, user=user, password=pw)


def main():
    print("=" * 70)
    print("  SafePath — Mumbai Crime Dataset Production Integration [DRY-RUN]")
    print("=" * 70)

    conn = db_connect()
    cur = conn.cursor()

    # ── Step 1: Load Staging Crimes inside OSM Bounding Box ──────────────────
    print("\n[1/5] Loading staging crime data inside OSM bounding box …")
    cur.execute("""
        SELECT fir_number, crime_type, crime_category, police_station, zone,
               latitude, longitude, reported_date, time_of_day
        FROM staging_mumbai_crimes
        WHERE in_osm_bbox = TRUE
        ORDER BY fir_number
    """)
    crime_rows = cur.fetchall()
    total_crimes = len(crime_rows)
    print(f"  Loaded {total_crimes:,} crime records from `staging_mumbai_crimes`")

    # Extract coordinates & map severity weights
    crime_lats = np.array([r[5] for r in crime_rows], dtype=np.float64)
    crime_lngs = np.array([r[6] for r in crime_rows], dtype=np.float64)
    crime_types = [r[1] for r in crime_rows]
    crime_weights = np.array([SEVERITY_WEIGHTS.get(ct, 0.50) for ct in crime_types], dtype=np.float64)

    crime_coords_rad = np.radians(np.column_stack([crime_lats, crime_lngs]))

    # ── Step 2: DBSCAN Clustering with Haversine Metric ──────────────────────
    print("\n[2/5] Running DBSCAN clustering using Haversine distance …")
    print(f"  Configuration: eps = {CLUSTER_EPS_METERS:.0f}m ({CLUSTER_EPS_RAD:.6f} rad), min_samples = {DBSCAN_MIN_SAMPLES}")
    t0 = time.time()
    db = DBSCAN(eps=CLUSTER_EPS_RAD, min_samples=DBSCAN_MIN_SAMPLES, metric="haversine")
    labels = db.fit_predict(crime_coords_rad)
    cluster_time = time.time() - t0

    unique_labels = set(labels)
    n_clusters = len(unique_labels - {-1})
    n_noise = int(np.sum(labels == -1))
    pct_clustered = (total_crimes - n_noise) / total_crimes * 100

    print(f"  DBSCAN completed in {cluster_time:.2f}s")
    print(f"  Clusters discovered : {n_clusters}")
    print(f"  Noise / Sparse points: {n_noise:,} ({100 - pct_clustered:.1f}%)")
    print(f"  Clustered incidents  : {total_crimes - n_noise:,} ({pct_clustered:.1f}%)")

    # Analyze Cluster Centroids & Risk Scores
    cluster_profiles = []
    for cid in sorted(unique_labels - {-1}):
        mask = (labels == cid)
        c_count = int(np.sum(mask))
        c_lat = float(np.mean(crime_lats[mask]))
        c_lng = float(np.mean(crime_lngs[mask]))
        c_avg_sev = float(np.mean(crime_weights[mask]))

        # Top crime type in cluster
        types_in_c = pd.Series([crime_types[i] for i in range(total_crimes) if mask[i]])
        top_crime = types_in_c.value_counts().index[0]
        top_crime_cnt = int(types_in_c.value_counts().iloc[0])

        # Cluster risk metric = combination of density (incident count) & severity
        # Scale: 0 to 10
        density_factor = min(c_count / 150.0, 1.0)
        risk_score = round((c_avg_sev * 0.6 + density_factor * 0.4) * 10.0, 2)

        cluster_profiles.append({
            "cluster_id": cid,
            "incident_count": c_count,
            "centroid_lat": round(c_lat, 5),
            "centroid_lng": round(c_lng, 5),
            "avg_severity": round(c_avg_sev, 3),
            "risk_score": risk_score,
            "top_crime": f"{top_crime} ({top_crime_cnt})"
        })

    # Sort clusters by risk score descending
    cluster_profiles.sort(key=lambda x: x["risk_score"], reverse=True)

    # ── Step 3: Load Existing Road Edges ─────────────────────────────────────
    print("\n[3/5] Loading existing road segments from `road_edges` …")
    cur.execute("""
        SELECT edge_id, src_lat, src_lng, tgt_lat, tgt_lng,
               length_meters, road_type, is_lit, base_safety_score
        FROM road_edges
        WHERE src_lat IS NOT NULL
        ORDER BY edge_id
    """)
    edge_rows = cur.fetchall()
    total_edges = len(edge_rows)
    print(f"  Loaded {total_edges:,} road edges with coordinates")

    edge_ids = [r[0] for r in edge_rows]
    edge_mid_lats = np.array([(r[1] + r[3]) / 2.0 for r in edge_rows], dtype=np.float64)
    edge_mid_lngs = np.array([(r[2] + r[4]) / 2.0 for r in edge_rows], dtype=np.float64)
    edge_current_scores = np.array([r[8] if r[8] is not None else 5.0 for r in edge_rows], dtype=np.float64)

    edge_mid_coords_rad = np.radians(np.column_stack([edge_mid_lats, edge_mid_lngs]))

    # ── Step 4: Recalculate Road Safety Scores via Spatial Indexing ───────────
    print(f"\n[4/5] Computing proposed safety scores (influence radius = {CRIME_INFLUENCE_RADIUS_METERS:.0f}m) …")
    t0 = time.time()
    # Build BallTree on crime points
    crime_tree = BallTree(crime_coords_rad, metric="haversine")

    # Query all crimes within influence radius for each road edge
    indices, distances = crime_tree.query_radius(
        edge_mid_coords_rad,
        r=CRIME_INFLUENCE_RADIUS_RAD,
        return_distance=True
    )

    proposed_scores = np.zeros(total_edges, dtype=np.float64)
    edges_impacted = 0

    for i in range(total_edges):
        c_idxs = indices[i]
        if len(c_idxs) == 0:
            # No crimes within radius: safe baseline
            proposed_scores[i] = 10.0
        else:
            edges_impacted += 1
            dists_m = distances[i] * EARTH_RADIUS_M
            w = crime_weights[c_idxs]

            # SafePath Penalty Decay Formula:
            # penalty = severity_weight * (1 - distance / radius)
            penalties = w * (1.0 - (dists_m / CRIME_INFLUENCE_RADIUS_METERS))
            max_penalty = float(np.max(penalties))

            # Cumulative density penalty for repeated incidents (up to 0.2 additional penalty)
            density_penalty = min(len(c_idxs) * 0.02, 0.20)
            total_penalty = min(max_penalty + density_penalty, 1.0)

            score = round(10.0 * (1.0 - total_penalty), 2)
            proposed_scores[i] = max(0.0, min(10.0, score))

    calc_time = time.time() - t0
    print(f"  Safety scores computed for {total_edges:,} roads in {calc_time:.2f}s")
    print(f"  Road segments within crime influence zones: {edges_impacted:,} ({edges_impacted/total_edges*100:.1f}%)")
    print(f"  Road segments with zero nearby crime       : {total_edges - edges_impacted:,} ({(total_edges - edges_impacted)/total_edges*100:.1f}%)")

    # ── Step 5: Statistical Comparison & Report ──────────────────────────────
    print("\n[5/5] Generating Comparative Statistical Report …")

    def stats_summary(arr):
        return {
            "min": round(float(np.min(arr)), 2),
            "max": round(float(np.max(arr)), 2),
            "mean": round(float(np.mean(arr)), 2),
            "median": round(float(np.median(arr)), 2),
            "std": round(float(np.std(arr)), 2),
        }

    curr_stats = stats_summary(edge_current_scores)
    prop_stats = stats_summary(proposed_scores)

    # Score tier categorization
    def categorize_scores(arr):
        return {
            "High Risk   (0.0 - 4.0)": int(np.sum(arr < 4.0)),
            "Moderate    (4.0 - 7.0)": int(np.sum((arr >= 4.0) & (arr < 7.0))),
            "Safe        (7.0 - 9.0)": int(np.sum((arr >= 7.0) & (arr < 9.0))),
            "Very Safe   (9.0 - 10.0)": int(np.sum(arr >= 9.0)),
        }

    curr_tiers = categorize_scores(edge_current_scores)
    prop_tiers = categorize_scores(proposed_scores)

    diff = proposed_scores - edge_current_scores
    increased = int(np.sum(diff > 0.5))
    decreased = int(np.sum(diff < -0.5))
    unchanged = int(np.sum(np.abs(diff) <= 0.5))

    cur.close()
    conn.close()

    # Print comprehensive output
    print("\n" + "=" * 70)
    print("                    DRY-RUN RESULTS & AUDIT REPORT")
    print("=" * 70)

    print("\nA. DBSCAN CLUSTERING SUMMARY (15,594 OSM Bbox Records)")
    print("-" * 55)
    print(f"  Distance Metric           : Haversine (Direct lat/lng, No PostGIS)")
    print(f"  Epsilon (Radius)          : {CLUSTER_EPS_METERS:.0f} meters")
    print(f"  Min Samples per Cluster   : {DBSCAN_MIN_SAMPLES}")
    print(f"  Identified Crime Clusters : {n_clusters}")
    print(f"  Noise (Scattered Points)  : {n_noise:,} ({100 - pct_clustered:.1f}%)")
    print(f"  Incidents in Hotspots     : {total_crimes - n_noise:,} ({pct_clustered:.1f}%)")

    print("\nTop 10 High-Risk Crime Hotspot Clusters:")
    print(f"  {'CID':<5} {'Count':<7} {'Centroid (Lat, Lng)':<24} {'Avg Sev':<9} {'Risk':<6} {'Top Crime'}")
    print("  " + "-" * 68)
    for c in cluster_profiles[:10]:
        coords_str = f"({c['centroid_lat']:.4f}, {c['centroid_lng']:.4f})"
        print(f"  #{c['cluster_id']:<4} {c['incident_count']:<7} {coords_str:<24} {c['avg_severity']:<9.2f} {c['risk_score']:<6.1f} {c['top_crime']}")

    print("\nB. ROAD SAFETY SCORE COMPARISON (123,272 Road Segments)")
    print("-" * 55)
    print(f"  Metric             Current (500 Mock Crimes)    Proposed (15,594 Real Crimes)")
    print(f"  -----------------  -------------------------    -----------------------------")
    print(f"  Minimum Score      {curr_stats['min']:<28} {prop_stats['min']:<28}")
    print(f"  Mean (Average)     {curr_stats['mean']:<28} {prop_stats['mean']:<28}")
    print(f"  Median Score       {curr_stats['median']:<28} {prop_stats['median']:<28}")
    print(f"  Maximum Score      {curr_stats['max']:<28} {prop_stats['max']:<28}")
    print(f"  Std Deviation      {curr_stats['std']:<28} {prop_stats['std']:<28}")

    print("\nDistribution by Safety Tier:")
    print(f"  {'Safety Tier':<25} {'Current Roads':<20} {'Proposed Roads':<20} {'Change'}")
    print("  " + "-" * 72)
    for tier in curr_tiers:
        c_cnt = curr_tiers[tier]
        p_cnt = prop_tiers[tier]
        chg = p_cnt - c_cnt
        sign = "+" if chg > 0 else ""
        print(f"  {tier:<25} {c_cnt:>8,} ({c_cnt/total_edges*100:>4.1f}%)      {p_cnt:>8,} ({p_cnt/total_edges*100:>4.1f}%)      {sign}{chg:,}")

    print("\nRoad Segment Score Shift:")
    print(f"  Significantly Decreased (More Dangerous by >0.5) : {decreased:>7,} ({decreased/total_edges*100:.1f}%)")
    print(f"  Unchanged / Minor Adjustment (Within ±0.5)       : {unchanged:>7,} ({unchanged/total_edges*100:.1f}%)")
    print(f"  Significantly Increased (Safer by >0.5)           : {increased:>7,} ({increased/total_edges*100:.1f}%)")

    print("\n" + "=" * 70)
    print("  ✅ DRY-RUN COMPLETED. ZERO DATABASE ROWS MODIFIED.")
    print("=" * 70)


if __name__ == "__main__":
    import pandas as pd
    main()

