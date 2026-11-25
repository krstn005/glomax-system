"""
Roof assessment engine for Glomax.

This file does the real roof assessment. It does NOT use fixed packages.
It takes what the Partner Installer measures on site and works out the
result step by step:

  1. Roof area      - from the roof outline points drawn on the map
  2. Usable area    - roof area minus space for walkways, vents and edges
  3. Panels that fit
  4. Sunlight hours - for the exact location (NASA POWER solar data)
  5. Energy per kW  - sunlight x system losses x roof direction x
                      shading x roof tilt
  6. Size needed    - from the customer's monthly electric bill
  7. Package        - the best package size that fits the roof
  8. Yearly energy, monthly savings and payback years
  9. Suitability score (0 to 100) and rating

Every step is saved in a list ("steps") so the Partner Installer, Staff,
and the panel can see exactly how the result was made.

The numbers below are common rules of thumb for solar in the Philippines.
Change them here if the company uses other values.
"""
import logging
import math

import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


class RoofEngineError(ValueError):
    """Raised when the site data is not good enough to make a result."""


# ---------- Settings (rules of thumb) ----------

EARTH_RADIUS_M = 6371008.8

PANEL_WATT = 550            # one solar panel, in watts
PANEL_AREA_SQM = 2.6        # size of one panel
SPACING_FACTOR = 1.10       # extra space between panels (10%)
PERFORMANCE_RATIO = 0.78    # system losses: heat, wiring, inverter, dust
DEFAULT_SUN_HOURS = 4.5     # used only if the solar data can't be reached
BASE_USABLE_RATIO = 0.75    # share of the roof that can hold panels
DAYS_PER_MONTH = 30.4
BEST_TILT_DEGREES = 12      # good tilt for the Philippines

# Pesos per kWh. Can be changed with ROOF_ELECTRICITY_RATE in settings.
DEFAULT_ELECTRICITY_RATE = 12.0

# The package sizes the company sells
PACKAGE_SIZES = (3, 6, 8, 10)

# Same package prices as the New Request page
PACKAGE_PRICES = {
    ('ON_GRID', 3): 106000,
    ('ON_GRID', 6): 155000,
    ('ON_GRID', 8): 205000,
    ('ON_GRID', 10): 245000,
    ('HYBRID', 3): 215000,
    ('HYBRID', 6): 260000,
    ('HYBRID', 8): 335000,
    ('HYBRID', 10): 375000,
}

# A roof in poor condition has less space that is safe for panels
CONDITION_USABLE = {'GOOD': 1.0, 'FAIR': 0.9, 'POOR': 0.7}

# Which way the roof faces. South is best in the Philippines.
DIRECTION_FACTORS = {
    'S': 1.00, 'SE': 0.96, 'SW': 0.96,
    'E': 0.90, 'W': 0.90,
    'NE': 0.82, 'NW': 0.82,
    'N': 0.74,
    'FLAT': 0.93,
}
DIRECTION_LABELS = {
    'S': 'South', 'SE': 'South-East', 'SW': 'South-West',
    'E': 'East', 'W': 'West',
    'NE': 'North-East', 'NW': 'North-West',
    'N': 'North', 'FLAT': 'Flat roof',
}

# How much shade falls on the roof
SHADING_FACTORS = {'NONE': 1.0, 'LIGHT': 0.92, 'MODERATE': 0.80, 'HEAVY': 0.65}
SHADING_LABELS = {
    'NONE': 'No shade', 'LIGHT': 'Light shade',
    'MODERATE': 'Moderate shade', 'HEAVY': 'Heavy shade',
}

NASA_POWER_URL = 'https://power.larc.nasa.gov/api/temporal/climatology/point'

# The Philippines, with a little extra room. Used to reject fake pins.
PH_LAT_RANGE = (4.0, 22.0)
PH_LNG_RANGE = (116.0, 127.5)


# ---------- Small helpers ----------

