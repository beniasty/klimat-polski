import { useMemo } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { href, param, useRoute } from '../lib/router.ts'
import { loadMeta, loadSummary, rangeMean, toPoints, useAsync, type Meta, type Summary } from '../lib/data.ts'
import { linearTrend, METRIC_BY_ID, SEASONS, type Season } from '../lib/metrics.ts'
import { binDiverging, binSequential, RAMPS } from '../lib/colors.ts'
import { num, withUnit } from '../lib/format.ts'
import { PolandMap } from '../components/PolandMap.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { Field, FilterBar, MetricSelect, Segmented, YearRange } from '../components/Controls.tsx'

type Stat = 'mean' | 'change' | 'trend'
const SEASONAL_KEYS = new Set(['tmean', 'precip'])

export default function MapPage() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  const summary = useAsync(loadSummary, 'summary')
  return (
    <>
      <PageHead title={t('map.title')} intro={t('map.intro', { n: meta.data?.cities.length ?? 18 })} />
      <Ready loading={meta.loading || summary.loading} error={meta.error ?? summary.error}>
        {() => <Content meta={meta.data!} summary={summary.data!} />}
      </Ready>
    </>
  )
}

interface Row {
  id: string
  name: string
  value: number
  then: number
  now: number
  trend: number
}

function Content({ meta, summary }: { meta: Meta; summary: Summary }) {
  const { t, lang } = useI18n()
  const { params, setParams } = useRoute()
  const metricId = METRIC_BY_ID[params.get('m') ?? ''] ? params.get('m')! : 'tmean'
  const metric = METRIC_BY_ID[metricId]
  const sParam = params.get('s')
  const stat: Stat = sParam === 'mean' || sParam === 'trend' ? sParam : 'change'
  const seasonParam = params.get('p')
  const season = SEASONAL_KEYS.has(metricId) && SEASONS.includes(seasonParam as Season) ? (seasonParam as Season) : null
  const key = season ? `${metricId}_${season}` : metricId
  const [y0, y1] = meta.fullYears
  const range = param.range(params, 'y', [y0, y1])
  // A change in a calendar date is a number of days.
  const valueUnit = stat !== 'mean' && metric.unit === 'doy' ? 'days' : metric.unit

  const rows: Row[] = useMemo(
    () =>
      meta.cities.map((c) => {
        const arr = summary.cities[c.id][key]
        const then = rangeMean(summary, arr, 1961, 1990)
        const now = rangeMean(summary, arr, 2016, 2025)
        const pts = toPoints(summary, arr).filter((p) => p.year >= range[0] && p.year <= range[1])
        const trend = linearTrend(pts).slope * 10
        const value = stat === 'mean' ? rangeMean(summary, arr, range[0], range[1]) : stat === 'change' ? now - then : trend
        return { id: c.id, name: c.name, value, then, now, trend }
      }),
    [meta, summary, key, stat, range],
  )
  const values = Object.fromEntries(rows.map((r) => [r.id, Number.isFinite(r.value) ? r.value : null]))
  const scale = stat === 'mean' ? binSequential(rows.map((r) => r.value), RAMPS[metric.hue]) : binDiverging(rows.map((r) => r.value))
  const signed = stat !== 'mean'
  const digits = stat === 'trend' ? (metric.unit === 'C' ? 2 : 1) : undefined
  // Map labels: numbers only (the legend carries the unit); dates stay as dates.
  const fmt = (v: number | null) =>
    valueUnit === 'doy' ? withUnit(lang, v, 'doy') : num(lang, v, digits ?? (metric.unit === 'C' ? 1 : 0), signed) + (valueUnit === 'C' ? '°' : '')

  const statLabel = t(`map.stat.${stat}` as Key)
  const title = `${t(`m.${metricId}` as Key)}${season ? ' · ' + t(`period.${season}` as Key) : ''}: ${statLabel}${stat !== 'change' ? ` ${range[0]}–${range[1]}` : ''}`

  const columns = ([
    { key: 'name', label: t('ui.city'), value: (r) => r.name, render: (r) => <a href={href('explore', { c: r.id, m: metricId, ...(season ? { p: season } : {}) })}>{r.name}</a> },
    { key: 'value', label: statLabel, align: 'right', value: (r) => round(r.value), render: (r) => withUnit(lang, r.value, valueUnit, signed, digits) },
    { key: 'then', label: '1961–1990', align: 'right', value: (r) => round(r.then), render: (r) => withUnit(lang, r.then, metric.unit) },
    { key: 'now', label: '2016–2025', align: 'right', value: (r) => round(r.now), render: (r) => withUnit(lang, r.now, metric.unit) },
    {
      key: 'trend',
      label: lang === 'pl' ? 'Trend / dekadę' : 'Trend / decade',
      align: 'right',
      value: (r) => round(r.trend),
      render: (r) => withUnit(lang, r.trend, metric.unit === 'doy' ? 'days' : metric.unit, true, metric.unit === 'C' ? 2 : 1),
    },
  ] as Column<Row>[]).filter((c) => !(stat === 'trend' && c.key === 'trend'))

  return (
    <>
      <FilterBar>
        <MetricSelect value={metricId} onChange={(m) => setParams({ m, p: null })} />
        {SEASONAL_KEYS.has(metricId) && (
          <Field label={t('ui.season')}>
            <select value={season ?? 'year'} onChange={(e) => setParams({ p: e.target.value === 'year' ? null : e.target.value })}>
              <option value="year">{t('period.year')}</option>
              {SEASONS.map((s) => (
                <option key={s} value={s}>
                  {t(`period.${s}` as Key)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Segmented
          label={t('map.stat')}
          value={stat}
          onChange={(s) => setParams({ s: s === 'change' ? null : s })}
          options={(['change', 'trend', 'mean'] as Stat[]).map((s) => ({ value: s, label: t(`map.stat.${s}` as Key) }))}
        />
        {stat !== 'change' && <YearRange value={range} min={y0} max={y1} onChange={(r) => setParams({ y: r[0] === y0 && r[1] === y1 ? null : `${r[0]}-${r[1]}` })} />}
      </FilterBar>
      <div className="grid-2">
        <Card title={title} note={t('map.click')}>
          <PolandMap
            meta={meta}
            values={values}
            scale={scale}
            format={fmt}
            formatEdge={(v) => withUnit(lang, v, valueUnit, signed, digits)}
            legendLow={t('map.legendLow')}
            legendHigh={t('map.legendHigh')}
            label={title}
            onSelect={(id) => (window.location.hash = href('explore', { c: id, m: metricId, ...(season ? { p: season } : {}) }))}
          />
        </Card>
        <Card title={t('map.rank')}>
          <DataTable rows={rows} columns={columns} caption={title} csvName={`klimat-mapa-${key}-${stat}.csv`} rowKey={(r) => r.id} initialSort={{ key: 'value', dir: 'desc' }} maxHeight={640} />
        </Card>
      </div>
    </>
  )
}

const round = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null)
