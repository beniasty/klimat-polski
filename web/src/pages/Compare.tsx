import { useMemo } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { param, useRoute } from '../lib/router.ts'
import { loadMeta, useAsync, useSeries, type Meta } from '../lib/data.ts'
import { annualCycle, isPeriod, valuesIn, type Field as F, type Period, type Series } from '../lib/metrics.ts'
import { num } from '../lib/format.ts'
import { useTokens } from '../lib/theme.ts'
import { monthAxis } from '../lib/chartHelpers.ts'
import { Chart } from '../components/Chart.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { CitySelect, Field, FilterBar, PeriodSelect, YearRange } from '../components/Controls.tsx'

const FIELDS: F[] = ['tmean', 'tmax', 'tmin']

export default function Compare() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  return (
    <>
      <PageHead title={t('cmp.title')} intro={t('cmp.intro')} />
      <Ready loading={meta.loading} error={meta.error}>
        {() => <Content meta={meta.data!} />}
      </Ready>
    </>
  )
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo)
}

function Content({ meta }: { meta: Meta }) {
  const { t } = useI18n()
  const { params, setParams } = useRoute()
  const city = meta.cities.some((c) => c.id === params.get('c')) ? params.get('c')! : 'warszawa'
  const field = (FIELDS.includes(params.get('f') as F) ? params.get('f') : 'tmax') as F
  const pParam = params.get('p')
  const period: Period = isPeriod(pParam) ? pParam : 'year'
  const [y0, y1] = meta.fullYears
  const a = param.range(params, 'a', [1961, 1990])
  const b = param.range(params, 'b', [2016, 2025])
  const series = useSeries([city])

  return (
    <>
      <FilterBar>
        <CitySelect cities={meta.cities} value={city} onChange={(c) => setParams({ c })} />
        <Field label={t('cmp.field')}>
          <select value={field} onChange={(e) => setParams({ f: e.target.value })}>
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {t(`f.${f}` as Key)}
              </option>
            ))}
          </select>
        </Field>
        <PeriodSelect value={period} onChange={(p) => setParams({ p: p === 'year' ? null : p })} />
        <YearRange label={t('cmp.a')} value={a} min={y0} max={y1} onChange={(r) => setParams({ a: `${r[0]}-${r[1]}` })} />
        <YearRange label={t('cmp.b')} value={b} min={y0} max={y1} onChange={(r) => setParams({ b: `${r[0]}-${r[1]}` })} />
      </FilterBar>
      <Ready loading={series.loading} error={series.error}>
        {() => <Results s={series.data![0]} field={field} period={period} a={a} b={b} />}
      </Ready>
    </>
  )
}

