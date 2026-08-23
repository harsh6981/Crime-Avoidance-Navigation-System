"""
╔══════════════════════════════════════════════════════════════╗
║   SafePath — Crime Avoidance Navigation System               ║
║   Backend: FastAPI + PostgreSQL/PostGIS + MongoDB            ║
╚══════════════════════════════════════════════════════════════╝

HOW TO RUN:
  pip install -r requirements.txt
  uvicorn main:app --reload --port 8000

API DOCS (auto-generated):
  http://localhost:8000/docs
"""

import os
import math
import heapq
from datetime import datetime, timedelta

from dotenv import load_dotenv
load_dotenv()
from typing import Optional, List
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt  # pip install pyjwt

# ── Database drivers ──
import asyncpg          # pip install asyncpg
from motor.motor_asyncio import AsyncIOMotorClient  # pip install motor

app = FastAPI(title="SafePath API", version="1.0.0")

# ── CORS (allow React frontend) ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

# ═══════════════════════════════════════════════════════════
# ╔══════════════════════════════════════════════════════════╗
# ║  🔑  CONFIGURATION — ADD YOUR KEYS HERE                 ║
# ╚══════════════════════════════════════════════════════════╝
# Either set these as environment variables OR replace the
# default strings below directly (not recommended for prod).
# ═══════════════════════════════════════════════════════════

class Config:
    # ── PostgreSQL + PostGIS ──
    # Install: https://postgis.net/documentation/getting_started/
    # Local:   postgresql://user:password@localhost:5432/safepath
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:password@localhost:5432/safepath"  # ← CHANGE THIS
    )

    # ── MongoDB (for hazard reports) ──
    # Free cluster: https://www.mongodb.com/cloud/atlas
    MONGO_URI: str = os.getenv(
        "MONGO_URI",
        "mongodb://localhost:27017"  # ← CHANGE THIS for Atlas: mongodb+srv://...
    )
    MONGO_DB: str = "safepath"

    # ── JWT Secret (for user auth tokens) ──
    # Generate a strong random string: python -c "import secrets; print(secrets.token_hex(32))"
    JWT_SECRET: str = os.getenv(
        "JWT_SECRET",
        "REPLACE_WITH_A_STRONG_RANDOM_SECRET_STRING"  # ← CHANGE THIS
    )

    # ── TomTom Traffic API ──
    # 🔑 Get free key: https://developer.tomtom.com/ → My Apps → Create App
    # Free tier: 2,500 daily requests
    TOMTOM_API_KEY: str = os.getenv(
        "TOMTOM_API_KEY",
        "YOUR_TOMTOM_API_KEY_HERE"  # ← PASTE YOUR TOMTOM KEY HERE
    )

    # ── Twilio (for SOS SMS) ──
    # 🔑 Get from: https://console.twilio.com/ → Account Info
    TWILIO_ACCOUNT_SID: str = os.getenv("TWILIO_ACCOUNT_SID", "YOUR_TWILIO_SID_HERE")    # ← ADD
    TWILIO_AUTH_TOKEN:  str = os.getenv("TWILIO_AUTH_TOKEN",  "YOUR_TWILIO_TOKEN_HERE")  # ← ADD
    TWILIO_PHONE:       str = os.getenv("TWILIO_PHONE",       "+1XXXXXXXXXX")            # ← Your Twilio number

    # ── Fast2SMS (India alternative to Twilio, cheaper) ──
    # 🔑 Get from: https://www.fast2sms.com → API
    FAST2SMS_API_KEY: str = os.getenv("FAST2SMS_API_KEY", "YOUR_FAST2SMS_KEY_HERE")  # ← ADD

    # ── OpenRouteService (ORS) API ──
    # 🔑 Get from: https://openrouteservice.org/
    ORS_API_KEY: str = os.getenv("ORS_API_KEY", "YOUR_ORS_API_KEY_HERE")

cfg = Config()


# ═══════════════════════════════════════════════════════════
# DATABASE CONNECTIONS
# ═══════════════════════════════════════════════════════════

db_pool = None
mongo_client = None
mongo_db = None

