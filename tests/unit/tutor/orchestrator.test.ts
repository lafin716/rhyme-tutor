import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHarness, courseInput, onboard, waitFor, type Harness } from '../support/harness'
import { codeOf } from '../support/fakes'

let h: Harness
let courseId: string

beforeEach(() => {
  h = createHarness()
  onboard(h.db)
  courseId = h.learning.createCourse(courseInput()).course.id
})

afterEach(async () => {
  await h.close()
})

describe('TutorOrchestrator', () => {
  it('send persists the learner and tutor rows and completes the reply', async () => {
    const out = h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '일차방정식이 뭐예요?' })
    expect(out.learnerMessage.role).toBe('learner')
    expect(out.tutorMessage.role).toBe('tutor')
    await h.orchestrator.settle(courseId)
    const page = h.learning.history(courseId, null, 10)
    const reply = page.messages.find((m) => m.id === out.tutorMessage.id)
    expect(reply?.status).toBe('complete')
    expect(reply?.content.length).toBeGreaterThan(0)
  })

  it('send is idempotent by clientMessageId and creates no extra rows', async () => {
    const clientMessageId = randomUUID()
    const first = h.orchestrator.send({ courseId, clientMessageId, content: '같은 질문' })
    await h.orchestrator.settle(courseId)
    const second = h.orchestrator.send({ courseId, clientMessageId, content: '같은 질문' })
    await h.orchestrator.settle(courseId)
    expect(second.learnerMessage.id).toBe(first.learnerMessage.id)
    expect(second.tutorMessage.id).toBe(first.tutorMessage.id)
    const count = h.db.prepare('SELECT COUNT(*) AS c FROM messages WHERE course_id = ?').get(courseId) as { c: number | bigint }
    expect(Number(count.c)).toBe(2)
  })

  it('a second send while a reply is in flight returns BUSY', async () => {
    h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '[[mock:slow]] 천천히 답해 주세요' })
    expect(
      codeOf(() => h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '두 번째 질문' }))
    ).toBe('BUSY')
    h.orchestrator.cancel(courseId)
    await h.orchestrator.settle(courseId)
  })

  it('cancel stops an in-flight reply and marks the tutor row cancelled', async () => {
    const out = h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '[[mock:slow]] 긴 설명' })
    await waitFor(() => h.orchestrator.isBusy(courseId))
    h.orchestrator.cancel(courseId)
    await h.orchestrator.settle(courseId)
    expect(h.orchestrator.isBusy(courseId)).toBe(false)
    const reply = h.learning.history(courseId, null, 10).messages.find((m) => m.id === out.tutorMessage.id)
    expect(reply?.status).toBe('cancelled')
  })

  it('send without an active provider returns VALIDATION', () => {
    const bare = createHarness({ select: false })
    try {
      onboard(bare.db)
      const id = bare.learning.createCourse(courseInput()).course.id
      expect(
        codeOf(() => bare.orchestrator.send({ courseId: id, clientMessageId: randomUUID(), content: '질문' }))
      ).toBe('VALIDATION')
    } finally {
      void bare.close()
    }
  })
})
