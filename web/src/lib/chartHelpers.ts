import type { Lang } from './i18n.tsx'
import type { Layout, Trace } from '../components/Chart.tsx'
import { linearTrend, rollingYears, type Unit, type YearValue } from './metrics.ts'
import { doyLabel, monthNames, unitLabel } from './format.ts'

/** Y-axis settings for a unit: day-of-year axes get month labels. */
export function yAxisFor(unit: Unit, lang: Lang): Layout {
  if (unit === 'doy') {
    const starts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
    return { tickvals: starts, ticktext: starts.map((d) => doyLabel(lang, d)), title: { text: '' } }
  }
  return { title: { text: unitLabel(unit, lang) }, ticksuffix: unit === 'C' ? '°' : '' }
}

/** X-axis with month names for a 365-day axis (0-based day index). */
export function monthAxis(lang: Lang): Layout {
  const starts = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  return { tickvals: starts.map((d) => d + 15), ticktext: monthNames(lang), showgrid: false, range: [0, 364] }
}

export function hoverFormat(unit: Unit): string {
  return unit === 'C' ? '.1f' : unit === 'mm' || unit === 'cm' ? '.0f' : '.0f'
}

interface LineOpts {
  name: string
  color: string
  points: YearValue[]
  unit: Unit
  rolling: boolean
  trend: boolean
  lang: Lang
  /** Label for the hover box (e.g. "10-year average"). */
  rollingLabel: string
  trendLabel: string
}

/** Yearly line for one series: raw (thin when rolling is on), optional rolling mean and trend. */
export function yearlyTraces(o: LineOpts): Trace[] {
  const fmt = hoverFormat(o.unit)
  const suffix = o.unit === 'C' ? ' °C' : o.unit === 'doy' ? '' : ` ${unitLabel(o.unit, o.lang)}`
  const hover = o.unit === 'doy' ? `%{customdata}` : `%{y:${fmt}}${suffix}`
  const custom = o.unit === 'doy' ? o.points.map((p) => doyLabel(o.lang, p.value)) : undefined
  const traces: Trace[] = [
    {
      type: 'scatter',
      mode: 'lines',
      x: o.points.map((p) => p.year),
      y: o.points.map((p) => p.value),
      customdata: custom,
      name: o.name,
      line: { color: o.color, width: o.rolling ? 1 : 2, shape: 'linear' },
      opacity: o.rolling ? 0.45 : 1,
      hovertemplate: `${o.name}: ${hover}<extra></extra>`,
      showlegend: !o.rolling,
    },
  ]
  if (o.rolling) {
    const r = rollingYears(o.points, 10)
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: r.map((p) => p.year),
      y: r.map((p) => p.value),
      customdata: o.unit === 'doy' ? r.map((p) => doyLabel(o.lang, p.value)) : undefined,
      name: o.name,
      line: { color: o.color, width: 2.5 },
      hovertemplate: `${o.name} (${o.rollingLabel}): ${hover}<extra></extra>`,
    })
  }
  if (o.trend && o.points.length > 2) {
    const { slope, intercept } = linearTrend(o.points)
    const x0 = o.points[0].year
    const x1 = o.points[o.points.length - 1].year
    traces.push({
      type: 'scatter',
      mode: 'lines',
      x: [x0, x1],
      y: [intercept + slope * x0, intercept + slope * x1],
      name: `${o.name}: ${o.trendLabel}`,
      line: { color: o.color, width: 1.5, dash: 'dot' },
      hoverinfo: 'skip',
      showlegend: false,
    })
  }
  return traces
}
