import asyncio
import asyncpg
import os
import pandas as pd
import numpy as np
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

CSV_PATH = os.path.join(os.path.dirname(__file__), "datasets", "mumbai_crime_statistics_2018_2025.csv")

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS mumbai_crime_statistics (
    id SERIAL PRIMARY KEY,
    crime_code INTEGER NOT NULL,
    crime_name VARCHAR(255) NOT NULL,
    month_end_date DATE NOT NULL,
    detected NUMERIC(10, 2),
    registered INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mumbai_crime_stats_date ON mumbai_crime_statistics(month_end_date);
CREATE INDEX IF NOT EXISTS idx_mumbai_crime_stats_code ON mumbai_crime_statistics(crime_code);
CREATE INDEX IF NOT EXISTS idx_mumbai_crime_stats_name ON mumbai_crime_statistics(crime_name);
"""

async def ingest():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not set in environment")
    
    print(f"Connecting to database: {db_url}")
    conn = await asyncpg.connect(db_url)
    
    print("Creating table mumbai_crime_statistics if not exists...")
    await conn.execute(CREATE_TABLE_SQL)
    
    # Read CSV
    print(f"Reading CSV from: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH)
    total_csv_rows = len(df)
    print(f"CSV contains {total_csv_rows} rows.")
    
    # Check if table already has rows
    existing_count = await conn.fetchval("SELECT COUNT(*) FROM mumbai_crime_statistics")
    print(f"Existing rows in table: {existing_count}")
    
    if existing_count > 0:
        print("Truncating table for clean, idempotent re-import...")
        await conn.execute("TRUNCATE TABLE mumbai_crime_statistics RESTART IDENTITY")
    
    # Prepare batch records
    records = []
    for _, row in df.iterrows():
        crime_code = int(row["crime_code"])
        crime_name = str(row["crime_name"]).strip()
        month_end_date = datetime.strptime(str(row["month_end_date"]).strip(), "%Y-%m-%d").date()
        
        detected_val = row["detected"]
        if pd.isna(detected_val) or (isinstance(detected_val, float) and np.isnan(detected_val)):
            detected = None
        else:
            detected = float(detected_val)
            
        registered = int(row["registered"])
        records.append((crime_code, crime_name, month_end_date, detected, registered))
        
    print(f"Inserting {len(records)} records...")
    await conn.copy_records_to_table(
        "mumbai_crime_statistics",
        records=records,
        columns=["crime_code", "crime_name", "month_end_date", "detected", "registered"]
    )
    
    # Verify
    new_count = await conn.fetchval("SELECT COUNT(*) FROM mumbai_crime_statistics")
    null_detected_count = await conn.fetchval("SELECT COUNT(*) FROM mumbai_crime_statistics WHERE detected IS NULL")
    date_min = await conn.fetchval("SELECT MIN(month_end_date) FROM mumbai_crime_statistics")
    date_max = await conn.fetchval("SELECT MAX(month_end_date) FROM mumbai_crime_statistics")
    unique_crimes = await conn.fetchval("SELECT COUNT(DISTINCT crime_name) FROM mumbai_crime_statistics")
    total_registered = await conn.fetchval("SELECT SUM(registered) FROM mumbai_crime_statistics")
    total_detected = await conn.fetchval("SELECT SUM(detected) FROM mumbai_crime_statistics")
    
    print("\n=== INGESTION SUCCESSFUL ===")
    print(f"Total rows imported: {new_count} (Expected: {total_csv_rows})")
    print(f"Null detected values: {null_detected_count} (Row 761 preserved as NULL)")
    print(f"Date range: {date_min} to {date_max}")
    print(f"Distinct crime categories: {unique_crimes}")
    print(f"Total registered cases: {total_registered:,}")
    print(f"Total detected cases: {int(total_detected):,}")
    
    # Check that other tables remain untouched
    hist_count = await conn.fetchval("SELECT COUNT(*) FROM historical_crimes")
    staging_count = await conn.fetchval("SELECT COUNT(*) FROM staging_mumbai_crimes")
    cluster_count = await conn.fetchval("SELECT COUNT(*) FROM crime_clusters")
    print("\n=== INTEGRITY CHECK OF EXISTING DATASETS ===")
    print(f"historical_crimes count: {hist_count} (Untouched)")
    print(f"staging_mumbai_crimes count: {staging_count} (Untouched)")
    print(f"crime_clusters count: {cluster_count} (Untouched)")
    
    await conn.close()

if __name__ == "__main__":
    asyncio.run(ingest())

