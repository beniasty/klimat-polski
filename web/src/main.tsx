import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { I18nProvider } from './lib/i18n.tsx'
import { startAnalytics } from './lib/analytics.ts'

startAnalytics()

// Offline support (public/sw.js); production builds only, so dev reloads stay fresh.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {
    /* not supported or blocked: the site works without it */
  })
}

// After a deploy, a tab opened earlier asks for page chunks that no longer exist.
// Reload once to pick up the new build (the timestamp guard stops reload loops).
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'klimat-reloaded'
  try {
    const last = Number(sessionStorage.getItem(KEY))
    if (Date.now() - last < 60_000) return
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return // no storage: better an error than a possible loop
  }
  event.preventDefault()
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
