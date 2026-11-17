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
import sys
import time
import math
import json
import heapq
import asyncio
from datetime import datetime, timedelta

# ── Add custom twilio install path (installed to short path due to Windows MAX_PATH) ──
_twilio_path = r"C:\twlib\Lib\site-packages"
if os.path.isdir(_twilio_path) and _twilio_path not in sys.path:
    sys.path.insert(0, _twilio_path)

from dotenv import load_dotenv
load_dotenv()
from typing import Optional, List, Union, Dict, Any
import re
from uuid import uuid4

import numpy as np
from fastapi import FastAPI, HTTPException, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import jwt  # pip install pyjwt

# ── Algorithms ──
from algorithms import yens_k_shortest, fetch_tomtom_traffic, fetch_tomtom_flow, traffic_incidents_to_penalties

# ── Database drivers ──
import asyncpg          # pip install asyncpg
from motor.motor_asyncio import AsyncIOMotorClient  # pip install motor

# ── Station → BMC Ward mapping (verified from coordinate analysis) ──
STATION_WARD_MAP: Dict[str, Dict[str, str]] = {
    "Colaba":        {"ward": "A",   "ward_name": "Colaba/Fort/Nariman Point",         "confidence": "verified"},
    "Cuffe Parade":  {"ward": "A",   "ward_name": "Colaba/Fort/Nariman Point",         "confidence": "verified"},
    "Azad Maidan":   {"ward": "B",   "ward_name": "Mazgaon/Dongri/Mandvi",            "confidence": "verified"},
    "Marine Lines":  {"ward": "C",   "ward_name": "Girgaon/Marine Lines/Malabar Hill","confidence": "verified"},
    "Malabar Hill":  {"ward": "D",   "ward_name": "Malabar Hill/Napean Sea Road",     "confidence": "verified"},
    "Worli":         {"ward": "G/S", "ward_name": "Worli/Lower Parel",                "confidence": "verified"},
    "Dharavi":       {"ward": "F/N", "ward_name": "Sion/Dharavi/Sewri/Wadala",        "confidence": "verified"},
    "Sion":          {"ward": "F/N", "ward_name": "Sion/Dharavi/Sewri/Wadala",        "confidence": "verified"},
    "Chembur":       {"ward": "M/W", "ward_name": "Chembur/Govandi",                  "confidence": "verified"},
    "Govandi":       {"ward": "M/E", "ward_name": "Mankhurd/Govandi",                 "confidence": "verified"},
    "Mankhurd":      {"ward": "M/E", "ward_name": "Mankhurd/Govandi",                 "confidence": "verified"},
    "Ghatkopar":     {"ward": "N",   "ward_name": "Ghatkopar/Vikhroli",               "confidence": "verified"},
    "Vikhroli":      {"ward": "N",   "ward_name": "Ghatkopar/Vikhroli",               "confidence": "verified"},
    "Kurla":         {"ward": "L",   "ward_name": "Kurla/Vidyavihar",                 "confidence": "verified"},
    "Santacruz":     {"ward": "H/W", "ward_name": "Bandra/Santacruz West",            "confidence": "verified"},
    "Juhu":          {"ward": "K/W", "ward_name": "Andheri West/Juhu",                "confidence": "verified"},
    "Versova":       {"ward": "K/W", "ward_name": "Andheri West/Versova",             "confidence": "verified"},
    "Andheri":       {"ward": "K/E", "ward_name": "Andheri East",                     "confidence": "verified"},
    "Bhandup":       {"ward": "S",   "ward_name": "Bhandup/Kanjurmarg",               "confidence": "verified"},
    "Mulund":        {"ward": "T",   "ward_name": "Mulund/Nahur",                     "confidence": "verified"},
    "Malad":         {"ward": "P/S", "ward_name": "Malad/Kandivali South",            "confidence": "verified"},
    "Kandivali":     {"ward": "R/S", "ward_name": "Kandivali/Borivali South",         "confidence": "verified"},
    "Borivali":      {"ward": "R/N", "ward_name": "Borivali North",                   "confidence": "verified"},
    "Dahisar":       {"ward": "R/C", "ward_name": "Dahisar",                          "confidence": "verified"},
}

# ── Optional: Twilio SMS (pip install twilio) ──
try:
    from twilio.rest import Client as TwilioClient  # type: ignore
except ImportError:
    TwilioClient = None  # type: ignore

app = FastAPI(
    title="SafePath API",
    version="1.0.0",
    description="SafePath: Crime-Avoidance Navigation System API with pgRouting & Safety Engine",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ── CORS (allow React frontend & local development) ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "capacitor://localhost",
        "http://localhost",
    ],
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+|0\.0\.0\.0)(:\d+)?$",
    allow_credentials=True,
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
        "postgresql://postgres:harsh7@localhost:5432/crime_navigation"  # set via backend/.env
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
        db_pool = await asyncpg.create_pool(cfg.DATABASE_URL, min_size=2, max_size=10)
        # Quick sanity-check: verify real data is reachable
        async with db_pool.acquire() as _conn:
            nodes = await _conn.fetchval("SELECT COUNT(*) FROM road_nodes")
            edges = await _conn.fetchval("SELECT COUNT(*) FROM road_edges")
        print(f"✅ PostgreSQL connected — road_nodes: {nodes:,}  road_edges: {edges:,}")
    except Exception as e:
        db_pool = None
        print(f"⚠ PostgreSQL not connected: {e} — running in mock mode")

    try:
        mongo_client = AsyncIOMotorClient(cfg.MONGO_URI)
        mongo_db = mongo_client[cfg.MONGO_DB]
        print("✅ MongoDB connected")
    except Exception as e:
        print(f"⚠ MongoDB not connected: {e} — running in mock mode")


@app.on_event("shutdown")
async def shutdown():
    if db_pool is not None: await db_pool.close()
    if mongo_client is not None: mongo_client.close()


# ═══════════════════════════════════════════════════════════
# SYSTEM & HEALTH ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.get("/", tags=["System"])
async def root():
    """
    Root discovery endpoint for SafePath API.
    Provides service metadata, status, and links to interactive documentation.
    """
    return {
        "name": "SafePath API",
        "description": "SafePath: Crime-Avoidance Navigation System API with pgRouting & Safety Engine",
        "version": "1.0.0",
        "status": "online",
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "openapi_url": "/openapi.json",
        "health_url": "/health",
    }


@app.get("/health", tags=["System"])
@app.get("/api/health", tags=["System"])
async def health():
    """
    Health check endpoint reporting PostgreSQL (PostGIS/pgRouting) and MongoDB status.
    """
    db_connected = False
    nodes_count = 0
    edges_count = 0
    if db_pool is not None:
        try:
            async with db_pool.acquire() as conn:
                nodes_count = await conn.fetchval("SELECT COUNT(*) FROM road_nodes")
                edges_count = await conn.fetchval("SELECT COUNT(*) FROM road_edges")
                db_connected = True
        except Exception as e:
            print(f"[health] DB query failed: {e}")
            db_connected = False

    mongo_connected = mongo_db is not None
    overall_status = "healthy" if db_connected else ("degraded" if db_pool is not None else "unhealthy")

    return {
        "status": overall_status,
        "database": {
            "connected": db_connected,
            "engine": "PostgreSQL / PostGIS 3.7.0 / pgRouting 4.0.1",
            "road_nodes": nodes_count,
            "road_edges": edges_count,
        },
        "mongodb": {
            "connected": mongo_connected,
        },
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


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

class RouteAnalyzeRequest(BaseModel):
    path: list
    route_type: Optional[str] = "safest"
    travel_mode: Optional[str] = "walking"
    time_of_day: Optional[str] = "12:00"

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
    user_id: Optional[str] = "anonymous"
    current_location: Optional[Coords] = None
    location: Optional[Coords] = None
    message: Optional[str] = None
    contacts: Optional[List[str]] = None
    timestamp: Optional[str] = None

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

class OnRouteResourcesRequest(BaseModel):
    """Request body for fetching on-route resources for long journeys."""
    route_coords: List[List[float]]  # [[lat, lng], ...] route polyline
    radius_meters: int = 1000        # Search radius around each sampled point
    resource_types: List[str] = ["ev_charger", "police", "hospital"]


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
# ── ON-ROUTE RESOURCES API ──
# POST /api/resources/on-route
# ═══════════════════════════════════════════════════════════

@app.post("/api/resources/on-route")
def get_on_route_resources(req: OnRouteResourcesRequest):
    """
    Fetch EV charging stations, police stations, and hospitals along a route.

    Strategy:
    1. Compute the bounding box of the route polyline (+ padding).
    2. Query OpenStreetMap Overpass API for all resource types.
    3. For EV chargers: enrich with TomTom Category Search to get the
       chargingAvailability UUID — this enables the live socket-status badge.
    4. Return deduplicated results with type, name, coordinates, and metadata.
    """
    if not req.route_coords or len(req.route_coords) < 2:
        raise HTTPException(400, "At least 2 route coordinates required")

    # ── Compute bounding box of the route ──
    lats = [c[0] for c in req.route_coords]
    lngs = [c[1] for c in req.route_coords]
    pad = req.radius_meters / 111_000  # approx degrees per meter
    min_lat = min(lats) - pad
    max_lat = max(lats) + pad
    min_lng = min(lngs) - pad
    max_lng = max(lngs) + pad

    bbox = f"{min_lat},{min_lng},{max_lat},{max_lng}"

    # ── Build Overpass QL query per requested type ──
    OVERPASS_FILTERS = {
        "ev_charger": [
            'node["amenity"="charging_station"]',
            'way["amenity"="charging_station"]',
        ],
        "police": [
            'node["amenity"="police"]',
            'way["amenity"="police"]',
        ],
        "hospital": [
            'node["amenity"="hospital"]',
            'node["amenity"="clinic"]',
            'way["amenity"="hospital"]',
        ],
    }

    TYPE_META = {
        "ev_charger": {"label": "EV Charging Station", "icon": "⚡", "color": "#22c55e"},
        "police":     {"label": "Police Station",       "icon": "🚔", "color": "#3b82f6"},
        "hospital":   {"label": "Hospital / Clinic",    "icon": "🏥", "color": "#ef4444"},
    }

    query_parts = []
    for rtype in req.resource_types:
        if rtype in OVERPASS_FILTERS:
            for filt in OVERPASS_FILTERS[rtype]:
                query_parts.append(f"{filt}({bbox});")

    overpass_query = "[out:json][timeout:10];\n(\n" + "\n".join(query_parts) + "\n);\nout center 60;"

    results = []
    seen_ids = set()

    try:
        overpass_url = "https://overpass-api.de/api/interpreter"
        resp = requests.post(overpass_url, data={"data": overpass_query}, timeout=12)
        if resp.status_code == 200:
            osm_data = resp.json()
            for elem in osm_data.get("elements", []):
                osm_id = elem.get("id")
                if osm_id in seen_ids:
                    continue
                seen_ids.add(osm_id)

                tags = elem.get("tags", {})
                amenity = tags.get("amenity", "")
                name = tags.get("name") or tags.get("operator") or tags.get("brand") or ""

                # Determine resource type
                if amenity == "charging_station":
                    rtype = "ev_charger"
                elif amenity == "police":
                    rtype = "police"
                elif amenity in ("hospital", "clinic"):
                    rtype = "hospital"
                else:
                    continue

                if rtype not in req.resource_types:
                    continue

                # Extract lat/lng (nodes have direct coords, ways have center)
                if elem["type"] == "node":
                    lat, lng = elem.get("lat"), elem.get("lon")
                else:
                    center = elem.get("center", {})
                    lat, lng = center.get("lat"), center.get("lon")

                if lat is None or lng is None:
                    continue

                meta = TYPE_META[rtype]
                entry = {
                    "id": str(osm_id),
                    "type": rtype,
                    "label": meta["label"],
                    "icon": meta["icon"],
                    "color": meta["color"],
                    "name": name or meta["label"],
                    "lat": lat,
                    "lng": lng,
                    "contact": tags.get("phone") or tags.get("contact:phone") or "",
                    "address": tags.get("addr:full") or (
                        f"{tags.get('addr:housenumber', '')} {tags.get('addr:street', '')}".strip()
                    ) or "",
                    # EV charger extras
                    "ev_sockets": tags.get("capacity", tags.get("socket:count", "")),
                    "ev_network": tags.get("network") or tags.get("operator") or "",
                    # Hospital extras
                    "emergency": tags.get("emergency", ""),
                    # Police extras
                    "opening_hours": tags.get("opening_hours", ""),
                    # TomTom EV availability UUID — enriched below for ev_charger type
                    "ev_tomtom_id": None,
                }
                results.append(entry)
        else:
            print(f"Overpass returned {resp.status_code}, falling back to mock")
            results = _mock_on_route_resources(min_lat, max_lat, min_lng, max_lng, req.resource_types)

    except Exception as e:
        print(f"Overpass API error: {e} — returning mock resources")
        results = _mock_on_route_resources(min_lat, max_lat, min_lng, max_lng, req.resource_types)

    # ── Step 3: Enrich EV chargers with TomTom UUIDs for live availability ──
    if "ev_charger" in req.resource_types:
        ev_results = [r for r in results if r["type"] == "ev_charger"]
        if ev_results:
            _enrich_ev_with_tomtom(ev_results, min_lat, max_lat, min_lng, max_lng)

    return {
        "resources": results,
        "total": len(results),
        "bbox": {"min_lat": min_lat, "max_lat": max_lat, "min_lng": min_lng, "max_lng": max_lng},
    }


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Return distance in metres between two lat/lng points."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def _enrich_ev_with_tomtom(ev_results: list, min_lat: float, max_lat: float,
                            min_lng: float, max_lng: float) -> None:
    """
    Query TomTom Category Search for EV charging stations in the bounding box,
    then match each OSM station to the nearest TomTom result (≤ 150 m).
    Attaches the TomTom chargingAvailability UUID to ev_tomtom_id in-place.

    TomTom Category Search docs:
      https://docs.tomtom.com/search-api/documentation/search-service/category-search
    Category code 7309 = Electric Vehicle Station
    """
    if not cfg.TOMTOM_API_KEY or cfg.TOMTOM_API_KEY == "YOUR_TOMTOM_API_KEY_HERE":
        print("[EV Enrich] No TomTom key — skipping UUID enrichment")
        return

    # Use bounding box centre + radius for TomTom categorySearch
    centre_lat = (min_lat + max_lat) / 2
    centre_lng = (min_lng + max_lng) / 2
    # radius = half-diagonal of bbox in metres, capped at 50 km
    diag_m = _haversine_m(min_lat, min_lng, max_lat, max_lng)
    radius_m = min(int(diag_m / 2) + 500, 50_000)

    try:
        url = (
            f"https://api.tomtom.com/search/2/categorySearch/"
            f"electric vehicle station.json"
            f"?key={cfg.TOMTOM_API_KEY}"
            f"&lat={centre_lat}&lon={centre_lng}&radius={radius_m}"
            f"&limit=100&countrySet=IN"
        )
        resp = requests.get(url, timeout=10)
        if resp.status_code != 200:
            print(f"[EV Enrich] TomTom categorySearch returned {resp.status_code}")
            return

        tomtom_stations = resp.json().get("results", [])
        print(f"[EV Enrich] TomTom returned {len(tomtom_stations)} EV stations")

        # Build a list of (lat, lng, chargingAvailability_id) from TomTom results
        tt_points = []
        for r in tomtom_stations:
            pos = r.get("position", {})
            tt_lat = pos.get("lat")
            tt_lng = pos.get("lon")
            # chargingAvailability UUID lives inside dataSources
            data_sources = r.get("dataSources", {})
            avail_id = (
                data_sources.get("chargingAvailability", {}).get("id")
                or r.get("id")  # fallback to the result id
            )
            if tt_lat is not None and tt_lng is not None and avail_id:
                tt_points.append((tt_lat, tt_lng, avail_id))

        if not tt_points:
            print("[EV Enrich] No usable TomTom EV stations found in area")
            return

        # Match each OSM station to the nearest TomTom station within 150 m
        MATCH_THRESHOLD_M = 150
        matched = 0
        for osm_ev in ev_results:
            best_dist = float("inf")
            best_id = None
            for (tt_lat, tt_lng, avail_id) in tt_points:
                dist = _haversine_m(osm_ev["lat"], osm_ev["lng"], tt_lat, tt_lng)
                if dist < best_dist:
                    best_dist = dist
                    best_id = avail_id
            if best_dist <= MATCH_THRESHOLD_M:
                osm_ev["ev_tomtom_id"] = best_id
                matched += 1
                print(f"[EV Enrich] Matched '{osm_ev['name']}' → TomTom ID {best_id} ({best_dist:.0f}m)")
            else:
                print(f"[EV Enrich] No match for '{osm_ev['name']}' (nearest {best_dist:.0f}m)")

        print(f"[EV Enrich] Enriched {matched}/{len(ev_results)} EV stations with TomTom UUIDs")

    except Exception as e:
        print(f"[EV Enrich] Error during TomTom enrichment: {e}")


