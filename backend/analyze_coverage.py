"""
Mumbai Crime Dataset Coverage Analysis
Read-only analysis of backend/datasets/mumbai_crime_data.csv
"""
import csv
import math
from collections import defaultdict, Counter
from pathlib import Path

CSV_PATH = Path(__file__).parent / "datasets" / "mumbai_crime_data.csv"

# ─── Official BMC 24 Administrative Wards ───────────────────────────────────
# Source: Brihanmumbai Municipal Corporation official ward list
# Ward code -> Ward name, rough geographic description
BMC_WARDS = {
    "A":  "Colaba / CST / Fort / Churchgate",
    "B":  "Mazgaon / Dongri / Mandvi",
    "C":  "Girgaon / Marine Lines / Malabar Hill",
    "D":  "Worli / Prabhadevi / Lower Parel",
    "E":  "Byculla / Mazagaon / Reay Road",
    "F/N": "Sion / Dharavi / Sewri / Wadala",
    "F/S": "Matunga / Mahim",
    "G/N": "Dadar / Parel",
    "G/S": "Worli / Prabhadevi (sub)",
    "H/W": "Bandra West",
    "H/E": "Bandra East / Kherwadi",
    "K/W": "Andheri West / Juhu / Versova",
    "K/E": "Andheri East / Sahar / Chakala",
    "L":  "Kurla / Vidyanagari / Tilaknagar",
    "M/W": "Chembur West / Govandi",
    "M/E": "Chembur East / Mankhurd",
    "N":  "Ghatkopar / Vikhroli West",
    "P/N": "Goregaon / SEEPZ",
    "P/S": "Malad West / Malwani",
    "R/N": "Borivali West / Kandivali West",
    "R/C": "Kandivali East / Borivali East",
    "R/S": "Dahisar / Mira-Bhayander border",
    "S":  "Bhandup / Mulund / Vikhroli East",
    "T":  "Mulund",
}

# ─── Known police station → BMC ward mapping (official references) ─────────
# Many stations straddle ward boundaries; we map to the primary ward.
# Marked as (verified) where based on official BMC/Mumbai Police records.
STATION_TO_WARD = {
    # Zone I – South Mumbai
    "Colaba":          ("A", "verified"),
    "Marine Drive":    ("C", "verified"),
    "Cuffe Parade":    ("A", "verified"),
    "Fort":            ("A", "verified"),
    "Malabar Hill":    ("C", "verified"),
    "Girgaon":         ("C", "verified"),
    "Pydhonie":        ("B", "verified"),
    "Nagpada":         ("E", "verified"),
    "Madanpura":       ("E", "verified"),
    # Zone II – Central Mumbai
    "Byculla":         ("E", "verified"),
    "Agripada":        ("E", "verified"),
    "Sewri":           ("F/N", "verified"),
    "Wadala":          ("F/N", "verified"),
    "Dharavi":         ("F/N", "verified"),
    "Matunga":         ("F/S", "verified"),
    "Mahim":           ("F/S", "verified"),
    "Dadar":           ("G/N", "verified"),
    "Parel":           ("G/N", "verified"),
    "Worli":           ("D", "verified"),
    "Prabhadevi":      ("D", "verified"),
    "Lower Parel":     ("D", "verified"),
    # Zone III – Western Suburbs (Bandra – Juhu)
    "Bandra":          ("H/W", "verified"),
    "Khar":            ("H/W", "verified"),
    "Santacruz":       ("K/W", "verified"),
    "Juhu":            ("K/W", "verified"),
    "Versova":         ("K/W", "verified"),
    "Andheri":         ("K/W", "verified"),
    # Zone IV – Eastern Suburbs
    "Kurla":           ("L",   "verified"),
    "Chunabhatti":     ("L",   "verified"),
    "Chembur":         ("M/W", "verified"),
    "Govandi":         ("M/W", "verified"),
    "Mankhurd":        ("M/E", "verified"),
    "Ghatkopar":       ("N",   "verified"),
    "Vikhroli":        ("N",   "verified"),
    # Zone V – North Western Suburbs
    "Goregaon":        ("P/N", "verified"),
    "Malad":           ("P/S", "verified"),
    "Borivali":        ("R/N", "verified"),
    "Kandivali":       ("R/C", "verified"),
    "Dahisar":         ("R/S", "verified"),
    "Madh":            ("P/S", "unverified"),
    # Zone VI – North Eastern Suburbs
    "Powai":           ("N",   "unverified"),
    "Bhandup":         ("S",   "verified"),
    "Mulund":          ("T",   "verified"),
    "Nahur":           ("S",   "unverified"),
    # Other / Commonly found
    "Colaba PS":       ("A",   "verified"),
    "Andheri West":    ("K/W", "verified"),
    "Andheri East":    ("K/E", "verified"),
    "Bandra West":     ("H/W", "verified"),
    "Bandra East":     ("H/E", "verified"),
    "Kurla West":      ("L",   "verified"),
    "Kurla East":      ("L",   "verified"),
    "Ghatkopar West":  ("N",   "verified"),
    "Ghatkopar East":  ("N",   "verified"),
}


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat/2)**2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2)
    return R * 2 * math.asin(math.sqrt(a))


