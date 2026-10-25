import { useState } from 'react'
import { useI18n } from '../lib/i18n.tsx'
import { href } from '../lib/router.ts'
import { loadMeta, loadSummary, rangeMean, useAsync, type Meta, type Summary } from '../lib/data.ts'
import { makeQuiz, type Question } from '../lib/quiz.ts'
import { num, withUnit } from '../lib/format.ts'
import { Card, PageHead, Ready } from '../components/Status.tsx'

const ROUND = 6

export default function Quiz() {
  const { t } = useI18n()
  const meta = useAsync(loadMeta, 'meta')
  const summary = useAsync(loadSummary, 'summary')
  return (
    <>
      <PageHead title={t('quiz.title')} intro={t('quiz.intro')} />
      <Ready loading={meta.loading || summary.loading} error={meta.error ?? summary.error}>
        {() => <Game meta={meta.data!} summary={summary.data!} />}
      </Ready>
    </>
  )
}

function Game({ meta, summary }: { meta: Meta; summary: Summary }) {
  const { t, lang } = useI18n()
  const [questions, setQuestions] = useState(() => makeQuiz(summary, ROUND))
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<number | null>(null)
  const [score, setScore] = useState(0)
  const name = (id: string) => meta.cities.find((c) => c.id === id)?.name ?? id

  const restart = () => {
    setQuestions(makeQuiz(summary, ROUND))
    setIndex(0)
    setChosen(null)
    setScore(0)
  }

  if (index >= questions.length) {
    return (
      <Card title={t('quiz.score', { n: score, total: questions.length })}>
        <p>{t(score === questions.length ? 'quiz.perfect' : score >= questions.length / 2 ? 'quiz.good' : 'quiz.tryAgain')}</p>
        <div className="quiz-actions">
          <button type="button" className="btn" onClick={restart}>
            {t('quiz.again')}
          </button>
          <a href={href('explore')}>{t('quiz.explore')}</a>
        </div>
      </Card>
    )
  }

  const q = questions[index]
  const choose = (k: number) => {
    if (chosen !== null) return
    setChosen(k)
    if (k === q.answer) setScore((s) => s + 1)
  }
  return (
    <Card title={t('quiz.progress', { i: index + 1, n: questions.length })}>
      <p className="quiz-question">{questionText(q)}</p>
      <div className="quiz-options" role="group" aria-label={t('quiz.answers')}>
        {optionLabels(q).map((label, k) => (
          <button
            key={k}
            type="button"
            className={`btn quiz-option${chosen === null ? '' : k === q.answer ? ' right' : k === chosen ? ' wrong' : ''}`}
            aria-pressed={chosen === k}
            disabled={chosen !== null && k !== chosen && k !== q.answer}
            onClick={() => choose(k)}
          >
            {label}
          </button>
        ))}
      </div>
      {chosen !== null && (
        <div className="quiz-feedback" aria-live="polite">
          <p>
            <strong>{chosen === q.answer ? t('quiz.right') : t('quiz.wrong')}</strong> {explain(q)}
          </p>
          <button type="button" className="btn" onClick={() => (setIndex(index + 1), setChosen(null))}>
            {index + 1 < questions.length ? t('quiz.next') : t('quiz.finish')}
          </button>
        </div>
      )}
    </Card>
  )

  function questionText(q: Question) {
    if (q.kind === 'warmerYear') return t('quiz.q.warmerYear', { city: name(q.city) })
    if (q.kind === 'warmestCity') return t('quiz.q.warmestCity', { year: q.year })
    return t('quiz.q.hotDays', { city: name(q.city), a: q.period[0], b: q.period[1] })
  }

  function optionLabels(q: Question): string[] {
    if (q.kind === 'warmerYear') return q.options.map(String)
    if (q.kind === 'warmestCity') return q.options.map(name)
    return q.options.map((v) => withUnit(lang, v, 'days'))
  }

  function explain(q: Question) {
    if (q.kind === 'warmerYear')
      return t('quiz.exp.warmerYear', { y1: q.options[0], v1: num(lang, q.values[0]), y2: q.options[1], v2: num(lang, q.values[1]) })
    if (q.kind === 'warmestCity')
      return t('quiz.exp.warmestCity', { list: q.options.map((c, k) => `${name(c)} ${num(lang, q.values[k])} °C`).join(', ') })
    const old = rangeMean(summary, summary.cities[q.city].hot_days, 1961, 1990)
    return t('quiz.exp.hotDays', { n: withUnit(lang, q.options[q.answer], 'days'), old: withUnit(lang, old, 'days', false, 1) })
  }
}
