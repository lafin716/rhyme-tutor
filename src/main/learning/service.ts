/**
 * Learning services (BE-03/BE-05 backing). Transactional use-cases behind the IPC layer.
 * Rules enforced here: course identity is immutable, objective progress changes only with evidence rows,
 * quiz answers are graded in main, and the AI never marks progress by itself.
 */
import {
  AnswerQuizInputSchema,
  CreateCourseInputSchema,
  FlagQuizInputSchema,
  UpdateCourseInputSchema,
  type AnswerQuizInput,
  type BackgroundJob,
  type ChatMessage,
  type ClassroomSnapshot,
  type Course,
  type CourseCard,
  type CreateCourseInput,
  type CurriculumModule,
  type FlagQuizInput,
  type Lesson,
  type LearningSummary,
  type ObjectiveStatus,
  type QuizAttemptResult,
  type QuizQuestion,
  type UpdateCourseInput
} from '@shared/domain'
import { QUIZ_SKILL, completeStructured } from '../tutor/skills'
import { buildContext, MAX_MEMORIES } from '../tutor/context'
import { buildTutorCharacter } from '../tutor/character'
import type { TutorOrchestrator } from '../tutor/orchestrator'
import { ProviderError, type ProviderRegistry } from '../providers/types'
import type { AiSlot } from '../ai-slot'
import type { CourseDeleteGate } from '../course-gate'
import type { Db } from '../db/util'
import { mapDbError, newId, nowIso, RepoError } from '../db/util'
import { withTx } from '../db/connection'
import {
  deleteCourse,
  getCourse,
  getCourseByRequestId,
  getProfile,
  getSettings,
  getTutorByCourse,
  insertCourse,
  insertTutor,
  listCourses,
  setCurrentLesson,
  setCurriculumStatus,
  updateCourseMutable
} from '../db/repo-core'
import {
  attemptResult,
  cancelJobsForCourse,
  countMessagesSince,
  enqueueJob,
  flagQuiz,
  getMessage,
  getObjective,
  getQuizRow,
  insertAttempt,
  insertQuiz,
  latestAttemptFor,
  latestSummary,
  listJobs,
  listMemories,
  listMessages,
  listObjectivesForLesson,
  listQuizzesForLesson,
  loadCurriculum,
  nextOpenLessonId,
  rowToJob,
  rowToMessage,
  getLessonRow,
  setLessonStatus,
  setObjectiveWithEvidence
} from '../db/repo-learning'

export const CLASSROOM_MESSAGE_PAGE = 50
export const SUMMARY_JOB_PRIORITY = 0
export const CURRICULUM_JOB_PRIORITY = 10
export const JOB_MAX_ATTEMPTS = 3

export const jobKeys = {
  curriculum: (courseId: string): string => `curriculum:${courseId}`,
  summary: (courseId: string): string => `summary:${courseId}`
}

export interface LearningDeps {
  db: Db
  providers: ProviderRegistry
  slot: AiSlot
  orchestrator: TutorOrchestrator
  /** Shared with TutorOrchestrator: marks courses whose deletion has started. */
  gate: CourseDeleteGate
  /**
   * Blocks new jobs for a course, aborts its running job and resolves once it has stopped (wired by JobRunner).
   * The returned function lifts the block.
   */
  abortJobs?: (courseId: string) => Promise<() => void>
}

/** An in-flight quiz generation, tracked so that deleteCourse can abort it and wait for it to release the slot. */
interface QuizRun {
  courseId: string
  controller: AbortController
  done: Promise<void>
  finish: () => void
}

/** Keeps provider errors intact; maps everything else from SQLite to a stable RepoError. */
function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof RepoError || err instanceof ProviderError) throw err
    throw mapDbError(err)
  }
}

function requireCourse(db: Db, courseId: string): Course {
  const course = getCourse(db, courseId)
  if (!course) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
  return course
}

