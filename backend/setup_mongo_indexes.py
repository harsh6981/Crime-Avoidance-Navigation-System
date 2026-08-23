"""
SafePath — MongoDB Index Setup
================================
Run ONCE after MongoDB is running to create geospatial
and expiry indexes on the hazard_reports collection.

RUN:
  python setup_mongo_indexes.py
"""

import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB  = os.getenv("MONGO_DB",  "safepath")

async def setup():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[MONGO_DB]
    col = db["hazard_reports"]

    # 1. 2dsphere index for geospatial queries ($geoWithin, $nearSphere)
    await col.create_index([("location", "2dsphere")])
    print("✅ Created 2dsphere index on location")

    # 2. TTL index — auto-delete resolved hazards after 48 hours
    await col.create_index(
        [("expires_at", 1)],
        expireAfterSeconds=0,  # uses the expires_at field value directly
    )
    print("✅ Created TTL index on expires_at (auto-deletes stale hazards)")

    # 3. Index on status for fast active-hazard queries
    await col.create_index([("status", 1)])
    print("✅ Created index on status")

    # 4. Index on mapped_edge_id for fast routing lookups
    await col.create_index([("mapped_edge_id", 1)])
    print("✅ Created index on mapped_edge_id")

    print("\n✅ MongoDB indexes ready.")
    client.close()

if __name__ == "__main__":
    asyncio.run(setup())