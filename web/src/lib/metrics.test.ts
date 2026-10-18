import { describe, expect, it } from 'vitest'
import {
  aggregate,
  annualCycle,
  dayStats,
  decode,
  linearTrend,
  monthlyAnomalies,
  rolling,
  seasonal,
  topDays,
  type RawDaily,
} from './metrics.ts'

/** Build a raw series from a start date and a per-day generator (values in real units). */
function make(
  start: string,
  days: number,
  gen: (d: Date, i: number) => Partial<Record<'tmax' | 'tmin' | 'tmean' | 'precip' | 'snow', number | null>>,
): RawDaily {
  const raw: RawDaily = { id: 'x', start, tmax: [], tmin: [], tmean: [], precip: [], snow: [] }
  const t0 = Date.parse(start + 'T00:00:00Z')
  for (let i = 0; i < days; i++) {
    const v = gen(new Date(t0 + i * 86400000), i)
    for (const f of ['tmax', 'tmin', 'tmean', 'precip', 'snow'] as const) {
      const x = f in v ? v[f]! : 0
      raw[f].push(x === null ? null : Math.round(x * 10))
    }
  }
  return raw
}

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000 + 1

describe('decode', () => {
  it('derives calendar fields and scales values by 1/10', () => {
    const s = decode(make('2000-02-28', 3, () => ({ tmax: 1.5 })))
    expect(s.n).toBe(3)
    expect(Array.from(s.month)).toEqual([2, 2, 3])
    expect(Array.from(s.day)).toEqual([28, 29, 1])
    expect(Array.from(s.year)).toEqual([2000, 2000, 2000])
    expect(s.tmax[0]).toBeCloseTo(1.5)
  })

  it('turns nulls into NaN', () => {
    const s = decode(make('2000-01-01', 2, (_, i) => ({ tmean: i === 1 ? null : 3 })))
    expect(Number.isNaN(s.tmean[1])).toBe(true)
  })
})

describe('aggregate', () => {
  // Two full years: 2001 hot (tmax 31 in July), 2002 mild.
  const s = decode(
    make('2001-01-01', daysBetween('2001-01-01', '2002-12-31'), (d) => {
      const y = d.getUTCFullYear()
      const m = d.getUTCMonth() + 1
      return {
        tmax: y === 2001 && m === 7 ? 31 : 20,
        tmin: m === 1 ? -12 : 5,
        tmean: y === 2001 ? 10 : 12,
        precip: 1,
        snow: m === 1 ? 2 : 0,
      }
    }),
  )

  it('averages a temperature per year', () => {
    expect(aggregate(s, 'tmean', 'year')).toEqual([
      { year: 2001, value: 10 },
      { year: 2002, value: 12 },
    ])
  })

  it('sums precipitation per year (leap-aware)', () => {
    expect(aggregate(s, 'precip', 'year').map((r) => r.value)).toEqual([365, 365])
  })

  it('counts threshold days with the default threshold', () => {
    expect(aggregate(s, 'hot_days', 'year').map((r) => r.value)).toEqual([31, 0])
    expect(aggregate(s, 'cold_nights', 'year').map((r) => r.value)).toEqual([31, 31])
  })

  it('accepts a custom threshold', () => {
    expect(aggregate(s, 'hot_days', 'year', 32).map((r) => r.value)).toEqual([0, 0])
    expect(aggregate(s, 'hot_days', 'year', 20).map((r) => r.value)).toEqual([365, 365])
  })

  it('restricts to a single month', () => {
    expect(aggregate(s, 'hot_days', 'm7').map((r) => r.value)).toEqual([31, 0])
    expect(aggregate(s, 'snow', 'm1').map((r) => r.value)).toEqual([62, 62])
  })

  it('assigns December to the following winter and drops incomplete winters', () => {
    // DJF 2001 lacks Dec 2000 -> dropped; DJF 2002 = Dec 2001 + Jan/Feb 2002
    const djf = aggregate(s, 'cold_nights', 'DJF')
    expect(djf).toEqual([{ year: 2002, value: 31 }])
  })

  it('drops years with missing days', () => {
    const partial = decode(make('2001-01-01', 400, () => ({ tmean: 1 })))
    expect(aggregate(partial, 'tmean', 'year').map((r) => r.year)).toEqual([2001])
  })

  it('finds extremes', () => {
    expect(aggregate(s, 'tmax_abs', 'year').map((r) => r.value)).toEqual([31, 20])
    expect(aggregate(s, 'tmin_abs', 'year').map((r) => r.value)).toEqual([-12, -12])
  })
})

