import type { ReactNode } from 'react'
import { useI18n } from '../lib/i18n.tsx'

export function Loading() {
  const { t } = useI18n()
  return (
    <p className="status" role="status">
      {t('ui.loading')}
    </p>
  )
}

export function ErrorBox({ error }: { error: Error }) {
  const { t } = useI18n()
  return (
    <p className="status error" role="alert">
      {t('ui.error', { msg: error.message })}
    </p>
  )
}

/** Render children once all async values are ready. */
export function Ready({ loading, error, children }: { loading: boolean; error?: Error; children: () => ReactNode }) {
  if (error) return <ErrorBox error={error} />
  if (loading) return <Loading />
  return <>{children()}</>
}

export function PageHead({ title, intro }: { title: string; intro?: string }) {
  return (
    <div className="page-head">
      <h1>{title}</h1>
      {intro && <p className="intro">{intro}</p>}
    </div>
  )
}

export function Card({ title, children, note, actions }: { title?: string; children: ReactNode; note?: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
      {note && <p className="note">{note}</p>}
    </section>
  )
}
