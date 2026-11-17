from datasets import load_dataset
import os

print("Downloading Mumbai Crime Statistics...")

dataset = load_dataset("shreyaskal3/crime-stats-mumbai-2018-2025")

df = dataset["train"].to_pandas()

os.makedirs("datasets", exist_ok=True)

output = "datasets/mumbai_crime_statistics_2018_2025.csv"

df.to_csv(output, index=False)

print(f"Download complete: {len(df)} records")
print(f"Saved to: {output}")