/**
 * TutorOrchestrator (BE-03). Owns chat replies: persists learner/tutor rows in one transaction, runs the
 * provider inside the shared AI slot, streams deltas, and finalizes the tutor row.
 * chat.send / startLesson / retry return as soon as rows are persisted; the reply continues in the background
 * and reports through ChatStreamEvent.
 */
import type { ChatMessage, ChatStreamEvent, AppErrorCode, AppErrorPayload, SendMessageInput, LearnerProfile } from '@shared/domain'
import type { Db } from '../db/util'
import { one, RepoError } from '../db/util'
import { withTx } from '../db/connection'
import { getCourse, getProfile, getSettings, getTutorByCourse, recordStudyActivity } from '../db/repo-core'
import {
  getMessage,
  hasStreamingForCourse,
  insertLearnerMessage,
  insertTutorMessage,
  finalizeMessage,
  listMemories,
  listMessagesAfterSeq,
  latestSummary,
  listObjectivesForLesson,
  resetMessageForRetry,
  rowToMessage,
  updateMessageContent,
  type MessageRow
} from '../db/repo-learning'
import { ProviderError, type ProviderLogger, type ProviderRegistry } from '../providers/types'
import type { AiSlot } from '../ai-slot'
import type { CourseDeleteGate } from '../course-gate'
import { buildContext, MAX_MEMORIES, type ContextMessage, type QuizStats } from './context'
import { EXPLANATION_SKILL } from './skills'

export const CHAT_HISTORY_WINDOW = 40
export const DELTA_PERSIST_INTERVAL_MS = 400

const RETRYABLE_CODES: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>(['PROVIDER_TIMEOUT', 'PROVIDER_FAILED', 'PROVIDER_RATE_LIMITED'])

export const LESSON_START_INSTRUCTION = [
  EXPLANATION_SKILL.instruction,
  '지금은 학습자의 질문이 없다. 현재 단원을 시작하는 짧은 인사와 단원의 핵심 첫 설명을 한다.'
].join('\n')

/** Maps any thrown value to the IPC error payload. Provider messages are already Korean and user-facing. */
export function toErrorPayload(err: unknown): AppErrorPayload {
  if (err instanceof ProviderError) {
    return {
      code: err.code,
      message: err.message,
      detail: err.detail,
      retryable: RETRYABLE_CODES.has(err.code)
    }
  }
  if (err instanceof RepoError) {
    return { code: err.code, message: err.message, detail: err.detail, retryable: false }
  }
  return { code: 'UNKNOWN', message: '알 수 없는 오류가 발생했어요.', retryable: false }
}

export interface TutorDeps {
  db: Db
  providers: ProviderRegistry
  slot: AiSlot
  emit: (event: ChatStreamEvent) => void
  log: ProviderLogger
  gate: CourseDeleteGate
  now?: () => number
}

type ProviderId = NonNullable<ReturnType<typeof getSettings>['activeProvider']>

interface ActiveReply {
  courseId: string
  tutorId: string
  controller: AbortController
  promise: Promise<void>
}

interface ReplyPlan {
  courseId: string
  tutorId: string
  /** Provider chosen when the send was accepted. The run uses this, not the settings at run time. */
  providerId: ProviderId
  lessonId: string | null
  /** Messages with seq >= anchorSeq are excluded from the transcript (the anchor message is sent as learnerText). */
  anchorSeq: number
  learnerText: string | null
  skill: string
  learnerMessage: MessageRow | null
}

export class TutorOrchestrator {
  private readonly active = new Map<string, ActiveReply>()
  private readonly now: () => number

  constructor(private readonly deps: TutorDeps) {
    this.now = deps.now ?? Date.now
  }

