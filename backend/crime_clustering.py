import os
import asyncio
import numpy as np
import asyncpg
from sklearn.cluster import DBSCAN

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123456@localhost:5432/crime_navigation"
)

DBSCAN_EPS = 0.005
DBSCAN_MIN_SAMPLES = 3
CRIME_RADIUS = 0.01


async def update_safety_scores():

    pool = await asyncpg.create_pool(
        DATABASE_URL
    )

    print("Connected to database")

    try:

        async with pool.acquire() as conn:

            crimes = await conn.fetch("""
                SELECT
                    crime_id,
                    severity_weight,
                    ST_X(geom) AS lng,
                    ST_Y(geom) AS lat
                FROM historical_crimes
                WHERE date_reported >= CURRENT_DATE - INTERVAL '3 years'
            """)

            print(
                f"Loaded {len(crimes)} crime records"
            )

            if not crimes:
                print(
                    "No crime data found."
                )
                return

            coords = np.array(
                [
                    [float(c["lat"]), float(c["lng"])]
                    for c in crimes
                ]
            )

            weights = np.array(
                [
                    float(c["severity_weight"])
                    for c in crimes
                ]
            )

            print("Running DBSCAN...")

            db = DBSCAN(
                eps=DBSCAN_EPS,
                min_samples=DBSCAN_MIN_SAMPLES
            )

            labels = db.fit_predict(
                coords
            )

            cluster_labels = set(labels)

            cluster_count = len(
                cluster_labels
                - {-1}
            )

            noise_count = int(
                np.sum(labels == -1)
            )

            print(
                f"Found {cluster_count} crime clusters"
            )

            print(
                f"Noise points: {noise_count}"
            )

            cluster_risk = {}

            for cluster_id in cluster_labels:

                if cluster_id == -1:
                    continue

                cluster_weights = weights[
                    labels == cluster_id
                ]

                cluster_risk[
                    cluster_id
                ] = float(
                    np.mean(cluster_weights)
                )

            print(
                "Calculating road safety scores..."
            )

            edges = await conn.fetch("""
                SELECT
                    edge_id,
                    ST_X(
                        ST_Centroid(geom)
                    ) AS lng,
                    ST_Y(
                        ST_Centroid(geom)
                    ) AS lat
                FROM road_edges
            """)

            print(
                f"Processing {len(edges)} road segments"
            )

            updates = []

            for edge in edges:

                edge_lat = float(
                    edge["lat"]
                )

                edge_lng = float(
                    edge["lng"]
                )

                edge_point = np.array(
                    [
                        edge_lat,
                        edge_lng
                    ]
                )

                distances = np.linalg.norm(
                    coords - edge_point,
                    axis=1
                )

                nearby = distances < CRIME_RADIUS

                max_risk = 0.0

                if np.any(nearby):

                    nearby_distances = (
                        distances[nearby]
                    )

                    nearby_weights = (
                        weights[nearby]
                    )

                    penalties = (
                        nearby_weights
                        * (
                            1
                            - nearby_distances
                            / CRIME_RADIUS
                        )
                    )

                    max_risk = float(
                        np.max(penalties)
                    )

                safety_score = round(
                    10 * (
                        1 - max_risk
                    ),
                    2
                )

                safety_score = max(
                    0.0,
                    min(
                        10.0,
                        safety_score
                    )
                )

                updates.append(
                    (
                        safety_score,
                        edge["edge_id"]
                    )
                )

            print(
                "Updating PostgreSQL..."
            )

            await conn.executemany(
                """
                UPDATE road_edges
                SET base_safety_score = $1
                WHERE edge_id = $2
                """,
                updates
            )

            print(
                f"Updated safety scores for "
                f"{len(updates)} road segments"
            )

            result = await conn.fetchrow("""
                SELECT
                    COUNT(*) AS total,
                    ROUND(
                        AVG(base_safety_score)::numeric,
                        2
                    ) AS average_score,
                    MIN(base_safety_score)
                        AS minimum_score,
                    MAX(base_safety_score)
                        AS maximum_score
                FROM road_edges
            """)

            print()
            print("Safety Score Summary")
            print("--------------------")
            print(
                f"Total roads: {result['total']}"
            )
            print(
                f"Average score: {result['average_score']}"
            )
            print(
                f"Minimum score: {result['minimum_score']}"
            )
            print(
                f"Maximum score: {result['maximum_score']}"
            )

            print()
            print(
                "DBSCAN clustering and safety "
                "score calculation complete."
            )

    finally:

        await pool.close()


if __name__ == "__main__":
    asyncio.run(
        update_safety_scores()
    )