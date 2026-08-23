from datetime import datetime


def get_temporal_weights():

    hour = datetime.now().hour

    if 6 <= hour < 18:
        return {
            "crime": 0.50,
            "lighting": 0.15,
            "isolation": 0.15,
            "hazards": 0.20
        }

    if 18 <= hour < 22:
        return {
            "crime": 0.40,
            "lighting": 0.25,
            "isolation": 0.20,
            "hazards": 0.15
        }

    return {
        "crime": 0.25,
        "lighting": 0.35,
        "isolation": 0.30,
        "hazards": 0.10
    }


def calculate_safety_score(
    crime_risk,
    is_lit,
    isolation,
    hazard_risk
):

    weights = get_temporal_weights()

    lighting_risk = 0.0 if is_lit else 1.0

    score = (
        weights["crime"] * crime_risk
        + weights["lighting"] * lighting_risk
        + weights["isolation"] * isolation
        + weights["hazards"] * hazard_risk
    )

    safety_score = 10 * (1 - score)

    return round(
        max(0.0, min(10.0, safety_score)),
        2
    )

    