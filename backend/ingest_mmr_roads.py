import asyncio
import asyncpg
import xml.etree.ElementTree as ET
import requests
import math
import time
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:harsh7@localhost:5432/crime_navigation')

ROAD_TYPES = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "residential", "service", "pedestrian", "footway", "path", "cycleway", "living_street",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"
}

def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    return R * 2.0 * math.asin(math.sqrt(a))

def compute_baseline_score(road_type, is_lit):
    type_scores = {
        "motorway": 8.0, "motorway_link": 7.8,
        "trunk": 7.8, "trunk_link": 7.5,
        "primary": 7.5, "primary_link": 7.2,
        "secondary": 7.0, "secondary_link": 6.8,
        "tertiary": 6.5, "tertiary_link": 6.3,
        "residential": 6.0, "pedestrian": 6.5,
        "living_street": 6.5, "service": 5.5,
        "footway": 5.8, "path": 5.2, "cycleway": 6.5
    }
    base = type_scores.get(road_type, 6.0)
    if not is_lit:
        base -= 0.5
    return round(base, 2)

TILES = [
    # 1. South Mumbai Tip & Core
    ("South Mumbai 1 (Colaba/Cuffe Parade)", "72.80,18.89,72.85,18.93"),
    ("South Mumbai 2 (Churchgate/Fort/Nariman)", "72.80,18.93,72.85,18.97"),
    ("South Mumbai 3 (Mazgaon/Dockyard)", "72.83,18.93,72.87,18.97"),

    # 2. Northern Suburbs
    ("Northern Suburbs 1 (Goregaon/Malad West)", "72.81,19.15,72.86,19.19"),
    ("Northern Suburbs 2 (Goregaon/Malad East)", "72.85,19.15,72.89,19.19"),
    ("Northern Suburbs 3 (Kandivali/Borivali West)", "72.81,19.19,72.86,19.23"),
    ("Northern Suburbs 4 (Kandivali/Borivali East)", "72.85,19.19,72.89,19.23"),
    ("Northern Suburbs 5 (Dahisar West/East)", "72.82,19.23,72.87,19.27"),
    ("Northern Suburbs 6 (Dahisar Border)", "72.86,19.23,72.90,19.27"),

    # 3. Mira-Bhayandar
    ("Mira-Bhayandar 1 (Mira Rd West)", "72.81,19.27,72.86,19.31"),
    ("Mira-Bhayandar 2 (Mira Rd East)", "72.85,19.27,72.90,19.31"),
    ("Mira-Bhayandar 3 (Bhayandar West)", "72.81,19.31,72.86,19.35"),
    ("Mira-Bhayandar 4 (Bhayandar East/Creek)", "72.85,19.31,72.90,19.35"),

    # 4. Vasai-Virar
    ("Vasai-Virar 1 (Vasai Road)", "72.79,19.34,72.85,19.38"),
    ("Vasai-Virar 2 (Nallasopara)", "72.79,19.38,72.85,19.42"),
    ("Vasai-Virar 3 (Virar)", "72.80,19.42,72.86,19.46"),

    # 5. Thane City & Ghodbunder
    ("Thane City 1 (Naupada/Wagle/Teen Hath)", "72.94,19.15,72.99,19.19"),
    ("Thane City 2 (Kalwa/Vitawa/East)", "72.98,19.15,73.03,19.19"),
    ("Thane City 3 (Majiwada/Kapurbawdi)", "72.94,19.19,72.99,19.23"),
    ("Thane City 4 (Balkum/Saket)", "72.98,19.19,73.03,19.23"),
    ("Thane City 5 (Ghodbunder Rd)", "72.93,19.23,72.98,19.27"),

    # 6. Navi Mumbai
    ("Navi Mumbai 1 (Airoli/Digha)", "72.97,19.12,73.02,19.16"),
    ("Navi Mumbai 2 (Ghansoli/Koparkhairane)", "72.98,19.08,73.03,19.12"),
    ("Navi Mumbai 3 (Vashi/Turbhe/Sanpada)", "72.98,19.04,73.03,19.08"),
    ("Navi Mumbai 4 (Nerul/Seawoods)", "72.99,19.00,73.04,19.04"),
    ("Navi Mumbai 5 (CBD Belapur)", "73.01,18.97,73.06,19.01"),
    ("Navi Mumbai 6 (Vashi Creek Bridge Link)", "72.93,19.03,72.98,19.07"),

    # 7. Panvel & Kharghar
    ("Panvel/Kharghar 1 (Kharghar)", "73.04,19.01,73.08,19.05"),
    ("Panvel/Kharghar 2 (Kamothe/Kalamboli)", "73.07,19.00,73.12,19.04"),
    ("Panvel/Kharghar 3 (Panvel City)", "73.08,18.96,73.13,19.00"),

    # 8. Kalyan-Dombivli
    ("Kalyan-Dombivli 1 (Dombivli)", "73.07,19.20,73.12,19.24"),
    ("Kalyan-Dombivli 2 (Kalyan)", "73.11,19.21,73.16,19.26"),
]

