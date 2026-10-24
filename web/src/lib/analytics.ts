/**
 * Anonymous page counting with GoatCounter (no cookies), loaded from index.html.
 * GoatCounter's own SPA support does not see hash routes, so we count by hand:
 * once on start and whenever the page (not its URL params) changes.
 */

declare global {
  interface Window {
    goatcounter?: { no_onload?: boolean; count?: (vars: { path: string }) => void }
  }
}

/** "#/explore?c=warszawa" -> "/explore". Params are left out on purpose. */
export function pagePath(hash: string): string {
  const page = hash.replace(/^#\/?/, '').split('?')[0]
  return '/' + (page || 'overview')
}

export function startAnalytics() {
  let last = ''
  const send = () => {
    const path = pagePath(window.location.hash)
    const count = window.goatcounter?.count
    if (path === last || !count) return
    last = path
    count({ path })
  }
  // count.js loads async: it may be ready already, or fire `load` later.
  send()
  document.getElementById('goatcounter')?.addEventListener('load', send)
  window.addEventListener('hashchange', send)
}
