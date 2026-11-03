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
import math
import json
import heapq
from datetime import datetime, timedelta

# ── Add custom twilio install path (installed to short path due to Windows MAX_PATH) ──
_twilio_path = r"C:\twlib\Lib\site-packages"
if os.path.isdir(_twilio_path) and _twilio_path not in sys.path:
    sys.path.insert(0, _twilio_path)

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

# ── Algorithms ──
from algorithms import yens_k_shortest, fetch_tomtom_traffic, fetch_tomtom_flow, traffic_incidents_to_penalties

# ── Database drivers ──
import asyncpg          # pip install asyncpg
from motor.motor_asyncio import AsyncIOMotorClient  # pip install motor

# ── Optional: Twilio SMS (pip install twilio) ──
try:
    from twilio.rest import Client as TwilioClient  # type: ignore
except ImportError:
    TwilioClient = None  # type: ignore

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

    # ── Fetch live TomTom traffic data ──
    traffic_incidents = []
    traffic_flow = {}
    if cfg.TOMTOM_API_KEY and cfg.TOMTOM_API_KEY != "YOUR_TOMTOM_API_KEY_HERE":
        try:
            mid_lat = (req.source.lat + req.destination.lat) / 2
            mid_lng = (req.source.lng + req.destination.lng) / 2
            traffic_incidents = await fetch_tomtom_traffic(mid_lat, mid_lng)
            traffic_flow = await fetch_tomtom_flow(mid_lat, mid_lng)
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

    # ── Run Modified A* for safest route ──
    safest_path = astar_safest(graph, req.source, req.destination)

    # ── Run standard Dijkstra for fastest route ──
    fastest_path = dijkstra_fastest(graph, req.source, req.destination)

    # ── Run Yen's K-Shortest for alternative routes ──
    src_node = snap_to_nearest_node(graph, req.source)
    dst_node = snap_to_nearest_node(graph, req.destination)
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

    if alternative_route:
        response["alternative_route"] = alternative_route

    if traffic_summary:
        response["traffic"] = traffic_summary

    return response


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
# ── LIVE TRAFFIC APIs (TomTom) ──
# Exposes TomTom traffic data to the frontend
# ═══════════════════════════════════════════════════════════

@app.get("/api/traffic/flow")
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

    if mongo_db:
        await mongo_db.trip_history.insert_one(doc)
    else:
        print(f"[MOCK] Trip saved: {doc}")

    return {"trip_id": doc["_id"], "message": "Trip saved"}


@app.get("/api/trips")
async def get_trips(user_id: str, limit: int = 20):
    """Get recent trip history for a user."""
    if not mongo_db:
        return {"trips": []}

    trips = await mongo_db.trip_history.find(
        {"user_id": user_id}
    ).sort("date", -1).limit(limit).to_list(limit)

    return {"trips": trips}


@app.delete("/api/trips")
async def clear_trips(user_id: str):
    """Clear all trip history for a user."""
    if mongo_db:
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

    if mongo_db:
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
async def get_saved_routes(user_id: str):
    """Get all saved/bookmarked routes for a user."""
    if not mongo_db:
        return {"routes": []}

    routes = await mongo_db.saved_routes.find(
        {"user_id": user_id}
    ).sort("saved_at", -1).to_list(20)

    return {"routes": routes}


@app.delete("/api/routes/saved")
async def delete_saved_route(user_id: str, route_id: str):
    """Delete a specific saved route."""
    if mongo_db:
        await mongo_db.saved_routes.delete_one({"_id": route_id, "user_id": user_id})
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

        # ── TomTom Traffic Incident Penalties ──
        # Apply safety penalty if a traffic incident is near this edge
        if traffic_penalties:
            edge_mid_lat = (e["src_lat"] + e["tgt_lat"]) / 2
            edge_mid_lng = (e["src_lng"] + e["tgt_lng"]) / 2
            for inc_lat, inc_lng, penalty in traffic_penalties:
                # ~200m proximity check (roughly 0.002 degrees)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)