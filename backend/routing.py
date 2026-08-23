import asyncio
import asyncpg
import os
import heapq
import math
from safety_score import calculate_safety_score

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123456@localhost:5432/crime_navigation"
)


async def get_nearest_node(conn, lat, lng):
    return await conn.fetchval(
        """
        SELECT node_id
        FROM road_nodes
        ORDER BY geom <-> ST_SetSRID(
            ST_MakePoint($1, $2),
            4326
        )
        LIMIT 1
        """,
        lng,
        lat
    )


async def build_graph(conn):
    rows = await conn.fetch(
        """
        SELECT
            edge_id,
            source_node,
            target_node,
            length_meters,
            base_safety_score,
            is_lit,
            isolation_risk
        FROM road_edges
        """
    )

    graph = {}

    for row in rows:
        source = row["source_node"]
        target = row["target_node"]

        crime_risk = 1 - (row["base_safety_score"] / 10.0)

        isolation_risk = float(
            row["isolation_risk"]
            if row["isolation_risk"] is not None
            else 0.0
        )

        hazard_risk = 0.0

        safety_score = calculate_safety_score(
            crime_risk=crime_risk,
            is_lit=row["is_lit"],
            isolation=isolation_risk,
            hazard_risk=hazard_risk
        )

        risk = 10.0 - safety_score

        cost = row["length_meters"] * (1.0 + risk)

        if source not in graph:
            graph[source] = []

        if target not in graph:
            graph[target] = []

        graph[source].append(
            (
                target,
                cost,
                row["length_meters"]
            )
        )

        graph[target].append(
            (
                source,
                cost,
                row["length_meters"]
            )
        )

    return graph


async def get_all_coordinates(conn, node_ids):
    if not node_ids:
        return {}

    rows = await conn.fetch(
        """
        SELECT
            node_id,
            ST_Y(geom) AS lat,
            ST_X(geom) AS lng
        FROM road_nodes
        WHERE node_id = ANY($1::bigint[])
        """,
        list(node_ids)
    )

    return {
        row["node_id"]: {
            "lat": float(row["lat"]),
            "lng": float(row["lng"])
        }
        for row in rows
    }


def haversine(lat1, lng1, lat2, lng2):
    radius = 6371000

    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )

    return radius * 2 * math.asin(math.sqrt(a))


def heuristic(node, goal, coordinates):
    if node not in coordinates or goal not in coordinates:
        return 0.0

    a = coordinates[node]
    b = coordinates[goal]

    return haversine(
        a["lat"],
        a["lng"],
        b["lat"],
        b["lng"]
    )


def astar(graph, start, goal, coordinates):
    open_set = []

    heapq.heappush(
        open_set,
        (
            heuristic(start, goal, coordinates),
            start
        )
    )

    came_from = {}

    g_score = {
        start: 0.0
    }

    visited = set()

    while open_set:
        _, current = heapq.heappop(open_set)

        if current in visited:
            continue

        visited.add(current)

        if current == goal:
            path = []

            while current in came_from:
                path.append(current)
                current = came_from[current]

            path.append(start)
            path.reverse()

            return path

        for neighbor, cost, _ in graph.get(current, []):
            tentative_g = g_score[current] + cost

            if tentative_g < g_score.get(
                neighbor,
                float("inf")
            ):
                came_from[neighbor] = current

                g_score[neighbor] = tentative_g

                f_score = (
                    tentative_g
                    + heuristic(
                        neighbor,
                        goal,
                        coordinates
                    )
                )

                heapq.heappush(
                    open_set,
                    (
                        f_score,
                        neighbor
                    )
                )

    return None


async def main():
    pool = await asyncpg.create_pool(
        DATABASE_URL
    )

    async with pool.acquire() as conn:

        start_lat = 19.0760
        start_lng = 72.8777

        goal_lat = 19.1136
        goal_lng = 72.8479

        start_node = await get_nearest_node(
            conn,
            start_lat,
            start_lng
        )

        goal_node = await get_nearest_node(
            conn,
            goal_lat,
            goal_lng
        )

        print(f"Start node: {start_node}")
        print(f"Goal node: {goal_node}")

        if start_node is None:
            print("Start node not found")
            return

        if goal_node is None:
            print("Goal node not found")
            return

        print("Building road graph...")

        graph = await build_graph(conn)

        print(
            f"Graph contains {len(graph)} nodes"
        )

        coordinates = await get_all_coordinates(
            conn,
            graph.keys()
        )

        print(
            f"Loaded coordinates for {len(coordinates)} nodes"
        )

        print("Running A*...")

        route = astar(
            graph,
            start_node,
            goal_node,
            coordinates
        )

        if not route:
            print("No route found")
            return

        print()
        print("SAFE ROUTE FOUND")
        print("----------------")
        print(f"Nodes: {len(route)}")
        print(f"Start node: {route[0]}")
        print(f"Goal node: {route[-1]}")

        total_distance = 0.0

        for i in range(len(route) - 1):
            current = route[i]
            next_node = route[i + 1]

            for neighbor, _, distance in graph.get(
                current,
                []
            ):
                if neighbor == next_node:
                    total_distance += distance
                    break

        print(
            f"Distance: {total_distance / 1000:.2f} km"
        )

        print()
        print("First 5 coordinates:")

        for node in route[:5]:
            print(coordinates[node])

        print()
        print("Last 5 coordinates:")

        for node in route[-5:]:
            print(coordinates[node])

    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())