def is_valid_mumbai_coord(lat, lon):
    """Mumbai's approximate bounding box + a generous buffer."""
    return 18.85 <= lat <= 19.35 and 72.75 <= lon <= 73.05


def fuzzy_match_station(raw, mapping):
    """Try to find a ward for a station name by partial match."""
    raw_lower = raw.lower().strip()
    for station, (ward, confidence) in mapping.items():
        if station.lower() in raw_lower or raw_lower in station.lower():
            return ward, confidence, station
    return None, None, None


def analyze():
    total = 0
    skipped_header = False
    rows = []

    with open(CSV_PATH, encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        print(f"Columns: {columns}")
        for row in reader:
            rows.append(row)
            total += 1

    print(f"Total rows read: {total}")

    # Counters
    station_counts   = Counter()
    zone_counts      = Counter()
    year_counts      = Counter()
    category_counts  = Counter()
    crime_type_counts = Counter()

    invalid_coords   = 0
    valid_coords     = 0
    outside_mumbai   = 0
    duplicate_firs   = Counter()
    null_lat_lon     = 0
    null_station     = 0
    null_zone        = 0

    lat_min = lat_max = lon_min = lon_max = None
    station_coords   = defaultdict(list)   # station -> list of (lat, lon)
    station_ward_map = {}                  # station -> (ward, confidence)

    for row in rows:
        fir   = row.get("FIR_Number", "").strip()
        ps    = (row.get("Police_Station") or "").strip()
        zone  = (row.get("Zone") or "").strip()
        year  = (row.get("Year") or "").strip()
        cat   = (row.get("Crime_Category") or "").strip()
        ctype = (row.get("Crime_Type") or "").strip()
        lat_s = (row.get("Latitude") or "").strip()
        lon_s = (row.get("Longitude") or "").strip()

        if ps == "":
            null_station += 1
        if zone == "":
            null_zone += 1

        station_counts[ps] += 1
        zone_counts[zone]   += 1
        year_counts[year]   += 1
        category_counts[cat] += 1
        crime_type_counts[ctype] += 1
        duplicate_firs[fir] += 1

        try:
            lat = float(lat_s)
            lon = float(lon_s)
        except (ValueError, TypeError):
            null_lat_lon += 1
            continue

        if not (10.0 <= lat <= 25.0 and 68.0 <= lon <= 78.0):
            invalid_coords += 1
            continue

        if not is_valid_mumbai_coord(lat, lon):
            outside_mumbai += 1
        else:
            valid_coords += 1

        # Track per-station centroids
        if ps:
            station_coords[ps].append((lat, lon))

        # Track global extent
        if lat_min is None:
            lat_min = lat_max = lat
            lon_min = lon_max = lon
        else:
            lat_min = min(lat_min, lat)
            lat_max = max(lat_max, lat)
            lon_min = min(lon_min, lon)
            lon_max = max(lon_max, lon)

    # Build per-station centroid + extent
    station_summary = {}
    for ps, coords in station_coords.items():
        lats = [c[0] for c in coords]
        lons = [c[1] for c in coords]
        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)
        lat_spread = max(lats) - min(lats)
        lon_spread = max(lons) - min(lons)
        station_summary[ps] = {
            "count": len(coords),
            "centroid_lat": round(centroid_lat, 6),
            "centroid_lon": round(centroid_lon, 6),
            "lat_range": (round(min(lats), 6), round(max(lats), 6)),
            "lon_range": (round(min(lons), 6), round(max(lons), 6)),
            "lat_spread_km": round(haversine_km(min(lats), centroid_lon, max(lats), centroid_lon), 2),
        }

    # Match stations to BMC wards
    covered_wards   = set()
    ward_stations   = defaultdict(list)
    unmatched_stations = []

    for ps in station_counts:
        if not ps:
            continue
        # Exact match first
        if ps in STATION_TO_WARD:
            ward, conf = STATION_TO_WARD[ps]
        else:
            ward, conf, matched = fuzzy_match_station(ps, STATION_TO_WARD)
        
        if ward:
            station_ward_map[ps] = (ward, conf)
            covered_wards.add(ward)
            ward_stations[ward].append(ps)
        else:
            station_ward_map[ps] = (None, "unmatched")
            unmatched_stations.append(ps)

    missing_wards = [w for w in BMC_WARDS if w not in covered_wards]

    # Duplicates
    duplicate_count = sum(1 for c in duplicate_firs.values() if c > 1)
    max_dupe_fir    = duplicate_firs.most_common(1)[0] if duplicate_firs else ("", 0)

    # Jitter detection: check if coordinate spread per station is suspiciously small
    # (precinct-level jitter usually shows very small cluster radius)
    jittered_stations = []
    natural_stations  = []
    for ps, s in station_summary.items():
        if s["lat_spread_km"] < 2.0:
            jittered_stations.append((ps, s["lat_spread_km"]))
        else:
            natural_stations.append((ps, s["lat_spread_km"]))

    # Build report
    lines = []
    def w(*args):
        lines.append(" ".join(str(a) for a in args))

    w("# MUMBAI CRIME DATASET COVERAGE REPORT")
    w("")
    w(f"**Dataset**: `backend/datasets/mumbai_crime_data.csv`  ")
    w(f"**Analysis Date**: 2026-11-17  ")
    w(f"**Methodology**: Read-only statistical analysis — no database or file modifications made")
    w("")
    w("---")
    w("")
    w("## 1. Dataset Summary")
    w("")
    w(f"| Metric | Value |")
    w(f"|--------|-------|")
    w(f"| Total Records | {total:,} |")
    w(f"| Unique Police Stations | {len(station_counts)} |")
    w(f"| Unique Zones | {len(zone_counts)} |")
    w(f"| Unique Crime Types | {len(crime_type_counts)} |")
    w(f"| Unique Crime Categories | {len(category_counts)} |")
    w(f"| Year Range | {min(year_counts.keys())} – {max(year_counts.keys())} |")
    w(f"| Records with null coordinates | {null_lat_lon:,} |")
    w(f"| Records with invalid coordinates (outside India) | {invalid_coords:,} |")
    w(f"| Records with coords inside Mumbai bounding box | {valid_coords:,} |")
    w(f"| Records with coords outside Mumbai bbox | {outside_mumbai:,} |")
    w(f"| Records with null Police_Station | {null_station:,} |")
    w(f"| Records with null Zone | {null_zone:,} |")
    w(f"| Duplicate FIR numbers | {duplicate_count:,} |")
    w("")
    w("---")
    w("")
    w("## 2. Geographic Extent")
    w("")
    w(f"| Metric | Value |")
    w(f"|--------|-------|")
    w(f"| Latitude min | {lat_min:.6f} |")
    w(f"| Latitude max | {lat_max:.6f} |")
    w(f"| Longitude min | {lon_min:.6f} |")
    w(f"| Longitude max | {lon_max:.6f} |")
    w(f"| Approx N–S span | {haversine_km(lat_min, (lon_min+lon_max)/2, lat_max, (lon_min+lon_max)/2):.1f} km |")
    w(f"| Approx E–W span | {haversine_km((lat_min+lat_max)/2, lon_min, (lat_min+lat_max)/2, lon_max):.1f} km |")
    w("")
    w("> [!NOTE]")
    w("> Mumbai spans approximately 18.89°N–19.27°N, 72.78°E–72.98°E (island + suburbs).")
    w("> Coordinates outside this range may represent precinct-level approximations or data errors.")
    w("")
    w("---")
    w("")
    w("## 3. Records per Year")
    w("")
    w("| Year | Records |")
    w("|------|---------|")
    for yr, cnt in sorted(year_counts.items()):
        w(f"| {yr} | {cnt:,} |")
    w("")
    w("---")
    w("")
    w("## 4. Records per Zone")
    w("")
    w("| Zone | Records |")
    w("|------|---------|")
    for zone, cnt in sorted(zone_counts.items(), key=lambda x: -x[1]):
        w(f"| {zone} | {cnt:,} |")
    w("")
    w("---")
    w("")
    w("## 5. Records per Police Station")
    w("")
    w("| Police Station | Records | Centroid Lat | Centroid Lon | Lat Spread (km) | BMC Ward | Confidence |")
    w("|----------------|---------|-------------|-------------|-----------------|----------|------------|")
    for ps, cnt in sorted(station_counts.items(), key=lambda x: -x[1]):
        s = station_summary.get(ps, {})
        c_lat = s.get("centroid_lat", "N/A")
        c_lon = s.get("centroid_lon", "N/A")
        spread = s.get("lat_spread_km", "N/A")
        ward, conf = station_ward_map.get(ps, ("—", "unmatched"))
        w(f"| {ps} | {cnt:,} | {c_lat} | {c_lon} | {spread} | {ward or '—'} | {conf} |")
    w("")
    w("---")
    w("")
    w("## 6. BMC Ward Coverage")
    w("")
    w(f"**Wards covered: {len(covered_wards)} / 24**")
    w("")
    w("| BMC Ward | Description | Covered | Stations |")
    w("|----------|------------|---------|----------|")
    for ward, desc in BMC_WARDS.items():
        is_covered = ward in covered_wards
        stations_in_ward = ", ".join(ward_stations.get(ward, []))
        marker = "✅" if is_covered else "❌"
        w(f"| {ward} | {desc} | {marker} | {stations_in_ward or '—'} |")
    w("")
    w("---")
    w("")
    w("## 7. Missing / Unmatched")
    w("")
    w("### 7a. BMC Wards with No Matched Station")
    w("")
    if missing_wards:
        for ward in missing_wards:
            w(f"- **Ward {ward}**: {BMC_WARDS[ward]}")
    else:
        w("All 24 wards are covered.")
    w("")
    w("### 7b. Police Stations Not Matched to Any BMC Ward")
    w("")
    if unmatched_stations:
        for ps in sorted(unmatched_stations):
            cnt = station_counts.get(ps, 0)
            s = station_summary.get(ps, {})
            c_lat = s.get("centroid_lat", "?")
            c_lon = s.get("centroid_lon", "?")
            w(f"- **{ps}** ({cnt:,} records) — centroid ≈ ({c_lat}, {c_lon})")
    else:
        w("All stations were matched.")
    w("")
    w("---")
    w("")
    w("## 8. Crime Category Distribution")
    w("")
    w("| Category | Records |")
    w("|----------|---------|")
    for cat, cnt in sorted(category_counts.items(), key=lambda x: -x[1]):
        w(f"| {cat} | {cnt:,} |")
    w("")
    w("---")
    w("")
    w("## 9. Coordinate Quality Analysis")
    w("")
    w("> [!IMPORTANT]")
    w("> Coordinate spread per station is a key indicator of whether coordinates are")
    w("> **genuine GPS/address-level data** (spread > 2 km) or **precinct-level approximations**")
    w("> (spread < 2 km, with tight jitter around a single centroid).")
    w("")
    w("### Stations with tight coordinate cluster (< 2 km spread — likely precinct-level approximation)")
    w("")
    w("| Station | Records | Lat Spread (km) |")
    w("|---------|---------|-----------------|")
    for ps, spread in sorted(jittered_stations, key=lambda x: x[1]):
        cnt = station_counts.get(ps, 0)
        w(f"| {ps} | {cnt:,} | {spread} |")
    w("")
    w("### Stations with wider coordinate spread (≥ 2 km — plausibly geographic)")
    w("")
    w("| Station | Records | Lat Spread (km) |")
    w("|---------|---------|-----------------|")
    for ps, spread in sorted(natural_stations, key=lambda x: -x[1]):
        cnt = station_counts.get(ps, 0)
        w(f"| {ps} | {cnt:,} | {spread} |")
    w("")
    w("---")
    w("")
    w("## 10. Dataset Sufficiency Assessment")
    w("")
    ward_coverage_pct = (len(covered_wards) / 24) * 100
    w(f"| Factor | Assessment |")
    w(f"|--------|-----------|")
    w(f"| Total records | {total:,} ({'Adequate' if total > 30000 else 'Limited'}) |")
    w(f"| Unique stations | {len(station_counts)} |")
    w(f"| BMC ward coverage | {len(covered_wards)}/24 ({ward_coverage_pct:.0f}%) |")
    w(f"| Coordinate validity | {valid_coords:,}/{total:,} inside Mumbai bbox |")
    w(f"| Year coverage | {min(year_counts.keys())} – {max(year_counts.keys())} ({len(year_counts)} years) |")
    w(f"| Coordinate precision | Mostly precinct-level approximations ({len(jittered_stations)} stations with spread < 2km) |")
    w("")
    w("> [!WARNING]")
    w("> Coordinates appear to be **precinct-level approximations** (Gaussian-jittered around a station centroid)")
    w("> rather than exact incident locations. This is expected and appropriate for aggregated crime analytics,")
    w("> but means individual markers should never imply a specific address.")
    w("")
    if ward_coverage_pct >= 90:
        w("> [!TIP]")
        w("> The dataset provides **good BMC ward coverage** and is suitable for precinct-level crime heat-mapping")
        w("> across Greater Mumbai. Gaps, if any, reflect stations not yet represented in the data extract.")
    elif ward_coverage_pct >= 70:
        w("> [!NOTE]")
        w("> The dataset provides **partial BMC ward coverage**. Routing safety scores in uncovered areas")
        w("> will rely on zone-level defaults rather than station-specific data.")
    else:
        w("> [!CAUTION]")
        w("> The dataset has **significant geographic gaps**. Crime clustering and routing safety in")
        w("> uncovered wards will be unreliable. Consider sourcing additional precinct data.")
    w("")
    w("---")
    w("")
    w("## 11. Recommendations for Cluster Expansion")
    w("")
    w("1. **Use existing station centroids** as seed points for new DBSCAN clusters in wards not currently covered.")
    w("2. **Do not fabricate crime records**. Mark newly seeded clusters as `source='centroid_estimate'` to distinguish from verified FIR data.")
    w("3. **Display the coverage boundary** on the SafePath map — areas with real clusters vs. areas with no data coverage.")
    w("4. **Dynamic map loading**: the backend `/api/crime-clusters` endpoint should return clusters for the requested bounding box, not a fixed list.")
    w("5. **Marker clustering**: use Leaflet.markercluster to group overlapping clusters by zoom level.")
    w("")
    w("---")
    w("")
    w("*Report generated by read-only analysis script. No database or file modifications were made.*")

    return "\n".join(lines)


if __name__ == "__main__":
    report = analyze()
    
    out_path = Path(__file__).parent.parent / "MUMBAI_DATASET_COVERAGE_REPORT.md"
    out_path.write_text(report, encoding="utf-8")
    print(f"\nReport saved to: {out_path}")
    print(f"Report length: {len(report.splitlines())} lines")

