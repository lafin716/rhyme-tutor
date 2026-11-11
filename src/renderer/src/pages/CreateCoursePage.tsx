import { useState } from 'react'
import type { AppErrorPayload, CharacterPresetId, CourseLevel, CoursePace } from '@shared/domain'
import { CreateCourseInputSchema } from '@shared/domain'
import { CHARACTER_PRESETS, getPreset } from '@shared/presets'
import { LEVEL_LABEL, PACE_LABEL } from '@shared/onboarding'
import { deriveCourseTitle } from '../lib/format'
import { run } from '../lib/result'
import { cx } from '../lib/cx'
import { useAppStore } from '../store/app-store'
import { useCourseStore } from '../store/course-store'
import { Shell } from '../components/Shell'
import { Avatar } from '../components/Avatar'
import { Button, ErrorNotice, inputClass, Toggle } from '../components/ui'

const STEP_TITLES = ['주제', '목표와 수준', '튜터', '확인'] as const
const LAST_STEP = STEP_TITLES.length - 1
const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']
const PACES: CoursePace[] = ['slow', 'normal', 'fast']

export function CreateCoursePage() {
  const navigate = useAppStore((s) => s.navigate)
  const loadCards = useCourseStore((s) => s.loadCards)
  // One requestId per form session: resubmits reuse it so the server never creates a duplicate course.
  const [requestId] = useState(() => crypto.randomUUID())
  const [step, setStep] = useState(0)
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [titleEdited, setTitleEdited] = useState(false)
  const [goal, setGoal] = useState('')
  const [level, setLevel] = useState<CourseLevel>('beginner')
  const [pace, setPace] = useState<CoursePace>('normal')
  const [presetId, setPresetId] = useState<CharacterPresetId>('kind-explainer')
  const [tutorName, setTutorName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<AppErrorPayload | null>(null)

  const preset = getPreset(presetId)
  const trimmedTitle = title.trim()
  const topicValid = topic.trim().length >= 2 && trimmedTitle.length >= 1 && trimmedTitle.length <= 60
  const goalValid = goal.trim().length >= 1 && goal.trim().length <= 300
  const nameValid = tutorName.trim().length <= 20
  const canNext = (step === 0 && topicValid) || (step === 1 && goalValid) || (step === 2 && nameValid) || step === 3

  function onTopicChange(value: string): void {
    setTopic(value)
    if (!titleEdited) setTitle(deriveCourseTitle(value))
  }

  async function submit(): Promise<void> {
    const candidate = {
      requestId,
      title: trimmedTitle,
      topicPrompt: topic.trim(),
      goal: goal.trim(),
      level,
      pace,
      presetId,
      ...(tutorName.trim() ? { tutorName: tutorName.trim() } : {})
    }
    const parsed = CreateCourseInputSchema.safeParse(candidate)
    if (!parsed.success) {
      setError({ code: 'VALIDATION', message: '입력한 내용을 다시 확인해 주세요.', retryable: false })
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await run(() => window.tutor.courses.create(parsed.data))
    setSubmitting(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    void loadCards()
    navigate({ name: 'classroom', courseId: res.data.course.id })
  }

  return (
    <Shell
      title="새 학습 만들기"
      onBack={() => navigate({ name: 'dashboard' })}
      testId="create-course-page"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6 sm:px-6">
        <ol className="flex flex-wrap gap-2 text-sm" aria-label="진행 단계" data-testid="create-steps">
          {STEP_TITLES.map((label, index) => (
            <li
              key={label}
              aria-current={index === step ? 'step' : undefined}
              className={cx(
                'rounded-full border px-3 py-1.5',
                index === step ? 'border-accent' : 'border-line',
                index === step ? 'bg-accent-soft font-medium text-accent' : 'text-ink-3'
              )}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>

        {step === 0 && (
          <section className="flex flex-col gap-5" data-testid="create-step-topic">
            <div className="space-y-1.5">
              <label htmlFor="course-topic" className="text-sm font-medium text-ink">
                무엇을 배우고 싶나요?
              </label>
              <textarea
                id="course-topic"
                data-testid="create-topic"
                rows={3}
                maxLength={500}
                value={topic}
                onChange={(e) => onTopicChange(e.target.value)}
                placeholder="예: 파이썬으로 데이터 분석하는 방법을 배우고 싶어요"
                className={cx(inputClass, 'resize-y')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="course-title" className="text-sm font-medium text-ink">
                수업 이름
              </label>
              <input
                id="course-title"
                data-testid="create-title"
                value={title}
                maxLength={60}
                onChange={(e) => {
                  setTitleEdited(true)
                  setTitle(e.target.value)
                }}
                className={inputClass}
              />
              <p className="text-xs text-warn" data-testid="create-title-warning">
                이름은 생성 후 변경할 수 없어요
              </p>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="flex flex-col gap-5" data-testid="create-step-goal">
            <div className="space-y-1.5">
              <label htmlFor="course-goal" className="text-sm font-medium text-ink">
                이 수업의 목표는 무엇인가요?
              </label>
              <textarea
                id="course-goal"
                data-testid="create-goal"
                rows={3}
                maxLength={300}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="예: 두 주 안에 간단한 분석 보고서를 만들 수 있으면 좋겠어요"
                className={cx(inputClass, 'resize-y')}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">수준</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="수준">
                {LEVELS.map((value) => (
                  <Toggle key={value} pressed={level === value} onClick={() => setLevel(value)} testId={`create-level-${value}`}>
                    {LEVEL_LABEL[value]}
                  </Toggle>
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-ink">학습 속도</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="학습 속도">
                {PACES.map((value) => (
                  <Toggle key={value} pressed={pace === value} onClick={() => setPace(value)} testId={`create-pace-${value}`}>
                    {PACE_LABEL[value]}
                  </Toggle>
                ))}
              </div>
            </fieldset>
          </section>
        )}

        {step === 2 && (
          <section className="flex flex-col gap-5" data-testid="create-step-tutor">
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-ink">튜터 스타일</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {CHARACTER_PRESETS.map((p) => {
                  const selected = p.id === presetId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={selected}
                      data-testid={`preset-${p.id}`}
                      onClick={() => setPresetId(p.id)}
                      className={cx(
                        'flex items-start gap-4 rounded-2xl border p-4 text-left transition-colors',
                        selected ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'
                      )}
                    >
                      <Avatar presetId={p.id} emotion={p.defaultEmotion} size="md" className="shrink-0" />
                      <span className="min-w-0 space-y-1">
                        <span className="block font-semibold text-ink">{p.defaultName}</span>
                        <span className="block text-xs text-accent">{p.archetype}</span>
                        <span className="block text-sm text-ink-2">{p.tagline}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <label htmlFor="tutor-name" className="text-sm font-medium text-ink">
                튜터 이름 <span className="font-normal text-ink-3">(선택)</span>
              </label>
              <input
                id="tutor-name"
                data-testid="create-tutor-name"
                value={tutorName}
                maxLength={20}
                placeholder={preset.defaultName}
                onChange={(e) => setTutorName(e.target.value)}
                className={inputClass}
              />
              <p className="text-xs text-ink-3">비워 두면 “{preset.defaultName}”이라고 불러요.</p>
              {!nameValid && <p className="text-xs text-danger">튜터 이름은 20자 이하로 입력해 주세요.</p>}
            </div>
          </section>
        )}

        {step === LAST_STEP && (
          <section className="flex flex-col gap-4" data-testid="create-step-confirm">
            <h2 className="text-lg font-semibold text-ink">이렇게 만들까요?</h2>
            <dl className="grid gap-3 rounded-2xl border border-line bg-surface p-5 text-sm sm:grid-cols-[120px_1fr]">
              <dt className="text-ink-3">수업 이름</dt>
              <dd className="font-medium text-ink" data-testid="confirm-title">{trimmedTitle}</dd>
              <dt className="text-ink-3">주제</dt>
              <dd className="text-ink">{topic.trim()}</dd>
              <dt className="text-ink-3">목표</dt>
              <dd className="text-ink">{goal.trim()}</dd>
              <dt className="text-ink-3">수준 · 속도</dt>
              <dd className="text-ink">
                {LEVEL_LABEL[level]} · {PACE_LABEL[pace]}
              </dd>
              <dt className="text-ink-3">튜터</dt>
              <dd className="text-ink">
                {tutorName.trim() || preset.defaultName} ({preset.archetype})
              </dd>
            </dl>
            <p className="text-xs text-ink-3">수업 이름은 생성 후 변경할 수 없어요.</p>
          </section>
        )}

        {error && <ErrorNotice error={error} onRetry={() => void submit()} busy={submitting} testId="create-error" />}

        <div className="flex items-center justify-between gap-3">
          <Button variant="secondary" data-testid="create-prev" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || submitting}>
            이전
          </Button>
          {step < LAST_STEP ? (
            <Button variant="primary" data-testid="create-next" onClick={() => setStep((s) => Math.min(LAST_STEP, s + 1))} disabled={!canNext}>
              다음
            </Button>
          ) : (
            <Button variant="primary" data-testid="create-submit" onClick={() => void submit()} disabled={submitting || !topicValid || !goalValid || !nameValid}>
              {submitting ? '만드는 중…' : '수업 만들기'}
            </Button>
          )}
        </div>
      </div>
    </Shell>
  )
}
