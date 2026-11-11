/**
 * JobRunner (BE-04). One worker loop that claims queued background jobs and runs them through the shared AiSlot.
 * Retry: PROVIDER_TIMEOUT / PROVIDER_FAILED / PROVIDER_RATE_LIMITED / INVALID_AI_OUTPUT retry with backoff until
 * max_attempts. Auth or missing-CLI errors fail immediately. Cancellation marks the job cancelled.
 */
import type { BackgroundJob } from '@shared/domain'
import type { AiSlot } from '../ai-slot'
import type { Db } from '../db/util'
import { RepoError, many } from '../db/util'
import { withTx } from '../db/connection'
import { getCourse, setCurriculumStatus } from '../db/repo-core'
import {
  claimNextJob,
  finishJob,
  getJob,
  recoverRunningJobs,
  requeueJob,
  rowToJob,
  recoverStreamingMessages,
  type JobRow
} from '../db/repo-learning'
import { ProviderError, type ProviderLogger, type ProviderRegistry } from '../providers/types'
import { runCurriculumGeneration, runSessionSummary, type HandlerContext } from './handlers'

export const MAX_CONCURRENT_AI_JOBS = 1
export const JOB_POLL_MS = 1_000
/** Spec backoff (leader decision): retry after 5s, then 20s. max_attempts = 3 comes from the job row. */
export const RETRY_DELAYS_MS = [5_000, 20_000] as const
export const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  'PROVIDER_TIMEOUT',
  'PROVIDER_FAILED',
  'PROVIDER_RATE_LIMITED',
  'INVALID_AI_OUTPUT'
])

const SHUTDOWN_REASON = 'shutdown'
const COURSE_REASON = 'course-deleted'

/** Delay before retry number `attempt` (1-based count of attempts already made). */
export function backoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt - 1, 0), RETRY_DELAYS_MS.length - 1)
  return RETRY_DELAYS_MS[idx] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 20_000
}

export interface RecoverySummary {
  requeuedJobs: number
  recoveredMessages: number
  failedCurricula: number
}

/**
 * Startup recovery: running jobs go back to queued, streaming tutor replies become error, and curriculum that
 * is still "generating" without an active job is marked failed.
 */
export function recoverOnStartup(db: Db): RecoverySummary {
  return withTx(db, () => {
    const requeuedJobs = recoverRunningJobs(db)
    const recoveredMessages = recoverStreamingMessages(db)
    const orphans = many<{ id: string }>(
      db.prepare(
        `SELECT id FROM courses
         WHERE curriculum_status = 'generating'
           AND id NOT IN (
             SELECT course_id FROM background_jobs
             WHERE type = 'curriculum_generation' AND status IN ('queued','running') AND course_id IS NOT NULL
           )`
      )
    )
    for (const o of orphans) setCurriculumStatus(db, o.id, 'failed', '앱이 종료되어 중단되었어요')
    return { requeuedJobs, recoveredMessages, failedCurricula: orphans.length }
  })
}

export interface JobRunnerDeps {
  db: Db
  providers: ProviderRegistry
  slot: AiSlot
  emit: (job: BackgroundJob) => void
  log: ProviderLogger
  pollMs?: number
}

interface Failure {
  code: string
  message: string
}

function failureOf(err: unknown): Failure {
  if (err instanceof ProviderError || err instanceof RepoError) return { code: err.code, message: err.message }
  return { code: 'UNKNOWN', message: '작업 중 오류가 발생했어요.' }
}

interface ActiveJob {
  courseId: string | null
  controller: AbortController
  done: Promise<void>
}

export class JobRunner {
  private stopping = false
  private loop: Promise<void> | null = null
  private current: ActiveJob | null = null
  private wakeIdle: (() => void) | null = null
  /** Courses being deleted: their queued jobs are cancelled instead of run. */
  private readonly blockedCourses = new Set<string>()

  constructor(private readonly deps: JobRunnerDeps) {}

  /** Runs startup recovery and starts the worker loop. */
  start(): RecoverySummary {
    const summary = recoverOnStartup(this.deps.db)
    this.deps.log('info', 'job recovery complete', { ...summary })
    this.loop = this.run()
    return summary
  }

  /** Wakes the worker loop immediately (e.g. after a new job was enqueued). */
  kick(): void {
    this.wakeIdle?.()
  }

  /**
   * Blocks new claims for the course, aborts its running job (if any) and resolves once it has stopped.
   * The returned function lifts the block; the caller must invoke it after the course deletion has finished.
   * Never rejects: a failed abort is logged and the release function is still returned, so the caller can always
   * release the block and the block stays in place until then.
   */
  async abortCourse(courseId: string): Promise<() => void> {
    this.blockedCourses.add(courseId)
    const release = (): void => {
      this.blockedCourses.delete(courseId)
    }
    try {
      const cur = this.current
      if (cur && cur.courseId === courseId) {
        cur.controller.abort(COURSE_REASON)
        await cur.done
      }
    } catch (err) {
      this.deps.log('warn', 'course job abort failed', { reason: err instanceof Error ? err.name : 'unknown' })
    }
    return release
  }

