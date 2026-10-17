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

CITIES = {
    "Warszawa": (52.23, 21.01),
    "Kraków": (50.06, 19.94),
    "Gdańsk": (54.35, 18.65),
    "Wrocław": (51.11, 17.03),
    "Poznań": (52.41, 16.93),
}

API_URL = "https://archive-api.open-meteo.com/v1/archive"
DAILY_VARS = [
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "precipitation_sum",
    "snowfall_sum",
]
# Shorter column names used everywhere after loading.
RENAME = {
    "time": "date",
    "temperature_2m_max": "tmax",
    "temperature_2m_min": "tmin",
    "temperature_2m_mean": "tmean",
    "precipitation_sum": "precip",
    "snowfall_sum": "snow",
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
    return city.translate(table).lower()


def raw_path(city: str) -> Path:
    return RAW_DIR / f"{slug(city)}.csv"


def fetch_city(city: str, force: bool = False) -> Path:
    """Download daily data for one city, unless the CSV is already cached."""
    path = raw_path(city)
    if path.exists() and not force:
        return path

    lat, lon = CITIES[city]
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": START_DATE,
        "end_date": END_DATE,
        "daily": ",".join(DAILY_VARS),
        "timezone": "Europe/Warsaw",
    }
    for attempt in range(4):
        resp = requests.get(API_URL, params=params, timeout=120)
        if resp.status_code == 429:  # rate limited: wait and retry
            time.sleep(30 * (attempt + 1))
            continue
        resp.raise_for_status()
        break
    else:
        raise RuntimeError(f"Open-Meteo kept rate-limiting the request for {city}")

    daily = pd.DataFrame(resp.json()["daily"])
    path.parent.mkdir(parents=True, exist_ok=True)
    daily.to_csv(path, index=False)
    return path


def fetch_all(force: bool = False) -> list[Path]:
    paths = []
    for city in CITIES:
        cached = raw_path(city).exists() and not force
        paths.append(fetch_city(city, force=force))
        print(f"{city:10s} {'(z cache)' if cached else '(pobrano)'} -> {paths[-1].name}")
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
