import { useI18n, type Key } from '../lib/i18n.tsx'
import { loadMeta, useAsync } from '../lib/data.ts'
import { METRICS } from '../lib/metrics.ts'
import { dateLabel, num } from '../lib/format.ts'
import { Card, PageHead } from '../components/Status.tsx'

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
