import { useMemo } from 'react'
import { useI18n } from '../lib/i18n.tsx'
import { href, param, useRoute } from '../lib/router.ts'
import { loadMeta, loadRecords, loadSummary, meanOfCities, rangeMean, toPoints, useAsync, useSeries, type DayRecord, type Meta } from '../lib/data.ts'
import { aggregate, meanBetween, monthlyAnomalies, topDays, type DayValue, type Field, type Series } from '../lib/metrics.ts'
import { dateLabel, monthNames, num } from '../lib/format.ts'
import { heatmapColorscale } from '../lib/colors.ts'
import { useTokens } from '../lib/theme.ts'
import { Chart } from '../components/Chart.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { CitySelect, FilterBar, YearRange } from '../components/Controls.tsx'

export default function Records() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  return (
    <>
      <PageHead title={t('rec.title')} intro={t('rec.intro')} />
      <Ready loading={meta.loading} error={meta.error}>
        {() => <Content meta={meta.data!} />}
      </Ready>
    </>
  )
}

function Content({ meta }: { meta: Meta }) {
  const { params, setParams } = useRoute()
  const city = meta.cities.some((c) => c.id === params.get('c')) ? params.get('c')! : 'warszawa'
  const [y0, y1] = meta.fullYears
  const range = param.range(params, 'y', [y0, y1])
  const series = useSeries([city])
  return (
    <>
      <PolandRecords meta={meta} />
      <FilterBar>
        <CitySelect cities={meta.cities} value={city} onChange={(c) => setParams({ c })} />
        <YearRange value={range} min={y0} max={y1} onChange={(r) => setParams({ y: r[0] === y0 && r[1] === y1 ? null : `${r[0]}-${r[1]}` })} />
      </FilterBar>
      <Ready loading={series.loading} error={series.error}>
        {() => <Results s={series.data![0]} range={range} cityName={meta.cities.find((c) => c.id === city)!.name} />}
      </Ready>
    </>
  )
}

/** Records over all cities: extreme days (one per date) and Poland's warmest and coldest years. */
function PolandRecords({ meta }: { meta: Meta }) {
  const { t, lang } = useI18n()
  const records = useAsync(loadRecords, 'records')
  const summary = useAsync(loadSummary, 'summary')
  if (!records.data || !summary.data) return null
  const name = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id
  const items = (list: DayRecord[]) =>
    list.map((d) => ({
      label: (
        <>
          <a href={href('day', { c: d.city, d: d.date })}>{dateLabel(lang, d.date)}</a>
          <span className="muted sub-label">{name(d.city)}</span>
        </>
      ),
      value: d.value,
    }))
  const pl = meanOfCities(summary.data, 'tmean')
  const base = rangeMean(summary.data, pl, 1961, 1990)
  const years = toPoints(summary.data, pl).map((p) => ({ label: p.year, value: p.value - base }))
  const warm = [...years].sort((a, b) => b.value - a.value).slice(0, 10)
  const fmt = (v: number) => num(lang, v)
  return (
    <>
      <h2 className="section-title">{t('rec.poland')}</h2>
      <p className="note">{t('rec.polandNote', { n: meta.cities.length })}</p>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <TopList title={t('rec.hottest')} items={items(records.data.hottest)} unit="°C" format={fmt} />
        <TopList title={t('rec.coldest')} items={items(records.data.coldest)} unit="°C" format={fmt} />
        <TopList title={t('rec.wettest')} items={items(records.data.wettest)} unit="mm" format={fmt} />
        <TopList title={t('rec.warmYears')} items={warm} unit="°C" format={(v) => num(lang, v, 1, true)} />
      </div>
      <h2 className="section-title">{t('rec.cityTitle')}</h2>
    </>
  )
}

function TopList({ title, items, unit, format }: { title: string; items: { label: React.ReactNode; value: number }[]; unit: string; format: (v: number) => string }) {
  const { t } = useI18n()
  return (
    <Card title={title}>
      <div className="table-scroll">
        <table>
          <tbody>
            {items.map((d, i) => (
              <tr key={i}>
                <td style={{ width: 28, color: 'var(--muted)' }}>{i + 1}</td>
                <th scope="row">{d.label}</th>
                <td className="num">
                  {format(d.value)} {unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="sr-only">{t('rec.rank')}</span>
    </Card>
  )
}

function Results({ s, range, cityName }: { s: Series; range: [number, number]; cityName: string }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const [from, to] = range
  const days = (field: Field, order: 'asc' | 'desc') => topDays(s, field, 10, order, from, to)
  const dayItems = (list: DayValue[]) =>
    list.map((d) => ({ label: <a href={href('day', { c: s.id, d: d.date })}>{dateLabel(lang, d.date)}</a>, value: d.value }))

  const years = useMemo(() => {
    const all = aggregate(s, 'tmean', 'year')
    const base = meanBetween(all, 1961, 1990)
    return all.filter((r) => r.year >= from && r.year <= to).map((r) => ({ year: r.year, value: r.value - base }))
  }, [s, from, to])
  const warm = [...years].sort((a, b) => b.value - a.value).slice(0, 10)
  const cold = [...years].sort((a, b) => a.value - b.value).slice(0, 10)

  const heat = useMemo(() => {
    const a = monthlyAnomalies(s, 'tmean', [1961, 1990])
    const ys = [...a.keys()].filter((y) => y >= from && y <= to).sort((x, y) => x - y)
    const z = Array.from({ length: 12 }, (_, m) => ys.map((y) => {
      const v = a.get(y)![m]
      return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
    }))
    return { ys, z }
  }, [s, from, to])
  const months = monthNames(lang)

  const fmt = (v: number) => num(lang, v)
  return (
    <>
      <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <TopList title={`${t('rec.hottest')} · ${cityName}`} items={dayItems(days('tmax', 'desc'))} unit="°C" format={fmt} />
        <TopList title={`${t('rec.coldest')} · ${cityName}`} items={dayItems(days('tmin', 'asc'))} unit="°C" format={fmt} />
        <TopList title={`${t('rec.wettest')} · ${cityName}`} items={dayItems(days('precip', 'desc'))} unit="mm" format={fmt} />
        <TopList title={`${t('rec.warmYears')} · ${cityName}`} items={warm.map((r) => ({ label: r.year, value: r.value }))} unit="°C" format={(v) => num(lang, v, 1, true)} />
        <TopList title={`${t('rec.coldYears')} · ${cityName}`} items={cold.map((r) => ({ label: r.year, value: r.value }))} unit="°C" format={(v) => num(lang, v, 1, true)} />
      </div>
      <Card title={`${t('rec.heatmap')} · ${cityName}`}>
        <Chart
          data={[
            {
              type: 'heatmap',
              x: heat.ys,
              y: months,
              z: heat.z,
              zmin: -6,
              zmax: 6,
              zmid: 0,
              colorscale: heatmapColorscale(),
              xgap: 1,
              ygap: 1,
              colorbar: { ticksuffix: ' °C', thickness: 10, outlinewidth: 0, tickfont: { color: tk.muted } },
              hovertemplate: '%{y} %{x}: %{z:+.1f} °C<extra></extra>',
            },
          ]}
          layout={{ yaxis: { autorange: 'reversed', showgrid: false }, xaxis: { dtick: 10, showgrid: false }, hovermode: 'closest', plot_bgcolor: tk.surface }}
          height={380}
          label={t('rec.heatmap')}
        />
      </Card>
    </>
  )
}
