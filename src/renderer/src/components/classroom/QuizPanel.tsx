import { useState } from 'react'
import type { AppErrorPayload, Lesson, QuizAttemptResult, QuizQuestion, Result } from '@shared/domain'
import { cx } from '../../lib/cx'
import { QUIZ_TYPE_LABEL } from '../../lib/labels'
import { Badge, Button, ErrorNotice, Spinner, inputClass } from '../ui'

interface QuizPanelProps {
  lesson: Lesson | null
  quizzes: QuizQuestion[]
  onGenerate: (lessonId: string) => Promise<Result<QuizQuestion[]>>
  onAnswer: (quizId: string, selectedIndex: number) => Promise<Result<QuizAttemptResult>>
  onFlag: (quizId: string, reason: string) => Promise<Result<QuizQuestion>>
}

/** Quiz for the current lesson: generate, answer, see grading and explanation, flag a bad question. */
export function QuizPanel({ lesson, quizzes, onGenerate, onAnswer, onFlag }: QuizPanelProps) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<AppErrorPayload | null>(null)
  const answered = quizzes.filter((q) => q.lastAttempt !== null)
  const correct = answered.filter((q) => q.lastAttempt?.correct === true).length

  async function generate(): Promise<void> {
    if (!lesson) return
    setGenerating(true)
    setError(null)
    const res = await onGenerate(lesson.id)
    setGenerating(false)
    if (!res.ok) setError(res.error)
  }

  return (
    <section aria-label="퀴즈" data-testid="quiz-panel" className="space-y-4 border-t border-line p-4">
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">퀴즈</h2>
        {answered.length > 0 && (
          <span className="flex items-baseline gap-2 text-xs">
            <span className="text-ink-3">풀이한 문제 중</span>
            <span className="font-medium text-ink-2" data-testid="quiz-score">
              정답 {correct} / {answered.length}
            </span>
          </span>
        )}
      </header>

      {error && <ErrorNotice error={error} onRetry={() => void generate()} busy={generating} testId="quiz-error" />}

      {generating && <Spinner label="선생님이 문제를 준비하고 있어요" />}

      {!generating && quizzes.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-ink-2" data-testid="quiz-empty">
            {lesson ? '이 단원의 문제를 만들어 풀어 볼 수 있어요.' : '단원을 선택하면 퀴즈를 풀 수 있어요.'}
          </p>
          <Button variant="secondary" size="sm" data-testid="quiz-generate" disabled={!lesson} onClick={() => void generate()}>
            퀴즈 풀기
          </Button>
        </div>
      )}

      {quizzes.length > 0 && (
        <ol className="space-y-4" data-testid="quiz-list">
          {quizzes.map((q, i) => (
            <QuizCard key={q.id} quiz={q} index={i} onAnswer={onAnswer} onFlag={onFlag} />
          ))}
        </ol>
      )}
    </section>
  )
}

interface QuizCardProps {
  quiz: QuizQuestion
  index: number
  onAnswer: (quizId: string, selectedIndex: number) => Promise<Result<QuizAttemptResult>>
  onFlag: (quizId: string, reason: string) => Promise<Result<QuizQuestion>>
}

