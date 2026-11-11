import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { useCourseStore, hasActiveCurriculumJob } from '../store/course-store'
import { greetingFor } from '../lib/format'
import { run } from '../lib/result'
import { Shell } from '../components/Shell'
import { ProviderChip } from '../components/ProviderChip'
import { CourseCard } from '../components/CourseCard'
import { EmptyCourses } from '../components/EmptyCourses'
import { Button, ErrorNotice, IconButton, Skeleton } from '../components/ui'

export function DashboardPage() {
  const navigate = useAppStore((s) => s.navigate)
  const notify = useAppStore((s) => s.notify)
  const cards = useCourseStore((s) => s.cards)
  const status = useCourseStore((s) => s.status)
  const error = useCourseStore((s) => s.error)
  const jobs = useCourseStore((s) => s.jobs)
  const loadCards = useCourseStore((s) => s.loadCards)
  const loadJobs = useCourseStore((s) => s.loadJobs)
  const setJob = useCourseStore((s) => s.setJob)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  useEffect(() => {
    void loadCards()
    void loadJobs()
  }, [loadCards, loadJobs])

  async function retryCurriculum(courseId: string): Promise<void> {
    setRetryingId(courseId)
    const res = await run(() => window.tutor.courses.retryCurriculum(courseId))
    setRetryingId(null)
    if (res.ok) {
      setJob(res.data)
      notify('커리큘럼을 다시 만들고 있어요.', 'info')
      void loadCards()
    } else {
      notify(res.error.message, 'error')
    }
  }

  const greeting = greetingFor(new Date().getHours())
  const showSkeleton = status === 'loading' && cards.length === 0

  return (
    <Shell
      title="홈"
      testId="dashboard-page"
      actions={
        <>
          <ProviderChip />
          <IconButton label="설정 열기" icon="settings" data-testid="open-settings" onClick={() => navigate({ name: 'settings', tab: 'provider' })} />
        </>
      }
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-ink-2" data-testid="dashboard-greeting">
              {greeting}
            </p>
            <h2 className="text-2xl font-semibold text-ink">오늘은 무엇을 배워 볼까요?</h2>
          </div>
          <Button variant="primary" data-testid="dashboard-new-course" onClick={() => navigate({ name: 'create' })}>
            새 학습 시작
          </Button>
        </section>

        {error && status === 'error' && (
          <ErrorNotice error={error} onRetry={() => void loadCards()} busy={false} testId="dashboard-error" />
        )}

        {showSkeleton && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="dashboard-loading">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        )}

        {status === 'ready' && cards.length === 0 && (
          <EmptyCourses onCreate={() => navigate({ name: 'create' })} />
        )}

        {cards.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" data-testid="course-grid">
            {cards.map((card) => {
              const generating =
                card.course.curriculumStatus === 'generating' ||
                card.course.curriculumStatus === 'pending' ||
                hasActiveCurriculumJob(jobs, card.course.id)
              return (
                <CourseCard
                  key={card.course.id}
                  card={card}
                  generating={generating}
                  retrying={retryingId === card.course.id}
                  onOpen={(courseId) => navigate({ name: 'classroom', courseId })}
                  onRetry={(courseId) => void retryCurriculum(courseId)}
                />
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