describe('seasonal indicators', () => {
  // Synthetic climate: tmean follows a sine wave from -5 (mid-Jan) to +20 (mid-Jul).
  const s = decode(
    make('2000-07-01', daysBetween('2000-07-01', '2002-12-31'), (d) => {
      const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000
      const t = 7.5 - 12.5 * Math.cos((2 * Math.PI * (doy - 15)) / 365)
      return { tmean: t, tmin: t - 4, tmax: t + 4 }
    }),
  )
  const rows = seasonal(s)
  const y2001 = rows.find((r) => r.year === 2001)!

  it('measures winter length (<0 °C) over Jul–Jun seasons', () => {
    // cos form: t < 0 when cos(...) > 0.6, i.e. ~29.5% of the year ≈ 108 days
    expect(y2001.winter_days).toBeGreaterThan(100)
    expect(y2001.winter_days).toBeLessThan(115)
  })

  it('measures summer (>15 °C) and growing season (≥5 °C)', () => {
    // symmetric to winter: t > 15 when cos(...) < -0.6 ≈ 108 days
    expect(y2001.summer_days_thermal).toBeGreaterThan(100)
    expect(y2001.summer_days_thermal).toBeLessThan(115)
    expect(y2001.growing_days).toBeGreaterThan(y2001.summer_days_thermal!)
  })

  it('finds spring/summer start and frost dates as day-of-year', () => {
    expect(y2001.spring_start).toBeGreaterThan(80)
    expect(y2001.spring_start).toBeLessThan(115)
    expect(y2001.summer_start).toBeGreaterThan(y2001.spring_start!)
    expect(y2001.last_frost).toBeLessThan(182)
    expect(y2001.first_frost).toBeGreaterThan(182)
    expect(y2001.frost_free).toBe(y2001.first_frost! - y2001.last_frost! - 1)
  })

  it('skips incomplete years', () => {
    expect(rows.find((r) => r.year === 2000)).toBeUndefined() // half a year only
  })
})

describe('statistics helpers', () => {
  it('fits a linear trend', () => {
    const t = linearTrend([
      { year: 2000, value: 1 },
      { year: 2001, value: 3 },
      { year: 2002, value: 5 },
    ])
    expect(t.slope).toBeCloseTo(2)
    expect(t.intercept + t.slope * 2000).toBeCloseTo(1)
  })

  it('returns NaN slope for fewer than 2 points', () => {
    expect(Number.isNaN(linearTrend([{ year: 2000, value: 1 }]).slope)).toBe(true)
  })

  it('computes a centred rolling mean with a minimum count', () => {
    const r = rolling([1, 2, 3, 4, 5], 3, 2)
    expect(r).toEqual([1.5, 2, 3, 4, 4.5])
  })
})

describe('daily lookups', () => {
  const s = decode(
    make('1951-01-01', daysBetween('1951-01-01', '1960-12-31'), (d) => ({
      tmax: d.getUTCFullYear() - 1950, // 1..10, so 1960 is the warmest everywhere
      tmean: d.getUTCFullYear() - 1950,
      precip: d.getUTCMonth() === 5 && d.getUTCDate() === 1 ? 50 : 0,
    })),
  )

  it('ranks a day against the same calendar day in other years', () => {
    const st = dayStats(s, '1955-03-10')!
    expect(st.values.tmax).toBe(5)
    expect(st.rank).toBe(6) // 6th warmest of 10 years
    expect(st.ofYears).toBe(10)
    expect(st.recordHigh).toEqual({ year: 1960, value: 10 })
    expect(st.recordLow).toEqual({ year: 1951, value: 1 })
  })

  it('returns null for dates outside the series', () => {
    expect(dayStats(s, '1900-01-01')).toBeNull()
  })

  it('lists the top days', () => {
    const top = topDays(s, 'precip', 3, 'desc')
    expect(top.map((d) => d.value)).toEqual([50, 50, 50])
    expect(top[0].date.endsWith('-06-01')).toBe(true)
  })

  it('computes a 365-day annual cycle', () => {
    const cyc = annualCycle(s, 'tmean', 1951, 1960)
    expect(cyc).toHaveLength(365)
    expect(cyc[100]).toBeCloseTo(5.5)
  })

  it('computes monthly anomalies against a baseline', () => {
    const a = monthlyAnomalies(s, 'tmean', [1951, 1960])
    expect(a.get(1960)![0]).toBeCloseTo(4.5)
    expect(a.get(1951)![11]).toBeCloseTo(-4.5)
  })
})

describe('isPeriod', () => {
  it('accepts valid periods and rejects anything else from the URL', async () => {
    const { isPeriod } = await import('./metrics.ts')
    for (const ok of ['year', 'DJF', 'SON', 'm1', 'm12']) expect(isPeriod(ok)).toBe(true)
    for (const bad of [null, '', 'm0', 'm13', 'mx', 'winter', 'm1<script>']) expect(isPeriod(bad)).toBe(false)
  })
})
