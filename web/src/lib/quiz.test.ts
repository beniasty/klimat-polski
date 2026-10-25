import { describe, expect, it } from 'vitest'
import { makeQuiz, seeded } from './quiz.ts'
import type { Summary } from './data.ts'

// Five cities, 1990–2025: city k is k °C warmer; hot days rise over time.
const years = Array.from({ length: 36 }, (_, i) => 1990 + i)
const cities = Object.fromEntries(
  ['a', 'b', 'c', 'd', 'e'].map((id, k) => [id, { tmean: years.map((y) => 7 + k + (y - 1990) * 0.05), hot_days: years.map((y) => (y >= 2016 ? 8 : 2)) }]),
)
const s: Summary = { years, cities }

describe('quiz', () => {
  const qs = makeQuiz(s, 30, seeded(42))

  it('mixes the question kinds', () => {
    expect(new Set(qs.map((q) => q.kind))).toEqual(new Set(['warmerYear', 'warmestCity', 'hotDays']))
  })

  it('always points at the right answer', () => {
    for (const q of qs) {
      if (q.kind === 'warmerYear') {
        expect(q.values[q.answer]).toBeGreaterThan(q.values[1 - q.answer])
        expect(Math.abs(q.values[0] - q.values[1])).toBeGreaterThanOrEqual(0.5)
      }
      if (q.kind === 'warmestCity') expect(q.values[q.answer]).toBe(Math.max(...q.values))
      if (q.kind === 'hotDays') {
        expect(q.options[q.answer]).toBe(8)
        expect(new Set(q.options).size).toBe(q.options.length)
      }
    }
  })

  it('does not repeat a question within a round', () => {
    const round = makeQuiz(s, 6, seeded(3))
    const keys = round.map((q) => `${q.kind}:${'city' in q ? q.city : q.year}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('is repeatable with the same seed', () => {
    expect(makeQuiz(s, 6, seeded(7))).toEqual(makeQuiz(s, 6, seeded(7)))
  })
})
