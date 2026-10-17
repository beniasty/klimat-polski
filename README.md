# Pogoda i klimat w Polsce 1951–2025

Pierwsza analiza danych w Pythonie: jak zmieniały się temperatura, upały, mrozy, opady
i długość zimy w pięciu miastach (Warszawa, Kraków, Gdańsk, Wrocław, Poznań).

**Najważniejsze wyniki** (średnia z 5 miast, lata 2016–2025 wobec normy 1961–1990):
- średnia roczna temperatura: 8,1 °C → 10,3 °C (+0,34 °C na dekadę, od 1981 r. +0,49 °C),
- dni upalne (Tmax ≥ 30 °C): 1,4 → 8,4 w roku,
- dni mroźne (Tmax < 0 °C): 39 → 14,
- zima termiczna: 66 → 29 dni, lato termiczne: 96 → 124 dni,
- roczna suma opadów bez wyraźnego trendu, dni ze śniegiem: 21 → 13.

## Co jest w środku

| ścieżka | co to |
|---|---|
| `notebooks/analiza.ipynb` | notebook krok po kroku: pobranie → czyszczenie → analiza → wykresy → wnioski |
| `report/index.html` | gotowy raport (jeden plik, działa bez serwera i bez internetu) |
| `src/pogoda.py` | pobieranie danych z cache i liczenie wskaźników |
| `src/charts.py` | wykresy plotly (wspólne dla notebooka i raportu) |
| `scripts/build_report.py` | generuje `report/index.html` |
| `data/raw/*.csv` | surowe dane dzienne z API (zapisane, żeby nie pobierać ich ponownie) |

## Jak uruchomić

Wymagany [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                    # instaluje zależności do .venv
uv run jupyter lab                         # otwiera notebook w przeglądarce
uv run python scripts/build_report.py      # odświeża raport HTML
uv run jupyter nbconvert --to notebook --execute --inplace notebooks/analiza.ipynb  # wykonuje cały notebook
```

Raport otwierasz podwójnym kliknięciem `report/index.html`.
Dane pobierają się tylko wtedy, gdy brakuje plików w `data/raw/`. Żeby pobrać je od nowa, usuń te pliki
albo wywołaj `pogoda.fetch_all(force=True)`.

## Dane i metoda

- Źródło: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
  (reanaliza ERA5, licencja CC BY 4.0), dane dzienne 1951-01-01 – 2025-12-31.
- Reanaliza to model dopasowany do historycznych pomiarów, a nie odczyt ze stacji IMGW,
  więc wartości są lekko wygładzone. Opady są mniej pewne niż temperatura.
- Norma: średnia 1961–1990. Trend: prosta najmniejszych kwadratów (`numpy.polyfit`).
- Zima/lato termiczne: dni ze średnią dobową (wygładzoną 7-dniową średnią kroczącą) < 0 °C / > 15 °C.

Narzędzia: Python 3.14, uv, pandas, plotly, Jupyter.
