import { useMemo } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { href, param, useRoute } from '../lib/router.ts'
import { loadMeta, loadSummary, rangeMean, useAsync, useSeries, type Meta, type Summary } from '../lib/data.ts'
import { annualCycle, dayStats, METRIC_BY_ID, type Series } from '../lib/metrics.ts'
import { dateLabel, num, ordinal, withUnit } from '../lib/format.ts'
import { useTokens } from '../lib/theme.ts'
import { Chart } from '../components/Chart.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { CitySelect, Field, FilterBar } from '../components/Controls.tsx'

const LIFE_KPIS = ['tmean', 'hot_days', 'tropical_nights', 'ice_days', 'snow_days', 'winter_days'] as const

export default function YourDay() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  const summary = useAsync(loadSummary, 'summary')
  return (
    <>
      <PageHead title={t('day.title')} intro={t('day.intro')} />
      <Ready loading={meta.loading || summary.loading} error={meta.error ?? summary.error}>
        {() => <Content meta={meta.data!} summary={summary.data!} />}
      </Ready>
    </>
  )
}

function Content({ meta, summary }: { meta: Meta; summary: Summary }) {
  const { t } = useI18n()
  const { params, setParams } = useRoute()
  const city = meta.cities.some((c) => c.id === params.get('c')) ? params.get('c')! : 'warszawa'
  const dParam = params.get('d') ?? ''
  // Real calendar date only (rejects e.g. 2026-99-99 or 2026-02-30).
  const parsed = Date.parse(dParam + 'T00:00:00Z')
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dParam) && Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(dParam)
  const date = validDate ? dParam : meta.lastDate
  const birth = param.num(params, 'b', 1990)
  const series = useSeries([city])
  const cityName = meta.cities.find((c) => c.id === city)!.name
  return (
    <>
      <FilterBar>
        <CitySelect cities={meta.cities} value={city} onChange={(c) => setParams({ c })} />
        <Field label={t('day.pick')}>
          <input type="date" value={date} min={meta.firstDate} max={meta.lastDate} onChange={(e) => e.target.value && setParams({ d: e.target.value })} />
        </Field>
        <Field label={t('day.birthYear')}>
          <input
            type="number"
            inputMode="numeric"
            min={1930}
            max={2025}
            defaultValue={birth}
            key={birth}
            onBlur={(e) => setParams({ b: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && setParams({ b: (e.target as HTMLInputElement).value })}
          />
        </Field>
      </FilterBar>
      <Ready loading={series.loading} error={series.error}>
        {() => <DayCard s={series.data![0]} date={date} meta={meta} cityName={cityName} />}
      </Ready>
      <Life summary={summary} city={city} cityName={cityName} birth={birth} />
      <WarmerThan summary={summary} meta={meta} city={city} />
    </>
  )
}

function DayCard({ s, date, meta, cityName }: { s: Series; date: string; meta: Meta; cityName: string }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const st = useMemo(() => dayStats(s, date), [s, date])
  // Typical high on this calendar day (7-day smoothed), then and now; 29 Feb counts as 28 Feb.
  const typical = useMemo(() => {
    const [, m, d] = date.split('-').map(Number)
    const k = Math.min((Date.UTC(2001, m - 1, d === 29 && m === 2 ? 28 : d) - Date.UTC(2001, 0, 1)) / 86_400_000, 364)
    return { then: annualCycle(s, 'tmax', 1961, 1990)[k], now: annualCycle(s, 'tmax', 2016, 2025)[k] }
  }, [s, date])
  if (!st || Number.isNaN(st.values.tmax)) {
    return (
      <Card>
        <p>{t('day.outOfRange', { a: dateLabel(lang, meta.firstDate), b: dateLabel(lang, meta.lastDate) })}</p>
      </Card>
    )
  }
  const year = Number(date.slice(0, 4))
  const md = date.slice(5)
  const sameDay: { year: number; v: number }[] = []
  for (let i = 0; i < s.n; i++) {
    if (String(s.month[i]).padStart(2, '0') + '-' + String(s.day[i]).padStart(2, '0') === md && !Number.isNaN(s.tmax[i])) sameDay.push({ year: s.year[i], v: s.tmax[i] })
  }
  const dayName = dateLabel(lang, date, { day: 'numeric', month: 'long' })
  const v = st.values
  return (
    <Card title={`${dateLabel(lang, date, { dateStyle: 'full' })} · ${cityName}`}>
      <div className="day-values">
        <div>
          <span>{t('day.max')}</span>
          <strong>{num(lang, v.tmax)} °C</strong>
        </div>
        <div>
          <span>{t('day.min')}</span>
          <strong>{num(lang, v.tmin)} °C</strong>
        </div>
        <div>
          <span>{t('day.mean')}</span>
          <strong>{num(lang, v.tmean)} °C</strong>
        </div>
        <div>
          <span>{t('day.precip')}</span>
          <strong>{num(lang, v.precip)} mm</strong>
        </div>
        <div>
          <span>{t('day.snow')}</span>
          <strong>{num(lang, v.snow)} cm</strong>
        </div>
      </div>
      <ul className="facts">
        <li>{st.rank === 1 ? t('day.rankFirst', { date: dayName, n: st.ofYears }) : t('day.rank', { rank: ordinal(lang, st.rank), date: dayName, n: st.ofYears })}</li>
        <li>{t('day.vsNormal', { d: num(lang, v.tmean - st.normal.tmean, 1, true) })}</li>
        <li>
          {t('day.typical', { date: dayName, a: num(lang, typical.then), b: num(lang, typical.now) })}{' '}
          <a href={href('compare', { c: s.id, f: 'tmax' })}>{t('day.typicalLink')}</a>
        </li>
        <li>
          {t('day.record', {
            hi: num(lang, st.recordHigh.value),
            hiY: st.recordHigh.year,
            lo: num(lang, st.recordLow.value),
            loY: st.recordLow.year,
          })}
        </li>
      </ul>
      <h3 className="sub">{`${t('day.sameDay')} (${dayName})`}</h3>
      <Chart
        data={[
          {
            type: 'bar',
            x: sameDay.map((d) => d.year),
            y: sameDay.map((d) => d.v),
            marker: { color: sameDay.map((d) => (d.year === year ? tk.warm : tk.neutral)), cornerradius: 3 },
            hovertemplate: '%{x}: %{y:.1f} °C<extra></extra>',
          },
        ]}
        layout={{ yaxis: { ticksuffix: '°' }, xaxis: { dtick: 10 }, hovermode: 'closest', bargap: 0.2 }}
        height={280}
        label={t('day.sameDay')}
      />
    </Card>
  )
}

function Life({ summary, city, cityName, birth }: { summary: Summary; city: string; cityName: string; birth: number }) {
  const { t, lang } = useI18n()
  const c = summary.cities[city]
  const start = Math.max(birth, summary.years[0])
  const end = start + 9
  const lastYear = summary.years[summary.years.length - 1]
  const tooYoung = !(Number.isFinite(birth) && end + 5 <= lastYear)
  return (
    <Card title={t('day.life')}>
      {tooYoung ? (
        <p>{t('day.lifeTooYoung')}</p>
      ) : (
        <>
          <p className="note" style={{ marginTop: 0 }}>
            {t('day.lifeIntro', { city: cityName })}
          </p>
          <div className="kpis">
            {LIFE_KPIS.map((k) => {
              const unit = METRIC_BY_ID[k].unit
              return (
                <div className="kpi" key={k}>
                  <div className="kpi-label">{t(`ov.k.${k}` as Key)}</div>
                  <div className="kpi-values">
                    <span className="kpi-before">{withUnit(lang, rangeMean(summary, c[k], start, end), unit)}</span>
                    <span className="kpi-arrow" aria-hidden="true">
                      →
                    </span>
                    <span className="kpi-after">{withUnit(lang, rangeMean(summary, c[k], 2016, 2025), unit)}</span>
                  </div>
                  <div className="kpi-sub">
                    {start}–{end} → 2016–2025
                  </div>
                </div>
              )
            })}
          </div>
          {(() => {
            const base = rangeMean(summary, c.tmean, 1961, 1990)
            const life = summary.years.map((y, i) => ({ y, v: c.tmean[i] })).filter((d) => d.y >= Math.max(birth, summary.years[0]) && d.v !== null)
            const warmer = life.filter((d) => d.v! > base).length
            const warmest = life.reduce((a, b) => (b.v! > a.v! ? b : a), life[0])
            return (
              <ul className="facts">
                <li>{t('day.lifeWarmer', { n: warmer, total: life.length })}</li>
                <li>{t('day.lifeWarmest', { y: warmest.y })}</li>
              </ul>
            )
          })()}
        </>
      )}
    </Card>
  )
}

/** Every city's mean temperature in 1961–1990 and 2016–2025 on one axis, the chosen city highlighted. */
function WarmerThan({ summary, meta, city }: { summary: Summary; meta: Meta; city: string }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const rows = meta.cities.map((c) => ({
    id: c.id,
    name: c.name,
    then: rangeMean(summary, summary.cities[c.id].tmean, 1961, 1990),
    now: rangeMean(summary, summary.cities[c.id].tmean, 2016, 2025),
  }))
  const me = rows.find((r) => r.id === city)!
  const top = rows.reduce((a, b) => (b.then > a.then ? b : a))
  const allWarmer = Math.min(...rows.map((r) => r.now)) > top.then
  const k = rows.filter((r) => me.now > r.then).length
  const thenLabel = '1961–1990'
  const nowLabel = '2016–2025'
  const dots = (key: 'then' | 'now', color: string) => ({
    type: 'scatter' as const,
    mode: 'markers' as const,
    x: rows.map((r) => r[key]),
    y: rows.map(() => (key === 'then' ? thenLabel : nowLabel)),
    text: rows.map((r) => r.name),
    marker: {
      color: rows.map((r) => (r.id === city ? tk.ink : color)),
      size: rows.map((r) => (r.id === city ? 16 : 11)),
      line: { color: tk.surface, width: 1 },
    },
    hovertemplate: '%{text}: %{x:.1f} °C<extra></extra>',
    showlegend: false,
  })
  return (
    <Card title={t('day.warmer')}>
      <ul className="facts">
        <li>
          <strong>{allWarmer ? t('day.warmerAll', { n: rows.length }) : t('day.warmerSome', { city: me.name, k, n: rows.length })}</strong>
        </li>
        <li>{t('day.warmerText', { city: me.name, a: num(lang, me.then), b: num(lang, me.now), top: top.name, t: num(lang, top.then) })}</li>
      </ul>
      <Chart
        data={[dots('then', tk.cool), dots('now', tk.warm)]}
        layout={{
          xaxis: { ticksuffix: ' °C', zeroline: false },
          yaxis: { categoryorder: 'array', categoryarray: [nowLabel, thenLabel] },
          hovermode: 'closest',
          shapes: [{ type: 'line', x0: top.then, x1: top.then, y0: 0, y1: 1, yref: 'paper', line: { color: tk.muted, dash: 'dot', width: 1 } }],
        }}
        height={200}
        label={t('day.warmerChart')}
      />
    </Card>
  )
}
