import { useEffect, useRef } from 'react'
import { useI18n } from '../lib/i18n.tsx'
import { separators } from '../lib/format.ts'
import { useTokens, type Tokens } from '../lib/theme.ts'

/** Plotly figure pieces, typed loosely: we use attributes newer than @types/plotly.js. */
export type Trace = Record<string, unknown>
export type Layout = Record<string, unknown>

// plotly.js is large, so it is loaded only when the first chart appears.
let plotlyPromise: Promise<typeof import('plotly.js-cartesian-dist-min').default> | null = null
const loadPlotly = () => (plotlyPromise ??= import('plotly.js-cartesian-dist-min').then((m) => m.default))

const FONT = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'system-ui, sans-serif'

function baseLayout(tk: Tokens, lang: 'pl' | 'en', height: number): Layout {
  const axis = {
    gridcolor: tk.grid,
    linecolor: tk.axis,
    zeroline: false,
    tickfont: { color: tk.muted, size: 12 },
    title: { font: { color: tk.muted, size: 12 } },
    automargin: true,
  }
  return {
    height,
    margin: { l: 8, r: 16, t: 12, b: 8 },
    paper_bgcolor: tk.surface,
    plot_bgcolor: tk.surface,
    font: { family: FONT, size: 13, color: tk.ink2 },
    separators: separators(lang),
    hovermode: 'x unified',
    hoverlabel: { bgcolor: tk.surface, bordercolor: tk.axis, font: { family: FONT, color: tk.ink } },
    showlegend: false,
    legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom', font: { color: tk.ink2 } },
    xaxis: { ...axis, showgrid: false, ticks: 'outside', tickcolor: tk.axis },
    yaxis: { ...axis },
    bargap: 0.25,
    dragmode: false,
  }
}

/** Deep-merge plain objects (layout overrides win). */
function merge(a: Layout, b: Layout): Layout {
  const out: Layout = { ...a }
  for (const [k, v] of Object.entries(b)) {
    const av = out[k]
    out[k] =
      v && typeof v === 'object' && !Array.isArray(v) && av && typeof av === 'object' && !Array.isArray(av)
        ? merge(av as Layout, v as Layout)
        : v
  }
  return out
}

interface Props {
  data: Trace[]
  layout?: Layout
  height?: number
  /** Short description for screen readers; the table view carries the values. */
  label: string
}

export function Chart({ data, layout = {}, height = 360, label }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const tk = useTokens()
  // Phones get shorter charts, except tall ones (e.g. one row per year) that need the room.
  const h = window.innerWidth < 600 && height <= 440 ? Math.min(height, 300) : height
  const { lang } = useI18n()

  useEffect(() => {
    let alive = true
    loadPlotly().then((Plotly) => {
      if (!alive || !ref.current) return
      Plotly.react(
        ref.current,
        data as Plotly.Data[],
        merge(baseLayout(tk, lang, h), layout) as Partial<Plotly.Layout>,
        { responsive: true, displayModeBar: false, scrollZoom: false } as Partial<Plotly.Config>,
      )
    })
    return () => {
      alive = false
    }
  }, [data, layout, tk, lang, h])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) loadPlotly().then((P) => P.purge(el))
    }
  }, [])

  return <div className="chart" ref={ref} role="img" aria-label={label} style={{ minHeight: h }} />
}
