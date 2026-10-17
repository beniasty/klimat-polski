import { useCallback, useSyncExternalStore } from 'react'

/**
 * Tiny hash router: "#/explore?c=warszawa&m=tmean".
 * The whole UI state lives in the URL, so every view can be shared as a link.
 */
export const PAGES = ['overview', 'explore', 'map', 'compare', 'nature', 'records', 'day', 'about'] as const
export type Page = (typeof PAGES)[number]

interface Route {
  page: Page
  params: URLSearchParams
}

function parse(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const page = (PAGES as readonly string[]).includes(path) ? (path as Page) : 'overview'
  return { page, params: new URLSearchParams(query) }
}

let current = parse(window.location.hash)
const listeners = new Set<() => void>()
window.addEventListener('hashchange', () => {
  current = parse(window.location.hash)
  listeners.forEach((l) => l())
})

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function href(page: Page, params?: Record<string, string>): string {
  const q = params ? new URLSearchParams(params).toString() : ''
  return `#/${page}${q ? '?' + q : ''}`
}

export function useRoute() {
  const route = useSyncExternalStore(subscribe, () => current)
  /** Update query params of the current page (null removes a key). Replaces history entry. */
  const setParams = useCallback((patch: Record<string, string | null>) => {
    const p = new URLSearchParams(current.params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') p.delete(k)
      else p.set(k, v)
    }
    const q = p.toString()
    const next = `#/${current.page}${q ? '?' + q : ''}`
    history.replaceState(null, '', next)
    current = parse(next)
    listeners.forEach((l) => l())
  }, [])
  return { ...route, setParams }
}

/** Read helpers with defaults. */
export const param = {
  str: (p: URLSearchParams, k: string, def: string) => p.get(k) ?? def,
  num: (p: URLSearchParams, k: string, def: number) => {
    const v = Number(p.get(k))
    return p.has(k) && Number.isFinite(v) ? v : def
  },
  range: (p: URLSearchParams, k: string, def: [number, number]): [number, number] => {
    const m = /^(\d{4})-(\d{4})$/.exec(p.get(k) ?? '')
    return m ? [Number(m[1]), Number(m[2])] : def
  },
}
