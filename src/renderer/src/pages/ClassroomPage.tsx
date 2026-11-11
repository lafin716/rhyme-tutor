import { useEffect, useState } from 'react'
import { useAppStore } from '../store/app-store'
import { useClassroomStore } from '../store/classroom-store'
import { useChatStore } from '../store/chat-store'
import { useMediaQuery } from '../lib/hooks'
import { deriveEmotion, isTutorBusy } from '../lib/emotion'
import { cx } from '../lib/cx'
import { ProviderChip } from '../components/ProviderChip'
import { Button, ErrorNotice, IconButton, Skeleton } from '../components/ui'
import { CurriculumTree } from '../components/classroom/CurriculumTree'
import { ChatPanel } from '../components/classroom/ChatPanel'
import { TutorPanel } from '../components/classroom/TutorPanel'
import { QuizPanel } from '../components/classroom/QuizPanel'

type PaneTab = 'lesson' | 'chat' | 'tutor'

const PANE_TABS: { id: PaneTab; label: string }[] = [
  { id: 'lesson', label: '수업 흐름' },
  { id: 'chat', label: '대화' },
  { id: 'tutor', label: '선생님·퀴즈 패널' }
]

interface ClassroomPageProps {
  courseId: string
}

/** Three-pane classroom. Collapses the side panes below 1100px and switches to tabs below 800px. */
export function ClassroomPage({ courseId }: ClassroomPageProps) {
  const navigate = useAppStore((s) => s.navigate)
  const notify = useAppStore((s) => s.notify)
  const status = useClassroomStore((s) => s.status)
  const error = useClassroomStore((s) => s.error)
  const snapshot = useClassroomStore((s) => s.snapshot)
  const quizzes = useClassroomStore((s) => s.quizzes)
  const quizHint = useClassroomStore((s) => s.quizHint)
  const load = useClassroomStore((s) => s.load)
  const clear = useClassroomStore((s) => s.clear)
  const selectLesson = useClassroomStore((s) => s.selectLesson)
  const completeLesson = useClassroomStore((s) => s.completeLesson)
  const selfCheck = useClassroomStore((s) => s.selfCheck)
  const retryCurriculum = useClassroomStore((s) => s.retryCurriculum)
  const generateQuiz = useClassroomStore((s) => s.generateQuiz)
  const answerQuiz = useClassroomStore((s) => s.answerQuiz)
  const flagQuiz = useClassroomStore((s) => s.flagQuiz)
  const messages = useChatStore((s) => s.messages)
  const narrow = useMediaQuery('(max-width: 800px)')
  const compact = useMediaQuery('(max-width: 1100px)')
  const [tab, setTab] = useState<PaneTab>('chat')
  const [tutorOpen, setTutorOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    void load(courseId)
    return () => clear()
  }, [courseId, load, clear])

  const header = (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-4 py-3">
      <IconButton label="뒤로" icon="chevron-left" onClick={() => navigate({ name: 'dashboard' })} data-testid="back-button" />
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink" data-testid="classroom-title">
        {snapshot?.course.title ?? '수업'}
      </h1>
      <ProviderChip />
    </header>
  )

  if (status === 'error' && error) {
    return (
      <div className="flex h-full flex-col" data-testid="classroom-page">
        {header}
        <main className="p-6">
          <ErrorNotice error={error} onRetry={() => void load(courseId)} busy={false} testId="classroom-error" />
        </main>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="flex h-full flex-col" data-testid="classroom-page">
        {header}
        <main className="space-y-4 p-6" data-testid="classroom-loading" aria-busy="true">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64" />
        </main>
      </div>
    )
  }

  const emotion = deriveEmotion(messages, quizHint)
  const lesson = snapshot.currentLesson
  const chatBusy = snapshot.chatBusy || isTutorBusy(messages)
  const curriculumJob = snapshot.activeJobs.find((j) => j.type === 'curriculum_generation') ?? null

  const onSelectLesson = (lessonId: string): void => {
    void selectLesson(lessonId).then((res) => {
      if (!res.ok) notify(res.error.message, 'error')
    })
  }

  const onRetryCurriculum = (): void => {
    setRetrying(true)
    void retryCurriculum().then((res) => {
      setRetrying(false)
      if (res.ok) notify('커리큘럼을 다시 만들고 있어요.', 'info')
      else notify(res.error.message, 'error')
    })
  }

  const curriculum = (
    <CurriculumTree
      course={snapshot.course}
      modules={snapshot.modules}
      currentLessonId={snapshot.course.currentLessonId}
      job={curriculumJob}
      retrying={retrying}
      onSelectLesson={onSelectLesson}
      onRetryCurriculum={onRetryCurriculum}
    />
  )
  const chat = <ChatPanel tutorName={snapshot.tutor.name} lessonReady={lesson !== null} busy={chatBusy} />
  const tutor = (
    <div>
      <TutorPanel
        key={lesson?.id ?? 'none'}
        tutor={snapshot.tutor}
        emotion={emotion}
        lesson={lesson}
        onSelfCheck={selfCheck}
        onComplete={completeLesson}
      />
      <QuizPanel lesson={lesson} quizzes={quizzes} onGenerate={generateQuiz} onAnswer={answerQuiz} onFlag={flagQuiz} />
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="classroom-page">
      {header}
      {narrow ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div role="tablist" aria-label="수업 화면" className="flex shrink-0 gap-1 border-b border-line bg-surface px-2">
            {PANE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`pane-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`pane-${t.id}`}
                data-testid={`pane-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cx(
                  'flex-1 border-b-2 px-3 py-2.5 text-sm font-medium',
                  tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`pane-${tab}`}
            aria-labelledby={`pane-tab-${tab}`}
            className={cx('min-h-0 flex-1', tab === 'chat' ? 'flex flex-col' : 'overflow-y-auto')}
          >
            {tab === 'lesson' && curriculum}
            {tab === 'chat' && chat}
            {tab === 'tutor' && tutor}
          </div>
        </div>
      ) : compact ? (
        <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-y-auto border-r border-line bg-surface">{curriculum}</div>
          <div className="flex min-h-0 flex-col">
            <div className="flex shrink-0 justify-end border-b border-line px-3 py-2">
              <Button
                size="sm"
                variant="ghost"
                aria-expanded={tutorOpen}
                data-testid="toggle-tutor-panel"
                onClick={() => setTutorOpen((v) => !v)}
              >
                {tutorOpen ? '선생님·퀴즈 패널 닫기' : '선생님·퀴즈 패널 열기'}
              </Button>
            </div>
            {tutorOpen && (
              <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-line bg-surface">{tutor}</div>
            )}
            <div className="min-h-0 flex-1">{chat}</div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_340px]">
          <div className="min-h-0 overflow-y-auto border-r border-line bg-surface">{curriculum}</div>
          <div className="min-h-0">{chat}</div>
          <div className="min-h-0 overflow-y-auto border-l border-line bg-surface">{tutor}</div>
        </div>
      )}
    </div>
  )
}
