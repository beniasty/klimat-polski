import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { href, PAGES, useRoute, type Page } from './lib/router.ts'
import { useI18n, type Key } from './lib/i18n.tsx'
import { useThemeChoice, type ThemeChoice } from './lib/theme.ts'

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_ICON: Record<ThemeChoice, string> = { auto: '◐', light: '☀', dark: '☾' }
import { loadMeta, loadSummary, meanOfCities, useAsync } from './lib/data.ts'
import { stripeColor } from './lib/colors.ts'
import { Loading } from './components/Status.tsx'

const pages: Record<Page, React.LazyExoticComponent<() => React.JSX.Element>> = {
  overview: lazy(() => import('./pages/Overview.tsx')),
  explore: lazy(() => import('./pages/Explore.tsx')),
  map: lazy(() => import('./pages/MapPage.tsx')),
  compare: lazy(() => import('./pages/Compare.tsx')),
  nature: lazy(() => import('./pages/Nature.tsx')),
  records: lazy(() => import('./pages/Records.tsx')),
  day: lazy(() => import('./pages/YourDay.tsx')),
  about: lazy(() => import('./pages/About.tsx')),
}

/** Tiny stripes used as the logo: the real Poland-mean anomalies once loaded. */
function Logo() {
  const { data } = useAsync(loadSummary, 'summary')
  const anomalies = data ? meanOfCities(data, 'tmean') : []
  const base = data
    ? (() => {
        const sel = anomalies.filter((_, i) => data.years[i] >= 1961 && data.years[i] <= 1990) as number[]
        return sel.reduce((a, b) => a + b, 0) / sel.length
      })()
    : 0
  return (
    <span className="logo" aria-hidden="true">
      {(data ? anomalies : new Array(30).fill(null)).map((v, i) => (
        <span key={i} style={{ background: v === null ? 'var(--grid)' : stripeColor(v - base) }} />
      ))}
    </span>
  )
}

export default function App() {
  const { page } = useRoute()
  const { t, lang, setLang } = useI18n()
  const [theme, setTheme] = useThemeChoice()
  const [menuOpen, setMenuOpen] = useState(false)
  const mainRef = useRef<HTMLElement>(null)
  useAsync(loadMeta, 'meta') // start loading early

  useEffect(() => {
    document.title = `${t(`nav.${page}` as Key)} · ${t('site.title')}`
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }, [page, t])

  const Current = pages[page]
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => (e.preventDefault(), mainRef.current?.focus())}>
        {lang === 'pl' ? 'Przejdź do treści' : 'Skip to content'}
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href={href('overview')}>
            <Logo />
            <span className="brand-text">
              <span className="brand-title">{t('site.title')}</span>
              <span className="brand-sub">{t('site.subtitle')}</span>
            </span>
          </a>
          <div className="header-tools">
            <div className="lang-switch" role="group" aria-label={t('ui.lang')}>
              {(['pl', 'en'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="theme-btn"
              onClick={() => setTheme(NEXT_THEME[theme])}
              aria-label={`${t('ui.theme')}: ${t(`ui.theme.${theme}` as Key)}`}
              title={`${t('ui.theme')}: ${t(`ui.theme.${theme}` as Key)}`}
            >
              <span aria-hidden="true">{THEME_ICON[theme]}</span>
            </button>
            <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuOpen((o) => !o)}>
              {lang === 'pl' ? 'Menu' : 'Menu'}
            </button>
          </div>
        </div>
        <nav id="site-nav" className={`site-nav${menuOpen ? ' open' : ''}`} aria-label={lang === 'pl' ? 'Główna' : 'Main'}>
          <ul>
            {PAGES.map((p) => (
              <li key={p}>
                <a href={href(p)} aria-current={p === page ? 'page' : undefined}>
                  {t(`nav.${p}` as Key)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="main" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<Loading />}>
          <Current />
        </Suspense>
      </main>
      <footer className="site-footer">
        <p>
          {lang === 'pl' ? 'Dane' : 'Data'}: <a href="https://open-meteo.com/">Open-Meteo</a> (ERA5, CC BY 4.0) ·{' '}
          <a href="https://github.com/beniasty/klimat-polski">GitHub</a> · <a href="https://beniasty.github.io">Paweł Bęben</a>
        </p>
      </footer>
    </>
  )
}
