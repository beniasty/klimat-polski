/**
 * Climate indicators computed from daily data.
 *
 * Pure functions, no DOM: used by the browser (live filters) and by
 * scripts/build-summary.ts (pre-computed summary for the map and rankings).
 */

/** et0 = reference evapotranspiration (mm), sun = sunshine duration (hours). */
export type Field = 'tmax' | 'tmin' | 'tmean' | 'precip' | 'snow' | 'et0' | 'sun'
export const FIELDS: Field[] = ['tmax', 'tmin', 'tmean', 'precip', 'snow', 'et0', 'sun']
/** Stored in public/data/daily-extra/ and loaded only for the measures that need them. */
export const EXTRA_FIELDS: Field[] = ['et0', 'sun']

/** Daily data as stored in public/data/daily/<id>.json (values ×10, null = missing). */
export interface RawDaily extends Record<Field, (number | null)[]> {
  id: string
  start: string
}

export interface Series extends Record<Field, Float64Array> {
  /** Climatic water balance: precip − et0 (mm). */
  wb: Float64Array
  id: string
  n: number
  startMs: number
  year: Int16Array
  month: Int8Array // 1–12
  day: Int8Array // 1–31
  doy: Int16Array // 1–366
}

export interface YearValue {
  year: number
  value: number
}

const DAY_MS = 86_400_000

export function decode(raw: RawDaily): Series {
  const n = raw.tmean.length
  const startMs = Date.parse(raw.start + 'T00:00:00Z')
  const s = {
    id: raw.id,
    n,
    startMs,
    year: new Int16Array(n),
    month: new Int8Array(n),
    day: new Int8Array(n),
    doy: new Int16Array(n),
  } as Series
  for (const f of FIELDS) {
    const src = raw[f] ?? [] // older files may lack the newer fields
    const out = new Float64Array(n)
    for (let i = 0; i < n; i++) out[i] = src[i] == null ? NaN : src[i]! / 10
    s[f] = out
  }
  s.wb = s.precip.map((p, i) => p - s.et0[i])
  for (let i = 0; i < n; i++) {
    const d = new Date(startMs + i * DAY_MS)
    const y = d.getUTCFullYear()
    s.year[i] = y
    s.month[i] = d.getUTCMonth() + 1
    s.day[i] = d.getUTCDate()
    s.doy[i] = (startMs + i * DAY_MS - Date.UTC(y, 0, 1)) / DAY_MS + 1
  }
  return s
}

export function isoDate(s: Series, i: number): string {
  return new Date(s.startMs + i * DAY_MS).toISOString().slice(0, 10)
}

export function indexOfDate(s: Series, iso: string): number {
  const i = Math.round((Date.parse(iso + 'T00:00:00Z') - s.startMs) / DAY_MS)
  return i >= 0 && i < s.n ? i : -1
}

// --- periods -----------------------------------------------------------------

export type Season = 'DJF' | 'MAM' | 'JJA' | 'SON'
export type Period = 'year' | Season | `m${number}`
export const SEASONS: Season[] = ['DJF', 'MAM', 'JJA', 'SON']
const SEASON_MONTHS: Record<Season, number[]> = {
  DJF: [12, 1, 2],
  MAM: [3, 4, 5],
  JJA: [6, 7, 8],
  SON: [9, 10, 11],
}

/** Guards values read from the URL. */
export const isPeriod = (s: string | null): s is Period =>
  s === 'year' || (SEASONS as string[]).includes(s ?? '') || /^m([1-9]|1[0-2])$/.test(s ?? '')

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

function periodMonths(period: Period): number[] {
  if (period === 'year') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  if (period in SEASON_MONTHS) return SEASON_MONTHS[period as Season]
  return [Number(period.slice(1))]
}

/** The year a day is counted in for the period, or null if the day is outside it. */
function periodYear(period: Period, year: number, month: number, months: number[]): number | null {
  if (!months.includes(month)) return null
  return period === 'DJF' && month === 12 ? year + 1 : year
}

function expectedDays(period: Period, y: number, months: number[]): number {
  if (period === 'year') return isLeap(y) ? 366 : 365
  return months.reduce((sum, m) => sum + daysInMonth(period === 'DJF' && m === 12 ? y - 1 : y, m), 0)
}

