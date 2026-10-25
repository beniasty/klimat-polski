"""Shared helpers for the Polish weather analysis.

Used by both the notebook (notebooks/analiza.ipynb) and the report script
(scripts/build_report.py), so that both compute exactly the same numbers.
"""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"

START_DATE = "1951-01-01"
END_DATE = "2025-12-31"

# Reference period used by climatologists (WMO "old normal").
BASELINE = (1961, 1990)

# All 18 voivodeship capitals (two voivodeships have two seats each).
ALL_CITIES = {
    "Warszawa": (52.23, 21.01),
    "Kraków": (50.06, 19.94),
    "Gdańsk": (54.35, 18.65),
    "Wrocław": (51.11, 17.03),
    "Poznań": (52.41, 16.93),
    "Łódź": (51.76, 19.46),
    "Szczecin": (53.43, 14.55),
    "Bydgoszcz": (53.12, 18.01),
    "Toruń": (53.01, 18.60),
    "Lublin": (51.25, 22.57),
    "Białystok": (53.13, 23.16),
    "Katowice": (50.26, 19.02),
    "Kielce": (50.87, 20.63),
    "Rzeszów": (50.04, 22.00),
    "Olsztyn": (53.78, 20.49),
    "Opole": (50.67, 17.93),
    "Zielona Góra": (51.94, 15.51),
    "Gorzów Wielkopolski": (52.73, 15.24),
}

# The five cities analysed in the notebook and the static report.
CITIES = {c: ALL_CITIES[c] for c in ["Warszawa", "Kraków", "Gdańsk", "Wrocław", "Poznań"]}

API_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "precipitation_sum",
    "snowfall_sum",
]
# Added later; cached separately in data/raw/extra/ so the original CSVs stay untouched.
EXTRA_VARS = [
    "et0_fao_evapotranspiration",  # reference evapotranspiration, mm
    "sunshine_duration",  # seconds per day
]
# Shorter column names used everywhere after loading.
RENAME = {
    "time": "date",
    "temperature_2m_max": "tmax",
    "temperature_2m_min": "tmin",
    "temperature_2m_mean": "tmean",
    "precipitation_sum": "precip",
    "snowfall_sum": "snow",
    "et0_fao_evapotranspiration": "et0",
    "sunshine_duration": "sun",
}

# Thresholds (IMGW-style definitions).
HOT_DAY = 30.0  # tmax >= 30 °C  -> "dzień upalny"
ICE_DAY = 0.0  # tmax < 0 °C    -> "dzień mroźny"
COLD_NIGHT = -10.0  # tmin <= -10 °C -> "bardzo mroźna noc"
SNOW_DAY = 1.0  # snowfall >= 1 cm
WINTER_T = 0.0  # smoothed tmean < 0 °C  -> thermal winter
SUMMER_T = 15.0  # smoothed tmean > 15 °C -> thermal summer


def slug(city: str) -> str:
    """'Gdańsk' -> 'gdansk' (ASCII file name)."""
    table = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
    return city.translate(table).lower().replace(" ", "-")


def raw_path(city: str) -> Path:
    return RAW_DIR / f"{slug(city)}.csv"


def download_daily(lat: float, lon: float, start: str, end: str, variables: list[str] | None = None) -> pd.DataFrame:
    """One request to the archive API, retrying when rate-limited."""
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start,
        "end_date": end,
        "daily": ",".join(variables or DAILY_VARS),
        "timezone": "Europe/Warsaw",
    }
    for attempt in range(200):
        try:
            resp = requests.get(API_URL, params=params, timeout=180)
        except requests.RequestException as e:  # network hiccup: wait and retry
            print(f"  błąd sieci ({type(e).__name__}), ponawiam za minutę", flush=True)
            time.sleep(60)
            continue
        if resp.status_code == 429:  # rate limited: wait for the limit window to reset
            try:
                reason = resp.json().get("reason", "")
            except ValueError:
                reason = resp.text
            wait = 600 if "Hourly" in reason else 1800 if "Daily" in reason else 65
            print(f"  limit API ({reason[:40]}...), czekam {wait // 60} min", flush=True)
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return pd.DataFrame(resp.json()["daily"])
    raise RuntimeError("Open-Meteo kept rate-limiting the request")


def fetch_city(city: str, force: bool = False) -> Path:
    """Download 1951–2025 daily data for one city, unless the CSV is already cached."""
    path = raw_path(city)
    if path.exists() and not force:
        return path
    lat, lon = ALL_CITIES[city]
    daily = download_daily(lat, lon, START_DATE, END_DATE)
    path.parent.mkdir(parents=True, exist_ok=True)
    daily.to_csv(path, index=False)
    return path


def extra_path(city: str) -> Path:
    return RAW_DIR / "extra" / f"{slug(city)}.csv"


