import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def main():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS road_edges_before_lighting AS
        SELECT * FROM road_edges
    """)

    count = await conn.fetchval(
        "SELECT COUNT(*) FROM road_edges_before_lighting"
    )

    print("Backup road records:", count)
    await conn.close()

asyncio.run(main())