// --- metric registry ------------------------------------------------------------

export type Unit = 'C' | 'mm' | 'cm' | 'days' | 'doy' | 'dd' | 'h'
type Op = '>=' | '>' | '<' | '<='
export type MetricGroup = 'temp' | 'heat' | 'cold' | 'precip' | 'water' | 'energy' | 'seasons'

interface DailyMetric {
  kind: 'daily'
  id: string
  group: MetricGroup
  field: Field | 'wb'
  /** hdd/cdd: degree days; longest: longest run of days meeting op/threshold; spells: runs of at least minRun days. */
  agg: 'mean' | 'sum' | 'count' | 'max' | 'min' | 'hdd' | 'cdd' | 'longest' | 'spells'
  unit: Unit
  op?: Op
  threshold?: number
  minRun?: number
  /** For the map: which way is "warmer/more extreme" (used for colour ramps). */
  hue: 'warm' | 'cold' | 'wet'
}
interface SeasonalMetric {
  kind: 'seasonal'
  id: SeasonalKey
  group: MetricGroup
  unit: Unit
  hue: 'warm' | 'cold' | 'wet'
}
export type Metric = DailyMetric | SeasonalMetric

export const METRICS: Metric[] = [
  { kind: 'daily', id: 'tmean', group: 'temp', field: 'tmean', agg: 'mean', unit: 'C', hue: 'warm' },
  { kind: 'daily', id: 'tmax', group: 'temp', field: 'tmax', agg: 'mean', unit: 'C', hue: 'warm' },
  { kind: 'daily', id: 'tmin', group: 'temp', field: 'tmin', agg: 'mean', unit: 'C', hue: 'warm' },
  { kind: 'daily', id: 'tmax_abs', group: 'temp', field: 'tmax', agg: 'max', unit: 'C', hue: 'warm' },
  { kind: 'daily', id: 'tmin_abs', group: 'temp', field: 'tmin', agg: 'min', unit: 'C', hue: 'cold' },
  { kind: 'daily', id: 'hot_days', group: 'heat', field: 'tmax', agg: 'count', op: '>=', threshold: 30, unit: 'days', hue: 'warm' },
  { kind: 'daily', id: 'summer_days', group: 'heat', field: 'tmax', agg: 'count', op: '>=', threshold: 25, unit: 'days', hue: 'warm' },
  { kind: 'daily', id: 'heatwaves', group: 'heat', field: 'tmax', agg: 'spells', op: '>=', threshold: 30, minRun: 3, unit: 'days', hue: 'warm' },
  { kind: 'daily', id: 'heatwave_max', group: 'heat', field: 'tmax', agg: 'longest', op: '>=', threshold: 30, unit: 'days', hue: 'warm' },
  { kind: 'daily', id: 'tropical_nights', group: 'heat', field: 'tmin', agg: 'count', op: '>=', threshold: 20, unit: 'days', hue: 'warm' },
  { kind: 'daily', id: 'frost_days', group: 'cold', field: 'tmin', agg: 'count', op: '<', threshold: 0, unit: 'days', hue: 'cold' },
  { kind: 'daily', id: 'ice_days', group: 'cold', field: 'tmax', agg: 'count', op: '<', threshold: 0, unit: 'days', hue: 'cold' },
  { kind: 'daily', id: 'cold_nights', group: 'cold', field: 'tmin', agg: 'count', op: '<=', threshold: -10, unit: 'days', hue: 'cold' },
  { kind: 'daily', id: 'precip', group: 'precip', field: 'precip', agg: 'sum', unit: 'mm', hue: 'wet' },
  { kind: 'daily', id: 'wet_days', group: 'precip', field: 'precip', agg: 'count', op: '>=', threshold: 1, unit: 'days', hue: 'wet' },
  { kind: 'daily', id: 'heavy_rain_days', group: 'precip', field: 'precip', agg: 'count', op: '>=', threshold: 10, unit: 'days', hue: 'wet' },
  { kind: 'daily', id: 'precip_max', group: 'precip', field: 'precip', agg: 'max', unit: 'mm', hue: 'wet' },
  { kind: 'daily', id: 'dry_spell_max', group: 'precip', field: 'precip', agg: 'longest', op: '<', threshold: 1, unit: 'days', hue: 'warm' },
  { kind: 'daily', id: 'snow', group: 'precip', field: 'snow', agg: 'sum', unit: 'cm', hue: 'cold' },
  { kind: 'daily', id: 'snow_days', group: 'precip', field: 'snow', agg: 'count', op: '>=', threshold: 1, unit: 'days', hue: 'cold' },
  { kind: 'daily', id: 'et0', group: 'water', field: 'et0', agg: 'sum', unit: 'mm', hue: 'warm' },
  { kind: 'daily', id: 'water_balance', group: 'water', field: 'wb', agg: 'sum', unit: 'mm', hue: 'wet' },
  { kind: 'daily', id: 'sunshine', group: 'water', field: 'sun', agg: 'sum', unit: 'h', hue: 'warm' },
  { kind: 'daily', id: 'hdd', group: 'energy', field: 'tmean', agg: 'hdd', unit: 'dd', hue: 'cold' },
  { kind: 'daily', id: 'cdd', group: 'energy', field: 'tmean', agg: 'cdd', unit: 'dd', hue: 'warm' },
  { kind: 'seasonal', id: 'winter_days', group: 'seasons', unit: 'days', hue: 'cold' },
  { kind: 'seasonal', id: 'summer_days_thermal', group: 'seasons', unit: 'days', hue: 'warm' },
  { kind: 'seasonal', id: 'growing_days', group: 'seasons', unit: 'days', hue: 'warm' },
  { kind: 'seasonal', id: 'spring_start', group: 'seasons', unit: 'doy', hue: 'warm' },
  { kind: 'seasonal', id: 'summer_start', group: 'seasons', unit: 'doy', hue: 'warm' },
  { kind: 'seasonal', id: 'last_frost', group: 'seasons', unit: 'doy', hue: 'cold' },
  { kind: 'seasonal', id: 'first_frost', group: 'seasons', unit: 'doy', hue: 'cold' },
  { kind: 'seasonal', id: 'frost_free', group: 'seasons', unit: 'days', hue: 'warm' },
]
export const METRIC_BY_ID: Record<string, Metric> = Object.fromEntries(METRICS.map((m) => [m.id, m]))