function flatLessons(modules: CurriculumModule[]): Lesson[] {
  return modules.flatMap((m) => m.lessons)
}

/** Lesson that belongs to the course, or NOT_FOUND. */
function requireLesson(db: Db, courseId: string, lessonId: string): void {
  const row = getLessonRow(db, lessonId)
  if (!row || row.course_id !== courseId) throw new RepoError('NOT_FOUND', '단원을 찾을 수 없어요.')
}

function cardFor(db: Db, course: Course): CourseCard {
  const tutor = getTutorByCourse(db, course.id)
  if (!tutor) throw new RepoError('NOT_FOUND', '튜터 정보를 찾을 수 없어요.')
  const lessons = flatLessons(loadCurriculum(db, course.id))
  const current = lessons.find((l) => l.id === course.currentLessonId) ?? null
  const currentIdx = current ? lessons.indexOf(current) : -1
  const next = lessons.slice(currentIdx + 1).find((l) => l.status !== 'completed') ?? null
  return {
    course,
    tutor,
    totalLessons: lessons.length,
    completedLessons: lessons.filter((l) => l.status === 'completed').length,
    currentLessonTitle: current?.title ?? null,
    nextLessonTitle: next?.title ?? null,
    lastLessonTitle: lessons.at(-1)?.title ?? null
  }
}

/** Public shape of the latest summary (the repo's internal coveredUntilSeq is not exposed). */
function publicSummary(s: (LearningSummary & { coveredUntilSeq: number }) | null): LearningSummary | null {
  if (!s) return null
  return {
    id: s.id,
    courseId: s.courseId,
    lessonId: s.lessonId,
    summary: s.summary,
    nextSteps: s.nextSteps,
    coveredUntilMessageId: s.coveredUntilMessageId,
    createdAt: s.createdAt
  }
}

export class LearningService {
  private readonly quizRuns = new Set<QuizRun>()

  constructor(private readonly deps: LearningDeps) {}

  private get db(): Db {
    return this.deps.db
  }

  // ───────────── courses ─────────────

  list(): CourseCard[] {
    return guard(() => listCourses(this.db).map((c) => cardFor(this.db, c)))
  }

  /**
   * Creates course + tutor + curriculum job in one transaction. Idempotent by requestId:
   * a repeated request returns the existing course card without creating anything.
   */
  createCourse(raw: unknown): CourseCard {
    const parsed = CreateCourseInputSchema.safeParse(raw)
    if (!parsed.success) throw new RepoError('VALIDATION', '코스 정보를 확인해 주세요.')
    const input: CreateCourseInput = parsed.data

    return guard(() => {
      const existing = getCourseByRequestId(this.db, input.requestId)
      if (existing) return cardFor(this.db, existing)

      const courseId = newId()
      const now = nowIso()
      let tutor
      try {
        tutor = buildTutorCharacter(input.presetId, { id: courseId }, getProfile(this.db), input.tutorName)
      } catch (err) {
        if (err instanceof RangeError) throw new RepoError('VALIDATION', '튜터 이름을 확인해 주세요.')
        throw err
      }

      withTx(this.db, () => {
        insertCourse(
          this.db,
          {
            id: courseId,
            requestId: input.requestId,
            title: input.title,
            topicPrompt: input.topicPrompt,
            goal: input.goal,
            level: input.level,
            pace: input.pace
          },
          now
        )
        insertTutor(this.db, tutor)
        enqueueJob(this.db, {
          type: 'curriculum_generation',
          courseId,
          dedupeKey: jobKeys.curriculum(courseId),
          priority: CURRICULUM_JOB_PRIORITY,
          maxAttempts: JOB_MAX_ATTEMPTS,
          payload: {}
        })
      })
      return cardFor(this.db, requireCourse(this.db, courseId))
    })
  }

