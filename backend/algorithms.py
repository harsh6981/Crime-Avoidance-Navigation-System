"""
SafePath — Advanced Routing Algorithms
========================================
Implements:
  1. Yen's K-Shortest Paths   → Multiple route alternatives
  2. Bellman-Ford              → Dynamic/negative-weight edge support
  3. TomTom Traffic Integration → Real-time congestion as edge weights

These are imported and called from main.py.
"""

import heapq
import math
import os
import httpx  # pip install httpx (async HTTP)
from copy import deepcopy
from typing import Optional

# ── Same config as main.py ──
TOMTOM_API_KEY = os.getenv("TOMTOM_API_KEY", "YOUR_TOMTOM_API_KEY_HERE")


# ═══════════════════════════════════════════════════════════
# 1. YEN'S K-SHORTEST PATHS ALGORITHM
#    Generates k alternative routes so the user can compare.
#    Used for: "Show me 3 safe route options"
# ═══════════════════════════════════════════════════════════

def yens_k_shortest(graph: dict, source, destination, k: int = 3) -> list:
    """
    Yen's K-Shortest Paths Algorithm.

    Returns up to k distinct paths from source to destination,
    ranked by composite cost (safety + distance).

    Args:
        graph:       {"nodes": {id: (lat,lng)}, "edges": {id: {neighbor: edge_data}}}
        source:      node id of start
        destination: node id of end
        k:           number of alternative paths to return

    Returns:
        List of path dicts: [{"nodes": [...], "cost": float, "distance": float, "safety_score": float}]
    """
    def dijkstra(g, src, dst, ignore_nodes=None, ignore_edges=None):
        """Modified Dijkstra that can exclude specific nodes/edges."""
        ignore_nodes = ignore_nodes or set()
        ignore_edges = ignore_edges or set()

        dist = {src: 0.0}
        prev = {src: None}
        heap = [(0.0, src)]

        while heap:
            cost, u = heapq.heappop(heap)
            if u == dst:
                # Reconstruct path
                path = []
                cur = dst
                while cur is not None:
                    path.append(cur)
                    cur = prev[cur]
                path.reverse()
                return path, cost

            if cost > dist.get(u, float("inf")):
                continue

            for v, edge in g["edges"].get(u, {}).items():
                if v in ignore_nodes:
                    continue
                if (u, v) in ignore_edges or (v, u) in ignore_edges:
                    continue

                safety_cost = (10 - edge["safety_score"]) / 10.0
                edge_cost = edge["length"] * (1 + safety_cost)
                new_cost = cost + edge_cost

                if new_cost < dist.get(v, float("inf")):
                    dist[v] = new_cost
                    prev[v] = u
                    heapq.heappush(heap, (new_cost, v))

        return None, float("inf")  # No path found

    # ── Phase 1: Find the first (best) path ──
    first_path, first_cost = dijkstra(graph, source, destination)
    if not first_path:
        return []

    def path_to_info(path, cost):
        total_dist = sum(
            graph["edges"].get(path[i], {}).get(path[i+1], {}).get("length", 0)
            for i in range(len(path) - 1)
        )
        safety_scores = [
            graph["edges"].get(path[i], {}).get(path[i+1], {}).get("safety_score", 5)
            for i in range(len(path) - 1)
        ]
        avg_safety = sum(safety_scores) / max(len(safety_scores), 1)
        return {"nodes": path, "cost": cost, "distance": total_dist, "safety_score": avg_safety}

    A = [path_to_info(first_path, first_cost)]  # Confirmed k-shortest paths
    B = []  # Candidate paths (heap)

    for ki in range(1, k):
        prev_path = A[ki - 1]["nodes"]

        # ── Phase 2: Generate candidates by "spurring" from each spur node ──
        for spur_idx in range(len(prev_path) - 1):
            spur_node   = prev_path[spur_idx]
            root_path   = prev_path[:spur_idx + 1]
            # Recompute actual cost along root_path edges (fixes incorrect fractional estimate)
            root_cost = 0.0
            for ri in range(len(root_path) - 1):
                edge = graph["edges"].get(root_path[ri], {}).get(root_path[ri + 1], {})
                safety_cost = (10 - edge.get("safety_score", 5)) / 10.0
                root_cost += edge.get("length", 0) * (1 + safety_cost)

            # Remove edges that are part of previous k-shortest paths with same root
            ignore_edges = set()
            ignore_nodes = set(root_path[:-1])  # Don't revisit root nodes

            for prev_k_path in A:
                prev_nodes = prev_k_path["nodes"]
                if len(prev_nodes) > spur_idx and prev_nodes[:spur_idx + 1] == root_path:
                    u = prev_nodes[spur_idx]
                    v = prev_nodes[spur_idx + 1]
                    ignore_edges.add((u, v))

            spur_path, spur_cost = dijkstra(
                graph, spur_node, destination,
                ignore_nodes=ignore_nodes,
                ignore_edges=ignore_edges,
            )

            if spur_path:
                total_path = root_path[:-1] + spur_path
                total_cost = root_cost + spur_cost

                candidate = path_to_info(total_path, total_cost)

                # Only add if not already in candidates or A
                already_seen = any(
                    c["nodes"] == total_path for c in B
                ) or any(
                    p["nodes"] == total_path for p in A
                )
                if not already_seen:
                    heapq.heappush(B, (total_cost, id(candidate), candidate))

        if not B:
            break

        _, _, best_candidate = heapq.heappop(B)
        A.append(best_candidate)

    return A


