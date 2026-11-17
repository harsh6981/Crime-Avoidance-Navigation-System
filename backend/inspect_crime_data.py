"""
inspect_crime_data.py
=====================
Inspects backend/datasets/mumbai_crime_data.csv using pandas.
Reports:
1. Columns & data types
2. Total records & duplicate FIR numbers
3. Missing values
4. Invalid latitude/longitude values
5. Geographic coverage & records inside our OSM bounding box (19.00-19.15 lat, 72.80-72.90 lng)
6. Crime types & date distribution
"""

import os, json
import pandas as pd
import numpy as np

CSV_PATH = r"c:\Users\harsh\Desktop\Crime-Avoidance-Navigation - Copy\backend\datasets\mumbai_crime_data.csv"
OSM_BBOX = {
    "min_lat": 19.00,
    "max_lat": 19.15,
    "min_lng": 72.80,
    "max_lng": 72.90,
}

def main():
    print("=" * 70)
    print("  MUMBAI CRIME DATASET AUDIT & INSPECTION")
    print("=" * 70)
    print(f"File: {CSV_PATH}")
    file_size_mb = os.path.getsize(CSV_PATH) / (1024 * 1024)
    print(f"File Size: {file_size_mb:.2f} MB\n")

    # Load dataframe
    df = pd.read_csv(CSV_PATH, low_memory=False)

    # 1. Columns and data types
    print("1. COLUMNS & INFERRED DTYPES:")
    print("-" * 50)
    col_info = []
    for col in df.columns:
        col_info.append({
            "column": col,
            "dtype": str(df[col].dtype),
            "non_null_count": int(df[col].count()),
            "null_count": int(df[col].isna().sum()),
            "sample_value": str(df[col].dropna().iloc[0]) if not df[col].dropna().empty else "None"
        })
    col_df = pd.DataFrame(col_info)
    print(col_df.to_string(index=False))

    # 2. Total records & duplicate FIR numbers
    print("\n2. TOTAL RECORDS & DUPLICATES:")
    print("-" * 50)
    total_records = len(df)
    print(f"Total Rows (Records): {total_records:,}")

    # Identify potential FIR column
    fir_col = None
    for candidate in ["fir_number", "fir_no", "fir", "fir_id", "crime_id", "incident_id", "case_id", "id"]:
        for col in df.columns:
            if candidate in col.lower():
                fir_col = col
                break
        if fir_col:
            break

    if fir_col:
        unique_firs = df[fir_col].nunique(dropna=True)
        dup_firs = df[fir_col].duplicated(keep=False).sum()
        null_firs = df[fir_col].isna().sum()
        print(f"Identified FIR Column: '{fir_col}'")
        print(f"Unique FIR values   : {unique_firs:,}")
        print(f"Duplicate FIR rows  : {dup_firs:,}")
        print(f"Missing (NaN) FIRs  : {null_firs:,}")
    else:
        print("No explicit 'fir' or 'case_id' column found by name pattern. Checking all column uniqueness:")
        for col in df.columns:
            print(f"  {col}: {df[col].nunique():,} unique values out of {total_records:,}")

    # Full row duplicates
    full_row_dups = df.duplicated().sum()
    print(f"Exact Full-Row Duplicates: {full_row_dups:,}")

    # 3. Missing values summary
    print("\n3. MISSING VALUES PER COLUMN:")
    print("-" * 50)
    missing_series = df.isna().sum()
    missing_pct = (df.isna().sum() / total_records) * 100
    missing_summary = pd.DataFrame({
        "Missing Count": missing_series,
        "Missing %": missing_pct.round(2)
    })
    print(missing_summary[missing_summary["Missing Count"] > 0].to_string())
    if (missing_series == 0).all():
        print("No missing values in any column.")

    # 4. Latitude / Longitude inspection
    print("\n4. LATITUDE & LONGITUDE INTEGRITY:")
    print("-" * 50)
    lat_col = None
    lng_col = None
    for col in df.columns:
        cl = col.lower().strip()
        if cl in ["latitude", "lat", "y"]:
            lat_col = col
        elif cl in ["longitude", "lon", "lng", "long", "x"]:
            lng_col = col

    print(f"Detected Latitude Column : '{lat_col}'")
    print(f"Detected Longitude Column: '{lng_col}'")

    if lat_col and lng_col:
        # Convert to numeric safely
        lat_numeric = pd.to_numeric(df[lat_col], errors="coerce")
        lng_numeric = pd.to_numeric(df[lng_col], errors="coerce")

        non_numeric_lat = lat_numeric.isna() & df[lat_col].notna()
        non_numeric_lng = lng_numeric.isna() & df[lng_col].notna()
        null_coords = lat_numeric.isna() | lng_numeric.isna()
        zero_coords = (lat_numeric == 0.0) | (lng_numeric == 0.0)
        out_of_world = (lat_numeric < -90) | (lat_numeric > 90) | (lng_numeric < -180) | (lng_numeric > 180)

        valid_mask = lat_numeric.notna() & lng_numeric.notna() & ~zero_coords & ~out_of_world

        print(f"Total rows with NaN/missing coords : {null_coords.sum():,}")
        print(f"Total non-numeric string coords    : {(non_numeric_lat | non_numeric_lng).sum():,}")
        print(f"Total (0.0, 0.0) placeholder coords: {zero_coords.sum():,}")
        print(f"Total out-of-range WGS84 coords    : {out_of_world.sum():,}")
        print(f"Total valid geographic coords      : {valid_mask.sum():,} ({valid_mask.sum()/total_records*100:.2f}%)")

        valid_lats = lat_numeric[valid_mask]
        valid_lngs = lng_numeric[valid_mask]

        print(f"\nValid Coordinates Range:")
        print(f"  Latitude : min = {valid_lats.min():.6f}, max = {valid_lats.max():.6f}")
        print(f"  Longitude: min = {valid_lngs.min():.6f}, max = {valid_lngs.max():.6f}")

        # 5. Geographic coverage and OSM Bounding Box filter
        print("\n5. GEOGRAPHIC COVERAGE & OSM BOUNDING BOX MATCH:")
        print("-" * 50)
        print(f"OSM Road Network Bounding Box:")
        print(f"  Latitude : [{OSM_BBOX['min_lat']}, {OSM_BBOX['max_lat']}]")
        print(f"  Longitude: [{OSM_BBOX['min_lng']}, {OSM_BBOX['max_lng']}]")

        in_osm_box = valid_mask & (
            (lat_numeric >= OSM_BBOX["min_lat"]) & (lat_numeric <= OSM_BBOX["max_lat"]) &
            (lng_numeric >= OSM_BBOX["min_lng"]) & (lng_numeric <= OSM_BBOX["max_lng"])
        )

        # Wider Mumbai Metropolitan Region (MMR): roughly 18.8 to 19.4 lat, 72.7 to 73.2 lng
        in_greater_mumbai = valid_mask & (
            (lat_numeric >= 18.85) & (lat_numeric <= 19.35) &
            (lng_numeric >= 72.75) & (lng_numeric <= 73.15)
        )

        print(f"Records STRICTLY inside SafePath OSM bbox : {in_osm_box.sum():,} ({in_osm_box.sum()/total_records*100:.2f}%)")
        print(f"Records in Greater Mumbai Region (MMR)     : {in_greater_mumbai.sum():,} ({in_greater_mumbai.sum()/total_records*100:.2f}%)")
        print(f"Records outside Greater Mumbai / Outliers  : {(valid_mask & ~in_greater_mumbai).sum():,}")

    # 6. Crime types and Date distribution
    print("\n6. CRIME TYPES & TEMPORAL DISTRIBUTION:")
    print("-" * 50)

    # Crime type column detection
    crime_col = None
    for candidate in ["crime_type", "offense_type", "crime", "offense", "ipc_section", "category"]:
        for col in df.columns:
            if candidate in col.lower():
                crime_col = col
                break
        if crime_col:
            break

    if crime_col:
        print(f"Detected Crime Type Column: '{crime_col}'")
        crime_counts = df[crime_col].value_counts(dropna=False)
        print(f"Unique Crime Types: {len(crime_counts)}")
        print("\nTop 15 Crime Categories:")
        for ctype, count in crime_counts.head(15).items():
            pct = (count / total_records) * 100
            print(f"  {str(ctype):<35} : {count:>7,} ({pct:>5.2f}%)")
    else:
        print("No explicit crime type column identified by name.")

    # Date column detection
    date_col = None
    for candidate in ["date_reported", "reported_date", "incident_date", "crime_date", "date", "timestamp"]:
        for col in df.columns:
            if candidate in col.lower():
                date_col = col
                break
        if date_col:
            break

    if date_col:
        print(f"\nDetected Date Column: '{date_col}'")
        date_parsed = pd.to_datetime(df[date_col], errors="coerce")
        null_dates = date_parsed.isna().sum()
        valid_dates = date_parsed.dropna()

        print(f"Missing / Unparseable Dates: {null_dates:,}")
        if not valid_dates.empty:
            print(f"Date Range : {valid_dates.min().strftime('%Y-%m-%d')} to {valid_dates.max().strftime('%Y-%m-%d')}")
            print("\nRecords by Year:")
            years = valid_dates.dt.year.value_counts().sort_index()
            for yr, count in years.items():
                print(f"  {int(yr)}: {count:>7,} ({count/total_records*100:>5.2f}%)")
    else:
        print("No explicit date column identified by name.")

    # Time column detection
    time_col = None
    for candidate in ["time_of_day", "incident_time", "time", "hour"]:
        for col in df.columns:
            if candidate in col.lower():
                time_col = col
                break
        if time_col:
            break
    if time_col:
        print(f"\nDetected Time Column: '{time_col}' (Sample values: {df[time_col].dropna().head(3).tolist()})")

    # Sample rows display
    print("\nSAMPLE RECORD (First 2 rows in JSON format):")
    print("-" * 50)
    print(json.dumps(df.head(2).to_dict(orient="records"), indent=2, default=str))

if __name__ == "__main__":
    main()

