import { useEffect, useState } from 'react'
import { decode, type RawDaily, type Series } from './metrics.ts'
import type { Monthly } from './monthly.ts'

export interface City {
  id: string
  name: string
  lat: number
  lon: number
  x: number
  y: number
}

export interface Meta {
  generated: string
  firstDate: string
  lastDate: string
  fullYears: [number, number]
  baseline: [number, number]
  cities: City[]
  map: { width: number; height: number; path: string }
}

export interface Summary {
  years: number[]
  cities: Record<string, Record<string, (number | null)[]>>
}

const base = import.meta.env.BASE_URL + 'data/'
const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string, transform: (json: unknown) => T = (j) => j as T): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(base + path)
        .then((r) => {
          if (!r.ok) throw new Error(`${r.status} ${path}`)
          return r.json()
        })
        .then(transform)
        .catch((e) => {
          cache.delete(path) // allow a retry
          throw e
        }),
    )
  }
  return cache.get(path) as Promise<T>
}

export const loadMeta = () => load<Meta>('meta.json')
export const loadSummary = () => load<Summary>('summary.json')
export const loadMonthly = () => load<Monthly>('monthly.json')

export interface DayRecord {
  city: string
  date: string
  value: number
}
/** Poland-wide top 10 days (one per date), built by scripts/build-summary.ts. */
export const loadRecords = () => load<Record<'hottest' | 'coldest' | 'wettest', DayRecord[]>>('records.json')

const seriesCache = new Map<string, Promise<Series>>()
/** Daily series of one city; `extra` also loads ET0 and sunshine (daily-extra/). */
export function loadSeries(id: string, extra = false): Promise<Series> {
  const key = extra ? `${id}+extra` : id
  if (!seriesCache.has(key)) {
    const parts = [load<RawDaily>(`daily/${id}.json`), extra ? load<Partial<RawDaily>>(`daily-extra/${id}.json`) : Promise.resolve({})] as const
    seriesCache.set(
      key,
      Promise.all(parts)
        .then(([base, more]) => decode({ ...base, ...more }))
        .catch((e) => {
          seriesCache.delete(key)
          throw e
        }),
    )
  }
  return seriesCache.get(key)!
}

type Async<T> = { data: T | undefined; error: Error | undefined; loading: boolean }

/** Resolve a promise-returning loader; re-runs when `key` changes. */
export function useAsync<T>(loader: () => Promise<T>, key: string): Async<T> {
  const [state, setState] = useState<Async<T> & { key?: string }>({ data: undefined, error: undefined, loading: true })
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: undefined }))
    loader().then(
      (data) => alive && setState({ data, error: undefined, loading: false, key }),
      (error: Error) => alive && setState({ data: undefined, error, loading: false, key }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return state
}

/** Load several city series at once (in order). */
export function useSeries(ids: string[], extra = false) {
  return useAsync(() => Promise.all(ids.map((id) => loadSeries(id, extra))), ids.join(',') + (extra ? '+extra' : ''))
}

/** Average of several yearly arrays, ignoring nulls (used for "Poland" = mean of cities). */
export function meanOfCities(summary: Summary, key: string, ids?: string[]): (number | null)[] {
  const list = (ids ?? Object.keys(summary.cities)).map((id) => summary.cities[id][key])
  return summary.years.map((_, i) => {
    const vals = list.map((a) => a[i]).filter((v): v is number => v !== null)
    return vals.length === list.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  })
}

/** Mean of a yearly array over [from, to] (nulls skipped). */
export function rangeMean(summary: Summary, arr: (number | null)[], from: number, to: number): number {
  const vals = summary.years.map((y, i) => (y >= from && y <= to ? arr[i] : null)).filter((v): v is number => v !== null)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN
}

/** Yearly array -> {year, value}[] without nulls. */
export function toPoints(summary: Summary, arr: (number | null)[]) {
  return summary.years.map((year, i) => ({ year, value: arr[i] })).filter((p): p is { year: number; value: number } => p.value !== null)
}

/** Summary series for one city or "pl" (mean of all cities). */
export function summarySeries(summary: Summary, cityId: string, key: string): (number | null)[] {
  return cityId === 'pl' ? meanOfCities(summary, key) : summary.cities[cityId][key]
}
