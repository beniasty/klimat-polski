import { describe, expect, it } from 'vitest'
import { extreme, indexOf, lastComplete, monthAt, monthStat, parseMonth, polandSeries, sameMonth, ymString, type Monthly } from './monthly.ts'

// Two cities, Jan 2000 – Mar 2002 (27 months); March 2002 is missing for city b.
const months = 27
const series = (f: (i: number) => number | null) => Array.from({ length: months }, (_, i) => f(i))
const m: Monthly = {
  start: [2000, 1],
  months,
  cities: {
    a: { tmean: series((i) => i), precip: series(() => 10), tmax: series((i) => i + 5), tmin: series((i) => i - 5), wb: series(() => 0) },
    b: { tmean: series((i) => (i === 26 ? null : i + 2)), precip: series(() => 20), tmax: series((i) => i + 9), tmin: series((i) => i - 1), wb: series(() => 0) },
  },
}

describe('monthly', () => {
  it('maps months to indexes and back', () => {
    expect(indexOf(m, [2001, 2])).toBe(13)
    expect(monthAt(m, 13)).toEqual([2001, 2])
    expect(ymString([2001, 2])).toBe('2001-02')
  })

  it('averages Poland only when every city has a value', () => {
    const pl = polandSeries(m, 'tmean')
    expect(pl[0]).toBe(1)
    expect(pl[26]).toBeNull()
  })

  it('finds the last complete month and validates URL months', () => {
    expect(lastComplete(m)).toEqual([2002, 2])
    expect(parseMonth(m, '2001-05')).toEqual([2001, 5])
    expect(parseMonth(m, '2002-03')).toBeNull() // incomplete
    expect(parseMonth(m, '1999-12')).toBeNull() // before the data
    expect(parseMonth(m, '2001-13')).toBeNull()
    expect(parseMonth(m, 'x')).toBeNull()
  })

  it('collects the same calendar month and ranks it', () => {
    const pl = polandSeries(m, 'tmean')
    expect(sameMonth(m, pl, 2).map((d) => d.year)).toEqual([2000, 2001, 2002])
    // February: 2, 14, 26 -> 2002 is the warmest of 3; normal over 2000–2001 = 8.
    expect(monthStat(m, pl, [2002, 2], [2000, 2001])).toEqual({ value: 26, normal: 8, rank: 1, rankLow: 3, ofYears: 3 })
    expect(monthStat(m, pl, [2002, 3], [2000, 2001])).toBeNull()
  })

  it('picks the city with the extreme value', () => {
    expect(extreme(m, 'tmax', 0, 'max')).toEqual({ city: 'b', value: 9 })
    expect(extreme(m, 'tmin', 0, 'min')).toEqual({ city: 'a', value: -5 })
  })
})
