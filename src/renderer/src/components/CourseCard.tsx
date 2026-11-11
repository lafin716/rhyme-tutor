import type { CourseCard as CourseCardData } from '@shared/domain'
import { LEVEL_LABEL } from '@shared/onboarding'
import { relativeTimeKo } from '../lib/format'
import { useNow } from '../lib/hooks'
import { Avatar } from './Avatar'
import { Badge, Button, ProgressBar, Spinner } from './ui'

interface CourseCardProps {
  card: CourseCardData
  generating: boolean
  retrying: boolean
  onOpen: (courseId: string) => void
  onRetry: (courseId: string) => void
}

export function CourseCard({ card, generating, retrying, onOpen, onRetry }: CourseCardProps) {
  const { course, tutor } = card
  const now = useNow(60_000)
  const failed = course.curriculumStatus === 'failed'
  const lessonLabel = card.currentLessonTitle ? '지금 단원' : '다음 단원'
  const lessonTitle =
    card.currentLessonTitle ??
    card.nextLessonTitle ??
    (failed ? '커리큘럼을 다시 만들어야 해요' : '커리큘럼을 준비하고 있어요')

  return (
    <article
      data-testid="course-card"
      data-course-id={course.id}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-soft"
    >
      <div className="flex items-start gap-4">
        <Avatar presetId={tutor.presetId} emotion={tutor.defaultEmotion} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink" data-testid="course-title">
            {course.title}
          </h2>
          <p className="truncate text-sm text-ink-2">
            {tutor.name} · {tutor.archetype} · {LEVEL_LABEL[course.level]}
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-ink-2">
          <span data-testid="course-progress-text">
            {card.completedLessons}/{card.totalLessons} 단원
          </span>
          <span data-testid="course-last-studied">{relativeTimeKo(course.lastStudiedAt, now)}</span>
        </div>
        <ProgressBar value={card.completedLessons} max={card.totalLessons} label={`${course.title} 진도`} />
      </div>

      <div className="space-y-1">
        <p className="text-xs text-ink-3">{lessonLabel}</p>
        <p className="truncate text-sm font-medium text-ink" data-testid="course-lesson">
          {lessonTitle}
        </p>
      </div>

      <div className="min-h-6">
        {generating && !failed && (
          <div data-testid="course-status-generating">
            <Spinner label="커리큘럼을 만들고 있어요" />
          </div>
        )}
        {failed && (
          <div className="flex flex-wrap items-center gap-2" data-testid="course-status-failed">
            <Badge tone="danger">커리큘럼 생성 실패</Badge>
            {course.curriculumError && (
              <span className="min-w-0 flex-1 truncate text-xs text-danger">{course.curriculumError}</span>
            )}
            <Button
              size="sm"
              variant="secondary"
              data-testid="course-retry"
              onClick={() => onRetry(course.id)}
              disabled={retrying}
            >
              {retrying ? '요청 중…' : '다시 시도'}
            </Button>
          </div>
        )}
        {!generating && !failed && course.curriculumStatus === 'ready' && (
          <Badge tone="success">준비 완료</Badge>
        )}
      </div>

      <Button
        variant="primary"
        data-testid="course-open"
        onClick={() => onOpen(course.id)}
        className="w-full"
      >
        이어서 수업하기
      </Button>
    </article>
  )
}