  /** Persists learner + tutor rows and starts the reply. Idempotent by clientMessageId. */
  send(input: SendMessageInput): { learnerMessage: ChatMessage; tutorMessage: ChatMessage } {
    const { db } = this.deps
    const course = getCourse(db, input.courseId)
    if (!course) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
    this.deps.gate.assertOpen(input.courseId)
    const provider = getSettings(db).activeProvider
    if (!provider) throw new RepoError('VALIDATION', 'AI 제공자를 먼저 선택해 주세요.')

    const existing = one<MessageRow>(
      db.prepare('SELECT * FROM messages WHERE course_id = ? AND client_message_id = ?'),
      input.courseId,
      input.clientMessageId
    )
    if (existing) {
      const reply = one<MessageRow>(
        db.prepare(`SELECT * FROM messages WHERE course_id = ? AND reply_to = ? AND role = 'tutor' ORDER BY seq LIMIT 1`),
        input.courseId,
        existing.id
      )
      if (!reply) throw new RepoError('NOT_FOUND', '응답 메시지를 찾을 수 없어요.')
      return { learnerMessage: rowToMessage(existing), tutorMessage: rowToMessage(reply) }
    }

    this.assertNotBusy(input.courseId)
    const lessonId = course.currentLessonId

    const { learnerRow, tutorRow } = withTx(db, () => {
      const { row: learnerRow } = insertLearnerMessage(db, {
        courseId: input.courseId,
        clientMessageId: input.clientMessageId,
        content: input.content,
        lessonId
      })
      const tutorRow = insertTutorMessage(db, {
        courseId: input.courseId,
        lessonId,
        replyTo: learnerRow.id,
        providerId: provider
      })
      recordStudyActivity(db, input.courseId, lessonId)
      return { learnerRow, tutorRow }
    })

    this.start({
      courseId: input.courseId,
      tutorId: tutorRow.id,
      providerId: provider,
      lessonId,
      anchorSeq: learnerRow.seq,
      learnerText: learnerRow.content,
      skill: EXPLANATION_SKILL.instruction,
      learnerMessage: learnerRow
    })

    return { learnerMessage: rowToMessage(learnerRow), tutorMessage: rowToMessage(tutorRow) }
  }

  /** Lesson kickoff: a tutor message with no learner input. */
  startLesson(courseId: string): { tutorMessage: ChatMessage } {
    const { db } = this.deps
    const course = getCourse(db, courseId)
    if (!course) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
    this.deps.gate.assertOpen(courseId)
    if (!course.currentLessonId) throw new RepoError('VALIDATION', '선택된 단원이 없어요.')
    const provider = getSettings(db).activeProvider
    if (!provider) throw new RepoError('VALIDATION', 'AI 제공자를 먼저 선택해 주세요.')
    this.assertNotBusy(courseId)

    const tutorRow = withTx(db, () => {
      const row = insertTutorMessage(db, {
        courseId,
        lessonId: course.currentLessonId,
        replyTo: null,
        providerId: provider,
        kind: 'chat'
      })
      recordStudyActivity(db, courseId, course.currentLessonId)
      return row
    })
    this.start({
      courseId,
      tutorId: tutorRow.id,
      providerId: provider,
      lessonId: course.currentLessonId,
      anchorSeq: tutorRow.seq,
      learnerText: null,
      skill: LESSON_START_INSTRUCTION,
      learnerMessage: null
    })
    return { tutorMessage: rowToMessage(tutorRow) }
  }

