import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')
DB_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/safepath')

async def inspect():
    conn = await asyncpg.connect(DB_URL)
    print("=== Table Counts & Geographic Extents ===")
    tables = ['crime_clusters', 'historical_crimes', 'staging_mumbai_crimes', 'road_nodes', 'road_edges']
    for t in tables:
        try:
            count = await conn.fetchval(f"SELECT COUNT(*) FROM {t}")
            print(f"{t}: {count} rows")
        except Exception as e:
            print(f"{t}: error {e}")
    
    # Check crime_clusters count & data
    rows = await conn.fetch("SELECT cluster_id, police_station, zone, centroid_lat, centroid_lng, incident_count, risk_score FROM crime_clusters ORDER BY cluster_id")
    print(f"\n=== All crime_clusters ({len(rows)}) ===")
    for r in rows:
        print(dict(r))
        
    print("\n=== Geographic Extents (Min/Max Lat & Lng) ===")
    try:
        r = await conn.fetchrow("SELECT MIN(centroid_lat) min_lat, MAX(centroid_lat) max_lat, MIN(centroid_lng) min_lng, MAX(centroid_lng) max_lng FROM crime_clusters")
        print("crime_clusters extent:", dict(r))
    except Exception as e:
        print("crime_clusters extent error:", e)
        
    try:
        r = await conn.fetchrow("SELECT MIN(latitude) min_lat, MAX(latitude) max_lat, MIN(longitude) min_lng, MAX(longitude) max_lng, COUNT(*) total FROM historical_crimes WHERE source != 'synthetic'")
        print("historical_crimes (non-synthetic) extent:", dict(r))
    except Exception as e:
        print("historical_crimes extent error:", e)

    try:
        r = await conn.fetchrow("SELECT MIN(latitude) min_lat, MAX(latitude) max_lat, MIN(longitude) min_lng, MAX(longitude) max_lng, COUNT(*) total FROM staging_mumbai_crimes")
        print("staging_mumbai_crimes extent:", dict(r))
    except Exception as e:
        print("staging_mumbai_crimes extent error:", e)

    try:
        r = await conn.fetchrow("SELECT MIN(lat) min_lat, MAX(lat) max_lat, MIN(lon) min_lng, MAX(lon) max_lng FROM road_nodes")
        print("road_nodes extent:", dict(r))
    except Exception as e:
        print("road_nodes extent error:", e)

    # Check distribution of historical_crimes across police stations
    print("\n=== Police Station incident counts in historical_crimes ===")
    ps_rows = await conn.fetch("""
        SELECT police_station, COUNT(*) as cnt, 
               MIN(latitude) as min_lat, MAX(latitude) as max_lat,
               MIN(longitude) as min_lng, MAX(longitude) as max_lng,
               AVG(latitude) as avg_lat, AVG(longitude) as avg_lng
        FROM historical_crimes
        WHERE source != 'synthetic' AND latitude IS NOT NULL AND longitude IS NOT NULL
        GROUP BY police_station
        ORDER BY cnt DESC
        LIMIT 25
    """)
    for ps in ps_rows:
        print(dict(ps))

    await conn.close()

if __name__ == '__main__':
    asyncio.run(inspect())
