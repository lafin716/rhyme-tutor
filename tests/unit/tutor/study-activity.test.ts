import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createHarness, courseInput, onboard, must, type Harness } from '../support/harness'
import { replaceCurriculum } from '../../../src/main/db/repo-learning'
import { setCurrentLesson } from '../../../src/main/db/repo-core'

let h: Harness
let courseId: string
let lessonId: string

beforeEach(() => {
  h = createHarness()
  onboard(h.db)
  courseId = h.learning.createCourse(courseInput()).course.id
  replaceCurriculum(h.db, courseId, {
    modules: [{ title: '1단원', summary: '개요', lessons: [{ title: '1강', summary: '기초', objectives: ['일차방정식 풀기'] }] }]
  })
  lessonId = must(
    h.db.prepare('SELECT id FROM curriculum_lessons WHERE course_id = ? ORDER BY rowid LIMIT 1').get(courseId) as
      | { id: string }
      | undefined,
    'lesson row'
  ).id
  // Select the lesson without the learner-action path, so the lesson stays not_started.
  setCurrentLesson(h.db, courseId, lessonId)
  // Clear last_studied_at set by setCurrentLesson so the tests start from "아직 학습 전".
  h.db.prepare('UPDATE courses SET last_studied_at = NULL WHERE id = ?').run(courseId)
})

afterEach(async () => {
  await h.close()
})

function courseRow(): { last_studied_at: string | null; updated_at: string } {
  return h.db.prepare('SELECT last_studied_at, updated_at FROM courses WHERE id = ?').get(courseId) as {
    last_studied_at: string | null
    updated_at: string
  }
}

function lessonStatus(): string {
  return (h.db.prepare('SELECT status FROM curriculum_lessons WHERE id = ?').get(lessonId) as { status: string }).status
}

function objectiveStatuses(): string[] {
  return (
    h.db
      .prepare('SELECT status FROM learning_objectives WHERE lesson_id = ? ORDER BY id')
      .all(lessonId) as { status: string }[]
  ).map((r) => r.status)
}

describe('study activity (QA-02 a, b)', () => {
  it('start-lesson marks the course studied and the current lesson in_progress, objectives untouched', async () => {
    expect(courseRow().last_studied_at).toBeNull()
    const before = objectiveStatuses()
    expect(lessonStatus()).toBe('not_started')

    h.orchestrator.startLesson(courseId)
    await h.orchestrator.settle(courseId)

    expect(courseRow().last_studied_at).not.toBeNull()
    expect(lessonStatus()).toBe('in_progress')
    expect(objectiveStatuses()).toEqual(before)
  })

  it('a learner message marks the course studied and the current lesson in_progress', async () => {
    h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '일차방정식이 뭐예요?' })
    await h.orchestrator.settle(courseId)

    expect(courseRow().last_studied_at).not.toBeNull()
    expect(lessonStatus()).toBe('in_progress')
  })

  it('a chat turn never regresses a completed lesson', async () => {
    h.db.prepare("UPDATE curriculum_lessons SET status = 'completed' WHERE id = ?").run(lessonId)
    h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '복습 질문' })
    await h.orchestrator.settle(courseId)

    expect(lessonStatus()).toBe('completed')
    expect(courseRow().last_studied_at).not.toBeNull()
  })

  it('a chat turn never regresses a needs_review lesson', async () => {
    h.db.prepare("UPDATE curriculum_lessons SET status = 'needs_review' WHERE id = ?").run(lessonId)
    h.orchestrator.startLesson(courseId)
    await h.orchestrator.settle(courseId)

    expect(lessonStatus()).toBe('needs_review')
    expect(courseRow().last_studied_at).not.toBeNull()
  })
})
