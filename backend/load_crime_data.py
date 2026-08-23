import os
import asyncio
import csv
import random
import argparse
import asyncpg
from datetime import date, time

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:123456@localhost:5432/crime_navigation"
)

CRIME_WEIGHTS = {
    "theft": 0.4,
    "robbery": 0.6,
    "assault": 0.8,
    "chain_snatching": 0.5,
    "eve_teasing": 0.6,
    "molestation": 0.85,
    "burglary": 0.5,
    "vandalism": 0.3,
}

MUMBAI_BOUNDS = {
    "lat": (18.90, 19.27),
    "lng": (72.78, 72.99),
}

BATCH_SIZE = 1000


def parse_time(value):
    if not value:
        return None

    value = value.strip()

    try:
        parts = value.split(":")
        hour = int(parts[0])
        minute = int(parts[1])
        second = int(parts[2]) if len(parts) > 2 else 0

        return time(hour, minute, second)

    except (ValueError, IndexError):
        return None


async def insert_records(conn, records):
    query = """
        INSERT INTO historical_crimes
            (
                crime_type,
                severity_weight,
                date_reported,
                time_of_day,
                geom
            )
        VALUES
            (
                $1,
                $2,
                $3,
                $4,
                ST_SetSRID(
                    ST_MakePoint($6, $5),
                    4326
                )
            )
    """

    for start in range(0, len(records), BATCH_SIZE):
        batch = records[start:start + BATCH_SIZE]

        await conn.executemany(
            query,
            batch
        )


async def load_from_csv(filepath):
    records = []

    with open(
        filepath,
        newline="",
        encoding="utf-8"
    ) as file:

        reader = csv.DictReader(file)

        required_columns = {
            "crime_type",
            "severity_weight",
            "date_reported",
            "time_of_day",
            "latitude",
            "longitude",
        }

        if not required_columns.issubset(
            reader.fieldnames or []
        ):
            missing = (
                required_columns
                - set(reader.fieldnames or [])
            )

            raise ValueError(
                f"Missing CSV columns: {', '.join(sorted(missing))}"
            )

        for row_number, row in enumerate(
            reader,
            start=2
        ):
            try:
                crime_type = (
                    row["crime_type"]
                    .strip()
                    .lower()
                )

                severity = float(
                    row["severity_weight"]
                )

                reported_date = date.fromisoformat(
                    row["date_reported"].strip()
                )

                time_of_day = parse_time(
                    row.get("time_of_day")
                )

                latitude = float(
                    row["latitude"]
                )

                longitude = float(
                    row["longitude"]
                )

                if not -90 <= latitude <= 90:
                    raise ValueError(
                        "Invalid latitude"
                    )

                if not -180 <= longitude <= 180:
                    raise ValueError(
                        "Invalid longitude"
                    )

                severity = max(
                    0.0,
                    min(1.0, severity)
                )

                records.append(
                    (
                        crime_type,
                        severity,
                        reported_date,
                        time_of_day,
                        latitude,
                        longitude,
                    )
                )

            except (
                KeyError,
                ValueError
            ) as error:

                print(
                    f"Skipping CSV row {row_number}: {error}"
                )

    if not records:
        raise ValueError(
            "No valid crime records found."
        )

    pool = await asyncpg.create_pool(
        DATABASE_URL
    )

    try:
        async with pool.acquire() as conn:
            await insert_records(
                conn,
                records
            )

        print(
            f"Loaded {len(records)} crime records "
            f"from {filepath}"
        )

    finally:
        await pool.close()


async def generate_mock_data(count):
    if count <= 0:
        raise ValueError(
            "Count must be greater than 0."
        )

    pool = await asyncpg.create_pool(
        DATABASE_URL
    )

    records = []

    crime_types = list(
        CRIME_WEIGHTS.keys()
    )

    hotspots = [
        (19.045, 72.836),
        (19.076, 72.877),
        (19.017, 72.849),
        (19.104, 72.870),
        (18.961, 72.820),
    ]

    for _ in range(count):

        crime_type = random.choice(
            crime_types
        )

        severity = (
            CRIME_WEIGHTS[crime_type]
            + random.uniform(-0.1, 0.1)
        )

        severity = max(
            0.1,
            min(1.0, severity)
        )

        if random.random() < 0.6:

            center = random.choice(
                hotspots
            )

            latitude = (
                center[0]
                + random.gauss(0, 0.005)
            )

            longitude = (
                center[1]
                + random.gauss(0, 0.005)
            )

        else:

            latitude = random.uniform(
                *MUMBAI_BOUNDS["lat"]
            )

            longitude = random.uniform(
                *MUMBAI_BOUNDS["lng"]
            )

        if random.random() < 0.65:

            hour = random.choice(
                [20, 21, 22, 23, 0, 1, 2]
            )

        else:

            hour = random.randint(
                6,
                19
            )

        minute = random.randint(
            0,
            59
        )

        time_of_day = time(
            hour,
            minute
        )

        year = random.randint(
            2022,
            2024
        )

        month = random.randint(
            1,
            12
        )

        day = random.randint(
            1,
            28
        )

        records.append(
            (
                crime_type,
                round(severity, 2),
                date(
                    year,
                    month,
                    day
                ),
                time_of_day,
                latitude,
                longitude,
            )
        )

    try:

        async with pool.acquire() as conn:

            await insert_records(
                conn,
                records
            )

        print(
            f"Generated and inserted "
            f"{count} mock crime records"
        )

    finally:

        await pool.close()


def main():

    parser = argparse.ArgumentParser(
        description="SafePath Crime Data Loader"
    )

    parser.add_argument(
        "--csv",
        help="Path to NCRB CSV file"
    )

    parser.add_argument(
        "--mock",
        action="store_true",
        help="Generate synthetic crime data"
    )

    parser.add_argument(
        "--count",
        type=int,
        default=500,
        help="Number of mock records"
    )

    args = parser.parse_args()

    if args.mock:

        asyncio.run(
            generate_mock_data(
                args.count
            )
        )

    elif args.csv:

        asyncio.run(
            load_from_csv(
                args.csv
            )
        )

    else:

        parser.print_help()


if __name__ == "__main__":
    main()