/** True if the measure reads ET0 or sunshine (directly or via the water balance). */
export const needsExtra = (m: Metric) => m.kind === 'daily' && (m.field === 'wb' || EXTRA_FIELDS.includes(m.field))

const compare: Record<Op, (a: number, b: number) => boolean> = {
  '>=': (a, b) => a >= b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
}

/** One value per year for a metric, keeping only years where the period is complete. */
export function aggregate(s: Series, metricId: string, period: Period = 'year', threshold?: number): YearValue[] {
  const m = METRIC_BY_ID[metricId]
  if (!m) throw new Error(`Unknown metric ${metricId}`)
  if (m.kind === 'seasonal') {
    return seasonal(s)
      .map((r) => ({ year: r.year, value: r[m.id] }))
      .filter((r): r is YearValue => r.value !== null)
  }
  const months = periodMonths(period)
  const vals = s[m.field]
  const thr = threshold ?? m.threshold ?? 0
  const test = m.op ? compare[m.op] : null
  const minRun = m.minRun ?? 1
  type Acc = { n: number; sum: number; count: number; max: number; min: number; deg: number; run: number; longest: number; spells: number; last: number }
  const acc = new Map<number, Acc>()
  for (let i = 0; i < s.n; i++) {
    const py = periodYear(period, s.year[i], s.month[i], months)
    if (py === null) continue
    const v = vals[i]
    if (Number.isNaN(v)) continue
    let a = acc.get(py)
    if (!a) acc.set(py, (a = { n: 0, sum: 0, count: 0, max: -Infinity, min: Infinity, deg: 0, run: 0, longest: 0, spells: 0, last: -2 }))
    a.n++
    a.sum += v
    if (v > a.max) a.max = v
    if (v < a.min) a.min = v
    // Eurostat degree days: heating 18 − T when T ≤ 15 °C, cooling T − 21 when T ≥ 24 °C.
    if (m.agg === 'hdd' && v <= 15) a.deg += 18 - v
    if (m.agg === 'cdd' && v >= 24) a.deg += v - 21
    // Runs are cut by gaps (other months of a season, missing days).
    if (i !== a.last + 1) a.run = 0
    a.last = i
    if (test && test(v, thr)) {
      a.count++
      a.run++
      if (a.run > a.longest) a.longest = a.run
      if (a.run === minRun) a.spells++
    } else a.run = 0
  }
  const out: YearValue[] = []
  for (const [year, a] of [...acc].sort((x, y) => x[0] - y[0])) {
    if (a.n !== expectedDays(period, year, months)) continue
    const value = {
      mean: a.sum / a.n,
      sum: a.sum,
      count: a.count,
      max: a.max,
      min: a.min,
      hdd: a.deg,
      cdd: a.deg,
      longest: a.longest,
      spells: a.spells,
    }[m.agg]
    out.push({ year, value })
  }
  return out
}

