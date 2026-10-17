import { useState } from 'react'
import { stripeColor } from '../lib/colors.ts'
import { useI18n } from '../lib/i18n.tsx'
import { num } from '../lib/format.ts'

interface Props {
  years: number[]
  anomalies: (number | null)[]
  label: string
  height?: string
}

/** Warming stripes: one coloured bar per year (Ed Hawkins' design). */
export function Stripes({ years, anomalies, label, height = 'min(40vh, 320px)' }: Props) {
  const { lang } = useI18n()
  const [active, setActive] = useState<number | null>(null)
  const last = years.length - 1
  return (
    <div className="stripes-wrap">
      <div className="stripes" style={{ height }} role="img" aria-label={label} onMouseLeave={() => setActive(null)}>
        {years.map((y, i) => {
          const v = anomalies[i]
          return (
            <span
              key={y}
              style={{ background: v === null ? 'transparent' : stripeColor(v) }}
              onMouseEnter={() => setActive(i)}
              onClick={() => setActive(i)}
              className={active === i ? 'on' : ''}
            />
          )
        })}
      </div>
      <div className="stripes-axis">
        <span>{years[0]}</span>
        <span className="stripes-readout" aria-live="polite">
          {active !== null && anomalies[active] !== null ? `${years[active]}: ${num(lang, anomalies[active], 1, true)} °C` : ''}
        </span>
        <span>{years[last]}</span>
      </div>
    </div>
  )
}
