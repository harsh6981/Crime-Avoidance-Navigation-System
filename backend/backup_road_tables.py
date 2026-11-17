import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

async def backup_tables():
    db_url = os.getenv("DATABASE_URL")
    print(f"Connecting to DB for backup: {db_url}")
    conn = await asyncpg.connect(db_url)
    
    print("Creating backup table: road_nodes_mmr_backup...")
    await conn.execute("DROP TABLE IF EXISTS road_nodes_mmr_backup")
    await conn.execute("CREATE TABLE road_nodes_mmr_backup AS SELECT * FROM road_nodes")
    nodes_backup_count = await conn.fetchval("SELECT COUNT(*) FROM road_nodes_mmr_backup")
    print(f"road_nodes_mmr_backup: {nodes_backup_count:,} rows backed up.")
    
    print("Creating backup table: road_edges_mmr_backup...")
    await conn.execute("DROP TABLE IF EXISTS road_edges_mmr_backup")
    await conn.execute("CREATE TABLE road_edges_mmr_backup AS SELECT * FROM road_edges")
    edges_backup_count = await conn.fetchval("SELECT COUNT(*) FROM road_edges_mmr_backup")
    print(f"road_edges_mmr_backup: {edges_backup_count:,} rows backed up.")
    
    await conn.close()
    print("Backup complete!")

if __name__ == "__main__":
    asyncio.run(backup_tables())

