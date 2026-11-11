import type {
  AppErrorCode,
  BackgroundJob,
  ChatMessage,
  JobStatus,
  JobType,
  LearningMemory,
  LearningObjective,
  LearningSummary,
  Lesson,
  LessonStatus,
  MessageKind,
  MessageRole,
  MessageStatus,
  ObjectiveEvidence,
  ObjectiveStatus,
  ProviderId,
  QuizQuestion,
  QuizAttemptResult,
  CurriculumModule
} from '@shared/domain'
import type { Db } from './util'
import { many, newId, nowIso, one, RepoError, toBool } from './util'
import { withTx } from './connection'

// ───────────── curriculum ─────────────

export interface CurriculumInput {
  modules: {
    title: string
    summary: string
    lessons: {
      title: string
      summary: string
      objectives: string[]
    }[]
  }[]
}

/** Replaces the whole curriculum of a course atomically (used by curriculum_generation). */
export function replaceCurriculum(db: Db, courseId: string, input: CurriculumInput): void {
  withTx(db, () => {
    db.prepare('DELETE FROM learning_objectives WHERE course_id = ?').run(courseId)
    db.prepare('DELETE FROM curriculum_lessons WHERE course_id = ?').run(courseId)
    db.prepare('DELETE FROM curriculum_modules WHERE course_id = ?').run(courseId)
    db.prepare('UPDATE courses SET current_lesson_id = NULL WHERE id = ?').run(courseId)
    input.modules.forEach((m, mi) => {
      const moduleId = newId()
      db.prepare('INSERT INTO curriculum_modules (id, course_id, position, title, summary) VALUES (?, ?, ?, ?, ?)').run(
        moduleId,
        courseId,
        mi + 1,
        m.title,
        m.summary
      )
      m.lessons.forEach((l, li) => {
        const lessonId = newId()
        db.prepare(
          `INSERT INTO curriculum_lessons (id, module_id, course_id, position, title, summary, status)
           VALUES (?, ?, ?, ?, ?, ?, 'not_started')`
        ).run(lessonId, moduleId, courseId, li + 1, l.title, l.summary)
        l.objectives.forEach((desc, oi) => {
          db.prepare(
            `INSERT INTO learning_objectives (id, lesson_id, course_id, position, description, status)
             VALUES (?, ?, ?, ?, ?, 'not_started')`
          ).run(newId(), lessonId, courseId, oi + 1, desc)
        })
      })
    })
    const first = one<{ id: string }>(
      db.prepare(
        `SELECT l.id FROM curriculum_lessons l JOIN curriculum_modules m ON m.id = l.module_id
         WHERE l.course_id = ? ORDER BY m.position, l.position LIMIT 1`
      ),
      courseId
    )
    db.prepare('UPDATE courses SET current_lesson_id = ? WHERE id = ?').run(first?.id ?? null, courseId)
  })
}

interface ModuleRow {
  id: string
  course_id: string
  position: number
  title: string
  summary: string
}
interface LessonRow {
  id: string
  module_id: string
  course_id: string
  position: number
  title: string
  summary: string
  status: LessonStatus
  started_at: string | null
  completed_at: string | null
}
interface ObjectiveRow {
  id: string
  lesson_id: string
  position: number
  description: string
  status: ObjectiveStatus
}
interface EvidenceRow {
  id: string
  objective_id: string
  kind: 'quiz' | 'self_report'
  ref_id: string | null
  note: string
  created_at: string
}

