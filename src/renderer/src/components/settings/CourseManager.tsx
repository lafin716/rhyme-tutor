import { useEffect, useState } from 'react'
import type { AppErrorPayload, CourseCard, CourseLevel, CoursePace, UpdateCourseInput } from '@shared/domain'
import { UpdateCourseInputSchema } from '@shared/domain'
import { LEVEL_LABEL, PACE_LABEL } from '@shared/onboarding'
import { run } from '../../lib/result'
import { cx } from '../../lib/cx'
import { useAppStore } from '../../store/app-store'
import { useCourseStore } from '../../store/course-store'
import { Badge, Button, Card, ErrorNotice, Skeleton, Toggle, inputClass } from '../ui'
import { Icon } from '../icons'

const LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']
const PACES: CoursePace[] = ['slow', 'normal', 'fast']

/** Lists courses for editing. Title and topic are immutable and shown read-only. */
export function CourseManager() {
  const cards = useCourseStore((s) => s.cards)
  const status = useCourseStore((s) => s.status)
  const error = useCourseStore((s) => s.error)
  const loadCards = useCourseStore((s) => s.loadCards)

  useEffect(() => {
    void loadCards()
  }, [loadCards])

  return (
    <section aria-labelledby="course-manager-title" data-testid="course-manager" className="space-y-4">
      <h2 id="course-manager-title" className="text-base font-semibold text-ink">
        수업 관리
      </h2>

      {status === 'loading' && cards.length === 0 && (
        <div className="space-y-3" data-testid="course-manager-loading" aria-busy="true">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      )}

      {status === 'error' && error && (
        <ErrorNotice error={error} onRetry={() => void loadCards()} busy={false} testId="course-manager-error" />
      )}

      {status !== 'loading' && !(status === 'error' && error) && cards.length === 0 && (
        <p className="text-sm text-ink-2" data-testid="course-manager-empty">
          아직 수업이 없어요. 새 수업을 만들면 여기서 관리할 수 있어요.
        </p>
      )}

      {cards.map((card) => (
        <CourseEditor key={`${card.course.id}-${card.course.updatedAt}`} card={card} />
      ))}
    </section>
  )
}

interface CourseEditorProps {
  card: CourseCard
}

