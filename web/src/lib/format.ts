import type { Lang } from './i18n.tsx'
import type { Unit } from './metrics.ts'

const locale = (lang: Lang) => (lang === 'pl' ? 'pl-PL' : 'en-GB')

export function num(lang: Lang, v: number | null | undefined, digits = 1, sign = false): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–'
  const s = new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(v)
  return s.replace('-', '−')
}

/** Day of year (1-based, non-leap) -> "12 Apr" style label. */
export function doyLabel(lang: Lang, doy: number | null | undefined): string {
  if (doy === null || doy === undefined || !Number.isFinite(doy)) return '–'
  const d = new Date(Date.UTC(2001, 0, Math.round(doy)))
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)
}

export function dateLabel(lang: Lang, iso: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'long' }): string {
  return new Intl.DateTimeFormat(locale(lang), { ...opts, timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'))
}

export function monthNames(lang: Lang, style: 'short' | 'long' = 'short'): string[] {
  const f = new Intl.DateTimeFormat(locale(lang), { month: style, timeZone: 'UTC' })
  return Array.from({ length: 12 }, (_, m) => f.format(new Date(Date.UTC(2001, m, 1))))
}

export function unitLabel(unit: Unit, lang: Lang): string {
  return { C: '°C', mm: 'mm', cm: 'cm', days: lang === 'pl' ? 'dni' : 'days', doy: '' }[unit]
}

/** Value with unit, digits chosen by unit. */
export function withUnit(lang: Lang, v: number | null | undefined, unit: Unit, sign = false, digitsOverride?: number): string {
  if (unit === 'doy') return sign ? `${num(lang, v, digitsOverride ?? 0, true)} ${lang === 'pl' ? 'dni' : 'days'}` : doyLabel(lang, v)
  const digits = digitsOverride ?? (unit === 'C' ? 1 : 0)
  const u = unitLabel(unit, lang)
  return `${num(lang, v, digits, sign)}${unit === 'C' ? ' ' : ' '}${u}`
}

/** 3 -> "3." (pl) / "3rd" (en). */
export const ordinal = (lang: Lang, n: number) => {
  if (lang === 'pl') return `${n}.`
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const separators =(lang: Lang) => (lang === 'pl' ? ', ' : '.,')

/** CSV download from rows of plain values. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => {
    const s = v === null ? '' : String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [header, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