// --- thermal seasons & phenology ---------------------------------------------------

export type SeasonalKey =
  | 'winter_days'
  | 'summer_days_thermal'
  | 'growing_days'
  | 'spring_start'
  | 'summer_start'
  | 'last_frost'
  | 'first_frost'
  | 'frost_free'

export type SeasonalRow = { year: number } & Record<SeasonalKey, number | null>

const SMOOTH = 7 // days in the centred moving average
const RUN = 10 // consecutive days needed to call the start of a season
const JULY_1 = 182 // day-of-year boundary between spring and autumn frosts (non-leap)

/** Centred moving average; positions with fewer than `minCount` valid values are NaN. */
export function rolling(values: ArrayLike<number>, window: number, minCount = 1): number[] {
  const half = Math.floor(window / 2)
  const out: number[] = []
  for (let i = 0; i < values.length; i++) {
    let sum = 0
    let n = 0
    for (let j = Math.max(0, i - half); j <= Math.min(values.length - 1, i + half); j++) {
      const v = values[j]
      if (!Number.isNaN(v)) {
        sum += v
        n++
      }
    }
    out.push(n >= minCount ? sum / n : NaN)
  }
  return out
}

const seasonalCache = new WeakMap<Series, SeasonalRow[]>()

/** Thermal seasons per calendar year (winter: Jul of previous year – Jun). */
export function seasonal(s: Series): SeasonalRow[] {
  const cached = seasonalCache.get(s)
  if (cached) return cached
  const smooth = rolling(s.tmean, SMOOTH, 4)

  // Index ranges of each calendar year.
  const yearStart = new Map<number, number>()
  const yearEnd = new Map<number, number>()
  for (let i = 0; i < s.n; i++) {
    if (!yearStart.has(s.year[i])) yearStart.set(s.year[i], i)
    yearEnd.set(s.year[i], i)
  }
  const complete = (y: number) =>
    yearStart.has(y) && s.month[yearStart.get(y)!] === 1 && s.day[yearStart.get(y)!] === 1 &&
    s.month[yearEnd.get(y)!] === 12 && s.day[yearEnd.get(y)!] === 31
  const countWhere = (from: number, to: number, pred: (i: number) => boolean) => {
    let c = 0
    for (let i = from; i <= to; i++) if (pred(i)) c++
    return c
  }
  const firstRun = (from: number, to: number, pred: (i: number) => boolean): number | null => {
    let run = 0
    for (let i = from; i <= to; i++) {
      run = pred(i) ? run + 1 : 0
      if (run === RUN) return s.doy[i - RUN + 1]
    }
    return null
  }

  const rows: SeasonalRow[] = []
  for (const y of yearStart.keys()) {
    if (!complete(y)) continue
    const a = yearStart.get(y)!
    const b = yearEnd.get(y)!
    // Winter season ending in y: 1 Jul (y-1) .. 30 Jun y.
    const wStart = indexOfDate(s, `${y - 1}-07-01`)
    const wEnd = indexOfDate(s, `${y}-06-30`)
    const winter = wStart >= 0 && wEnd >= 0 ? countWhere(wStart, wEnd, (i) => smooth[i] < 0) : null

    const julyIdx = a + (isLeap(y) ? JULY_1 : JULY_1 - 1)
    let lastFrost: number | null = null
    for (let i = a; i < julyIdx; i++) if (s.tmin[i] < 0) lastFrost = s.doy[i]
    let firstFrost: number | null = null
    for (let i = julyIdx; i <= b; i++) {
      if (s.tmin[i] < 0) {
        firstFrost = s.doy[i]
        break
      }
    }
    rows.push({
      year: y,
      winter_days: winter,
      summer_days_thermal: countWhere(a, b, (i) => smooth[i] > 15),
      growing_days: countWhere(a, b, (i) => smooth[i] >= 5),
      spring_start: firstRun(a, b, (i) => smooth[i] >= 5),
      summer_start: firstRun(a, b, (i) => smooth[i] >= 15),
      last_frost: lastFrost,
      first_frost: firstFrost,
      frost_free: lastFrost !== null && firstFrost !== null ? firstFrost - lastFrost - 1 : null,
    })
  }
  seasonalCache.set(s, rows)
  return rows
}

