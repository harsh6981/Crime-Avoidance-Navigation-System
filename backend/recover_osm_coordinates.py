"""
recover_osm_coordinates.py
==========================
SafePath — OSM Coordinate Recovery Tool
----------------------------------------
DRY-RUN mode: reads from Overpass + PostgreSQL, writes no DB changes.

Usage:
    python recover_osm_coordinates.py              # dry-run (default)
    python recover_osm_coordinates.py --apply      # write to PostgreSQL

Steps:
    1. Load all node_id / edge_id records from PostgreSQL (non-geometry cols only).
    2. Re-query Overpass for the original bounding box to recover coordinates.
    3. Reconstruct node→(lat,lng) and edge→(src_lat,src_lng,tgt_lat,tgt_lng).
    4. Compare against DB records and produce a coverage report.
    5. Save recovered data to JSON files for review.
    6. If --apply: UPDATE road_nodes, road_edges, safe_havens (no geometry touched).
"""

import os, sys, json, math, time, struct, argparse, psycopg2, psycopg2.extras, requests
from pathlib import Path
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:harsh7@localhost:5432/crime_navigation"
)

CITY_BBOX = "19.00,72.80,19.15,72.90"   # Must match original ingest_osm.py value

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

ROAD_TYPES = [
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "residential", "service", "pedestrian", "footway", "path", "cycleway",
]

# Known coordinates for the 4 safe_havens (from Google Maps / OSM)
SAFE_HAVEN_COORDS = {
    "Andheri Police Station": {"lat": 19.1197,  "lng": 72.8468},
    "Bandra Police Station":  {"lat": 19.0545,  "lng": 72.8390},
    "Kokilaben Hospital":     {"lat": 19.1234,  "lng": 72.8328},
    "Lilavati Hospital":      {"lat": 19.0501,  "lng": 72.8225},
}

SCRATCH_DIR = Path(__file__).parent.parent / ".gemini" / "brain-scratch"
SCRATCH_DIR = Path(os.environ.get("APPDATA", "C:/Users/harsh/.gemini")) \
              / "antigravity" / "brain" / "98482ec9-4feb-4e0c-a8c9-ab1c967a2e7a" / "scratch"
SCRATCH_DIR.mkdir(parents=True, exist_ok=True)

NODES_JSON  = SCRATCH_DIR / "recovered_nodes.json"
EDGES_JSON  = SCRATCH_DIR / "recovered_edges.json"
HAVENS_JSON = SCRATCH_DIR / "recovered_havens.json"
REPORT_TXT  = SCRATCH_DIR / "coverage_report.txt"

# ── Helpers ────────────────────────────────────────────────────────────────────

def db_connect():
    url = DATABASE_URL.replace("postgresql://", "")
    user_pass, rest = url.split("@", 1)
    user, pw = user_pass.split(":", 1)
    host_port, dbname = rest.rsplit("/", 1)
    host, port = host_port.split(":")
    return psycopg2.connect(host=host, port=int(port), dbname=dbname,
                            user=user, password=pw)


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def build_overpass_query(bbox):
    road_filter = "|".join(ROAD_TYPES)
    return f"""
[out:json][timeout:240];
(
  way["highway"~"^({road_filter})$"]({bbox});
);
out body geom;
"""


def fetch_overpass(bbox):
    query = build_overpass_query(bbox)
    headers = {"User-Agent": "SafePath/1.0 (Crime Avoidance Navigation System)"}
    for url in OVERPASS_URLS:
        print(f"  → Trying {url} …")
        try:
            resp = requests.post(url, data={"data": query}, headers=headers, timeout=260)
            if resp.ok:
                data = resp.json()
                ways = [e for e in data.get("elements", []) if e.get("type") == "way"]
                print(f"  ✅ Got {len(ways)} ways from {url}")
                return ways
            print(f"  ✗ HTTP {resp.status_code}")
        except Exception as e:
            print(f"  ✗ {e}")
    raise RuntimeError("All Overpass servers failed.")


# ── Step 1: Load DB records ────────────────────────────────────────────────────

