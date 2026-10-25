"""Export air-quality comparisons for the website -> web/public/data/air.json.

CAMS data via Open-Meteo joins several model products (2013–2022 reanalysis, later
analyses and forecasts), so year-to-year levels jump. Only comparisons that are
robust to that are exported: long-term means per city and the typical year by month.

Run:  uv run python scripts/fetch_all_cities.py --air   (once; cached in data/raw/air/)
      uv run python scripts/export_air.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pogoda  # noqa: E402

OUT = pogoda.PROJECT_ROOT / "web" / "public" / "data" / "air.json"
WHO_PM25_DAY = 15.0  # WHO 2021 guideline, 24-hour mean, µg/m³
WHO_PM10_DAY = 45.0


def r1(v: float) -> float:
    return round(float(v), 1)


def main() -> None:
    cities = {}
    for city in pogoda.ALL_CITIES:
        df = pd.read_csv(pogoda.air_path(city), parse_dates=["date"])
        years = df["date"].dt.year.nunique()
        month = df.groupby(df["date"].dt.month)
        winter = df[df["date"].dt.month.isin([12, 1, 2])]
        summer = df[df["date"].dt.month.isin([6, 7, 8])]
        cities[pogoda.slug(city)] = {
            "mean": {k: r1(df[k].mean()) for k in ("pm25", "pm10", "no2", "o3")},
            "months": {k: [r1(v) for v in month[k].mean()] for k in ("pm25", "pm10", "no2", "o3")},
            "whoDays": {"pm25": r1((df["pm25"] > WHO_PM25_DAY).sum() / years), "pm10": r1((df["pm10"] > WHO_PM10_DAY).sum() / years)},
            "season": {"winter": r1(winter["pm25"].mean()), "summer": r1(summer["pm25"].mean())},
        }
        print(f"{city:20s} PM2.5 {cities[pogoda.slug(city)]['mean']['pm25']}")
    period = [int(pogoda.AIR_START[:4]), int(pogoda.AIR_END[:4])]
    OUT.write_text(json.dumps({"period": period, "who": {"pm25": WHO_PM25_DAY, "pm10": WHO_PM10_DAY}, "cities": cities}, separators=(",", ":")))
    print(f"zapisano {OUT} ({OUT.stat().st_size / 1e3:.1f} kB)")


if __name__ == "__main__":
    main()
