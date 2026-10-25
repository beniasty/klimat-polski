/**
 * Climate quiz: questions generated from summary.json, so they stay true as data updates.
 * Pure functions; `rand` is injectable for tests.
 */
import type { Summary } from './data.ts'

export type Question =
  | { kind: 'warmerYear'; city: string; options: [number, number]; values: [number, number]; answer: number }
  | { kind: 'warmestCity'; year: number; options: string[]; values: number[]; answer: number }
  | { kind: 'hotDays'; city: string; period: [number, number]; options: number[]; answer: number }

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length

function shuffle<T>(list: T[], rand: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pick = <T>(list: T[], rand: () => number) => list[Math.floor(rand() * list.length)]

/** Two years in one city, at least 0.5 °C apart, so the answer is clear. */
function warmerYear(s: Summary, rand: () => number): Question {
  const city = pick(Object.keys(s.cities), rand)
  const pts = s.years.map((y, i) => ({ y, v: s.cities[city].tmean[i] })).filter((p): p is { y: number; v: number } => p.v !== null)
  for (let tries = 0; ; tries++) {
    const [a, b] = [pick(pts, rand), pick(pts, rand)]
    if (a.y !== b.y && (Math.abs(a.v - b.v) >= 0.5 || tries > 200)) {
      const answer = a.v > b.v ? 0 : 1
      return { kind: 'warmerYear', city, options: [a.y, b.y], values: [a.v, b.v], answer }
    }
  }
}

/** Four cities in one year: which was warmest (clear winner by ≥ 0.2 °C). */
function warmestCity(s: Summary, rand: () => number): Question {
  for (let tries = 0; ; tries++) {
    const i = Math.floor(rand() * s.years.length)
    const cities = shuffle(Object.keys(s.cities), rand).slice(0, 4)
    const values = cities.map((c) => s.cities[c].tmean[i])
    if (values.some((v) => v === null)) continue
    const sorted = [...(values as number[])].sort((a, b) => b - a)
    if (sorted[0] - sorted[1] < 0.2 && tries < 200) continue
    return { kind: 'warmestCity', year: s.years[i], options: cities, values: values as number[], answer: (values as number[]).indexOf(sorted[0]) }
  }
}

/** Average hot days a year in a recent period: one right number and three spread-out decoys. */
function hotDays(s: Summary, rand: () => number): Question {
  const period: [number, number] = [2016, Math.min(2025, s.years[s.years.length - 1])]
  const city = pick(Object.keys(s.cities), rand)
  const vals = s.years.map((y, i) => (y >= period[0] && y <= period[1] ? s.cities[city].hot_days[i] : null)).filter((v): v is number => v !== null)
  const right = Math.round(mean(vals))
  const step = Math.max(2, Math.round(right * 0.6))
  const decoys = shuffle([right - step, right + step, right + 2 * step, right - 2 * step, right + 3 * step].filter((v) => v >= 0 && v !== right), rand).slice(0, 3)
  const options = shuffle([right, ...decoys], rand)
  return { kind: 'hotDays', city, period, options, answer: options.indexOf(right) }
}

/** A round of `n` questions, mixing the kinds. */
export function makeQuiz(s: Summary, n = 6, rand: () => number = Math.random): Question[] {
  const makers = [warmerYear, warmestCity, hotDays]
  // No repeats within a round: the same city (or year) is not asked twice for one kind.
  const key = (q: Question) => `${q.kind}:${'city' in q ? q.city : q.year}`
  const seen = new Set<string>()
  return Array.from({ length: n }, (_, k) => {
    let q = makers[k % makers.length](s, rand)
    for (let tries = 0; seen.has(key(q)) && tries < 50; tries++) q = makers[k % makers.length](s, rand)
    seen.add(key(q))
    return q
  })
}

/** Small seeded generator (mulberry32), for repeatable rounds in tests. */
export function seeded(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
