import requests
import json
import time

BASE_URL = "http://127.0.0.1:8000"

TEST_ROUTES = [
    {
        "name": "Route 1: Colaba (South Mumbai) -> Marine Drive / Churchgate",
        "source": {"lat": 18.9100, "lng": 72.8200},
        "destination": {"lat": 18.9400, "lng": 72.8250},
        "travel_mode": "car"
    },
    {
        "name": "Route 2: Dadar -> Borivali (Northern Suburbs)",
        "source": {"lat": 19.0178, "lng": 72.8478},
        "destination": {"lat": 19.2288, "lng": 72.8541},
        "travel_mode": "car"
    },
    {
        "name": "Route 3: Dahisar -> Mira Road (Mira-Bhayandar)",
        "source": {"lat": 19.2568, "lng": 72.8596},
        "destination": {"lat": 19.2812, "lng": 72.8682},
        "travel_mode": "car"
    },
    {
        "name": "Route 4: Bhayandar -> Vasai (Vasai-Virar)",
        "source": {"lat": 19.3082, "lng": 72.8519},
        "destination": {"lat": 19.3839, "lng": 72.8295},
        "travel_mode": "car"
    },
    {
        "name": "Route 5: Mulund -> Thane Majiwada (Thane City)",
        "source": {"lat": 19.1726, "lng": 72.9565},
        "destination": {"lat": 19.2086, "lng": 72.9715},
        "travel_mode": "car"
    },
    {
        "name": "Route 6: Mankhurd -> Vashi (Navi Mumbai)",
        "source": {"lat": 19.0522, "lng": 72.9312},
        "destination": {"lat": 19.0760, "lng": 72.9986},
        "travel_mode": "car"
    },
    {
        "name": "Route 7: Belapur -> Panvel Station (Panvel)",
        "source": {"lat": 19.0178, "lng": 73.0401},
        "destination": {"lat": 18.9894, "lng": 73.1215},
        "travel_mode": "car"
    },
    {
        "name": "Route 8: Kalwa -> Dombivli (Kalyan-Dombivli)",
        "source": {"lat": 19.1963, "lng": 72.9984},
        "destination": {"lat": 19.2183, "lng": 73.0867},
        "travel_mode": "car"
    }
]

def run_tests():
    print("=" * 65)
    print("TESTING SAFEPATH ROUTING ACROSS EXPANDED MMR CORRIDORS")
    print("=" * 65)
    
    passed = 0
    total = len(TEST_ROUTES)
    
    for r in TEST_ROUTES:
        print(f"\nEvaluating: {r['name']} ...")
        t0 = time.time()
        try:
            res = requests.post(
                f"{BASE_URL}/api/routes/calculate",
                json={
                    "source": r["source"],
                    "destination": r["destination"],
                    "travel_mode": r["travel_mode"],
                    "time_of_day": "12:00"
                },
                timeout=60
            )
            elapsed = time.time() - t0
            if res.status_code == 200:
                data = res.json()
                safest = data.get("safest_route", {})
                fastest = data.get("fastest_route", {})
                is_mock = safest.get("is_mock", False)
                dist = safest.get("distance_km", 0)
                safety = safest.get("safety_rating", "Unknown")
                waypoint_count = len(safest.get("path", []))
                
                status_icon = "✅ REAL GRAPH" if not is_mock and waypoint_count > 1 else "⚠ MOCK"
                print(f"  {status_icon} (Status: {res.status_code} in {elapsed:.2f}s)")
                print(f"     Real Graph Route : {not is_mock}")
                print(f"     Distance         : {dist:.2f} km")
                print(f"     Safety Rating    : {safety}")
                print(f"     Waypoints        : {waypoint_count}")
                if not is_mock and waypoint_count > 1:
                    passed += 1
            else:
                print(f"  ❌ Failed with status {res.status_code}: {res.text[:120]}")
        except Exception as e:
            print(f"  ❌ Request error: {e}")
            
    print("\n" + "=" * 65)
    print(f"ROUTING TEST SUMMARY: {passed}/{total} real road graph routes passed!")
    print("=" * 65)

if __name__ == "__main__":
    run_tests()
