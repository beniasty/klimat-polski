/**
 * Pre-compute yearly indicators for all cities -> public/data/summary.json,
 * and monthly values -> public/data/monthly.json.
 * Uses the same metrics module as the browser, so numbers always match.
 *
 * Run: npm run summary   (Node 24 runs TypeScript directly)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregate, decode, METRICS, SEASONS, type RawDaily } from '../src/lib/metrics.ts'
import type { Monthly, MonthlyField } from '../src/lib/monthly.ts'

const DATA = join(import.meta.dirname, '..', 'public', 'data')
const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8'))
const [first, last] = meta.fullYears as [number, number]
const years = Array.from({ length: last - first + 1 }, (_, i) => first + i)

const round = (v: number) => Math.round(v * 100) / 100
// Base fields plus ET0/sunshine from daily-extra/ (all measures need the full series here).
const readRaw = (id: string): RawDaily => ({
  ...JSON.parse(readFileSync(join(DATA, 'daily', `${id}.json`), 'utf8')),
  ...JSON.parse(readFileSync(join(DATA, 'daily-extra', `${id}.json`), 'utf8')),
})
const cities: Record<string, Record<string, (number | null)[]>> = {}

for (const city of meta.cities as { id: string; name: string }[]) {
  const raw = readRaw(city.id)
  const s = decode(raw)
  const out: Record<string, (number | null)[]> = {}
  const put = (key: string, rows: { year: number; value: number }[]) => {
    const byYear = new Map(rows.map((r) => [r.year, r.value]))
    out[key] = years.map((y) => (byYear.has(y) ? round(byYear.get(y)!) : null))
  }
  for (const m of METRICS) put(m.id, aggregate(s, m.id, 'year'))
  for (const season of SEASONS) {
    put(`tmean_${season}`, aggregate(s, 'tmean', season))
    put(`precip_${season}`, aggregate(s, 'precip', season))
  }
  cities[city.id] = out
  console.log(`${city.name.padEnd(20)} ok`)
}

writeFileSync(join(DATA, 'summary.json'), JSON.stringify({ years, cities }))
console.log('summary.json written')

// Monthly values (complete months only, incl. the current year) for the "Month" page.
const MONTHLY: Record<MonthlyField, string> = { tmean: 'tmean', precip: 'precip', tmax: 'tmax_abs', tmin: 'tmin_abs', wb: 'water_balance' }
const lastYear = Number(meta.lastDate.slice(0, 4))
const months = (lastYear - first) * 12 + Number(meta.lastDate.slice(5, 7))
const monthly: Monthly = { start: [first, 1], months, cities: {} }
for (const city of meta.cities as { id: string }[]) {
  const s = decode(readRaw(city.id))
  const out = {} as Monthly['cities'][string]
  for (const [field, metricId] of Object.entries(MONTHLY) as [MonthlyField, string][]) {
    const arr: (number | null)[] = new Array(months).fill(null)
    for (let m = 1; m <= 12; m++) {
      for (const r of aggregate(s, metricId, `m${m}`)) {
        const i = (r.year - first) * 12 + m - 1
        if (i >= 0 && i < months) arr[i] = Math.round(r.value * 10) / 10
      }
    }
    out[field] = arr
  }
  monthly.cities[city.id] = out
}
writeFileSync(join(DATA, 'monthly.json'), JSON.stringify(monthly))
console.log('monthly.json written')
