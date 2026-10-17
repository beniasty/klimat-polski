"""Build report/index.html: a single self-contained page (plotly.js inlined).

Run:  uv run python scripts/build_report.py
"""

from __future__ import annotations

import html
import json
import sys
from pathlib import Path

import plotly.io as pio
from plotly.offline import get_plotlyjs

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import charts  # noqa: E402
import pogoda  # noqa: E402

OUT = pogoda.PROJECT_ROOT / "report" / "index.html"


def pl_num(x: float, digits: int = 1, sign: bool = False) -> str:
    """Polish number format: 2,1 / +2,1 (with a real minus sign)."""
    s = f"{x:+.{digits}f}" if sign else f"{x:.{digits}f}"
    return s.replace(".", ",").replace("-", "−")


def lerp_hex(a: str, b: str, t: float) -> str:
    ca = [int(a[i : i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i : i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(ca, cb))


# Diverging ramp for the stripes: blue arm, neutral gray midpoint, red arm.
STRIPE_STOPS = [(-2.0, "#184f95"), (-1.0, "#6da7ec"), (0.0, "#e6e5e0"), (1.2, "#ee8a89"),
                (2.4, "#d03b3b"), (3.3, "#8c1f1f")]


def stripe_color(v: float) -> str:
    if v <= STRIPE_STOPS[0][0]:
        return STRIPE_STOPS[0][1]
    for (a, ca), (b, cb) in zip(STRIPE_STOPS, STRIPE_STOPS[1:]):
        if v <= b:
            return lerp_hex(ca, cb, (v - a) / (b - a))
    return STRIPE_STOPS[-1][1]


def fig_json(fig, title: str) -> dict:
    """Move the title out of the chart (into HTML) so it wraps on mobile."""
    has_legend = bool(fig.layout.showlegend)
    fig.update_layout(title=None, margin=dict(t=40 if has_legend else 12))
    return {"title": title, "fig": json.loads(pio.to_json(fig, validate=False))}


def main() -> None:
    df = pogoda.clean(pogoda.load_raw())
    yearly = pogoda.yearly(df)
    seasons = pogoda.seasons(df)
    pl = charts.poland_mean(yearly).set_index("year")
    ps = charts.poland_mean(seasons).set_index("year")

    base = pl.loc[1961:1990].mean()
    last = pl.loc[2016:2025].mean()
    sbase = ps.loc[1962:1990].mean()
    slast = ps.loc[2016:2025].mean()
    t_all = pogoda.trend_per_decade(pl.index.to_series(), pl["tmean"])
    t_81 = pogoda.trend_per_decade(pl.loc[1981:].index.to_series(), pl.loc[1981:, "tmean"])
    t_precip = pogoda.trend_per_decade(pl.index.to_series(), pl["precip"])
    cold_since_91 = list(pl.loc[1991:].query("anomaly < 0").index)
    warmest = pl["anomaly"].sort_values(ascending=False).head(5)
    city_hot = yearly[yearly["year"] >= 2016].groupby("city", observed=True)["hot_days"].mean()
    city_t = (
        yearly[yearly["year"] >= 2016].groupby("city", observed=True)["tmean"].mean()
        - yearly[yearly["year"].between(1961, 1990)].groupby("city", observed=True)["tmean"].mean()
    )

    figs = {
        "anomaly": fig_json(charts.anomaly_bars(yearly),
                            "Odchylenie średniej rocznej temperatury od normy 1961–1990"),
        "cities": fig_json(charts.city_dumbbell(yearly),
                           "Średnia roczna temperatura: norma 1961–1990 i lata 2016–2025"),
        "hot": fig_json(charts.yearly_counts(yearly, "hot_days", "", charts.ORANGE),
                        "Dni upalne w roku (Tmax ≥ 30 °C)"),
        "ice": fig_json(charts.yearly_counts(yearly, "ice_days", "", charts.BLUE),
                        "Dni mroźne w roku (cały dzień poniżej 0 °C)"),
        "precip": fig_json(charts.yearly_counts(yearly, "precip", "", charts.BLUE, unit="mm"),
                           "Roczna suma opadów"),
        "months": fig_json(charts.monthly_precip(df), "Średni opad w miesiącu"),
        "snow": fig_json(charts.yearly_counts(yearly, "snow_days", "", charts.BLUE),
                         "Dni z opadem śniegu ≥ 1 cm"),
        "seasons": fig_json(charts.season_lengths(seasons),
                            "Długość zimy i lata termicznego (linia gruba: średnia 10-letnia)"),
    }

    stripes = "".join(
        f'<span style="background:{stripe_color(v)}" title="{y}: {pl_num(v, 1, True)} °C"></span>'
        for y, v in pl["anomaly"].items()
    )

    def chart(key: str, note: str = "") -> str:
        note_html = f'<p class="note">{note}</p>' if note else ""
        return (f'<figure><figcaption>{html.escape(figs[key]["title"])}</figcaption>'
                f'<div class="plot" id="plot-{key}"></div>{note_html}</figure>')

    def compare(label: str, before: str, after: str) -> str:
        return (f'<div class="cmp"><span class="cmp-label">{label}</span>'
                f'<span class="cmp-before">{before}</span><span class="cmp-arrow" aria-hidden="true">›</span>'
                f'<span class="cmp-after">{after}</span></div>')

    def period_row(*items: str) -> str:
        return ('<div class="cmp-row"><div class="cmp-head"><span></span><span>1961–1990</span>'
                '<span></span><span>2016–2025</span></div>' + "".join(items) + "</div>")

    rows = []
    for city in pogoda.CITIES:
        y = yearly[yearly["city"] == city]
        s = seasons[seasons["city"] == city]
        a, b = y[y["year"].between(1961, 1990)], y[y["year"] >= 2016]
        sa, sb = s[s["year"].between(1962, 1990)], s[s["year"] >= 2016]
        rows.append(
            f"<tr><th scope='row'>{city}</th>"
            f"<td>{pl_num(a.tmean.mean())} → {pl_num(b.tmean.mean())}</td>"
            f"<td>{pl_num(a.hot_days.mean())} → {pl_num(b.hot_days.mean())}</td>"
            f"<td>{pl_num(a.ice_days.mean(), 0)} → {pl_num(b.ice_days.mean(), 0)}</td>"
            f"<td>{pl_num(a.precip.mean(), 0)} → {pl_num(b.precip.mean(), 0)}</td>"
            f"<td>{pl_num(sa.winter_days.mean(), 0)} → {pl_num(sb.winter_days.mean(), 0)}</td></tr>"
        )

    hottest_city = city_hot.idxmax()
    coolest_city = city_hot.idxmin()

    body = f"""
<header class="hero">
  <div class="stripes" role="img" aria-label="Pasy ocieplenia: każdy pasek to jeden rok od 1951 do 2025, kolor od niebieskiego (chłodniej niż norma) do czerwonego (cieplej)">{stripes}</div>
  <div class="stripes-axis"><span>1951</span><span>2025</span></div>
  <div class="wrap">
    <h1>Polska jest dziś o {pl_num(last.anomaly)} °C cieplejsza niż w latach 1961–1990</h1>
    <p class="lead">Każdy pasek powyżej to jeden rok, a jego kolor pokazuje, o ile był cieplejszy (czerwony) lub chłodniejszy (niebieski)
    od normy z lat 1961–1990. To dane dzienne z lat 1951–2025 dla Warszawy, Krakowa, Gdańska, Wrocławia i Poznania.
    Poniżej odpowiedzi na cztery pytania.</p>
  </div>
</header>

<main class="wrap">

<section>
  <h2>Czy jest cieplej niż kiedyś? Tak, i to coraz szybciej</h2>
  <p>Średnia temperatura rośnie o <strong>{pl_num(t_all, 2)} °C na dekadę</strong> w całym okresie,
  a od 1981 roku o <strong>{pl_num(t_81, 2)} °C</strong>. Od 1991 roku tylko
  {len(cold_since_91)} lata ({", ".join(map(str, cold_since_91))}) były chłodniejsze od normy.
  Najcieplejszy był {warmest.index[0]} rok ({pl_num(warmest.iloc[0], 1, True)} °C), a cała piątka
  najcieplejszych to lata {", ".join(map(str, sorted(warmest.index)))}.</p>
  {period_row(compare("Średnia roczna", pl_num(base.tmean) + " °C", pl_num(last.tmean) + " °C"))}
  {chart("anomaly")}
  <p>Ocieplenie jest wszędzie podobne: od {pl_num(city_t.min())} °C ({city_t.idxmin()}) do
  {pl_num(city_t.max())} °C ({city_t.idxmax()}).</p>
  {chart("cities")}
</section>

<section>
  <h2>Upałów jest kilka razy więcej, mrozów o połowę mniej</h2>
  <p>Dzień upalny to taki, w którym temperatura przekracza 30 °C. Kiedyś zdarzał się raz lub dwa razy w roku,
  dziś średnio {pl_num(last.hot_days, 0)} razy. Najwięcej upałów ma teraz {hottest_city}
  ({pl_num(city_hot.max())} dnia rocznie), a najmniej {coolest_city} ({pl_num(city_hot.min())}), bo chłodzi go morze.
  Ubyło też dni, w których przez całą dobę jest poniżej zera, oraz nocy z mrozem poniżej −10 °C.</p>
  {period_row(
      compare("Dni upalne", pl_num(base.hot_days), pl_num(last.hot_days)),
      compare("Dni mroźne", pl_num(base.ice_days, 0), pl_num(last.ice_days, 0)),
      compare("Noce ≤ −10 °C", pl_num(base.cold_nights, 0), pl_num(last.cold_nights, 0)),
  )}
  <div class="pair">{chart("hot")}{chart("ice")}</div>
</section>

<section>
  <h2>Deszczu tyle samo, śniegu mniej</h2>
  <p>Roczna suma opadów mocno skacze z roku na rok i nie ma wyraźnego kierunku
  (trend {pl_num(t_precip, 0, True)} mm na dekadę przy średniej ok. {pl_num(base.precip, 0)} mm, czyli w granicach szumu).
  Zmienia się za to rozkład w roku: lipiec jest dziś bardziej deszczowy, a czerwiec suchszy.
  Śnieg pada wyraźnie rzadziej.</p>
  {period_row(
      compare("Opad w roku", pl_num(base.precip, 0) + " mm", pl_num(last.precip, 0) + " mm"),
      compare("Dni ze śniegiem", pl_num(base.snow_days, 0), pl_num(last.snow_days, 0)),
  )}
  <div class="pair">{chart("precip")}{chart("snow")}</div>
  {chart("months", "Opad w reanalizie jest mniej pewny niż temperatura, bo deszcz bywa bardzo lokalny.")}
</section>

<section>
  <h2>Zima termiczna trwa o połowę krócej</h2>
  <p>Zima termiczna to dni, w których średnia dobowa temperatura (wygładzona po 7 dniach) jest poniżej 0 °C.
  W latach 1962–1990 trwała średnio {pl_num(sbase.winter_days, 0)} dni, a w ostatniej dekadzie {pl_num(slast.winter_days, 0)}.
  Lato termiczne (powyżej 15 °C) wydłużyło się w tym czasie o ok. {pl_num((slast.summer_days - sbase.summer_days) / 7, 0)} tygodnie.</p>
  {period_row(
      compare("Zima", pl_num(sbase.winter_days, 0) + " dni", pl_num(slast.winter_days, 0) + " dni"),
      compare("Lato", pl_num(sbase.summer_days, 0) + " dni", pl_num(slast.summer_days, 0) + " dni"),
  )}
  {chart("seasons")}
</section>

<section>
  <h2>Wszystkie miasta w tabeli</h2>
  <div class="table-scroll">
  <table>
    <caption>Średnie roczne: lata 1961–1990 → lata 2016–2025 (zima: sezony 1962–1990 → 2016–2025)</caption>
    <thead><tr><th scope="col">Miasto</th><th scope="col">Temperatura °C</th><th scope="col">Dni upalne</th>
    <th scope="col">Dni mroźne</th><th scope="col">Opad mm</th><th scope="col">Zima termiczna, dni</th></tr></thead>
    <tbody>{"".join(rows)}</tbody>
  </table>
  </div>
</section>

<section class="about">
  <h2>O danych i metodzie</h2>
  <p>Dane dzienne pochodzą z <a href="https://open-meteo.com/en/docs/historical-weather-api">Open-Meteo Historical Weather API</a>
  (reanaliza ERA5, licencja CC BY 4.0). Reanaliza to model pogody dopasowany do historycznych pomiarów,
  więc wartości są nieco wygładzone względem pojedynczej stacji IMGW, za to kompletne i porównywalne w czasie.
  „Polska” oznacza tu średnią z pięciu miast. Normą jest średnia z lat 1961–1990,
  a trendy liczono jako prostą najmniejszych kwadratów.</p>
  <p>Analiza: Python, pandas, plotly. Kod i notebook krok po kroku są w repozytorium projektu.</p>
</section>

</main>
"""

    page = TEMPLATE.replace("%%BODY%%", body)
    page = page.replace("%%FIGS%%", json.dumps({k: v["fig"] for k, v in figs.items()}))
    page = page.replace("%%DARKMAP%%", json.dumps(charts.DARK_MAP))
    page = page.replace("%%PLOTLYJS%%", get_plotlyjs())
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


TEMPLATE = """<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Klimat Polski 1951–2025</title>
<meta name="description" content="Jak zmieniały się temperatura, upały, mrozy, opady i długość zimy w pięciu polskich miastach w latach 1951–2025.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  color-scheme: light;
  --page: #f9f9f7;
  --surface: #fcfcfb;
  --ink: #0b0b0b;
  --ink-2: #52514e;
  --muted: #6f6d68;
  --rule: #e1e0d9;
  --warm: #c23a39;
  --cool: #2a78d6;
  --font: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7;
    --muted: #9b9990; --rule: #2c2c2a; --warm: #e66767; --cool: #3987e5;
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --page: #0d0d0d; --surface: #1a1a19; --ink: #f0efec; --ink-2: #c3c2b7;
  --muted: #9b9990; --rule: #2c2c2a; --warm: #e66767; --cool: #3987e5;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--page); color: var(--ink-2);
  font-family: var(--font); font-size: 17px; line-height: 1.6;
}
.wrap { max-width: 1040px; margin: 0 auto; padding: 0 24px; }
.hero { background: var(--surface); border-bottom: 1px solid var(--rule); padding-bottom: 48px; }
.stripes { display: flex; height: min(44vh, 360px); }
.stripes span { flex: 1 1 0; }
.stripes-axis {
  display: flex; justify-content: space-between; padding: 6px 24px 0;
  font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums;
}
h1 {
  color: var(--ink); font-size: clamp(34px, 6vw, 64px); line-height: 1.04;
  letter-spacing: -0.025em; font-weight: 700; margin: 40px 0 20px; max-width: 16ch;
}
.lead { max-width: 64ch; font-size: 19px; margin: 0; }
section { padding: 56px 0 8px; border-bottom: 1px solid var(--rule); }
section:last-of-type { border-bottom: 0; }
section > p, .about p { max-width: 68ch; }
h2 {
  color: var(--ink); font-size: clamp(24px, 3.4vw, 32px); line-height: 1.15;
  letter-spacing: -0.015em; font-weight: 650; margin: 0 0 16px; max-width: 28ch;
}
strong { color: var(--ink); font-weight: 600; }
a { color: var(--cool); }
a:focus-visible { outline: 2px solid var(--cool); outline-offset: 2px; }

.cmp-row { margin: 24px 0 8px; display: grid; gap: 4px; max-width: 520px; }
.cmp-head, .cmp {
  display: grid; grid-template-columns: minmax(130px, 1.3fr) 1fr 24px 1fr; align-items: baseline;
}
.cmp-head span { font-size: 13px; color: var(--muted); }
.cmp-label { font-size: 15px; }
.cmp-before { font-size: 24px; color: var(--muted); font-weight: 500; }
.cmp-after { font-size: 30px; color: var(--ink); font-weight: 700; letter-spacing: -0.01em; }
.cmp-arrow { color: var(--muted); font-size: 22px; }

figure { margin: 28px 0 24px; background: var(--surface); border: 1px solid var(--rule); border-radius: 10px; padding: 16px 12px 8px; min-width: 0; }
figcaption { color: var(--ink); font-weight: 600; font-size: 15px; padding: 0 6px; }
.plot { width: 100%; min-height: 300px; }
.note { font-size: 14px; color: var(--muted); margin: 4px 6px 4px; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.pair figure { margin: 28px 0 0; }

.table-scroll { overflow-x: auto; margin: 8px 0 32px; }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; font-size: 15px; }
caption { text-align: left; color: var(--muted); font-size: 14px; padding-bottom: 10px; }
th, td { text-align: left; padding: 10px 14px 10px 0; border-bottom: 1px solid var(--rule); white-space: nowrap; }
thead th { color: var(--muted); font-weight: 500; font-size: 13px; }
tbody th { color: var(--ink); font-weight: 600; }
.about { padding-bottom: 64px; font-size: 15px; }
.about h2 { font-size: 20px; }

@media (max-width: 760px) {
  body { font-size: 16px; }
  .wrap { padding: 0 16px; }
  .stripes-axis { padding: 6px 16px 0; }
  .pair { grid-template-columns: 1fr; gap: 0; }
  .lead { font-size: 17px; }
  .cmp-after { font-size: 24px; }
  .cmp-before { font-size: 19px; }
  figure { padding: 12px 4px 4px; }
}
</style>
<script>%%PLOTLYJS%%</script>
</head>
<body>
%%BODY%%
<script>
(function () {
  const FIGS = %%FIGS%%;
  const DARK = %%DARKMAP%%;
  const SWAP = new RegExp(Object.keys(DARK).join("|"), "g");
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() {
    const t = document.documentElement.getAttribute("data-theme");
    return t ? t === "dark" : media.matches;
  }
  function themed(fig) {
    let s = JSON.stringify(fig);
    // One pass, so a replaced color is never replaced again (e.g. ink-2 -> axis).
    if (isDark()) s = s.replace(SWAP, (hex) => DARK[hex]);
    return JSON.parse(s);
  }
  const config = { responsive: true, displayModeBar: false };
  function render() {
    for (const [key, fig] of Object.entries(FIGS)) {
      const el = document.getElementById("plot-" + key);
      if (!el) continue;
      const f = themed(fig);
      if (window.innerWidth < 600) {
        f.layout.margin = Object.assign({}, f.layout.margin, { r: 56 });
        f.layout.height = Math.min(f.layout.height || 360, 300);
      }
      Plotly.react(el, f.data, f.layout, config);
    }
  }
  render();
  media.addEventListener("change", render);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
})();
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