def load_db_records(conn):
    cur = conn.cursor()

    cur.execute("SELECT node_id FROM road_nodes ORDER BY node_id")
    db_nodes = {r[0] for r in cur.fetchall()}
    print(f"  DB road_nodes: {len(db_nodes):,}")

    cur.execute("SELECT edge_id, source_node, target_node, length_meters, road_type FROM road_edges ORDER BY edge_id")
    db_edges = {}
    for edge_id, source_node, target_node, length_meters, road_type in cur.fetchall():
        db_edges[edge_id] = {
            "source_node": source_node,
            "target_node": target_node,
            "length_meters": length_meters,
            "road_type": road_type,
        }
    print(f"  DB road_edges: {len(db_edges):,}")

    cur.execute("SELECT haven_id, name, type, contact_number FROM safe_havens")
    db_havens = {r[0]: {"name": r[1], "type": r[2], "contact": r[3]} for r in cur.fetchall()}
    print(f"  DB safe_havens: {len(db_havens):,}")

    cur.close()
    return db_nodes, db_edges, db_havens


# ── Step 2: Reconstruct coordinates from Overpass ─────────────────────────────

def reconstruct_from_overpass(ways, db_nodes, db_edges):
    """
    Returns:
      node_coords : {node_id: (lat, lng)}
      edge_coords : {edge_id: (src_lat, src_lng, tgt_lat, tgt_lng)}
    """
    node_coords = {}   # node_id → (lat, lng)
    edge_coords = {}   # edge_id → (src_lat, src_lng, tgt_lat, tgt_lng)
    duplicate_node_ids = {}
    duplicate_edge_ids = {}

    for way in ways:
        geometry = way.get("geometry", [])
        nodes    = way.get("nodes", [])
        way_id   = way["id"]

        if len(geometry) < 2 or len(nodes) != len(geometry):
            continue

        # Node coordinates
        for idx, point in enumerate(geometry):
            nid = nodes[idx]
            lat, lng = point["lat"], point["lon"]
            if nid in node_coords:
                # Same node seen in multiple ways — coordinates should be identical
                prev = node_coords[nid]
                if abs(prev[0] - lat) > 1e-8 or abs(prev[1] - lng) > 1e-8:
                    duplicate_node_ids[nid] = (prev, (lat, lng))
            else:
                node_coords[nid] = (lat, lng)

        # Edge coordinates
        for idx in range(len(geometry) - 1):
            p1 = geometry[idx]
            p2 = geometry[idx + 1]
            edge_id = way_id * 100000 + idx

            coords = (p1["lat"], p1["lon"], p2["lat"], p2["lon"])
            if edge_id in edge_coords:
                duplicate_edge_ids[edge_id] = (edge_coords[edge_id], coords)
            else:
                edge_coords[edge_id] = coords

    return node_coords, edge_coords, duplicate_node_ids, duplicate_edge_ids


# ── Step 3: Coverage analysis ─────────────────────────────────────────────────

