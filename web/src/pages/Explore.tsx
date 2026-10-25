import { useMemo } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { param, useRoute } from '../lib/router.ts'
import { loadMeta, useAsync, useSeries, type Meta } from '../lib/data.ts'
import { aggregate, isPeriod, linearTrend, meanBetween, METRIC_BY_ID, needsExtra, type Period, type Series, type YearValue } from '../lib/metrics.ts'
import { monthNames, num, withUnit } from '../lib/format.ts'
import { useTokens } from '../lib/theme.ts'
import { yAxisFor, yearlyTraces } from '../lib/chartHelpers.ts'
import { Chart } from '../components/Chart.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { CityPicker, FilterBar, MAX_CITIES, MetricSelect, PeriodSelect, Segmented, ThresholdInput, Toggle, YearRange } from '../components/Controls.tsx'

export default function Explore() {
  const meta = useAsync(loadMeta, 'meta')
  const { t } = useI18n()
  return (
    <>
      <PageHead title={t('ex.title')} intro={t('ex.intro')} />
      <Ready loading={meta.loading} error={meta.error}>
        {() => <Content meta={meta.data!} />}
      </Ready>
    </>
  )
}

/** "warszawa,,krakow" -> fixed-length slot array. */
function parseSlots(raw: string, valid: Set<string>): string[] {
  const parts = raw.split(',').map((s) => (valid.has(s) ? s : ''))
  const slots = Array.from({ length: MAX_CITIES }, (_, i) => parts[i] ?? '')
  return slots.some(Boolean) ? slots : ['warszawa', '', '', '', '']
}

function Content({ meta }: { meta: Meta }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const { params, setParams } = useRoute()
  const valid = useMemo(() => new Set(meta.cities.map((c) => c.id)), [meta])
  const slots = parseSlots(param.str(params, 'c', 'warszawa'), valid)
  const metricId = METRIC_BY_ID[params.get('m') ?? ''] ? params.get('m')! : 'tmean'
  const metric = METRIC_BY_ID[metricId]
  const seasonalMetric = metric.kind === 'seasonal'
  const pParam = params.get('p')
  const period: Period = seasonalMetric || !isPeriod(pParam) ? 'year' : pParam
  const thrParam = params.get('t')
  const threshold = thrParam !== null && Number.isFinite(Number(thrParam)) ? Number(thrParam) : null
  const [y0, y1] = meta.fullYears
  const range = param.range(params, 'y', [y0, y1])
  const view = params.get('v') === 'anomaly' ? 'anomaly' : 'values'
  const showRolling = param.str(params, 'r', '1') === '1'
  const showTrend = param.str(params, 'tr', '0') === '1'

  const ids = slots.filter(Boolean)
  const series = useSeries(ids, needsExtra(metric))
  const name = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id

  const thr = threshold ?? (metric.kind === 'daily' ? metric.threshold : undefined)
  const desc = t(`md.${metricId}` as Key, { t: thr === undefined ? '' : num(lang, thr, thr % 1 ? 1 : 0) })

  return (
    <>
      <FilterBar>
        <CityPicker cities={meta.cities} slots={slots} onChange={(s) => setParams({ c: s.join(',').replace(/,+$/, '') })} />
        <MetricSelect value={metricId} onChange={(m) => setParams({ m, t: null })} />
        <PeriodSelect value={period} disabled={seasonalMetric} onChange={(p) => setParams({ p: p === 'year' ? null : p })} />
        <ThresholdInput metricId={metricId} value={threshold} onChange={(v) => setParams({ t: v === null ? null : String(v) })} />
        <YearRange value={range} min={y0} max={y1} onChange={(r) => setParams({ y: r[0] === y0 && r[1] === y1 ? null : `${r[0]}-${r[1]}` })} />
        <Segmented
          label={t('ui.show')}
          value={view}
          onChange={(v) => setParams({ v: v === 'values' ? null : v })}
          options={[
            { value: 'values', label: t('ui.values') },
            { value: 'anomaly', label: lang === 'pl' ? 'Odchylenie od normy' : 'Anomaly' },
          ]}
        />
        <div className="toggles">
          <Toggle checked={showRolling} onChange={(v) => setParams({ r: v ? null : '0' })} label={t('ui.rolling')} />
          <Toggle checked={showTrend} onChange={(v) => setParams({ tr: v ? '1' : null })} label={t('ui.trend')} />
        </div>
      </FilterBar>
      <Ready loading={series.loading} error={series.error}>
        {() => (
          <Results
            meta={meta}
            slots={slots}
            series={series.data!}
            ids={ids}
            metricId={metricId}
            period={period}
            threshold={threshold ?? undefined}
            range={range}
            view={view}
            showRolling={showRolling}
            showTrend={showTrend}
            name={name}
            desc={desc}
            colors={tk.series}
            seasonalNote={seasonalMetric}
          />
        )}
      </Ready>
    </>
  )
}