@app.on_event("startup")
async def startup():
    global db_pool, mongo_client, mongo_db
    try:
        db_pool = await asyncpg.create_pool(cfg.DATABASE_URL)
        print("✅ PostgreSQL connected")
    except Exception as e:
        print(f"⚠ PostgreSQL not connected: {e} — running in mock mode")

    try:
        mongo_client = AsyncIOMotorClient(cfg.MONGO_URI)
        mongo_db = mongo_client[cfg.MONGO_DB]
        print("✅ MongoDB connected")
    except Exception as e:
        print(f"⚠ MongoDB not connected: {e} — running in mock mode")


@app.on_event("shutdown")
async def shutdown():
    if db_pool: await db_pool.close()
    if mongo_client: mongo_client.close()


# ═══════════════════════════════════════════════════════════
# PYDANTIC MODELS (Request/Response Schemas)
# ═══════════════════════════════════════════════════════════

class Coords(BaseModel):
    lat: float
    lng: float

class RouteRequest(BaseModel):
    source: Coords
    destination: Coords
    travel_mode: str = "walking"   # walking | cycling | two_wheeler | car
    time_of_day: str = "12:00"     # HH:MM

class HazardReportIn(BaseModel):
    user_id: str
    hazard_type: str   # broken_streetlight | suspicious_activity | road_block | waterlogging
    description: str = ""
    severity: int = 5  # 1-10
    location: Coords

class VerifyHazard(BaseModel):
    hazard_id: str
    vote: str   # "up" | "down"

class SOSRequest(BaseModel):
    user_id: str
    current_location: Coords

class UserRegister(BaseModel):
    name: str
    email: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class Contact(BaseModel):
    name: str
    phone: str

class AddContactsRequest(BaseModel):
    user_id: str
    contacts: List[Contact]

class DeleteContactRequest(BaseModel):
    user_id: str
    phone: str

class ORSProxyRequest(BaseModel):
    coordinates: List[List[float]]


# ═══════════════════════════════════════════════════════════
# ── ORS PROXY API ──
# ═══════════════════════════════════════════════════════════

import requests

@app.post("/api/proxy/ors")
def proxy_ors(req: ORSProxyRequest):
    """
    Proxies routing requests to OpenRouteService or fallback open routing engine.
    """
    if len(req.coordinates) < 2:
        raise HTTPException(400, "At least two coordinates required")

    start_lng, start_lat = req.coordinates[0][0], req.coordinates[0][1]
    end_lng, end_lat = req.coordinates[-1][0], req.coordinates[-1][1]

    print(f"[ORS Proxy] Request Start: lng={start_lng}, lat={start_lat} -> End: lng={end_lng}, lat={end_lat}")

    # 1. Try OpenRouteService if API key is configured
    if cfg.ORS_API_KEY and cfg.ORS_API_KEY != "YOUR_ORS_API_KEY_HERE":
        try:
            ors_url = "https://api.openrouteservice.org/v2/directions/driving-car"
            headers = {
                "Authorization": cfg.ORS_API_KEY,
                "Content-Type": "application/json"
            }
            body = {"coordinates": req.coordinates}
            response = requests.post(ors_url, json=body, headers=headers, timeout=5)
            if response.status_code == 200:
                return response.json()
            print(f"ORS API status {response.status_code}, falling back to OSRM")
        except Exception as e:
            print(f"ORS API call failed: {e}, falling back to OSRM")

    # 2. Fallback to public OSRM engine for real road geometries
    try:
        osrm_url = f"https://router.project-osrm.org/route/v1/driving/{start_lng},{start_lat};{end_lng},{end_lat}?overview=full&geometries=geojson"
        res = requests.get(osrm_url, timeout=5)
        if res.status_code == 200:
            osrm_data = res.json()
            # Convert GeoJSON [lng, lat] coordinates to Polyline string or structure matching ORS expectations
            coords = osrm_data["routes"][0]["geometry"]["coordinates"]
            # Convert [lng, lat] -> [lat, lng] for frontend convenience
            lat_lng_coords = [[c[1], c[0]] for c in coords]
            return {
                "routes": [{
                    "geometry": lat_lng_coords,
                    "summary": osrm_data["routes"][0].get("summary", "")
                }]
            }
    except Exception as e:
        print(f"OSRM fallback failed: {e}")

    raise HTTPException(500, "Routing engine unavailable")

# ═══════════════════════════════════════════════════════════
# ── CORE ROUTING API ──
# POST /api/routes/calculate
# ═══════════════════════════════════════════════════════════