def analyse_coverage(db_nodes, db_edges, db_havens,
                     node_coords, edge_coords,
                     dup_nodes, dup_edges):
    lines = []
    sep = "=" * 65

    # ── Nodes ──────────────────────────────────────────────────────
    matched_nodes   = db_nodes & set(node_coords)
    missing_nodes   = db_nodes - set(node_coords)
    extra_nodes     = set(node_coords) - db_nodes    # in Overpass but not DB

    lines += [
        sep,
        "ROAD NODES",
        sep,
        f"  DB records          : {len(db_nodes):>10,}",
        f"  Overpass recovered  : {len(node_coords):>10,}",
        f"  MATCHED             : {len(matched_nodes):>10,}  ({100*len(matched_nodes)/max(len(db_nodes),1):.2f}%)",
        f"  Missing from Overpass: {len(missing_nodes):>9,}",
        f"  Overpass-only (extra): {len(extra_nodes):>9,}",
        f"  Duplicate IDs (diff coords): {len(dup_nodes):>5,}",
    ]

    # Validate coordinates for matched nodes
    invalid_node_coords = {}
    for nid in matched_nodes:
        lat, lng = node_coords[nid]
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            invalid_node_coords[nid] = (lat, lng)
    lines.append(f"  Invalid coordinates : {len(invalid_node_coords):>9,}")

    if missing_nodes:
        sample = sorted(missing_nodes)[:20]
        lines.append(f"  Sample missing node IDs: {sample}")

    # ── Edges ──────────────────────────────────────────────────────
    matched_edges  = set(db_edges) & set(edge_coords)
    missing_edges  = set(db_edges) - set(edge_coords)
    extra_edges    = set(edge_coords) - set(db_edges)

    lines += [
        "",
        sep,
        "ROAD EDGES",
        sep,
        f"  DB records          : {len(db_edges):>10,}",
        f"  Overpass recovered  : {len(edge_coords):>10,}",
        f"  MATCHED             : {len(matched_edges):>10,}  ({100*len(matched_edges)/max(len(db_edges),1):.2f}%)",
        f"  Missing from Overpass: {len(missing_edges):>9,}",
        f"  Overpass-only (extra): {len(extra_edges):>9,}",
        f"  Duplicate edge IDs  : {len(dup_edges):>9,}",
    ]

    # For edges where source/target node is known in overpass but edge not:
    indirect_recoverable = 0
    for eid in missing_edges:
        srn = db_edges[eid]["source_node"]
        tgn = db_edges[eid]["target_node"]
        if srn in node_coords and tgn in node_coords:
            indirect_recoverable += 1
    lines.append(f"  Recoverable via node join: {indirect_recoverable:>6,}")

    if missing_edges:
        sample = sorted(missing_edges)[:10]
        lines.append(f"  Sample missing edge IDs: {sample}")

    # Cross-check: edge source/target nodes in matched_nodes?
    unresolvable_edges = 0
    for eid in missing_edges:
        srn = db_edges[eid]["source_node"]
        tgn = db_edges[eid]["target_node"]
        if srn not in node_coords and tgn not in node_coords:
            unresolvable_edges += 1
    lines.append(f"  Fully unresolvable edges: {unresolvable_edges:>6,}")

    # Validate edge coordinates for matched edges
    invalid_edge_coords = {}
    for eid in matched_edges:
        src_lat, src_lng, tgt_lat, tgt_lng = edge_coords[eid]
        if (not (-90 <= src_lat <= 90) or not (-180 <= src_lng <= 180)
                or not (-90 <= tgt_lat <= 90) or not (-180 <= tgt_lng <= 180)):
            invalid_edge_coords[eid] = edge_coords[eid]
    lines.append(f"  Invalid coordinates : {len(invalid_edge_coords):>9,}")

    # ── Safe Havens ────────────────────────────────────────────────
    lines += [
        "",
        sep,
        "SAFE HAVENS",
        sep,
    ]
    for haven_id, info in db_havens.items():
        name = info["name"]
        known = SAFE_HAVEN_COORDS.get(name)
        if known:
            lines.append(f"  haven_id={haven_id}  {name}")
            lines.append(f"    → lat={known['lat']}, lng={known['lng']}  [KNOWN ✅]")
        else:
            lines.append(f"  haven_id={haven_id}  {name}  → COORDINATES UNKNOWN ⚠")

    # ── Summary ────────────────────────────────────────────────────
    node_pct  = 100 * len(matched_nodes)  / max(len(db_nodes),  1)
    edge_pct  = 100 * len(matched_edges) / max(len(db_edges), 1)
    edge_total_recoverable = len(matched_edges) + indirect_recoverable
    edge_total_pct = 100 * edge_total_recoverable / max(len(db_edges), 1)

    lines += [
        "",
        sep,
        "SUMMARY",
        sep,
        f"  Nodes: {len(matched_nodes):,}/{len(db_nodes):,} directly matched ({node_pct:.2f}%)",
        f"  Edges: {len(matched_edges):,}/{len(db_edges):,} directly matched ({edge_pct:.2f}%)",
        f"         + {indirect_recoverable:,} recoverable via node-join",
        f"         = {edge_total_recoverable:,} total recoverable ({edge_total_pct:.2f}%)",
        f"  Safe havens: {sum(1 for h in db_havens.values() if h['name'] in SAFE_HAVEN_COORDS)}/{len(db_havens)} have known coordinates",
        "",
        "VERDICT:",
    ]

    if node_pct >= 99.0 and edge_total_pct >= 99.0:
        lines.append("  ✅ COVERAGE SUFFICIENT — safe to proceed with --apply")
    elif node_pct >= 95.0:
        lines.append("  ⚠  PARTIAL COVERAGE — review missing IDs before applying")
    else:
        lines.append("  ❌ INSUFFICIENT COVERAGE — do not apply")

    return "\n".join(lines), matched_nodes, matched_edges, missing_nodes, missing_edges, indirect_recoverable


