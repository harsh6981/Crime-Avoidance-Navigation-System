"""
SafePath — OSM Data Ingestion Script
======================================
This script downloads road network data from OpenStreetMap
via the Overpass API and loads it into PostgreSQL/PostGIS.

NO API KEY NEEDED — Overpass API is free and open.

RUN ONCE (Phase 1 setup):
  pip install requests asyncpg
  python ingest_osm.py

Change CITY_BBOX below to your target city.
"""

import asyncio
import asyncpg
import requests
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/safepath")

# ── Area to download (bounding box: south, west, north, east) ──
# This example covers Mumbai. Change to your city.
# Find bbox: https://boundingbox.klokantech.com/
CITY_BBOX = "18.8927,72.7766,19.2726,72.9897"  # Mumbai

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Road types to include (OSM highway tags)
ROAD_TYPES = [
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "residential", "service", "pedestrian", "footway", "path", "cycleway"
]


def build_overpass_query(bbox: str) -> str:
    """Build Overpass QL query for road network + streetlight data."""
    road_filter = "|".join(ROAD_TYPES)
    return f"""
    [out:json][timeout:90];
    (
      way["highway"~"^({road_filter})$"]({bbox});
    );
    out body geom;
    """


async def ingest():
    print(f"Downloading OSM data for bbox: {CITY_BBOX}")
    query = build_overpass_query(CITY_BBOX)

    res = requests.post(OVERPASS_URL, data={"data": query}, timeout=120)
    res.raise_for_status()
    data = res.json()

    ways = data.get("elements", [])
    print(f"Downloaded {len(ways)} road segments")

    pool = await asyncpg.create_pool(DATABASE_URL)
    print("Connected to database")

    inserted_nodes = set()
    node_records = []
    edge_records = []

    for way in ways:
        if way["type"] != "way" or "geometry" not in way:
            continue

        way_id = way["id"]
        tags = way.get("tags", {})
        road_type = tags.get("highway", "unknown")
        is_lit = tags.get("lit", "no").lower() in ("yes", "24/7", "automatic")

        geom_points = way["geometry"]  # [{"lat": ..., "lon": ...}, ...]
        if len(geom_points) < 2:
            continue

        # Source and target nodes (first and last point of way)
        src_node_id = way["nodes"][0]
        tgt_node_id = way["nodes"][-1]

        # Insert nodes (deduplicated)
        for i, point in enumerate(geom_points):
            node_osm_id = way["nodes"][i]
            if node_osm_id not in inserted_nodes:
                node_records.append((node_osm_id, point["lon"], point["lat"]))
                inserted_nodes.add(node_osm_id)

        # Calculate length using Haversine approximation
        import math
        total_len = 0.0
        for i in range(len(geom_points) - 1):
            p1, p2 = geom_points[i], geom_points[i + 1]
            dlat = math.radians(p2["lat"] - p1["lat"])
            dlng = math.radians(p2["lon"] - p1["lon"])
            a = math.sin(dlat/2)**2 + math.cos(math.radians(p1["lat"])) * math.cos(math.radians(p2["lat"])) * math.sin(dlng/2)**2
            total_len += 6371000 * 2 * math.asin(math.sqrt(a))  # meters

        # Build WKT LineString
        wkt_points = " ".join([f"{p['lon']} {p['lat']}" for p in geom_points])
        geom_wkt = f"SRID=4326;LINESTRING({wkt_points})"

        edge_records.append((
            way_id, src_node_id, tgt_node_id,
            geom_wkt, total_len, road_type, is_lit, 5.0,  # default safety score
        ))

    async with pool.acquire() as conn:
        # Insert nodes
        await conn.executemany("""
            INSERT INTO road_nodes (node_id, geom)
            VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326))
            ON CONFLICT (node_id) DO NOTHING
        """, node_records)
        print(f"Inserted {len(node_records)} nodes")

        # Insert edges
        await conn.executemany("""
            INSERT INTO road_edges
                (edge_id, source_node, target_node, geom, length_meters, road_type, is_lit, base_safety_score)
            VALUES ($1, $2, $3, $4::geometry, $5, $6, $7, $8)
            ON CONFLICT (edge_id) DO NOTHING
        """, edge_records)
        print(f"Inserted {len(edge_records)} road edges")

    await pool.close()
    print("✅ OSM data ingestion complete!")
    print("\nNext step: Run crime_clustering.py to calculate safety scores")


if __name__ == "__main__":
    asyncio.run(ingest())