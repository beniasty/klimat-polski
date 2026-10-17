import { useState, type ReactNode } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { METRICS, METRIC_BY_ID, SEASONS, type MetricGroup, type Period } from '../lib/metrics.ts'
import type { City } from '../lib/data.ts'

export const MAX_CITIES = 5

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {hint && <span className="field-hint"> ({hint})</span>}
      </span>
      {children}
    </label>
  )
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filter-bar">{children}</div>
}

export function CitySelect({ cities, value, onChange, label }: { cities: City[]; value: string; onChange: (id: string) => void; label?: string }) {
  const { t } = useI18n()
  return (
    <Field label={label ?? t('ui.city')}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {cities.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </Field>
  )
}

/**
 * Multi-city picker with fixed colour slots: removing a city never repaints the others.
 * `slots` has MAX_CITIES entries; empty string = free slot.
 */
export function CityPicker({ cities, slots, onChange }: { cities: City[]; slots: string[]; onChange: (slots: string[]) => void }) {
  const { t } = useI18n()
  const used = slots.filter(Boolean)
  const free = cities.filter((c) => !used.includes(c.id))
  const name = (id: string) => cities.find((c) => c.id === id)?.name ?? id
  const add = (id: string) => {
    const next = [...slots]
    const i = next.indexOf('')
    if (i >= 0) next[i] = id
    onChange(next)
  }
  const remove = (i: number) => {
    const next = [...slots]
    next[i] = ''
    if (next.every((s) => !s)) return // keep at least one city
    onChange(next)
  }
  return (
    <div className="field city-picker">
      <span className="field-label">
        {t('ui.cities')} <span className="field-hint">({t('ui.cities.hint')})</span>
      </span>
      <div className="chips">
        {slots.map((id, i) =>
          id ? (
            <span className="chip" key={i}>
              <span className="swatch" style={{ background: `var(--series-${i + 1})` }} aria-hidden="true" />
              {name(id)}
              <button type="button" className="chip-x" onClick={() => remove(i)} aria-label={t('ui.cities.remove', { name: name(id) })} disabled={used.length === 1}>
                ×
              </button>
            </span>
          ) : null,
        )}
        {used.length < MAX_CITIES && (
          <select className="chip-add" value="" onChange={(e) => e.target.value && add(e.target.value)} aria-label={t('ui.cities.add')}>
            <option value="">+ {t('ui.cities.add')}</option>
            {free.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}

const GROUPS: MetricGroup[] = ['temp', 'heat', 'cold', 'precip', 'seasons']

export function MetricSelect({ value, onChange, only }: { value: string; onChange: (id: string) => void; only?: (id: string) => boolean }) {
  const { t } = useI18n()
  return (
    <Field label={t('ui.metric')}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {GROUPS.map((g) => {
          const list = METRICS.filter((m) => m.group === g && (!only || only(m.id)))
          if (!list.length) return null
          return (
            <optgroup key={g} label={t(`group.${g}` as Key)}>
              {list.map((m) => (
                <option key={m.id} value={m.id}>
                  {t(`m.${m.id}` as Key)}
                </option>
              ))}
            </optgroup>
          )
        })}
      </select>
    </Field>
  )
}

export function PeriodSelect({ value, onChange, disabled, months = true }: { value: Period; onChange: (p: Period) => void; disabled?: boolean; months?: boolean }) {
  const { t, lang } = useI18n()
  const fmt = new Intl.DateTimeFormat(lang === 'pl' ? 'pl-PL' : 'en-GB', { month: 'long', timeZone: 'UTC' })
  return (
    <Field label={t('ui.period')}>
      <select value={disabled ? 'year' : value} disabled={disabled} onChange={(e) => onChange(e.target.value as Period)}>
        <option value="year">{t('period.year')}</option>
        {SEASONS.map((s) => (
          <option key={s} value={s}>
            {t(`period.${s}` as Key)}
          </option>
        ))}
        {months && (
          <optgroup label={lang === 'pl' ? 'Miesiąc' : 'Month'}>
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={`m${m + 1}`}>
                {fmt.format(new Date(Date.UTC(2001, m, 1)))}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </Field>
  )
}

export function YearRange({ value, onChange, min, max, label }: { value: [number, number]; onChange: (v: [number, number]) => void; min: number; max: number; label?: string }) {
  const { t } = useI18n()
  // Local text state so typing "19" on the way to "1980" does not jump around.
  const [draft, setDraft] = useState<[string, string] | null>(null)
  const shown = draft ?? [String(value[0]), String(value[1])]
  const commit = (d: [string, string]) => {
    let a = Math.round(Number(d[0]))
    let b = Math.round(Number(d[1]))
    if (!Number.isFinite(a)) a = min
    if (!Number.isFinite(b)) b = max
    a = Math.min(Math.max(a, min), max)
    b = Math.min(Math.max(b, min), max)
    if (a > b) [a, b] = [b, a]
    setDraft(null)
    onChange([a, b])
  }
  return (
    <fieldset className="field year-range">
      <legend className="field-label">{label ?? t('ui.years')}</legend>
      <div className="year-inputs">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={shown[0]}
          aria-label={`${label ?? t('ui.years')}: ${t('ui.from')}`}
          onChange={(e) => setDraft([e.target.value, shown[1]])}
          onBlur={() => draft && commit(draft)}
          onKeyDown={(e) => e.key === 'Enter' && draft && commit(draft)}
        />
        <span aria-hidden="true">–</span>
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={shown[1]}
          aria-label={`${label ?? t('ui.years')}: ${t('ui.to')}`}
          onChange={(e) => setDraft([shown[0], e.target.value])}
          onBlur={() => draft && commit(draft)}
          onKeyDown={(e) => e.key === 'Enter' && draft && commit(draft)}
        />
      </div>
    </fieldset>
  )
}

export function ThresholdInput({ metricId, value, onChange }: { metricId: string; value: number | null; onChange: (v: number | null) => void }) {
  const { t } = useI18n()
  const m = METRIC_BY_ID[metricId]
  if (m.kind !== 'daily' || m.threshold === undefined) return null
  const unit = m.field === 'precip' ? 'mm' : m.field === 'snow' ? 'cm' : '°C'
  return (
    <Field label={`${t('ui.threshold')} (${m.op} … ${unit})`}>
      <div className="threshold">
        <input
          type="number"
          step={m.field === 'precip' || m.field === 'snow' ? 1 : 0.5}
          value={value ?? m.threshold}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            onChange(v === m.threshold ? null : v)
          }}
        />
        {value !== null && value !== m.threshold && (
          <button type="button" className="link-btn" onClick={() => onChange(null)}>
            {t('ui.threshold.reset')}: {m.threshold}
          </button>
        )}
      </div>
    </Field>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