  /** Re-runs an error or cancelled tutor message in place (same row). */
  retry(tutorMessageId: string): { tutorMessage: ChatMessage } {
    const { db } = this.deps
    const tutor = getMessage(db, tutorMessageId)
    if (!tutor || tutor.role !== 'tutor') throw new RepoError('NOT_FOUND', '응답 메시지를 찾을 수 없어요.')
    if (tutor.status !== 'error' && tutor.status !== 'cancelled') {
      throw new RepoError('VALIDATION', '다시 시도할 수 없는 상태예요.')
    }
    this.deps.gate.assertOpen(tutor.course_id)
    const provider = getSettings(db).activeProvider
    if (!provider) throw new RepoError('VALIDATION', 'AI 제공자를 먼저 선택해 주세요.')
    this.assertNotBusy(tutor.course_id)

    const learner = tutor.reply_to ? getMessage(db, tutor.reply_to) : undefined
    if (!resetMessageForRetry(db, tutor.id)) throw new RepoError('VALIDATION', '다시 시도할 수 없는 상태예요.')
    db.prepare('UPDATE messages SET provider_id = ? WHERE id = ?').run(provider, tutor.id)

    this.start({
      courseId: tutor.course_id,
      tutorId: tutor.id,
      providerId: provider,
      lessonId: tutor.lesson_id,
      anchorSeq: learner ? learner.seq : tutor.seq,
      learnerText: learner ? learner.content : null,
      skill: learner ? EXPLANATION_SKILL.instruction : LESSON_START_INSTRUCTION,
      learnerMessage: learner ?? null
    })
    const fresh = getMessage(db, tutor.id) as MessageRow
    return { tutorMessage: rowToMessage(fresh) }
  }

  /** Aborts the in-flight reply for a course. Queued or running replies both finish as 'cancelled'. */
  cancel(courseId: string): void {
    const a = this.active.get(courseId)
    if (a) a.controller.abort()
  }

  /** Cancels every reply and waits for them to settle (before-quit). */
  async shutdown(): Promise<void> {
    for (const a of this.active.values()) a.controller.abort()
    await Promise.allSettled([...this.active.values()].map((a) => a.promise))
  }

