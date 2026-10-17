"""Plotly figures shared by the notebook and the HTML report.

Colors come from a validated palette (light mode). The report swaps them for
their dark-mode steps in the browser via DARK_MAP, so every figure is drawn
with exactly these hex values.
"""

from __future__ import annotations

import pandas as pd
import plotly.graph_objects as go

# --- palette -----------------------------------------------------------------
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
MUTED = "#898781"
GRID = "#e1e0d9"
AXIS = "#c3c2b7"
BLUE = "#2a78d6"  # cold / precipitation
ORANGE = "#eb6834"  # heat / summer
RED = "#e34948"  # positive anomaly (diverging pole)
GRAY = "#b5b3ab"  # de-emphasised reference period

# light -> dark step of the same role (used by the report's theme switch)
DARK_MAP = {
    SURFACE: "#1a1a19",
    INK: "#f0efec",
    INK_2: "#c3c2b7",
    GRID: "#2c2c2a",
    AXIS: "#383835",
    BLUE: "#3987e5",
    ORANGE: "#d95926",
    RED: "#e66767",
    GRAY: "#5c5b57",
}

FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif'
ROLL = 10  # years in the moving average


def _base(fig: go.Figure, title: str, y_title: str = "", height: int = 380) -> go.Figure:
    fig.update_layout(
        title=dict(text=title, x=0, xanchor="left", font=dict(size=16, color=INK)),
        height=height,
        margin=dict(l=8, r=80, t=56, b=8),  # right margin leaves room for end labels
        paper_bgcolor=SURFACE,
        plot_bgcolor=SURFACE,
        font=dict(family=FONT, size=13, color=INK_2),
        separators=", ",  # Polish: decimal comma, space as thousands separator
        hovermode="x unified",
        hoverlabel=dict(font=dict(family=FONT), bgcolor=SURFACE, bordercolor=AXIS),
        showlegend=False,
        bargap=0.25,
    )
    fig.update_xaxes(
        showgrid=False, linecolor=AXIS, ticks="outside", tickcolor=AXIS,
        tickfont=dict(color=MUTED), dtick=10, tick0=1960, range=[1949.5, 2025.5],
    )
    fig.update_yaxes(
        title=dict(text=y_title, font=dict(color=MUTED, size=12)),
        gridcolor=GRID, gridwidth=1, zeroline=False, tickfont=dict(color=MUTED),
    )
    return fig


