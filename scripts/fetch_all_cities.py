"""Download 1951–2025 daily data for all 18 voivodeship capitals (cached).

Run:  uv run python scripts/fetch_all_cities.py
Long requests count as many API calls on Open-Meteo's free tier, so this may
pause on rate limits; it is safe to stop and re-run (finished cities are cached).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pogoda  # noqa: E402

if __name__ == "__main__":
    pogoda.fetch_all(cities=pogoda.ALL_CITIES)