export function loadCurriculum(db: Db, courseId: string): CurriculumModule[] {
  const modules = many<ModuleRow>(
    db.prepare('SELECT * FROM curriculum_modules WHERE course_id = ? ORDER BY position'),
    courseId
  )
  const lessons = many<LessonRow>(
    db.prepare('SELECT * FROM curriculum_lessons WHERE course_id = ? ORDER BY position'),
    courseId
  )
  const objectives = many<ObjectiveRow>(
    db.prepare(
      `SELECT o.* FROM learning_objectives o JOIN curriculum_lessons l ON l.id = o.lesson_id
       WHERE o.course_id = ? ORDER BY l.position, o.position`
    ),
    courseId
  )
  const evidence = many<EvidenceRow>(
    db.prepare(
      `SELECT e.* FROM objective_evidence e WHERE e.course_id = ? ORDER BY e.created_at`
    ),
    courseId
  )
  const evByObj = new Map<string, ObjectiveEvidence[]>()
  for (const e of evidence) {
    const list = evByObj.get(e.objective_id) ?? []
    list.push({ id: e.id, kind: e.kind, refId: e.ref_id, note: e.note, createdAt: e.created_at })
    evByObj.set(e.objective_id, list)
  }
  const objByLesson = new Map<string, LearningObjective[]>()
  for (const o of objectives) {
    const list = objByLesson.get(o.lesson_id) ?? []
    list.push({
      id: o.id,
      lessonId: o.lesson_id,
      position: o.position,
      description: o.description,
      status: o.status,
      evidence: evByObj.get(o.id) ?? []
    })
    objByLesson.set(o.lesson_id, list)
  }
  const lessonsByModule = new Map<string, Lesson[]>()
  for (const l of lessons) {
    const list = lessonsByModule.get(l.module_id) ?? []
    list.push({
      id: l.id,
      moduleId: l.module_id,
      courseId: l.course_id,
      position: l.position,
      title: l.title,
      summary: l.summary,
      status: l.status,
      startedAt: l.started_at,
      completedAt: l.completed_at,
      objectives: objByLesson.get(l.id) ?? []
    })
    lessonsByModule.set(l.module_id, list)
  }
  return modules.map((m) => ({
    id: m.id,
    courseId: m.course_id,
    position: m.position,
    title: m.title,
    summary: m.summary,
    lessons: lessonsByModule.get(m.id) ?? []
  }))
}

export function getLessonRow(db: Db, lessonId: string): { id: string; course_id: string; status: LessonStatus } | undefined {
  return one(db.prepare('SELECT id, course_id, status FROM curriculum_lessons WHERE id = ?'), lessonId)
}

export function setLessonStatus(db: Db, lessonId: string, status: LessonStatus): void {
  const now = nowIso()
  db.prepare(
    `UPDATE curriculum_lessons SET status = ?,
       started_at = COALESCE(started_at, CASE WHEN ? != 'not_started' THEN ? END),
       completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
     WHERE id = ?`
  ).run(status, status, now, status, now, lessonId)
}

