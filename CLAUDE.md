# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Poland's climate 1951–2025 (+ 2026 to date) for 18 regional capitals: a Python analysis (pandas, Jupyter, static report) and an interactive website in `web/` (Vite + React 19 + TypeScript, Plotly). Live site: https://beniasty.github.io/klimat-polski/ — deployed by `.github/workflows/deploy.yml` on every push to `master` (runs `npm ci`, `npm test`, `npm run build`, publishes `web/dist`). `.github/workflows/ci.yml` runs unit tests, lint, build and E2E on every PR (the deploy also runs E2E). `.github/workflows/refresh-data.yml` refreshes the 2026 data every Friday and opens a PR when new days arrive.

## Commands

Website (run in `web/`, Node 24):

```bash
npm run dev                         # http://localhost:5173
npm test                            # vitest run (all tests)
npx vitest run src/lib/metrics.test.ts -t "name"   # single test
npm run lint                        # oxlint
npm run build                       # tsc -b && vite build -> web/dist
npm run summary                     # recompute public/data/summary.json
npm run e2e                         # Playwright smoke tests on the built site (npm run build first; npx playwright install chromium once)
```

Data (Python always via `uv`, from repo root):

```bash
uv run python scripts/fetch_all_cities.py              # 1951–2025 raw CSVs, cached in data/raw/
uv run python scripts/export_web_data.py --refresh-recent   # re-download 2026 data, write web/public/data/
cd web && npm run summary                              # must follow every export
uv run python scripts/build_report.py                  # report/index.html (self-contained)
```

`npm run data` in `web/` runs export + summary in one go (without `--refresh-recent`). The Open-Meteo free API rate-limits long requests; the fetch script waits and is safe to re-run.

## Data pipeline

1. `src/pogoda.py` is the Python core: city list (`ALL_CITIES`; `CITIES` is the 5-city subset used by the notebook/report), date range, baseline 1961–1990, thresholds, download/clean/yearly/trend helpers. `src/charts.py` builds Plotly figures for the report.
2. `scripts/export_web_data.py` writes `web/public/data/daily/<id>.json` (values ×10 as integers, `null` = missing, plus `start` date) and `meta.json` (cities with projected x/y, Poland outline as an SVG path from Natural Earth geojson in `data/raw/geo/`, date range, `fullYears`, `baseline`). Recent data (2026-01-01 → yesterday) is cached separately in `data/raw/recent/`. ET0 and sunshine (`pogoda.EXTRA_VARS`, fetched with `fetch_all_cities.py --extra`) live in `data/raw/extra/`; the export writes them to `public/data/daily-extra/<id>.json`, which the browser loads only for measures where `needsExtra()` is true (`loadSeries(id, extra)`), and `decode()` derives the water balance `wb = precip − et0`. ERA5 sunshine runs high vs stations, so only its trends are meaningful.
3. `web/scripts/build-summary.ts` (run directly by Node 24, no build step) imports `web/src/lib/metrics.ts` and writes `summary.json` with yearly values per city per metric and seasonal tmean/precip, plus `monthly.json` (per city: monthly tmean, precip sum, tmax max, tmin min, complete months only, incl. the current year) used by the Month page via `src/lib/monthly.ts`. The browser and the summary share the same code, so numbers always match — change indicators in `metrics.ts` only, then rerun `npm run summary`. The same npm script then runs `web/scripts/build-og.ts`, which draws the share image `public/og.png` (Poland's warming stripes) from `summary.json`.

## Website architecture

- `src/lib/metrics.ts`: pure functions (no DOM) for all indicators. `decode()` turns raw JSON into typed arrays (`Float64Array` with `NaN` for missing, plus year/month/day/doy). `METRICS` is the list of measures; `aggregate(series, metricId, period, threshold?)` is the main entry point. Tested in `metrics.test.ts`.
- `src/lib/data.ts`: cached `fetch` loaders (`loadMeta`, `loadSummary`, `loadSeries`) and the `useAsync` / `useSeries` hooks. "Poland" (id `pl`) is the mean of all cities, computed client-side (`meanOfCities`, `summarySeries`).
- `src/lib/router.ts`: tiny hash router (`#/explore?c=warszawa&m=tmean`). All UI state lives in URL params via `useRoute().setParams`, so every view is shareable. Read params through `param.*` helpers and validate them (URL input is untrusted; see commit 26cd282).
- `src/lib/i18n.tsx`: Polish/English dictionaries. `pl` is the source of truth (`Key = keyof typeof pl`); `en` is typed `Dict`, so a key added to `pl` must be added to `en` or `tsc` fails. Use `t(key, vars)` with `{var}` placeholders.
- `src/App.tsx` lazily loads one page per route from `src/pages/`; `src/components/Chart.tsx` lazily loads plotly.js (~480 kB gzip chunk, expected).
- `embed.html` + `src/embed.ts`: a second Vite page (no React, no analytics) with a city's warming stripes for `<iframe>` embedding; the About page generates the embed code.
- PWA: `public/manifest.webmanifest`, icons drawn by `build-og.ts`, and a hand-written `public/sw.js` (network first for pages and data, cache first for hashed `/assets/`), registered in `main.tsx` for production builds. Bump `VERSION` in `sw.js` when its caching rules change.
- Air page (`src/pages/Air.tsx`, `src/lib/air.ts`): live EAQI and 4-day forecast fetched by the browser from Open-Meteo's air-quality API (CORS allowed, mocked in E2E); long-term comparisons from `public/data/air.json` (`scripts/export_air.py`, CAMS daily means 2013–2025 in `data/raw/air/`, fetched with `fetch_all_cities.py --air`). CAMS joins several model products, so year-to-year air trends are deliberately not shown; air data is not part of the weekly refresh.
- `vite.config.ts` uses `base: './'` so the site works under the GitHub Pages sub-path; build data URLs from `import.meta.env.BASE_URL`.

## Method conventions

ERA5 reanalysis via Open-Meteo, one grid point per city. Normal 1961–1990; trends are least-squares per decade. Thermal seasons use a 7-day smoothed daily mean: winter < 0 °C, summer > 15 °C, growing season ≥ 5 °C. Hot day tmax ≥ 30 °C, ice day tmax < 0 °C. Heatwave = ≥ 3 days in a row with tmax ≥ 30 °C; dry spell = days in a row with precip < 1 mm (runs are cut at period boundaries). Degree days follow Eurostat: HDD = 18 − Tmean on days with Tmean ≤ 15 °C, CDD = Tmean − 21 on days with Tmean ≥ 24 °C.

## Notes

- `README.md` is in English, `README.pl.md`, the notebook (`notebooks/analiza.ipynb`) and the report are in Polish.
- `PROGRESS.md` (git-ignored) holds local working notes on the website's state.
