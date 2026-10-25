/**
 * Embeddable warming stripes (embed.html?c=krakow&lang=en), for <iframe>s on other sites.
 * Plain DOM, no React; only meta.json and summary.json are fetched. No analytics here.
 */
import { stripeColor } from './lib/colors.ts'

type Summary = { years: number[]; cities: Record<string, Record<string, (number | null)[]>> }
type Meta = { baseline: [number, number]; cities: { id: string; name: string }[] }

const params = new URLSearchParams(location.search)
const lang = params.get('lang') === 'en' ? 'en' : 'pl'
document.documentElement.lang = lang
const base = import.meta.env.BASE_URL
const get = <T>(path: string): Promise<T> => fetch(base + 'data/' + path).then((r) => r.json() as Promise<T>)

Promise.all([get<Meta>('meta.json'), get<Summary>('summary.json')]).then(([meta, summary]) => {
  // Unknown or missing city -> Poland (mean of all cities).
  const city = meta.cities.find((c) => c.id === params.get('c'))
  const lists = city ? [summary.cities[city.id].tmean] : Object.values(summary.cities).map((c) => c.tmean)
  const values = summary.years.map((_, i) => {
    const v = lists.map((l) => l[i])
    return v.every((x) => x !== null) ? (v as number[]).reduce((a, b) => a + b, 0) / v.length : null
  })
  const [b0, b1] = meta.baseline
  const inBase = values.filter((v, i) => v !== null && summary.years[i] >= b0 && summary.years[i] <= b1) as number[]
  const normal = inBase.reduce((a, b) => a + b, 0) / inBase.length

  const name = city ? city.name : lang === 'pl' ? 'Polska' : 'Poland'
  const first = summary.years[0]
  const last = summary.years[summary.years.length - 1]
  const title = `${name}, ${first}–${last}`
  document.getElementById('title')!.textContent = title
  const stripes = document.getElementById('stripes')!
  stripes.setAttribute('aria-label', (lang === 'pl' ? 'Paski ocieplenia: ' : 'Warming stripes: ') + title)
  for (const v of values) {
    const s = document.createElement('span')
    s.style.background = v === null ? 'transparent' : stripeColor(v - normal)
    stripes.append(s)
  }
  const link = document.getElementById('link') as HTMLAnchorElement
  link.href = new URL(city ? `./#/overview?c=${city.id}` : './#/overview', location.href).href
  link.title = lang === 'pl' ? 'Zobacz więcej na stronie Klimat Polski' : 'See more on Poland’s Climate'
})
