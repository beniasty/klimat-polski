import { useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../lib/i18n.tsx'
import { downloadCsv } from '../lib/format.ts'

export interface Column<R> {
  key: string
  label: string
  /** Raw value used for sorting and CSV. */
  value: (row: R) => number | string | null
  /** Display value (defaults to the raw value). */
  render?: (row: R) => ReactNode
  align?: 'left' | 'right'
}

interface Props<R> {
  rows: R[]
  columns: Column<R>[]
  caption: string
  csvName?: string
  initialSort?: { key: string; dir: 'asc' | 'desc' }
  maxHeight?: number
  rowKey: (row: R) => string | number
}

export function DataTable<R>({ rows, columns, caption, csvName, initialSort, maxHeight = 420, rowKey }: Props<R>) {
  const { t } = useI18n()
  const [sort, setSort] = useState(initialSort ?? null)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = col.value(a)
      const vb = col.value(b)
      if (va === null) return 1
      if (vb === null) return -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * dir
    })
  }, [rows, columns, sort])

  const toggle = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))

  return (
    <div className="table-wrap">
      <div className="table-tools">
        <span className="table-caption" id={`cap-${caption.length}-${columns.length}`}>
          {caption}
        </span>
        {csvName && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              downloadCsv(
                csvName,
                columns.map((c) => c.label),
                sorted.map((r) => columns.map((c) => c.value(r))),
              )
            }
          >
            {t('ui.download')}
          </button>
        )}
      </div>
      <div className="table-scroll" style={{ maxHeight }} tabIndex={0} role="region" aria-label={caption}>
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={c.align === 'right' ? 'num' : ''} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggle(c.key)}>
                    {c.label}
                    <span className="sort-mark" aria-hidden="true">
                      {sort?.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={rowKey(r)}>
                {columns.map((c, i) => {
                  const content = c.render ? c.render(r) : (c.value(r) ?? '–')
                  return i === 0 ? (
                    <th key={c.key} scope="row">
                      {content}
                    </th>
                  ) : (
                    <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                      {content}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
