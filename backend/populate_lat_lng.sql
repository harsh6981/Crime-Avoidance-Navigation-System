-- ============================================================
-- SafePath: Populate lat/lng columns from PostGIS geometry
-- Run this in pgAdmin or psql AFTER restarting PostgreSQL.
-- Requires PostGIS to be loadable (DLL working).
-- ============================================================

-- 1. Populate road_nodes lat/lng from geometry
UPDATE road_nodes
SET lat = ST_Y(geom),
    lng = ST_X(geom)
WHERE lat IS NULL;

-- 2. Populate safe_havens lat/lng from geometry
UPDATE safe_havens
SET lat = ST_Y(geom),
    lng = ST_X(geom)
WHERE lat IS NULL;

-- 3. Populate road_edges src/tgt lat/lng via JOIN on road_nodes
UPDATE road_edges e
SET src_lat = sn.lat,
    src_lng = sn.lng,
    tgt_lat = tn.lat,
    tgt_lng = tn.lng
FROM road_nodes sn, road_nodes tn
WHERE sn.node_id = e.source_node
  AND tn.node_id = e.target_node
  AND e.src_lat IS NULL;

-- 4. Create indexes for fast bbox queries
CREATE INDEX IF NOT EXISTS idx_road_nodes_lat_lng ON road_nodes(lat, lng);
CREATE INDEX IF NOT EXISTS idx_road_edges_src_lat_lng ON road_edges(src_lat, src_lng);

-- 5. Verify
SELECT 'road_nodes with lat/lng' AS check_name, COUNT(*) AS count FROM road_nodes WHERE lat IS NOT NULL
UNION ALL
SELECT 'road_edges with src_lat', COUNT(*) FROM road_edges WHERE src_lat IS NOT NULL
UNION ALL
SELECT 'safe_havens with lat/lng', COUNT(*) FROM safe_havens WHERE lat IS NOT NULL;