  /** Graceful stop: aborts the running job (it is re-queued for the next launch) and waits for the loop to exit. */
  async stop(): Promise<void> {
    this.stopping = true
    this.current?.controller.abort(SHUTDOWN_REASON)
    this.kick()
    await this.loop
  }

  private async run(): Promise<void> {
    while (!this.stopping) {
      const row = this.claim()
      if (!row) {
        await this.idle(this.deps.pollMs ?? JOB_POLL_MS)
        continue
      }
      if (row.course_id && this.blockedCourses.has(row.course_id)) {
        // Claimed while its course is being deleted: never run it.
        finishJob(this.deps.db, row.id, 'cancelled', null)
        this.publish(row.id)
        continue
      }
      await this.execute(row)
    }
  }

  private claim(): JobRow | undefined {
    try {
      return claimNextJob(this.deps.db)
    } catch (err) {
      this.deps.log('error', 'job claim failed', { reason: err instanceof Error ? err.name : 'unknown' })
      return undefined
    }
  }

  private idle(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve()
        return
      }
      const timer = setTimeout(() => finish(), ms)
      const finish = (): void => {
        clearTimeout(timer)
        this.wakeIdle = null
        signal?.removeEventListener('abort', finish)
        resolve()
      }
      this.wakeIdle = finish
      signal?.addEventListener('abort', finish, { once: true })
    })
  }

  private publish(id: string): void {
    const row = getJob(this.deps.db, id)
    if (row) this.deps.emit(rowToJob(row))
  }

  private markCurriculum(row: JobRow, status: 'pending' | 'failed', error: string | null): void {
    if (row.type !== 'curriculum_generation' || !row.course_id) return
    if (getCourse(this.deps.db, row.course_id)) setCurriculumStatus(this.deps.db, row.course_id, status, error)
  }

  private async handle(ctx: HandlerContext): Promise<void> {
    if (ctx.job.type === 'curriculum_generation') return runCurriculumGeneration(ctx)
    return runSessionSummary(ctx)
  }

  private async execute(row: JobRow): Promise<void> {
    const { db, slot, log } = this.deps
    const controller = new AbortController()
    let resolveDone: () => void = () => undefined
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve
    })
    this.current = { courseId: row.course_id, controller, done }

    try {
      this.publish(row.id)
      let failure: Failure | null = null
      let release: (() => void) | null = null
      try {
        release = await slot.acquire(controller.signal)
        await this.handle({ job: row, signal: controller.signal, deps: { db, providers: this.deps.providers } })
      } catch (err) {
        failure = failureOf(err)
      } finally {
        release?.()
      }

      if (!failure) {
        finishJob(db, row.id, 'succeeded', null)
        this.publish(row.id)
        return
      }
      await this.settleFailure(row, failure, controller.signal, log)
    } finally {
      this.current = null
      resolveDone()
    }
  }

  private async settleFailure(row: JobRow, failure: Failure, signal: AbortSignal, log: ProviderLogger): Promise<void> {
    const { db } = this.deps
    if (signal.aborted) {
      if (signal.reason === SHUTDOWN_REASON) {
        // Stays queued for the next launch (attempt already counted).
        requeueJob(db, row.id, '앱 종료로 중단됐어요')
        this.markCurriculum(row, 'pending', null)
      } else {
        finishJob(db, row.id, 'cancelled', null)
        this.markCurriculum(row, 'pending', null)
      }
      this.publish(row.id)
      return
    }
    if (failure.code === 'PROVIDER_CANCELLED') {
      finishJob(db, row.id, 'cancelled', null)
      this.publish(row.id)
      return
    }

    const attempts = getJob(db, row.id)?.attempts ?? row.attempts
    const canRetry = RETRYABLE_CODES.has(failure.code) && attempts < row.max_attempts
    log('warn', 'job failed', { jobType: row.type, code: failure.code, attempts, retry: canRetry })

    if (canRetry) {
      requeueJob(db, row.id, failure.message)
      this.markCurriculum(row, 'pending', null)
      this.publish(row.id)
      await this.idle(backoffMs(attempts), signal)
      if (signal.aborted && signal.reason === COURSE_REASON) {
        // The course is being deleted: do not leave the re-queued job for the loop to claim.
        finishJob(db, row.id, 'cancelled', null)
        this.publish(row.id)
      }
      return
    }

    finishJob(db, row.id, 'failed', failure.message)
    this.markCurriculum(row, 'failed', failure.message)
    this.publish(row.id)
  }
}
