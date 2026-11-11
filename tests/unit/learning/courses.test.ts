import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHarness, courseInput, onboard, type Harness } from '../support/harness'
import { codeOf, codeOfAsync } from '../support/fakes'

let h: Harness

beforeEach(() => {
  h = createHarness()
  onboard(h.db)
})

afterEach(async () => {
  await h.close()
})

describe('course creation and identity', () => {
  it('createCourse is idempotent by requestId and enqueues exactly one curriculum job', () => {
    const input = courseInput()
    const first = h.learning.createCourse(input)
    const again = h.learning.createCourse(input)
    expect(again.course.id).toBe(first.course.id)
    expect(h.learning.list()).toHaveLength(1)
    const curricula = h.learning.jobs(first.course.id).filter((j) => j.type === 'curriculum_generation')
    expect(curricula).toHaveLength(1)
    expect(curricula[0]?.status).toBe('queued')
  })

  it('rejects invalid course input with VALIDATION', () => {
    expect(codeOf(() => h.learning.createCourse({ ...courseInput(), title: '' }))).toBe('VALIDATION')
    expect(codeOf(() => h.learning.createCourse({ ...courseInput(), requestId: 'not-a-uuid' }))).toBe('VALIDATION')
  })

  it('updateCourse changes goal, level and pace but rejects title or topic prompt', () => {
    const card = h.learning.createCourse(courseInput())
    const updated = h.learning.updateCourse(card.course.id, { goal: '새 목표', level: 'intermediate', pace: 'fast' })
    expect(updated.goal).toBe('새 목표')
    expect(updated.level).toBe('intermediate')
    expect(codeOf(() => h.learning.updateCourse(card.course.id, { title: '바뀐 제목' }))).toBe('VALIDATION')
  })

  it('DB trigger blocks direct changes to course identity fields', () => {
    const card = h.learning.createCourse(courseInput())
    expect(() => h.db.prepare('UPDATE courses SET title = ? WHERE id = ?').run('x', card.course.id)).toThrow(/COURSE_IMMUTABLE/)
    expect(() => h.db.prepare('UPDATE courses SET topic_prompt = ? WHERE id = ?').run('x', card.course.id)).toThrow(/COURSE_IMMUTABLE/)
    expect(() => h.db.prepare('UPDATE courses SET request_id = ? WHERE id = ?').run(randomUUID(), card.course.id)).toThrow(/COURSE_IMMUTABLE/)
  })

  it('deleteCourse removes the course and its dependent rows', async () => {
    const card = h.learning.createCourse(courseInput())
    await h.learning.deleteCourse(card.course.id)
    expect(h.learning.list()).toHaveLength(0)
    const left = h.db.prepare('SELECT COUNT(*) AS c FROM background_jobs WHERE course_id = ?').get(card.course.id) as { c: number | bigint }
    expect(Number(left.c)).toBe(0)
  })

  it('deleteCourse on an unknown id returns NOT_FOUND', async () => {
    expect(await codeOfAsync(() => h.learning.deleteCourse(randomUUID()))).toBe('NOT_FOUND')
  })
})
