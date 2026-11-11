import type { BackgroundJob, Course, CurriculumModule, JobStatus, LessonStatus } from '@shared/domain'
import { cx } from '../../lib/cx'
import { LESSON_STATUS_LABEL } from '../../lib/labels'
import { Button, ProgressBar, Skeleton, Spinner } from '../ui'

interface CurriculumTreeProps {
  course: Course
  modules: CurriculumModule[]
  currentLessonId: string | null
  job: BackgroundJob | null
  retrying: boolean
  onSelectLesson: (lessonId: string) => void
  onRetryCurriculum: () => void
}

const LESSON_TONE: Record<LessonStatus, string> = {
  not_started: 'bg-surface-2 text-ink-2',
  in_progress: 'bg-accent-soft text-accent',
  completed: 'bg-success-soft text-success',
  needs_review: 'bg-warn-soft text-warn'
}

const JOB_LABEL: Partial<Record<JobStatus, string>> = {
  queued: '대기 중',
  running: '생성 중'
}

/** Curriculum tree: modules → lessons with status, overall progress and the current-lesson highlight. */
export function CurriculumTree({
  course,
  modules,
  currentLessonId,
  job,
  retrying,
  onSelectLesson,
  onRetryCurriculum
}: CurriculumTreeProps) {
  const lessons = modules.flatMap((m) => m.lessons)
  const total = lessons.length
  const completed = lessons.filter((l) => l.status === 'completed').length
  const generating = course.curriculumStatus === 'pending' || course.curriculumStatus === 'generating'
  const failed = course.curriculumStatus === 'failed'
  const jobLabel = job ? JOB_LABEL[job.status] : undefined

  return (
    <nav aria-label="커리큘럼" data-testid="curriculum-tree" className="flex flex-col pb-6">
      <div className="space-y-2 px-4 pb-3 pt-4">
        <p className="text-xs font-medium text-ink-2">전체 진행</p>
        <p className="text-sm text-ink" data-testid="curriculum-progress-text">
          {completed} / {total} 단원 완료
        </p>
        <ProgressBar value={completed} max={total} label="전체 진행률" />
      </div>

      {failed && (
        <div className="mx-4 mb-3 space-y-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert" data-testid="curriculum-failed">
          <p className="font-medium">커리큘럼을 만들지 못했어요.</p>
          {course.curriculumError && <p className="break-all text-xs opacity-70">{course.curriculumError}</p>}
          <Button size="sm" variant="secondary" data-testid="curriculum-retry" onClick={onRetryCurriculum} disabled={retrying}>
            {retrying ? '다시 만드는 중…' : '다시 생성'}
          </Button>
        </div>
      )}

      {generating && (
        <div className="space-y-3 px-4 pb-4" data-testid="curriculum-generating">
          <Spinner label={jobLabel ? `커리큘럼을 만들고 있어요 (${jobLabel})` : '커리큘럼을 만들고 있어요'} />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </div>
      )}

      {!generating && modules.length === 0 && !failed && (
        <p className="px-4 text-sm text-ink-2" data-testid="curriculum-empty">아직 단원이 없어요.</p>
      )}

      {modules.map((m) => (
        <section key={m.id} data-testid={`module-${m.id}`} className="pt-2">
          <h3 className="px-4 pb-1 text-xs font-semibold text-ink-3">{m.title}</h3>
          <ul>
            {m.lessons.map((lesson) => {
              const current = lesson.id === currentLessonId
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    data-testid={`lesson-${lesson.id}`}
                    data-status={lesson.status}
                    aria-current={current ? 'step' : undefined}
                    onClick={() => onSelectLesson(lesson.id)}
                    className={cx(
                      'flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm transition-colors',
                      current ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                    )}
                  >
                    <span className="min-w-0 truncate">{lesson.title}</span>
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', LESSON_TONE[lesson.status])}>
                      {LESSON_STATUS_LABEL[lesson.status]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </nav>
  )
}