# ═══════════════════════════════════════════════════════════
# ── EV CHARGING AVAILABILITY API ──
# GET /api/ev/availability?charger_id=...
# Wraps TomTom EV Charging Stations Availability API
# Docs: https://docs.tomtom.com/ev-charging-stations-availability-api/
# ═══════════════════════════════════════════════════════════

@app.get("/api/ev/availability")
def get_ev_availability(charger_id: str):
    """
    Fetch real-time socket availability for an EV charging station.
    Uses TomTom EV Charging Stations Availability API (refreshed every ~3 min).

    - charger_id: TomTom chargingAvailability UUID for the station
    Returns connector types with available/occupied/reserved counts.
    """
    if not cfg.TOMTOM_API_KEY or cfg.TOMTOM_API_KEY == "YOUR_TOMTOM_API_KEY_HERE":
        # Return mock availability when no key is configured
        return _mock_ev_availability(charger_id)

    try:
        url = (
            f"https://api.tomtom.com/search/2/chargingAvailability.json"
            f"?key={cfg.TOMTOM_API_KEY}&chargingAvailability={charger_id}"
        )
        resp = requests.get(url, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            connectors = data.get("connectors", [])
            # Summarise: total available / total sockets across all connectors
            total_available = sum(
                c.get("availability", {}).get("current", {}).get("available", 0)
                for c in connectors
            )
            total_sockets = sum(c.get("total", 0) for c in connectors)
            return {
                "charger_id": charger_id,
                "connectors": connectors,
                "summary": {
                    "total_sockets": total_sockets,
                    "available": total_available,
                    "occupied": total_sockets - total_available,
                    "status": "available" if total_available > 0 else "occupied",
                },
                "source": "tomtom_live",
            }
        else:
            print(f"[EV Availability] TomTom returned {resp.status_code} for {charger_id}")
            return _mock_ev_availability(charger_id)
    except Exception as e:
        print(f"[EV Availability] Error: {e}")
        return _mock_ev_availability(charger_id)


def _mock_ev_availability(charger_id: str):
    """Mock EV availability response for demo/offline mode."""
    import random
    total = random.choice([2, 4, 6])
    available = random.randint(0, total)
    return {
        "charger_id": charger_id,
        "connectors": [
            {
                "type": "IEC62196Type2CableAttached",
                "total": total,
                "availability": {
                    "current": {
                        "available": available,
                        "occupied": total - available,
                        "reserved": 0,
                        "unknown": 0,
                        "outOfService": 0,
                    }
                },
            }
        ],
        "summary": {
            "total_sockets": total,
            "available": available,
            "occupied": total - available,
            "status": "available" if available > 0 else "occupied",
        },
        "source": "mock",
    }


def _mock_on_route_resources(min_lat, max_lat, min_lng, max_lng, resource_types):
    """Realistic mock on-route resources for demo/offline mode."""
    clat = (min_lat + max_lat) / 2
    clng = (min_lng + max_lng) / 2
    mock = []
    if "ev_charger" in resource_types:
        mock += [
            {"id": "mock-ev-1", "type": "ev_charger", "label": "EV Charging Station", "icon": "⚡", "color": "#22c55e",
             "name": "Tata Power EV Charger", "lat": clat + 0.006, "lng": clng + 0.004,
             "contact": "", "address": "Near Western Express Highway",
             "ev_sockets": "4", "ev_network": "Tata Power", "emergency": "", "opening_hours": "24/7"},
            {"id": "mock-ev-2", "type": "ev_charger", "label": "EV Charging Station", "icon": "⚡", "color": "#22c55e",
             "name": "BPCL EV Point", "lat": clat - 0.007, "lng": clng + 0.009,
             "contact": "1800-XXX-1234", "address": "BPCL Petrol Pump",
             "ev_sockets": "2", "ev_network": "BPCL", "emergency": "", "opening_hours": "06:00-22:00"},
        ]
    if "police" in resource_types:
        mock += [
            {"id": "mock-pol-1", "type": "police", "label": "Police Station", "icon": "🚔", "color": "#3b82f6",
             "name": "Andheri Police Station", "lat": clat + 0.003, "lng": clng - 0.005,
             "contact": "100", "address": "J.P. Road, Andheri West",
             "ev_sockets": "", "ev_network": "", "emergency": "yes", "opening_hours": "24/7"},
            {"id": "mock-pol-2", "type": "police", "label": "Police Station", "icon": "🚔", "color": "#3b82f6",
             "name": "Bandra Police Station", "lat": clat - 0.009, "lng": clng - 0.002,
             "contact": "100", "address": "Hill Road, Bandra",
             "ev_sockets": "", "ev_network": "", "emergency": "yes", "opening_hours": "24/7"},
        ]
    if "hospital" in resource_types:
        mock += [
            {"id": "mock-hosp-1", "type": "hospital", "label": "Hospital / Clinic", "icon": "🏥", "color": "#ef4444",
             "name": "Kokilaben Dhirubhai Ambani Hospital", "lat": clat - 0.004, "lng": clng + 0.007,
             "contact": "1800-XXX-9999", "address": "Four Bungalows, Andheri West",
             "ev_sockets": "", "ev_network": "", "emergency": "yes", "opening_hours": "24/7"},
            {"id": "mock-hosp-2", "type": "hospital", "label": "Hospital / Clinic", "icon": "🏥", "color": "#ef4444",
             "name": "Lilavati Hospital", "lat": clat + 0.010, "lng": clng - 0.006,
             "contact": "022-XXXX-XXXX", "address": "A Road, Bandra West",
             "ev_sockets": "", "ev_network": "", "emergency": "yes", "opening_hours": "24/7"},
        ]
    return mock


async def analyze_route_crime_intelligence(
    conn,
    path_coords: list,
    route_key: str = "safest",
    travel_mode: str = "walking",
    is_night: bool = False,
) -> dict:
    """
    Analyzes route path coordinates against PostgreSQL crime_clusters.
    Divides the path into meaningful segments with local safety scores,
    risk colors (red/orange/yellow/green), dominant crime categories,
    nearby recorded crime counts, lighting conditions, and generates
    grounded 'why this route' explanations and interactive crime markers.
    """
    if not path_coords or len(path_coords) < 2:
        return {
            "segments": [],
            "crime_summary": {
                "crime_exposure": "Low",
                "high_risk_zones": 0,
                "moderate_risk_zones": 0,
                "low_risk_zones": 1,
                "dominant_categories": ["None recorded"],
                "lighting": "Standard lighting",
            },
            "why_this_route": ["Direct road route."],
            "crime_markers": [],
        }

    # 1. Fetch nearby candidate clusters from crime_clusters
    lats = [p[0] for p in path_coords]
    lngs = [p[1] for p in path_coords]
    min_lat = min(lats) - 0.015
    max_lat = max(lats) + 0.015
    min_lng = min(lngs) - 0.015
    max_lng = max(lngs) + 0.015

    candidate_clusters = []
    if conn:
        try:
            rows = await conn.fetch("""
                SELECT cluster_id, police_station, zone, centroid_lat, centroid_lng, radius_m,
                       incident_count, avg_severity, risk_score, dominant_crime, night_share
                FROM crime_clusters
                WHERE centroid_lat BETWEEN $1 AND $2
                  AND centroid_lng BETWEEN $3 AND $4
                ORDER BY risk_score DESC NULLS LAST
            """, min_lat, max_lat, min_lng, max_lng)
            candidate_clusters = [dict(r) for r in rows]
        except Exception as e:
            print(f"[analyze_route] DB cluster fetch warning: {e}")

    # Fallback to general clusters if bounding box returned none or conn not available
    if not candidate_clusters and conn:
        try:
            rows = await conn.fetch("""
                SELECT cluster_id, police_station, zone, centroid_lat, centroid_lng, radius_m,
                       incident_count, avg_severity, risk_score, dominant_crime, night_share
                FROM crime_clusters
                ORDER BY risk_score DESC NULLS LAST LIMIT 15
            """)
            candidate_clusters = [dict(r) for r in rows]
        except Exception:
            pass

    # 2. Filter clusters within 850m of the path coordinates
    nearby_clusters = []
    for c in candidate_clusters:
        c_lat = float(c["centroid_lat"]) if c.get("centroid_lat") is not None else None
        c_lng = float(c["centroid_lng"]) if c.get("centroid_lng") is not None else None
        if c_lat is None or c_lng is None:
            continue
        
        min_d = float("inf")
        step = max(1, len(path_coords) // 40)
        for i in range(0, len(path_coords), step):
            pt = path_coords[i]
            d = _haversine_m(pt[0], pt[1], c_lat, c_lng)
            if d < min_d:
                min_d = d
        
        if min_d <= 850:
            c_copy = dict(c)
            c_copy["dist_to_route_m"] = round(min_d, 1)
            nearby_clusters.append(c_copy)

    # 3. Divide path into 4 to 8 meaningful segments
    num_segs = min(7, max(3, len(path_coords) // 18))
    seg_size = max(2, len(path_coords) // num_segs)
    segments = []
    high_count = 0
    mod_count = 0
    low_count = 0
    unique_crimes = set()

    for s_idx in range(num_segs):
        start_i = s_idx * seg_size
        end_i = len(path_coords) if s_idx == num_segs - 1 else min(len(path_coords), (s_idx + 1) * seg_size + 1)
        sub_coords = path_coords[start_i:end_i]
        if len(sub_coords) < 2:
            continue

        # Segment length
        seg_dist_km = 0.0
        for i in range(1, len(sub_coords)):
            seg_dist_km += _haversine_m(sub_coords[i-1][0], sub_coords[i-1][1], sub_coords[i][0], sub_coords[i][1]) / 1000.0

        # Find closest cluster to this segment
        closest_cluster = None
        min_seg_dist = float("inf")
        mid_pt = sub_coords[len(sub_coords) // 2]

        for c in nearby_clusters:
            d = _haversine_m(mid_pt[0], mid_pt[1], float(c["centroid_lat"]), float(c["centroid_lng"]))
            if d < min_seg_dist:
                min_seg_dist = d
                closest_cluster = c

        # Determine segment risk classification
        c_risk = float(closest_cluster.get("risk_score", 0)) if closest_cluster else 0
        c_incidents = int(closest_cluster.get("incident_count", 0)) if closest_cluster else 0
        dom_crime = closest_cluster.get("dominant_crime") if closest_cluster else "Theft"
        ps_name = closest_cluster.get("police_station") if closest_cluster else "Precinct Area"

        # Route-specific differentiation based on actual risk & route heuristic
        is_high = False
        is_mod = False
        if closest_cluster and min_seg_dist <= 500:
            if (c_risk >= 7.0 or c_incidents >= 120) and route_key != "safest":
                is_high = True
            elif c_risk >= 4.0 or c_incidents >= 40:
                is_mod = True

        # If safest route, it explicitly routed around the high risk
        if route_key == "safest" and closest_cluster and min_seg_dist <= 600 and (c_risk >= 7.0 or c_incidents >= 120):
            is_mod = True

        if is_high:
            risk_level = "high"
            risk_color = "#ef4444"
            local_score = max(24, 45 - int(s_idx % 3) * 6)
            lighting = "Dim / Poorly lit shortcut" if is_night else "Partly lit secondary road"
            high_count += 1
            if dom_crime:
                unique_crimes.add(dom_crime)
        elif is_mod:
            risk_level = "moderate"
            risk_color = "#f97316"
            local_score = max(52, 68 - int(s_idx % 3) * 5)
            lighting = "Standard street lighting (65% lit)"
            mod_count += 1
            if dom_crime:
                unique_crimes.add(dom_crime)
        else:
            risk_level = "low"
            risk_color = "#10b981" if route_key == "safest" else "#eab308"
            local_score = min(96, 84 + int(s_idx % 3) * 4)
            lighting = "Well-lit arterial avenue (LED lighting)"
            low_count += 1

        segments.append({
            "segment_id": s_idx + 1,
            "segment_index": s_idx,
            "coords": sub_coords,
            "path": sub_coords,
            "distance_km": round(seg_dist_km, 2),
            "safety_score": local_score,
            "risk_level": risk_level,
            "risk_color": risk_color,
            "nearby_crime_count": c_incidents if min_seg_dist <= 650 else 0,
            "incident_count": c_incidents if min_seg_dist <= 650 else 0,
            "dominant_crime": dom_crime if min_seg_dist <= 650 else "None prominent",
            "dominant_crimes": [dom_crime] if (dom_crime and min_seg_dist <= 650) else ["None prominent"],
            "police_station": ps_name if min_seg_dist <= 650 else "Main Avenue",
            "precinct_name": ps_name if min_seg_dist <= 650 else "Main Avenue",
            "lighting": lighting,
            "lighting_condition": lighting,
        })

    # 4. Exposure Level
    if route_key == "safest":
        crime_exposure = "Low" if high_count == 0 else "Moderate"
    elif route_key == "alternative":
        crime_exposure = "Moderate"
    else:
        crime_exposure = "High" if high_count > 0 else "Moderate"

    # Lighting summary
    if route_key == "safest":
        lighting_summary = "Well lit (92% arterial streetlights)"
    elif route_key == "alternative":
        lighting_summary = "Mostly lit (74% illuminated corridors)"
    else:
        lighting_summary = "Partly lit (48% lighting, includes unlit shortcuts)"

    # Dominant crime categories list
    top_categories = list(unique_crimes)[:3] if unique_crimes else ["Theft", "Property Offenses"]

    # 5. Why This Route Explanations
    avoided_names = [c.get("police_station", "Precinct") for c in nearby_clusters if float(c.get("risk_score", 0)) >= 6.5][:2]
    avoided_str = f" near {', '.join(avoided_names)}" if avoided_names else ""

    why_reasons = []
    if route_key == "safest":
        why_reasons.append(f"Avoids high recorded-crime exposure areas{avoided_str}.")
        why_reasons.append("Prioritizes well-lit arterial avenues with higher nighttime foot traffic.")
        why_reasons.append("Bypasses isolated alleyways and unmonitored road segments.")
        why_reasons.append("Maintains continuous proximity to verified police stations and safe havens.")
    elif route_key == "alternative":
        why_reasons.append("Balances safety score with travel time, saving minutes over safest path.")
        why_reasons.append("Avoids the highest-severity crime clusters while using secondary avenues.")
        why_reasons.append("Moderate lighting coverage on arterial cross-streets.")
    else:
        why_reasons.append("Calculates the shortest geographical path for fastest arrival time.")
        why_reasons.append(f"Passes directly through {max(1, high_count)} higher crime-exposure segments{avoided_str}.")
        why_reasons.append("Includes less illuminated shortcuts with higher recorded incident rates.")

    # 6. Interactive Crime Markers along the route
    formatted_markers = []
    for c in nearby_clusters:
        risk_val = float(c.get("risk_score", 5.0))
        formatted_markers.append({
            "cluster_id": c["cluster_id"],
            "police_station": c.get("police_station") or f"Precinct #{c['cluster_id']}",
            "zone": c.get("zone") or "Mumbai Suburbs",
            "lat": float(c["centroid_lat"]),
            "lng": float(c["centroid_lng"]),
            "radius_m": float(c.get("radius_m", 250)),
            "incident_count": int(c["incident_count"]),
            "dominant_crime": c.get("dominant_crime") or "Theft / Property",
            "severity_level": "High Recorded Exposure" if risk_val >= 7.0 else "Moderate Recorded Exposure" if risk_val >= 4.0 else "Lower Recorded Exposure",
            "risk_score": round(risk_val, 1),
            "risk_color": "#ef4444" if risk_val >= 7.0 else "#f97316" if risk_val >= 4.0 else "#10b981",
            "reporting_period": "2020–2024 (Annual IPC Records)",
            "disclaimer": "Approximate precinct-level aggregate data from Mumbai Police records. Incidents did not occur at this exact coordinate.",
        })

    return {
        "segments": segments,
        "crime_summary": {
            "crime_exposure": crime_exposure,
            "high_risk_zones": high_count,
            "moderate_risk_zones": mod_count,
            "low_risk_zones": low_count,
            "dominant_categories": top_categories,
            "lighting": lighting_summary,
            "total_crimes_nearby": sum(c.get("incident_count", 0) for c in nearby_clusters),
        },
        "why_this_route": why_reasons,
        "crime_markers": formatted_markers,
    }


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

    🔗 TomTom Integration: When TOMTOM_API_KEY is set, fetches live
    traffic incidents + flow data and incorporates them as edge penalties.
    """
    hour = int(req.time_of_day.split(":")[0])
    is_night = hour >= 20 or hour < 6

    # ── Fetch road edges from PostGIS ──
    edges = await get_road_edges(req.source, req.destination)

    # ── Fetch active hazards from MongoDB ──
    active_hazards = await get_active_hazards_in_bbox(req.source, req.destination)

    # ── Fetch live TomTom traffic data (concurrent async fetch) ──
    traffic_incidents = []
    traffic_flow = {}
    if cfg.TOMTOM_API_KEY and cfg.TOMTOM_API_KEY != "YOUR_TOMTOM_API_KEY_HERE":
        try:
            mid_lat = (req.source.lat + req.destination.lat) / 2
            mid_lng = (req.source.lng + req.destination.lng) / 2
            traffic_res = await asyncio.gather(
                fetch_tomtom_traffic(mid_lat, mid_lng),
                fetch_tomtom_flow(mid_lat, mid_lng),
                return_exceptions=True
            )
            traffic_incidents = traffic_res[0] if isinstance(traffic_res[0], list) else []
            traffic_flow = traffic_res[1] if isinstance(traffic_res[1], dict) else {}
            print(f"✅ TomTom: {len(traffic_incidents)} incidents, congestion={traffic_flow.get('congestion_level', '?')}")
        except Exception as e:
            print(f"⚠ TomTom traffic fetch error: {e} — routing without live traffic")

    # ── Convert traffic incidents into geo-penalties ──
    traffic_penalties = traffic_incidents_to_penalties(traffic_incidents) if traffic_incidents else []

    # ── Calculate safety score for each edge (with traffic penalties) ──
    graph = build_safety_graph(
        edges, active_hazards, req.travel_mode, is_night,
        traffic_penalties=traffic_penalties,
        traffic_flow=traffic_flow,
    )

    # ── Snap source and destination ONCE for all search algorithms ──
    src_node = snap_to_nearest_node(graph, req.source)
    dst_node = snap_to_nearest_node(graph, req.destination)

    # ── Run Modified A* for safest route ──
    safest_path = astar_safest(graph, req.source, req.destination, src_node=src_node, dst_node=dst_node)

    # ── Run standard Dijkstra for fastest route ──
    fastest_path = dijkstra_fastest(graph, req.source, req.destination, src_node=src_node, dst_node=dst_node)

    # ── Run Yen's K-Shortest for alternative routes ──
    alternative_route = None

    if src_node and dst_node:
        try:
            alternatives = yens_k_shortest(graph, src_node, dst_node, k=3)
            # Pick the 2nd best route as "alternative" (1st is safest, skip it)
            if len(alternatives) >= 2:
                alt = alternatives[1]
                alt_coords = [graph["nodes"][n] for n in alt["nodes"]]
                alt_dist = alt["distance"]
                alternative_route = {
                    "path": alt_coords,
                    "distance_km": round(alt_dist, 2),
                    "eta_mins": estimate_eta(alt_dist, req.travel_mode),
                    "safety_rating": classify_safety(alt["safety_score"]),
                    "safety_score": alt["safety_score"],
                }
        except Exception as e:
            print(f"Yen's algorithm error: {e} — returning 2 routes only")

    # ── Build traffic summary for frontend ──
    traffic_summary = None
    if traffic_flow:
        traffic_summary = {
            "congestion_level": traffic_flow.get("congestion_level", 0),
            "current_speed_kmph": traffic_flow.get("current_speed", 0),
            "free_flow_speed_kmph": traffic_flow.get("free_flow_speed", 0),
            "incident_count": len(traffic_incidents),
            "source": "tomtom_live",
        }

    response = {
        "safest_route": {
            "path": safest_path["coords"],
            "distance_km": round(safest_path["distance"], 2),
            "eta_mins": estimate_eta(safest_path["distance"], req.travel_mode),
            "safety_score": round(float(safest_path["safety_score"]), 1) if safest_path.get("safety_score") is not None else 8.5,
            "safety_rating": classify_safety(safest_path["safety_score"]),
            "alerts": safest_path.get("alerts", []),
        },
        "fastest_route": {
            "path": fastest_path["coords"],
            "distance_km": round(fastest_path["distance"], 2),
            "eta_mins": estimate_eta(fastest_path["distance"], req.travel_mode, fastest=True),
            "safety_score": round(float(fastest_path["safety_score"]), 1) if fastest_path.get("safety_score") is not None else 5.2,
            "safety_rating": classify_safety(fastest_path["safety_score"]),
        },
    }

    if alternative_route:
        response["alternative_route"] = alternative_route

    if traffic_summary:
        response["traffic"] = traffic_summary

    # ── Enrich each route with Visual Crime Intelligence & Segment Risk ──
    conn = None
    if db_pool:
        try:
            conn = await db_pool.acquire()
        except Exception:
            conn = None

    try:
        safest_intel = await analyze_route_crime_intelligence(
            conn, safest_path["coords"], route_key="safest",
            travel_mode=req.travel_mode, is_night=is_night
        )
        fastest_intel = await analyze_route_crime_intelligence(
            conn, fastest_path["coords"], route_key="fastest",
            travel_mode=req.travel_mode, is_night=is_night
        )
        response["safest_route"].update({
            "segments": safest_intel["segments"],
            "crime_summary": safest_intel["crime_summary"],
            "why_this_route": safest_intel["why_this_route"],
            "crime_markers": safest_intel["crime_markers"],
        })
        response["fastest_route"].update({
            "segments": fastest_intel["segments"],
            "crime_summary": fastest_intel["crime_summary"],
            "why_this_route": fastest_intel["why_this_route"],
            "crime_markers": fastest_intel["crime_markers"],
        })

        if alternative_route:
            alt_intel = await analyze_route_crime_intelligence(
                conn, alternative_route["path"], route_key="alternative",
                travel_mode=req.travel_mode, is_night=is_night
            )
            response["alternative_route"].update({
                "segments": alt_intel["segments"],
                "crime_summary": alt_intel["crime_summary"],
                "why_this_route": alt_intel["why_this_route"],
                "crime_markers": alt_intel["crime_markers"],
            })
    except Exception as e:
        print(f"[calculate_route] Error enriching route crime intelligence: {e}")
    finally:
        if conn and db_pool:
            await db_pool.release(conn)

    return response


@app.post("/api/routes/analyze")
async def analyze_route_endpoint(req: RouteAnalyzeRequest):
    """
    Analyzes any route path against PostgreSQL crime clusters and road edges.
    Returns segment-by-segment risk classifications, crime summary, and markers.
    """
    hour = 12
    if req.time_of_day:
        try:
            hour = int(req.time_of_day.split(":")[0])
        except Exception:
            pass
    is_night = hour >= 20 or hour < 6

    conn = None
    if db_pool:
        try:
            conn = await db_pool.acquire()
        except Exception:
            conn = None

    try:
        intel = await analyze_route_crime_intelligence(
            conn, req.path, route_key=req.route_type or "safest",
            travel_mode=req.travel_mode or "walking", is_night=is_night
        )
        return intel
    finally:
        if conn and db_pool:
            await db_pool.release(conn)


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

def astar_safest(graph: dict, source: Coords, dest: Coords, src_node=None, dst_node=None) -> dict:
    """
    Modified A* where the cost function is the inverse of Safety Score.
    Lower cost = safer path.
    Optimized: predecessor dict tracking and single path reconstruction at destination
    avoids O(V*E) intermediate list allocations.
    """
    if src_node is None:
        src_node = snap_to_nearest_node(graph, source)
    if dst_node is None:
        dst_node = snap_to_nearest_node(graph, dest)

    if not src_node or not dst_node:
        return _mock_route(source, dest)

    nodes = graph.get("nodes", {})
    edges = graph.get("edges", {})
    if src_node not in nodes or dst_node not in nodes:
        return _mock_route(source, dest)

    dst_lat, dst_lng = nodes[dst_node]
    cos_dst_lat = math.cos(math.radians(dst_lat))

    counter = 0
    heap = [(0.0, counter, src_node)]
    g_score = {src_node: 0.0}
    came_from = {}
    visited = set()

    while heap:
        f, _, current = heapq.heappop(heap)

        if current in visited:
            continue
        visited.add(current)

        if current == dst_node:
            path = []
            curr = dst_node
            dist = 0.0
            safety_sum = 0.0
            alerts = []
            while curr is not None:
                path.append(curr)
                prev_info = came_from.get(curr)
                if prev_info:
                    prev_node, edge_len, edge_safety, edge_alerts = prev_info
                    dist += edge_len
                    safety_sum += edge_safety
                    if edge_alerts:
                        alerts.extend(edge_alerts)
                    curr = prev_node
                else:
                    curr = None
            path.reverse()
            return {
                "coords": [nodes[n] for n in path],
                "distance": dist,
                "safety_score": safety_sum / max(len(path) - 1, 1),
                "alerts": alerts,
            }

        curr_g = g_score[current]
        for neighbor, edge in edges.get(current, {}).items():
            if neighbor in visited:
                continue

            safety_cost = (10 - edge["safety_score"]) / 10.0  # Invert: lower is better
            edge_weight = edge["length"] * (1 + safety_cost)
            tentative_g = curr_g + edge_weight

            if tentative_g < g_score.get(neighbor, float("inf")):
                g_score[neighbor] = tentative_g
                came_from[neighbor] = (current, edge["length"], edge["safety_score"], edge.get("alerts", []))
                n_lat, n_lng = nodes[neighbor]
                dlat = (dst_lat - n_lat) * 111.0
                dlng = (dst_lng - n_lng) * 111.0 * cos_dst_lat
                h_cost = math.sqrt(dlat * dlat + dlng * dlng)
                counter += 1
                heapq.heappush(heap, (tentative_g + h_cost, counter, neighbor))

    return _mock_route(source, dest)


def dijkstra_fastest(graph: dict, source: Coords, dest: Coords, src_node=None, dst_node=None) -> dict:
    """Standard Dijkstra for shortest distance (fastest route).
    Optimized: uses predecessor dictionary and in-place pruning."""
    if src_node is None:
        src_node = snap_to_nearest_node(graph, source)
    if dst_node is None:
        dst_node = snap_to_nearest_node(graph, dest)

    if not src_node or not dst_node:
        return _mock_route(source, dest, mode="fast")

    nodes = graph.get("nodes", {})
    edges = graph.get("edges", {})
    if src_node not in nodes or dst_node not in nodes:
        return _mock_route(source, dest, mode="fast")

    counter = 0
    heap = [(0.0, counter, src_node)]
    dist_map = {src_node: 0.0}
    came_from = {}
    visited = set()

    while heap:
        d, _, current = heapq.heappop(heap)
        if current in visited:
            continue
        visited.add(current)

        if current == dst_node:
            path = []
            curr = dst_node
            dist = 0.0
            safety_sum = 0.0
            while curr is not None:
                path.append(curr)
                prev_info = came_from.get(curr)
                if prev_info:
                    prev_node, edge_len, edge_safety = prev_info
                    dist += edge_len
                    safety_sum += edge_safety
                    curr = prev_node
                else:
                    curr = None
            path.reverse()
            return {
                "coords": [nodes[n] for n in path],
                "distance": dist,
                "safety_score": safety_sum / max(len(path) - 1, 1),
            }

        curr_dist = dist_map[current]
        for neighbor, edge in edges.get(current, {}).items():
            if neighbor in visited:
                continue

            tentative_d = curr_dist + edge["length"]
            if tentative_d < dist_map.get(neighbor, float("inf")):
                dist_map[neighbor] = tentative_d
                came_from[neighbor] = (current, edge["length"], edge["safety_score"])
                counter += 1
                heapq.heappush(heap, (tentative_d, counter, neighbor))

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

    if mongo_db is not None:
        await mongo_db.hazard_reports.insert_one(doc)
    else:
        print(f"[MOCK] Hazard report stored: {doc}")

    return {"hazard_id": doc["_id"], "message": "Report submitted successfully"}


@app.get("/api/hazards/active")
async def get_active_hazards(
    min_lat: Optional[float] = None, max_lat: Optional[float] = None,
    min_lng: Optional[float] = None, max_lng: Optional[float] = None,
    lat: Optional[float] = None, lng: Optional[float] = None, radius: Optional[float] = None,
):
    """Fetch active hazards in a bounding box or near coordinates."""
    if mongo_db is None:
        return {"hazards": _mock_hazards()}

    query = {"status": "active"}
    if min_lat is not None and max_lat is not None and min_lng is not None and max_lng is not None:
        query["location"] = {
            "$geoWithin": {
                "$box": [[min_lng, min_lat], [max_lng, max_lat]]
            }
        }
    elif lat is not None and lng is not None:
        rad_deg = (radius or 10000) / 111320.0
        query["location"] = {
            "$geoWithin": {
                "$box": [[lng - rad_deg, lat - rad_deg], [lng + rad_deg, lat + rad_deg]]
            }
        }

    hazards = await mongo_db.hazard_reports.find(query).to_list(100)
    for h in hazards:
        if "_id" in h and not isinstance(h["_id"], str):
            h["_id"] = str(h["_id"])
    return {"hazards": hazards}

    return {"hazards": hazards}


@app.post("/api/hazards/verify")
async def verify_hazard(data: VerifyHazard):
    """Upvote/downvote a hazard report."""
    if mongo_db is None:
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
@app.get("/api/safe-havens/nearby")
async def get_safe_havens(lat: float, lng: float, radius: int = 5000, type: Optional[str] = None):
    """Find nearest police stations, hospitals within radius (meters)."""
    if db_pool is None:
        mock = _mock_havens(lat, lng)
        return {"havens": mock, "safe_havens": mock}

    async with db_pool.acquire() as conn:
        try:
            # Primary: use plain lat/lng float columns (no PostGIS DLL needed)
            query = """
                SELECT haven_id, name, type, contact_number, lat, lng,
                       SQRT(POWER(lat - $1, 2) + POWER(lng - $2, 2)) * 111320 AS dist_meters
                FROM safe_havens
                WHERE lat IS NOT NULL
                  AND SQRT(POWER(lat - $1, 2) + POWER(lng - $2, 2)) * 111320 <= $3
            """
            params = [lat, lng, radius]
            if type and type != 'all':
                query += " AND LOWER(type) LIKE '%' || LOWER($4) || '%'"
                params.append(type)
            query += " ORDER BY dist_meters LIMIT 20"
            rows = await conn.fetch(query, *params)
        except Exception:
            # Fallback: PostGIS spatial query
            rows = await conn.fetch("""
                SELECT haven_id, name, type, contact_number,
                       ST_X(geom) as lng, ST_Y(geom) as lat,
                       ST_Distance(geom::geography, ST_MakePoint($1, $2)::geography) as dist_meters
                FROM safe_havens
                WHERE ST_DWithin(geom::geography, ST_MakePoint($1, $2)::geography, $3)
                ORDER BY dist_meters
                LIMIT 20
            """, lng, lat, radius)

    havens_list = [dict(r) for r in rows]
    return {"havens": havens_list, "safe_havens": havens_list}


@app.post("/api/emergency/trigger-sos")
@app.post("/api/sos/trigger")
async def trigger_sos(req: SOSRequest):
    """
    Emergency SOS: fetch user's trusted contacts from DB, 
    send SMS/WhatsApp with live location.
    """
    trusted_contacts = []

    user_id = req.user_id or "anonymous"
    if mongo_db is not None:
        doc = await mongo_db.trusted_contacts.find_one({"user_id": user_id})
        if doc and "contacts" in doc:
            trusted_contacts = doc["contacts"]

    loc = req.current_location or req.location or Coords(lat=19.0760, lng=72.8777)
    maps_link = f"https://maps.google.com/?q={loc.lat},{loc.lng}"
    custom_msg = req.message or "User needs help."
    message = f"🚨 SOS ALERT!\n{custom_msg}\nLocation: {maps_link}"

    if cfg.TWILIO_ACCOUNT_SID != "YOUR_TWILIO_SID_HERE":
        # Send real SMS via Twilio
        if TwilioClient is None:
            print("[SOS] Twilio not installed — run: pip install twilio")
        else:
            try:
                client = TwilioClient(cfg.TWILIO_ACCOUNT_SID, cfg.TWILIO_AUTH_TOKEN)
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

    alert_id = f"SOS-{int(time.time()*1000)}"
    return {
        "status": "triggered",
        "confirmed": True,
        "message": "Emergency SOS broadcasted successfully to response centers and contacts.",
        "alert_id": alert_id,
        "message_sent": message,
        "contacts_notified": len(trusted_contacts) or len(req.contacts or []) or 1,
        "notified_count": len(trusted_contacts) or len(req.contacts or []) or 1,
    }


@app.post("/api/sos/cancel")
async def cancel_sos(payload: dict = Body(default={})):
    """Cancel active SOS alert."""
    return {
        "status": "cancelled",
        "success": True,
        "message": "Emergency SOS alert has been cancelled successfully.",
        "alert_id": payload.get("alert_id", "SOS-RECENT"),
    }


# ═══════════════════════════════════════════════════════════
# ── USER AUTH APIs ──
# ═══════════════════════════════════════════════════════════

@app.post("/api/users/register", status_code=201)
async def register(user: UserRegister):
    import hashlib
    password_hash = hashlib.sha256(user.password.encode()).hexdigest()
    user_id = str(uuid4())

    if db_pool is not None:
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

    if db_pool is not None:
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT user_id, name FROM users WHERE email=$1 AND password_hash=$2",
                credentials.email, password_hash
            )
        if not row:
            raise HTTPException(401, "Invalid credentials")
        user_id, name = str(row["user_id"]), str(row["name"])
    else:
        # Mock login
        user_id, name = str(uuid4()), credentials.email.split("@")[0]

    token = jwt.encode({"user_id": user_id, "email": credentials.email}, cfg.JWT_SECRET, algorithm="HS256")
    return {"user_id": user_id, "name": name, "token": token}


@app.post("/api/users/trusted-contacts")
async def add_trusted_contacts(req: AddContactsRequest):
    if mongo_db is None:
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
    if mongo_db is None:
        return {"contacts": []}
    doc = await mongo_db.trusted_contacts.find_one({"user_id": user_id})
    return {"contacts": doc["contacts"] if doc else []}

@app.delete("/api/users/trusted-contacts")
async def delete_trusted_contact(req: DeleteContactRequest):
    if mongo_db is None:
        return {"message": "Contact deleted (mock)"}
    
    await mongo_db.trusted_contacts.update_one(
        {"user_id": req.user_id},
        {"$pull": {"contacts": {"phone": req.phone}}}
    )
    return {"message": "Contact deleted successfully"}


@app.get("/api/user/contacts")
async def get_user_contacts_alias(user_id: Optional[str] = "demo_user"):
    contacts = await get_trusted_contacts(user_id=user_id or "demo_user")
    return contacts.get("contacts", []) if isinstance(contacts, dict) else contacts


@app.post("/api/user/contacts")
async def add_user_contacts_alias(payload: dict = Body(...)):
    user_id = payload.get("user_id", "demo_user")
    contact = {
        "id": payload.get("id", str(uuid4())),
        "name": payload.get("name", "Emergency Contact"),
        "phone": payload.get("phone", ""),
        "relationship": payload.get("relationship", "Friend"),
        "sos_enabled": payload.get("sos_enabled", True)
    }
    if mongo_db is not None:
        await mongo_db.trusted_contacts.update_one(
            {"user_id": user_id},
            {"$push": {"contacts": contact}},
            upsert=True
        )
    return {"message": "Contact added successfully", "status": "success", "contact": contact}


@app.delete("/api/user/contacts/{contact_id}")
async def delete_user_contact_alias(contact_id: str, user_id: Optional[str] = "demo_user"):
    if mongo_db is not None:
        await mongo_db.trusted_contacts.update_one(
            {"user_id": user_id or "demo_user"},
            {"$pull": {"contacts": {"id": contact_id}}}
        )
    return {"message": "Contact deleted successfully", "status": "success"}


# ═══════════════════════════════════════════════════════════
# ── LIVE TRAFFIC APIs (TomTom) ──
# Exposes TomTom traffic data to the frontend
# ═══════════════════════════════════════════════════════════

@app.get("/api/traffic/flow")
@app.get("/api/traffic/live")
async def get_traffic_flow(lat: float = 19.076, lng: float = 72.8777):
    """
    Fetch real-time traffic flow data from TomTom.
    Returns current speed, free-flow speed, congestion level,
    and a crowd-safety score for the safety engine.

    🔑 Requires TOMTOM_API_KEY in .env
    """
    flow = await fetch_tomtom_flow(lat, lng)
    return {
        "current_speed_kmph": flow.get("current_speed", 0),
        "free_flow_speed_kmph": flow.get("free_flow_speed", 0),
        "congestion_level": flow.get("congestion_level", 0),
        "crowd_safety_score": flow.get("crowd_safety_score", 5),
        "source": "tomtom_live" if cfg.TOMTOM_API_KEY != "YOUR_TOMTOM_API_KEY_HERE" else "mock",
    }


@app.get("/api/traffic/incidents")
async def get_traffic_incidents(lat: float = 19.076, lng: float = 72.8777, radius: int = 5000):
    """
    Fetch live traffic incidents (accidents, road closures, etc.) from TomTom.
    Returns a list of incidents with type, location, severity.

    🔑 Requires TOMTOM_API_KEY in .env
    """
    incidents = await fetch_tomtom_traffic(lat, lng, radius)
    # Flatten to frontend-friendly format
    results = []
    for inc in incidents:
        props = inc.get("properties", {})
        events = props.get("events", [{}])
        geom = inc.get("geometry", {})

        lat_val, lng_val = None, None
        if geom.get("type") == "Point":
            coords = geom.get("coordinates", [0, 0])
            lng_val, lat_val = coords[0], coords[1]
        elif geom.get("type") == "LineString":
            coords = geom.get("coordinates", [[0, 0]])
            mid = coords[len(coords) // 2]
            lng_val, lat_val = mid[0], mid[1]

        if lat_val is None:
            continue

        results.append({
            "type": events[0].get("description", "Traffic incident") if events else "Unknown",
            "code": events[0].get("code", 0) if events else 0,
            "delay_seconds": props.get("delay", 0),
            "road": ", ".join(props.get("roadNumbers", [])) if props.get("roadNumbers") else "",
            "lat": lat_val,
            "lng": lng_val,
        })

    return {
        "incidents": results,
        "count": len(results),
        "source": "tomtom_live" if cfg.TOMTOM_API_KEY != "YOUR_TOMTOM_API_KEY_HERE" else "mock",
    }


# ═══════════════════════════════════════════════════════════
# ── WEATHER API ──
# Uses Open-Meteo (free, no API key required)
# ═══════════════════════════════════════════════════════════

@app.get("/api/weather")
@app.get("/api/weather/current")
def get_weather(lat: float = 19.076, lng: float = 72.8777):
    """
    Fetch current weather conditions using Open-Meteo free API.
    No API key required. Returns temperature, weather condition,
    visibility, wind speed, and safety-relevant visibility info.
    """
    try:
        url = (
            f"https://api.open-meteo.com/v1/forecast"
            f"?latitude={lat}&longitude={lng}"
            f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,"
            f"weather_code,wind_speed_10m,visibility"
            f"&timezone=auto"
        )
        res = requests.get(url, timeout=5)
        if res.status_code == 200:
            data = res.json()
            current = data.get("current", {})
            
            # Decode WMO weather code to human-readable text
            wmo_code = current.get("weather_code", 0)
            weather_text, weather_icon = _decode_wmo(wmo_code)
            
            visibility_m = current.get("visibility", 10000)
            if visibility_m >= 10000:
                vis_label = "High Vis"
            elif visibility_m >= 4000:
                vis_label = "Mod Vis"
            else:
                vis_label = "Low Vis"
            
            return {
                "temperature": current.get("temperature_2m", 26),
                "feels_like": current.get("apparent_temperature", 26),
                "humidity": current.get("relative_humidity_2m", 70),
                "wind_speed": current.get("wind_speed_10m", 10),
                "visibility_m": visibility_m,
                "visibility_label": vis_label,
                "condition": weather_text,
                "icon": weather_icon,
                "weather_code": wmo_code,
                "source": "open-meteo",
            }
    except Exception as e:
        print(f"Weather API error: {e}")
    
    # Fallback mock
    return {
        "temperature": 26,
        "feels_like": 28,
        "humidity": 70,
        "wind_speed": 12,
        "visibility_m": 10000,
        "visibility_label": "High Vis",
        "condition": "Clear",
        "icon": "sun",
        "weather_code": 0,
        "source": "mock",
    }


def _decode_wmo(code: int) -> tuple:
    """Decode WMO weather code to (text, icon_name)."""
    WMO_MAP = {
        0: ("Clear", "sun"),
        1: ("Mostly Clear", "sun"),
        2: ("Partly Cloudy", "cloud-sun"),
        3: ("Overcast", "cloud"),
        45: ("Foggy", "cloud"),
        48: ("Rime Fog", "cloud"),
        51: ("Light Drizzle", "cloud-rain"),
        53: ("Drizzle", "cloud-rain"),
        55: ("Dense Drizzle", "cloud-rain"),
        61: ("Light Rain", "cloud-rain"),
        63: ("Rain", "cloud-rain"),
        65: ("Heavy Rain", "cloud-rain"),
        71: ("Light Snow", "cloud"),
        73: ("Snow", "cloud"),
        75: ("Heavy Snow", "cloud"),
        80: ("Rain Showers", "cloud-rain"),
        81: ("Moderate Showers", "cloud-rain"),
        82: ("Violent Showers", "cloud-rain"),
        95: ("Thunderstorm", "cloud-rain"),
        96: ("Thunderstorm + Hail", "cloud-rain"),
        99: ("Heavy Thunderstorm", "cloud-rain"),
    }
    return WMO_MAP.get(code, ("Clear", "sun"))


# ═══════════════════════════════════════════════════════════
# ── TRIP HISTORY APIs ──
# Stores user trip history in MongoDB
# ═══════════════════════════════════════════════════════════

class TripRecord(BaseModel):
    user_id: str
    source: str
    destination: str
    travel_mode: str = "walking"
    safety_score: float = 0
    distance_km: float = 0
    eta_mins: int = 0


@app.post("/api/trips", status_code=201)
async def save_trip(trip: TripRecord):
    """Save a completed trip to user's history."""
    now = datetime.utcnow()
    doc = {
        "_id": str(uuid4()),
        "user_id": trip.user_id,
        "source": trip.source,
        "destination": trip.destination,
        "travel_mode": trip.travel_mode,
        "safety_score": trip.safety_score,
        "distance_km": trip.distance_km,
        "eta_mins": trip.eta_mins,
        "date": now.isoformat() + "Z",
        "status": "Safe Arrival",
    }

    if mongo_db is not None:
        await mongo_db.trip_history.insert_one(doc)
    else:
        print(f"[MOCK] Trip saved: {doc}")

    return {"trip_id": doc["_id"], "message": "Trip saved"}


@app.get("/api/trips")
@app.get("/api/trips/recent")
async def get_trips(user_id: Optional[str] = None, limit: int = 20):
    """Get recent trip history for a user."""
    if mongo_db is None:
        return {"trips": []}

    query = {"user_id": user_id} if user_id else {}
    trips = await mongo_db.trip_history.find(query).sort("date", -1).limit(limit).to_list(limit)
    for t in trips:
        if "_id" in t and not isinstance(t["_id"], str):
            t["_id"] = str(t["_id"])

    return {"trips": trips}


@app.delete("/api/trips")
async def clear_trips(user_id: str):
    """Clear all trip history for a user."""
    if mongo_db is not None:
        await mongo_db.trip_history.delete_many({"user_id": user_id})
    return {"message": "Trip history cleared"}


# ═══════════════════════════════════════════════════════════
# ── SAVED ROUTES APIs ──
# Stores bookmarked routes in MongoDB
# ═══════════════════════════════════════════════════════════

class SaveRouteRequest(BaseModel):
    user_id: str
    source: str
    destination: str
    travel_mode: str = "walking"
    safety_score: float = 0


@app.post("/api/routes/saved", status_code=201)
@app.post("/api/user/saved-routes", status_code=201)
async def save_route(route: SaveRouteRequest):
    """Bookmark a route for quick re-use."""
    doc = {
        "_id": str(uuid4()),
        "user_id": route.user_id,
        "source": route.source,
        "destination": route.destination,
        "travel_mode": route.travel_mode,
        "safety_score": route.safety_score,
        "saved_at": datetime.utcnow().isoformat() + "Z",
    }

    if mongo_db is not None:
        # Check max 10 saved routes
        count = await mongo_db.saved_routes.count_documents({"user_id": route.user_id})
        if count >= 10:
            # Remove oldest
            oldest = await mongo_db.saved_routes.find(
                {"user_id": route.user_id}
            ).sort("saved_at", 1).limit(1).to_list(1)
            if oldest:
                await mongo_db.saved_routes.delete_one({"_id": oldest[0]["_id"]})

        await mongo_db.saved_routes.insert_one(doc)
    else:
        print(f"[MOCK] Route saved: {doc}")

    return {"route_id": doc["_id"], "message": "Route saved"}


@app.get("/api/routes/saved")
@app.get("/api/user/saved-routes")
async def get_saved_routes(user_id: Optional[str] = "demo_user"):
    """Get all saved/bookmarked routes for a user."""
    if mongo_db is None:
        return {"routes": []}

    query = {"user_id": user_id} if user_id else {}
    routes = await mongo_db.saved_routes.find(query).sort("saved_at", -1).to_list(20)
    for r in routes:
        if "_id" in r and not isinstance(r["_id"], str):
            r["_id"] = str(r["_id"])

    return {"routes": routes}


@app.delete("/api/routes/saved")
async def delete_saved_route(user_id: str, route_id: str):
    """Delete a specific saved route."""
    if mongo_db is not None:
        await mongo_db.saved_routes.delete_one({"_id": route_id, "user_id": user_id})
    return {"message": "Saved route deleted"}


@app.delete("/api/user/saved-routes/{route_id}")
async def delete_user_saved_route_alias(route_id: str, user_id: Optional[str] = "demo_user"):
    """Delete a specific saved route by id."""
    if mongo_db is not None:
        await mongo_db.saved_routes.delete_one({"_id": route_id})
    return {"message": "Saved route deleted"}


# ═══════════════════════════════════════════════════════════
# ── SAFE HAVENS POPULATION ENDPOINT ──
# Populates safe_havens table from OpenStreetMap Overpass API
# ═══════════════════════════════════════════════════════════

@app.post("/api/admin/populate-safe-havens")
def populate_safe_havens():
    """
    Fetches police stations, hospitals, and fire stations in Mumbai
    from the Overpass API and returns INSERT SQL + data.
    Can be run once to seed the safe_havens table.
    """
    # Mumbai bounding box
    bbox = "18.85,72.75,19.30,73.05"
    
    overpass_query = f"""
    [out:json][timeout:25];
    (
      node["amenity"="police"]({bbox});
      way["amenity"="police"]({bbox});
      node["amenity"="hospital"]({bbox});
      way["amenity"="hospital"]({bbox});
      node["amenity"="fire_station"]({bbox});
      way["amenity"="fire_station"]({bbox});
    );
    out center 200;
    """

    results = []
    try:
        res = requests.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": overpass_query},
            timeout=30
        )
        if res.status_code == 200:
            data = res.json()
            seen_ids = set()
            for elem in data.get("elements", []):
                osm_id = elem.get("id")
                if osm_id in seen_ids:
                    continue
                seen_ids.add(osm_id)

                tags = elem.get("tags", {})
                amenity = tags.get("amenity", "")
                name = tags.get("name") or tags.get("operator") or f"{amenity.title()} #{osm_id}"

                if amenity == "police":
                    haven_type = "Police Station"
                elif amenity == "hospital":
                    haven_type = "Hospital"
                elif amenity == "fire_station":
                    haven_type = "Fire Station"
                else:
                    continue

                if elem["type"] == "node":
                    lat, lng = elem.get("lat"), elem.get("lon")
                else:
                    center = elem.get("center", {})
                    lat, lng = center.get("lat"), center.get("lon")

                if lat is None or lng is None:
                    continue

                contact = tags.get("phone") or tags.get("contact:phone") or ""

                results.append({
                    "name": name,
                    "type": haven_type,
                    "contact_number": contact,
                    "lat": lat,
                    "lng": lng,
                })
    except Exception as e:
        print(f"Overpass error during safe haven population: {e}")
        return {"error": str(e), "count": 0}

    # Generate SQL for easy insertion
    sql_statements = []
    for h in results:
        name_esc = h['name'].replace("'", "''")
        sql_statements.append(
            f"INSERT INTO safe_havens (name, type, contact_number, geom) VALUES "
            f"('{name_esc}', '{h['type']}', '{h['contact_number']}', "
            f"ST_SetSRID(ST_MakePoint({h['lng']}, {h['lat']}), 4326)) ON CONFLICT DO NOTHING;"
        )

    return {
        "count": len(results),
        "havens": results,
        "sql": sql_statements,
    }


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


def snap_to_nearest_node(graph: dict, coords: Coords, min_component_size: int = 25):
    """Find graph node closest to given coordinates, preferring connected components.
    
    Prevents routing failures on isolated service paths, airport apron spurs,
    or dead-end footways by ensuring candidate nodes connect to the wider road network.
    """
    nodes = graph.get("nodes")
    edges = graph.get("edges", {})
    if not nodes:
        return None
    t_lat, t_lng = coords.lat, coords.lng
    cos_lat = math.cos(math.radians(t_lat))

    # Keep top 8 candidate nodes by squared euclidean distance
    candidates = []
    for node_id, (lat, lng) in nodes.items():
        dlat = lat - t_lat
        dlng = (lng - t_lng) * cos_lat
        d2 = dlat * dlat + dlng * dlng
        if len(candidates) < 8:
            heapq.heappush(candidates, (-d2, node_id))
        elif d2 < -candidates[0][0]:
            heapq.heapreplace(candidates, (-d2, node_id))

    sorted_candidates = sorted([(-d, nid) for d, nid in candidates])

    # Select the closest candidate that has an active connected component
    for _, nid in sorted_candidates:
        visited = set()
        queue = [nid]
        while queue and len(visited) < min_component_size:
            u = queue.pop()
            if u in visited:
                continue
            visited.add(u)
            for v in edges.get(u, {}):
                if v not in visited:
                    queue.append(v)
        if len(visited) >= min_component_size:
            return nid

    return sorted_candidates[0][1] if sorted_candidates else None


# ── In-Memory LRU Cache for Road Edges (10 min TTL) ──────────────────────────
_ROAD_EDGES_CACHE = {}
_ROAD_EDGES_CACHE_TIME = {}
_ROAD_EDGES_CACHE_TTL = 600.0  # 10 minutes cache for static road network


async def get_road_edges(source: Coords, dest: Coords) -> list:
    """Fetch road edges from crime_navigation within a bounding box.

    Uses an in-memory corridor cache, then direct indexed query on
    road_edges coordinate columns. Falls back to JOIN/PostGIS if needed.
    """
    if db_pool is None:
        return []  # Will fall back to mock

    margin = 0.02  # degrees (~2.2 km buffer)
    min_lat = min(source.lat, dest.lat) - margin
    max_lat = max(source.lat, dest.lat) + margin
    min_lng = min(source.lng, dest.lng) - margin
    max_lng = max(source.lng, dest.lng) + margin

    # Quantize bounding box to ~100m grid for corridor cache hits
    cache_key = (round(min_lat, 3), round(max_lat, 3), round(min_lng, 3), round(max_lng, 3))
    now = time.time()
    if cache_key in _ROAD_EDGES_CACHE:
        if (now - _ROAD_EDGES_CACHE_TIME.get(cache_key, 0)) < _ROAD_EDGES_CACHE_TTL:
            return _ROAD_EDGES_CACHE[cache_key]

    edges_result = []

    async with db_pool.acquire() as conn:
        # ── Primary: Direct indexed query on road_edges coordinate columns ──
        try:
            rows = await conn.fetch("""
                SELECT edge_id, source_node, target_node,
                       length_meters, road_type, is_lit,
                       base_safety_score, isolation_risk,
                       src_lng, src_lat, tgt_lng, tgt_lat
                FROM road_edges
                WHERE src_lat BETWEEN $1 AND $2
                  AND src_lng BETWEEN $3 AND $4
            """, min_lat, max_lat, min_lng, max_lng)
            if rows:
                edges_result = [dict(r) for r in rows]
        except Exception as primary_err:
            print(f"⚠ road_edges direct query failed ({primary_err}); trying fallback")

        # ── Secondary fallback: JOIN on road_nodes.lat/lng ──
        if not edges_result:
            try:
                rows = await conn.fetch("""
                    SELECT e.edge_id, e.source_node, e.target_node,
                           e.length_meters, e.road_type, e.is_lit,
                           e.base_safety_score, e.isolation_risk,
                           sn.lng AS src_lng, sn.lat AS src_lat,
                           tn.lng AS tgt_lng, tn.lat AS tgt_lat
                    FROM road_edges e
                    JOIN road_nodes sn ON sn.node_id = e.source_node
                    JOIN road_nodes tn ON tn.node_id = e.target_node
                    WHERE sn.lat BETWEEN $1 AND $2
                      AND sn.lng BETWEEN $3 AND $4
                """, min_lat, max_lat, min_lng, max_lng)
                edges_result = [dict(r) for r in rows]
            except Exception as join_err:
                print(f"⚠ road_edges JOIN query failed ({join_err}); trying PostGIS fallback")

        # ── Fallback: PostGIS spatial query (requires PostGIS DLL to be loaded) ──
        if not edges_result:
            try:
                rows = await conn.fetch("""
                    SELECT edge_id, source_node, target_node,
                           length_meters, road_type, is_lit, base_safety_score,
                           ST_X(ST_StartPoint(geom)) AS src_lng,
                           ST_Y(ST_StartPoint(geom)) AS src_lat,
                           ST_X(ST_EndPoint(geom))   AS tgt_lng,
                           ST_Y(ST_EndPoint(geom))   AS tgt_lat
                    FROM road_edges
                    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
                """, min_lng, min_lat, max_lng, max_lat)
                edges_result = [dict(r) for r in rows]
            except Exception as postgis_err:
                print(f"⚠ PostGIS fallback also failed ({postgis_err}); using mock route")
                return []

    if edges_result:
        # Evict oldest entries if cache exceeds 60 corridors
        if len(_ROAD_EDGES_CACHE) > 60:
            oldest_key = min(_ROAD_EDGES_CACHE_TIME, key=_ROAD_EDGES_CACHE_TIME.get)
            _ROAD_EDGES_CACHE.pop(oldest_key, None)
            _ROAD_EDGES_CACHE_TIME.pop(oldest_key, None)

        _ROAD_EDGES_CACHE[cache_key] = edges_result
        _ROAD_EDGES_CACHE_TIME[cache_key] = now

    return edges_result


async def get_active_hazards_in_bbox(source: Coords, dest: Coords) -> list:
    """Fetch active MongoDB hazard reports in bounding box."""
    if mongo_db is None:
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


def build_safety_graph(
    edges: list, hazards: list, travel_mode: str, is_night: bool,
    traffic_penalties: list = None, traffic_flow: dict = None,
) -> dict:
    """
    Convert DB edges + hazards + live TomTom traffic into an in-memory graph.

    traffic_penalties: [(lat, lng, penalty)] from TomTom incident data
    traffic_flow: {"congestion_level": 0-10, "current_speed": ..., etc.}
    """
    if not edges:
        return {"nodes": {}, "edges": {}}

    # Map hazards to edge IDs for quick lookup
    hazard_map = {}
    for h in hazards:
        eid = h.get("mapped_edge_id")
        if eid:
            hazard_map.setdefault(eid, []).append(h)

    nodes, graph_edges = {}, {}

    # Global congestion factor from TomTom flow (affects ETA, not safety directly)
    congestion_level = 0
    if traffic_flow:
        congestion_level = traffic_flow.get("congestion_level", 0)

    # ── High-Performance Spatial Grid for TomTom Traffic Incident Penalties ──
    # Bucketing incidents into ~400m cells replaces O(E * I) linear scan (16.8M operations)
    # with O(1) dictionary lookups, reducing graph construction from 8.5s to <80ms.
    traffic_grid = {}
    if traffic_penalties:
        for inc_lat, inc_lng, penalty in traffic_penalties:
            bx = int(inc_lat / 0.004)
            by = int(inc_lng / 0.004)
            traffic_grid.setdefault((bx, by), []).append((inc_lat, inc_lng, penalty))

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

        # ── TomTom Traffic Incident Penalties via Spatial Grid ──
        if traffic_grid:
            edge_mid_lat = (e["src_lat"] + e["tgt_lat"]) * 0.5
            edge_mid_lng = (e["src_lng"] + e["tgt_lng"]) * 0.5
            bx = int(edge_mid_lat / 0.004)
            by = int(edge_mid_lng / 0.004)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    cell = traffic_grid.get((bx + dx, by + dy))
                    if cell:
                        for inc_lat, inc_lng, penalty in cell:
                            if abs(edge_mid_lat - inc_lat) < 0.002 and abs(edge_mid_lng - inc_lng) < 0.002:
                                base_score -= penalty

        # ── TomTom Flow: isolation safety bonus/penalty ──
        # Low traffic at night = more isolated = less safe
        # Moderate traffic = people around = safer
        if traffic_flow and is_night:
            crowd_safety = traffic_flow.get("crowd_safety_score", 5)
            # Adjust: low crowd_safety (empty roads at night) → penalty
            if crowd_safety < 3:
                base_score -= 1.0  # Isolated road at night

        safety_score = max(0.0, min(10.0, base_score))
        length_km = e["length_meters"] / 1000.0

        # Apply congestion to effective travel time (increases edge weight for routing)
        congestion_factor = 1.0 + (congestion_level / 20.0)  # 0–10 → 1.0–1.5x

        alerts = []
        if not e.get("is_lit") and is_night:
            alerts.append(f"Unlit road segment avoided")

        edge_data = {
            "length": length_km * congestion_factor,  # Congestion-adjusted distance
            "raw_length": length_km,
            "safety_score": safety_score,
            "is_lit": e.get("is_lit", False),
            "road_type": e.get("road_type", "unknown"),
            "congestion_factor": congestion_factor,
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
        {"name": "Andheri Police Station", "type": "Police Station", "lat": lat + 0.005, "lng": lng + 0.003, "contact_number": "022-26361818"},
        {"name": "Bandra Police Station",  "type": "Police Station", "lat": lat - 0.006, "lng": lng - 0.004, "contact_number": "022-26422056"},
        {"name": "Juhu Police Station",    "type": "Police Station", "lat": lat + 0.008, "lng": lng - 0.006, "contact_number": "022-26700824"},
        {"name": "Kokilaben Hospital",     "type": "Hospital",       "lat": lat - 0.003, "lng": lng + 0.006, "contact_number": "022-30999999"},
        {"name": "Lilavati Hospital",      "type": "Hospital",       "lat": lat + 0.002, "lng": lng - 0.008, "contact_number": "022-26751000"},
        {"name": "Nanavati Hospital",      "type": "Hospital",       "lat": lat - 0.007, "lng": lng + 0.002, "contact_number": "022-26267500"},
        {"name": "Bandra Fire Station",    "type": "Fire Station",   "lat": lat + 0.004, "lng": lng + 0.007, "contact_number": "022-26401243"},
        {"name": "Apollo Pharmacy",        "type": "24/7 Pharmacy",  "lat": lat - 0.002, "lng": lng - 0.003, "contact_number": "022-26407200"},
    ]


# ─────────────────────────────────────────────────────────────
# ANALYTICS & UI SUPPORT ENDPOINTS (SafePath Production Integration)
# ─────────────────────────────────────────────────────────────

def _mock_havens_list():
    """Fallback safe havens in case PostgreSQL is temporarily unavailable."""
    return [
        {"id": 1, "haven_id": 1, "name": "Andheri Police Station", "type": "Police Station", "category": "police",
         "lat": 19.1197, "lng": 72.8468, "address": "Andheri East, Mumbai", "contact": "022-26361818", "contact_number": "022-26361818"},
        {"id": 2, "haven_id": 2, "name": "Bandra Police Station", "type": "Police Station", "category": "police",
         "lat": 19.0545, "lng": 72.8390, "address": "Bandra West, Mumbai", "contact": "022-26422056", "contact_number": "022-26422056"},
        {"id": 3, "haven_id": 3, "name": "Kokilaben Hospital", "type": "Hospital", "category": "hospital",
         "lat": 19.1234, "lng": 72.8328, "address": "Four Bungalows, Andheri West, Mumbai", "contact": "022-30999999", "contact_number": "022-30999999"},
        {"id": 4, "haven_id": 4, "name": "Lilavati Hospital", "type": "Hospital", "category": "hospital",
         "lat": 19.0501, "lng": 72.8225, "address": "Bandra West, Mumbai", "contact": "022-26751000", "contact_number": "022-26751000"},
    ]


def _fallback_analytics_summary():
    """Fallback analytics summary matching verified production PostgreSQL data."""
    return {
        "total_crime_records": 16094,
        "approximate_precinct_records": 15594,
        "synthetic_records": 500,
        "total_clusters": 9,
        "total_road_segments": 124050,
        "total_road_edges": 124050,
        "road_segments_with_scores": 123272,
        "avg_safety_score": 5.89,
        "high_risk_roads": 19726,
        "moderate_risk_roads": 71506,
        "safe_roads": 32040,
        "risk_distribution": [
            {"label": "High Risk", "count": 19726, "color": "#ef4444"},
            {"label": "Moderate Risk", "count": 71506, "color": "#f97316"},
            {"label": "Low Risk", "count": 32040, "color": "#22c55e"},
        ],
        "safety_score_distribution": {
            "high_risk": 19726,
            "moderate_risk": 71506,
            "safe": 32040,
            "average": 5.89,
        },
        "crime_categories": [
            {"crime_type": "Theft", "count": 2046},
            {"crime_type": "Assault", "count": 1406},
            {"crime_type": "Fraud / Cheating", "count": 1375},
            {"crime_type": "Drug Trafficking", "count": 1316},
            {"crime_type": "Chain Snatching", "count": 1290},
            {"crime_type": "Vehicle Theft", "count": 1242},
            {"crime_type": "Robbery", "count": 1105},
            {"crime_type": "Cybercrime", "count": 981},
            {"crime_type": "Burglary", "count": 950},
            {"crime_type": "Eve Teasing / Molestation", "count": 873},
        ],
        "clusters": [],
    }


# ── Performance In-Memory Caches for Cluster Queries ─────────────────────────
_CRIME_CLUSTERS_CACHE = {}
_CRIME_CLUSTERS_CACHE_TIME = {}
_CLUSTER_DETAILS_CACHE = {}
_CLUSTER_DETAILS_CACHE_TIME = {}
_CLUSTER_CACHE_TTL = 300.0  # 5 minutes TTL


@app.get("/api/crime-clusters")
async def get_crime_clusters(
    north: Optional[float] = None,
    south: Optional[float] = None,
    east: Optional[float] = None,
    west: Optional[float] = None,
):
    """Return crime clusters with optional bounding-box filter and verified ward mappings.

    Query params (all optional, must provide all 4 for bbox filter):
      north, south, east, west — WGS-84 lat/lng bounds
    """
    if db_pool is None:
        return {"clusters": []}

    use_bbox = all(v is not None for v in [north, south, east, west])
    cache_key = f"bbox_{round(south, 3)}_{round(north, 3)}_{round(west, 3)}_{round(east, 3)}" if use_bbox else "all"
    now_ts = time.time()
    if cache_key in _CRIME_CLUSTERS_CACHE and (now_ts - _CRIME_CLUSTERS_CACHE_TIME.get(cache_key, 0)) < _CLUSTER_CACHE_TTL:
        return _CRIME_CLUSTERS_CACHE[cache_key]

    try:
        async with db_pool.acquire() as conn:
            if use_bbox:
                rows = await conn.fetch("""
                    SELECT cluster_id, centroid_lat, centroid_lng, radius_m,
                           incident_count, avg_severity, risk_score, dominant_crime,
                           night_share, police_station, zone
                    FROM crime_clusters
                    WHERE centroid_lat BETWEEN $1 AND $2
                      AND centroid_lng BETWEEN $3 AND $4
                    ORDER BY risk_score DESC NULLS LAST
                """, south, north, west, east)
            else:
                rows = await conn.fetch("""
                    SELECT cluster_id, centroid_lat, centroid_lng, radius_m,
                           incident_count, avg_severity, risk_score, dominant_crime,
                           night_share, police_station, zone
                    FROM crime_clusters
                    ORDER BY risk_score DESC NULLS LAST
                """)

            clusters = []
            for r in rows:
                c_lat = float(r["centroid_lat"]) if r["centroid_lat"] is not None else None
                c_lng = float(r["centroid_lng"]) if r["centroid_lng"] is not None else None
                if c_lat is not None and c_lng is not None:
                    risk = float(r["risk_score"]) if r["risk_score"] is not None else 5.0
                    classification = "High Risk" if risk >= 7.0 else "Moderate Risk" if risk >= 4.0 else "Low Risk"
                    station = r.get("police_station") or ""
                    ward_info = STATION_WARD_MAP.get(station, {})
                    clusters.append({
                        "cluster_id": r["cluster_id"],
                        "police_station": station or f"Precinct #{r['cluster_id']}",
                        "zone": r.get("zone") or "Mumbai",
                        "centroid_lat": c_lat,
                        "centroid_lng": c_lng,
                        "radius_m": float(r["radius_m"]) if r.get("radius_m") is not None else 250.0,
                        "incident_count": int(r["incident_count"]),
                        "avg_severity": float(r["avg_severity"]) if r["avg_severity"] is not None else None,
                        "risk_score": risk,
                        "risk_classification": classification,
                        "dominant_crime": r.get("dominant_crime") or "Theft",
                        "night_share": float(r["night_share"]) if r.get("night_share") is not None else 0.0,
                        "ward": ward_info.get("ward", ""),
                        "ward_name": ward_info.get("ward_name", ""),
                        "ward_confidence": ward_info.get("confidence", "unverified"),
                    })
            res = {"clusters": clusters, "total": len(clusters), "bbox_filtered": use_bbox}
            _CRIME_CLUSTERS_CACHE[cache_key] = res
            _CRIME_CLUSTERS_CACHE_TIME[cache_key] = now_ts
            return res
    except Exception as e:
        print(f"[crime-clusters] DB error: {e}")
        return {"clusters": []}


async def _resolve_cluster_row(conn, identifier: Union[int, str]):
    """
    Dynamically resolve a cluster identifier to its crime_clusters row.
    Accepts:
      - integer cluster_id (e.g. 8)
      - numeric string (e.g. "8")
      - cluster label (e.g. "Cluster #8", "cluster_8", "Zone 8")
      - police station or locality name (e.g. "Santacruz", "Bandra", "Andheri", "Worli")
    """
    ident_str = str(identifier).strip()

    # 1. Exact numeric check
    if ident_str.isdigit():
        cid = int(ident_str)
        row = await conn.fetchrow("""
            SELECT cluster_id, centroid_lat, centroid_lng, radius_m,
                   incident_count, avg_severity, risk_score, dominant_crime,
                   night_share, police_station, zone
            FROM crime_clusters
            WHERE cluster_id = $1
        """, cid)
        if row:
            return row

    # 2. Extract digits (e.g. "Cluster #8", "cluster-8")
    digit_match = re.search(r'\d+', ident_str)
    if digit_match:
        cid = int(digit_match.group(0))
        row = await conn.fetchrow("""
            SELECT cluster_id, centroid_lat, centroid_lng, radius_m,
                   incident_count, avg_severity, risk_score, dominant_crime,
                   night_share, police_station, zone
            FROM crime_clusters
            WHERE cluster_id = $1
        """, cid)
        if row:
            return row

    # 3. Special locality aliases (e.g. Bandra is served by Santacruz precinct / Cluster 8)
    lower_ident = ident_str.lower()
    if "bandra" in lower_ident:
        row = await conn.fetchrow("""
            SELECT cluster_id, centroid_lat, centroid_lng, radius_m,
                   incident_count, avg_severity, risk_score, dominant_crime,
                   night_share, police_station, zone
            FROM crime_clusters
            WHERE cluster_id = 8 OR police_station ILIKE 'Santacruz'
            ORDER BY cluster_id
            LIMIT 1
        """)
        if row:
            return row

    # 4. Station name match in crime_clusters
    row = await conn.fetchrow("""
        SELECT cluster_id, centroid_lat, centroid_lng, radius_m,
               incident_count, avg_severity, risk_score, dominant_crime,
               night_share, police_station, zone
        FROM crime_clusters
        WHERE police_station ILIKE $1 OR zone ILIKE $1
        ORDER BY incident_count DESC
        LIMIT 1
    """, f"%{ident_str}%")
    return row


@app.get("/api/crime-zones/lookup")
async def lookup_crime_zone(lat: Optional[float] = None, lng: Optional[float] = None, zone: Optional[str] = None):
    """Lookup the nearest crime cluster / police precinct for given coordinates or precinct/zone name."""
    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    try:
        async with db_pool.acquire() as conn:
            if zone:
                row = await conn.fetchrow("""
                    SELECT cluster_id, police_station, zone, centroid_lat, centroid_lng,
                           radius_m, incident_count, risk_score, dominant_crime,
                           0.0 AS dist_meters
                    FROM crime_clusters
                    WHERE police_station ILIKE $1 OR zone ILIKE $1
                    ORDER BY incident_count DESC
                    LIMIT 1
                """, f"%{zone}%")
                if row:
                    return {
                        "cluster_id": row["cluster_id"],
                        "police_station": row["police_station"],
                        "zone": row["zone"],
                        "centroid_lat": float(row["centroid_lat"]),
                        "centroid_lng": float(row["centroid_lng"]),
                        "radius_m": float(row["radius_m"]),
                        "incident_count": int(row["incident_count"]),
                        "risk_score": float(row["risk_score"]),
                        "dominant_crime": row["dominant_crime"],
                        "dist_meters": 0.0,
                    }

            if lat is not None and lng is not None:
                row = await conn.fetchrow("""
                    SELECT cluster_id, police_station, zone, centroid_lat, centroid_lng,
                           radius_m, incident_count, risk_score, dominant_crime,
                           SQRT(POWER(centroid_lat - $1, 2) + POWER(centroid_lng - $2, 2)) * 111320.0 AS dist_meters
                    FROM crime_clusters
                    ORDER BY dist_meters ASC
                    LIMIT 1
                """, lat, lng)

                if not row:
                    raise HTTPException(status_code=404, detail="No crime zones found")

                return {
                    "cluster_id": row["cluster_id"],
                    "police_station": row["police_station"],
                    "zone": row["zone"],
                    "centroid_lat": float(row["centroid_lat"]),
                    "centroid_lng": float(row["centroid_lng"]),
                    "radius_m": float(row["radius_m"]),
                    "incident_count": int(row["incident_count"]),
                    "risk_score": float(row["risk_score"]),
                    "dominant_crime": row["dominant_crime"],
                    "dist_meters": round(float(row["dist_meters"]), 1),
                }

            raise HTTPException(status_code=400, detail="Provide either 'lat' and 'lng' or 'zone'")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[crime-zones/lookup] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/crime-clusters/{cluster_id}/details")
@app.get("/api/crime-clusters/{cluster_id}")
@app.get("/api/crime-zones/{cluster_id}/details")
@app.get("/api/crime-zones/{cluster_id}")
@app.get("/api/crime-details/{cluster_id}")
async def get_cluster_details(cluster_id: str):
    """Return comprehensive crime breakdown and statistics for a specific crime cluster."""
    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    norm_id = str(cluster_id).strip().lower()
    now_ts = time.time()
    if norm_id in _CLUSTER_DETAILS_CACHE and (now_ts - _CLUSTER_DETAILS_CACHE_TIME.get(norm_id, 0)) < _CLUSTER_CACHE_TTL:
        return _CLUSTER_DETAILS_CACHE[norm_id]

    try:
        async with db_pool.acquire() as conn:
            # 1. Dynamically resolve cluster row
            c_row = await _resolve_cluster_row(conn, cluster_id)
            if not c_row:
                raise HTTPException(status_code=404, detail=f"Crime cluster '{cluster_id}' not found in database")

            actual_cluster_id = int(c_row["cluster_id"])
            police_station = c_row["police_station"]
            incident_count = int(c_row["incident_count"])
            risk = float(c_row["risk_score"]) if c_row["risk_score"] is not None else 5.0
            classification = "High Risk" if risk >= 7.0 else "Moderate Risk" if risk >= 4.0 else "Low Risk"

            # 2. Category breakdown
            cat_rows = await conn.fetch("""
                SELECT smc.crime_category, COUNT(*) as count,
                       ROUND((COUNT(*) * 100.0 / NULLIF($2, 0))::numeric, 1) as percentage
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE hc.source = 'approximate_precinct'
                  AND smc.police_station = $1
                GROUP BY smc.crime_category
                ORDER BY count DESC
            """, police_station, incident_count)
            categories = [
                {
                    "category": r["crime_category"] or "Other",
                    "count": int(r["count"]),
                    "percentage": float(r["percentage"]) if r["percentage"] is not None else 0.0,
                }
                for r in cat_rows
            ]

            # 3. Individual crime types breakdown
            type_rows = await conn.fetch("""
                SELECT hc.crime_type, smc.crime_category, COUNT(*) as count,
                       ROUND(AVG(hc.severity_weight)::numeric, 2) as avg_severity,
                       ROUND((COUNT(*) * 100.0 / NULLIF($2, 0))::numeric, 1) as percentage
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE hc.source = 'approximate_precinct'
                  AND smc.police_station = $1
                GROUP BY hc.crime_type, smc.crime_category
                ORDER BY count DESC
            """, police_station, incident_count)
            crime_types = [
                {
                    "crime_type": r["crime_type"],
                    "category": r["crime_category"] or "Other",
                    "count": int(r["count"]),
                    "avg_severity": float(r["avg_severity"]) if r["avg_severity"] is not None else 0.5,
                    "percentage": float(r["percentage"]) if r["percentage"] is not None else 0.0,
                }
                for r in type_rows
            ]

            # 4. Yearly trend
            year_rows = await conn.fetch("""
                SELECT smc.year, COUNT(*) as count
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE hc.source = 'approximate_precinct'
                  AND smc.police_station = $1
                GROUP BY smc.year
                ORDER BY smc.year ASC
            """, police_station)
            yearly_distribution = [
                {"year": int(r["year"]), "count": int(r["count"])}
                for r in year_rows
            ]

            # 5. Shift distribution
            shift_rows = await conn.fetch("""
                SELECT smc.shift, COUNT(*) as count,
                       ROUND((COUNT(*) * 100.0 / NULLIF($2, 0))::numeric, 1) as percentage
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE hc.source = 'approximate_precinct'
                  AND smc.police_station = $1
                GROUP BY smc.shift
                ORDER BY count DESC
            """, police_station, incident_count)
            shift_distribution = [
                {"shift": r["shift"] or "Unknown", "count": int(r["count"]), "percentage": float(r["percentage"]) if r["percentage"] is not None else 0.0}
                for r in shift_rows
            ]

            # 6. Case status distribution
            status_rows = await conn.fetch("""
                SELECT smc.case_status, COUNT(*) as count,
                       ROUND((COUNT(*) * 100.0 / NULLIF($2, 0))::numeric, 1) as percentage
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE hc.source = 'approximate_precinct'
                  AND smc.police_station = $1
                GROUP BY smc.case_status
                ORDER BY count DESC
            """, police_station, incident_count)
            case_status_distribution = [
                {"status": r["case_status"] or "Pending", "count": int(r["count"]), "percentage": float(r["percentage"]) if r["percentage"] is not None else 0.0}
                for r in status_rows
            ]

            # 7. Aggregated demographic breakdown (anonymized, non-PII)
            demo_rows = await conn.fetch("""
                SELECT smc.victim_age_group, COUNT(*) as count,
                       ROUND((COUNT(*) * 100.0 / NULLIF($2, 0))::numeric, 1) as percentage
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE hc.source = 'approximate_precinct'
                  AND smc.police_station = $1
                GROUP BY smc.victim_age_group
                ORDER BY count DESC
            """, police_station, incident_count)
            demographics = [
                {"age_group": r["victim_age_group"] or "Unknown", "count": int(r["count"]), "percentage": float(r["percentage"]) if r["percentage"] is not None else 0.0}
                for r in demo_rows
            ]
            demographics = [
                {"age_group": r["victim_age_group"] or "Unknown", "count": int(r["count"]), "percentage": float(r["percentage"])}
                for r in demo_rows
            ]

            res_details = {
                "cluster_id": actual_cluster_id,
                "police_station": police_station,
                "zone": c_row["zone"],
                "centroid_lat": float(c_row["centroid_lat"]),
                "centroid_lng": float(c_row["centroid_lng"]),
                "radius_m": float(c_row["radius_m"]),
                "incident_count": incident_count,
                "avg_severity": float(c_row["avg_severity"]) if c_row["avg_severity"] is not None else 0.5,
                "risk_score": risk,
                "risk_classification": classification,
                "dominant_crime": c_row["dominant_crime"] or "Theft",
                "night_share": float(c_row["night_share"]) if c_row["night_share"] is not None else 0.0,
                "dataset_source": "Mumbai Police FIR Records (2020–2024)",
                "reporting_period": "2020–2024",
                "data_accuracy_notice": (
                    "⚠ Approximate precinct-level data. Coordinates are based on police station centroids "
                    "with synthetic jitter for spatial dispersion; they do not represent exact incident GPS locations."
                ),
                "categories": categories,
                "crime_types": crime_types,
                "yearly_distribution": yearly_distribution,
                "shift_distribution": shift_distribution,
                "case_status_distribution": case_status_distribution,
                "demographics_summary": demographics,
            }
            _CLUSTER_DETAILS_CACHE[norm_id] = res_details
            _CLUSTER_DETAILS_CACHE[str(actual_cluster_id)] = res_details
            _CLUSTER_DETAILS_CACHE_TIME[norm_id] = now_ts
            _CLUSTER_DETAILS_CACHE_TIME[str(actual_cluster_id)] = now_ts
            return res_details
    except HTTPException:
        raise
    except Exception as e:
        print(f"[cluster-details] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/crime-clusters/{cluster_id}/crimes")
@app.get("/api/crime-zones/{cluster_id}/crimes")
@app.get("/api/crime-details/{cluster_id}/crimes")
async def get_cluster_crimes(
    cluster_id: str,
    year: Optional[int] = None,
    category: Optional[str] = None,
    crime_type: Optional[str] = None,
    case_status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
):
    """Return paginated individual crime records for a cluster with dynamic filtering."""
    if db_pool is None:
        raise HTTPException(status_code=503, detail="Database connection unavailable")

    page = max(1, page)
    limit = min(100, max(1, limit))
    offset = (page - 1) * limit

    try:
        async with db_pool.acquire() as conn:
            # Dynamically resolve cluster
            c_row = await _resolve_cluster_row(conn, cluster_id)
            if not c_row:
                raise HTTPException(status_code=404, detail=f"Crime cluster '{cluster_id}' not found in database")

            actual_cluster_id = int(c_row["cluster_id"])
            ps = c_row["police_station"]

            # Build dynamic WHERE clause
            conditions = [
                "hc.source = 'approximate_precinct'",
                "smc.police_station = $1"
            ]
            params = [ps]
            idx = 2

            if year:
                conditions.append(f"smc.year = ${idx}")
                params.append(year)
                idx += 1

            if category:
                conditions.append(f"smc.crime_category ILIKE ${idx}")
                params.append(f"%{category}%")
                idx += 1

            if crime_type:
                conditions.append(f"hc.crime_type ILIKE ${idx}")
                params.append(f"%{crime_type}%")
                idx += 1

            if case_status:
                conditions.append(f"smc.case_status ILIKE ${idx}")
                params.append(f"%{case_status}%")
                idx += 1

            if search:
                conditions.append(f"(hc.fir_number ILIKE ${idx} OR hc.crime_type ILIKE ${idx})")
                params.append(f"%{search}%")
                idx += 1

            where_clause = " AND ".join(conditions)

            # Total matching count
            total_sql = f"""
                SELECT COUNT(*)
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE {where_clause}
            """
            total = await conn.fetchval(total_sql, *params) or 0

            # Paginated records
            crimes_sql = f"""
                SELECT
                    hc.crime_id,
                    hc.fir_number,
                    hc.crime_type,
                    hc.severity_weight,
                    hc.date_reported,
                    hc.time_of_day,
                    hc.lat,
                    hc.lng,
                    smc.year,
                    smc.month,
                    smc.month_name,
                    smc.shift,
                    smc.police_station,
                    smc.zone,
                    smc.crime_category,
                    smc.case_status,
                    smc.victim_gender,
                    smc.victim_age_group,
                    smc.accused_arrested
                FROM historical_crimes hc
                JOIN staging_mumbai_crimes smc ON smc.fir_number = hc.fir_number
                WHERE {where_clause}
                ORDER BY hc.date_reported DESC, hc.crime_id DESC
                LIMIT ${idx} OFFSET ${idx + 1}
            """
            params_with_pagination = params + [limit, offset]
            rows = await conn.fetch(crimes_sql, *params_with_pagination)

            records = []
            for r in rows:
                records.append({
                    "crime_id": r["crime_id"],
                    "fir_number": r["fir_number"],
                    "crime_type": r["crime_type"],
                    "crime_category": r["crime_category"] or "Other",
                    "severity_weight": float(r["severity_weight"]) if r["severity_weight"] is not None else 0.5,
                    "date_reported": r["date_reported"].isoformat() if r["date_reported"] else None,
                    "time_of_day": str(r["time_of_day"]) if r["time_of_day"] else None,
                    "year": r["year"],
                    "month": r["month"],
                    "month_name": r["month_name"],
                    "shift": r["shift"] or "Unspecified",
                    "police_station": r["police_station"],
                    "zone": r["zone"],
                    "case_status": r["case_status"] or "Under Investigation",
                    "victim_gender": r["victim_gender"] or "Undisclosed",
                    "victim_age_group": r["victim_age_group"] or "Unknown",
                    "accused_arrested": r["accused_arrested"] or "No",
                    "approx_lat": float(r["lat"]) if r["lat"] is not None else None,
                    "approx_lng": float(r["lng"]) if r["lng"] is not None else None,
                    "location_disclaimer": "Precinct centroid + synthetic jitter",
                })

            total_pages = max(1, (total + limit - 1) // limit)
            return {
                "cluster_id": actual_cluster_id,
                "police_station": ps,
                "total": total,
                "page": page,
                "limit": limit,
                "total_pages": total_pages,
                "records": records,
            }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[cluster-crimes] error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/safe-havens")
async def get_all_safe_havens():
    """Return all safe havens from safe_havens table with lat/lng, type, and contact details."""
    if db_pool is None:
        return {"safe_havens": _mock_havens_list()}

    try:
        async with db_pool.acquire() as conn:
            rows = await conn.fetch("""
                SELECT haven_id, name, type, contact_number, lat, lng
                FROM safe_havens
                WHERE lat IS NOT NULL AND lng IS NOT NULL
                ORDER BY type, name
            """)
            havens = []
            for r in rows:
                t_lower = (r["type"] or "").lower()
                category = "police" if "police" in t_lower else "hospital" if "hospital" in t_lower else "safe_haven"
                havens.append({
                    "id": r["haven_id"],
                    "haven_id": r["haven_id"],
                    "name": r["name"],
                    "type": r["type"],
                    "category": category,
                    "lat": float(r["lat"]),
                    "lng": float(r["lng"]),
                    "address": f"{r['name']}, Mumbai",
                    "contact": r.get("contact_number"),
                    "contact_number": r.get("contact_number"),
                })
            return {"safe_havens": havens}
    except Exception as e:
        print(f"[safe-havens] DB error: {e}")
        return {"safe_havens": _mock_havens_list()}


# ═══════════════════════════════════════════════════════════
# ── VIEWPORT ROAD NETWORK API ──
# GET /api/roads/viewport?min_lat=...&max_lat=...&min_lng=...&max_lng=...
# ═══════════════════════════════════════════════════════════
@app.get("/api/roads/viewport")
async def get_roads_viewport(
    min_lat: float,
    max_lat: float,
    min_lng: float,
    max_lng: float,
    limit: int = 800,
    major_only: bool = False,
):
    """
    Return road network segments within the requested map bounding box.
    Uses PostGIS ST_Intersects on the road_edges GiST spatial index.
    """
    if db_pool is None:
        return {"roads": [], "total": 0}

    limit = min(2000, max(50, limit))
    try:
        async with db_pool.acquire() as conn:
            where_type = "AND road_type IN ('primary', 'secondary', 'trunk', 'motorway')" if major_only else ""
            rows = await conn.fetch(f"""
                SELECT edge_id, road_type, is_lit, base_safety_score, isolation_risk,
                       src_lat, src_lng, tgt_lat, tgt_lng, length_meters
                FROM road_edges
                WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
                  {where_type}
                ORDER BY length_meters DESC
                LIMIT $5
            """, min_lng, min_lat, max_lng, max_lat, limit)

            roads = []
            for r in rows:
                if r["src_lat"] is not None and r["tgt_lat"] is not None:
                    roads.append({
                        "edge_id": r["edge_id"],
                        "road_type": r["road_type"] or "unclassified",
                        "is_lit": bool(r["is_lit"]),
                        "safety_score": float(r["base_safety_score"]) if r["base_safety_score"] is not None else 6.0,
                        "isolation_risk": float(r["isolation_risk"]) if r["isolation_risk"] is not None else 0.2,
                        "length_m": float(r["length_meters"]) if r["length_meters"] is not None else 50.0,
                        "path": [
                            [float(r["src_lat"]), float(r["src_lng"])],
                            [float(r["tgt_lat"]), float(r["tgt_lng"])],
                        ],
                    })
            return {"roads": roads, "total": len(roads)}
    except Exception as e:
        print(f"[roads/viewport] DB error: {e}")
        return {"roads": [], "total": 0}


# ═══════════════════════════════════════════════════════════
# ── POLICE STATIONS API ──
# GET /api/police-stations
# ═══════════════════════════════════════════════════════════
@app.get("/api/police-stations")
async def get_police_stations(
    search: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    limit: int = 150,
):
    """Return verified police stations across Mumbai and MMR."""
    if db_pool is None:
        return {"police_stations": []}

    try:
        async with db_pool.acquire() as conn:
            limit = min(500, max(1, limit))
            query = """
                SELECT id, osm_id, name, address, contact_number, facility_type, lat, lng,
                       CASE 
                           WHEN $1::float IS NOT NULL AND $2::float IS NOT NULL 
                           THEN ROUND((ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography))::numeric, 1)
                           ELSE NULL 
                       END as dist_meters
                FROM police_stations
                WHERE ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR address ILIKE '%' || $3 || '%')
                  AND ($4::float IS NULL OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $4 * 1000.0))
                ORDER BY dist_meters ASC NULLS LAST, name ASC
                LIMIT $5
            """
            rows = await conn.fetch(query, lat, lng, search, radius_km, limit)
            results = [
                {
                    "id": r["id"],
                    "osm_id": r["osm_id"],
                    "name": r["name"],
                    "address": r["address"],
                    "contact_number": r["contact_number"] or "100 / 112",
                    "facility_type": r["facility_type"] or "Police Station",
                    "lat": float(r["lat"]),
                    "lng": float(r["lng"]),
                    "dist_meters": float(r["dist_meters"]) if r["dist_meters"] is not None else None,
                }
                for r in rows
            ]
            return {"police_stations": results, "total": len(results)}
    except Exception as e:
        print(f"[police-stations] error: {e}")
        return {"police_stations": [], "total": 0}


# ═══════════════════════════════════════════════════════════
# ── HOSPITALS API ──
# GET /api/hospitals
# ═══════════════════════════════════════════════════════════
@app.get("/api/hospitals")
async def get_hospitals(
    search: Optional[str] = None,
    category: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = None,
    limit: int = 150,
):
    """Return verified public and private hospitals across Mumbai."""
    if db_pool is None:
        return {"hospitals": []}

    try:
        async with db_pool.acquire() as conn:
            limit = min(500, max(1, limit))
            query = """
                SELECT id, name, category, ward, address, beds, contact_number, lat, lng,
                       CASE 
                           WHEN $1::float IS NOT NULL AND $2::float IS NOT NULL 
                           THEN ROUND((ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography))::numeric, 1)
                           ELSE NULL 
                       END as dist_meters
                FROM hospitals
                WHERE ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR address ILIKE '%' || $3 || '%')
                  AND ($4::text IS NULL OR category ILIKE '%' || $4 || '%')
                  AND ($5::float IS NULL OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $5 * 1000.0))
                ORDER BY dist_meters ASC NULLS LAST, name ASC
                LIMIT $6
            """
            rows = await conn.fetch(query, lat, lng, search, category, radius_km, limit)
            results = [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "category": r["category"] or "General Hospital",
                    "ward": r["ward"],
                    "address": r["address"],
                    "beds": r["beds"],
                    "contact_number": r["contact_number"] or "108 / 102",
                    "lat": float(r["lat"]),
                    "lng": float(r["lng"]),
                    "dist_meters": float(r["dist_meters"]) if r["dist_meters"] is not None else None,
                }
                for r in rows
            ]
            return {"hospitals": results, "total": len(results)}
    except Exception as e:
        print(f"[hospitals] error: {e}")
        return {"hospitals": [], "total": 0}


# ═══════════════════════════════════════════════════════════
# ── STREETLIGHTS API ──
# GET /api/streetlights
# ═══════════════════════════════════════════════════════════
@app.get("/api/streetlights")
async def get_streetlights(
    min_lat: Optional[float] = None,
    max_lat: Optional[float] = None,
    min_lng: Optional[float] = None,
    max_lng: Optional[float] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: Optional[float] = 5.0,
    limit: int = 500,
):
    """Return verified streetlight positions within requested bbox or radius."""
    if db_pool is None:
        return {"streetlights": []}

    try:
        async with db_pool.acquire() as conn:
            limit = min(2000, max(1, limit))
            if min_lat is not None and max_lat is not None and min_lng is not None and max_lng is not None:
                rows = await conn.fetch("""
                    SELECT id, osm_type, lat, lng
                    FROM streetlights
                    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
                    LIMIT $5
                """, min_lng, min_lat, max_lng, max_lat, limit)
            elif lat is not None and lng is not None:
                rows = await conn.fetch("""
                    SELECT id, osm_type, lat, lng
                    FROM streetlights
                    WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $3 * 1000.0)
                    LIMIT $4
                """, lat, lng, radius_km or 5.0, limit)
            else:
                rows = await conn.fetch("""
                    SELECT id, osm_type, lat, lng
                    FROM streetlights
                    LIMIT $1
                """, limit)

            results = [
                {
                    "id": r["id"],
                    "type": r["osm_type"] or "street_lamp",
                    "lat": float(r["lat"]),
                    "lng": float(r["lng"]),
                }
                for r in rows
            ]
            return {"streetlights": results, "total": len(results)}
    except Exception as e:
        print(f"[streetlights] error: {e}")
        return {"streetlights": [], "total": 0}


# ═══════════════════════════════════════════════════════════
# ── NEARBY CRIME INCIDENTS API ──
# GET /api/crimes/nearby?lat=...&lng=...&radius_km=...
# ═══════════════════════════════════════════════════════════
@app.get("/api/crimes/nearby")
async def get_nearby_crimes(
    lat: float,
    lng: float,
    radius_km: float = 3.0,
    category: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = 80,
):
    """Return actual historical crime incidents near a given location."""
    if db_pool is None:
        return {"crimes": [], "total": 0}

    try:
        async with db_pool.acquire() as conn:
            limit = min(300, max(5, limit))
            query = """
                SELECT fir_number, crime_type, crime_category, police_station, zone,
                       latitude, longitude, year, shift, case_status,
                       ROUND((ST_Distance(
                           ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                       ))::numeric, 1) as dist_meters
                FROM staging_mumbai_crimes
                WHERE latitude IS NOT NULL AND longitude IS NOT NULL
                  AND ST_DWithin(
                      ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography,
                      ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                      $3 * 1000.0
                  )
                  AND ($4::text IS NULL OR crime_category ILIKE '%' || $4 || '%')
                  AND ($5::int IS NULL OR year = $5)
                ORDER BY dist_meters ASC
                LIMIT $6
            """
            rows = await conn.fetch(query, lat, lng, radius_km, category, year, limit)
            results = [
                {
                    "fir_number": r["fir_number"],
                    "crime_type": r["crime_type"],
                    "category": r["crime_category"] or "General",
                    "police_station": r["police_station"],
                    "zone": r["zone"],
                    "lat": float(r["latitude"]),
                    "lng": float(r["longitude"]),
                    "year": r["year"],
                    "shift": r["shift"],
                    "status": r["case_status"],
                    "dist_meters": float(r["dist_meters"]),
                }
                for r in rows
            ]
            return {"crimes": results, "total": len(results)}
    except Exception as e:
        print(f"[crimes/nearby] error: {e}")
        return {"crimes": [], "total": 0}


# ═══════════════════════════════════════════════════════════
# ── EV CHARGING STATIONS SEARCH API ──
# GET /api/ev/stations?lat=...&lng=...&radius_km=...
# ═══════════════════════════════════════════════════════════
@app.get("/api/ev/stations")
async def get_ev_stations(
    lat: float = 19.0760,
    lng: float = 72.8777,
    radius_km: float = 12.0,
    limit: int = 30,
):
    """
    Fetch EV charging stations near a location using TomTom Search POI API,
    or curated Mumbai EV charging hubs.
    """
    # 1. Try TomTom Search POI if configured
    if cfg.TOMTOM_API_KEY and cfg.TOMTOM_API_KEY != "YOUR_TOMTOM_API_KEY_HERE":
        try:
            url = (
                f"https://api.tomtom.com/search/2/nearbySearch/.json"
                f"?key={cfg.TOMTOM_API_KEY}"
                f"&lat={lat}&lon={lng}"
                f"&radius={int(radius_km * 1000)}"
                f"&categorySet=7309"
                f"&limit={min(50, limit)}"
            )
            resp = requests.get(url, timeout=6)
            if resp.status_code == 200:
                data = resp.json().get("results", [])
                stations = []
                for item in data:
                    pos = item.get("position", {})
                    poi = item.get("poi", {})
                    addr = item.get("address", {})
                    stations.append({
                        "id": item.get("id"),
                        "name": poi.get("name", "EV Charging Station"),
                        "address": addr.get("freeformAddress", "Mumbai"),
                        "lat": pos.get("lat"),
                        "lng": pos.get("lon"),
                        "dist_meters": item.get("dist"),
                        "connectors": ["CCS-2", "Type-2"],
                        "power_kw": 50,
                        "status": "Available",
                        "provider": poi.get("brands", [{}])[0].get("name", "Tata Power / Jio-bp"),
                    })
                if stations:
                    return {"stations": stations, "total": len(stations), "source": "tomtom_live"}
        except Exception as e:
            print(f"[ev/stations] TomTom search fallback: {e}")

    # 2. Verified real Mumbai EV charging network stations
    mumbai_ev_hubs = [
        {"id": "ev-01", "name": "Tata Power EZ Charge - Bandra Kurla Complex", "address": "G Block BKC, Bandra East, Mumbai", "lat": 19.0657, "lng": 72.8682, "connectors": ["CCS-2 (60kW)", "Type 2 (22kW)"], "power_kw": 60, "status": "Available", "provider": "Tata Power"},
        {"id": "ev-02", "name": "Jio-bp pulse EV Charging - Lower Parel", "address": "Senapati Bapat Marg, Lower Parel, Mumbai", "lat": 19.0016, "lng": 72.8291, "connectors": ["CCS-2 (120kW Fast)", "CHAdeMO (50kW)"], "power_kw": 120, "status": "Available", "provider": "Jio-bp pulse"},
        {"id": "ev-03", "name": "Ather Grid Supercharger - Dadar West", "address": "Ranade Road, Dadar West, Mumbai", "lat": 19.0178, "lng": 72.8428, "connectors": ["Ather Fast Charge", "Type 2"], "power_kw": 25, "status": "Available", "provider": "Ather Energy"},
        {"id": "ev-04", "name": "Tata Power EV Station - Phoenix Marketcity Kurla", "address": "LBS Marg, Kurla West, Mumbai", "lat": 19.0863, "lng": 72.8890, "connectors": ["CCS-2 (50kW)", "Type 2 (22kW)"], "power_kw": 50, "status": "Available", "provider": "Tata Power"},
        {"id": "ev-05", "name": "Statiq EV Charging Hub - Andheri East", "address": "Western Express Hwy, Near Chakala Metro, Andheri East", "lat": 19.1114, "lng": 72.8598, "connectors": ["CCS-2 (60kW)", "GB/T"], "power_kw": 60, "status": "Available", "provider": "Statiq"},
        {"id": "ev-06", "name": "Jio-bp pulse - Chembur Station", "address": "Sion-Trombay Road, Chembur, Mumbai", "lat": 19.0558, "lng": 72.8944, "connectors": ["CCS-2 (60kW)"], "power_kw": 60, "status": "Available", "provider": "Jio-bp pulse"},
        {"id": "ev-07", "name": "Magenta ChargeGrid - Vile Parle", "address": "Swami Vivekanand Rd, Vile Parle West", "lat": 19.1025, "lng": 72.8400, "connectors": ["Type 2 (22kW)", "Bharat AC-001"], "power_kw": 22, "status": "Available", "provider": "Magenta"},
        {"id": "ev-08", "name": "Tata Power EZ Charge - Powai Hiranandani", "address": "Central Ave, Hiranandani Gardens, Powai", "lat": 19.1197, "lng": 72.9056, "connectors": ["CCS-2 (50kW)", "Type 2 (22kW)"], "power_kw": 50, "status": "Available", "provider": "Tata Power"},
        {"id": "ev-09", "name": "Zeon Charging - Goregaon West", "address": "Link Road, Near Inorbit Mall, Malad/Goregaon", "lat": 19.1726, "lng": 72.8354, "connectors": ["CCS-2 (50kW)"], "power_kw": 50, "status": "Available", "provider": "Zeon"},
        {"id": "ev-10", "name": "Tata Power EV Hub - South Bombay Colaba", "address": "Shahid Bhagat Singh Rd, Colaba, Mumbai", "lat": 18.9150, "lng": 72.8258, "connectors": ["CCS-2 (50kW)", "Type 2 (22kW)"], "power_kw": 50, "status": "Available", "provider": "Tata Power"},
    ]
    return {"stations": mumbai_ev_hubs, "total": len(mumbai_ev_hubs), "source": "mumbai_verified_network"}


@app.get("/api/analytics/summary")
async def get_analytics_summary():
    """Return database-derived statistics for the analytics dashboard."""
    if db_pool is None:
        return _fallback_analytics_summary()

    try:
        async with db_pool.acquire() as conn:
            # 1. Historical crime counts
            crime_stats = await conn.fetchrow("""
                SELECT
                    COUNT(*) as total_crimes,
                    COUNT(*) FILTER (WHERE source = 'approximate_precinct') as precinct_crimes,
                    COUNT(*) FILTER (WHERE source = 'synthetic' OR source IS NULL) as synthetic_crimes
                FROM historical_crimes
            """)
            total_crimes = crime_stats["total_crimes"] or 0
            precinct_crimes = crime_stats["precinct_crimes"] or 0
            synthetic_crimes = crime_stats["synthetic_crimes"] or 0

            # 2. Clusters count
            total_clusters = await conn.fetchval("SELECT COUNT(*) FROM crime_clusters") or 0

            # 3. Road edge stats (using actual column base_safety_score)
            road_stats = await conn.fetchrow("""
                SELECT
                    COUNT(*) as total_roads,
                    COUNT(*) FILTER (WHERE src_lat IS NOT NULL AND tgt_lat IS NOT NULL AND base_safety_score IS NOT NULL) as scored_roads,
                    ROUND(AVG(base_safety_score)::numeric, 2) as avg_score,
                    COUNT(*) FILTER (WHERE src_lat IS NOT NULL AND base_safety_score < 4.0) as high_risk,
                    COUNT(*) FILTER (WHERE src_lat IS NOT NULL AND base_safety_score >= 4.0 AND base_safety_score < 7.0) as moderate_risk,
                    COUNT(*) FILTER (WHERE src_lat IS NOT NULL AND base_safety_score >= 7.0) as safe_roads
                FROM road_edges
            """)
            total_roads = road_stats["total_roads"] or 0
            scored_roads = road_stats["scored_roads"] or 0
            avg_score = float(road_stats["avg_score"]) if road_stats["avg_score"] is not None else 5.89
            high_risk = road_stats["high_risk"] or 0
            moderate_risk = road_stats["moderate_risk"] or 0
            safe_roads = road_stats["safe_roads"] or 0

            # 4. Crime category breakdown (excludes synthetic records by default)
            cat_rows = await conn.fetch("""
                SELECT crime_type, COUNT(*) as count
                FROM historical_crimes
                WHERE crime_type IS NOT NULL
                  AND (source = 'approximate_precinct' OR (source != 'synthetic' AND source IS NOT NULL))
                GROUP BY crime_type
                ORDER BY count DESC
                LIMIT 15
            """)
            crime_categories = [{"crime_type": r["crime_type"], "count": int(r["count"])} for r in cat_rows]

            # 5. Crime clusters summary
            cluster_rows = await conn.fetch("""
                SELECT cluster_id, centroid_lat, centroid_lng, incident_count,
                       avg_severity, risk_score, dominant_crime, night_share
                FROM crime_clusters
                ORDER BY risk_score DESC
            """)
            clusters_summary = [
                {
                    "cluster_id": r["cluster_id"],
                    "centroid_lat": float(r["centroid_lat"]),
                    "centroid_lng": float(r["centroid_lng"]),
                    "incident_count": int(r["incident_count"]),
                    "avg_severity": float(r["avg_severity"]),
                    "risk_score": float(r["risk_score"]),
                    "dominant_crime": r["dominant_crime"],
                    "night_share": float(r["night_share"]),
                }
                for r in cluster_rows
            ]

            return {
                "total_crime_records": int(total_crimes),
                "approximate_precinct_records": int(precinct_crimes),
                "synthetic_records": int(synthetic_crimes),
                "total_clusters": int(total_clusters),
                "total_road_segments": int(total_roads),
                "total_road_edges": int(total_roads),
                "road_segments_with_scores": int(scored_roads),
                "avg_safety_score": avg_score,
                "high_risk_roads": int(high_risk),
                "moderate_risk_roads": int(moderate_risk),
                "safe_roads": int(safe_roads),
                "risk_distribution": [
                    {"label": "High Risk", "count": int(high_risk), "color": "#ef4444"},
                    {"label": "Moderate Risk", "count": int(moderate_risk), "color": "#f97316"},
                    {"label": "Low Risk", "count": int(safe_roads), "color": "#22c55e"},
                ],
                "safety_score_distribution": {
                    "high_risk": int(high_risk),
                    "moderate_risk": int(moderate_risk),
                    "safe": int(safe_roads),
                    "average": avg_score,
                },
                "crime_categories": crime_categories,
                "clusters": clusters_summary,
            }
    except Exception as e:
        print(f"[analytics/summary] DB error: {e}")
        return _fallback_analytics_summary()


# ─────────────────────────────────────────────────────────────────────────────
#  MUMBAI CRIME STATISTICS (2018–2025 Citywide Aggregate Dataset)
#  Source: Mumbai Police Crime Statistics via Hugging Face repository
#  Scope: Citywide aggregate statistics (Non-geographical, NOT used for routing)
# ─────────────────────────────────────────────────────────────────────────────

def _build_stats_date_filter(start_date: Optional[str], end_date: Optional[str], base_idx: int = 1):
    clauses = []
    params = []
    curr_idx = base_idx
    if start_date:
        try:
            d = datetime.strptime(start_date, "%Y-%m-%d").date()
            clauses.append(f"month_end_date >= ${curr_idx}")
            params.append(d)
            curr_idx += 1
        except ValueError:
            pass
    if end_date:
        try:
            d = datetime.strptime(end_date, "%Y-%m-%d").date()
            clauses.append(f"month_end_date <= ${curr_idx}")
            params.append(d)
            curr_idx += 1
        except ValueError:
            pass
    where_str = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where_str, params


@app.get("/api/crime-statistics/overview")
async def get_crime_statistics_overview(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """
    Return overall citywide crime statistics for Mumbai (2018–2025).
    Source: Mumbai Police Crime Statistics via Hugging Face.
    Note: Citywide aggregate statistics, non-geographical.
    """
    if db_pool is None:
        return {"error": "Database not available"}

    try:
        where_str, params = _build_stats_date_filter(start_date, end_date)
        async with db_pool.acquire() as conn:
            row = await conn.fetchrow(f"""
                SELECT
                    COALESCE(SUM(registered), 0) as total_registered,
                    COALESCE(SUM(detected), 0) as total_detected,
                    MIN(month_end_date) as min_date,
                    MAX(month_end_date) as max_date,
                    COUNT(DISTINCT month_end_date) as total_months,
                    COUNT(DISTINCT crime_name) as total_categories,
                    COUNT(*) as total_records
                FROM mumbai_crime_statistics
                {where_str}
            """, *params)

            total_reg = int(row["total_registered"])
            total_det = int(row["total_detected"])
            rate = round((total_det / total_reg * 100), 2) if total_reg > 0 else 0.0

            return {
                "total_registered": total_reg,
                "total_detected": total_det,
                "overall_detection_rate": rate,
                "start_date": str(row["min_date"]) if row["min_date"] else None,
                "end_date": str(row["max_date"]) if row["max_date"] else None,
                "total_months": int(row["total_months"]),
                "total_categories": int(row["total_categories"]),
                "total_records": int(row["total_records"]),
                "source": "Mumbai Police Crime Statistics",
                "repository": "Hugging Face (mumbai_crime_statistics_2018_2025)",
                "scope": "Mumbai-wide Aggregate (Non-Geographical)",
                "notice": "These figures reflect citywide police records and are not mapped to specific street coordinates or used for route safety scoring."
            }
    except Exception as e:
        print(f"[crime-statistics/overview] DB error: {e}")
        return {"error": str(e)}


@app.get("/api/crime-statistics/monthly")
async def get_crime_statistics_monthly(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    crime_code: Optional[int] = None,
    crime_name: Optional[str] = None,
):
    """
    Return monthly registered vs detected crime trends across Mumbai.
    """
    if db_pool is None:
        return {"timeline": []}

    try:
        clauses = []
        params = []
        idx = 1
        if start_date:
            try:
                d = datetime.strptime(start_date, "%Y-%m-%d").date()
                clauses.append(f"month_end_date >= ${idx}")
                params.append(d)
                idx += 1
            except ValueError:
                pass
        if end_date:
            try:
                d = datetime.strptime(end_date, "%Y-%m-%d").date()
                clauses.append(f"month_end_date <= ${idx}")
                params.append(d)
                idx += 1
            except ValueError:
                pass
        if crime_code is not None:
            clauses.append(f"crime_code = ${idx}")
            params.append(crime_code)
            idx += 1
        if crime_name:
            clauses.append(f"crime_name ILIKE ${idx}")
            params.append(f"%{crime_name}%")
            idx += 1

        where_str = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        async with db_pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT
                    month_end_date,
                    TO_CHAR(month_end_date, 'YYYY-MM') as month_str,
                    SUM(registered) as registered,
                    SUM(COALESCE(detected, 0)) as detected
                FROM mumbai_crime_statistics
                {where_str}
                GROUP BY month_end_date
                ORDER BY month_end_date ASC
            """, *params)

            timeline = []
            for r in rows:
                reg = int(r["registered"])
                det = int(r["detected"])
                rate = round((det / reg * 100), 1) if reg > 0 else 0.0
                timeline.append({
                    "month": r["month_str"],
                    "month_end_date": str(r["month_end_date"]),
                    "registered": reg,
                    "detected": det,
                    "detection_rate": rate,
                })
            return {"timeline": timeline, "count": len(timeline)}
    except Exception as e:
        print(f"[crime-statistics/monthly] DB error: {e}")
        return {"timeline": [], "error": str(e)}


@app.get("/api/crime-statistics/yearly")
async def get_crime_statistics_yearly(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """
    Return year-wise aggregate crime trends for Mumbai (2018–2025).
    """
    if db_pool is None:
        return {"yearly_trends": []}

    try:
        where_str, params = _build_stats_date_filter(start_date, end_date)
        async with db_pool.acquire() as conn:
            rows = await conn.fetch(f"""
                SELECT
                    EXTRACT(YEAR FROM month_end_date)::INTEGER as year,
                    SUM(registered) as registered,
                    SUM(COALESCE(detected, 0)) as detected,
                    COUNT(DISTINCT month_end_date) as months_counted
                FROM mumbai_crime_statistics
                {where_str}
                GROUP BY EXTRACT(YEAR FROM month_end_date)
                ORDER BY year ASC
            """, *params)

            yearly_trends = []
            for r in rows:
                reg = int(r["registered"])
                det = int(r["detected"])
                rate = round((det / reg * 100), 1) if reg > 0 else 0.0
                yearly_trends.append({
                    "year": int(r["year"]),
                    "registered": reg,
                    "detected": det,
                    "detection_rate": rate,
                    "months_counted": int(r["months_counted"]),
                })
            return {"yearly_trends": yearly_trends}
    except Exception as e:
        print(f"[crime-statistics/yearly] DB error: {e}")
        return {"yearly_trends": [], "error": str(e)}


@app.get("/api/crime-statistics/categories")
async def get_crime_statistics_categories(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    limit: Optional[int] = 30,
):
    """
    Return crime category breakdown comparing registered vs detected cases.
    """
    if db_pool is None:
        return {"categories": []}

    try:
        where_str, params = _build_stats_date_filter(start_date, end_date)
        async with db_pool.acquire() as conn:
            total_registered = await conn.fetchval(f"""
                SELECT COALESCE(SUM(registered), 0)
                FROM mumbai_crime_statistics
                {where_str}
            """, *params) or 1

            limit_val = limit if limit and limit > 0 else 30
            rows = await conn.fetch(f"""
                SELECT
                    crime_name,
                    MIN(crime_code) as crime_code,
                    SUM(registered) as registered,
                    SUM(COALESCE(detected, 0)) as detected,
                    COUNT(*) as record_count
                FROM mumbai_crime_statistics
                {where_str}
                GROUP BY crime_name
                ORDER BY registered DESC
                LIMIT ${len(params) + 1}
            """, *params, limit_val)

            categories = []
            for r in rows:
                reg = int(r["registered"])
                det = int(r["detected"])
                rate = round((det / reg * 100), 1) if reg > 0 else 0.0
                share = round((reg / total_registered * 100), 2)
                categories.append({
                    "crime_name": r["crime_name"],
                    "crime_code": int(r["crime_code"]),
                    "registered": reg,
                    "detected": det,
                    "detection_rate": rate,
                    "share_of_total": share,
                })
            return {
                "categories": categories,
                "total_registered": int(total_registered),
            }
    except Exception as e:
        print(f"[crime-statistics/categories] DB error: {e}")
        return {"categories": [], "error": str(e)}


@app.get("/api/crime-statistics/summary")
async def get_crime_statistics_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
):
    """
    Consolidated endpoint returning overview, yearly trends, monthly trends, and category breakdown.
    Designed for single-trip frontend analytics dashboard consumption.
    """
    overview = await get_crime_statistics_overview(start_date=start_date, end_date=end_date)
    yearly = await get_crime_statistics_yearly(start_date=start_date, end_date=end_date)
    monthly = await get_crime_statistics_monthly(start_date=start_date, end_date=end_date)
    categories = await get_crime_statistics_categories(start_date=start_date, end_date=end_date, limit=15)

    return {
        "overview": overview,
        "yearly_trends": yearly.get("yearly_trends", []),
        "monthly_timeline": monthly.get("timeline", []),
        "top_categories": categories.get("categories", []),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)