  /** Goal, level and pace only. Title and topic prompt are immutable. */
  updateCourse(courseId: string, raw: unknown): Course {
    const parsed = UpdateCourseInputSchema.safeParse(raw)
    if (!parsed.success) throw new RepoError('VALIDATION', '수정할 값을 확인해 주세요.')
    const patch: UpdateCourseInput = parsed.data
    return guard(() => {
      requireCourse(this.db, courseId)
      withTx(this.db, () => updateCourseMutable(this.db, courseId, patch))
      return requireCourse(this.db, courseId)
    })
  }

  /**
   * Cancels queued jobs and the in-flight chat reply, waits for them to settle, then deletes the course.
   * FK cascade removes dependent rows.
   */
  async deleteCourse(courseId: string): Promise<void> {
    const { gate, orchestrator } = this.deps
    guard(() => requireCourse(this.db, courseId))
    // Synchronous, before the first await: new chat, retry, enqueue and quiz work for this course is refused from here on.
    gate.begin(courseId)
    let releaseJobs: (() => void) | null = null
    try {
      // Start every stop request before awaiting any of them so they run concurrently.
      const jobsBlocked = this.deps.abortJobs?.(courseId)
      orchestrator.cancel(courseId)
      const quizzesDone = this.abortQuizRuns(courseId)
      if (jobsBlocked) {
        // The block is held until the `finally` below, so no queued job for this course can run before the delete
        // transaction. The runner's abortCourse does not reject; this catch only covers an abortJobs that does.
        // The course is deleted in that case too: job rows are cancelled and cascade-deleted below.
        try {
          releaseJobs = await jobsBlocked
        } catch {
          releaseJobs = null
        }
      }
      await orchestrator.settle(courseId)
      await Promise.all(quizzesDone)
      // Re-checked inside the transaction: the course may already be gone.
      guard(() =>
        withTx(this.db, () => {
          cancelJobsForCourse(this.db, courseId)
          if (!deleteCourse(this.db, courseId)) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
        })
      )
    } finally {
      releaseJobs?.()
      gate.end(courseId)
    }
  }

  /** Aborts in-flight quiz generations for the course. Returns their completion promises. */
  private abortQuizRuns(courseId: string): Promise<void>[] {
    const waits: Promise<void>[] = []
    for (const run of this.quizRuns) {
      if (run.courseId !== courseId) continue
      run.controller.abort()
      waits.push(run.done)
    }
    return waits
  }

  private trackQuizRun(courseId: string): QuizRun {
    let finish: () => void = () => undefined
    const done = new Promise<void>((resolve) => {
      finish = resolve
    })
    const run: QuizRun = { courseId, controller: new AbortController(), done, finish }
    this.quizRuns.add(run)
    return run
  }

  private untrackQuizRun(run: QuizRun): void {
    this.quizRuns.delete(run)
    run.finish()
  }

  /** Re-queues curriculum generation after a failure. Returns the active job if one already exists. */
  retryCurriculum(courseId: string): BackgroundJob {
    return guard(() => {
      const course = requireCourse(this.db, courseId)
      this.deps.gate.assertOpen(courseId)
      if (course.curriculumStatus === 'ready') throw new RepoError('VALIDATION', '이미 커리큘럼이 준비되어 있어요.')
      const job = withTx(this.db, () => {
        if (course.curriculumStatus === 'failed') setCurriculumStatus(this.db, courseId, 'pending', null)
        return enqueueJob(this.db, {
          type: 'curriculum_generation',
          courseId,
          dedupeKey: jobKeys.curriculum(courseId),
          priority: CURRICULUM_JOB_PRIORITY,
          maxAttempts: JOB_MAX_ATTEMPTS,
          payload: {}
        })
      })
      return rowToJob(job.row)
    })
  }

  // ───────────── classroom ─────────────

