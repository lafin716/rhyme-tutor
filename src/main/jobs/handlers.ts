/**
 * Background job handlers (BE-04). Each handler runs inside the AiSlot held by JobRunner and receives an
 * AbortSignal. Writes happen only after the AI call succeeds, and only if the course still exists.
 */
import type { JobRow } from '../db/repo-learning'
import type { Db } from '../db/util'
import { RepoError } from '../db/util'
import { withTx } from '../db/connection'
import { getCourse, getProfile, getSettings, getTutorByCourse, setCurriculumStatus } from '../db/repo-core'
import {
  insertSummary,
  latestSummary,
  listMemories,
  listMessagesAfterSeq,
  listObjectivesForLesson,
  loadCurriculum,
  replaceCurriculum
} from '../db/repo-learning'
import { buildContext, MAX_MEMORIES } from '../tutor/context'
import { CURRICULUM_SKILL, SUMMARY_SKILL, completeStructured } from '../tutor/skills'
import type { ProviderRegistry } from '../providers/types'

/** Upper bound on how many new messages one summary covers. */
export const SUMMARY_MESSAGE_LIMIT = 200

export interface HandlerDeps {
  db: Db
  providers: ProviderRegistry
}

export interface HandlerContext {
  job: JobRow
  signal: AbortSignal
  deps: HandlerDeps
}

interface ProviderSettings {
  providerId: NonNullable<ReturnType<typeof getSettings>['activeProvider']>
  model: string | null
  timeoutMs: number
}

/** Resolves the active provider and its model/timeout, or fails with PROVIDER_NOT_SELECTED. */
export function resolveProviderSettings(db: Db): ProviderSettings {
  const settings = getSettings(db)
  if (!settings.activeProvider) {
    throw new RepoError('PROVIDER_NOT_SELECTED', 'AI 제공자를 먼저 선택해 주세요.')
  }
  const model =
    settings.activeProvider === 'claude-code'
      ? settings.claudeModel
      : settings.activeProvider === 'codex'
        ? settings.codexModel
        : null
  return { providerId: settings.activeProvider, model, timeoutMs: settings.requestTimeoutSec * 1000 }
}

function courseIdOf(job: JobRow): string {
  if (!job.course_id) throw new RepoError('VALIDATION', '작업에 코스 정보가 없어요.')
  return job.course_id
}

function lessonIdOf(job: JobRow): string | null {
  try {
    const payload = JSON.parse(job.payload_json) as { lessonId?: unknown }
    return typeof payload.lessonId === 'string' ? payload.lessonId : null
  } catch {
    return null
  }
}

/**
 * curriculum_generation: builds the curriculum with CURRICULUM_SKILL and replaces the course's curriculum
 * atomically. Sets curriculum status to ready on success. Failure handling (pending/failed) is done by JobRunner.
 */
export async function runCurriculumGeneration(ctx: HandlerContext): Promise<void> {
  const { db, providers } = ctx.deps
  const courseId = courseIdOf(ctx.job)
  const course = getCourse(db, courseId)
  if (!course) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
  if (course.curriculumStatus === 'ready') return

  const { providerId, model, timeoutMs } = resolveProviderSettings(db)
  const tutor = getTutorByCourse(db, courseId)
  if (!tutor) throw new RepoError('NOT_FOUND', '튜터 정보를 찾을 수 없어요.')

  setCurriculumStatus(db, courseId, 'generating', null)
  const built = buildContext({
    tutor,
    course,
    profile: getProfile(db),
    lesson: null,
    objectives: [],
    memories: [],
    summary: null,
    quizStats: null,
    recentMessages: [],
    learnerText: course.topicPrompt,
    skill: CURRICULUM_SKILL.instruction
  })
  const curriculum = await completeStructured(providers.get(providerId), CURRICULUM_SKILL, {
    system: built.system,
    prompt: built.prompt,
    model,
    timeoutMs,
    signal: ctx.signal
  })

  withTx(db, () => {
    // The course may have been deleted while the AI call was running.
    if (!getCourse(db, courseId)) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
    replaceCurriculum(db, courseId, curriculum)
    setCurriculumStatus(db, courseId, 'ready', null)
  })
}

/**
 * session_summary: summarizes complete messages newer than the latest summary and stores the summary with its
 * coverage marker. Does nothing when there are no new messages.
 */
export async function runSessionSummary(ctx: HandlerContext): Promise<void> {
  const { db, providers } = ctx.deps
  const courseId = courseIdOf(ctx.job)
  const lessonId = lessonIdOf(ctx.job)
  const course = getCourse(db, courseId)
  if (!course) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')

  const covered = latestSummary(db, courseId)
  const rows = listMessagesAfterSeq(db, courseId, covered?.coveredUntilSeq ?? 0, SUMMARY_MESSAGE_LIMIT)
  if (rows.length === 0) return
  const newest = rows[0]
  if (!newest) return

  const { providerId, model, timeoutMs } = resolveProviderSettings(db)
  const tutor = getTutorByCourse(db, courseId)
  if (!tutor) throw new RepoError('NOT_FOUND', '튜터 정보를 찾을 수 없어요.')

  const lesson = lessonId
    ? loadCurriculum(db, courseId)
        .flatMap((m) => m.lessons)
        .find((l) => l.id === lessonId)
    : undefined
  const built = buildContext({
    tutor,
    course,
    profile: getProfile(db),
    lesson: lesson ? { title: lesson.title, summary: lesson.summary } : null,
    objectives: lessonId ? listObjectivesForLesson(db, lessonId).map((o) => ({ description: o.description, status: o.status })) : [],
    memories: listMemories(db, courseId, MAX_MEMORIES),
    summary: covered,
    quizStats: null,
    recentMessages: rows.map((r) => ({ seq: r.seq, role: r.role, content: r.content })),
    learnerText: null,
    skill: SUMMARY_SKILL.instruction
  })
  const result = await completeStructured(providers.get(providerId), SUMMARY_SKILL, {
    system: built.system,
    prompt: built.prompt,
    model,
    timeoutMs,
    signal: ctx.signal
  })

  withTx(db, () => {
    if (!getCourse(db, courseId)) throw new RepoError('NOT_FOUND', '코스를 찾을 수 없어요.')
    insertSummary(db, {
      courseId,
      lessonId,
      summary: result.summary,
      nextSteps: result.nextSteps,
      coveredUntilMessageId: newest.id,
      coveredUntilSeq: newest.seq
    })
  })
}
