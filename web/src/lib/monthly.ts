/**
 * Monthly values (public/data/monthly.json, built by scripts/build-summary.ts)
 * and the statistics shown on the "Month" page. Pure functions, no DOM.
 */

/** wb = climatic water balance (precip − ET0), mm. */
export type MonthlyField = 'tmean' | 'precip' | 'tmax' | 'tmin' | 'wb'

/** Index i = month number i counted from `start` ([year, month]); null = incomplete month. */
export interface Monthly {
  start: [number, number]
  months: number
  cities: Record<string, Record<MonthlyField, (number | null)[]>>
}

export type YearMonth = [number, number]

export const indexOf = (m: Monthly, [y, mo]: YearMonth) => (y - m.start[0]) * 12 + (mo - m.start[1])
export const monthAt = (m: Monthly, i: number): YearMonth => {
  const k = m.start[0] * 12 + m.start[1] - 1 + i
  return [Math.floor(k / 12), (k % 12) + 1]
}
export const ymString = ([y, mo]: YearMonth) => `${y}-${String(mo).padStart(2, '0')}`

/** Mean over all cities; null unless every city has a value. */
export function polandSeries(m: Monthly, field: MonthlyField): (number | null)[] {
  const list = Object.values(m.cities).map((c) => c[field])
  return Array.from({ length: m.months }, (_, i) => {
    const vals = list.map((a) => a[i])
    return vals.every((v) => v !== null) ? (vals as number[]).reduce((a, b) => a + b, 0) / vals.length : null
  })
}

/** Latest month with complete data for every city. */
export function lastComplete(m: Monthly): YearMonth | null {
  const pl = polandSeries(m, 'tmean')
  for (let i = m.months - 1; i >= 0; i--) if (pl[i] !== null) return monthAt(m, i)
  return null
}

/** "2026-09" -> [2026, 9] if it is a complete month in the data, else null. */
export function parseMonth(m: Monthly, s: string | null): YearMonth | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s ?? '')
  if (!match) return null
  const ym: YearMonth = [Number(match[1]), Number(match[2])]
  const i = indexOf(m, ym)
  return i >= 0 && i < m.months && polandSeries(m, 'tmean')[i] !== null ? ym : null
}

/** The same calendar month in every year with data: [{year, value}]. */
export function sameMonth(m: Monthly, arr: (number | null)[], month: number) {
  const out: { year: number; value: number }[] = []
  for (let i = indexOf(m, [m.start[0], month]); i < m.months; i += 12) {
    const v = arr[i]
    if (i >= 0 && v !== null) out.push({ year: monthAt(m, i)[0], value: v })
  }
  return out
}

export interface MonthStat {
  value: number
  normal: number
  /** 1 = highest value of this calendar month in all years. */
  rank: number
  /** 1 = lowest value (e.g. the driest). */
  rankLow: number
  ofYears: number
}

export function monthStat(m: Monthly, arr: (number | null)[], [y, mo]: YearMonth, baseline: [number, number]): MonthStat | null {
  return rankStat(sameMonth(m, arr, mo), y, baseline)
}

/** Value of one year among all years: normal over the baseline and ranks from both ends. */
export function rankStat(all: { year: number; value: number }[], year: number, baseline: [number, number]): MonthStat | null {
  const value = all.find((d) => d.year === year)?.value
  if (value === undefined) return null
  const base = all.filter((d) => d.year >= baseline[0] && d.year <= baseline[1])
  const normal = base.reduce((a, d) => a + d.value, 0) / base.length
  const rank = 1 + all.filter((d) => d.value > value).length
  const rankLow = 1 + all.filter((d) => d.value < value).length
  return { value, normal, rank, rankLow, ofYears: all.length }
}

/** City with the highest (max) or lowest (min) value of a field in one month. */
export function extreme(m: Monthly, field: 'tmax' | 'tmin', i: number, pick: 'max' | 'min') {
  let best: { city: string; value: number } | null = null
  for (const [city, c] of Object.entries(m.cities)) {
    const v = c[field][i]
    if (v === null) continue
    if (!best || (pick === 'max' ? v > best.value : v < best.value)) best = { city, value: v }
  }
  return best
}