  classroom(courseId: string): ClassroomSnapshot {
    return guard(() => {
      const course = requireCourse(this.db, courseId)
      const tutor = getTutorByCourse(this.db, courseId)
      if (!tutor) throw new RepoError('NOT_FOUND', '튜터 정보를 찾을 수 없어요.')
      const modules = loadCurriculum(this.db, courseId)
      const currentLesson = flatLessons(modules).find((l) => l.id === course.currentLessonId) ?? null
      const page = listMessages(this.db, courseId, CLASSROOM_MESSAGE_PAGE)
      return {
        course,
        tutor,
        modules,
        currentLesson,
        messages: page.rows.map(rowToMessage),
        hasMoreMessages: page.hasMore,
        quizzes: currentLesson ? listQuizzesForLesson(this.db, currentLesson.id) : [],
        latestSummary: publicSummary(latestSummary(this.db, courseId)),
        activeJobs: listJobs(this.db, { courseId, activeOnly: true }),
        chatBusy: this.deps.orchestrator.isBusy(courseId)
      }
    })
  }

  // ───────────── lessons ─────────────

  /** Sets the current lesson. A not_started lesson becomes in_progress. */
  selectLesson(courseId: string, lessonId: string): ClassroomSnapshot {
    return guard(() => {
      requireCourse(this.db, courseId)
      requireLesson(this.db, courseId, lessonId)
      withTx(this.db, () => {
        const row = getLessonRow(this.db, lessonId)
        if (row?.status === 'not_started') setLessonStatus(this.db, lessonId, 'in_progress')
        setCurrentLesson(this.db, courseId, lessonId)
      })
      return this.classroom(courseId)
    })
  }

  /**
   * Explicit learner action. Marks the lesson completed, advances to the next open lesson, and enqueues a
   * session summary when there are new messages to summarize.
   */
  completeLesson(courseId: string, lessonId: string): ClassroomSnapshot {
    return guard(() => {
      requireCourse(this.db, courseId)
      this.deps.gate.assertOpen(courseId)
      requireLesson(this.db, courseId, lessonId)
      withTx(this.db, () => {
        setLessonStatus(this.db, lessonId, 'completed')
        const next = nextOpenLessonId(this.db, courseId)
        setCurrentLesson(this.db, courseId, next ?? lessonId)

        const covered = latestSummary(this.db, courseId)?.coveredUntilSeq ?? 0
        if (countMessagesSince(this.db, courseId, covered) > 0) {
          enqueueJob(this.db, {
            type: 'session_summary',
            courseId,
            dedupeKey: jobKeys.summary(courseId),
            priority: SUMMARY_JOB_PRIORITY,
            maxAttempts: JOB_MAX_ATTEMPTS,
            payload: { lessonId }
          })
        }
      })
      return this.classroom(courseId)
    })
  }

  // ───────────── objectives ─────────────

  /**
   * Learner self-check. 'understood' -> achieved, otherwise needs_review. Always recorded as a self_report
   * evidence row in the same transaction.
   */
  selfCheck(objectiveId: string, understood: boolean): ClassroomSnapshot {
    const courseId = guard(() => {
      const obj = getObjective(this.db, objectiveId)
      if (!obj) throw new RepoError('NOT_FOUND', '목표를 찾을 수 없어요.')
      this.deps.gate.assertOpen(obj.course_id)
      withTx(this.db, () =>
        setObjectiveWithEvidence(this.db, objectiveId, understood ? 'achieved' : 'needs_review', {
          kind: 'self_report',
          refId: null,
          note: understood ? '학습자 자기 점검: 이해했어요' : '학습자 자기 점검: 다시 볼게요'
        })
      )
      return obj.course_id
    })
    return this.classroom(courseId)
  }

  // ───────────── chat history ─────────────

  history(courseId: string, beforeMessageId: string | null, limit: number): { messages: ChatMessage[]; hasMore: boolean } {
    return guard(() => {
      requireCourse(this.db, courseId)
      let beforeSeq: number | undefined
      if (beforeMessageId) {
        const anchor = getMessage(this.db, beforeMessageId)
        if (!anchor || anchor.course_id !== courseId) throw new RepoError('NOT_FOUND', '메시지를 찾을 수 없어요.')
        beforeSeq = anchor.seq
      }
      const page = listMessages(this.db, courseId, limit, beforeSeq)
      return { messages: page.rows.map(rowToMessage), hasMore: page.hasMore }
    })
  }