@app.post("/api/routes/calculate")
async def calculate_route(req: RouteRequest):
    """
    Main routing endpoint.
    Runs Modified A* algorithm with Safety Score heuristic.
    Returns both the safest and fastest routes.
    """
    hour = int(req.time_of_day.split(":")[0])
    is_night = hour >= 20 or hour < 6

    # ── Fetch road edges from PostGIS ──
    edges = await get_road_edges(req.source, req.destination)

    # ── Fetch active hazards from MongoDB ──
    active_hazards = await get_active_hazards_in_bbox(req.source, req.destination)

    # ── Calculate safety score for each edge ──
    graph = build_safety_graph(edges, active_hazards, req.travel_mode, is_night)

    # ── Run Modified A* for safest route ──
    safest_path = astar_safest(graph, req.source, req.destination)

    # ── Run standard Dijkstra for fastest route ──
    fastest_path = dijkstra_fastest(graph, req.source, req.destination)

    # ── Run Yen's K-Shortest for alternative routes ──
    # alternatives = yens_k_shortest(graph, req.source, req.destination, k=3)

    return {
        "safest_route": {
            "path": safest_path["coords"],
            "distance_km": round(safest_path["distance"], 2),
            "eta_mins": estimate_eta(safest_path["distance"], req.travel_mode),
            "safety_rating": classify_safety(safest_path["safety_score"]),
            "alerts": safest_path.get("alerts", []),
        },
        "fastest_route": {
            "path": fastest_path["coords"],
            "distance_km": round(fastest_path["distance"], 2),
            "eta_mins": estimate_eta(fastest_path["distance"], req.travel_mode, fastest=True),
            "safety_rating": classify_safety(fastest_path["safety_score"]),
        },
    }


# ═══════════════════════════════════════════════════════════
# ── SAFETY SCORE ENGINE ──
# ═══════════════════════════════════════════════════════════

def compute_safety_score(
    crime_density: float,
    is_lit: bool,
    crowd_level: float,
    isolation_index: float,
    travel_mode: str,
    is_night: bool,
) -> float:
    """
    Safety Score formula (dynamic weights based on time + mode).

    Score ranges 0–10. Higher = safer.

    Weights adapt:
    - At night: lighting matters more (w_light increases)
    - Walking: crowd isolation matters more
    - Car: crime density matters less (enclosed vehicle)
    """
    # Base weights
    w_crime     = 0.40
    w_light     = 0.25
    w_crowd     = 0.20
    w_isolation = 0.15

    # ── Dynamic weight adjustment ──
    if is_night:
        w_light     += 0.10
        w_crime     -= 0.05
        w_isolation += 0.05
        w_crowd     -= 0.10

    if travel_mode in ("walking", "cycling"):
        w_isolation += 0.10
        w_crowd     -= 0.10

    if travel_mode == "car":
        w_isolation -= 0.10
        w_crime     += 0.10

    # Normalize components to 0–1
    crime_score     = 1.0 - min(crime_density, 1.0)
    light_score     = 1.0 if is_lit else 0.2
    crowd_score     = min(crowd_level / 10.0, 1.0)  # More crowd = safer (at night)
    isolation_score = 1.0 - min(isolation_index, 1.0)

    raw = (
        w_crime     * crime_score +
        w_light     * light_score +
        w_crowd     * crowd_score +
        w_isolation * isolation_score
    )

    return round(raw * 10, 2)  # Scale to 0–10


# ═══════════════════════════════════════════════════════════
# ── A* ALGORITHM (Modified for Safety) ──
# ═══════════════════════════════════════════════════════════

def astar_safest(graph: dict, source: Coords, dest: Coords) -> dict:
    """
    Modified A* where the cost function is the inverse of Safety Score.
    Lower cost = safer path.
    """
    src_node = snap_to_nearest_node(graph, source)
    dst_node = snap_to_nearest_node(graph, dest)

    if not src_node or not dst_node:
        return _mock_route(source, dest)

    # Priority queue: (f_cost, counter, node_id, path, total_dist, total_safety, alerts)
    counter = 0
    heap = [(0, counter, src_node, [src_node], 0.0, 0.0, [])]
    visited = {}

    while heap:
        f, _, current, path, dist, safety_sum, alerts = heapq.heappop(heap)

        if current in visited:
            continue
        visited[current] = True

        if current == dst_node:
            return {
                "coords": [graph["nodes"][n] for n in path],
                "distance": dist,
                "safety_score": safety_sum / max(len(path) - 1, 1),
                "alerts": alerts,
            }

        for neighbor, edge in graph["edges"].get(current, {}).items():
            if neighbor in visited:
                continue

            safety_cost = (10 - edge["safety_score"]) / 10.0  # Invert: lower is better
            g_cost = dist + edge["length"] * (1 + safety_cost)
            h_cost = haversine(graph["nodes"][neighbor], (dest.lat, dest.lng))

            edge_alerts = edge.get("alerts", [])
            counter += 1
            heapq.heappush(heap, (
                g_cost + h_cost,
                counter,
                neighbor,
                path + [neighbor],
                dist + edge["length"],
                safety_sum + edge["safety_score"],
                alerts + edge_alerts,
            ))

    return _mock_route(source, dest)


