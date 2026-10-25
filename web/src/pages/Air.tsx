import { useI18n, type Key } from '../lib/i18n.tsx'
import { useRoute } from '../lib/router.ts'
import { loadMeta, useAsync, type Meta } from '../lib/data.ts'
import { EAQI_BANDS, eaqiLevel, fetchAirNow, POLLUTANTS, type AirSummary } from '../lib/air.ts'
import { binSequential, inkOn, RAMPS } from '../lib/colors.ts'
import { dateLabel, monthNames, num } from '../lib/format.ts'
import { useTokens } from '../lib/theme.ts'
import { Chart } from '../components/Chart.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { PolandMap } from '../components/PolandMap.tsx'
import { Card, PageHead, Ready } from '../components/Status.tsx'
import { CitySelect, FilterBar } from '../components/Controls.tsx'

const loadAir = () => fetch(import.meta.env.BASE_URL + 'data/air.json').then((r) => r.json() as Promise<AirSummary>)
const UNIT = 'µg/m³'

export default function Air() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  const air = useAsync(loadAir, 'air')
  return (
    <>
      <PageHead title={t('air.title')} intro={t('air.intro')} />
      <Ready loading={meta.loading || air.loading} error={meta.error ?? air.error}>
        {() => <Content meta={meta.data!} air={air.data!} />}
      </Ready>
    </>
  )
}

function Content({ meta, air }: { meta: Meta; air: AirSummary }) {
  const { t } = useI18n()
  const { params, setParams } = useRoute()
  const city = meta.cities.some((c) => c.id === params.get('c')) ? params.get('c')! : 'warszawa'
  const c = meta.cities.find((x) => x.id === city)!
  return (
    <>
      <FilterBar>
        <CitySelect cities={meta.cities} value={city} onChange={(id) => setParams({ c: id })} />
      </FilterBar>
      <Now key={city} lat={c.lat} lon={c.lon} name={c.name} />
      <div className="grid-2">
        <Year air={air} city={city} name={c.name} />
        <Ranking meta={meta} air={air} city={city} onSelect={(id) => setParams({ c: id })} />
      </div>
      <p className="note">{t('air.caveat', { a: air.period[0], b: air.period[1] })}</p>
    </>
  )
}

