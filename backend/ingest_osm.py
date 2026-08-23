import asyncio
import asyncpg
import requests
import os
import math

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123456@localhost:5432/crime_navigation"
)

CITY_BBOX = "19.00,72.80,19.15,72.90"

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter"
]

ROAD_TYPES = [
    "motorway",
    "trunk",
    "primary",
    "secondary",
    "tertiary",
    "residential",
    "service",
    "pedestrian",
    "footway",
    "path",
    "cycleway"
]


def build_overpass_query(bbox):
    road_filter = "|".join(ROAD_TYPES)

    return f"""
    [out:json][timeout:180];
    (
        way["highway"~"^({road_filter})$"]({bbox});
    );
    out body geom;
    """


def haversine(lat1, lon1, lat2, lon2):
    radius = 6371000

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )

    return radius * 2 * math.asin(math.sqrt(a))


async def ingest():

    print(
        f"Downloading OSM data for bbox: {CITY_BBOX}"
    )

    query = build_overpass_query(
        CITY_BBOX
    )

    headers = {
        "User-Agent": (
            "SafePath/1.0 "
            "(Crime Avoidance Navigation System)"
        )
    }

    data = None

    for url in OVERPASS_URLS:

        try:

            print(
                f"Trying Overpass server: {url}"
            )

            response = requests.post(
                url,
                data={"data": query},
                headers=headers,
                timeout=240
            )

            if response.ok:

                data = response.json()

                print(
                    f"Connected successfully: {url}"
                )

                break

            print(
                f"Server returned HTTP "
                f"{response.status_code}"
            )

        except requests.RequestException as error:

            print(
                f"Server failed: {error}"
            )

    if data is None:

        raise RuntimeError(
            "All Overpass servers failed."
        )

    ways = data.get(
        "elements",
        []
    )

    print(
        f"Downloaded {len(ways)} road ways"
    )

    pool = await asyncpg.create_pool(
        DATABASE_URL
    )

    print(
        "Connected to database"
    )

    node_records = []
    edge_records = []

    inserted_nodes = set()

    total_edges = 0

    for way in ways:

        if (
            way.get("type") != "way"
            or "geometry" not in way
            or "nodes" not in way
        ):
            continue

        geometry = way["geometry"]
        nodes = way["nodes"]

        if len(geometry) < 2:
            continue

        road_type = way.get(
            "tags",
            {}
        ).get(
            "highway",
            "unknown"
        )

        is_lit = (
            way.get(
                "tags",
                {}
            ).get(
                "lit",
                "no"
            ).lower()
            in (
                "yes",
                "24/7",
                "automatic"
            )
        )

        for index, point in enumerate(
            geometry
        ):

            node_id = nodes[index]

            if node_id not in inserted_nodes:

                node_records.append(
                    (
                        node_id,
                        point["lon"],
                        point["lat"]
                    )
                )

                inserted_nodes.add(
                    node_id
                )

        for index in range(
            len(geometry) - 1
        ):

            p1 = geometry[index]
            p2 = geometry[index + 1]

            source_node = nodes[index]
            target_node = nodes[index + 1]

            segment_length = haversine(
                p1["lat"],
                p1["lon"],
                p2["lat"],
                p2["lon"]
            )

            wkt = (
                "SRID=4326;LINESTRING("
                f"{p1['lon']} {p1['lat']},"
                f"{p2['lon']} {p2['lat']}"
                ")"
            )

            edge_id = (
                way["id"] * 100000
                + index
            )

            edge_records.append(
                (
                    edge_id,
                    source_node,
                    target_node,
                    wkt,
                    segment_length,
                    road_type,
                    is_lit,
                    5.0
                )
            )

            total_edges += 1

    print(
        f"Prepared {len(node_records)} nodes"
    )

    print(
        f"Prepared {total_edges} road edges"
    )

    async with pool.acquire() as conn:

        await conn.executemany(
            """
            INSERT INTO road_nodes
                (
                    node_id,
                    geom
                )
            VALUES
                (
                    $1,
                    ST_SetSRID(
                        ST_MakePoint($2, $3),
                        4326
                    )
                )
            ON CONFLICT (node_id)
            DO NOTHING
            """,
            node_records
        )

        print(
            f"Inserted {len(node_records)} nodes"
        )

        await conn.executemany(
            """
            INSERT INTO road_edges
                (
                    edge_id,
                    source_node,
                    target_node,
                    geom,
                    length_meters,
                    road_type,
                    is_lit,
                    base_safety_score
                )
            VALUES
                (
                    $1,
                    $2,
                    $3,
                    $4::geometry,
                    $5,
                    $6,
                    $7,
                    $8
                )
            ON CONFLICT (edge_id)
            DO NOTHING
            """,
            edge_records
        )

        print(
            f"Inserted {total_edges} road edges"
        )

    await pool.close()

    print()
    print(
        "OSM road network ingestion complete."
    )


if __name__ == "__main__":
    asyncio.run(
        ingest()
    )