# ═══════════════════════════════════════════════════════════
# 2. BELLMAN-FORD ALGORITHM
#    Handles dynamic/negative edge weights.
#    Used for: sudden night-time penalties, real-time hazard spikes
#
#    Bellman-Ford is slower than A* (O(VE) vs O(E log V)) but
#    correctly handles negative weights, which can occur when:
#    - A hazard is suddenly reported and creates a large penalty
#    - Time crosses into night and lighting scores drop sharply
#    - A road closure creates forced re-routing
# ═══════════════════════════════════════════════════════════

def bellman_ford(graph: dict, source, destination, dynamic_penalties: dict = None) -> dict:
    """
    Bellman-Ford shortest path with dynamic penalty support.

    Args:
        graph:             Standard graph dict
        source:            Start node id
        destination:       End node id
        dynamic_penalties: {edge_id: extra_cost} — applied on top of base costs
                           Can be negative (bonuses) or positive (penalties)

    Returns:
        {"nodes": [...], "distance": float, "safety_score": float}
        or None if no path exists / negative cycle detected
    """
    dynamic_penalties = dynamic_penalties or {}
    nodes = list(graph["nodes"].keys())

    # Initialize distances
    dist = {n: float("inf") for n in nodes}
    dist[source] = 0.0
    prev = {n: None for n in nodes}

    # Build flat edge list for iteration
    edges = []
    for u, neighbors in graph["edges"].items():
        for v, edata in neighbors.items():
            safety_cost = (10 - edata["safety_score"]) / 10.0
            base_cost = edata["length"] * (1 + safety_cost)
            penalty = dynamic_penalties.get((u, v), 0) + dynamic_penalties.get((v, u), 0)
            edges.append((u, v, base_cost + penalty))

    # Relax edges |V| - 1 times
    for _ in range(len(nodes) - 1):
        updated = False
        for u, v, w in edges:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                prev[v] = u
                updated = True
        if not updated:
            break  # Early exit if no updates

    # Check for negative cycles (shouldn't occur in road networks but be safe)
    for u, v, w in edges:
        if dist[u] + w < dist[v]:
            print("⚠ Negative cycle detected in graph — returning None")
            return None

    if dist[destination] == float("inf"):
        return None  # No path exists

    # Reconstruct path
    path = []
    cur = destination
    while cur is not None:
        path.append(cur)
        cur = prev[cur]
    path.reverse()

    if not path or path[0] != source:
        return None

    total_dist = sum(
        graph["edges"].get(path[i], {}).get(path[i+1], {}).get("length", 0)
        for i in range(len(path) - 1)
    )
    safety_scores = [
        graph["edges"].get(path[i], {}).get(path[i+1], {}).get("safety_score", 5)
        for i in range(len(path) - 1)
    ]
    avg_safety = sum(safety_scores) / max(len(safety_scores), 1)

    return {
        "nodes": path,
        "distance": total_dist,
        "safety_score": avg_safety,
    }


def compute_dynamic_penalties(hazards: list, graph: dict, is_night: bool) -> dict:
    """
    Build a dynamic_penalties dict from:
      - Active MongoDB hazard reports
      - Night-time lighting penalties
      - Recent crime spike events

    Returns: {(node_u, node_v): penalty_cost}
    """
    penalties = {}

    for hazard in hazards:
        edge_id = hazard.get("mapped_edge_id")
        if not edge_id:
            continue
        severity = hazard.get("severity", 5)
        verify   = hazard.get("verification_score", 1)

        # Higher severity + more verifications = bigger penalty
        penalty = (severity / 10.0) * (1 + min(verify, 5) * 0.1) * 3.0

        # Find the edge in the graph and apply penalty to both directions
        for u, neighbors in graph["edges"].items():
            for v, edata in neighbors.items():
                if str(edata.get("edge_id")) == str(edge_id):
                    penalties[(u, v)] = penalties.get((u, v), 0) + penalty
                    penalties[(v, u)] = penalties.get((v, u), 0) + penalty

    # Night penalty for unlit edges
    if is_night:
        for u, neighbors in graph["edges"].items():
            for v, edata in neighbors.items():
                if not edata.get("is_lit", False):
                    penalties[(u, v)] = penalties.get((u, v), 0) + 2.5
                    penalties[(v, u)] = penalties.get((v, u), 0) + 2.5

    return penalties


