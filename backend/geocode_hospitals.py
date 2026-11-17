
import csv
import os
import re
import time
import requests
from pathlib import Path
from difflib import SequenceMatcher
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "datasets"

INPUT_FILE = DATA_DIR / "mumbai_hospitals_geocoding.csv"
OUTPUT_FILE = DATA_DIR / "mumbai_hospitals_geocoded_v2.csv"
FAILED_FILE = DATA_DIR / "mumbai_hospitals_failed_v2.csv"

load_dotenv(BASE_DIR / ".env")
API_KEY = os.getenv("TOMTOM_API_KEY")

if not API_KEY:
    raise RuntimeError("TOMTOM_API_KEY not found")

# Greater Mumbai validation bounds
MIN_LAT, MAX_LAT = 18.89, 19.30
MIN_LON, MAX_LON = 72.75, 73.05

session = requests.Session()
session.headers.update({"User-Agent": "SafePath-Student-Project/1.0"})

def normalize(value):
    value = re.sub(r"[^a-z0-9 ]", " ", value.lower())
    return " ".join(value.split())

def name_similarity(expected, actual):
    expected = normalize(expected)
    actual = normalize(actual)
    return SequenceMatcher(None, expected, actual).ratio()

def inside_mumbai(lat, lon):
    return MIN_LAT <= lat <= MAX_LAT and MIN_LON <= lon <= MAX_LON

def geocode(name, address, ward):
    query = f"{name}, {address}, Ward {ward}, Mumbai, Maharashtra, India"
    url = "https://api.tomtom.com/search/2/search/" + requests.utils.quote(query, safe="") + ".json"

    for attempt in range(4):
        try:
            response = session.get(
                url,
                params={
                    "key": API_KEY,
                    "countrySet": "IN",
                    "limit": 10,
                    "lat": 19.0760,
                    "lon": 72.8777,
                    "radius": 30000
                },
                timeout=30
            )

            if response.status_code == 429:
                wait = 5 * (attempt + 1)
                print(f"Rate limited. Waiting {wait} seconds...")
                time.sleep(wait)
                continue

            response.raise_for_status()
            results = response.json().get("results", [])

            candidates = []

            for item in results:
                position = item.get("position", {})
                lat = position.get("lat")
                lon = position.get("lon")

                if lat is None or lon is None or not inside_mumbai(lat, lon):
                    continue

                poi_name = item.get("poi", {}).get("name", "")
                similarity = name_similarity(name, poi_name) if poi_name else 0

                if similarity < 0.45:
                    continue

                candidates.append({
                    "latitude": lat,
                    "longitude": lon,
                    "match_score": item.get("score", ""),
                    "name_similarity": round(similarity, 3),
                    "matched_address": item.get("address", {}).get("freeformAddress", ""),
                    "matched_name": poi_name
                })

            if candidates:
                return max(candidates, key=lambda x: x["name_similarity"])

            return None

        except requests.RequestException as error:
            print(f"Request failed. Attempt {attempt + 1}/4: {error}")
            time.sleep(5 * (attempt + 1))

    return None

with open(INPUT_FILE, "r", encoding="utf-8-sig", newline="") as file:
    hospitals = list(csv.DictReader(file))

successful = []
failed = []

print(f"Processing {len(hospitals)} hospitals...")

for index, hospital in enumerate(hospitals, start=1):
    name = hospital.get("Hospital Name", "").strip()
    address = hospital.get("Address", "").strip()
    ward = hospital.get("Ward Name", "").strip()

    result = geocode(name, address, ward)

    record = hospital.copy()

    if result:
        record.update(result)
        record["geocoding_status"] = "success"
        successful.append(record)
        print(f"[{index}/{len(hospitals)}] MATCHED: {name}")
    else:
        record.update({
            "latitude": "",
            "longitude": "",
            "match_score": "",
            "name_similarity": "",
            "matched_address": "",
            "matched_name": "",
            "geocoding_status": "failed"
        })
        failed.append(record)
        print(f"[{index}/{len(hospitals)}] NOT VERIFIED: {name}")

    time.sleep(1.2)

fields = list(hospitals[0].keys()) + [
    "latitude", "longitude", "match_score",
    "name_similarity", "matched_address",
    "matched_name", "geocoding_status"
]

for path, records in [
    (OUTPUT_FILE, successful),
    (FAILED_FILE, failed)
]:
    with open(path, "w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)

print("\nGEOCODING FINISHED")
print("Verified:", len(successful))
print("Unverified:", len(failed))
print("Successful file:", OUTPUT_FILE)
print("Failed file:", FAILED_FILE)