  /** Test helper and graceful stop: resolves when all in-flight replies have finished. */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.active.values()].map((a) => a.promise))
  }

  /** Resolves when the in-flight reply for one course has finished (used before deleting the course). */
  async settle(courseId: string): Promise<void> {
    const a = this.active.get(courseId)
    if (a) await a.promise
  }

  isBusy(courseId: string): boolean {
    return this.active.has(courseId) || hasStreamingForCourse(this.deps.db, courseId)
  }

  private assertNotBusy(courseId: string): void {
    if (this.isBusy(courseId)) throw new RepoError('BUSY', '튜터가 아직 답변하고 있어요. 잠시 후 다시 시도해 주세요.')
  }

  private start(plan: ReplyPlan): void {
    const controller = new AbortController()
    const promise = this.run(plan, controller.signal).catch((err: unknown) => {
      this.deps.log('error', 'tutor reply crashed', { reason: err instanceof Error ? err.name : 'unknown' })
    })
    this.active.set(plan.courseId, { courseId: plan.courseId, tutorId: plan.tutorId, controller, promise })
    const tutor = getMessage(this.deps.db, plan.tutorId)
    this.deps.emit({
      type: 'started',
      courseId: plan.courseId,
      learnerMessage: plan.learnerMessage ? rowToMessage(plan.learnerMessage) : null,
      tutorMessage: rowToMessage(tutor as MessageRow)
    })
  }

  private buildPlan(plan: ReplyPlan) {
    const { db } = this.deps
    const course = getCourse(db, plan.courseId)
    const tutor = getTutorByCourse(db, plan.courseId)
    if (!course || !tutor) throw new RepoError('NOT_FOUND', '코스 정보를 찾을 수 없어요.')
    const profile: LearnerProfile | null = getProfile(db)
    const lesson = plan.lessonId
      ? one<{ title: string; summary: string }>(db.prepare('SELECT title, summary FROM curriculum_lessons WHERE id = ?'), plan.lessonId) ?? null
      : null
    const objectives = plan.lessonId
      ? listObjectivesForLesson(db, plan.lessonId).map((o) => ({ description: o.description, status: o.status }))
      : []
    const summary = latestSummary(db, plan.courseId)
    const coveredSeq = summary?.coveredUntilSeq ?? 0
    const recent: ContextMessage[] = listMessagesAfterSeq(db, plan.courseId, coveredSeq, CHAT_HISTORY_WINDOW)
      .filter((m) => m.seq < plan.anchorSeq)
      .map((m) => ({ seq: m.seq, role: m.role, content: m.content }))

    return buildContext({
      tutor,
      course,
      profile,
      lesson,
      objectives,
      memories: listMemories(db, plan.courseId, MAX_MEMORIES),
      summary,
      quizStats: this.quizStats(plan.lessonId),
      recentMessages: recent,
      learnerText: plan.learnerText,
      skill: plan.skill
    })
  }

  private quizStats(lessonId: string | null): QuizStats | null {
    if (!lessonId) return null
    const rows = this.deps.db
      .prepare(
        `SELECT q.objective_id AS objectiveId,
           (SELECT a.correct FROM quiz_attempts a WHERE a.quiz_id = q.id ORDER BY a.created_at DESC, a.rowid DESC LIMIT 1) AS correct
         FROM quizzes q WHERE q.lesson_id = ?`
      )
      .all(lessonId) as Array<{ objectiveId: string | null; correct: number | bigint | null }>
    const answered = rows.filter((r) => r.correct !== null)
    if (answered.length === 0) return null
    const wrongIds = new Set(answered.filter((r) => Number(r.correct) === 0 && r.objectiveId).map((r) => r.objectiveId as string))
    const wrongObjectives = listObjectivesForLesson(this.deps.db, lessonId)
      .filter((o) => wrongIds.has(o.id))
      .map((o) => o.description)
    return {
      total: answered.length,
      correct: answered.filter((r) => Number(r.correct) === 1).length,
      wrongObjectives
    }
  }

  private async run(plan: ReplyPlan, signal: AbortSignal): Promise<void> {
    const { db, providers, slot, emit, log } = this.deps
    let buffer = ''
    let lastPersist = 0
    const finishCancelled = (): void => {
      finalizeMessage(db, plan.tutorId, 'cancelled', buffer || null, 'PROVIDER_CANCELLED')
      const row = getMessage(db, plan.tutorId)
      if (row) emit({ type: 'cancelled', courseId: plan.courseId, message: rowToMessage(row) })
    }

    try {
      const release = await slot.acquire(signal)
      try {
        if (signal.aborted) throw new ProviderError('PROVIDER_CANCELLED', '응답을 취소했어요.')
        const settings = getSettings(db)
        const providerId = plan.providerId
        const provider = providers.get(providerId)
        const built = this.buildPlan(plan)
        if (built.trimmed.length > 0) log('info', 'context trimmed', { trimmed: built.trimmed.join(',') })
        const model = providerId === 'claude-code' ? settings.claudeModel : providerId === 'codex' ? settings.codexModel : null

        const result = await provider.complete({
          task: 'chat',
          system: built.system,
          prompt: built.prompt,
          model,
          timeoutMs: settings.requestTimeoutSec * 1000,
          signal,
          onDelta: (delta) => {
            buffer += delta
            emit({ type: 'delta', courseId: plan.courseId, messageId: plan.tutorId, delta })
            const t = this.now()
            if (t - lastPersist >= DELTA_PERSIST_INTERVAL_MS) {
              lastPersist = t
              updateMessageContent(db, plan.tutorId, buffer)
            }
          }
        })
        const text = result.text.trim() || buffer
        finalizeMessage(db, plan.tutorId, 'complete', text, null)
        const row = getMessage(db, plan.tutorId)
        if (row) emit({ type: 'completed', courseId: plan.courseId, message: rowToMessage(row) })
      } finally {
        release()
      }
    } catch (err) {
      const aborted = signal.aborted || (err instanceof ProviderError && err.code === 'PROVIDER_CANCELLED')
      if (aborted) {
        finishCancelled()
        return
      }
      const error = toErrorPayload(err)
      log('warn', 'tutor reply failed', { code: error.code })
      finalizeMessage(db, plan.tutorId, 'error', buffer || null, error.code)
      const row = getMessage(db, plan.tutorId)
      if (row) emit({ type: 'failed', courseId: plan.courseId, message: rowToMessage(row), error })
    } finally {
      this.active.delete(plan.courseId)
    }
  }
}
