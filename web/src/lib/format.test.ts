import { describe, expect, it } from 'vitest'
import { withUnit } from './format.ts'

describe('withUnit days', () => {
  it('uses the right Polish form', () => {
    expect(withUnit('pl', 1, 'days')).toBe('1 dzień')
    expect(withUnit('pl', 2, 'days')).toBe('2 dni')
    expect(withUnit('pl', 25, 'days')).toBe('25 dni')
    expect(withUnit('pl', 0.7, 'days', false, 1)).toBe('0,7 dnia')
    expect(withUnit('pl', 1.04, 'days', false, 1)).toBe('1,0 dnia')
    expect(withUnit('pl', -1, 'days', true)).toBe('−1 dzień')
  })

  it('uses day/days in English', () => {
    expect(withUnit('en', 1, 'days')).toBe('1 day')
    expect(withUnit('en', 3, 'days')).toBe('3 days')
  })
})