function QuizCard({ quiz, index, onAnswer, onFlag }: QuizCardProps) {
  const [picked, setPicked] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AppErrorPayload | null>(null)
  const [flagOpen, setFlagOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [flagging, setFlagging] = useState(false)
  const [flagError, setFlagError] = useState<AppErrorPayload | null>(null)
  const attempt = quiz.lastAttempt
  const isOX = quiz.type === 'ox'
  const reasonTrim = reason.trim()
  const correctText = attempt ? (quiz.choices[attempt.correctIndex] ?? '') : ''

  async function submit(): Promise<void> {
    if (picked === null) return
    setSubmitting(true)
    setError(null)
    const res = await onAnswer(quiz.id, picked)
    setSubmitting(false)
    if (!res.ok) setError(res.error)
  }

  async function flag(): Promise<void> {
    if (reasonTrim.length === 0) return
    setFlagging(true)
    setFlagError(null)
    const res = await onFlag(quiz.id, reasonTrim)
    setFlagging(false)
    if (res.ok) {
      setFlagOpen(false)
      setReason('')
    } else {
      setFlagError(res.error)
    }
  }

  function choiceClass(i: number): string {
    const base = cx(
      'rounded-xl border text-sm transition-colors disabled:cursor-default',
      isOX ? 'min-h-20 py-4 text-center text-2xl font-bold' : 'px-3 py-2 text-left'
    )
    if (attempt) {
      if (i === attempt.correctIndex) return cx(base, 'border-success bg-success-soft text-success')
      if (i === attempt.selectedIndex) return cx(base, 'border-danger bg-danger-soft text-danger')
      return cx(base, 'border-line bg-surface text-ink-3')
    }
    return cx(
      base,
      picked === i ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink hover:bg-surface-2'
    )
  }

  return (
    <li data-testid={`quiz-${quiz.id}`} className="space-y-3 rounded-xl border border-line bg-canvas p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-ink">
          <span className="mr-1 text-ink-3">{index + 1}.</span>
          {quiz.question}
        </p>
        <div className="flex shrink-0 flex-wrap gap-1">
          <Badge>{QUIZ_TYPE_LABEL[quiz.type]}</Badge>
          {quiz.flagged && <Badge tone="warn" testId={`quiz-flagged-${quiz.id}`}>신고됨</Badge>}
        </div>
      </div>

      <div role="group" aria-label={`문제 ${index + 1} 보기`} className={cx('grid gap-2', isOX ? 'grid-cols-2' : 'grid-cols-1')}>
        {quiz.choices.map((choice, i) => (
          <button
            key={i}
            type="button"
            data-testid={`quiz-choice-${quiz.id}-${i}`}
            aria-pressed={attempt ? attempt.selectedIndex === i : picked === i}
            disabled={attempt !== null || submitting}
            onClick={() => setPicked(i)}
            className={choiceClass(i)}
          >
            {isOX ? (
              choice
            ) : (
              <>
                <span className="mr-2 font-mono text-ink-3">{i + 1}</span>
                {choice}
              </>
            )}
          </button>
        ))}
      </div>

      {!attempt && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="primary"
            data-testid={`quiz-submit-${quiz.id}`}
            disabled={picked === null || submitting}
            onClick={() => void submit()}
          >
            {submitting ? '채점 중…' : '제출'}
          </Button>
        </div>
      )}

      {error && <ErrorNotice error={error} testId={`quiz-answer-error-${quiz.id}`} />}

      {attempt && (
        <div
          role="status"
          data-testid={`quiz-result-${quiz.id}`}
          className={cx(
            'space-y-1 rounded-lg px-3 py-2 text-sm',
            attempt.correct ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
          )}
        >
          <p className="font-medium">{attempt.correct ? '정답이에요!' : `아쉬워요. 정답은 ${correctText}이에요.`}</p>
          {attempt.explanation && <p className="text-ink-2">{attempt.explanation}</p>}
        </div>
      )}

      {!quiz.flagged && (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="ghost"
            data-testid={`quiz-flag-open-${quiz.id}`}
            aria-expanded={flagOpen}
            onClick={() => setFlagOpen((v) => !v)}
          >
            문제 신고
          </Button>
          {flagOpen && (
            <div className="space-y-2">
              <label htmlFor={`flag-reason-${quiz.id}`} className="text-xs text-ink-2">
                신고 사유
              </label>
              <textarea
                id={`flag-reason-${quiz.id}`}
                data-testid={`quiz-flag-reason-${quiz.id}`}
                rows={2}
                maxLength={300}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={inputClass}
              />
              <Button
                size="sm"
                variant="secondary"
                data-testid={`quiz-flag-submit-${quiz.id}`}
                disabled={reasonTrim.length === 0 || flagging}
                onClick={() => void flag()}
              >
                {flagging ? '보내는 중…' : '신고 보내기'}
              </Button>
              {flagError && <ErrorNotice error={flagError} testId={`quiz-flag-error-${quiz.id}`} />}
            </div>
          )}
        </div>
      )}
    </li>
  )
}
