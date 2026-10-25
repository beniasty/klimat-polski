import { describe, expect, it } from 'vitest'
import { eaqiLevel, parseAirNow } from './air.ts'

describe('air', () => {
  it('maps the European AQI to its bands', () => {
    expect([0, 20, 21, 40, 59, 80, 100, 101, 250].map(eaqiLevel)).toEqual([0, 0, 1, 1, 2, 3, 4, 5, 5])
  })

  it('parses current values and keeps the forecast from the current hour on', () => {
    const now = parseAirNow({
      current: { time: '2026-10-25T14:00', european_aqi: 33, pm2_5: 12.5, pm10: 20, nitrogen_dioxide: 9, ozone: 50 },
      hourly: { time: ['2026-10-25T13:00', '2026-10-25T14:00', '2026-10-25T15:00', '2026-10-25T16:00'], european_aqi: [30, 33, null, 41] },
    })
    expect(now.eaqi).toBe(33)
    expect(now.values).toEqual({ pm25: 12.5, pm10: 20, no2: 9, o3: 50 })
    expect(now.forecast).toEqual([
      { time: '2026-10-25T14:00', eaqi: 33 },
      { time: '2026-10-25T16:00', eaqi: 41 },
    ])
  })
})
