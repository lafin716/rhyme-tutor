import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHarness, courseInput, onboard, waitFor, must, type Harness } from '../support/harness'
import { codeOf, scriptedProvider } from '../support/fakes'
import { replaceCurriculum } from '../../../src/main/db/repo-learning'
import { ProviderError, type AIProvider, type CompletionRequest } from '../../../src/main/providers/types'

/** Provider that never answers on its own. It rejects with PROVIDER_CANCELLED once the request signal aborts. */
function hangingProvider(): AIProvider & { seen: { started: number } } {
  const seen = { started: 0 }
  const base = scriptedProvider(() => '')
  return {
    ...base,
    seen,
    complete(req: CompletionRequest) {
      seen.started += 1
      return new Promise<never>((_, reject) => {
        const fail = (): void => reject(new ProviderError('PROVIDER_CANCELLED', '응답을 취소했어요.'))
        if (req.signal?.aborted) return fail()
        req.signal?.addEventListener('abort', fail, { once: true })
      })
    }
  }
}

function countWhere(h: Harness, table: string, courseId: string): number {
  const row = h.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE course_id = ?`).get(courseId) as { c: number | bigint }
  return Number(row.c)
}

function assertNoOrphans(h: Harness, courseId: string): void {
  for (const table of ['messages', 'quizzes', 'background_jobs', 'learning_summaries', 'learning_memories', 'tutor_characters']) {
    expect(countWhere(h, table, courseId), table).toBe(0)
  }
  const course = h.db.prepare('SELECT COUNT(*) AS c FROM courses WHERE id = ?').get(courseId) as { c: number | bigint }
  expect(Number(course.c)).toBe(0)
  expect(h.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
}

function assertSlotFree(h: Harness): void {
  expect(h.slot.active).toBe(0)
  expect(h.slot.waiting).toBe(0)
}

let h: Harness
let courseId: string
let provider: ReturnType<typeof hangingProvider>
const unhandled: unknown[] = []
const onUnhandled = (reason: unknown): void => {
  unhandled.push(reason)
}

beforeEach(() => {
  unhandled.length = 0
  process.on('unhandledRejection', onUnhandled)
  provider = hangingProvider()
  h = createHarness({ provider })
  onboard(h.db)
  courseId = h.learning.createCourse(courseInput()).course.id
})

afterEach(async () => {
  process.off('unhandledRejection', onUnhandled)
  await h.close()
})

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(unhandled).toEqual([])
}

function addLesson(): string {
  replaceCurriculum(h.db, courseId, {
    modules: [{ title: '1단원', summary: '개요', lessons: [{ title: '1강', summary: '기초', objectives: ['일차방정식 풀기'] }] }]
  })
  return must(
    h.db.prepare('SELECT id FROM curriculum_lessons WHERE course_id = ? ORDER BY rowid LIMIT 1').get(courseId) as
      | { id: string }
      | undefined,
    'lesson row'
  ).id
}

describe('deleteCourse races (REV-01 #1, #2)', () => {
  it('delete while a chat reply is queued cancels it, releases the queue and leaves no rows', async () => {
    // Hold the shared slot so the chat reply waits in the queue.
    const releaseSlot = await h.slot.acquire()
    const out = h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '대기 중인 질문' })
    await waitFor(() => h.slot.waiting === 1)

    const del = h.learning.deleteCourse(courseId)
    // The gate is closed synchronously, before the first await in deleteCourse.
    expect(codeOf(() => h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '끼어들기' }))).toBe('NOT_FOUND')
    await del
    releaseSlot()

    expect(provider.seen.started).toBe(0)
    expect(out.tutorMessage.id).toBeTruthy()
    assertSlotFree(h)
    assertNoOrphans(h, courseId)
    await flushAsync()
  })

  it('delete while a chat reply is running aborts the provider call and leaves no rows', async () => {
    h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '실행 중인 질문' })
    await waitFor(() => provider.seen.started === 1)

    const del = h.learning.deleteCourse(courseId)
    expect(codeOf(() => h.orchestrator.startLesson(courseId))).toBe('NOT_FOUND')
    await del

    assertSlotFree(h)
    assertNoOrphans(h, courseId)
    await flushAsync()
  })

  it('retry during deletion is refused with NOT_FOUND', async () => {
    const out = h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '취소될 질문' })
    await waitFor(() => provider.seen.started === 1)
    h.orchestrator.cancel(courseId)
    await h.orchestrator.settle(courseId)

    const del = h.learning.deleteCourse(courseId)
    expect(codeOf(() => h.orchestrator.retry(out.tutorMessage.id))).toBe('NOT_FOUND')
    await del
    assertNoOrphans(h, courseId)
    await flushAsync()
  })

  it('delete while a quiz is generating aborts it, releases the slot and stores nothing', async () => {
    const lessonId = addLesson()
    const quizOutcome = h.learning.generateQuiz(courseId, lessonId).then(
      () => 'ok',
      (err: unknown) => (err as { code?: string }).code
    )
    await waitFor(() => provider.seen.started === 1)
    expect(h.slot.active).toBe(1)

    const del = h.learning.deleteCourse(courseId)
    await expect(h.learning.generateQuiz(courseId, lessonId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await del

    expect(await quizOutcome).toBe('NOT_FOUND')
    assertSlotFree(h)
    assertNoOrphans(h, courseId)
    await flushAsync()
  })
})