  // ───────────── quizzes ─────────────

  /**
   * Generates 3 to 5 questions for the lesson via QUIZ_SKILL and stores them with their answer keys.
   * Runs in the shared AI slot; fails with BUSY when another AI call is active or queued.
   */
  async generateQuiz(courseId: string, lessonId: string): Promise<QuizQuestion[]> {
    const { db, providers, slot, orchestrator, gate } = this.deps
    const { course, tutor, providerId, lesson, objectives, profile, summary, memories, timeoutMs, model } = guard(() => {
      const course = requireCourse(db, courseId)
      gate.assertOpen(courseId)
      requireLesson(db, courseId, lessonId)
      const settings = getSettings(db)
      if (!settings.activeProvider) throw new RepoError('VALIDATION', 'AI 제공자를 먼저 선택해 주세요.')
      const tutor = getTutorByCourse(db, courseId)
      if (!tutor) throw new RepoError('NOT_FOUND', '튜터 정보를 찾을 수 없어요.')
      const lessonRow = flatLessons(loadCurriculum(db, courseId)).find((l) => l.id === lessonId)
      if (!lessonRow) throw new RepoError('NOT_FOUND', '단원을 찾을 수 없어요.')
      return {
        course,
        tutor,
        providerId: settings.activeProvider,
        lesson: lessonRow,
        objectives: listObjectivesForLesson(db, lessonId),
        profile: getProfile(db),
        summary: latestSummary(db, courseId),
        memories: listMemories(db, courseId, MAX_MEMORIES),
        timeoutMs: settings.requestTimeoutSec * 1000,
        model: settings.activeProvider === 'claude-code' ? settings.claudeModel : settings.activeProvider === 'codex' ? settings.codexModel : null
      }
    })

    if (slot.active > 0 || slot.waiting > 0 || orchestrator.isBusy(courseId)) {
      throw new RepoError('BUSY', '다른 AI 작업이 끝난 뒤 다시 시도해 주세요.')
    }

    const provider = providers.get(providerId)
    const run = this.trackQuizRun(courseId)
    const { controller } = run
    try {
      // Aborted while queued: acquire rejects and no slot is taken. Aborted while running: the provider rejects
      // and the finally releases the slot.
      const release = await slot.acquire(controller.signal)
      let quiz
      try {
        const built = buildContext({
          tutor,
          course,
          profile,
          lesson: { title: lesson.title, summary: lesson.summary },
          objectives: objectives.map((o) => ({ description: o.description, status: o.status })),
          memories,
          summary,
          quizStats: null,
          recentMessages: [],
          learnerText: null,
          skill: QUIZ_SKILL.instruction
        })
        quiz = await completeStructured(provider, QUIZ_SKILL, {
          system: built.system,
          prompt: built.prompt,
          model,
          timeoutMs,
          signal: controller.signal
        })
      } finally {
        release()
      }

      return guard(() => {
        // Deleted during generation: store nothing (the delete would cascade these rows away anyway).
        if (controller.signal.aborted || !getCourse(db, courseId)) {
          throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
        }
        const createdIds = new Set<string>()
        withTx(db, () => {
          for (const q of quiz.questions) {
            const objectiveId = q.objectiveIndex !== null ? (objectives[q.objectiveIndex]?.id ?? null) : null
            const id = newId()
            createdIds.add(id)
            if (q.type === 'multiple_choice') {
              insertQuiz(db, {
                id,
                course_id: courseId,
                lesson_id: lessonId,
                objective_id: objectiveId,
                type: 'multiple_choice',
                question: q.question,
                choices_json: JSON.stringify(q.choices),
                answer_index: q.answerIndex,
                explanation: q.explanation,
                provider_id: providerId
              })
            } else {
              insertQuiz(db, {
                id,
                course_id: courseId,
                lesson_id: lessonId,
                objective_id: objectiveId,
                type: 'ox',
                question: q.question,
                choices_json: JSON.stringify(['O', 'X']),
                answer_index: q.answer === 'O' ? 0 : 1,
                explanation: q.explanation,
                provider_id: providerId
              })
            }
          }
        })
        return listQuizzesForLesson(db, lessonId).filter((q) => createdIds.has(q.id))
      })
    } catch (err) {
      if (controller.signal.aborted) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
      throw err
    } finally {
      this.untrackQuizRun(run)
    }
  }