interface ResultsProps {
  meta: Meta
  slots: string[]
  series: Series[]
  ids: string[]
  metricId: string
  period: Period
  threshold?: number
  range: [number, number]
  view: 'values' | 'anomaly'
  showRolling: boolean
  showTrend: boolean
  name: (id: string) => string
  desc: string
  colors: string[]
  seasonalNote: boolean
}

function Results(p: ResultsProps) {
  const { t, lang } = useI18n()
  const metric = METRIC_BY_ID[p.metricId]
  // A doy-based anomaly is a shift in days, so the unit changes.
  const unit = p.view === 'anomaly' && metric.unit === 'doy' ? 'days' : metric.unit

  const rows = useMemo(() => {
    return p.ids.map((id, k) => {
      const all = aggregate(p.series[k], p.metricId, p.period, p.threshold)
      const base = meanBetween(all, 1961, 1990)
      const pts: YearValue[] = all
        .filter((r) => r.year >= p.range[0] && r.year <= p.range[1])
        .map((r) => ({ year: r.year, value: p.view === 'anomaly' ? r.value - base : r.value }))
      return { id, slot: p.slots.indexOf(id), points: pts, all, base }
    })
  }, [p.ids, p.series, p.metricId, p.period, p.threshold, p.range, p.view, p.slots])

  const traces = rows.flatMap((r) =>
    yearlyTraces({
      name: p.name(r.id),
      color: p.colors[r.slot],
      points: r.points,
      unit,
      rolling: p.showRolling,
      trend: p.showTrend,
      lang,
      rollingLabel: t('ui.rolling'),
      trendLabel: t('ui.trend'),
    }),
  )

  const layout = useMemo(
    () => ({
      yaxis: { ...yAxisFor(unit, lang), ...(p.view === 'anomaly' ? { zeroline: true, zerolinecolor: 'rgba(128,128,128,0.6)' } : {}) },
      xaxis: { dtick: 10 },
      showlegend: rows.length > 1,
    }),
    [unit, lang, p.view, rows.length],
  )

  const periodName = p.period === 'year' ? '' : p.period.startsWith('m') ? monthNames(lang, 'long')[Number(p.period.slice(1)) - 1] : t(`period.${p.period}` as Key)
  const title = `${t(`m.${p.metricId}` as Key)}${periodName ? ' · ' + periodName : ''}`
  const hasData = rows.some((r) => r.points.length)

  const years = Array.from(new Set(rows.flatMap((r) => r.points.map((x) => x.year)))).sort((a, b) => a - b)
  const tableRows = years.map((year) => ({ year, values: rows.map((r) => r.points.find((x) => x.year === year)?.value ?? null) }))
  const columns: Column<(typeof tableRows)[number]>[] = [
    { key: 'year', label: t('ui.year'), value: (r) => r.year },
    ...rows.map((r, k) => ({
      key: r.id,
      label: p.name(r.id),
      align: 'right' as const,
      value: (row: (typeof tableRows)[number]) => (row.values[k] === null ? null : Math.round(row.values[k]! * 100) / 100),
      render: (row: (typeof tableRows)[number]) => withUnit(lang, row.values[k], unit, p.view === 'anomaly'),
    })),
  ]

  return (
    <>
      <Card title={title} note={<>{p.desc} {metric.unit === 'doy' && t('ex.doyNote')} {p.seasonalNote && t('ex.seasonalNote')}</>}>
        <div className="summary-line">
          {rows.map((r) => {
            const trend = linearTrend(r.points).slope * 10
            const then = meanBetween(r.all, 1961, 1990)
            const now = meanBetween(r.all, 2016, 2025)
            return (
              <span className="item" key={r.id}>
                <span className="swatch" style={{ background: p.colors[r.slot] }} aria-hidden="true" />
                <strong>{p.name(r.id)}</strong>
                {t('ex.trendSummary', { from: p.range[0], to: p.range[1] })}: {withUnit(lang, trend, metric.unit === 'doy' ? 'days' : metric.unit, true, metric.unit === 'C' ? 2 : 1)} {t('ui.perDecade')}
                {' · '}1961–1990 → 2016–2025: {withUnit(lang, then, metric.unit)} → {withUnit(lang, now, metric.unit)}
              </span>
            )
          })}
        </div>
        {hasData ? <Chart data={traces} layout={layout} height={420} label={title} /> : <p className="status">{t('ui.noData')}</p>}
      </Card>
      <Card title={t('ui.table')}>
        <DataTable rows={tableRows} columns={columns} caption={title} csvName={`klimat-${p.metricId}-${p.period}.csv`} rowKey={(r) => r.year} initialSort={{ key: 'year', dir: 'desc' }} />
      </Card>
    </>
  )
}