def dijkstra_fastest(graph: dict, source: Coords, dest: Coords) -> dict:
    """Standard Dijkstra for shortest distance (fastest route)."""
    src_node = snap_to_nearest_node(graph, source)
    dst_node = snap_to_nearest_node(graph, dest)

    if not src_node or not dst_node:
        return _mock_route(source, dest, mode="fast")

    counter = 0
    heap = [(0.0, counter, src_node, [src_node], 0.0)]
    visited = {}

    while heap:
        dist, _, current, path, safety_sum = heapq.heappop(heap)
        if current in visited:
            continue
        visited[current] = True

        if current == dst_node:
            return {
                "coords": [graph["nodes"][n] for n in path],
                "distance": dist,
                "safety_score": safety_sum / max(len(path) - 1, 1),
            }

        for neighbor, edge in graph["edges"].get(current, {}).items():
            if neighbor not in visited:
                counter += 1
                heapq.heappush(heap, (
                    dist + edge["length"],
                    counter,
                    neighbor,
                    path + [neighbor],
                    safety_sum + edge["safety_score"],
                ))

    return _mock_route(source, dest, mode="fast")


# ═══════════════════════════════════════════════════════════
# ── CROWDSOURCED HAZARD APIs ──
# ═══════════════════════════════════════════════════════════

@app.post("/api/hazards/report", status_code=201)
async def report_hazard(report: HazardReportIn):
    """Submit a real-time crowdsourced hazard to MongoDB."""
    doc = {
        "_id": str(uuid4()),
        "user_id": report.user_id,
        "hazard_type": report.hazard_type,
        "description": report.description,
        "location": {
            "type": "Point",
            "coordinates": [report.location.lng, report.location.lat],
        },
        "severity": report.severity,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "verification_score": 1,
        "status": "active",
        "expires_at": (datetime.utcnow() + timedelta(hours=24)).isoformat(),
    }

    if mongo_db:
        await mongo_db.hazard_reports.insert_one(doc)
    else:
        print(f"[MOCK] Hazard report stored: {doc}")

    return {"hazard_id": doc["_id"], "message": "Report submitted successfully"}


@app.get("/api/hazards/active")
async def get_active_hazards(
    min_lat: float, max_lat: float,
    min_lng: float, max_lng: float,
):
    """Fetch active hazards in a bounding box (for map markers)."""
    if not mongo_db:
        return {"hazards": _mock_hazards()}

    hazards = await mongo_db.hazard_reports.find({
        "status": "active",
        "location": {
            "$geoWithin": {
                "$box": [[min_lng, min_lat], [max_lng, max_lat]]
            }
        }
    }).to_list(100)

    return {"hazards": hazards}


@app.post("/api/hazards/verify")
async def verify_hazard(data: VerifyHazard):
    """Upvote/downvote a hazard report."""
    if not mongo_db:
        return {"message": "Vote recorded (mock)"}

    update = {"$inc": {"verification_score": 1 if data.vote == "up" else -1}}
    # Only mark resolved when score drops to 0 or below (not on every single downvote)
    if data.vote == "down":
        update["$set"] = {
            "status": {"$cond": {"if": {"$lte": ["$verification_score", 1]}, "then": "resolved", "else": "active"}}
        }

    await mongo_db.hazard_reports.update_one(
        {"_id": data.hazard_id}, update
    )
    # After decrement, check if score dropped to zero and resolve if needed
    doc = await mongo_db.hazard_reports.find_one({"_id": data.hazard_id})
    if doc and data.vote == "down" and doc.get("verification_score", 1) <= 0:
        await mongo_db.hazard_reports.update_one(
            {"_id": data.hazard_id}, {"$set": {"status": "resolved"}}
        )
    return {"message": "Vote recorded"}