function Results({ s, field, period, a, b }: { s: Series; field: F; period: Period; a: [number, number]; b: [number, number] }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const label = (r: [number, number]) => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`)
  const la = label(a)
  const lb = label(b)

  const { va, vb, bins } = useMemo(() => {
    const va = valuesIn(s, field, a[0], a[1], period).sort((x, y) => x - y)
    const vb = valuesIn(s, field, b[0], b[1], period).sort((x, y) => x - y)
    const lo = Math.floor(Math.min(va[0] ?? 0, vb[0] ?? 0))
    const hi = Math.ceil(Math.max(va[va.length - 1] ?? 0, vb[vb.length - 1] ?? 0))
    const bins = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    return { va, vb, bins }
  }, [s, field, period, a, b])

  const share = (vals: number[]) => {
    const counts = new Array(bins.length).fill(0)
    for (const v of vals) counts[Math.min(bins.length - 1, Math.floor(v) - bins[0])]++
    return counts.map((c) => (vals.length ? (100 * c) / vals.length : 0))
  }
  const hexA = tk.cool
  const hexB = tk.warm
  const fill = (hex: string) => hex + '1f' // ~12% opacity wash

  const dist = [
    { name: la, vals: va, color: hexA },
    { name: lb, vals: vb, color: hexB },
  ].map((d) => ({
    type: 'scatter',
    mode: 'lines',
    x: bins.map((x) => x + 0.5),
    y: share(d.vals),
    name: d.name,
    line: { color: d.color, width: 2, shape: 'hvh' },
    fill: 'tozeroy',
    fillcolor: fill(d.color),
    hovertemplate: `${d.name}: %{y:.1f}%<extra></extra>`,
  }))

  const cycA = annualCycle(s, field, a[0], a[1])
  const cycB = annualCycle(s, field, b[0], b[1])
  const days = cycA.map((_, i) => i)
  const cycle = [
    { name: la, y: cycA, color: hexA },
    { name: lb, y: cycB, color: hexB },
  ].map((d) => ({
    type: 'scatter',
    mode: 'lines',
    x: days,
    y: d.y,
    name: d.name,
    line: { color: d.color, width: 2 },
    hovertemplate: `${d.name}: %{y:.1f} °C<extra></extra>`,
  }))

  const p90a = quantile(va, 0.9)
  const above = (vals: number[]) => (vals.length ? (100 * vals.filter((v) => v > p90a).length) / vals.length : NaN)
  const stats = [
    { k: t('cmp.mean'), a: va.reduce((x, y) => x + y, 0) / va.length, b: vb.reduce((x, y) => x + y, 0) / vb.length, unit: '°C' },
    { k: t('cmp.p10'), a: quantile(va, 0.1), b: quantile(vb, 0.1), unit: '°C' },
    { k: t('cmp.p90'), a: p90a, b: quantile(vb, 0.9), unit: '°C' },
    {
      k: lang === 'pl' ? `Dni cieplejsze niż 90. percentyl okresu A (${num(lang, p90a)} °C)` : `Days warmer than period A's 90th percentile (${num(lang, p90a)} °C)`,
      a: above(va),
      b: above(vb),
      unit: '%',
    },
  ]

  const title = t(`f.${field}` as Key)
  return (
    <>
      <div className="grid-2">
        <Card title={`${t('cmp.dist')}: ${title}`}>
          <Chart
            data={dist}
            layout={{ showlegend: true, xaxis: { title: { text: '°C' }, dtick: 5 }, yaxis: { title: { text: '%' }, rangemode: 'tozero' }, hovermode: 'x unified' }}
            height={360}
            label={`${t('cmp.dist')} ${la} / ${lb}`}
          />
        </Card>
        <Card title={`${t('cmp.cycle')}: ${title}`}>
          <Chart data={cycle} layout={{ showlegend: true, xaxis: monthAxis(lang), yaxis: { ticksuffix: '°' } }} height={360} label={`${t('cmp.cycle')} ${la} / ${lb}`} />
        </Card>
      </div>
      <Card title={`${la} vs ${lb}`}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">
                  <button type="button" disabled>
                    &nbsp;
                  </button>
                </th>
                <th scope="col" className="num">
                  <button type="button" disabled>
                    {t('cmp.a')}: {la}
                  </button>
                </th>
                <th scope="col" className="num">
                  <button type="button" disabled>
                    {t('cmp.b')}: {lb}
                  </button>
                </th>
                <th scope="col" className="num">
                  <button type="button" disabled>
                    {t('cmp.diff')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {stats.map((r) => (
                <tr key={r.k}>
                  <th scope="row">{r.k}</th>
                  <td className="num">
                    {num(lang, r.a)} {r.unit}
                  </td>
                  <td className="num">
                    {num(lang, r.b)} {r.unit}
                  </td>
                  <td className="num">
                    {num(lang, r.b - r.a, 1, true)} {r.unit === '%' ? (lang === 'pl' ? 'pp' : 'pp') : r.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          {lang === 'pl'
            ? `Liczba dni w próbie: A ${va.length.toLocaleString('pl-PL')}, B ${vb.length.toLocaleString('pl-PL')}.`
            : `Days in sample: A ${va.length.toLocaleString('en-GB')}, B ${vb.length.toLocaleString('en-GB')}.`}
        </p>
      </Card>
    </>
  )
}
