import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { OnboardingAnswersSchema } from '@shared/domain'
import type { LearnerProfile, OnboardingAnswers } from '@shared/domain'
import { SURVEY } from '@shared/onboarding'
import { cx } from '../lib/cx'
import { run } from '../lib/result'
import type { AppErrorPayload } from '../lib/result'
import { useAppStore } from '../store/app-store'
import { Button, ErrorNotice, ProgressBar } from './ui'

type Key = keyof OnboardingAnswers
type Draft = Partial<Record<Key, string>>

interface SurveyFlowProps {
  mode: 'initial' | 'edit'
  initialAnswers?: OnboardingAnswers
  onSaved: (profile: LearnerProfile) => void
  onCancel?: () => void
}

/** One question per step. Saves the learner's situation via profile.save; never shows a label about the learner. */
export function SurveyFlow({ mode, initialAnswers, onSaved, onCancel }: SurveyFlowProps) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState<Draft>(() => ({ ...initialAnswers }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<AppErrorPayload | null>(null)
  const setProfile = useAppStore((s) => s.setProfile)

  const total = SURVEY.length
  const question = SURVEY[step]
  if (!question) return null

  const options: readonly { value: string; label: string }[] = question.options
  const questionKey = question.key
  const selected = draft[questionKey]
  const isLast = step === total - 1

  function choose(value: string): void {
    setDraft((prev) => ({ ...prev, [questionKey]: value }))
  }

  function onRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft']
    if (!keys.includes(event.key)) return
    event.preventDefault()
    const dir = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + dir + options.length) % options.length
    const next = options[nextIndex]
    if (!next) return
    choose(next.value)
    const group = event.currentTarget.parentElement
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[nextIndex]?.focus()
  }

  async function save(): Promise<void> {
    const parsed = OnboardingAnswersSchema.safeParse(draft)
    if (!parsed.success) {
      setError({ code: 'VALIDATION', message: '모든 질문에 답해 주세요.', retryable: false })
      return
    }
    setSaving(true)
    setError(null)
    const res = await run(() => window.tutor.profile.save(parsed.data))
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setProfile(res.data)
    onSaved(res.data)
  }

  const headingId = `survey-q-${question.key}`

  return (
    <section data-testid="survey" className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="space-y-2">
        <p className="text-xs font-medium text-accent">학습 전략을 맞추기 위한 질문이에요</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar value={step + 1} max={total} label="설문 진행률" />
          </div>
          <span data-testid="survey-progress" className="shrink-0 text-xs text-ink-2">
            {step + 1} / {total}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <h2 id={headingId} data-testid="survey-title" className="text-xl font-semibold text-ink">
          {question.title}
        </h2>
        <p className="text-sm text-ink-2">{question.helper}</p>
      </div>

      <div role="radiogroup" aria-labelledby={headingId} className="flex flex-col gap-2">
        {options.map((option, index) => {
          const checked = selected === option.value
          const isFirstFallback = !selected && index === 0
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={checked || isFirstFallback ? 0 : -1}
              data-testid={`survey-option-${option.value}`}
              onClick={() => choose(option.value)}
              onKeyDown={(e) => onRadioKeyDown(e, index)}
              className={cx(
                'flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-colors',
                checked
                  ? 'border-accent bg-accent-soft text-ink'
                  : 'border-line bg-surface text-ink hover:bg-surface-2'
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                  checked ? 'border-accent' : 'border-ink-3'
                )}
              >
                {checked && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>

      {error && <ErrorNotice error={error} testId="survey-error" />}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} data-testid="survey-cancel" disabled={saving}>
              취소
            </Button>
          )}
          <Button
            variant="secondary"
            data-testid="survey-prev"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || saving}
          >
            이전
          </Button>
        </div>
        {isLast ? (
          <Button
            variant="primary"
            data-testid="survey-save"
            onClick={() => void save()}
            disabled={!selected || saving}
          >
            {saving ? '저장 중…' : mode === 'initial' ? '완료' : '저장'}
          </Button>
        ) : (
          <Button
            variant="primary"
            data-testid="survey-next"
            onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
            disabled={!selected}
          >
            다음
          </Button>
        )}
      </div>
    </section>
  )
}