export function countLessonsByStatus(db: Db, courseId: string): { total: number; completed: number } {
  const row = one<{ total: number; completed: number }>(
    db.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM curriculum_lessons WHERE course_id = ?`
    ),
    courseId
  )
  return { total: Number(row?.total ?? 0), completed: Number(row?.completed ?? 0) }
}

/** First lesson (in curriculum order) that is not completed, or null. */
export function nextOpenLessonId(db: Db, courseId: string): string | null {
  const row = one<{ id: string }>(
    db.prepare(
      `SELECT l.id FROM curriculum_lessons l JOIN curriculum_modules m ON m.id = l.module_id
       WHERE l.course_id = ? AND l.status != 'completed' ORDER BY m.position, l.position LIMIT 1`
    ),
    courseId
  )
  return row?.id ?? null
}

export function getObjective(db: Db, objectiveId: string): { id: string; course_id: string; lesson_id: string; status: ObjectiveStatus } | undefined {
  return one(db.prepare('SELECT id, course_id, lesson_id, status FROM learning_objectives WHERE id = ?'), objectiveId)
}

/**
 * Sets an objective status with a mandatory evidence row in the same transaction.
 * 'achieved' and 'needs_review' can never be set without evidence (repository invariant).
 */
export function setObjectiveWithEvidence(
  db: Db,
  objectiveId: string,
  status: ObjectiveStatus,
  evidence: { kind: 'quiz' | 'self_report'; refId: string | null; note: string }
): void {
  if ((status === 'achieved' || status === 'needs_review') && !evidence.note) {
    throw new RepoError('VALIDATION', '근거 없이 목표 상태를 바꿀 수 없어요.')
  }
  withTx(db, () => {
    db.prepare(
      `INSERT INTO objective_evidence (id, objective_id, course_id, kind, ref_id, note, created_at)
       SELECT ?, o.id, o.course_id, ?, ?, ?, ? FROM learning_objectives o WHERE o.id = ?`
    ).run(newId(), evidence.kind, evidence.refId, evidence.note, nowIso(), objectiveId)
    db.prepare('UPDATE learning_objectives SET status = ? WHERE id = ?').run(status, objectiveId)
  })
}

export function listObjectivesForLesson(db: Db, lessonId: string): LearningObjective[] {
  return many<ObjectiveRow>(
    db.prepare('SELECT * FROM learning_objectives WHERE lesson_id = ? ORDER BY position'),
    lessonId
  ).map((o) => ({ id: o.id, lessonId: o.lesson_id, position: o.position, description: o.description, status: o.status, evidence: [] }))
}

// ───────────── messages ─────────────

export interface MessageRow {
  id: string
  course_id: string
  lesson_id: string | null
  role: MessageRole
  kind: MessageKind
  content: string
  status: MessageStatus
  client_message_id: string | null
  reply_to: string | null
  provider_id: ProviderId | null
  error_code: AppErrorCode | null
  seq: number
  created_at: string
  updated_at: string
}

export function rowToMessage(r: MessageRow): ChatMessage {
  return {
    id: r.id,
    courseId: r.course_id,
    lessonId: r.lesson_id,
    role: r.role,
    kind: r.kind,
    content: r.content,
    status: r.status,
    replyTo: r.reply_to,
    providerId: r.provider_id,
    errorCode: r.error_code,
    createdAt: r.created_at
  }
}

export function getMessage(db: Db, id: string): MessageRow | undefined {
  return one<MessageRow>(db.prepare('SELECT * FROM messages WHERE id = ?'), id)
}

function nextSeq(db: Db, courseId: string): number {
  const row = one<{ s: number | bigint }>(
    db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM messages WHERE course_id = ?'),
    courseId
  )
  return Number(row?.s ?? 1)
}

/**
 * Inserts the learner message idempotently by (courseId, clientMessageId).
 * Returns the existing row with inserted=false when the same clientMessageId was already stored.
 */
export function insertLearnerMessage(
  db: Db,
  input: { courseId: string; clientMessageId: string; content: string; lessonId: string | null }
): { row: MessageRow; inserted: boolean } {
  return withTx(db, () => {
    const existing = one<MessageRow>(
      db.prepare('SELECT * FROM messages WHERE course_id = ? AND client_message_id = ?'),
      input.courseId,
      input.clientMessageId
    )
    if (existing) return { row: existing, inserted: false }
    const id = newId()
    const now = nowIso()
    db.prepare(
      `INSERT INTO messages (id, course_id, lesson_id, role, kind, content, status, client_message_id, seq, created_at, updated_at)
       VALUES (?, ?, ?, 'learner', 'chat', ?, 'complete', ?, ?, ?, ?)`
    ).run(id, input.courseId, input.lessonId, input.content, input.clientMessageId, nextSeq(db, input.courseId), now, now)
    return { row: getMessage(db, id) as MessageRow, inserted: true }
  })
}

export function insertTutorMessage(
  db: Db,
  input: { courseId: string; lessonId: string | null; replyTo: string | null; providerId: ProviderId | null; kind?: MessageKind; content?: string; status?: MessageStatus }
): MessageRow {
  const id = newId()
  const now = nowIso()
  db.prepare(
    `INSERT INTO messages (id, course_id, lesson_id, role, kind, content, status, reply_to, provider_id, seq, created_at, updated_at)
     VALUES (?, ?, ?, 'tutor', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.courseId,
    input.lessonId,
    input.kind ?? 'chat',
    input.content ?? '',
    input.status ?? 'streaming',
    input.replyTo,
    input.providerId,
    nextSeq(db, input.courseId),
    now,
    now
  )
  return getMessage(db, id) as MessageRow
}

export function updateMessageContent(db: Db, id: string, content: string): void {
  db.prepare('UPDATE messages SET content = ?, updated_at = ? WHERE id = ?').run(content, nowIso(), id)
}

/** Finalizes a tutor message. Only transitions out of 'streaming' are allowed. */
export function finalizeMessage(
  db: Db,
  id: string,
  status: Exclude<MessageStatus, 'streaming'>,
  content: string | null,
  errorCode: AppErrorCode | null
): boolean {
  const res = db
    .prepare(
      `UPDATE messages SET status = ?, content = COALESCE(?, content), error_code = ?, updated_at = ?
       WHERE id = ? AND status = 'streaming'`
    )
    .run(status, content, errorCode, nowIso(), id)
  return Number(res.changes) > 0
}

/** Re-arms an error/cancelled tutor message for retry (same row, no duplicate). */
export function resetMessageForRetry(db: Db, id: string): boolean {
  const res = db
    .prepare(
      `UPDATE messages SET status = 'streaming', content = '', error_code = NULL, updated_at = ?
       WHERE id = ? AND role = 'tutor' AND status IN ('error','cancelled')`
    )
    .run(nowIso(), id)
  return Number(res.changes) > 0
}

/** Returns latest `limit` messages in ascending seq order, optionally before a given seq. */
export function listMessages(db: Db, courseId: string, limit: number, beforeSeq?: number): { rows: MessageRow[]; hasMore: boolean } {
  const params: (string | number)[] = [courseId]
  let where = 'course_id = ?'
  if (beforeSeq !== undefined) {
    where += ' AND seq < ?'
    params.push(beforeSeq)
  }
  params.push(limit + 1)
  const rows = many<MessageRow>(db.prepare(`SELECT * FROM messages WHERE ${where} ORDER BY seq DESC LIMIT ?`), ...params)
  const hasMore = rows.length > limit
  return { rows: rows.slice(0, limit).reverse(), hasMore }
}

/** Messages with seq greater than the covered cut, newest-first, used by ContextBuilder. */
export function listMessagesAfterSeq(db: Db, courseId: string, afterSeq: number, limit: number): MessageRow[] {
  return many<MessageRow>(
    db.prepare(
      `SELECT * FROM messages WHERE course_id = ? AND seq > ? AND role IN ('learner','tutor') AND status = 'complete'
       ORDER BY seq DESC LIMIT ?`
    ),
    courseId,
    afterSeq,
    limit
  )
}

export function countMessagesSince(db: Db, courseId: string, afterSeq: number): number {
  const row = one<{ c: number | bigint }>(
    db.prepare(`SELECT COUNT(*) AS c FROM messages WHERE course_id = ? AND seq > ? AND status = 'complete' AND role IN ('learner','tutor')`),
    courseId,
    afterSeq
  )
  return Number(row?.c ?? 0)
}

/** Startup recovery: streaming tutor messages become errors (app was closed mid-reply). */
export function recoverStreamingMessages(db: Db): number {
  const res = db
    .prepare(
      `UPDATE messages SET status = 'error', error_code = 'PROVIDER_FAILED', updated_at = ?,
         content = CASE WHEN content = '' THEN '앱이 종료되어 응답이 중단되었어요' ELSE content END
       WHERE status = 'streaming'`
    )
    .run(nowIso())
  return Number(res.changes)
}

export function hasStreamingForCourse(db: Db, courseId: string): boolean {
  return one(db.prepare(`SELECT 1 AS x FROM messages WHERE course_id = ? AND status = 'streaming' LIMIT 1`), courseId) !== undefined
}

// ───────────── quizzes ─────────────

export interface QuizRow {
  id: string
  course_id: string
  lesson_id: string
  objective_id: string | null
  type: 'multiple_choice' | 'ox'
  question: string
  choices_json: string
  answer_index: number
  explanation: string
  flagged: number
  flag_reason: string | null
  provider_id: string | null
  created_at: string
}

export function insertQuiz(db: Db, q: Omit<QuizRow, 'flagged' | 'flag_reason' | 'created_at'> & { created_at?: string }): void {
  db.prepare(
    `INSERT INTO quizzes (id, course_id, lesson_id, objective_id, type, question, choices_json, answer_index,
       explanation, flagged, flag_reason, provider_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)`
  ).run(
    q.id,
    q.course_id,
    q.lesson_id,
    q.objective_id,
    q.type,
    q.question,
    q.choices_json,
    q.answer_index,
    q.explanation,
    q.provider_id,
    q.created_at ?? nowIso()
  )
}

export function getQuizRow(db: Db, id: string): QuizRow | undefined {
  return one<QuizRow>(db.prepare('SELECT * FROM quizzes WHERE id = ?'), id)
}

export function insertAttempt(db: Db, a: { id: string; quizId: string; courseId: string; selectedIndex: number; correct: boolean }): void {
  db.prepare(
    `INSERT INTO quiz_attempts (id, quiz_id, course_id, selected_index, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(a.id, a.quizId, a.courseId, a.selectedIndex, a.correct ? 1 : 0, nowIso())
}

export function flagQuiz(db: Db, id: string, reason: string): boolean {
  const res = db.prepare('UPDATE quizzes SET flagged = 1, flag_reason = ? WHERE id = ?').run(reason, id)
  return Number(res.changes) > 0
}

interface AttemptRow {
  id: string
  quiz_id: string
  selected_index: number
  correct: number
  created_at: string
}

export function latestAttemptFor(db: Db, quizId: string): AttemptRow | undefined {
  return one<AttemptRow>(
    db.prepare('SELECT * FROM quiz_attempts WHERE quiz_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
    quizId
  )
}

export function attemptResult(a: AttemptRow, quiz: QuizRow): QuizAttemptResult {
  return {
    attemptId: a.id,
    quizId: quiz.id,
    selectedIndex: a.selected_index,
    correct: toBool(a.correct),
    correctIndex: quiz.answer_index,
    explanation: quiz.explanation,
    createdAt: a.created_at
  }
}

export function listQuizzesForLesson(db: Db, lessonId: string): QuizQuestion[] {
  const rows = many<QuizRow>(db.prepare('SELECT * FROM quizzes WHERE lesson_id = ? ORDER BY created_at, rowid'), lessonId)
  return rows.map((q) => {
    const a = latestAttemptFor(db, q.id)
    return {
      id: q.id,
      courseId: q.course_id,
      lessonId: q.lesson_id,
      objectiveId: q.objective_id,
      type: q.type,
      question: q.question,
      choices: JSON.parse(q.choices_json) as string[],
      flagged: toBool(q.flagged),
      createdAt: q.created_at,
      lastAttempt: a ? attemptResult(a, q) : null
    }
  })
}

// ───────────── summaries & memories ─────────────

interface SummaryRow {
  id: string
  course_id: string
  lesson_id: string | null
  summary: string
  next_steps: string
  covered_until_message_id: string | null
  covered_until_seq: number
  created_at: string
}

export function latestSummary(db: Db, courseId: string): (LearningSummary & { coveredUntilSeq: number }) | null {
  const r = one<SummaryRow>(
    db.prepare('SELECT * FROM learning_summaries WHERE course_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
    courseId
  )
  if (!r) return null
  return {
    id: r.id,
    courseId: r.course_id,
    lessonId: r.lesson_id,
    summary: r.summary,
    nextSteps: r.next_steps,
    coveredUntilMessageId: r.covered_until_message_id,
    coveredUntilSeq: Number(r.covered_until_seq),
    createdAt: r.created_at
  }
}

export function insertSummary(
  db: Db,
  s: { courseId: string; lessonId: string | null; summary: string; nextSteps: string; coveredUntilMessageId: string | null; coveredUntilSeq: number }
): void {
  db.prepare(
    `INSERT INTO learning_summaries (id, course_id, lesson_id, summary, next_steps, covered_until_message_id, covered_until_seq, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), s.courseId, s.lessonId, s.summary, s.nextSteps, s.coveredUntilMessageId, s.coveredUntilSeq, nowIso())
}

interface MemoryRow {
  id: string
  course_id: string
  kind: 'strength' | 'difficulty' | 'note'
  content: string
  confidence: 'evidence' | 'ai_inferred'
  source: 'summary' | 'quiz'
  source_ref: string | null
  created_at: string
}

/** Up to `limit` memories, evidence-backed first, then newest. */
export function listMemories(db: Db, courseId: string, limit: number): LearningMemory[] {
  return many<MemoryRow>(
    db.prepare(
      `SELECT * FROM learning_memories WHERE course_id = ?
       ORDER BY CASE confidence WHEN 'evidence' THEN 0 ELSE 1 END, created_at DESC LIMIT ?`
    ),
    courseId,
    limit
  ).map((m) => ({
    id: m.id,
    courseId: m.course_id,
    kind: m.kind,
    content: m.content,
    confidence: m.confidence,
    source: m.source,
    sourceRef: m.source_ref,
    createdAt: m.created_at
  }))
}

export function insertMemory(
  db: Db,
  m: { courseId: string; kind: 'strength' | 'difficulty' | 'note'; content: string; confidence: 'evidence' | 'ai_inferred'; source: 'summary' | 'quiz'; sourceRef: string | null }
): void {
  db.prepare(
    `INSERT INTO learning_memories (id, course_id, kind, content, confidence, source, source_ref, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), m.courseId, m.kind, m.content, m.confidence, m.source, m.sourceRef, nowIso())
}

// ───────────── background jobs ─────────────

export interface JobRow {
  id: string
  type: JobType
  course_id: string | null
  status: JobStatus
  priority: number
  attempts: number
  max_attempts: number
  dedupe_key: string | null
  payload_json: string
  error: string | null
  created_at: string
  updated_at: string
  started_at: string | null
  finished_at: string | null
}

export function rowToJob(r: JobRow): BackgroundJob {
  return {
    id: r.id,
    type: r.type,
    courseId: r.course_id,
    status: r.status,
    priority: r.priority,
    attempts: r.attempts,
    maxAttempts: r.max_attempts,
    dedupeKey: r.dedupe_key ?? '',
    error: r.error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at
  }
}

export function getJob(db: Db, id: string): JobRow | undefined {
  return one<JobRow>(db.prepare('SELECT * FROM background_jobs WHERE id = ?'), id)
}

/**
 * Enqueues a job. If an active (queued/running) job with the same dedupe key exists, returns it
 * instead (inserted=false). Relies on the partial unique index uq_jobs_active_dedupe.
 */
export function enqueueJob(
  db: Db,
  j: { type: JobType; courseId: string | null; dedupeKey: string; priority: number; maxAttempts: number; payload: unknown }
): { row: JobRow; inserted: boolean } {
  return withTx(db, () => {
    const active = one<JobRow>(
      db.prepare(`SELECT * FROM background_jobs WHERE dedupe_key = ? AND status IN ('queued','running')`),
      j.dedupeKey
    )
    if (active) return { row: active, inserted: false }
    const id = newId()
    const now = nowIso()
    db.prepare(
      `INSERT INTO background_jobs (id, type, course_id, status, priority, attempts, max_attempts, dedupe_key, payload_json, created_at, updated_at)
       VALUES (?, ?, ?, 'queued', ?, 0, ?, ?, ?, ?, ?)`
    ).run(id, j.type, j.courseId, j.priority, j.maxAttempts, j.dedupeKey, JSON.stringify(j.payload ?? {}), now, now)
    return { row: getJob(db, id) as JobRow, inserted: true }
  })
}

/** Highest priority, oldest queued job. Marks it running and increments attempts. */
export function claimNextJob(db: Db): JobRow | undefined {
  return withTx(db, () => {
    const next = one<JobRow>(
      db.prepare(`SELECT * FROM background_jobs WHERE status = 'queued' ORDER BY priority DESC, created_at ASC, rowid ASC LIMIT 1`)
    )
    if (!next) return undefined
    const now = nowIso()
    db.prepare(
      `UPDATE background_jobs SET status = 'running', attempts = attempts + 1, started_at = ?, updated_at = ? WHERE id = ?`
    ).run(now, now, next.id)
    return getJob(db, next.id)
  })
}

export function finishJob(db: Db, id: string, status: 'succeeded' | 'failed' | 'cancelled', error: string | null): void {
  const now = nowIso()
  db.prepare('UPDATE background_jobs SET status = ?, error = ?, updated_at = ?, finished_at = ? WHERE id = ?').run(
    status,
    error,
    now,
    now,
    id
  )
}

/** Puts a failed-but-retryable job back into the queue. */
export function requeueJob(db: Db, id: string, error: string): void {
  db.prepare(`UPDATE background_jobs SET status = 'queued', error = ?, updated_at = ? WHERE id = ?`).run(error, nowIso(), id)
}

/** Startup recovery: running -> queued. */
export function recoverRunningJobs(db: Db): number {
  const res = db
    .prepare(`UPDATE background_jobs SET status = 'queued', updated_at = ? WHERE status = 'running'`)
    .run(nowIso())
  return Number(res.changes)
}

export function cancelJobsForCourse(db: Db, courseId: string): number {
  const res = db
    .prepare(
      `UPDATE background_jobs SET status = 'cancelled', updated_at = ?, finished_at = ?
       WHERE course_id = ? AND status = 'queued'`
    )
    .run(nowIso(), nowIso(), courseId)
  return Number(res.changes)
}

export function listJobs(db: Db, opts: { courseId?: string; activeOnly?: boolean; limit?: number }): BackgroundJob[] {
  const where: string[] = []
  const params: (string | number)[] = []
  if (opts.courseId) {
    where.push('course_id = ?')
    params.push(opts.courseId)
  }
  if (opts.activeOnly) where.push(`status IN ('queued','running')`)
  const sql = `SELECT * FROM background_jobs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC, rowid DESC LIMIT ?`
  params.push(opts.limit ?? 50)
  return many<JobRow>(db.prepare(sql), ...params).map(rowToJob)
}
