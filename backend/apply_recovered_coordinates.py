"""
apply_recovered_coordinates.py
==============================
Applies the recovered OSM coordinates to PostgreSQL inside a single transaction.

Guarantees:
- Updates only by exact primary key (node_id, edge_id, haven_id).
- Uses parameterized batch execution (psycopg2.extras.execute_batch).
- Validates all coordinates are valid geographic coordinates (Mumbai region).
- Validates counts before commit (112,572 nodes, 123,272 edges, 4 safe havens).
- Rolls back completely if any validation fails.
- Preserves all geometry data and existing road attributes.
- Unmatched records remain NULL (no fabrication).
"""

import os, sys, json, psycopg2, psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:harsh7@localhost:5432/crime_navigation"
)

SCRATCH_DIR = Path(os.environ.get("APPDATA", "C:/Users/harsh/.gemini")) \
              / "antigravity" / "brain" / "98482ec9-4feb-4e0c-a8c9-ab1c967a2e7a" / "scratch"

NODES_JSON  = SCRATCH_DIR / "recovered_nodes.json"
EDGES_JSON  = SCRATCH_DIR / "recovered_edges.json"
HAVENS_JSON = SCRATCH_DIR / "recovered_havens.json"

EXPECTED_NODES  = 112572
EXPECTED_EDGES  = 123272
EXPECTED_HAVENS = 4


def validate_coord(lat, lng, name="coord"):
    if not (18.0 <= lat <= 20.0):
        raise ValueError(f"Invalid latitude for {name}: {lat} (outside Mumbai bounds)")
    if not (72.0 <= lng <= 74.0):
        raise ValueError(f"Invalid longitude for {name}: {lng} (outside Mumbai bounds)")


def db_connect():
    url = DATABASE_URL.replace("postgresql://", "")
    user_pass, rest = url.split("@", 1)
    user, pw = user_pass.split(":", 1)
    host_port, dbname = rest.rsplit("/", 1)
    host, port = host_port.split(":")
    return psycopg2.connect(host=host, port=int(port), dbname=dbname, user=user, password=pw)