def fetch_extra(city: str, force: bool = False) -> Path:
    """Download 1951–2025 EXTRA_VARS for one city, unless already cached."""
    path = extra_path(city)
    if path.exists() and not force:
        return path
    lat, lon = ALL_CITIES[city]
    daily = download_daily(lat, lon, START_DATE, END_DATE, EXTRA_VARS)
    path.parent.mkdir(parents=True, exist_ok=True)
    daily.to_csv(path, index=False)
    return path


def fetch_all(force: bool = False, cities: dict | None = None) -> list[Path]:
    paths = []
    for city in cities or CITIES:
        cached = raw_path(city).exists() and not force
        paths.append(fetch_city(city, force=force))
        print(f"{city:20s} {'(z cache)' if cached else '(pobrano)'} -> {paths[-1].name}")
        if not cached:
            time.sleep(2)  # be polite to the free API
    return paths


def load_raw() -> pd.DataFrame:
    """Read all cached CSVs into one long table with a `city` column."""
    frames = []
    for city in CITIES:
        df = pd.read_csv(raw_path(city), parse_dates=["time"])
        df.insert(0, "city", city)
        frames.append(df)
    return pd.concat(frames, ignore_index=True).rename(columns=RENAME)


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Sort, drop duplicates, add helper date columns.

    Missing values (rare in reanalysis data) are left as NaN; pandas skips
    them in means and sums.
    """
    df = df.drop_duplicates(["city", "date"]).sort_values(["city", "date"]).copy()
    df["city"] = pd.Categorical(df["city"], categories=list(CITIES), ordered=True)
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month
    # Winter season "2024" = July 2023 ... June 2024 (named after its January).
    df["season"] = np.where(df["month"] >= 7, df["year"] + 1, df["year"])
    return df.reset_index(drop=True)


def yearly(df: pd.DataFrame) -> pd.DataFrame:
    """One row per city and calendar year with the main indicators."""
    g = df.groupby(["city", "year"], observed=True)
    out = pd.DataFrame(
        {
            "tmean": g["tmean"].mean(),
            "tmax_mean": g["tmax"].mean(),
            "tmin_mean": g["tmin"].mean(),
            "precip": g["precip"].sum(),
            "hot_days": g["tmax"].apply(lambda s: (s >= HOT_DAY).sum()),
            "ice_days": g["tmax"].apply(lambda s: (s < ICE_DAY).sum()),
            "cold_nights": g["tmin"].apply(lambda s: (s <= COLD_NIGHT).sum()),
            "snow_days": g["snow"].apply(lambda s: (s >= SNOW_DAY).sum()),
        }
    ).reset_index()
    base = out[out["year"].between(*BASELINE)].groupby("city", observed=True)["tmean"].mean()
    out["anomaly"] = out["tmean"] - out["city"].map(base).astype(float)
    return out


def seasons(df: pd.DataFrame) -> pd.DataFrame:
    """Length of thermal winter and summer.

    Daily mean temperature is smoothed with a centred 7-day rolling mean
    (single warm/cold days would otherwise break the count), then we count
    days below 0 °C in each winter season and above 15 °C in each year.
    """
    df = df.copy()
    df["tsmooth"] = df.groupby("city", observed=True)["tmean"].transform(
        lambda s: s.rolling(7, center=True, min_periods=4).mean()
    )
    winter = (
        df.assign(w=df["tsmooth"] < WINTER_T)
        .groupby(["city", "season"], observed=True)["w"]
        .sum()
        .rename("winter_days")
    )
    summer = (
        df.assign(s=df["tsmooth"] > SUMMER_T)
        .groupby(["city", "year"], observed=True)["s"]
        .sum()
        .rename("summer_days")
    )
    first, last = int(df["year"].min()), int(df["year"].max())
    # Seasons are complete only from first+1 (Jul first .. Jun first+1) to last.
    winter = winter.reset_index().query("@first < season <= @last")
    summer = summer.reset_index()
    return winter.merge(summer, left_on=["city", "season"], right_on=["city", "year"]).drop(
        columns="year"
    ).rename(columns={"season": "year"})


def trend_per_decade(years: pd.Series, values: pd.Series) -> float:
    """Slope of a least-squares line, expressed per 10 years."""
    mask = values.notna()
    slope, _ = np.polyfit(years[mask].astype(float), values[mask].astype(float), 1)
    return float(slope * 10)


def trends(table: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Trend per decade for each city and each column."""
    rows = {}
    for city, grp in table.groupby("city", observed=True):
        rows[city] = {c: trend_per_decade(grp["year"], grp[c]) for c in columns}
    return pd.DataFrame(rows).T


def decade_means(table: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    """Average of each column per decade (1951–1960 → '1951–60', ...)."""
    t = table.copy()
    start = (t["year"] - 1) // 10 * 10 + 1
    t["decade"] = start.astype(str) + "–" + ((start + 9) % 100).astype(str).str.zfill(2)
    return t.groupby(["decade", "city"], observed=True)[columns].mean().reset_index()
