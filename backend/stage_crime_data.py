"""
stage_crime_data.py
===================
Executes staged import of `backend/datasets/mumbai_crime_data.csv`
into PostgreSQL `crime_navigation` database table: `staging_mumbai_crimes`.

Strict Compliance:
1. Imports all 41,735 records.
2. Parameterized SQL with explicit transaction rollback on error.
3. Validates uniqueness of FIR numbers.
4. Verifies date, time, and coordinate conversions.
5. Verifies in_osm_bbox classification count.
6. Reports imported, rejected, and duplicate records.
7. Verifies staging table row count and indexes.
8. Verifies preservation of existing production tables (historical_crimes, road_nodes, road_edges, safe_havens).
9. Does not run DBSCAN or update safety scores.
"""

import os, sys, psycopg2, psycopg2.extras
import pandas as pd
from datetime import date, time
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:harsh7@localhost:5432/crime_navigation"
)

CSV_PATH = os.path.join(os.path.dirname(__file__), "datasets", "mumbai_crime_data.csv")

OSM_BBOX = {
    "min_lat": 19.00,
    "max_lat": 19.15,
    "min_lng": 72.80,
    "max_lng": 72.90,
}

EXPECTED_TOTAL = 41735
EXPECTED_BBOX_COUNT = 15594