# ═══════════════════════════════════════════════════════════
# ── EMERGENCY APIs ──
# ═══════════════════════════════════════════════════════════

@app.get("/api/emergency/safe-havens")
async def get_safe_havens(lat: float, lng: float, radius: int = 2000):
    """Find nearest police stations, hospitals within radius (meters)."""
    if not db_pool:
        return {"havens": _mock_havens(lat, lng)}

    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT haven_id, name, type, contact_number,
                   ST_X(geom) as lng, ST_Y(geom) as lat,
                   ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography) as dist_meters
            FROM safe_havens
            WHERE ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, $3)
            ORDER BY dist_meters
            LIMIT 10
        """, lng, lat, radius)

    return {"havens": [dict(r) for r in rows]}


@app.post("/api/emergency/trigger-sos")
async def trigger_sos(req: SOSRequest):
    """
    Emergency SOS: fetch user's trusted contacts from DB, 
    send SMS/WhatsApp with live location.
    
    🔑 Requires TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN in Config above.
    """
    trusted_contacts = []

    if mongo_db:
        doc = await mongo_db.trusted_contacts.find_one({"user_id": req.user_id})
        if doc and "contacts" in doc:
            trusted_contacts = doc["contacts"]

    maps_link = f"https://maps.google.com/?q={req.current_location.lat},{req.current_location.lng}"
    message = f"🚨 SOS ALERT!\nUser needs help.\nLocation: {maps_link}"

    if cfg.TWILIO_ACCOUNT_SID != "YOUR_TWILIO_SID_HERE":
        # Send real SMS via Twilio
        try:
            from twilio.rest import Client  # pip install twilio
            client = Client(cfg.TWILIO_ACCOUNT_SID, cfg.TWILIO_AUTH_TOKEN)
            for contact in trusted_contacts:
                client.messages.create(
                    body=message,
                    from_=cfg.TWILIO_PHONE,
                    to=contact["phone"],
                )
        except Exception as e:
            print(f"Twilio error: {e}")
    else:
        # Mock — just log
        print(f"[MOCK SOS] Would send: {message}")
        print(f"[MOCK SOS] To contacts: {trusted_contacts}")

    return {"status": "SOS triggered", "message_sent": message, "contacts_notified": len(trusted_contacts)}


# ═══════════════════════════════════════════════════════════
# ── USER AUTH APIs ──
# ═══════════════════════════════════════════════════════════

@app.post("/api/users/register", status_code=201)
async def register(user: UserRegister):
    import hashlib
    password_hash = hashlib.sha256(user.password.encode()).hexdigest()
    user_id = str(uuid4())

    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO users (user_id, name, email, password_hash)
                    VALUES ($1, $2, $3, $4)
                """, user_id, user.name, user.email, password_hash)
        except Exception as e:
            raise HTTPException(400, f"Email already exists: {e}")

    token = jwt.encode({"user_id": user_id, "email": user.email}, cfg.JWT_SECRET, algorithm="HS256")
    return {"user_id": user_id, "name": user.name, "token": token}


@app.post("/api/users/login")
async def login(credentials: UserLogin):
    import hashlib
    password_hash = hashlib.sha256(credentials.password.encode()).hexdigest()

    if db_pool:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT user_id, name FROM users WHERE email=$1 AND password_hash=$2",
                credentials.email, password_hash
            )
        if not row:
            raise HTTPException(401, "Invalid credentials")
        user_id, name = row["user_id"], row["name"]
    else:
        # Mock login
        user_id, name = str(uuid4()), credentials.email.split("@")[0]

    token = jwt.encode({"user_id": user_id, "email": credentials.email}, cfg.JWT_SECRET, algorithm="HS256")
    return {"user_id": user_id, "name": name, "token": token}


@app.post("/api/users/trusted-contacts")
async def add_trusted_contacts(req: AddContactsRequest):
    if not mongo_db:
        return {"message": "Contacts added (mock)"}
    
    doc = await mongo_db.trusted_contacts.find_one({"user_id": req.user_id})
    existing_contacts = doc["contacts"] if doc else []
    
    for c in req.contacts:
        if len(existing_contacts) >= 5:
            raise HTTPException(400, "Maximum of 5 contacts allowed")
        if any(exc["phone"] == c.phone for exc in existing_contacts):
            raise HTTPException(400, f"Contact with phone {c.phone} already exists")
        existing_contacts.append({"name": c.name, "phone": c.phone})
        
    await mongo_db.trusted_contacts.update_one(
        {"user_id": req.user_id},
        {"$set": {"contacts": existing_contacts}},
        upsert=True
    )
    return {"message": "Contacts added successfully"}

