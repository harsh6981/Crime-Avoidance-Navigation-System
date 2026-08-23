#!/usr/bin/env python3
"""
SafePath — Quick Start Setup Script
=====================================
Run this ONCE to check your environment and set up the project.

    python quickstart.py

It will:
  1. Check Python version
  2. Check if PostgreSQL + PostGIS is reachable
  3. Check if MongoDB is reachable
  4. Check which API keys are missing
  5. Offer to load mock data for testing
"""

import os
import sys
import subprocess
import asyncio

print("""
╔══════════════════════════════════════════════════════════╗
║   🛡  SafePath — Quick Start Setup                      ║
╚══════════════════════════════════════════════════════════╝
""")

# ── 1. Python version check ──
print("Checking Python version...")
if sys.version_info < (3, 10):
    print(f"  ✗ Python {sys.version_info.major}.{sys.version_info.minor} detected. Python 3.10+ required.")
    sys.exit(1)
print(f"  ✓ Python {sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}")

# ── 2. Check .env file ──
print("\nChecking .env file...")
env_path = os.path.join(os.path.dirname(__file__), ".env")
if not os.path.exists(env_path):
    print("  ✗ .env file not found.")
    print("  → Copy .env.example to .env and fill in your values:")
    print("    cp .env.example .env")
else:
    print("  ✓ .env file found")
    # Load env
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

# ── 3. Check API keys ──
print("\nChecking API keys...")
checks = [
    ("DATABASE_URL",        "PostgreSQL URL",       "postgresql://postgres:password@localhost:5432/safepath"),
    ("MONGO_URI",           "MongoDB URI",          "mongodb://localhost:27017"),
    ("JWT_SECRET",          "JWT Secret",           "REPLACE_WITH_A_STRONG_RANDOM_SECRET_STRING"),
    ("TOMTOM_API_KEY",      "TomTom Traffic API",   "YOUR_TOMTOM_API_KEY_HERE"),
    ("TWILIO_ACCOUNT_SID",  "Twilio SID (SOS SMS)", "YOUR_TWILIO_SID_HERE"),
]

missing_keys = []
for env_key, label, placeholder in checks:
    val = os.environ.get(env_key, "")
    if not val or val == placeholder:
        print(f"  ✗ {label} ({env_key}) — NOT SET")
        missing_keys.append(env_key)
    else:
        masked = val[:8] + "..." if len(val) > 8 else val
        print(f"  ✓ {label} — {masked}")

if missing_keys:
    print(f"\n  ⚠  {len(missing_keys)} key(s) not set. The app will run in MOCK MODE for those features.")
    print("  See .env.example for instructions on getting each key.")

# ── 4. Check PostgreSQL ──
print("\nChecking PostgreSQL connection...")
async def check_pg():
    try:
        import asyncpg
        db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:password@localhost:5432/safepath")
        conn = await asyncpg.connect(db_url, timeout=5)
        # Check PostGIS
        result = await conn.fetchval("SELECT PostGIS_Version()")
        await conn.close()
        print(f"  ✓ PostgreSQL connected — PostGIS {result}")
        return True
    except ImportError:
        print("  ✗ asyncpg not installed. Run: pip install -r requirements.txt")
        return False
    except Exception as e:
        print(f"  ✗ PostgreSQL not reachable: {e}")
        print("  → Install PostgreSQL: https://www.postgresql.org/download/")
        print("    Or use Supabase (free): https://supabase.com")
        return False

pg_ok = asyncio.run(check_pg())

# ── 5. Check MongoDB ──
print("\nChecking MongoDB connection...")
async def check_mongo():
    try:
        from motor.motor_asyncio import AsyncIOMotorClient
        mongo_uri = os.environ.get("MONGO_URI", "mongodb://localhost:27017")
        client = AsyncIOMotorClient(mongo_uri, serverSelectionTimeoutMS=3000)
        await client.admin.command("ping")
        client.close()
        print("  ✓ MongoDB connected")
        return True
    except ImportError:
        print("  ✗ motor not installed. Run: pip install -r requirements.txt")
        return False
    except Exception as e:
        print(f"  ✗ MongoDB not reachable: {e}")
        print("  → Install MongoDB: https://www.mongodb.com/try/download/community")
        print("    Or use Atlas (free): https://www.mongodb.com/cloud/atlas")
        return False

mongo_ok = asyncio.run(check_mongo())

# ── 6. Offer to load mock data ──
print()
if pg_ok:
    answer = input("Would you like to load mock crime data for testing? (y/n): ").strip().lower()
    if answer == "y":
        print("Loading 500 mock crime records...")
        result = subprocess.run(
            [sys.executable, "load_crime_data.py", "--mock", "--count", "500"],
            capture_output=True, text=True
        )
        print(result.stdout or result.stderr)

        print("Running crime clustering to calculate safety scores...")
        result = subprocess.run(
            [sys.executable, "crime_clustering.py"],
            capture_output=True, text=True
        )
        print(result.stdout or result.stderr)

    if mongo_ok:
        answer2 = input("Set up MongoDB indexes? (y/n): ").strip().lower()
        if answer2 == "y":
            result = subprocess.run(
                [sys.executable, "setup_mongo_indexes.py"],
                capture_output=True, text=True
            )
            print(result.stdout or result.stderr)

# ── 7. Summary ──
print("""
╔══════════════════════════════════════════════════════════╗
║   Setup Complete!                                        ║
╚══════════════════════════════════════════════════════════╝

Next steps:
  1. Start the backend:
       uvicorn main:app --reload --port 8000

  2. Start the frontend (new terminal):
       cd ../frontend
       npm install && npm run dev

  3. Open http://localhost:5173

  4. Add your Mapbox token in:
       frontend/src/components/MapView.jsx (line 10)

API docs available at: http://localhost:8000/docs
""")