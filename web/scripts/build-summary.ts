/**
 * Pre-compute yearly indicators for all cities -> public/data/summary.json.
 * Uses the same metrics module as the browser, so numbers always match.
 *
 * Run: npm run summary   (Node 24 runs TypeScript directly)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregate, decode, METRICS, SEASONS, type RawDaily } from '../src/lib/metrics.ts'

const DATA = join(import.meta.dirname, '..', 'public', 'data')
const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8'))
const [first, last] = meta.fullYears as [number, number]
const years = Array.from({ length: last - first + 1 }, (_, i) => first + i)

const round = (v: number) => Math.round(v * 100) / 100
const cities: Record<string, Record<string, (number | null)[]>> = {}

for (const city of meta.cities as { id: string; name: string }[]) {
  const raw: RawDaily = JSON.parse(readFileSync(join(DATA, 'daily', `${city.id}.json`), 'utf8'))
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
