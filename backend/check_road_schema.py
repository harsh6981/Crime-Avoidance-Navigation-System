import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def main():
    load_dotenv()
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    rows = await conn.fetch("""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'road_edges'
        ORDER BY ordinal_position
    """)
    for row in rows:
        print(row["column_name"], ":", row["data_type"])
    await conn.close()

asyncio.run(main())
