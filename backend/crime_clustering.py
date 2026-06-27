"""
SafePath — Crime Clustering Script
===================================
Run this script ONCE initially, then nightly (via cron job) to:
  1. Load historical crime data from PostgreSQL
  2. Run DBSCAN clustering to identify high-risk / low-risk zones
  3. Update road_edges.base_safety_score based on crime proximity

RUN:
  python crime_clustering.py

SCHEDULE (Linux cron, runs every night at 2 AM):
  0 2 * * * cd /path/to/backend && python crime_clustering.py
"""

import os
import asyncio
import numpy as np
import asyncpg
from sklearn.cluster import DBSCAN
from sklearn.preprocessing import StandardScaler

# ── Same DB config as main.py ──
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/safepath"  # ← SAME AS main.py
)


async def update_safety_scores():
    pool = await asyncpg.create_pool(DATABASE_URL)
    print("Connected to database")

    async with pool.acquire() as conn:
        # ── Step 1: Fetch all crime incidents ──
        crimes = await conn.fetch("""
            SELECT crime_id, severity_weight,
                   ST_X(geom) AS lng,
                   ST_Y(geom) AS lat
            FROM historical_crimes
            WHERE date_reported >= NOW() - INTERVAL '1 year'
        """)
        print(f"Loaded {len(crimes)} crime records")

        if not crimes:
            print("No crime data — load NCRB CSV data first.")
            return

        coords = np.array([[c["lat"], c["lng"]] for c in crimes])
        weights = np.array([c["severity_weight"] for c in crimes])

        # ── Step 2: DBSCAN Clustering ──
        # eps = 0.005 degrees ≈ 500 meters
        # min_samples = 3 crimes to form a cluster
        scaler = StandardScaler()
        coords_scaled = scaler.fit_transform(coords)

        db = DBSCAN(eps=0.3, min_samples=3).fit(coords_scaled)
        labels = db.labels_

        unique_labels = set(labels)
        print(f"Found {len(unique_labels) - (1 if -1 in unique_labels else 0)} crime clusters")

        # ── Step 3: Compute cluster risk scores ──
        cluster_risk = {}  # cluster_id → risk_score (0–1)
        for cluster_id in unique_labels:
            if cluster_id == -1:  # Noise points
                continue
            cluster_weights = weights[labels == cluster_id]
            cluster_risk[cluster_id] = float(np.mean(cluster_weights))

        # ── Step 4: Fetch all road edges ──
        edges = await conn.fetch("""
            SELECT edge_id,
                   ST_X(ST_Centroid(geom)) AS lng,
                   ST_Y(ST_Centroid(geom)) AS lat
            FROM road_edges
        """)
        print(f"Processing {len(edges)} road segments")

        # ── Step 5: For each edge, calculate safety score ──
        # Based on distance to nearest crime cluster
        updates = []
        for edge in edges:
            edge_coords = np.array([edge["lat"], edge["lng"]])
            min_risk = 0.0

            for i, crime_coord in enumerate(coords):
                # Distance in degrees (rough, fast)
                dist = np.linalg.norm(edge_coords - crime_coord)
                # Within 1km (≈0.01 degrees), apply crime penalty
                if dist < 0.01:
                    penalty = weights[i] * (1 - dist / 0.01)
                    min_risk = max(min_risk, penalty)

            # Convert risk to safety score (0–10, higher = safer)
            safety_score = round(10 * (1 - min_risk), 2)
            updates.append((safety_score, edge["edge_id"]))

        # ── Step 6: Batch update road_edges ──
        await conn.executemany(
            "UPDATE road_edges SET base_safety_score = $1 WHERE edge_id = $2",
            updates
        )
        print(f"✅ Updated safety scores for {len(updates)} road segments")

    await pool.close()


if __name__ == "__main__":
    asyncio.run(update_safety_scores())