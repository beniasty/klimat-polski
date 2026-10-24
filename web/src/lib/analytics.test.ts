import { describe, expect, it } from 'vitest'
import { pagePath } from './analytics.ts'

describe('pagePath', () => {
  it('keeps the page and drops URL params', () => {
    expect(pagePath('#/explore?c=warszawa&m=tmean')).toBe('/explore')
    expect(pagePath('#/map')).toBe('/map')
  })

  it('treats an empty hash as the overview', () => {
    expect(pagePath('')).toBe('/overview')
    expect(pagePath('#/')).toBe('/overview')
    expect(pagePath('#/?x=1')).toBe('/overview')
  })
})