def haversine_m(lat1, lng1, lat2, lng2):
    """Distance in meters between two points on the map."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    d_lat = p2 - p1
    d_lng = math.radians(lng2 - lng1)
    a = math.sin(d_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(d_lng / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def clean_outline(points):
    """Checks the roof outline and returns it as a list of (lat, lng)."""
    if not isinstance(points, (list, tuple)) or len(points) < 3:
        raise RoofEngineError('Draw the roof outline with at least 3 corners.')
    if len(points) > 40:
        raise RoofEngineError('The roof outline has too many corners (40 at most).')

    cleaned = []
    for point in points:
        try:
            lat, lng = float(point[0]), float(point[1])
        except (TypeError, ValueError, IndexError, KeyError):
            raise RoofEngineError('The roof outline has a corner that is not valid.')
        if not (PH_LAT_RANGE[0] <= lat <= PH_LAT_RANGE[1] and PH_LNG_RANGE[0] <= lng <= PH_LNG_RANGE[1]):
            raise RoofEngineError('The roof outline is outside the Philippines.')
        cleaned.append((lat, lng))
    return cleaned


def polygon_area_sqm(points):
    """Flat area (plan view) of the outline, in square meters."""
    lat0 = sum(p[0] for p in points) / len(points)
    kx = math.radians(1) * EARTH_RADIUS_M * math.cos(math.radians(lat0))
    ky = math.radians(1) * EARTH_RADIUS_M
    xy = [(lng * kx, lat * ky) for lat, lng in points]

    total = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        total += x1 * y2 - x2 * y1
    return abs(total) / 2


def get_sun_hours(lat, lng):
    """
    Peak sun hours per day for this place (kWh per square meter per day),
    from NASA POWER. Returns (hours, source). The answer is kept for 30
    days for places close to each other, so it is not asked again and
    again. If NASA can't be reached, a normal Philippine value is used and
    the source says so.
    """
    key = f"nasa_sun_hours_{round(lat, 1)}_{round(lng, 1)}"
    cached = cache.get(key)
    if cached:
        return cached, 'NASA POWER'

    try:
        response = requests.get(
            NASA_POWER_URL,
            params={
                'parameters': 'ALLSKY_SFC_SW_DWN',
                'community': 'RE',
                'longitude': round(lng, 3),
                'latitude': round(lat, 3),
                'format': 'JSON',
            },
            timeout=6,
        )
        response.raise_for_status()
        value = float(response.json()['properties']['parameter']['ALLSKY_SFC_SW_DWN']['ANN'])
        if value > 0:
            value = round(value, 2)
            cache.set(key, value, 60 * 60 * 24 * 30)
            return value, 'NASA POWER'
    except Exception:
        logger.warning('Could not get sun hours from NASA POWER, using the default value.', exc_info=True)

    return DEFAULT_SUN_HOURS, 'Default value (solar data service not reachable)'


def panels_for(kw):
    return math.ceil(kw * 1000 / PANEL_WATT)


def tilt_factor(tilt):
    """Best near BEST_TILT_DEGREES. Steeper or flatter roofs lose a little."""
    return max(0.85, 1 - 0.003 * abs(tilt - BEST_TILT_DEGREES))


def round2(value):
    return None if value is None else round(float(value), 2)


# ---------- The assessment ----------

def assess_roof(outline, tilt_degrees, direction, shading, roof_condition,
                monthly_bill=None, system_type='ON_GRID'):
    """
    Makes the full roof assessment. Returns a dictionary that is safe to
    save as JSON. Raises RoofEngineError if the site data is not valid.
    """
    points = clean_outline(outline)

    try:
        tilt = float(tilt_degrees)
    except (TypeError, ValueError):
        raise RoofEngineError('Enter the roof tilt in degrees.')
    if not 0 <= tilt <= 60:
        raise RoofEngineError('The roof tilt must be from 0 to 60 degrees.')

    if direction not in DIRECTION_FACTORS:
        raise RoofEngineError('Pick the direction the roof faces.')
    if shading not in SHADING_FACTORS:
        raise RoofEngineError('Pick how much shade the roof gets.')
    condition = roof_condition if roof_condition in CONDITION_USABLE else 'GOOD'
    system = system_type if system_type in ('ON_GRID', 'HYBRID') else 'ON_GRID'

    bill = None
    if monthly_bill not in (None, ''):
        try:
            bill = float(monthly_bill)
        except (TypeError, ValueError):
            raise RoofEngineError('The monthly electric bill is not a valid number.')
        if bill < 0:
            raise RoofEngineError('The monthly electric bill can not be negative.')
        if bill == 0:
            bill = None

    rate = float(getattr(settings, 'ROOF_ELECTRICITY_RATE', DEFAULT_ELECTRICITY_RATE))
    steps = []

    # 1. Roof area. The outline is a view from above, so a sloped roof
    # is bigger than its outline.
    plan_area = polygon_area_sqm(points)
    if plan_area < 10:
        raise RoofEngineError('The roof outline is too small. Draw the whole roof.')
    if plan_area > 5000:
        raise RoofEngineError('The roof outline is too large. Please draw the roof again.')
    roof_area = plan_area / math.cos(math.radians(tilt))
    steps.append({
        'key': 'roof_area',
        'label': 'Roof area',
        'value': f'{roof_area:.1f} sq.m',
        'note': f'Outline area {plan_area:.1f} sq.m, corrected for the {tilt:.0f} degree slope.',
    })

    # 2. Usable area
    usable_ratio = BASE_USABLE_RATIO * CONDITION_USABLE[condition]
    usable_area = roof_area * usable_ratio
    steps.append({
        'key': 'usable_area',
        'label': 'Usable area for panels',
        'value': f'{usable_area:.1f} sq.m',
        'note': f'{usable_ratio * 100:.0f}% of the roof is kept for panels. The rest is for walkways, vents and edges.',
    })

    # 3. Panels that fit
    max_panels = int(usable_area // (PANEL_AREA_SQM * SPACING_FACTOR))
    capacity_kw = max_panels * PANEL_WATT / 1000
    steps.append({
        'key': 'max_panels',
        'label': 'Panels that fit',
        'value': f'{max_panels} panels ({capacity_kw:.2f} kW)',
        'note': f'One {PANEL_WATT} W panel needs about {PANEL_AREA_SQM * SPACING_FACTOR:.1f} sq.m with spacing.',
    })

    # 4. Sunlight
    center_lat = sum(p[0] for p in points) / len(points)
    center_lng = sum(p[1] for p in points) / len(points)
    sun_hours, sun_source = get_sun_hours(center_lat, center_lng)
    steps.append({
        'key': 'sun_hours',
        'label': 'Sunlight at this location',
        'value': f'{sun_hours} hours per day',
        'note': f'Source: {sun_source}.',
    })

    # 5. Energy from each installed kW per day
    f_direction = DIRECTION_FACTORS[direction]
    f_shading = SHADING_FACTORS[shading]
    f_tilt = tilt_factor(tilt)
    yield_per_kw_day = sun_hours * PERFORMANCE_RATIO * f_direction * f_shading * f_tilt
    steps.append({
        'key': 'yield',
        'label': 'Energy from each 1 kW per day',
        'value': f'{yield_per_kw_day:.2f} kWh',
        'note': (
            f'{sun_hours} sun hours x {PERFORMANCE_RATIO} system efficiency x '
            f'{f_direction} ({DIRECTION_LABELS[direction]}) x {f_shading} ({SHADING_LABELS[shading]}) x '
            f'{f_tilt:.2f} (tilt).'
        ),
    })

    # 6. Size needed from the electric bill
    monthly_kwh = needed_kw = None
    if bill:
        monthly_kwh = bill / rate
        needed_kw = (monthly_kwh / DAYS_PER_MONTH) / yield_per_kw_day
        steps.append({
            'key': 'needed',
            'label': 'System size the customer needs',
            'value': f'{needed_kw:.2f} kW',
            'note': f'Bill of {bill:,.0f} pesos at {rate:.0f} pesos per kWh is about {monthly_kwh:.0f} kWh a month.',
        })
    else:
        steps.append({
            'key': 'needed',
            'label': 'System size the customer needs',
            'value': 'Not computed',
            'note': 'No monthly electric bill was given, so the biggest package that fits the roof is suggested.',
        })

    # 7. Package that fits
    fitting = [s for s in PACKAGE_SIZES if panels_for(s) <= max_panels]
    package_kw = None
    if fitting:
        target = min(needed_kw, capacity_kw) if needed_kw else capacity_kw
        bigger = [s for s in fitting if s >= target]
        package_kw = min(bigger) if bigger else max(fitting)
        steps.append({
            'key': 'package',
            'label': 'Recommended package',
            'value': f'{package_kw}KW',
            'note': 'Smallest package that covers the need and still fits the roof.' if bigger
                    else 'The roof is smaller than the need, so the biggest package that fits is suggested.',
        })
    else:
        steps.append({
            'key': 'package',
            'label': 'Recommended package',
            'value': 'No package fits',
            'note': f'The roof holds only {max_panels} panels. The smallest package (3KW) needs {panels_for(3)}.',
        })

    # 8. Energy, savings, payback
    annual_kwh = monthly_savings = payback_years = price = None
    if package_kw:
        annual_kwh = package_kw * yield_per_kw_day * 365
        steps.append({
            'key': 'annual',
            'label': 'Energy made per year',
            'value': f'{annual_kwh:,.0f} kWh',
            'note': f'{package_kw} kW x {yield_per_kw_day:.2f} kWh x 365 days.',
        })
        price = PACKAGE_PRICES.get((system, package_kw))
        if monthly_kwh:
            made_per_month = package_kw * yield_per_kw_day * DAYS_PER_MONTH
            used_from_solar = min(made_per_month, monthly_kwh)
            monthly_savings = used_from_solar * rate
            steps.append({
                'key': 'savings',
                'label': 'Estimated savings per month',
                'value': f'{monthly_savings:,.0f} pesos',
                'note': f'{used_from_solar:.0f} kWh of the customer\'s use is covered by solar.',
            })
            if price and monthly_savings > 0:
                payback_years = price / (monthly_savings * 12)
                steps.append({
                    'key': 'payback',
                    'label': 'Payback time',
                    'value': f'{payback_years:.1f} years',
                    'note': f'Package price {price:,.0f} pesos divided by yearly savings.',
                })

    # 9. Suitability score
    if needed_kw:
        area_score = 35 * min(1.0, capacity_kw / needed_kw)
    else:
        area_score = 35 * min(1.0, capacity_kw / PACKAGE_SIZES[0])
    direction_score = 20 * (f_direction - 0.74) / (1.0 - 0.74)
    shading_score = 20 * (f_shading - 0.65) / (1.0 - 0.65)
    condition_score = {'GOOD': 15, 'FAIR': 10, 'POOR': 3}[condition]
    tilt_score = 10 * (f_tilt - 0.85) / (1.0 - 0.85)
    score = round(max(0, min(100, area_score + direction_score + shading_score + condition_score + tilt_score)))

    if package_kw is None:
        score = min(score, 40)
    if score >= 75:
        rating, rating_text = 'HIGH', 'Highly suitable'
    elif score >= 50:
        rating, rating_text = 'MODERATE', 'Suitable with limits'
    else:
        rating, rating_text = 'LOW', 'Low suitability'

    steps.append({
        'key': 'score',
        'label': 'Suitability score',
        'value': f'{score} / 100 ({rating_text})',
        'note': (
            f'Roof space {area_score:.0f}/35, direction {direction_score:.0f}/20, '
            f'shade {shading_score:.0f}/20, roof condition {condition_score}/15, tilt {tilt_score:.0f}/10.'
        ),
    })

    return {
        'center_latitude': round(center_lat, 6),
        'center_longitude': round(center_lng, 6),
        'roof_area_sqm': round2(roof_area),
        'usable_area_sqm': round2(usable_area),
        'max_panels': max_panels,
        'max_capacity_kw': round2(capacity_kw),
        'sun_hours': sun_hours,
        'sun_hours_source': sun_source,
        'yield_per_kw_day': round2(yield_per_kw_day),
        'monthly_kwh_use': round2(monthly_kwh),
        'needed_kw': round2(needed_kw),
        'recommended_package_kw': package_kw,
        'system_type': system,
        'panels': panels_for(package_kw) if package_kw else None,
        'package_price': price,
        'annual_kwh': round2(annual_kwh),
        'monthly_savings': round2(monthly_savings),
        'payback_years': round2(payback_years),
        'suitability_score': score,
        'suitability_rating': rating,
        'suitability_text': rating_text,
        'steps': steps,
    }