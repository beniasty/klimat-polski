/**
 * Air quality: long-term comparisons (public/data/air.json, scripts/export_air.py)
 * and live conditions fetched by the browser from Open-Meteo's air-quality API (CAMS).
 */

export type Pollutant = 'pm25' | 'pm10' | 'no2' | 'o3'
export const POLLUTANTS: Pollutant[] = ['pm25', 'pm10', 'no2', 'o3']

export interface AirSummary {
  period: [number, number]
  who: { pm25: number; pm10: number }
  cities: Record<
    string,
    {
      mean: Record<Pollutant, number>
      months: Record<Pollutant, number[]>
      whoDays: { pm25: number; pm10: number }
      season: { winter: number; summer: number }
    }
  >
}

/** European Air Quality Index bands (as used by Open-Meteo), with the EEA colours. */
export const EAQI_BANDS = [
  { max: 20, color: '#50f0e6' },
  { max: 40, color: '#50ccaa' },
  { max: 60, color: '#f0e641' },
  { max: 80, color: '#ff5050' },
  { max: 100, color: '#960032' },
  { max: Infinity, color: '#7d2181' },
] as const

/** 0 = good … 5 = extremely poor. */
export function eaqiLevel(v: number): number {
  return EAQI_BANDS.findIndex((b) => v <= b.max)
}

export interface AirNow {
  time: string
  eaqi: number
  values: Record<Pollutant, number>
  forecast: { time: string; eaqi: number }[]
}

const API = 'https://air-quality-api.open-meteo.com/v1/air-quality'
const VARS: Record<Pollutant, string> = { pm25: 'pm2_5', pm10: 'pm10', no2: 'nitrogen_dioxide', o3: 'ozone' }

/** Current conditions and a 4-day hourly EAQI forecast for one point. */
export async function fetchAirNow(lat: number, lon: number): Promise<AirNow> {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: ['european_aqi', ...Object.values(VARS)].join(','),
    hourly: 'european_aqi',
    forecast_days: '4',
    timezone: 'Europe/Warsaw',
  })
  const res = await fetch(`${API}?${q}`)
  if (!res.ok) throw new Error(`${res.status} air-quality API`)
  return parseAirNow(await res.json())
}

export function parseAirNow(j: {
  current: Record<string, number | string>
  hourly: { time: string[]; european_aqi: (number | null)[] }
}): AirNow {
  const values = Object.fromEntries(POLLUTANTS.map((p) => [p, Number(j.current[VARS[p]])])) as Record<Pollutant, number>
  const now = String(j.current.time)
  const forecast = j.hourly.time
    .map((time, i) => ({ time, eaqi: j.hourly.european_aqi[i] }))
    .filter((d): d is { time: string; eaqi: number } => d.eaqi !== null && d.time >= now.slice(0, 13))
  return { time: now, eaqi: Number(j.current.european_aqi), values, forecast }
}
