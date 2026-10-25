import { useState } from 'react'
import { useI18n, type Key } from '../lib/i18n.tsx'
import { loadMeta, useAsync, type Meta } from '../lib/data.ts'
import { METRICS } from '../lib/metrics.ts'
import { dateLabel, num } from '../lib/format.ts'
import { Card, PageHead } from '../components/Status.tsx'
import { Field } from '../components/Controls.tsx'

export default function About() {
  const { t, tList, lang } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  const last = meta.data ? dateLabel(lang, meta.data.lastDate) : '…'
  return (
    <>
      <PageHead title={t('about.title')} />
      <div className="grid-2">
        <Card>
          <div className="prose">
            {tList('about.body', { last }).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p>
              {t('about.links')}: <a href="https://github.com/beniasty/klimat-polski">github.com/beniasty/klimat-polski</a>
            </p>
            <p>
              {t('about.author')}: <a href="https://beniasty.github.io">Paweł Bęben</a>
            </p>
            <p>
              {t('about.donate')}: <a href="https://buycoffee.to/beniasty">buycoffee.to/beniasty</a>
            </p>
            <p>{t('about.privacy')}</p>
          </div>
        </Card>
        <Card title={lang === 'pl' ? 'Miasta' : 'Cities'}>
          {meta.data && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">
                      <button type="button" disabled>
                        {t('ui.city')}
                      </button>
                    </th>
                    <th scope="col" className="num">
                      <button type="button" disabled>
                        {lang === 'pl' ? 'Szer.' : 'Lat.'}
                      </button>
                    </th>
                    <th scope="col" className="num">
                      <button type="button" disabled>
                        {lang === 'pl' ? 'Dł.' : 'Lon.'}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {meta.data.cities.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">{c.name}</th>
                      <td className="num">{num(lang, c.lat, 2)}° N</td>
                      <td className="num">{num(lang, c.lon, 2)}° E</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {meta.data && <Embed meta={meta.data} />}
      <Card title={lang === 'pl' ? 'Definicje miar' : 'Measure definitions'}>
        <div className="table-scroll">
          <table>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{t(`m.${m.id}` as Key)}</th>
                  <td style={{ whiteSpace: 'normal' }}>{t(`md.${m.id}` as Key, { t: m.kind === 'daily' && m.threshold !== undefined ? num(lang, m.threshold, 0) : '' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}

/** Code generator for the embeddable stripes widget (embed.html), with a live preview. */
function Embed({ meta }: { meta: Meta }) {
  const { t, lang } = useI18n()
  const [city, setCity] = useState('pl')
  const [embedLang, setEmbedLang] = useState(lang)
  const [copied, setCopied] = useState(false)
  const url = new URL('embed.html', location.href.split('#')[0])
  if (city !== 'pl') url.searchParams.set('c', city)
  if (embedLang === 'en') url.searchParams.set('lang', 'en')
  const name = city === 'pl' ? (embedLang === 'pl' ? 'Polska' : 'Poland') : meta.cities.find((c) => c.id === city)!.name
  const code = `<iframe src="${url.href}" width="600" height="160" style="border:0;max-width:100%" loading="lazy" title="${embedLang === 'pl' ? 'Paski ocieplenia' : 'Warming stripes'}: ${name}"></iframe>`
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => setCopied(true),
      () => setCopied(false),
    )
  return (
    <Card title={t('embed.title')} note={t('embed.note')}>
      <div className="filter-row">
        <Field label={t('ui.city')}>
          <select value={city} onChange={(e) => (setCity(e.target.value), setCopied(false))}>
            <option value="pl">{lang === 'pl' ? 'Polska (średnia miast)' : 'Poland (mean of cities)'}</option>
            {meta.cities.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('ui.lang')}>
          <select value={embedLang} onChange={(e) => (setEmbedLang(e.target.value === 'en' ? 'en' : 'pl'), setCopied(false))}>
            <option value="pl">Polski</option>
            <option value="en">English</option>
          </select>
        </Field>
      </div>
      <iframe src={url.href} width="600" height="160" style={{ border: 0, maxWidth: '100%', display: 'block', margin: '12px 0' }} title={t('embed.preview')} loading="lazy" />
      <textarea className="embed-code" readOnly rows={3} value={code} aria-label={t('embed.code')} onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn" onClick={copy}>
        {copied ? t('embed.copied') : t('embed.copy')}
      </button>
    </Card>
  )
}
