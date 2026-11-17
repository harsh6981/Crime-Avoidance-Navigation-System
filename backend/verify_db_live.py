"""
verify_db_live.py
=================
Verifies that the live PostgreSQL database can now be queried by FastAPI:
- road_nodes (lat, lng)
- road_edges (src_lat, src_lng, tgt_lat, tgt_lng)
- safe_havens (lat, lng)
- bounding box road query (as used by get_road_edges)
- nearest safe havens query (as used by get_safe_havens)
"""

import asyncio, os, asyncpg
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv("DATABASE_URL")

async def main():
    print("=" * 60)
    print("  VERIFYING LIVE DATABASE & FASTAPI QUERIES")
    print("=" * 60)

    pool = await asyncpg.create_pool(DATABASE_URL)
    async with pool.acquire() as conn:
        # 1. Counts
        nodes_total = await conn.fetchval("SELECT COUNT(*) FROM road_nodes")
        nodes_with_coords = await conn.fetchval("SELECT COUNT(*) FROM road_nodes WHERE lat IS NOT NULL AND lng IS NOT NULL")
        nodes_null = await conn.fetchval("SELECT COUNT(*) FROM road_nodes WHERE lat IS NULL")

        edges_total = await conn.fetchval("SELECT COUNT(*) FROM road_edges")
        edges_with_coords = await conn.fetchval("SELECT COUNT(*) FROM road_edges WHERE src_lat IS NOT NULL AND tgt_lat IS NOT NULL")
        edges_null = await conn.fetchval("SELECT COUNT(*) FROM road_edges WHERE src_lat IS NULL")

        havens_total = await conn.fetchval("SELECT COUNT(*) FROM safe_havens")
        havens_with_coords = await conn.fetchval("SELECT COUNT(*) FROM safe_havens WHERE lat IS NOT NULL")

        print(f"road_nodes : {nodes_with_coords:,} populated / {nodes_total:,} total ({nodes_null:,} unmatched remain NULL)")
        print(f"road_edges : {edges_with_coords:,} populated / {edges_total:,} total ({edges_null:,} unmatched remain NULL)")
        print(f"safe_havens: {havens_with_coords} populated / {havens_total} total")

        # 2. Test get_road_edges bounding box query (Bandra to Andheri area)
        min_lat, max_lat = 19.04, 19.12
        min_lng, max_lng = 72.82, 72.88

        edges = await conn.fetch("""
            SELECT e.edge_id, e.source_node, e.target_node,
                   e.length_meters, e.road_type, e.is_lit,
                   e.base_safety_score, e.isolation_risk,
                   e.src_lng, e.src_lat, e.tgt_lng, e.tgt_lat
            FROM road_edges e
            WHERE e.src_lat BETWEEN $1 AND $2
              AND e.src_lng BETWEEN $3 AND $4
            LIMIT 5
        """, min_lat, max_lat, min_lng, max_lng)

        bbox_count = await conn.fetchval("""
            SELECT COUNT(*)
            FROM road_edges e
            WHERE e.src_lat BETWEEN $1 AND $2
              AND e.src_lng BETWEEN $3 AND $4
        """, min_lat, max_lat, min_lng, max_lng)

        print(f"\nBounding Box Query [lat: {min_lat}-{max_lat}, lng: {min_lng}-{max_lng}]:")
        print(f"  Total edges in bbox: {bbox_count:,}")
        for r in edges[:2]:
            print(f"  Sample edge: {dict(r)}")

        # 3. Test get_safe_havens query near Bandra (19.055, 72.840)
        user_lat, user_lng = 19.055, 72.840
        radius_m = 5000
        havens = await conn.fetch("""
            SELECT haven_id, name, type, contact_number, lat, lng,
                   ROUND((SQRT(POWER(lat - $1, 2) + POWER(lng - $2, 2)) * 111320)::numeric, 1) AS dist_meters
            FROM safe_havens
            WHERE lat IS NOT NULL
              AND SQRT(POWER(lat - $1, 2) + POWER(lng - $2, 2)) * 111320 <= $3
            ORDER BY dist_meters
            LIMIT 5
        """, user_lat, user_lng, radius_m)

        print(f"\nSafe Havens Query near ({user_lat}, {user_lng}) within {radius_m}m:")
        for h in havens:
            print(f"  {h['name']} ({h['type']}) - {h['dist_meters']}m away (lat={h['lat']}, lng={h['lng']})")

    await pool.close()
    print("\n✅ ALL DATABASE TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(main())

