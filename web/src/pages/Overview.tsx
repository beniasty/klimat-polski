import { useMemo } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { href, useRoute } from '../lib/router.ts'
import { loadMeta, loadSummary, rangeMean, summarySeries, useAsync, type Meta, type Summary } from '../lib/data.ts'
import { METRIC_BY_ID } from '../lib/metrics.ts'
import { binSequential, RAMPS } from '../lib/colors.ts'
import { num, withUnit } from '../lib/format.ts'
import { Stripes } from '../components/Stripes.tsx'
import { PolandMap } from '../components/PolandMap.tsx'
import { Card, Ready } from '../components/Status.tsx'
import { CitySelect } from '../components/Controls.tsx'

const KPIS = ['tmean', 'hot_days', 'tropical_nights', 'ice_days', 'snow_days', 'winter_days'] as const
const THEN: [number, number] = [1961, 1990]
const NOW: [number, number] = [2016, 2025]

export default function Overview() {
  const meta = useAsync(loadMeta, 'meta')
  const summary = useAsync(loadSummary, 'summary')
  return (
    <Ready loading={meta.loading || summary.loading} error={meta.error ?? summary.error}>
      {() => <Content meta={meta.data!} summary={summary.data!} />}
    </Ready>
  )
}

function Content({ meta, summary }: { meta: Meta; summary: Summary }) {
  const { t, lang } = useI18n()
  const { params, setParams } = useRoute()
  const city = meta.cities.some((c) => c.id === params.get('c')) ? params.get('c')! : 'pl'
  const cityName = city === 'pl' ? t('ui.poland', { n: meta.cities.length }) : (meta.cities.find((c) => c.id === city)?.name ?? city)

  const tmean = summarySeries(summary, city, 'tmean')
  const base = rangeMean(summary, tmean, ...THEN)
  const anomalies = tmean.map((v) => (v === null ? null : v - base))
  const plAnom = (() => {
    const pl = summarySeries(summary, 'pl', 'tmean')
    return rangeMean(summary, pl, ...NOW) - rangeMean(summary, pl, ...THEN)
  })()
  const warmest = summary.years
    .map((y, i) => ({ y, v: anomalies[i] }))
    .filter((d) => d.v !== null)
    .sort((a, b) => b.v! - a.v!)
    .slice(0, 5)
    .map((d) => d.y)
    .sort()

  const warming = useMemo(() => {
    const out: Record<string, number> = {}
    for (const c of meta.cities) {
      const arr = summary.cities[c.id].tmean
      out[c.id] = rangeMean(summary, arr, ...NOW) - rangeMean(summary, arr, ...THEN)
    }
    return out
  }, [meta, summary])
  const scale = binSequential(Object.values(warming), RAMPS.warm)

  const cities = [{ id: 'pl', name: t('ui.poland', { n: meta.cities.length }), lat: 0, lon: 0, x: 0, y: 0 }, ...meta.cities]

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-tools">
          <CitySelect cities={cities} value={city} onChange={(id) => setParams({ c: id === 'pl' ? null : id })} label={t('ov.stripesFor')} />
        </div>
        <Stripes years={summary.years} anomalies={anomalies} label={`${t('ov.stripesFor')} ${cityName}`} />
        <h1>{t('ov.headline', { d: num(lang, plAnom, 1) })}</h1>
        <p className="intro">
          {t('ov.lead')} {t('ov.warmest', { list: warmest.join(', ') })}
        </p>
      </section>

      <div className="kpis" aria-label={cityName}>
        {KPIS.map((k) => {
          const arr = summarySeries(summary, city, k)
          const unit = METRIC_BY_ID[k].unit
          const a = rangeMean(summary, arr, ...THEN)
          const b = rangeMean(summary, arr, ...NOW)
          return (
            <div className="kpi" key={k}>
              <div className="kpi-label">{t(`ov.k.${k}` as Key)}</div>
              <div className="kpi-values">
                <span className="kpi-before">{withUnit(lang, a, unit)}</span>
                <span className="kpi-arrow" aria-hidden="true">
                  →
                </span>
                <span className="kpi-after">{withUnit(lang, b, unit)}</span>
              </div>
              <div className="kpi-sub">
                {t('ov.then')} → {t('ov.now')}
              </div>
            </div>
          )
        })}
      </div>

      <div className="grid-2">
        <Card title={t('ov.mapTitle')} note={t('ov.mapNote')}>
          <PolandMap
            meta={meta}
            values={warming}
            scale={scale}
            format={(v) => (v === null ? '–' : `${num(lang, v, 1, true)}°`)}
            formatEdge={(v) => `${num(lang, v, 1, true)} °C`}
            legendLow={t('map.legendLow')}
            legendHigh={t('map.legendHigh')}
            label={t('ov.mapTitle')}
            selected={city}
            onSelect={(id) => (window.location.hash = href('explore', { c: id, m: 'tmean', v: 'anomaly' }))}
          />
        </Card>
        <Card title={t('ov.explore')}>
          <div className="links">
            {(['explore', 'map', 'compare', 'nature', 'records', 'day'] as const).map((p) => (
              <a key={p} href={href(p, city !== 'pl' ? { c: city } : undefined)}>
                <strong>{t(`nav.${p}` as Key)}</strong>
                <span>{t(`ov.card.${p}` as Key)}</span>
              </a>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
