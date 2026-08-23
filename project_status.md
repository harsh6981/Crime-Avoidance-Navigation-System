# Crime Avoidance Navigation System — Project Status Report
> **Team:** Harshvardhan Tyagi & Mrunmayee Joshi | **Guide:** Dr. Sujata Pathak | KJ Somaiya

---

## Overall Completion: ~65–70% ✅

---

## ✅ COMPLETED (What's Done)

### 🧠 Core Algorithms — FULLY IMPLEMENTED
| Algorithm | File | Status |
|---|---|---|
| Modified A* (Safety-Weighted Pathfinding) | `backend/main.py` | ✅ Complete |
| Dijkstra (Fastest Route) | `backend/main.py` | ✅ Complete |
| DBSCAN Crime Clustering | `backend/crime_clustering.py` | ✅ Complete |
| Bellman-Ford (Dynamic Re-routing) | `backend/algorithms.py` | ✅ Complete |
| Yen's K-Shortest Paths | `backend/algorithms.py` | ✅ Complete (but commented-out in API) |

### 🛡️ Safety Score Engine — FULLY IMPLEMENTED
- `compute_safety_score()` in `main.py` (lines 300–352)
- **Dynamic weight adjustment** based on time-of-day ✅
- **Temporal Weight Adjustment** for night/day ✅
- All 4 factors: Crime (w1), Lighting (w2), Isolation (w3), Hazards (w4) ✅
- Travel mode adjustments (walking / cycling / car) ✅

### 🗺️ Data Ingestion Pipeline — FULLY IMPLEMENTED
| Script | Purpose | Status |
|---|---|---|
| `ingest_osm.py` | Downloads OSM road network + streetlight tags into PostgreSQL | ✅ Complete |
| `load_crime_data.py` | Loads NCRB crime CSV or generates mock data | ✅ Complete |
| `crime_clustering.py` | Runs DBSCAN nightly to update road safety scores | ✅ Complete |
| `setup_mongo_indexes.py` | Sets up MongoDB indexes for hazard geo-queries | ✅ Complete |
| `schema.sql` | PostgreSQL schema (road_nodes, road_edges, historical_crimes, safe_havens) | ✅ Complete |

### 🌐 FastAPI Backend — MOSTLY COMPLETE
| API Endpoint | Status |
|---|---|
| `POST /api/routes/calculate` (Safest + Fastest dual route) | ✅ |
| `POST /api/proxy/ors` (ORS + OSRM fallback routing) | ✅ |
| `POST /api/hazards/report` (Crowdsourced hazard submission) | ✅ |
| `GET /api/hazards/active` (Fetch active hazards in bounding box) | ✅ |
| `POST /api/hazards/verify` (Upvote/downvote a hazard) | ✅ |
| `GET /api/emergency/safe-havens` (Nearest hospitals/police stations) | ✅ |
| `POST /api/emergency/trigger-sos` (Twilio/Fast2SMS SOS trigger) | ✅ |
| `POST /api/users/register` | ✅ |
| `POST /api/users/login` | ✅ |
| `POST /api/users/trusted-contacts` (Add) | ✅ |
| `GET /api/users/trusted-contacts` | ✅ |
| `DELETE /api/users/trusted-contacts` | ✅ |

### 🖥️ Express.js Auth Server — COMPLETE
- JWT-based authentication (`routes/auth.js`) ✅
- Google OAuth login (`routes/googleAuth.js`) ✅
- User model with bcrypt password hashing (`models/User.js`) ✅

### ⚛️ React Frontend — MOSTLY COMPLETE
| Component | Status |
|---|---|
| Full app shell & navigation (`App.jsx`, `App.css`) | ✅ |
| Route planning panel with travel modes (`RoutePanel.jsx`) | ✅ |
| **Dual-Route UI** (Safest in green vs Fastest shown together) | ✅ |
| Map rendering with Leaflet (`MapComponent.jsx`, `MapView.jsx`) | ✅ |
| Crime zone / lighting / traffic heatmap layer toggles (`index.jsx`) | ✅ |
| SOS button with emergency modal (call 112, share location) | ✅ |
| Hazard reporting modal (submit broken lights, suspicious activity, etc.) | ✅ |
| **Guardian Mode** — real-time GPS monitoring + auto-SOS countdown | ✅ |
| Trusted Contacts management (`TrustedContacts.jsx`, `ContactsPanel.jsx`) | ✅ |
| Login / Signup pages with routing (`pages/Login.jsx`, `pages/Signup.jsx`) | ✅ |
| Google Auth button (`GoogleAuthButton.jsx`) | ✅ |
| Firebase config (`config/firebase.js`) | ✅ |
| Auth Context (global session state) (`context/AuthContext.jsx`) | ✅ |
| Recent Trips history modal | ✅ |
| Profile dropdown with logout | ✅ |
| OLED dark mode theme toggle | ✅ |