def _rolling(series: pd.Series) -> pd.Series:
    return series.rolling(ROLL, center=True, min_periods=ROLL // 2).mean()


def _end_label(fig: go.Figure, x, y, text: str) -> None:
    fig.add_annotation(
        x=x, y=y, text=text, showarrow=False, xanchor="left", xshift=6,
        font=dict(color=INK_2, size=12),
    )


def poland_mean(table: pd.DataFrame) -> pd.DataFrame:
    """Average of the five cities, one row per year."""
    return table.groupby("year").mean(numeric_only=True).reset_index()


def anomaly_bars(yearly: pd.DataFrame) -> go.Figure:
    """Yearly temperature anomaly vs 1961–1990, bars coloured by sign."""
    pl = poland_mean(yearly)
    colors = [RED if v >= 0 else BLUE for v in pl["anomaly"]]
    fig = go.Figure()
    fig.add_bar(
        x=pl["year"], y=pl["anomaly"], marker=dict(color=colors, cornerradius=4),
        name="Odchylenie", hovertemplate="%{y:+.2f} °C<extra></extra>",
    )
    roll = _rolling(pl["anomaly"])
    fig.add_scatter(
        x=pl["year"], y=roll, mode="lines", line=dict(color=INK, width=2),
        name=f"Średnia {ROLL}-letnia", hovertemplate="%{y:+.2f} °C<extra>średnia 10-letnia</extra>",
    )
    last = roll.last_valid_index()
    _end_label(fig, pl["year"][last], roll[last], f"średnia<br>{ROLL}-letnia")
    fig.add_hline(y=0, line=dict(color=AXIS, width=1))
    _base(fig, "Odchylenie średniej rocznej temperatury od normy 1961–1990", "°C")
    fig.update_yaxes(ticksuffix=" °C", tickvals=[-1, 0, 1, 2, 3], ticktext=["−1", "0", "+1", "+2", "+3"])
    return fig


def yearly_counts(
    yearly: pd.DataFrame, column: str, title: str, color: str, unit: str = "dni"
) -> go.Figure:
    """Columns per year + a moving-average line, for one count indicator."""
    pl = poland_mean(yearly)
    fig = go.Figure()
    fig.add_bar(
        x=pl["year"], y=pl[column], marker=dict(color=color, opacity=0.45, cornerradius=4),
        name="Rok", hovertemplate=f"%{{y:.1f}} {unit}<extra></extra>",
    )
    roll = _rolling(pl[column])
    fig.add_scatter(
        x=pl["year"], y=roll, mode="lines", line=dict(color=color, width=2.5),
        name=f"Średnia {ROLL}-letnia",
        hovertemplate=f"%{{y:.1f}} {unit}<extra>średnia 10-letnia</extra>",
    )
    last = roll.last_valid_index()
    _end_label(fig, pl["year"][last], roll[last], f"{roll[last]:.0f}".replace(".", ","))
    return _base(fig, title, unit, height=320)


def season_lengths(seasons: pd.DataFrame) -> go.Figure:
    """Length of thermal winter (<0 °C) and summer (>15 °C), Poland average."""
    pl = poland_mean(seasons)
    fig = go.Figure()
    for col, color, name in [
        ("summer_days", ORANGE, "Lato (> 15 °C)"),
        ("winter_days", BLUE, "Zima (< 0 °C)"),
    ]:
        fig.add_scatter(
            x=pl["year"], y=pl[col], mode="lines", line=dict(color=color, width=1),
            opacity=0.35, hoverinfo="skip", showlegend=False,
        )
        roll = _rolling(pl[col])
        fig.add_scatter(
            x=pl["year"], y=roll, mode="lines", line=dict(color=color, width=2.5),
            name=name, hovertemplate="%{y:.0f} dni",
        )
        last = roll.last_valid_index()
        _end_label(fig, pl["year"][last], roll[last], name.split(" ")[0])
    _base(fig, "Długość zimy i lata termicznego (średnia 10-letnia, cienka linia: pojedyncze lata)", "dni")
    fig.update_layout(
        showlegend=True,
        legend=dict(orientation="h", x=0, y=1.0, yanchor="bottom", font=dict(color=INK_2)),
        margin=dict(t=80),
    )
    return fig


def monthly_precip(daily: pd.DataFrame) -> go.Figure:
    """Mean monthly precipitation: 1961–1990 vs 1996–2025."""
    months = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"]
    monthly = daily.groupby(["city", "year", "month"], observed=True)["precip"].sum().reset_index()
    fig = go.Figure()
    for (a, b), color in [((1961, 1990), GRAY), ((1996, 2025), BLUE)]:
        m = monthly[monthly["year"].between(a, b)].groupby("month")["precip"].mean()
        fig.add_bar(
            x=months, y=m.values, name=f"{a}–{b}", marker=dict(color=color, cornerradius=4),
            hovertemplate="%{y:.0f} mm",
        )
    _base(fig, "Średni opad w miesiącu: dawniej i dziś", "mm")
    fig.update_xaxes(dtick=None, tick0=None, range=None)
    fig.update_layout(
        barmode="group", bargap=0.3, bargroupgap=0.12, showlegend=True,
        legend=dict(orientation="h", x=0, y=1.0, yanchor="bottom", font=dict(color=INK_2)),
        margin=dict(t=80),
    )
    return fig


def city_dumbbell(yearly: pd.DataFrame, column: str = "tmean", unit: str = "°C") -> go.Figure:
    """Each city: mean of 1961–1990 (gray dot) vs 2016–2025 (red dot)."""
    old = yearly[yearly["year"].between(1961, 1990)].groupby("city", observed=True)[column].mean()
    new = yearly[yearly["year"].between(2016, 2025)].groupby("city", observed=True)[column].mean()
    cities = list(old.index)[::-1]
    fig = go.Figure()
    for c in cities:
        fig.add_scatter(
            x=[old[c], new[c]], y=[c, c], mode="lines", line=dict(color=AXIS, width=2),
            hoverinfo="skip", showlegend=False,
        )
    for series, color, name in [(old, GRAY, "1961–1990"), (new, RED, "2016–2025")]:
        fig.add_scatter(
            x=[series[c] for c in cities], y=cities, mode="markers", name=name,
            marker=dict(color=color, size=12, line=dict(color=SURFACE, width=2)),
            hovertemplate=f"%{{x:.1f}} {unit}<extra>{name}</extra>",
        )
    for c in cities:
        _end_label(fig, new[c], c, f"+{new[c] - old[c]:.1f} {unit}".replace(".", ","))
    _base(fig, "Średnia roczna temperatura w miastach: norma 1961–1990 i ostatnie 10 lat", "", height=340)
    fig.update_xaxes(dtick=0.5, tick0=0, range=None, ticksuffix=" °C", showgrid=True, gridcolor=GRID)
    fig.update_yaxes(showgrid=False, tickfont=dict(color=INK_2))
    fig.update_layout(
        hovermode="closest", showlegend=True,
        legend=dict(orientation="h", x=0, y=1.0, yanchor="bottom", font=dict(color=INK_2)),
        margin=dict(t=80, r=70),
    )
    return fig
