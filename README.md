# Poland’s Climate 1951–2025 · Klimat Polski

How has the climate changed in Poland’s regional capitals over the last 75 years?
An interactive website plus a step-by-step data analysis in Python.

**Live site:** https://beniasty.github.io/klimat-polski/ (Polish / English)

Key findings (mean of the cities, 2016–2025 vs the 1961–1990 normal):

- the mean annual temperature rose by about **2 °C** (about +0.34 °C per decade, faster since 1981),
- hot days (≥ 30 °C) went from about 1 to 8 a year; ice days (below 0 °C all day) fell from about 41 to 17,
- thermal winter shrank by roughly half; spring starts about two weeks earlier,
- annual precipitation shows no clear trend, but there is less snow.

## What the website offers

| Tab | What you can do |
|---|---|
| Overview | Warming stripes for Poland or any city, key changes, warming map |
| Explorer | Up to 5 cities, 25 measures, any year range, season or month, custom thresholds, trend lines, table and CSV |
| Map & ranking | All cities on a map, coloured by change, trend or mean; sortable ranking |
| Compare periods | Two periods side by side: temperature distribution and the year day by day |
| Nature calendar | Start of spring and summer, last and first frosts, frost-free period, growing season |
| Records | Hottest, coldest and wettest days, warmest and coldest years, month × year heat map |
| Your day | The weather on any date since 1951 and how the climate changed since you were born |
| About | Data sources and method |

Every view is stored in the URL, so links can be shared. Light and dark themes, works on phones.

## Repository layout

| Path | Contents |
|---|---|
| `web/` | Website: Vite + React + TypeScript, Plotly charts, Vitest tests |
| `web/src/lib/metrics.ts` | All climate indicators (tested in `metrics.test.ts`) |
| `web/scripts/build-summary.ts` | Pre-computes `summary.json` with the same code the browser uses |
| `web/public/data/` | Data served by the site (daily series per city, summary, map) |
| `scripts/` | Python: download data, export JSON for the site, build the static report |
| `notebooks/analiza.ipynb` | Step-by-step analysis notebook (in Polish) |
| `report/index.html` | Static one-page report (in Polish) |
| `data/raw/` | Raw daily data from the API (cached) |

## Running it

Requirements: [uv](https://docs.astral.sh/uv/) (Python) and Node.js 24.

```bash
# website
cd web
npm install
npm run dev          # http://localhost:5173
npm test             # unit tests for the indicators
npm run build        # production build in web/dist

# data (only needed to refresh it)
uv run python scripts/fetch_all_cities.py      # 1951–2025, cached in data/raw/
uv run python scripts/export_web_data.py --refresh-recent
cd web && npm run summary
```

The free Open-Meteo API counts a 75-year request as many calls, so downloading all
cities takes a while; the script waits for rate limits and can be re-run safely.

## Data and method

- Daily data from the [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
  (ERA5 / ERA5-Land reanalysis, CC BY 4.0). A reanalysis is a weather model fitted to observations:
  complete and consistent, but smoother than a single station (especially for precipitation).
- One grid point per city; “Poland” is the mean of the cities.
- Normal: 1961–1990. Trends: least-squares lines, per decade.
- Thermal seasons use a 7-day smoothed daily mean: winter < 0 °C, summer > 15 °C, growing season ≥ 5 °C.
- Map outline: [Natural Earth](https://www.naturalearthdata.com/) (public domain).

## License

Code: [MIT](LICENSE). Data: Open-Meteo, CC BY 4.0.

---

**Po polsku:** opis analizy i notebooka jest w [README.pl.md](README.pl.md).
