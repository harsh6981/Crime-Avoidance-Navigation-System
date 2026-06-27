"""
SafePath — NCRB Crime Data CSV Loader
=======================================
Loads historical crime data from a CSV file into the
historical_crimes PostgreSQL table.

EXPECTED CSV FORMAT (columns):
  crime_type, severity_weight, date_reported, time_of_day, latitude, longitude

EXAMPLE CSV ROWS:
  theft,0.4,2023-08-15,22:30,19.0760,72.8777
  assault,0.8,2023-09-01,23:15,19.0812,72.8801

RUN:
  python load_crime_data.py --csv path/to/ncrb_data.csv

If you don't have real NCRB data yet, this script can also
generate mock data for testing with --mock flag.

  python load_crime_data.py --mock --count 500
"""

import os
import asyncio
import csv
import random
import argparse
from datetime import date, time
import asyncpg

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:password@localhost:5432/safepath"
)

# Crime types with default severity weights
CRIME_WEIGHTS = {
    "theft":            0.4,
    "robbery":          0.6,
    "assault":          0.8,
    "chain_snatching":  0.5,
    "eve_teasing":      0.6,
    "molestation":      0.85,
    "burglary":         0.5,
    "vandalism":        0.3,
}

# Mumbai bounding box for mock data
MUMBAI_BOUNDS = {
    "lat": (18.90, 19.27),
    "lng": (72.78, 72.99),
}


async def load_from_csv(filepath: str):
    pool = await asyncpg.create_pool(DATABASE_URL)
    records = []

    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                records.append((
                    row["crime_type"].strip().lower(),
                    float(row["severity_weight"]),
                    date.fromisoformat(row["date_reported"]),
                    row.get("time_of_day") or None,
                    float(row["latitude"]),
                    float(row["longitude"]),
                ))
            except (KeyError, ValueError) as e:
                print(f"Skipping row {row}: {e}")

    async with pool.acquire() as conn:
        await conn.executemany("""
            INSERT INTO historical_crimes
                (crime_type, severity_weight, date_reported, time_of_day, geom)
            VALUES ($1, $2, $3, $4::time, ST_SetSRID(ST_MakePoint($6, $5), 4326))
        """, records)

    print(f"✅ Loaded {len(records)} crime records from {filepath}")
    await pool.close()


async def generate_mock_data(count: int):
    """Generate synthetic crime data for testing."""
    pool = await asyncpg.create_pool(DATABASE_URL)
    records = []

    crime_types = list(CRIME_WEIGHTS.keys())

    # Create a few realistic crime hotspots (clusters)
    hotspots = [
        (19.045, 72.836),   # Dharavi area
        (19.076, 72.877),   # Bandra station
        (19.017, 72.849),   # Kurla
        (19.104, 72.870),   # Jogeshwari
        (18.961, 72.820),   # Chembur
    ]

    for _ in range(count):
        crime_type = random.choice(crime_types)
        severity   = CRIME_WEIGHTS[crime_type] + random.uniform(-0.1, 0.1)
        severity   = max(0.1, min(1.0, severity))

        # 60% of crimes near hotspots, 40% random
        if random.random() < 0.6:
            center = random.choice(hotspots)
            lat = center[0] + random.gauss(0, 0.005)
            lng = center[1] + random.gauss(0, 0.005)
        else:
            lat = random.uniform(*MUMBAI_BOUNDS["lat"])
            lng = random.uniform(*MUMBAI_BOUNDS["lng"])

        # More crimes at night
        if random.random() < 0.65:
            hour = random.choice([20, 21, 22, 23, 0, 1, 2])
        else:
            hour = random.randint(6, 19)
        minute = random.randint(0, 59)

        year  = random.randint(2022, 2024)
        month = random.randint(1, 12)
        day   = random.randint(1, 28)

        records.append((
            crime_type,
            round(severity, 2),
            date(year, month, day),
            f"{hour:02d}:{minute:02d}",
            lat,
            lng,
        ))

    async with pool.acquire() as conn:
        await conn.executemany("""
            INSERT INTO historical_crimes
                (crime_type, severity_weight, date_reported, time_of_day, geom)
            VALUES ($1, $2, $3, $4::time, ST_SetSRID(ST_MakePoint($6, $5), 4326))
        """, records)

    print(f"✅ Generated and inserted {count} mock crime records")
    print("   Next: run crime_clustering.py to update road safety scores")
    await pool.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Load crime data into SafePath DB")
    parser.add_argument("--csv",   help="Path to NCRB CSV file")
    parser.add_argument("--mock",  action="store_true", help="Generate mock data")
    parser.add_argument("--count", type=int, default=500, help="Mock data count (default 500)")
    args = parser.parse_args()

    if args.mock:
        asyncio.run(generate_mock_data(args.count))
    elif args.csv:
        asyncio.run(load_from_csv(args.csv))
    else:
        print("Usage:")
        print("  python load_crime_data.py --csv data/ncrb.csv")
        print("  python load_crime_data.py --mock --count 500")