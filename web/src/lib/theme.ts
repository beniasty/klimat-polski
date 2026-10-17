import { useEffect, useState, useSyncExternalStore } from 'react'

export type ThemeChoice = 'auto' | 'light' | 'dark'
const KEY = 'klimat-theme'

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)')

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement
  if (choice === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

export function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)
  useEffect(() => {
    applyTheme(choice)
    try {
      if (choice === 'auto') localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, choice)
    } catch {
      /* storage unavailable: the choice just won't persist */
    }
  }, [choice])
  return [choice, setChoice] as const
}

/** True when the page is currently rendered dark (explicit choice or OS setting). */
function isDark() {
  const t = document.documentElement.getAttribute('data-theme')
  return t ? t === 'dark' : media.matches
}

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())
media.addEventListener('change', notify)
new MutationObserver(notify).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

export function useIsDark() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    isDark,
  )
}

/** Chart colours resolved from CSS custom properties for the active theme. */
export interface Tokens {
  surface: string
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  series: string[]
  warm: string
  cool: string
  neutral: string
  reference: string
}

const TOKEN_NAMES = {
  surface: '--surface',
  ink: '--ink',
  ink2: '--ink-2',
  muted: '--muted',
  grid: '--grid',
  axis: '--axis',
  warm: '--warm',
  cool: '--cool',
  neutral: '--neutral',
  reference: '--reference',
} as const

export function useTokens(): Tokens {
  const dark = useIsDark()
  const [tokens, setTokens] = useState<Tokens>(() => readTokens())
  useEffect(() => setTokens(readTokens()), [dark])
  return tokens
}

function readTokens(): Tokens {
  const cs = getComputedStyle(document.documentElement)
  const get = (n: string) => cs.getPropertyValue(n).trim()
  const t = Object.fromEntries(Object.entries(TOKEN_NAMES).map(([k, v]) => [k, get(v)])) as Omit<Tokens, 'series'>
  return { ...t, series: [1, 2, 3, 4, 5].map((i) => get(`--series-${i}`)) }
}