# ═══════════════════════════════════════════════════════════
# 3. TOMTOM TRAFFIC INTEGRATION
#    Fetches live congestion data and translates it into
#    edge weight adjustments for the routing engine.
# ═══════════════════════════════════════════════════════════

async def fetch_tomtom_traffic(lat: float, lng: float, radius_meters: int = 5000) -> list:
    """
    Fetch live traffic incidents from TomTom Traffic API.

    🔑 Requires TOMTOM_API_KEY in environment variables.
    Get key: https://developer.tomtom.com → My Apps → Create App
    Free tier: 2,500 requests/day

    Returns list of traffic incidents near the given coordinates.
    """
    if TOMTOM_API_KEY == "YOUR_TOMTOM_API_KEY_HERE":
        print("⚠ TomTom API key not set — skipping traffic data")
        return []

    url = (
        f"https://api.tomtom.com/traffic/services/5/incidentDetails"
        f"?key={TOMTOM_API_KEY}"
        f"&bbox={lng-0.05},{lat-0.05},{lng+0.05},{lat+0.05}"
        f"&fields={{incidents{{type,geometry{{type,coordinates}},properties{{events{{code,description}},delay,roadNumbers}}}}}}"
        f"&language=en-GB"
        f"&timeValidityFilter=present"
    )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()
            return data.get("incidents", [])
    except Exception as e:
        print(f"TomTom API error: {e}")
        return []


async def fetch_tomtom_flow(lat: float, lng: float) -> dict:
    """
    Fetch real-time traffic flow (speed vs free-flow speed).
    Used to determine crowd/congestion level for safety scoring.

    Returns: {"current_speed": float, "free_flow_speed": float, "congestion_level": 0-10}
    """
    if TOMTOM_API_KEY == "YOUR_TOMTOM_API_KEY_HERE":
        return {"current_speed": 30, "free_flow_speed": 50, "congestion_level": 4}

    url = (
        f"https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
        f"?key={TOMTOM_API_KEY}&point={lat},{lng}&unit=KMPH"
    )

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json().get("flowSegmentData", {})

            current   = data.get("currentSpeed", 30)
            free_flow = data.get("freeFlowSpeed", 50)

            # Congestion: 0 = free flowing (many people), 10 = gridlock (isolated)
            # For safety: moderate congestion = safer (people around)
            # Very low traffic at night = dangerous (isolated)
            ratio = current / max(free_flow, 1)
            congestion_level = round((1 - ratio) * 10, 1)

            return {
                "current_speed": current,
                "free_flow_speed": free_flow,
                "congestion_level": congestion_level,
                "crowd_safety_score": min(congestion_level * 0.6 + 3, 8),
            }
    except Exception as e:
        print(f"TomTom Flow API error: {e}")
        return {"current_speed": 30, "free_flow_speed": 50, "congestion_level": 4}


def traffic_incidents_to_penalties(incidents: list) -> list:
    """
    Convert TomTom traffic incidents into graph edge penalties.
    Maps incident GPS coordinates to nearest graph edges.

    TomTom incident codes: 0=Unknown, 1=Accident, 2=Fog, 3=Dangerous conditions,
    4=Rain, 5=Ice, 6=Jam, 7=Lane closed, 8=Road closed, 9=Road works, 14=Broken down vehicle
    """
    SEVERITY_MAP = {
        1: 4.0,   # Accident — very high penalty
        3: 2.5,   # Dangerous conditions
        5: 2.0,   # Ice
        8: 10.0,  # Road closed — effectively remove from routing
        7: 1.5,   # Lane closed
        6: 0.5,   # Jam — low safety penalty (just slow)
        9: 1.0,   # Road works
        14: 2.0,  # Broken down vehicle
    }

    geo_penalties = []  # [(lat, lng, penalty)]

    for incident in incidents:
        props = incident.get("properties", {})
        events = props.get("events", [{}])
        code = events[0].get("code", 0) if events else 0
        penalty = SEVERITY_MAP.get(code, 1.0)

        geom = incident.get("geometry", {})
        if geom.get("type") == "Point":
            coords = geom["coordinates"]  # [lng, lat]
            geo_penalties.append((coords[1], coords[0], penalty))
        elif geom.get("type") == "LineString":
            for coords in geom["coordinates"]:
                geo_penalties.append((coords[1], coords[0], penalty * 0.5))

    return geo_penalties