CREATE_STAGING_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS staging_mumbai_crimes (
    fir_number VARCHAR(50) PRIMARY KEY,
    year INT NOT NULL,
    month INT NOT NULL,
    month_name VARCHAR(30) NOT NULL,
    day INT NOT NULL,
    hour INT NOT NULL,
    shift VARCHAR(60),
    police_station VARCHAR(100),
    zone VARCHAR(100),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    crime_type VARCHAR(100) NOT NULL,
    crime_category VARCHAR(100),
    case_status VARCHAR(50),
    victim_gender VARCHAR(50),
    victim_age_group VARCHAR(60),
    accused_arrested VARCHAR(20),
    reported_date DATE NOT NULL,
    time_of_day TIME NOT NULL,
    in_osm_bbox BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_staging_crimes_lat_lng ON staging_mumbai_crimes(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_staging_crimes_bbox ON staging_mumbai_crimes(in_osm_bbox);
CREATE INDEX IF NOT EXISTS idx_staging_crimes_type ON staging_mumbai_crimes(crime_type);
CREATE INDEX IF NOT EXISTS idx_staging_crimes_date ON staging_mumbai_crimes(reported_date);
"""

def db_connect():
    url = DATABASE_URL.replace("postgresql://", "")
    user_pass, rest = url.split("@", 1)
    user, pw = user_pass.split(":", 1)
    host_port, dbname = rest.rsplit("/", 1)
    host, port = host_port.split(":")
    return psycopg2.connect(host=host, port=int(port), dbname=dbname, user=user, password=pw)

def main():
    print("=" * 70)
    print("  SafePath — Execute Staging Import of Mumbai Crime Dataset")
    print("=" * 70)

    # 1. Read CSV using pandas
    print(f"\n[1/6] Reading CSV from {CSV_PATH} …")
    df = pd.read_csv(CSV_PATH)
    total_csv_rows = len(df)
    print(f"  Total records in CSV: {total_csv_rows:,}")

    # 2. In-memory validation
    print("\n[2/6] Validating records in memory …")
    seen_firs = set()
    duplicate_firs = []
    rejected_records = []
    clean_records = []

    bbox_matches_in_memory = 0

    for idx, row in df.iterrows():
        fir = str(row["FIR_Number"]).strip()
        if not fir:
            rejected_records.append((idx, "Missing FIR_Number"))
            continue

        if fir in seen_firs:
            duplicate_firs.append((idx, fir))
            continue
        seen_firs.add(fir)

        try:
            yr = int(row["Year"])
            mo = int(row["Month"])
            dy = int(row["Day"])
            hr = int(row["Hour"])
            r_date = date(yr, mo, dy)
            r_time = time(hr, 0, 0)
        except Exception as e:
            rejected_records.append((idx, f"Invalid date/time: {e}"))
            continue

        try:
            lat = float(row["Latitude"])
            lng = float(row["Longitude"])
            if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
                rejected_records.append((idx, f"Coordinates out of range: {lat}, {lng}"))
                continue
        except Exception as e:
            rejected_records.append((idx, f"Non-numeric coordinates: {e}"))
            continue

        in_bbox = (
            (OSM_BBOX["min_lat"] <= lat <= OSM_BBOX["max_lat"]) and
            (OSM_BBOX["min_lng"] <= lng <= OSM_BBOX["max_lng"])
        )
        if in_bbox:
            bbox_matches_in_memory += 1

        clean_records.append((
            fir,
            yr, mo, str(row["Month_Name"]).strip(), dy, hr,
            str(row["Shift"]).strip(),
            str(row["Police_Station"]).strip(),
            str(row["Zone"]).strip(),
            lat, lng,
            str(row["Crime_Type"]).strip(),
            str(row["Crime_Category"]).strip(),
            str(row["Case_Status"]).strip(),
            str(row["Victim_Gender"]).strip(),
            str(row["Victim_Age_Group"]).strip(),
            str(row["Accused_Arrested"]).strip(),
            r_date, r_time, in_bbox
        ))

    print(f"  Valid records prepared : {len(clean_records):,}")
    print(f"  Duplicate FIRs detected: {len(duplicate_firs):,}")
    print(f"  Rejected records       : {len(rejected_records):,}")
    print(f"  Records within OSM bbox: {bbox_matches_in_memory:,} ({bbox_matches_in_memory/total_csv_rows*100:.2f}%)")

    if len(clean_records) != EXPECTED_TOTAL:
        raise ValueError(f"Expected {EXPECTED_TOTAL} valid records, but got {len(clean_records)}")
    if bbox_matches_in_memory != EXPECTED_BBOX_COUNT:
        raise ValueError(f"Expected {EXPECTED_BBOX_COUNT} records in OSM bbox, but got {bbox_matches_in_memory}")

    # 3. Connect to PostgreSQL and record baseline production counts
    conn = db_connect()
    conn.autocommit = False  # Transaction mode
    cur = conn.cursor()

    try:
        print("\n[3/6] Recording baseline production table row counts …")
        cur.execute("SELECT COUNT(*) FROM historical_crimes")
        baseline_hist_crimes = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM road_nodes")
        baseline_nodes = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM road_edges")
        baseline_edges = cur.fetchone()[0]

        cur.execute("SELECT COUNT(*) FROM safe_havens")
        baseline_havens = cur.fetchone()[0]

        print(f"  historical_crimes : {baseline_hist_crimes:,}")
        print(f"  road_nodes        : {baseline_nodes:,}")
        print(f"  road_edges        : {baseline_edges:,}")
        print(f"  safe_havens       : {baseline_havens:,}")

        # 4. Create staging table and execute batch import
        print("\n[4/6] Initializing `staging_mumbai_crimes` table and indexes …")
        cur.execute(CREATE_STAGING_TABLE_SQL)

        print(f"\n[5/6] Importing {len(clean_records):,} records via parameterized batch INSERT …")
        insert_query = """
            INSERT INTO staging_mumbai_crimes (
                fir_number, year, month, month_name, day, hour, shift,
                police_station, zone, latitude, longitude, crime_type,
                crime_category, case_status, victim_gender, victim_age_group,
                accused_arrested, reported_date, time_of_day, in_osm_bbox
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s, %s
            )
            ON CONFLICT (fir_number) DO NOTHING;
        """
        psycopg2.extras.execute_batch(cur, insert_query, clean_records, page_size=5000)
        print("  Batch insertion executed.")

        # 5. Post-import validation inside transaction
        print("\n[6/6] Validating database state inside transaction …")

        cur.execute("SELECT COUNT(*) FROM staging_mumbai_crimes")
        staged_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM staging_mumbai_crimes WHERE in_osm_bbox = TRUE")
        staged_bbox_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM staging_mumbai_crimes WHERE reported_date IS NULL OR time_of_day IS NULL")
        null_datetime_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM staging_mumbai_crimes WHERE latitude IS NULL OR longitude IS NULL")
        null_coord_count = cur.fetchone()[0]

        print(f"  Staging total row count : {staged_count:,} (expected {EXPECTED_TOTAL:,})")
        print(f"  Staging OSM bbox count  : {staged_bbox_count:,} (expected {EXPECTED_BBOX_COUNT:,})")
        print(f"  Null date/time count    : {null_datetime_count}")
        print(f"  Null coordinates count  : {null_coord_count}")

        if staged_count != EXPECTED_TOTAL:
            raise RuntimeError(f"Staged count {staged_count} does not match expected {EXPECTED_TOTAL}!")
        if staged_bbox_count != EXPECTED_BBOX_COUNT:
            raise RuntimeError(f"Staged bbox count {staged_bbox_count} does not match expected {EXPECTED_BBOX_COUNT}!")
        if null_datetime_count > 0 or null_coord_count > 0:
            raise RuntimeError("Detected null dates/times or coordinates in staged table!")

        # Verify indexes exist on staging table
        cur.execute("""
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'staging_mumbai_crimes'
            ORDER BY indexname
        """)
        indexes = [r[0] for r in cur.fetchall()]
        print(f"  Verified indexes on staging_mumbai_crimes: {indexes}")

        # Sample record verification
        cur.execute("""
            SELECT fir_number, crime_type, crime_category, police_station,
                   latitude, longitude, reported_date, time_of_day, in_osm_bbox
            FROM staging_mumbai_crimes
            WHERE in_osm_bbox = TRUE
            LIMIT 1
        """)
        sample = cur.fetchone()
        print(f"  Sample OSM Bbox Record: FIR={sample[0]}, Crime='{sample[1]}' ({sample[2]}), PS='{sample[3]}', Loc=({sample[4]:.4f}, {sample[5]:.4f}), Date={sample[6]}, Time={sample[7]}, Bbox={sample[8]}")

        # 6. Verify production tables were NOT modified
        cur.execute("SELECT COUNT(*) FROM historical_crimes")
        post_hist_crimes = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM road_nodes")
        post_nodes = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM road_edges")
        post_edges = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM safe_havens")
        post_havens = cur.fetchone()[0]

        if (post_hist_crimes != baseline_hist_crimes or
            post_nodes != baseline_nodes or
            post_edges != baseline_edges or
            post_havens != baseline_havens):
            raise RuntimeError("CRITICAL: Production tables were modified during staging import! Rolling back.")

        print("  Production data preservation check passed:")
        print(f"    historical_crimes : {post_hist_crimes:,} (unchanged)")
        print(f"    road_nodes        : {post_nodes:,} (unchanged)")
        print(f"    road_edges        : {post_edges:,} (unchanged)")
        print(f"    safe_havens       : {post_havens:,} (unchanged)")

        # Commit transaction
        conn.commit()
        print("\n" + "=" * 70)
        print("  STAGING IMPORT COMMITTED SUCCESSFULLY! ✅")
        print("=" * 70)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ ERROR during staging: {e}")
        print("  TRANSACTION ROLLED BACK. No changes persisted to database.")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    main()
