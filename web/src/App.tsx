import { Component, lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { href, NAV_PAGES, useRoute, type Page } from './lib/router.ts'
import { useI18n, type Key } from './lib/i18n.tsx'
import { useThemeChoice, type ThemeChoice } from './lib/theme.ts'

const NEXT_THEME: Record<ThemeChoice, ThemeChoice> = { auto: 'light', light: 'dark', dark: 'auto' }
const THEME_ICON: Record<ThemeChoice, string> = { auto: '◐', light: '☀', dark: '☾' }
import { loadMeta, loadSummary, meanOfCities, useAsync } from './lib/data.ts'
import { stripeColor } from './lib/colors.ts'
import { ErrorBox, Loading } from './components/Status.tsx'

const pages: Record<Page, React.LazyExoticComponent<() => React.JSX.Element>> = {
  overview: lazy(() => import('./pages/Overview.tsx')),
  month: lazy(() => import('./pages/Month.tsx')),
  explore: lazy(() => import('./pages/Explore.tsx')),
  map: lazy(() => import('./pages/MapPage.tsx')),
  compare: lazy(() => import('./pages/Compare.tsx')),
  nature: lazy(() => import('./pages/Nature.tsx')),
  records: lazy(() => import('./pages/Records.tsx')),
  day: lazy(() => import('./pages/YourDay.tsx')),
  about: lazy(() => import('./pages/About.tsx')),
  quiz: lazy(() => import('./pages/Quiz.tsx')),
}

/** Shows an error message instead of a blank page if a page fails to load or render. */
class PageBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    return this.state.error ? <ErrorBox error={this.state.error} /> : this.props.children
  }
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
  // The menu is open for one page only, so it closes by itself when the page changes.
  const [menuFor, setMenuFor] = useState<Page | null>(null)
  const menuOpen = menuFor === page
  const mainRef = useRef<HTMLElement>(null)
  useAsync(loadMeta, 'meta') // start loading early

  useEffect(() => {
    document.title = `${t(`nav.${page}` as Key)} · ${t('site.title')}`
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
            <button type="button" className="menu-btn" aria-expanded={menuOpen} aria-controls="site-nav" onClick={() => setMenuFor(menuOpen ? null : page)}>
              {lang === 'pl' ? 'Menu' : 'Menu'}
            </button>
          </div>
        </div>
        <nav id="site-nav" className={`site-nav${menuOpen ? ' open' : ''}`} aria-label={lang === 'pl' ? 'Główna' : 'Main'}>
          <ul>
            {NAV_PAGES.map((p) => (
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
        <PageBoundary key={page}>
          <Suspense fallback={<Loading />}>
            <Current />
          </Suspense>
        </PageBoundary>
      </main>
      <footer className="site-footer">
        <p>
          {lang === 'pl' ? 'Dane' : 'Data'}: <a href="https://open-meteo.com/">Open-Meteo</a> (ERA5, CC BY 4.0) ·{' '}
          <a href="https://github.com/beniasty/klimat-polski">GitHub</a> · <a href="https://beniasty.github.io">Paweł Bęben</a> ·{' '}
          <a href="https://buycoffee.to/beniasty">{t('ui.donate')}</a>
        </p>
      </footer>
    </>
  )
}