# ── Step 4: Save recovered data ───────────────────────────────────────────────

def save_recovered_data(node_coords, edge_coords, db_nodes, db_edges, db_havens):
    # Only save records that exist in DB
    nodes_out = {str(nid): {"lat": lat, "lng": lng}
                 for nid, (lat, lng) in node_coords.items()
                 if nid in db_nodes}

    edges_out = {}
    for eid, (src_lat, src_lng, tgt_lat, tgt_lng) in edge_coords.items():
        if eid in db_edges:
            edges_out[str(eid)] = {
                "src_lat": src_lat, "src_lng": src_lng,
                "tgt_lat": tgt_lat, "tgt_lng": tgt_lng,
            }

    # Also add indirect-recoverable edges (via node join)
    for eid in db_edges:
        if eid not in edge_coords:
            srn = db_edges[eid]["source_node"]
            tgn = db_edges[eid]["target_node"]
            if srn in node_coords and tgn in node_coords:
                s_lat, s_lng = node_coords[srn]
                t_lat, t_lng = node_coords[tgn]
                edges_out[str(eid)] = {
                    "src_lat": s_lat, "src_lng": s_lng,
                    "tgt_lat": t_lat, "tgt_lng": t_lng,
                    "recovered_via": "node_join",
                }

    havens_out = {}
    for haven_id, info in db_havens.items():
        name = info["name"]
        known = SAFE_HAVEN_COORDS.get(name)
        if known:
            havens_out[str(haven_id)] = {"name": name, "lat": known["lat"], "lng": known["lng"]}

    with open(NODES_JSON, "w") as f:
        json.dump(nodes_out, f, indent=2)
    with open(EDGES_JSON, "w") as f:
        json.dump(edges_out, f, indent=2)
    with open(HAVENS_JSON, "w") as f:
        json.dump(havens_out, f, indent=2)

    print(f"\n  Saved {len(nodes_out):,} node records  → {NODES_JSON}")
    print(f"  Saved {len(edges_out):,} edge records  → {EDGES_JSON}")
    print(f"  Saved {len(havens_out):,} haven records → {HAVENS_JSON}")
    return len(nodes_out), len(edges_out), len(havens_out)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="SafePath OSM Coordinate Recovery")
    parser.add_argument("--apply", action="store_true",
                        help="Write recovered coordinates to PostgreSQL")
    args = parser.parse_args()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"\n{'='*65}")
    print(f"  SafePath — OSM Coordinate Recovery  [{mode}]")
    print(f"{'='*65}\n")

    # Step 1: Load DB
    print("[1/4] Loading database records …")
    conn = db_connect()
    db_nodes, db_edges, db_havens = load_db_records(conn)

    # Step 2: Fetch Overpass
    print(f"\n[2/4] Fetching Overpass data for bbox {CITY_BBOX} …")
    t0 = time.time()
    ways = fetch_overpass(CITY_BBOX)
    print(f"  Download time: {time.time()-t0:.1f}s — {len(ways)} ways")

    # Step 3: Reconstruct coordinates
    print("\n[3/4] Reconstructing coordinates …")
    node_coords, edge_coords, dup_nodes, dup_edges = reconstruct_from_overpass(
        ways, db_nodes, db_edges
    )
    print(f"  Recovered {len(node_coords):,} unique node coordinates")
    print(f"  Recovered {len(edge_coords):,} unique edge coordinate pairs")

    # Step 4: Analyse coverage
    print("\n[4/4] Analysing coverage …")
    report, matched_nodes, matched_edges, missing_nodes, missing_edges, indirect = \
        analyse_coverage(db_nodes, db_edges, db_havens,
                         node_coords, edge_coords, dup_nodes, dup_edges)

    print("\n" + report)

    # Save to JSON
    print("\n[SAVE] Writing recovered data to scratch files …")
    n_nodes, n_edges, n_havens = save_recovered_data(
        node_coords, edge_coords, db_nodes, db_edges, db_havens
    )

    with open(REPORT_TXT, "w") as f:
        f.write(report)
    print(f"  Saved coverage report → {REPORT_TXT}")

    # Apply (only if --apply)
    if args.apply:
        print("\n[APPLY] Writing coordinates to PostgreSQL …")
        _apply_to_db(conn, n_nodes, n_edges, n_havens)
    else:
        print("\n[DRY-RUN] Database NOT modified.")
        print("  Review the JSON files and report above.")
        print("  When ready, run:  python recover_osm_coordinates.py --apply")

    conn.close()


