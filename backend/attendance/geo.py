"""
Geofence calculations for attendance verification.

The "certainty zone" model:
    GPS reports BOTH a position AND an accuracy radius. Combined, they
    define a circle of possible locations — the student could be anywhere
    within that circle.

    We compare that circle against the classroom's circle:
      - student's circle entirely OUTSIDE classroom circle → 'outside'
      - student's circle entirely INSIDE classroom circle  → 'inside'
      - circles partially overlap                          → 'uncertain'

    This is more honest than a naive distance check. If a student is
    reported at 200m away with 100m accuracy and the radius is 150m,
    they could be anywhere from 100m to 300m away. We don't know — so
    the rep decides, not the algorithm.
"""
import ipaddress
import math


def haversine_meters(lat1, lng1, lat2, lng2):
    """Great-circle distance between two coordinates, in meters.

    Uses the haversine formula — accurate enough for distances under
    ~100km (which is all attendance verification ever cares about).
    """
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def evaluate_geofence(
    student_lat,
    student_lng,
    student_accuracy,
    classroom_lat,
    classroom_lng,
    radius_meters,
):
    """Return (result, distance_meters).

    `result` is one of:
      'inside'        — definitely within the classroom radius
      'outside'       — definitely outside the classroom radius
      'uncertain'     — could be in or out; needs rep review
      'low_accuracy'  — GPS reading too imprecise to trust (accuracy > 300m)
      'no_gps'        — student's browser gave no coordinates
      'no_geofence'   — classroom has no coordinates configured
    """
    if classroom_lat is None or classroom_lng is None:
        return "no_geofence", None

    if student_lat is None or student_lng is None:
        return "no_gps", None

    # Sanity check — reading this imprecise is worse than no GPS at all,
    # because it looks legitimate but is wrong.
    if student_accuracy is not None and student_accuracy > 300:
        return "low_accuracy", None

    distance = haversine_meters(
        student_lat, student_lng, classroom_lat, classroom_lng,
    )
    accuracy = student_accuracy or 0

    certainty_min = max(0, distance - accuracy)
    certainty_max = distance + accuracy

    if certainty_min > radius_meters:
        return "outside", distance
    if certainty_max <= radius_meters:
        return "inside", distance
    return "uncertain", distance


def get_client_ip(request):
    """Extract the real client IP, honoring X-Forwarded-For from Render.

    Render (and most reverse proxies) prepend the real IP as the first
    value in the X-Forwarded-For header. `REMOTE_ADDR` behind a proxy
    is the proxy's IP, which we don't want.
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def is_campus_ip(ip, campus_networks):
    """True if `ip` falls within any of the configured campus CIDR ranges.

    `campus_networks` is a list of CIDR strings, e.g.
        ["10.0.0.0/8", "192.168.1.0/24"]
    Returns False if `ip` is empty or invalid — the caller treats
    "cannot determine" as "not on campus," which is a soft flag.
    """
    if not ip or not campus_networks:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for cidr in campus_networks:
        try:
            if addr in ipaddress.ip_network(cidr, strict=False):
                return True
        except ValueError:
            continue
    return False