import { useState } from 'react'
import type { Meta } from '../lib/data.ts'
import type { Binned } from '../lib/colors.ts'

interface Props {
  meta: Meta
  values: Record<string, number | null>
  format: (v: number | null) => string
  scale: Binned
  legendLow: string
  legendHigh: string
  formatEdge: (v: number) => string
  onSelect?: (id: string) => void
  selected?: string
  label: string
}

/** Outline of Poland with one labelled dot per city. */
export function PolandMap({ meta, values, format, scale, legendLow, legendHigh, formatEdge, onSelect, selected, label }: Props) {
  const [hover, setHover] = useState<string | null>(null)
  const { width, height, path } = meta.map
  const active = meta.cities.find((c) => c.id === hover)
  // Put the label on the left when a neighbour sits just to the right (e.g. Bydgoszcz/Toruń).
  const leftLabel = new Set(
    meta.cities.filter((c) => meta.cities.some((o) => o !== c && o.x > c.x && o.x - c.x < 75 && Math.abs(o.y - c.y) < 24)).map((c) => c.id),
  )
  return (
    <figure className="map">
      <svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
        <path d={path} className="map-land" />
        {meta.cities.map((c) => {
          const v = values[c.id]
          const fill = v === null || v === undefined ? 'var(--muted)' : scale.color(v)
          const isSel = selected === c.id
          return (
            <g
              key={c.id}
              className={`map-city${isSel ? ' selected' : ''}`}
              transform={`translate(${c.x},${c.y})`}
              tabIndex={onSelect ? 0 : -1}
              role={onSelect ? 'button' : undefined}
              aria-label={`${c.name}: ${format(v ?? null)}`}
              onMouseEnter={() => setHover(c.id)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.id)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(c.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect?.(c.id)}
            >
              <circle r={22} className="map-hit" />
              <circle r={isSel ? 12 : 10} fill={fill} className="map-dot" />
              <text x={leftLabel.has(c.id) ? -14 : 14} y={5} textAnchor={leftLabel.has(c.id) ? 'end' : 'start'} className="map-value">
                {format(v ?? null)}
              </text>
            </g>
          )
        })}
      </svg>
      {active && (
        <div className="map-tip" style={{ left: `${(active.x / width) * 100}%`, top: `${(active.y / height) * 100}%` }} aria-hidden="true">
          <strong>{active.name}</strong>
          <span>{format(values[active.id] ?? null)}</span>
        </div>
      )}
      <figcaption className="map-legend">
        <span>{legendLow}</span>
        <span className="legend-ramp">
          {scale.colors.map((c, i) => (
            <span key={i} style={{ background: c }} title={`${formatEdge(scale.edges[i])} – ${formatEdge(scale.edges[i + 1])}`} />
          ))}
        </span>
        <span>{legendHigh}</span>
        <span className="legend-range">
          {formatEdge(scale.edges[0])} … {formatEdge(scale.edges[scale.edges.length - 1])}
        </span>
      </figcaption>
    </figure>
  )
}