def parse_osm_xml(xml_bytes):
    root = ET.fromstring(xml_bytes)
    nodes = {}
    for node in root.findall("node"):
        nid = int(node.get("id"))
        lat = float(node.get("lat"))
        lon = float(node.get("lon"))
        nodes[nid] = (lat, lon)

    edges = []
    for way in root.findall("way"):
        tags = {tag.get("k"): tag.get("v") for tag in way.findall("tag")}
        hw = tags.get("highway")
        if not hw or hw not in ROAD_TYPES:
            continue

        way_id = int(way.get("id"))
        nd_refs = [int(nd.get("ref")) for nd in way.findall("nd")]
        is_lit = tags.get("lit", "no").lower() in ("yes", "24/7", "automatic")
        score = compute_baseline_score(hw, is_lit)

        for idx in range(len(nd_refs) - 1):
            s_node = nd_refs[idx]
            t_node = nd_refs[idx + 1]
            if s_node in nodes and t_node in nodes:
                p1 = nodes[s_node]
                p2 = nodes[t_node]
                dist = haversine(p1[0], p1[1], p2[0], p2[1])
                # Generate edge_id consistent with OSM convention
                edge_id = way_id * 1000 + idx
                edges.append((
                    edge_id,
                    s_node,
                    t_node,
                    dist,
                    hw,
                    is_lit,
                    score,
                    0.35, # default isolation risk
                    p1[0], # src_lat
                    p1[1], # src_lng
                    p2[0], # tgt_lat
                    p2[1]  # tgt_lng
                ))
    return nodes, edges

async def ingest_tile(conn, name, bbox, attempt=1):
    url = f"https://api.openstreetmap.org/api/0.6/map?bbox={bbox}"
    headers = {"User-Agent": "SafePathBot/1.0 (harsh@safepath.io)"}
    print(f"[{name}] Downloading bbox={bbox} ...", flush=True)
    try:
        r = requests.get(url, headers=headers, timeout=30)
        if r.status_code == 400 and "too many nodes" in r.text:
            print(f"[{name}] Area has >50k nodes. Subdividing tile ...", flush=True)
            # Subdivide in halves
            min_lng, min_lat, max_lng, max_lat = [float(x) for x in bbox.split(",")]
            mid_lat = (min_lat + max_lat) / 2.0
            sub1 = f"{min_lng},{min_lat},{max_lng},{mid_lat}"
            sub2 = f"{min_lng},{mid_lat},{max_lng},{max_lat}"
            await ingest_tile(conn, f"{name} (Part 1)", sub1)
            time.sleep(1)
            await ingest_tile(conn, f"{name} (Part 2)", sub2)
            return

        if not r.ok:
            print(f"[{name}] HTTP {r.status_code} ({r.text[:100]}). Skipping or retrying.", flush=True)
            if attempt < 2:
                time.sleep(2)
                await ingest_tile(conn, name, bbox, attempt=attempt+1)
            return

        nodes, edges = parse_osm_xml(r.content)
        print(f"[{name}] Parsed {len(nodes):,} nodes and {len(edges):,} road edges.", flush=True)

        # Batch insert nodes
        node_records = [(nid, lat, lon) for nid, (lat, lon) in nodes.items()]
        chunk_size = 2000
        for i in range(0, len(node_records), chunk_size):
            chunk = node_records[i:i + chunk_size]
            await conn.executemany("""
                INSERT INTO road_nodes (node_id, lat, lng)
                VALUES ($1, $2, $3)
                ON CONFLICT (node_id) DO NOTHING
            """, chunk)

        # Batch insert edges
        for i in range(0, len(edges), chunk_size):
            chunk = edges[i:i + chunk_size]
            await conn.executemany("""
                INSERT INTO road_edges (edge_id, source_node, target_node, length_meters, road_type, is_lit, base_safety_score, isolation_risk, src_lat, src_lng, tgt_lat, tgt_lng)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (edge_id) DO NOTHING
            """, chunk)

        print(f"[{name}] Ingestion complete.", flush=True)
    except Exception as e:
        print(f"[{name}] Error: {e}", flush=True)

async def main():
    print("Connecting to database ...", flush=True)
    conn = await asyncpg.connect(DB_URL)
    
    init_nodes = await conn.fetchval("SELECT COUNT(*) FROM road_nodes")
    init_edges = await conn.fetchval("SELECT COUNT(*) FROM road_edges")
    print(f"Initial DB state — road_nodes: {init_nodes:,}, road_edges: {init_edges:,}", flush=True)

    t0 = time.time()
    for idx, (name, bbox) in enumerate(TILES, 1):
        print(f"\n--- Progress: {idx}/{len(TILES)}: {name} ---", flush=True)
        await ingest_tile(conn, name, bbox)
        time.sleep(1.0) # Respectful delay between tile requests

    final_nodes = await conn.fetchval("SELECT COUNT(*) FROM road_nodes")
    final_edges = await conn.fetchval("SELECT COUNT(*) FROM road_edges")
    extent = await conn.fetchrow("""
        SELECT MIN(src_lat) min_lat, MAX(src_lat) max_lat,
               MIN(src_lng) min_lng, MAX(src_lng) max_lng
        FROM road_edges
    """)
    elapsed = time.time() - t0

    print("\n=======================================================", flush=True)
    print("MMR ROAD INGESTION COMPLETE!", flush=True)
    print(f"Elapsed time : {elapsed:.1f}s", flush=True)
    print(f"Road nodes   : {init_nodes:,} -> {final_nodes:,} (+{final_nodes - init_nodes:,})", flush=True)
    print(f"Road edges   : {init_edges:,} -> {final_edges:,} (+{final_edges - init_edges:,})", flush=True)
    print(f"New extent   : {dict(extent)}", flush=True)
    print("=======================================================", flush=True)

    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())