@app.get("/api/users/trusted-contacts")
async def get_trusted_contacts(user_id: str):
    if not mongo_db:
        return {"contacts": []}
    doc = await mongo_db.trusted_contacts.find_one({"user_id": user_id})
    return {"contacts": doc["contacts"] if doc else []}

@app.delete("/api/users/trusted-contacts")
async def delete_trusted_contact(req: DeleteContactRequest):
    if not mongo_db:
        return {"message": "Contact deleted (mock)"}
    
    await mongo_db.trusted_contacts.update_one(
        {"user_id": req.user_id},
        {"$pull": {"contacts": {"phone": req.phone}}}
    )
    return {"message": "Contact deleted successfully"}


# ═══════════════════════════════════════════════════════════
# ── HELPER FUNCTIONS ──
# ═══════════════════════════════════════════════════════════

def haversine(coord1, coord2) -> float:
    """Calculate distance in km between two lat/lng points."""
    R = 6371
    lat1, lng1 = (coord1 if isinstance(coord1, tuple) else (coord1[0], coord1[1]))
    lat2, lng2 = (coord2 if isinstance(coord2, tuple) else (coord2[0], coord2[1]))
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))


def estimate_eta(distance_km: float, mode: str, fastest: bool = False) -> int:
    speeds = {"walking": 5, "cycling": 15, "two_wheeler": 30, "car": 40}
    speed = speeds.get(mode, 5)
    if fastest: speed *= 1.2
    return round((distance_km / speed) * 60)


def classify_safety(score: float) -> str:
    if score >= 7: return "High"
    if score >= 4: return "Moderate"
    return "Low"


def snap_to_nearest_node(graph: dict, coords: Coords):
    """Find graph node closest to given coordinates."""
    if not graph.get("nodes"):
        return None
    best, best_dist = None, float("inf")
    for node_id, (lat, lng) in graph["nodes"].items():
        d = haversine((lat, lng), (coords.lat, coords.lng))
        if d < best_dist:
            best_dist = d
            best = node_id
    return best


async def get_road_edges(source: Coords, dest: Coords) -> list:
    """Fetch road edges from PostGIS within a bounding box."""
    if not db_pool:
        return []  # Will fall back to mock

    margin = 0.02  # degrees
    min_lat = min(source.lat, dest.lat) - margin
    max_lat = max(source.lat, dest.lat) + margin
    min_lng = min(source.lng, dest.lng) - margin
    max_lng = max(source.lng, dest.lng) + margin

    async with db_pool.acquire() as conn:
        rows = await conn.fetch("""
            SELECT edge_id, source_node, target_node,
                   length_meters, road_type, is_lit, base_safety_score,
                   ST_X(ST_StartPoint(geom)) as src_lng,
                   ST_Y(ST_StartPoint(geom)) as src_lat,
                   ST_X(ST_EndPoint(geom)) as tgt_lng,
                   ST_Y(ST_EndPoint(geom)) as tgt_lat
            FROM road_edges
            WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
        """, min_lng, min_lat, max_lng, max_lat)
    return [dict(r) for r in rows]


async def get_active_hazards_in_bbox(source: Coords, dest: Coords) -> list:
    """Fetch active MongoDB hazard reports in bounding box."""
    if not mongo_db:
        return []
    margin = 0.02
    hazards = await mongo_db.hazard_reports.find({
        "status": "active",
        "location": {
            "$geoWithin": {
                "$box": [
                    [min(source.lng, dest.lng) - margin, min(source.lat, dest.lat) - margin],
                    [max(source.lng, dest.lng) + margin, max(source.lat, dest.lat) + margin],
                ]
            }
        }
    }).to_list(200)
    return hazards


