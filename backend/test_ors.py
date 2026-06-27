import requests
import os
from dotenv import load_dotenv

# Load .env explicitly
load_dotenv()

api_key = os.getenv("ORS_API_KEY")

print("--- ORS API KEY TEST ---")
print(f"Loaded Key: '{api_key}'")

if not api_key or api_key == "YOUR_ORS_API_KEY_HERE" or api_key.strip() == "":
    print("\n❌ Error: Your ORS_API_KEY is missing or invalid in the .env file!")
    print("Please open backend/.env and add:")
    print("ORS_API_KEY=your_actual_key_here")
    exit(1)

headers = {
    "Authorization": api_key,
    "Content-Type": "application/json"
}

body = {
    "coordinates": [
        [72.8406, 19.0544],
        [72.8468, 19.1197]
    ]
}

print("\nMaking request to OpenRouteService...")
response = requests.post(
    "https://api.openrouteservice.org/v2/directions/driving-car",
    json=body,
    headers=headers
)

print(f"Status Code: {response.status_code}")

if response.status_code == 200:
    print("✅ SUCCESS! Your API key is valid and working.")
elif response.status_code == 401:
    print("❌ 401 Unauthorized - The API key is invalid or not recognized.")
elif response.status_code == 403:
    print("❌ 403 Forbidden - The API key is blocked, expired, or missing permissions.")
else:
    print(f"❌ Error {response.status_code}")

print(f"\nResponse Body:\n{response.text[:200]}...")