/** Live conditions and a 4-day forecast, fetched by the browser (nothing is stored). */
function Now({ lat, lon, name }: { lat: number; lon: number; name: string }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const now = useAsync(() => fetchAirNow(lat, lon), `${lat},${lon}`)
  return (
    <Card title={`${t('air.now')} · ${name}`} note={t('air.nowNote')}>
      <Ready loading={now.loading} error={now.error}>
        {() => {
          const d = now.data!
          const level = eaqiLevel(d.eaqi)
          const band = EAQI_BANDS[level]
          return (
            <>
              <div className="kpis kpis-4">
                <div className="kpi">
                  <div className="kpi-label">{t('air.eaqi')}</div>
                  <div className="kpi-values">
                    <span className="air-badge" style={{ background: band.color, color: inkOn(band.color) }}>
                      {t(`air.level.${level}` as Key)}
                    </span>
                    <span className="kpi-after">{num(lang, d.eaqi, 0)}</span>
                  </div>
                  <div className="kpi-sub">{dateLabel(lang, d.time.slice(0, 10), { day: 'numeric', month: 'long' }) + ', ' + d.time.slice(11, 16)}</div>
                </div>
                {POLLUTANTS.slice(0, 3).map((p) => (
                  <div className="kpi" key={p}>
                    <div className="kpi-label">{t(`air.p.${p}` as Key)}</div>
                    <div className="kpi-values">
                      <span className="kpi-after">
                        {num(lang, d.values[p], 0)} {UNIT}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <h3 className="sub">{t('air.forecast')}</h3>
              <Chart
                data={[
                  {
                    type: 'bar',
                    x: d.forecast.map((f) => f.time),
                    y: d.forecast.map((f) => f.eaqi),
                    marker: { color: d.forecast.map((f) => EAQI_BANDS[eaqiLevel(f.eaqi)].color) },
                    hovertemplate: '%{x|%d.%m %H:%M}: %{y:.0f}<extra></extra>',
                  },
                ]}
                layout={{ xaxis: { type: 'date', tickformat: '%d.%m' }, yaxis: { title: { text: 'EAQI' }, rangemode: 'tozero' }, hovermode: 'closest', bargap: 0, plot_bgcolor: tk.surface }}
                height={220}
                label={t('air.forecast')}
              />
            </>
          )
        }}
      </Ready>
    </Card>
  )
}

/** Typical year: PM2.5 and PM10 by month (mean over the whole period). */
function Year({ air, city, name }: { air: AirSummary; city: string; name: string }) {
  const { t, lang } = useI18n()
  const tk = useTokens()
  const c = air.cities[city]
  const months = monthNames(lang)
  return (
    <Card title={`${t('air.year')} · ${name}`} note={t('air.yearNote', { w: num(lang, c.season.winter), s: num(lang, c.season.summer) })}>
      <Chart
        data={[
          { type: 'bar', name: 'PM2.5', x: months, y: c.months.pm25, marker: { color: tk.warm } },
          { type: 'bar', name: 'PM10', x: months, y: c.months.pm10, marker: { color: tk.neutral } },
        ]}
        layout={{ barmode: 'group', yaxis: { title: { text: UNIT } }, hovermode: 'x unified', showlegend: true }}
        height={300}
        label={t('air.year')}
      />
    </Card>
  )
}

type Row = { id: string; name: string; pm25: number; pm10: number; no2: number; days: number; ratio: number }

/** Cities compared on long-term means (robust to the model changes between years). */
function Ranking({ meta, air, city, onSelect }: { meta: Meta; air: AirSummary; city: string; onSelect: (id: string) => void }) {
  const { t, lang } = useI18n()
  const rows: Row[] = meta.cities.map((c) => {
    const a = air.cities[c.id]
    return { id: c.id, name: c.name, pm25: a.mean.pm25, pm10: a.mean.pm10, no2: a.mean.no2, days: a.whoDays.pm25, ratio: a.season.winter / a.season.summer }
  })
  const values = Object.fromEntries(rows.map((r) => [r.id, r.pm25]))
  const scale = binSequential(rows.map((r) => r.pm25), RAMPS.warm)
  const columns: Column<Row>[] = [
    { key: 'name', label: t('ui.city'), value: (r) => r.name, align: 'left' },
    { key: 'pm25', label: 'PM2.5', value: (r) => r.pm25, render: (r) => num(lang, r.pm25) },
    { key: 'pm10', label: 'PM10', value: (r) => r.pm10, render: (r) => num(lang, r.pm10) },
    { key: 'no2', label: 'NO₂', value: (r) => r.no2, render: (r) => num(lang, r.no2) },
    { key: 'days', label: t('air.col.days', { v: num(lang, air.who.pm25, 0) }), value: (r) => r.days, render: (r) => num(lang, r.days, 0) },
    { key: 'ratio', label: t('air.col.ratio'), value: (r) => r.ratio, render: (r) => `×${num(lang, r.ratio)}` },
  ]
  return (
    <Card title={t('air.rank', { a: air.period[0], b: air.period[1] })}>
      <PolandMap
        meta={meta}
        values={values}
        scale={scale}
        format={(v) => (v === null ? '–' : num(lang, v, 0))}
        formatEdge={(v) => `${num(lang, v, 0)} ${UNIT}`}
        legendLow={t('air.legendLow')}
        legendHigh={t('air.legendHigh')}
        label={t('air.rank', { a: air.period[0], b: air.period[1] })}
        selected={city}
        onSelect={onSelect}
      />
      <DataTable rows={rows} columns={columns} caption={t('air.rankCaption')} csvName="klimat-powietrze.csv" rowKey={(r) => r.id} initialSort={{ key: 'pm25', dir: 'desc' }} maxHeight={420} />
    </Card>
  )
}
