/**
 * Share image (Open Graph, 1200×630) -> public/og.png:
 * warming stripes for Poland (mean of the cities), same colours as the site.
 * Plain RGB PNG written with node:zlib, no image library needed.
 *
 * Run: npm run summary   (runs after build-summary.ts, reads summary.json)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { stripeColor } from '../src/lib/colors.ts'

const W = 1200
const H = 630
const DATA = join(import.meta.dirname, '..', 'public', 'data')
const meta = JSON.parse(readFileSync(join(DATA, 'meta.json'), 'utf8'))
const summary: { years: number[]; cities: Record<string, Record<string, (number | null)[]>> } = JSON.parse(
  readFileSync(join(DATA, 'summary.json'), 'utf8'),
)

// Poland = mean of the cities (a year counts only when every city has a value).
const series = Object.values(summary.cities).map((c) => c.tmean)
const poland = summary.years.map((_, i) => {
  const vals = series.map((s) => s[i])
  return vals.every((v) => v !== null) ? (vals as number[]).reduce((a, b) => a + b, 0) / vals.length : null
})
const [b0, b1] = meta.baseline as [number, number]
const inBase = poland.filter((v, i) => v !== null && summary.years[i] >= b0 && summary.years[i] <= b1) as number[]
const base = inBase.reduce((a, b) => a + b, 0) / inBase.length

// One RGB colour per pixel column; stripes share the width as evenly as possible.
const n = poland.length
const columns = Array.from({ length: W }, (_, x) => {
  const v = poland[Math.floor((x * n) / W)]
  const hex = v === null ? '#e6e5e0' : stripeColor(v - base)
  return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
})
const row = Buffer.alloc(1 + W * 3) // filter byte 0 (none) + pixels
columns.forEach(([r, g, b], x) => row.set([r, g, b], 1 + x * 3))
const raw = Buffer.concat(Array.from({ length: H }, () => row))

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr.set([8, 2, 0, 0, 0], 8) // 8-bit, RGB, deflate, no filter, no interlace
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(join(import.meta.dirname, '..', 'public', 'og.png'), png)
console.log(`og.png written (${summary.years[0]}–${summary.years[n - 1]}, ${png.length} bytes)`)
