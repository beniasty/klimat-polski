/**
 * Colour scales. Sequential = one hue light→dark; diverging = two poles + neutral gray.
 * Map dots are always labelled and backed by a table, so colour is never the only channel.
 */

type Stop = [number, string]

function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('')
}

function scale(stops: Stop[], v: number): string {
  if (v <= stops[0][0]) return stops[0][1]
  for (let i = 1; i < stops.length; i++) {
    const [b, cb] = stops[i]
    const [a, ca] = stops[i - 1]
    if (v <= b) return lerpHex(ca, cb, (v - a) / (b - a))
  }
  return stops[stops.length - 1][1]
}

/** Warming stripes: anomaly in °C → blue (cold) … gray … red (warm). */
const STRIPES: Stop[] = [
  [-2.0, '#184f95'],
  [-1.0, '#6da7ec'],
  [0.0, '#e6e5e0'],
  [1.2, '#ee8a89'],
  [2.4, '#d03b3b'],
  [3.3, '#8c1f1f'],
]
export const stripeColor = (anomaly: number) => scale(STRIPES, anomaly)

/** Heat-map anomalies (monthly values swing more than yearly ones). */
const HEAT: Stop[] = [
  [-6, '#184f95'],
  [-3, '#6da7ec'],
  [0, '#e6e5e0'],
  [3, '#ee8a89'],
  [6, '#a62a2a'],
]
export const heatmapColorscale = (min = -6, max = 6): [number, string][] =>
  HEAT.map(([v, c]) => [(v - min) / (max - min), c])

/** Sequential ramps (light → dark), 6 steps. */
export const RAMPS = {
  warm: ['#fbe0df', '#f5b3b2', '#ec8180', '#e34948', '#b83332', '#7f1f1f'],
  cold: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95'],
  wet: ['#d4efe5', '#9fdcc5', '#5fc6a0', '#1baf7a', '#14855d', '#0d5c40'],
}
/** Diverging for "change" maps: less ← gray → more. */
export const DIVERGING = ['#256abf', '#6da7ec', '#b9d4f2', '#e6e5e0', '#f2b9b8', '#e9706f', '#b83332']

export interface Binned {
  colors: string[]
  edges: number[] // length colors.length + 1
  color: (v: number) => string
}

/** Split [min,max] into equal bins of a ramp. */
export function binSequential(values: number[], ramp: string[]): Binned {
  const fin = values.filter(Number.isFinite)
  const min = Math.min(...fin)
  const max = Math.max(...fin)
  const n = ramp.length
  const step = (max - min) / n || 1
  const edges = Array.from({ length: n + 1 }, (_, i) => min + i * step)
  return {
    colors: ramp,
    edges,
    color: (v) => ramp[Math.min(n - 1, Math.max(0, Math.floor((v - min) / step)))],
  }
}

/** Symmetric bins around zero. */
export function binDiverging(values: number[]): Binned {
  const fin = values.filter(Number.isFinite)
  const m = Math.max(...fin.map(Math.abs)) || 1
  const n = DIVERGING.length
  const step = (2 * m) / n
  const edges = Array.from({ length: n + 1 }, (_, i) => -m + i * step)
  return {
    colors: DIVERGING,
    edges,
    color: (v) => DIVERGING[Math.min(n - 1, Math.max(0, Math.floor((v + m) / step)))],
  }
}

/** Ink colour readable on top of a given fill. */
export function inkOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.55 ? '#0b0b0b' : '#ffffff'
}
