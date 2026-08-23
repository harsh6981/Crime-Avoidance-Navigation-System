import asyncio
import asyncpg
import os
import random

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123456@localhost:5432/crime_navigation"
)


ROAD_ISOLATION = {
    "motorway": 0.05,
    "trunk": 0.10,
    "primary": 0.15,
    "secondary": 0.25,
    "tertiary": 0.35,
    "residential": 0.45,
    "service": 0.60,
    "pedestrian": 0.55,
    "footway": 0.70,
    "path": 0.80,
    "cycleway": 0.65,
}


async def generate_isolation():

    pool = await asyncpg.create_pool(
        DATABASE_URL
    )

    async with pool.acquire() as conn:

        roads = await conn.fetch(
            """
            SELECT edge_id, road_type
            FROM road_edges
            """
        )

        print(
            f"Processing {len(roads)} road segments"
        )

        updates = []

        for road in roads:

            base_value = ROAD_ISOLATION.get(
                road["road_type"],
                0.50
            )

            variation = random.uniform(
                -0.10,
                0.10
            )

            isolation = base_value + variation

            isolation = max(
                0.0,
                min(1.0, isolation)
            )

            updates.append(
                (
                    round(isolation, 3),
                    road["edge_id"]
                )
            )

        await conn.executemany(
            """
            UPDATE road_edges
            SET isolation_risk = $1
            WHERE edge_id = $2
            """,
            updates
        )

        print(
            f"Updated {len(updates)} isolation values"
        )

        result = await conn.fetchrow(
            """
            SELECT
                ROUND(
                    AVG(isolation_risk)::numeric,
                    3
                ) AS average,
                MIN(isolation_risk) AS minimum,
                MAX(isolation_risk) AS maximum
            FROM road_edges
            """
        )

        print()
        print("Isolation Risk Summary")
        print("----------------------")
        print(
            f"Average: {result['average']}"
        )
        print(
            f"Minimum: {result['minimum']}"
        )
        print(
            f"Maximum: {result['maximum']}"
        )

    await pool.close()


if __name__ == "__main__":
    asyncio.run(
        generate_isolation()
    )

    