### 🔌 TomTom Traffic Integration — IMPLEMENTED (needs real API key)
- `fetch_tomtom_traffic()` — live incident data ✅
- `fetch_tomtom_flow()` — speed vs free-flow for isolation penalty ✅
- `traffic_incidents_to_penalties()` — converts incidents to graph penalties ✅
- Falls back to mock data gracefully when no API key ✅

---

## ❌ REMAINING / NOT YET DONE

### 🔴 Critical Missing Pieces

#### 1. NCRB Crime Data — No actual CSV loaded yet
- The `load_crime_data.py` script is ready and can accept real data OR generate mock data.
- **Action needed:** You need to either get NCRB data or generate mock data with `python load_crime_data.py --mock --count 500`

#### 2. PostgreSQL + PostGIS — Not set up on your machine yet
- OSM road data has NOT been ingested (the database doesn't exist yet).
- Without this, the real A* algorithm cannot run. The system falls back to OSRM mock routing.
- **Action needed:** Install PostgreSQL + PostGIS, run `schema.sql`, then run `ingest_osm.py`

#### 3. Yen's K-Shortest Paths — Commented out in the route API
- The code exists in `algorithms.py` but is commented out in `main.py` (line 277).
- Only 2 routes (safest + fastest) are returned. The "3 alternative routes" feature from the project doc is not active.
- **Action needed:** Uncomment and integrate in the route response.

#### 4. Real TomTom API Key — Not configured
- Traffic integration exists but uses a dummy key in `.env`.
- Without a real key, `crowd_level` / `isolation_penalty` in the safety score uses a static mock value.
- **Action needed:** Register at developer.tomtom.com and add key to `.env`

#### 5. Real NCRB / Safety Data feeds into Safety Score
- The Safety Score formula is complete, but `crime_density` field currently defaults to `base_safety_score = 5.0` for every road segment (neutral).
- It only gets real values AFTER OSM ingestion + DBSCAN clustering.

#### 6. Mapbox Integration — Missing
- The project document says **Mapbox** for the dual-route UI. The current implementation uses **Leaflet** (different library).
- The MapComponent exists but it's using OpenStreetMap tiles, not Mapbox's satellite/street style.
- **Action needed:** Decide: stay with Leaflet or migrate to Mapbox.

#### 7. Safe Havens Data — Empty Database
- `GET /api/emergency/safe-havens` exists and queries the `safe_havens` table, but that table has no data.
- **Action needed:** Populate `safe_havens` with nearby police stations and hospitals (can be done via OSM Overpass API for amenity=police / amenity=hospital).

#### 8. Recent Trips — Static/Hardcoded
- The "Recent Trips" modal shows hardcoded data (3 Mumbai trips).
- **Action needed:** Connect to a backend API that stores actual user trip history.

#### 9. Saved Routes — Not Implemented
- The "Saved Routes" dropdown exists in the UI but shows "No saved routes yet."
- No backend endpoint for saving/fetching routes.

#### 10. Firebase Integration — Partially configured
- `config/firebase.js` exists but Google Auth flow needs actual Firebase credentials in `.env`.
- **Action needed:** Add Firebase API key/config to `.env` or `firebase.js`.

#### 11. Weather Overlay (in RoutePanel) — Static/Hardcoded
- Shows "Clear • 26°C High Vis" (hardcoded text, no live weather API)
- The project doc doesn't mention weather explicitly, but it's a visible UI element showing fake data.

---

## 📊 Summary By Project Phase

| Phase | Goal | Status |
|---|---|---|
| **Phase 1** (Data Engineering) | OSM ingestion, NCRB crime data, DBSCAN | ⚠️ Scripts ready, but DB not set up/populated |
| **Phase 2** (Backend + Frontend) | FastAPI, Express Auth, React UI | ✅ ~90% Complete |
| **Phase 3** (Integration) | Mapbox UI, live APIs, A* routing | ⚠️ ~60% (Leaflet instead of Mapbox; TomTom key missing) |
| **Phase 4** (Testing & Optimization) | End-to-end testing, performance | ❌ Not started |

---

## 🎯 Priority Action List (Do These First)

1. **Set up PostgreSQL + PostGIS locally** (or use a free cloud DB like Supabase)
2. **Run `schema.sql`** to create the database tables
3. **Run `python ingest_osm.py`** to download Mumbai OSM road data
4. **Run `python load_crime_data.py --mock --count 500`** to seed crime data
5. **Run `python crime_clustering.py`** to compute real safety scores on road edges
6. **Add real API keys to `.env`**: TomTom, Firebase, ORS
7. **Uncomment Yen's Algorithm** in `main.py` line 277 to activate 3-route alternatives
8. **Populate `safe_havens` table** with actual police station / hospital data