// --- statistics ---------------------------------------------------------------------

/** Least-squares line through (year, value). Slope is per year. */
export function linearTrend(points: YearValue[]): { slope: number; intercept: number } {
  const pts = points.filter((p) => Number.isFinite(p.value))
  const n = pts.length
  if (n < 2) return { slope: NaN, intercept: NaN }
  const mx = pts.reduce((s, p) => s + p.year, 0) / n
  const my = pts.reduce((s, p) => s + p.value, 0) / n
  let num = 0
  let den = 0
  for (const p of pts) {
    num += (p.year - mx) * (p.value - my)
    den += (p.year - mx) ** 2
  }
  const slope = num / den
  return { slope, intercept: my - slope * mx }
}

/** Mean of the values whose year is within [from, to]. */
export function meanBetween(points: YearValue[], from: number, to: number): number {
  const sel = points.filter((p) => p.year >= from && p.year <= to && Number.isFinite(p.value))
  return sel.length ? sel.reduce((s, p) => s + p.value, 0) / sel.length : NaN
}

/** Rolling mean on a yearly series (handles missing years by position in the calendar). */
export function rollingYears(points: YearValue[], window = 10): YearValue[] {
  if (!points.length) return []
  const first = points[0].year
  const last = points[points.length - 1].year
  const arr = new Array(last - first + 1).fill(NaN)
  for (const p of points) arr[p.year - first] = p.value
  const r = rolling(arr, window, Math.ceil(window / 2))
  return points.map((p) => ({ year: p.year, value: r[p.year - first] }))
}

// --- daily lookups --------------------------------------------------------------------

export interface DayStats {
  date: string
  values: Record<Field, number>
  /** Rank of this day's tmax among the same calendar day in all years (1 = warmest). */
  rank: number
  ofYears: number
  recordHigh: YearValue
  recordLow: YearValue
  normal: Record<'tmax' | 'tmin' | 'tmean', number>
}

export function dayStats(s: Series, iso: string, baseline: [number, number] = [1961, 1990]): DayStats | null {
  const idx = indexOfDate(s, iso)
  if (idx < 0) return null
  const mo = s.month[idx]
  const da = s.day[idx]
  const same: number[] = []
  for (let i = 0; i < s.n; i++) if (s.month[i] === mo && s.day[i] === da && !Number.isNaN(s.tmax[i])) same.push(i)
  const v = s.tmax[idx]
  const rank = same.filter((i) => s.tmax[i] > v).length + 1
  const hi = same.reduce((b, i) => (s.tmax[i] > s.tmax[b] ? i : b), same[0])
  const lo = same.reduce((b, i) => (s.tmax[i] < s.tmax[b] ? i : b), same[0])
  // Normal: ±7 days around the date in the baseline years (smoother than a single day).
  const doy = s.doy[idx]
  const normalIdx: number[] = []
  for (let i = 0; i < s.n; i++) {
    if (s.year[i] < baseline[0] || s.year[i] > baseline[1]) continue
    if (Math.abs(s.doy[i] - doy) <= 7) normalIdx.push(i)
  }
  const pool = normalIdx.length ? normalIdx : same
  const avg = (f: Field) => pool.reduce((t, i) => t + s[f][i], 0) / pool.length
  return {
    date: iso,
    values: Object.fromEntries(FIELDS.map((f) => [f, s[f][idx]])) as Record<Field, number>,
    rank,
    ofYears: same.length,
    recordHigh: { year: s.year[hi], value: s.tmax[hi] },
    recordLow: { year: s.year[lo], value: s.tmax[lo] },
    normal: { tmax: avg('tmax'), tmin: avg('tmin'), tmean: avg('tmean') },
  }
}

