import { useMemo } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { param, useRoute } from '../lib/router.ts'
import { loadMeta, useAsync, useSeries, type Meta } from '../lib/data.ts'
import { linearTrend, meanBetween, METRICS, seasonal, type SeasonalKey, type Series } from '../lib/metrics.ts'
import { doyLabel, withUnit } from '../lib/format.ts'
import { useTokens } from '../lib/theme.ts'
import { yAxisFor, yearlyTraces } from '../lib/chartHelpers.ts'
import { Chart } from '../components/Chart.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { CitySelect, Field, FilterBar, YearRange } from '../components/Controls.tsx'

const INDICATORS = METRICS.filter((m) => m.kind === 'seasonal').map((m) => m.id as SeasonalKey)

export default function Nature() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  return (
    <>
      <PageHead title={t('nat.title')} intro={t('nat.intro')} />
      <Ready loading={meta.loading} error={meta.error}>
        {() => <Content meta={meta.data!} />}
      </Ready>
    </>
  )
}

function Content({ meta }: { meta: Meta }) {
  const { t } = useI18n()
  const { params, setParams } = useRoute()
  const city = meta.cities.some((c) => c.id === params.get('c')) ? params.get('c')! : 'warszawa'
  const ind = (INDICATORS.includes(params.get('i') as SeasonalKey) ? params.get('i') : 'spring_start') as SeasonalKey
  const [y0, y1] = meta.fullYears
  const range = param.range(params, 'y', [y0, y1])
  const series = useSeries([city])
  return (
    <>
      <FilterBar>
        <CitySelect cities={meta.cities} value={city} onChange={(c) => setParams({ c })} />
        <Field label={t('nat.indicator')}>
          <select value={ind} onChange={(e) => setParams({ i: e.target.value })}>
            {INDICATORS.map((k) => (
              <option key={k} value={k}>
                {t(`m.${k}` as Key)}
              </option>
            ))}
          </select>
        </Field>
        <YearRange value={range} min={y0} max={y1} onChange={(r) => setParams({ y: r[0] === y0 && r[1] === y1 ? null : `${r[0]}-${r[1]}` })} />
      </FilterBar>
      <Ready loading={series.loading} error={series.error}>
        {() => <Results s={series.data![0]} ind={ind} range={range} cityName={meta.cities.find((c) => c.id === city)!.name} />}
      </Ready>
    </>
  )
}

function Results({ s, ind, range, cityName }: { s: Series; ind: SeasonalKey; range: [number, number]; cityName: string }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const rows = useMemo(() => seasonal(s).filter((r) => r.year >= range[0] && r.year <= range[1]), [s, range])
  const unit = ind === 'spring_start' || ind === 'summer_start' || ind === 'last_frost' || ind === 'first_frost' ? 'doy' : 'days'

  // Calendar: one row per year, bar = frost-free period, markers = start of spring / summer.
  const ff = rows.filter((r) => r.last_frost !== null && r.first_frost !== null)
  const calendar = [
    {
      type: 'bar',
      orientation: 'h',
      y: ff.map((r) => r.year),
      base: ff.map((r) => r.last_frost),
      x: ff.map((r) => r.first_frost! - r.last_frost!),
      marker: { color: tk.series[2], opacity: 0.55 },
      name: t('nat.frostFree'),
      customdata: ff.map((r) => `${doyLabel(lang, r.last_frost)} – ${doyLabel(lang, r.first_frost)}`),
      hovertemplate: `${t('nat.frostFree')}: %{customdata}<extra>%{y}</extra>`,
    },
    {
      type: 'scatter',
      mode: 'markers',
      y: rows.map((r) => r.year),
      x: rows.map((r) => r.spring_start),
      marker: { color: tk.series[0], size: 7, symbol: 'circle', line: { color: tk.surface, width: 1.5 } },
      name: t('m.spring_start'),
      customdata: rows.map((r) => doyLabel(lang, r.spring_start)),
      hovertemplate: `${t('m.spring_start')}: %{customdata}<extra>%{y}</extra>`,
    },
    {
      type: 'scatter',
      mode: 'markers',
      y: rows.map((r) => r.year),
      x: rows.map((r) => r.summer_start),
      marker: { color: tk.series[1], size: 7, symbol: 'diamond', line: { color: tk.surface, width: 1.5 } },
      name: t('m.summer_start'),
      customdata: rows.map((r) => doyLabel(lang, r.summer_start)),
      hovertemplate: `${t('m.summer_start')}: %{customdata}<extra>%{y}</extra>`,
    },
  ]
  const monthStarts = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335]
  const calLayout = {
    showlegend: true,
    hovermode: 'closest',
    barmode: 'overlay',
    bargap: 0.15,
    xaxis: { tickvals: monthStarts, ticktext: monthStarts.map((d) => doyLabel(lang, d)), range: [32, 335], showgrid: true },
    yaxis: { autorange: 'reversed', dtick: 10, title: { text: '' } },
  }

  const pts = rows.filter((r) => r[ind] !== null).map((r) => ({ year: r.year, value: r[ind]! }))
  const traces = yearlyTraces({ name: cityName, color: tk.series[0], points: pts, unit, rolling: true, trend: true, lang, rollingLabel: t('ui.rolling'), trendLabel: t('ui.trend') })
  const all = seasonal(s).filter((r) => r[ind] !== null).map((r) => ({ year: r.year, value: r[ind]! }))
  const then = meanBetween(all, 1961, 1990)
  const now = meanBetween(all, 2016, 2025)
  const trend = linearTrend(pts).slope * 10

  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'year', label: t('ui.year'), value: (r) => r.year },
    ...INDICATORS.map((k) => {
      const u = k === 'spring_start' || k === 'summer_start' || k === 'last_frost' || k === 'first_frost' ? 'doy' : 'days'
      return { key: k, label: t(`m.${k}` as Key), align: 'right' as const, value: (r: (typeof rows)[number]) => r[k], render: (r: (typeof rows)[number]) => withUnit(lang, r[k], u) }
    }),
  ]

  return (
    <>
      <Card title={`${t(`m.${ind}` as Key)} · ${cityName}`} note={t(`md.${ind}` as Key)}>
        <div className="summary-line">
          <span className="item">{t('nat.shift', { a: withUnit(lang, then, unit), b: withUnit(lang, now, unit) })}</span>
          <span className="item">
            {t('ui.trend')}: <strong>{withUnit(lang, trend, 'days', true, 1)}</strong> {t('ui.perDecade')}
          </span>
        </div>
        <Chart data={traces} layout={{ yaxis: yAxisFor(unit, lang) }} height={360} label={t(`m.${ind}` as Key)} />
      </Card>
      <Card title={`${t('nat.calendar')} · ${cityName}`}>
        <Chart data={calendar} layout={calLayout} height={Math.max(420, rows.length * 9 + 80)} label={t('nat.calendar')} />
      </Card>
      <Card title={t('ui.table')}>
        <DataTable rows={rows} columns={columns} caption={`${t('nat.title')} · ${cityName}`} csvName={`klimat-przyroda-${s.id}.csv`} rowKey={(r) => r.year} initialSort={{ key: 'year', dir: 'desc' }} />
      </Card>
    </>
  )
}