function CourseEditor({ card }: CourseEditorProps) {
  const { course } = card
  const loadCards = useCourseStore((s) => s.loadCards)
  const notify = useAppStore((s) => s.notify)
  const [goal, setGoal] = useState(course.goal)
  const [level, setLevel] = useState<CourseLevel>(course.level)
  const [pace, setPace] = useState<CoursePace>(course.pace)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<AppErrorPayload | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [typedTitle, setTypedTitle] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<AppErrorPayload | null>(null)

  const goalTrim = goal.trim()
  const patch: UpdateCourseInput = {}
  if (goalTrim !== course.goal) patch.goal = goalTrim
  if (level !== course.level) patch.level = level
  if (pace !== course.pace) patch.pace = pace
  const dirty = Object.keys(patch).length > 0
  const parsed = UpdateCourseInputSchema.safeParse(patch)
  const goalInvalid = goalTrim.length === 0 || goalTrim.length > 300
  const canSave = dirty && parsed.success && !goalInvalid && !saving

  async function save(): Promise<void> {
    if (!canSave) return
    setSaving(true)
    setSaveError(null)
    const res = await run(() => window.tutor.courses.update(course.id, patch))
    setSaving(false)
    if (res.ok) {
      notify('수업 설정을 저장했어요.', 'success')
      await loadCards()
    } else {
      setSaveError(res.error)
    }
  }

  async function remove(): Promise<void> {
    if (typedTitle.trim() !== course.title) return
    setDeleting(true)
    setDeleteError(null)
    const res = await run(() => window.tutor.courses.delete(course.id))
    setDeleting(false)
    if (res.ok) {
      notify(`'${course.title}' 수업을 삭제했어요.`, 'success')
      await loadCards()
    } else {
      setDeleteError(res.error)
    }
  }

  return (
    <Card className="p-5">
      <article data-testid={`manage-course-${course.id}`} className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs text-ink-3">수업 이름</p>
            <p className="flex items-center gap-2 font-semibold text-ink" data-testid={`manage-title-${course.id}`}>
              <span className="truncate">{course.title}</span>
              <span
                className="inline-flex shrink-0 items-center gap-1 text-xs font-normal text-ink-3"
                title="주제 이름은 변경할 수 없어요"
                data-testid={`manage-title-lock-${course.id}`}
              >
                <Icon name="lock" size={14} />
                <span>주제 이름은 변경할 수 없어요</span>
              </span>
            </p>
          </div>
          {course.curriculumStatus !== 'ready' && (
            <Badge tone={course.curriculumStatus === 'failed' ? 'danger' : 'accent'}>
              {course.curriculumStatus === 'failed' ? '커리큘럼 실패' : '커리큘럼 준비 중'}
            </Badge>
          )}
        </div>

        <div className="space-y-1.5">
          <label htmlFor={`manage-goal-${course.id}`} className="text-sm font-medium text-ink">
            학습 목표
          </label>
          <textarea
            id={`manage-goal-${course.id}`}
            data-testid={`manage-goal-${course.id}`}
            rows={2}
            maxLength={300}
            value={goal}
            aria-invalid={goalInvalid}
            onChange={(e) => setGoal(e.target.value)}
            className={cx(inputClass, 'resize-y')}
          />
          {goalInvalid && (
            <p className="text-xs text-danger" data-testid={`manage-goal-error-${course.id}`}>
              목표를 1~300자로 입력해 주세요.
            </p>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">수준</legend>
          <div role="group" aria-label="수준" className="flex flex-wrap gap-2">
            {LEVELS.map((v) => (
              <Toggle key={v} pressed={level === v} onClick={() => setLevel(v)} testId={`manage-level-${course.id}-${v}`}>
                {LEVEL_LABEL[v]}
              </Toggle>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-ink">학습 속도</legend>
          <div role="group" aria-label="학습 속도" className="flex flex-wrap gap-2">
            {PACES.map((v) => (
              <Toggle key={v} pressed={pace === v} onClick={() => setPace(v)} testId={`manage-pace-${course.id}-${v}`}>
                {PACE_LABEL[v]}
              </Toggle>
            ))}
          </div>
        </fieldset>

        {saveError && <ErrorNotice error={saveError} testId={`manage-save-error-${course.id}`} />}

        <div className="flex justify-end">
          <Button variant="primary" size="sm" data-testid={`manage-save-${course.id}`} disabled={!canSave} onClick={() => void save()}>
            {saving ? '저장하는 중…' : '변경 저장'}
          </Button>
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          {!deleteOpen ? (
            <Button variant="ghost" size="sm" data-testid={`manage-delete-open-${course.id}`} onClick={() => setDeleteOpen(true)}>
              <Icon name="trash" size={16} />
              수업 삭제
            </Button>
          ) : (
            <div className="space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger" data-testid={`manage-delete-confirm-${course.id}`}>
              <p className="text-ink">
                삭제하면 대화와 퀴즈 기록도 함께 사라져요. 확인하려면 수업 이름 <span className="font-semibold">{course.title}</span>을 그대로 입력하세요.
              </p>
              <input
                aria-label="삭제 확인용 수업 이름 입력"
                data-testid={`manage-delete-input-${course.id}`}
                className={inputClass}
                value={typedTitle}
                onChange={(e) => setTypedTitle(e.target.value)}
              />
              {deleteError && <ErrorNotice error={deleteError} testId={`manage-delete-error-${course.id}`} />}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  data-testid={`manage-delete-submit-${course.id}`}
                  disabled={typedTitle.trim() !== course.title || deleting}
                  onClick={() => void remove()}
                >
                  {deleting ? '삭제하는 중…' : '영구 삭제'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`manage-delete-cancel-${course.id}`}
                  disabled={deleting}
                  onClick={() => {
                    setDeleteOpen(false)
                    setTypedTitle('')
                  }}
                >
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      </article>
    </Card>
  )
}
