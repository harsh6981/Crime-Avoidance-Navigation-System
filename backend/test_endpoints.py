import requests

# Test small endpoint
query = """[out:json][timeout:15];way["highway"="motorway"](19.05,72.85,19.10,72.90);out geom;"""

endpoints = [
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass-api.de/api/interpreter"
]

for ep in endpoints:
    try:
        print(f"Testing {ep}...")
        r = requests.post(ep, data={"data": query}, headers={"User-Agent": "SafePath/1.0"}, timeout=15)
        print("Status:", r.status_code)
        if r.ok:
            data = r.json()
            print("Elements:", len(data.get("elements", [])))
            break
    except Exception as e:
        print("Error:", e)

