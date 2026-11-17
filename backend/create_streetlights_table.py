import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def main():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS streetlights (
            id BIGINT PRIMARY KEY,
            osm_type VARCHAR(10) NOT NULL,
            geom GEOMETRY(Point, 4326) NOT NULL
        );

        CREATE INDEX IF NOT EXISTS streetlights_geom_idx
        ON streetlights USING GIST (geom);
    """)

    print("Streetlights table created successfully.")
    await conn.close()

asyncio.run(main())
