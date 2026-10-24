import { useMemo } from 'react'
import { useI18n } from '../lib/i18n.tsx'
import { useRoute } from '../lib/router.ts'
import { loadMeta, loadMonthly, useAsync, type Meta } from '../lib/data.ts'
import { extreme, indexOf, lastComplete, monthStat, parseMonth, polandSeries, sameMonth, ymString, type Monthly, type YearMonth } from '../lib/monthly.ts'
import { dateLabel, monthNames, num, ordinal } from '../lib/format.ts'
import { stripeColor } from '../lib/colors.ts'
import { useTokens } from '../lib/theme.ts'
import { Chart } from '../components/Chart.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { Field, FilterBar } from '../components/Controls.tsx'

export default function Month() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  const monthly = useAsync(loadMonthly, 'monthly')
  return (
    <>
      <PageHead title={t('month.title')} intro={t('month.intro')} />
      <Ready loading={meta.loading || monthly.loading} error={meta.error ?? monthly.error}>
        {() => <Content meta={meta.data!} m={monthly.data!} />}
      </Ready>
    </>
  )
}

interface Row {
  id: string
  name: string
  temp: number
  anom: number
  rank: number
  precip: number | null
  pct: number | null
  max: number | null
  min: number | null
}

function Content({ meta, m }: { meta: Meta; m: Monthly }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const { params, setParams } = useRoute()
  const latest = lastComplete(m)!
  const [y, mo] = parseMonth(m, params.get('m')) ?? latest
  const i = indexOf(m, [y, mo])
  const first = m.start[0]
  const baseline = meta.baseline
  const label = dateLabel(lang, `${ymString([y, mo])}-01`, { month: 'long', year: 'numeric' })
  const Label = label.charAt(0).toUpperCase() + label.slice(1)
  const names = monthNames(lang, 'long')
  const pick = (ym: YearMonth) => {
    // Clamp to the data range: e.g. October 2026 may not be complete yet.
    const ok = parseMonth(m, ymString(ym)) ?? latest
    setParams({ m: ok[0] === latest[0] && ok[1] === latest[1] ? null : ymString(ok) })
  }

  const plT = useMemo(() => polandSeries(m, 'tmean'), [m])
  const plP = useMemo(() => polandSeries(m, 'precip'), [m])
  const temp = monthStat(m, plT, [y, mo], baseline)!
  const precip = monthStat(m, plP, [y, mo], baseline)
  const hi = extreme(m, 'tmax', i, 'max')
  const lo = extreme(m, 'tmin', i, 'min')
  const cityName = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id

  const history = sameMonth(m, plT, mo).map((d) => ({ year: d.year, anom: d.value - temp.normal }))

  const rows: Row[] = meta.cities.map((c) => {
    const s = monthStat(m, m.cities[c.id].tmean, [y, mo], baseline)!
    const p = monthStat(m, m.cities[c.id].precip, [y, mo], baseline)
    return {
      id: c.id,
      name: c.name,
      temp: s.value,
      anom: s.value - s.normal,
      rank: s.rank,
      precip: p?.value ?? null,
      pct: p && p.normal > 0 ? (100 * p.value) / p.normal : null,
      max: m.cities[c.id].tmax[i],
      min: m.cities[c.id].tmin[i],
    }
  })
  const columns: Column<Row>[] = [
    { key: 'name', label: t('ui.city'), value: (r) => r.name, align: 'left' },
    { key: 'temp', label: t('month.col.temp'), value: (r) => r.temp, render: (r) => `${num(lang, r.temp)} °C` },
    { key: 'anom', label: t('month.col.anom'), value: (r) => r.anom, render: (r) => `${num(lang, r.anom, 1, true)} °C` },
    { key: 'rank', label: t('month.col.rank'), value: (r) => r.rank, render: (r) => ordinal(lang, r.rank) },
    { key: 'precip', label: t('month.col.precip'), value: (r) => r.precip, render: (r) => `${num(lang, r.precip, 0)} mm` },
    { key: 'pct', label: t('month.col.pct'), value: (r) => r.pct, render: (r) => `${num(lang, r.pct, 0)}%` },
    { key: 'max', label: t('month.col.max'), value: (r) => r.max, render: (r) => `${num(lang, r.max)} °C` },
    { key: 'min', label: t('month.col.min'), value: (r) => r.min, render: (r) => `${num(lang, r.min)} °C` },
  ]

  const years = Array.from({ length: latest[0] - first + 1 }, (_, k) => first + k)
  return (
    <>
      <FilterBar>
        <Field label={t('month.pick')}>
          <select value={mo} onChange={(e) => pick([y, Number(e.target.value)])}>
            {names.map((n, k) => (
              <option key={k} value={k + 1}>
                {n}
              </option>
            ))}
          </select>
        </Field>
        <Field label={lang === 'pl' ? 'Rok' : 'Year'}>
          <select value={y} onChange={(e) => pick([Number(e.target.value), mo])}>
            {years.map((yy) => (
              <option key={yy} value={yy}>
                {yy}
              </option>
            ))}
          </select>
        </Field>
      </FilterBar>

      <Card title={t('month.headline', { month: Label, d: num(lang, temp.value - temp.normal, 1, true) })}>
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
            </div>
          )}
          {hi && (
            <div className="kpi">
              <div className="kpi-label">{t('month.max')}</div>
              <div className="kpi-values">
                <span className="kpi-after">{num(lang, hi.value)} °C</span>
              </div>
              <div className="kpi-sub">{cityName(hi.city)}</div>
            </div>
          )}
          {lo && (
            <div className="kpi">
              <div className="kpi-label">{t('month.min')}</div>
              <div className="kpi-values">
                <span className="kpi-after">{num(lang, lo.value)} °C</span>
              </div>
              <div className="kpi-sub">{cityName(lo.city)}</div>
            </div>
          )}
        </div>
        <h3 className="sub">{t('month.chart', { name: names[mo - 1] })}</h3>
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
          label={t('month.chart', { name: names[mo - 1] })}
        />
      </Card>

      <Card title={t('month.cities')} note={t('month.note', { first, n: meta.cities.length })}>
        <DataTable rows={rows} columns={columns} caption={`${t('month.cities')} · ${label}`} csvName={`klimat-miesiac-${ymString([y, mo])}.csv`} rowKey={(r) => r.id} initialSort={{ key: 'anom', dir: 'desc' }} maxHeight={640} />
      </Card>
    </>
  )
}