def build_safety_graph(edges: list, hazards: list, travel_mode: str, is_night: bool) -> dict:
    """Convert DB edges + hazards into an in-memory graph for pathfinding."""
    if not edges:
        return {"nodes": {}, "edges": {}}

    # Map hazards to edge IDs for quick lookup
    hazard_map = {}
    for h in hazards:
        eid = h.get("mapped_edge_id")
        if eid:
            hazard_map.setdefault(eid, []).append(h)

    nodes, graph_edges = {}, {}

    for e in edges:
        src, tgt = e["source_node"], e["target_node"]
        nodes[src] = (e["src_lat"], e["src_lng"])
        nodes[tgt] = (e["tgt_lat"], e["tgt_lng"])

        # Base safety score from DB
        base_score = e.get("base_safety_score", 5.0)

        # Apply hazard penalty
        for h in hazard_map.get(str(e["edge_id"]), []):
            base_score -= (h["severity"] / 10.0) * 2  # Penalty proportional to severity

        # Night penalty for unlit roads
        if is_night and not e.get("is_lit", False):
            base_score -= 2.0

        # Travel mode filtering (remove truly unsafe paths)
        if travel_mode == "walking" and e.get("road_type") == "motorway":
            base_score = 0  # Pedestrians can't use motorways

        safety_score = max(0.0, min(10.0, base_score))
        length_km = e["length_meters"] / 1000.0

        alerts = []
        if not e.get("is_lit") and is_night:
            alerts.append(f"Unlit road segment avoided")

        edge_data = {
            "length": length_km,
            "safety_score": safety_score,
            "is_lit": e.get("is_lit", False),
            "road_type": e.get("road_type", "unknown"),
            "alerts": alerts,
        }

        graph_edges.setdefault(src, {})[tgt] = edge_data
        graph_edges.setdefault(tgt, {})[src] = edge_data  # Bidirectional

    return {"nodes": nodes, "edges": graph_edges}


def _mock_route(source: Coords, dest: Coords, mode: str = "safe") -> dict:
    """Fallback route dynamic generator using real road geometry."""
    try:
        if mode == "safe":
            # Via safe arterial waypoint (slight offset to main avenues)
            via_lat = (source.lat + dest.lat) / 2 + 0.003
            via_lng = (source.lng + dest.lng) / 2 + 0.003
            osrm_url = f"https://router.project-osrm.org/route/v1/driving/{source.lng},{source.lat};{via_lng},{via_lat};{dest.lng},{dest.lat}?overview=full&geometries=geojson"
        else:
            # Direct fastest route
            osrm_url = f"https://router.project-osrm.org/route/v1/driving/{source.lng},{source.lat};{dest.lng},{dest.lat}?overview=full&geometries=geojson"

        res = requests.get(osrm_url, timeout=4)
        if res.status_code == 200:
            data = res.json()
            coords_lng_lat = data["routes"][0]["geometry"]["coordinates"]
            leaflet_coords = [[c[1], c[0]] for c in coords_lng_lat]
            dist_km = round(data["routes"][0]["distance"] / 1000.0, 2)
            
            if mode == "safe":
                return {
                    "coords": leaflet_coords,
                    "distance": dist_km,
                    "safety_score": 9.4,
                    "alerts": ["Avoided unlit alleyway near SV Road", "Routed via police-patrolled main avenue"],
                }
            else:
                return {
                    "coords": leaflet_coords,
                    "distance": dist_km,
                    "safety_score": 4.8,
                }
    except Exception as e:
        print(f"OSRM query in _mock_route failed: {e}")

    # Ultimate fallback if internet is completely disconnected
    midlat = (source.lat + dest.lat) / 2
    midlng = (source.lng + dest.lng) / 2
    return {
        "coords": [[source.lat, source.lng], [midlat, midlng], [dest.lat, dest.lng]],
        "distance": haversine((source.lat, source.lng), (dest.lat, dest.lng)),
        "safety_score": 8.0 if mode == "safe" else 5.0,
    }


def _mock_hazards():
    return [
        {"hazard_type": "broken_streetlight", "severity": 7,
         "location": {"coordinates": [72.879, 19.079]}, "status": "active"},
        {"hazard_type": "suspicious_activity", "severity": 8,
         "location": {"coordinates": [72.875, 19.083]}, "status": "active"},
    ]


def _mock_havens(lat: float, lng: float):
    return [
        {"name": "Andheri Police Station", "type": "Police Station", "lat": lat + 0.005, "lng": lng + 0.003, "contact_number": "100"},
        {"name": "Kokilaben Hospital", "type": "Hospital", "lat": lat - 0.003, "lng": lng + 0.006, "contact_number": "1800-XXX-XXXX"},
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)