def _apply_to_db(conn, expected_nodes, expected_edges, expected_havens):
    """Apply recovered coordinates. Called only when --apply is passed."""
    with open(NODES_JSON) as f:
        nodes_data = json.load(f)
    with open(EDGES_JSON) as f:
        edges_data = json.load(f)
    with open(HAVENS_JSON) as f:
        havens_data = json.load(f)

    cur = conn.cursor()

    # road_nodes
    node_rows = [(float(v["lat"]), float(v["lng"]), int(k)) for k, v in nodes_data.items()]
    psycopg2.extras.execute_batch(
        cur,
        "UPDATE road_nodes SET lat=%s, lng=%s WHERE node_id=%s",
        node_rows, page_size=2000
    )
    print(f"  Updated {len(node_rows):,} road_nodes rows")

    # road_edges
    edge_rows = [(float(v["src_lat"]), float(v["src_lng"]),
                  float(v["tgt_lat"]), float(v["tgt_lng"]), int(k))
                 for k, v in edges_data.items()]
    psycopg2.extras.execute_batch(
        cur,
        "UPDATE road_edges SET src_lat=%s, src_lng=%s, tgt_lat=%s, tgt_lng=%s WHERE edge_id=%s",
        edge_rows, page_size=2000
    )
    print(f"  Updated {len(edge_rows):,} road_edges rows")

    # safe_havens
    haven_rows = [(float(v["lat"]), float(v["lng"]), int(k)) for k, v in havens_data.items()]
    psycopg2.extras.execute_batch(
        cur,
        "UPDATE safe_havens SET lat=%s, lng=%s WHERE haven_id=%s",
        haven_rows, page_size=100
    )
    print(f"  Updated {len(haven_rows):,} safe_havens rows")

    # Create indexes
    cur.execute("CREATE INDEX IF NOT EXISTS idx_road_nodes_lat_lng ON road_nodes(lat, lng)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_road_edges_src ON road_edges(src_lat, src_lng)")
    print("  Indexes created.")

    conn.commit()
    cur.close()

    # Verify
    vcur = conn.cursor()
    vcur.execute("SELECT COUNT(*) FROM road_nodes WHERE lat IS NOT NULL")
    n = vcur.fetchone()[0]
    vcur.execute("SELECT COUNT(*) FROM road_edges WHERE src_lat IS NOT NULL")
    e = vcur.fetchone()[0]
    vcur.execute("SELECT COUNT(*) FROM safe_havens WHERE lat IS NOT NULL")
    h = vcur.fetchone()[0]
    print(f"\n  Verification:")
    print(f"    road_nodes with lat/lng : {n:,}")
    print(f"    road_edges with src_lat : {e:,}")
    print(f"    safe_havens with lat    : {h:,}")
    vcur.close()


if __name__ == "__main__":
    main()