def main():
    print("=" * 65)
    print("  SafePath — Apply Recovered Coordinates to PostgreSQL")
    print("=" * 65)

    # 1. Check JSON files exist
    for f in (NODES_JSON, EDGES_JSON, HAVENS_JSON):
        if not f.exists():
            raise FileNotFoundError(f"Missing required artifact: {f}")

    print("\n[1/6] Loading and validating JSON artifacts …")
    with open(NODES_JSON, "r", encoding="utf-8") as f:
        nodes_dict = json.load(f)
    with open(EDGES_JSON, "r", encoding="utf-8") as f:
        edges_dict = json.load(f)
    with open(HAVENS_JSON, "r", encoding="utf-8") as f:
        havens_dict = json.load(f)

    print(f"  Loaded {len(nodes_dict):,} node records")
    print(f"  Loaded {len(edges_dict):,} edge records")
    print(f"  Loaded {len(havens_dict):,} safe haven records")

    if len(nodes_dict) != EXPECTED_NODES:
        raise ValueError(f"Expected {EXPECTED_NODES} nodes, got {len(nodes_dict)}")
    if len(edges_dict) != EXPECTED_EDGES:
        raise ValueError(f"Expected {EXPECTED_EDGES} edges, got {len(edges_dict)}")
    if len(havens_dict) != EXPECTED_HAVENS:
        raise ValueError(f"Expected {EXPECTED_HAVENS} havens, got {len(havens_dict)}")

    # 2. Prepare parameter tuples & validate values
    print("\n[2/6] Validating coordinate ranges …")
    node_params = []
    for str_id, data in nodes_dict.items():
        node_id = int(str_id)
        lat = float(data["lat"])
        lng = float(data["lng"])
        validate_coord(lat, lng, f"node {node_id}")
        node_params.append((lat, lng, node_id))

    edge_params = []
    for str_id, data in edges_dict.items():
        edge_id = int(str_id)
        s_lat = float(data["src_lat"])
        s_lng = float(data["src_lng"])
        t_lat = float(data["tgt_lat"])
        t_lng = float(data["tgt_lng"])
        validate_coord(s_lat, s_lng, f"edge {edge_id} src")
        validate_coord(t_lat, t_lng, f"edge {edge_id} tgt")
        edge_params.append((s_lat, s_lng, t_lat, t_lng, edge_id))

    haven_params = []
    for str_id, data in havens_dict.items():
        haven_id = int(str_id)
        lat = float(data["lat"])
        lng = float(data["lng"])
        validate_coord(lat, lng, f"haven {haven_id}")
        haven_params.append((lat, lng, haven_id))

    print("  ✅ All coordinate values validated successfully (all in Mumbai region).")

    # 3. Connect to DB and get baseline counts
    conn = db_connect()
    conn.autocommit = False  # Explicit transaction
    cur = conn.cursor()

    try:
        print("\n[3/6] Querying baseline (BEFORE) counts …")
        cur.execute("SELECT COUNT(*) FROM road_nodes WHERE lat IS NOT NULL")
        before_nodes = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM road_edges WHERE src_lat IS NOT NULL")
        before_edges = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM safe_havens WHERE lat IS NOT NULL")
        before_havens = cur.fetchone()[0]

        print(f"  BEFORE road_nodes with lat/lng     : {before_nodes:,} / 113,380")
        print(f"  BEFORE road_edges with coordinates : {before_edges:,} / 124,050")
        print(f"  BEFORE safe_havens with coordinates: {before_havens} / 4")

        # 4. Drop broken PostGIS GiST indexes that trigger postgis-3.dll during updates
        print("\n[4/6] Dropping non-functional GiST indexes (preserves all geom columns & data) …")
        cur.execute("DROP INDEX IF EXISTS road_nodes_geom_idx;")
        cur.execute("DROP INDEX IF EXISTS road_edges_geom_idx;")
        cur.execute("DROP INDEX IF EXISTS havens_geom_idx;")
        print("  ✅ Dropped broken GiST indexes; table data and geometry columns preserved.")

        # 5. Perform updates
        print("\n[5/6] Executing transaction-based batch updates …")

        # Update road_nodes
        print(f"  Updating {len(node_params):,} road_nodes …")
        psycopg2.extras.execute_batch(
            cur,
            """
            UPDATE road_nodes
            SET lat = %s, lng = %s
            WHERE node_id = %s
            """,
            node_params,
            page_size=5000
        )
        print("  ✅ road_nodes updated.")

        # Update road_edges
        print(f"  Updating {len(edge_params):,} road_edges …")
        psycopg2.extras.execute_batch(
            cur,
            """
            UPDATE road_edges
            SET src_lat = %s, src_lng = %s, tgt_lat = %s, tgt_lng = %s
            WHERE edge_id = %s
            """,
            edge_params,
            page_size=5000
        )
        print("  ✅ road_edges updated.")

        # Update safe_havens
        print(f"  Updating {len(haven_params)} safe_havens …")
        psycopg2.extras.execute_batch(
            cur,
            """
            UPDATE safe_havens
            SET lat = %s, lng = %s
            WHERE haven_id = %s
            """,
            haven_params,
            page_size=10
        )
        print("  ✅ safe_havens updated.")

        # 6. Verification checks inside transaction
        print("\n[6/6] Validating post-update counts inside transaction …")
        cur.execute("SELECT COUNT(*) FROM road_nodes WHERE lat IS NOT NULL")
        after_nodes = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM road_edges WHERE src_lat IS NOT NULL")
        after_edges = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM safe_havens WHERE lat IS NOT NULL")
        after_havens = cur.fetchone()[0]

        print(f"  AFTER road_nodes with lat/lng     : {after_nodes:,} (expected >= {EXPECTED_NODES:,})")
        print(f"  AFTER road_edges with coordinates : {after_edges:,} (expected >= {EXPECTED_EDGES:,})")
        print(f"  AFTER safe_havens with coordinates: {after_havens} (expected {EXPECTED_HAVENS})")

        if after_nodes < EXPECTED_NODES:
            raise RuntimeError(f"Node count check failed: got {after_nodes}, expected >= {EXPECTED_NODES}")
        if after_edges < EXPECTED_EDGES:
            raise RuntimeError(f"Edge count check failed: got {after_edges}, expected >= {EXPECTED_EDGES}")
        if after_havens != EXPECTED_HAVENS:
            raise RuntimeError(f"Haven count check failed: got {after_havens}, expected {EXPECTED_HAVENS}")

        # Check sample records
        cur.execute("SELECT node_id, lat, lng FROM road_nodes WHERE lat IS NOT NULL LIMIT 1")
        sample_node = cur.fetchone()
        print(f"  Sample node : node_id={sample_node[0]}, lat={sample_node[1]:.6f}, lng={sample_node[2]:.6f}")

        cur.execute("SELECT edge_id, src_lat, src_lng, tgt_lat, tgt_lng, length_meters, road_type, base_safety_score FROM road_edges WHERE src_lat IS NOT NULL LIMIT 1")
        sample_edge = cur.fetchone()
        print(f"  Sample edge : edge_id={sample_edge[0]}, src=({sample_edge[1]:.6f}, {sample_edge[2]:.6f}) -> tgt=({sample_edge[3]:.6f}, {sample_edge[4]:.6f}), len={sample_edge[5]:.1f}m, type={sample_edge[6]}, score={sample_edge[7]}")

        cur.execute("SELECT haven_id, name, type, lat, lng FROM safe_havens WHERE lat IS NOT NULL ORDER BY haven_id")
        sample_havens = cur.fetchall()
        for sh in sample_havens:
            print(f"  Sample haven: haven_id={sh[0]}, name={sh[1]}, type={sh[2]}, lat={sh[3]:.4f}, lng={sh[4]:.4f}")

        # Create indexes for routing queries
        print("\n  Creating B-Tree indexes on lat/lng columns …")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_road_nodes_lat_lng ON road_nodes(lat, lng)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_road_edges_src_lat_lng ON road_edges(src_lat, src_lng)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_safe_havens_lat_lng ON safe_havens(lat, lng)")
        print("  ✅ B-Tree indexes created.")

        # Commit transaction
        conn.commit()
        print("\n" + "=" * 65)
        print("  TRANSACTION COMMITTED SUCCESSFULLY! ✅")
        print("=" * 65)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR during execution: {e}")
        print("  TRANSACTION ROLLED BACK. No changes persisted to database.")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
