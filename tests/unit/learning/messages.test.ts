import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHarness, courseInput, onboard, type Harness } from '../support/harness'
import { finalizeMessage, insertLearnerMessage, insertTutorMessage, listMessages } from '../../../src/main/db/repo-learning'

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

describe('message persistence', () => {
  it('insertLearnerMessage is idempotent by clientMessageId', () => {
    const clientMessageId = randomUUID()
    const first = insertLearnerMessage(h.db, { courseId, clientMessageId, content: '안녕', lessonId: null })
    const second = insertLearnerMessage(h.db, { courseId, clientMessageId, content: '다른 내용', lessonId: null })
    expect(first.inserted).toBe(true)
    expect(second.inserted).toBe(false)
    expect(second.row.id).toBe(first.row.id)
    expect(second.row.content).toBe('안녕')
    expect(listMessages(h.db, courseId, 50).rows).toHaveLength(1)
  })

  it('assigns increasing seq numbers per course', () => {
    const a = insertLearnerMessage(h.db, { courseId, clientMessageId: randomUUID(), content: 'a', lessonId: null })
    const b = insertLearnerMessage(h.db, { courseId, clientMessageId: randomUUID(), content: 'b', lessonId: null })
    expect(b.row.seq).toBeGreaterThan(a.row.seq)
  })

  it('listMessages pages newest-first with hasMore and returns ascending order', () => {
    for (let i = 0; i < 5; i++) {
      insertLearnerMessage(h.db, { courseId, clientMessageId: randomUUID(), content: `m${i}`, lessonId: null })
    }
    const page = listMessages(h.db, courseId, 2)
    expect(page.rows.map((r) => r.content)).toEqual(['m3', 'm4'])
    expect(page.hasMore).toBe(true)
    const older = listMessages(h.db, courseId, 2, page.rows[0]?.seq)
    expect(older.rows.map((r) => r.content)).toEqual(['m1', 'm2'])
  })

  it('finalizeMessage only moves a streaming tutor message once', () => {
    const tutor = insertTutorMessage(h.db, { courseId, lessonId: null, replyTo: null, providerId: 'mock' })
    expect(tutor.status).toBe('streaming')
    expect(finalizeMessage(h.db, tutor.id, 'complete', '답변', null)).toBe(true)
    expect(finalizeMessage(h.db, tutor.id, 'error', null, 'PROVIDER_FAILED')).toBe(false)
    const row = h.db.prepare('SELECT status, content FROM messages WHERE id = ?').get(tutor.id) as { status: string; content: string }
    expect(row.status).toBe('complete')
    expect(row.content).toBe('답변')
  })

  it('history returns the page through the learning service', () => {
    insertLearnerMessage(h.db, { courseId, clientMessageId: randomUUID(), content: '첫 질문', lessonId: null })
    const page = h.learning.history(courseId, null, 10)
    expect(page.messages.map((m) => m.content)).toContain('첫 질문')
    expect(page.hasMore).toBe(false)
  })
})