  /**
   * Grades an answer in main against the stored key. Correct answers mark the objective achieved; a wrong answer
   * marks it needs_review only when it is not already achieved or flagged. Each status change writes evidence.
   */
  answerQuiz(raw: unknown): QuizAttemptResult {
    const parsed = AnswerQuizInputSchema.safeParse(raw)
    if (!parsed.success) throw new RepoError('VALIDATION', '선택지를 확인해 주세요.')
    const input: AnswerQuizInput = parsed.data

    return guard(() => {
      const quiz = getQuizRow(this.db, input.quizId)
      if (!quiz) throw new RepoError('NOT_FOUND', '퀴즈를 찾을 수 없어요.')
      const choiceCount = (JSON.parse(quiz.choices_json) as string[]).length
      if (input.selectedIndex >= choiceCount) throw new RepoError('VALIDATION', '선택지 번호가 범위를 벗어났어요.')

      const correct = input.selectedIndex === quiz.answer_index
      return withTx(this.db, () => {
        insertAttempt(this.db, {
          id: newId(),
          quizId: quiz.id,
          courseId: quiz.course_id,
          selectedIndex: input.selectedIndex,
          correct
        })
        const attempt = latestAttemptFor(this.db, quiz.id)
        if (!attempt) throw new RepoError('DB_ERROR', '답안을 저장하지 못했어요.')

        if (quiz.objective_id) {
          const obj = getObjective(this.db, quiz.objective_id)
          const target = this.gradeTarget(obj?.status, correct)
          if (obj && target) {
            setObjectiveWithEvidence(this.db, obj.id, target, {
              kind: 'quiz',
              refId: attempt.id,
              note: correct ? '퀴즈 정답' : '퀴즈 오답'
            })
          }
        }
        return attemptResult(attempt, quiz)
      })
    })
  }

  /** Status a quiz result should move an objective to, or null when no change is needed. */
  private gradeTarget(current: ObjectiveStatus | undefined, correct: boolean): ObjectiveStatus | null {
    if (correct) return current === 'achieved' ? null : 'achieved'
    if (current === 'achieved' || current === 'needs_review') return null
    return 'needs_review'
  }

  flagQuiz(raw: unknown): QuizQuestion {
    const parsed = FlagQuizInputSchema.safeParse(raw)
    if (!parsed.success) throw new RepoError('VALIDATION', '신고 사유를 확인해 주세요.')
    const input: FlagQuizInput = parsed.data
    return guard(() => {
      const quiz = getQuizRow(this.db, input.quizId)
      if (!quiz) throw new RepoError('NOT_FOUND', '퀴즈를 찾을 수 없어요.')
      withTx(this.db, () => {
        flagQuiz(this.db, input.quizId, input.reason)
      })
      const found = listQuizzesForLesson(this.db, quiz.lesson_id).find((q) => q.id === input.quizId)
      if (!found) throw new RepoError('NOT_FOUND', '퀴즈를 찾을 수 없어요.')
      return found
    })
  }

  // ───────────── jobs ─────────────

  jobs(courseId: string | null): BackgroundJob[] {
    return guard(() => listJobs(this.db, { courseId: courseId ?? undefined, limit: 50 }))
  }
}
