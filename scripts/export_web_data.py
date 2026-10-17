"""Export data for the website (web/public/data/).

- daily/<id>.json : compact daily series per city (values x10 as integers)
- meta.json       : city list, Poland outline as an SVG path, date range

Run:  uv run python scripts/export_web_data.py [--refresh-recent] [--no-recent]
Then: cd web && npm run summary   (computes summary.json with the site's own code)
"""

from __future__ import annotations

import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pogoda  # noqa: E402

OUT = pogoda.PROJECT_ROOT / "web" / "public" / "data"
RECENT_DIR = pogoda.RAW_DIR / "recent"
GEO_FILE = pogoda.RAW_DIR / "geo" / "ne_50m_admin_0_countries.geojson"
FIELDS = ["tmax", "tmin", "tmean", "precip", "snow"]

# Map projection: equirectangular, x scaled by cos(52°) so Poland keeps its shape.
LAT0 = 52.0
SCALE = 100.0  # SVG units per degree of latitude


def project(lon: float, lat: float, origin: tuple[float, float]) -> tuple[float, float]:
    lon_min, lat_max = origin
    return ((lon - lon_min) * math.cos(math.radians(LAT0)) * SCALE, (lat_max - lat) * SCALE)


def fetch_recent(city: str, refresh: bool, skip: bool = False) -> pd.DataFrame:
    """Daily data from 2026-01-01 up to the newest day the archive has."""
    path = RECENT_DIR / f"{pogoda.slug(city)}.csv"
    if skip and not path.exists():
        return pd.DataFrame(columns=["time"])
    if refresh or not path.exists():
        lat, lon = pogoda.ALL_CITIES[city]
        end = (date.today() - timedelta(days=1)).isoformat()
        df = pogoda.download_daily(lat, lon, "2026-01-01", end)
        df = df.dropna(subset=["temperature_2m_mean"])  # newest days are not published yet
        path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(path, index=False)
    return pd.read_csv(path)


def encode(series: pd.Series) -> list[int | None]:
    return [None if pd.isna(v) else int(round(v * 10)) for v in series]


def poland_outline() -> list[list[tuple[float, float]]]:
    geo = json.loads(GEO_FILE.read_text(encoding="utf-8"))
    feat = next(f for f in geo["features"] if f["properties"]["ADMIN"] == "Poland")
    g = feat["geometry"]
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    return [ring for poly in polys for ring in poly[:1]]  # outer rings only


def main(refresh: bool, no_recent: bool = False) -> None:
    (OUT / "daily").mkdir(parents=True, exist_ok=True)

    rings = poland_outline()
    lons = [p[0] for r in rings for p in r]
    lats = [p[1] for r in rings for p in r]
    origin = (min(lons) - 0.15, max(lats) + 0.15)
    w, h = project(max(lons) + 0.15, min(lats) - 0.15, origin)
    path = " ".join(
        "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in (project(lo, la, origin) for lo, la in r)) + " Z"
        for r in rings
    )

    cities, last_dates = [], []
    for city, (lat, lon) in pogoda.ALL_CITIES.items():
        if not pogoda.raw_path(city).exists():
            print(f"{city:20s} POMINIĘTO: brak data/raw (uruchom scripts/fetch_all_cities.py)")
            continue
        base = pd.read_csv(pogoda.raw_path(city))
        recent = fetch_recent(city, refresh, skip=no_recent)
        df = pd.concat([base, recent]).drop_duplicates("time").sort_values("time")
        df = df.rename(columns=pogoda.RENAME)
        dates = pd.to_datetime(df["date"])
        expected = pd.date_range(dates.iloc[0], dates.iloc[-1], freq="D")
        assert len(expected) == len(df), f"{city}: gaps in the daily series"
        cid = pogoda.slug(city)
        payload = {"id": cid, "start": df["date"].iloc[0], **{f: encode(df[f]) for f in FIELDS}}
        (OUT / "daily" / f"{cid}.json").write_text(json.dumps(payload, separators=(",", ":")))
        x, y = project(lon, lat, origin)
        cities.append({"id": cid, "name": city, "lat": lat, "lon": lon, "x": round(x, 1), "y": round(y, 1)})
        last_dates.append(df["date"].iloc[-1])
        print(f"{city:20s} {len(df):6d} dni, do {df['date'].iloc[-1]}")

    meta = {
        "generated": date.today().isoformat(),
        "firstDate": pogoda.START_DATE,
        "lastDate": min(last_dates),
        "fullYears": [1951, 2025],
        "baseline": list(pogoda.BASELINE),
        "cities": cities,
        "map": {"width": round(w, 1), "height": round(h, 1), "path": path},
    }
    (OUT / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.rglob("*.json")) / 1e6
    print(f"zapisano {OUT} ({size:.1f} MB)")


if __name__ == "__main__":
    main(refresh="--refresh-recent" in sys.argv, no_recent="--no-recent" in sys.argv)
