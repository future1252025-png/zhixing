from math import asin, ceil, cos, radians, sin, sqrt


EARTH_RADIUS_METERS = 6_371_000
DEFAULT_WALK_SPEED_M_PER_MIN = 80


def haversine_distance_meters(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> int:
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    )
    distance = 2 * EARTH_RADIUS_METERS * asin(sqrt(a))
    return int(round(distance))


def estimate_walk_minutes(
    distance_meters: int,
    speed_m_per_min: int = DEFAULT_WALK_SPEED_M_PER_MIN,
) -> int:
    if distance_meters <= 0:
        return 0
    return ceil(distance_meters / speed_m_per_min)
