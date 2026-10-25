import type { ReactNode } from 'react'
import { useI18n } from '../lib/i18n.tsx'
import { useRoute } from '../lib/router.ts'
import { summarySeries, toPoints, type Meta, type Summary } from '../lib/data.ts'
import { monthStat, polandSeries, rankStat, type Monthly } from '../lib/monthly.ts'
import { monthNames, num, ordinal } from '../lib/format.ts'
import { stripeColor } from '../lib/colors.ts'
import { useTokens } from '../lib/theme.ts'
import { Chart } from '../components/Chart.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card } from '../components/Status.tsx'
import { Field, FilterBar } from '../components/Controls.tsx'

interface Row {
  id: string
  name: string
  temp: number
  anom: number
  rank: number
  precip: number | null
  pct: number | null
  wb: number | null
  hot: number | null
}

/** "Year in review": one full year against the 1961–1990 normal (Poland = mean of the cities). */
export function YearView({ meta, summary, m, modeSwitch }: { meta: Meta; summary: Summary; m: Monthly; modeSwitch: ReactNode }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const { params, setParams } = useRoute()
  const baseline = meta.baseline
  const years = summary.years
  const last = years[years.length - 1]
  const yParam = Number(params.get('y'))
  const y = years.includes(yParam) ? yParam : last
  const first = years[0]
  const cityName = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id

  const stat = (city: string, key: string) => rankStat(toPoints(summary, summarySeries(summary, city, key)), y, baseline)
  const temp = stat('pl', 'tmean')!
  const precip = stat('pl', 'precip')
  const wb = stat('pl', 'water_balance')
  const hot = stat('pl', 'hot_days')
  const ice = stat('pl', 'ice_days')
  const hdd = stat('pl', 'hdd')

  // Months of the year relative to their own normal.
  const names = monthNames(lang, 'long')
  const plT = polandSeries(m, 'tmean')
  const months = names
    .map((name, k) => {
      const s = monthStat(m, plT, [y, k + 1], baseline)
      return s ? { name, d: s.value - s.normal } : null
    })
    .filter((x): x is { name: string; d: number } => x !== null)
  const warmestMonth = months.reduce((a, b) => (b.d > a.d ? b : a), months[0])
  const coldestMonth = months.reduce((a, b) => (b.d < a.d ? b : a), months[0])

  // Extremes over all cities.
  const byCity = (key: string) =>
    meta.cities
      .map((c) => ({ city: c.id, value: summary.cities[c.id][key][years.indexOf(y)] }))
      .filter((d): d is { city: string; value: number } => d.value !== null)
  const pick = (key: string, dir: 1 | -1) => byCity(key).reduce((a, b) => (dir * (b.value - a.value) > 0 ? b : a))
  const hi = pick('tmax_abs', 1)
  const lo = pick('tmin_abs', -1)
  const wave = pick('heatwave_max', 1)

  const history = toPoints(summary, summarySeries(summary, 'pl', 'tmean')).map((d) => ({ year: d.year, anom: d.value - temp.normal }))

  const rows: Row[] = meta.cities.map((c) => {
    const s = stat(c.id, 'tmean')!
    const p = stat(c.id, 'precip')
    return {
      id: c.id,
      name: c.name,
      temp: s.value,
      anom: s.value - s.normal,
      rank: s.rank,
      precip: p?.value ?? null,
      pct: p && p.normal > 0 ? (100 * p.value) / p.normal : null,
      wb: stat(c.id, 'water_balance')?.value ?? null,
      hot: stat(c.id, 'hot_days')?.value ?? null,
    }
  })
  const columns: Column<Row>[] = [
    { key: 'name', label: t('ui.city'), value: (r) => r.name, align: 'left' },
    { key: 'temp', label: t('month.col.temp'), value: (r) => r.temp, render: (r) => `${num(lang, r.temp)} °C` },
    { key: 'anom', label: t('month.col.anom'), value: (r) => r.anom, render: (r) => `${num(lang, r.anom, 1, true)} °C` },
    { key: 'rank', label: t('month.col.rank'), value: (r) => r.rank, render: (r) => ordinal(lang, r.rank) },
    { key: 'precip', label: t('month.col.precip'), value: (r) => r.precip, render: (r) => `${num(lang, r.precip, 0)} mm` },
    { key: 'pct', label: t('month.col.pct'), value: (r) => r.pct, render: (r) => `${num(lang, r.pct, 0)}%` },
    { key: 'wb', label: t('month.col.wb'), value: (r) => r.wb, render: (r) => `${num(lang, r.wb, 0, true)} mm` },
    { key: 'hot', label: t('year.col.hot'), value: (r) => r.hot, render: (r) => num(lang, r.hot, 0) },
  ]
  const days = (v: number) => `${num(lang, v, 0)} ${lang === 'pl' ? 'dni' : 'days'}`

  return (
    <>
      <FilterBar>
        {modeSwitch}
        <Field label={lang === 'pl' ? 'Rok' : 'Year'}>
          <select value={y} onChange={(e) => setParams({ y: Number(e.target.value) === last ? null : e.target.value })}>
            {[...years].reverse().map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>

      <Card title={t('year.headline', { y, d: num(lang, temp.value - temp.normal, 1, true) })}>
        <div className="kpis kpis-4">
          <div className="kpi">
            <div className="kpi-label">{t('month.temp')}</div>
            <div className="kpi-values">
              <span className="kpi-after">{num(lang, temp.value)} °C</span>
            </div>
            <div className="kpi-sub">
              {t('month.vsNormal', { d: num(lang, temp.value - temp.normal, 1, true) })} · {t('month.rankWarm', { rank: ordinal(lang, temp.rank), first })}
            </div>
          </div>
          {precip && (
            <div className="kpi">
              <div className="kpi-label">{t('month.precip')}</div>
              <div className="kpi-values">
                <span className="kpi-after">{num(lang, precip.value, 0)} mm</span>
              </div>
              <div className="kpi-sub">
                {t('month.pctNormal', { p: num(lang, (100 * precip.value) / precip.normal, 0) })} · {t('month.rankWet', { rank: ordinal(lang, precip.rank), first })}
              </div>
              {wb && (
                <div className="kpi-sub">
                  {t('month.wb', { v: num(lang, wb.value, 0, true), n: num(lang, wb.normal, 0, true) })} · {t('month.rankDry', { rank: ordinal(lang, wb.rankLow), first })}
                </div>
              )}
            </div>
          )}
          {hot && (
            <div className="kpi">
              <div className="kpi-label">{t('year.hot')}</div>
              <div className="kpi-values">
                <span className="kpi-after">{days(hot.value)}</span>
              </div>
              <div className="kpi-sub">{t('year.normal', { n: num(lang, hot.normal, 1) })}</div>
            </div>
          )}
          {ice && (
            <div className="kpi">
              <div className="kpi-label">{t('year.ice')}</div>
              <div className="kpi-values">
                <span className="kpi-after">{days(ice.value)}</span>
              </div>
              <div className="kpi-sub">{t('year.normal', { n: num(lang, ice.normal, 1) })}</div>
            </div>
          )}
        </div>
        <ul className="facts">
          {months.length > 0 && <li>{t('year.months', { warm: warmestMonth.name, dw: num(lang, warmestMonth.d, 1, true), cold: coldestMonth.name, dc: num(lang, coldestMonth.d, 1, true) })}</li>}
          <li>{t('year.extremes', { hi: num(lang, hi.value), hiCity: cityName(hi.city), lo: num(lang, lo.value), loCity: cityName(lo.city) })}</li>
          <li>{wave.value >= 3 ? t('year.heatwave', { n: wave.value, hiCity: cityName(wave.city) }) : t('year.noHeatwave')}</li>
          {hdd && <li>{t('year.hdd', { p: num(lang, (100 * (hdd.value - hdd.normal)) / hdd.normal, 0, true) })}</li>}
        </ul>
        <h3 className="sub">{t('year.chart')}</h3>
        <Chart
          data={[
            {
              type: 'bar',
              x: history.map((d) => d.year),
              y: history.map((d) => d.anom),
              marker: {
                color: history.map((d) => stripeColor(d.anom)),
                line: { color: tk.ink, width: history.map((d) => (d.year === y ? 2 : 0)) },
                cornerradius: 3,
              },
              hovertemplate: '%{x}: %{y:+.1f} °C<extra></extra>',
            },
          ]}
          layout={{ yaxis: { ticksuffix: '°' }, xaxis: { dtick: 10 }, hovermode: 'closest', bargap: 0.2 }}
          height={280}
          label={t('year.chart')}
        />
      </Card>

      <Card title={t('month.cities')} note={t('year.note', { first, n: meta.cities.length })}>
        <DataTable rows={rows} columns={columns} caption={`${t('month.cities')} · ${y}`} csvName={`klimat-rok-${y}.csv`} rowKey={(r) => r.id} initialSort={{ key: 'anom', dir: 'desc' }} maxHeight={640} />
      </Card>
    </>
  )
}