export interface DayValue {
  date: string
  value: number
}

export function topDays(
  s: Series,
  field: Field,
  n: number,
  order: 'desc' | 'asc',
  from = -Infinity,
  to = Infinity,
): DayValue[] {
  const idx: number[] = []
  for (let i = 0; i < s.n; i++) if (s.year[i] >= from && s.year[i] <= to && !Number.isNaN(s[field][i])) idx.push(i)
  const sign = order === 'desc' ? -1 : 1
  idx.sort((a, b) => sign * (s[field][a] - s[field][b]) || a - b)
  return idx.slice(0, n).map((i) => ({ date: isoDate(s, i), value: s[field][i] }))
}

/** Position 0..364 in a "no leap day" year (29 Feb shares the slot of 28 Feb). */
function doy365(s: Series, i: number): number {
  const d = s.doy[i] - 1
  return isLeap(s.year[i]) && d >= 59 ? d - 1 : d
}

/** Mean value for each day of the year over [from, to], smoothed with a 7-day circular window. */
export function annualCycle(s: Series, field: Field, from: number, to: number, smooth = 7): number[] {
  const sum = new Array(365).fill(0)
  const cnt = new Array(365).fill(0)
  for (let i = 0; i < s.n; i++) {
    if (s.year[i] < from || s.year[i] > to) continue
    const v = s[field][i]
    if (Number.isNaN(v)) continue
    const k = doy365(s, i)
    sum[k] += v
    cnt[k]++
  }
  const raw = sum.map((v, k) => (cnt[k] ? v / cnt[k] : NaN))
  if (smooth <= 1) return raw
  const half = Math.floor(smooth / 2)
  return raw.map((_, k) => {
    let t = 0
    let n = 0
    for (let j = -half; j <= half; j++) {
      const v = raw[(k + j + 365) % 365]
      if (!Number.isNaN(v)) {
        t += v
        n++
      }
    }
    return n ? t / n : NaN
  })
}

/** Daily values of one field within a year range and period (for histograms). */
export function valuesIn(s: Series, field: Field, from: number, to: number, period: Period = 'year'): number[] {
  const months = periodMonths(period)
  const out: number[] = []
  for (let i = 0; i < s.n; i++) {
    const py = periodYear(period, s.year[i], s.month[i], months)
    if (py === null || py < from || py > to) continue
    const v = s[field][i]
    if (!Number.isNaN(v)) out.push(v)
  }
  return out
}

/** Monthly means minus the baseline monthly mean: year -> 12 anomalies (NaN if month incomplete). */
export function monthlyAnomalies(s: Series, field: Field, baseline: [number, number]): Map<number, number[]> {
  const sums = new Map<number, { sum: number[]; n: number[] }>()
  for (let i = 0; i < s.n; i++) {
    const v = s[field][i]
    if (Number.isNaN(v)) continue
    let e = sums.get(s.year[i])
    if (!e) sums.set(s.year[i], (e = { sum: new Array(12).fill(0), n: new Array(12).fill(0) }))
    e.sum[s.month[i] - 1] += v
    e.n[s.month[i] - 1]++
  }
  const means = new Map<number, number[]>()
  for (const [y, e] of sums) {
    means.set(y, e.sum.map((t, m) => (e.n[m] === daysInMonth(y, m + 1) ? t / e.n[m] : NaN)))
  }
  const normal = new Array(12).fill(0).map((_, m) => {
    const vals = [...means].filter(([y]) => y >= baseline[0] && y <= baseline[1]).map(([, v]) => v[m]).filter(Number.isFinite)
    return vals.reduce((a, b) => a + b, 0) / vals.length
  })
  const out = new Map<number, number[]>()
  for (const [y, v] of means) out.set(y, v.map((x, m) => x - normal[m]))
  return out
}
