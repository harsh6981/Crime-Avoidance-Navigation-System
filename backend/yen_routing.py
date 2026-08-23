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

MIN_DIVERSITY = 0.05


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

        crime_risk = 1 - (row["base_safety_score"] / 10)

        isolation_risk = float(
            row["isolation_risk"] or 0.0
        )

        safety_score = calculate_safety_score(
            crime_risk=crime_risk,
            is_lit=row["is_lit"],
            isolation=isolation_risk,
            hazard_risk=0.0
        )

        risk = 10 - safety_score

        cost = row["length_meters"] * (1 + risk)

        graph.setdefault(source, []).append(
            (target, cost, row["length_meters"])
        )

        graph.setdefault(target, []).append(
            (source, cost, row["length_meters"])
        )

    return graph


async def load_coordinates(conn):
    rows = await conn.fetch(
        """
        SELECT
            node_id,
            ST_Y(geom) AS lat,
            ST_X(geom) AS lng
        FROM road_nodes
        """
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
        return 0

    a = coordinates[node]
    b = coordinates[goal]

    return haversine(
        a["lat"],
        a["lng"],
        b["lat"],
        b["lng"]
    )


def astar(
    graph,
    start,
    goal,
    coordinates,
    blocked_edges=None,
    blocked_nodes=None
):
    blocked_edges = blocked_edges or set()
    blocked_nodes = blocked_nodes or set()

    if start in blocked_nodes or goal in blocked_nodes:
        return None

    open_set = [(0, start)]

    came_from = {}
    g_score = {start: 0}

    while open_set:

        _, current = heapq.heappop(open_set)

        if current == goal:

            path = []

            while current in came_from:
                path.append(current)
                current = came_from[current]

            path.append(start)
            path.reverse()

            return path

        for neighbor, cost, _ in graph.get(current, []):

            if neighbor in blocked_nodes:
                continue

            if (current, neighbor) in blocked_edges:
                continue

            tentative_g = (
                g_score[current] + cost
            )

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
                    (f_score, neighbor)
                )

    return None


def path_cost(path, graph):
    total = 0

    for i in range(len(path) - 1):

        current = path[i]
        next_node = path[i + 1]

        for neighbor, cost, _ in graph.get(current, []):

            if neighbor == next_node:
                total += cost
                break

    return total


def path_distance(path, graph):
    total = 0

    for i in range(len(path) - 1):

        current = path[i]
        next_node = path[i + 1]

        for neighbor, _, distance in graph.get(current, []):

            if neighbor == next_node:
                total += distance
                break

    return total


def route_similarity(path_a, path_b):

    edges_a = set(
        zip(path_a[:-1], path_a[1:])
    )

    edges_b = set(
        zip(path_b[:-1], path_b[1:])
    )

    if not edges_a or not edges_b:
        return 0

    common = len(edges_a & edges_b)

    return common / min(
        len(edges_a),
        len(edges_b)
    )


def is_diverse(path, selected_paths):

    for existing in selected_paths:

        similarity = route_similarity(
            path,
            existing
        )

        difference = 1 - similarity

        if difference < MIN_DIVERSITY:
            return False

    return True


def yen_k_shortest_paths(
    graph,
    start,
    goal,
    coordinates,
    k=3
):

    first_path = astar(
        graph,
        start,
        goal,
        coordinates
    )

    if not first_path:
        return []

    shortest_paths = [first_path]

    candidates = []
    candidate_set = set()

    for _ in range(1, k):

        paths_to_generate = list(shortest_paths)

        for previous_path in paths_to_generate:

            for i in range(len(previous_path) - 1):

                spur_node = previous_path[i]

                root_path = previous_path[:i + 1]

                removed_edges = set()

                for existing_path in shortest_paths:

                    if (
                        len(existing_path) > i
                        and existing_path[:i + 1] == root_path
                    ):

                        removed_edges.add(
                            (
                                existing_path[i],
                                existing_path[i + 1]
                            )
                        )

                blocked_nodes = set(
                    root_path[:-1]
                )

                spur_path = astar(
                    graph,
                    spur_node,
                    goal,
                    coordinates,
                    blocked_edges=removed_edges,
                    blocked_nodes=blocked_nodes
                )

                if not spur_path:
                    continue

                total_path = (
                    root_path[:-1]
                    + spur_path
                )

                path_tuple = tuple(total_path)

                if path_tuple in candidate_set:
                    continue

                if total_path in shortest_paths:
                    continue

                candidate_set.add(path_tuple)

                cost = path_cost(
                    total_path,
                    graph
                )

                heapq.heappush(
                    candidates,
                    (
                        cost,
                        path_tuple
                    )
                )

        selected = None

        while candidates:

            _, candidate_tuple = heapq.heappop(
                candidates
            )

            candidate = list(candidate_tuple)

            if is_diverse(
                candidate,
                shortest_paths
            ):
                selected = candidate
                break

        if selected is None:
            break

        shortest_paths.append(selected)

    return shortest_paths


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

        print(
            f"Start node: {start_node}"
        )

        print(
            f"Goal node: {goal_node}"
        )

        print(
            "Building road graph..."
        )

        graph = await build_graph(
            conn
        )

        print(
            f"Graph contains {len(graph)} nodes"
        )

        print(
            "Loading coordinates..."
        )

        coordinates = await load_coordinates(
            conn
        )

        print(
            f"Loaded coordinates for {len(coordinates)} nodes"
        )

        print(
            "Running Yen's K-Shortest Paths..."
        )

        routes = yen_k_shortest_paths(
            graph,
            start_node,
            goal_node,
            coordinates,
            k=3
        )

        if not routes:

            print(
                "No routes found"
            )

            await pool.close()
            return

        print()
        print(
            "SAFE ROUTE ALTERNATIVES"
        )
        print(
            "======================="
        )

        for index, route in enumerate(
            routes,
            1
        ):

            distance = path_distance(
                route,
                graph
            )

            cost = path_cost(
                route,
                graph
            )

            print()
            print(
                f"Route {index}"
            )

            print(
                "---------"
            )

            print(
                f"Nodes: {len(route)}"
            )

            print(
                f"Distance: {distance / 1000:.2f} km"
            )

            print(
                f"Safety cost: {cost:.2f}"
            )

            if index > 1:

                similarity = route_similarity(
                    route,
                    routes[0]
                )

                print(
                    f"Difference from Route 1: "
                    f"{(1 - similarity) * 100:.2f}%"
                )

            print(
                "First 3 coordinates:"
            )

            for node in route[:3]:

                print(
                    coordinates[node]
                )

    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())