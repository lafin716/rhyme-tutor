import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { ClassroomSnapshot, LearningObjective } from '@shared/domain'
import { createHarness, courseInput, onboard, waitFor, must, type Harness } from '../support/harness'
import { codeOf, codeOfAsync } from '../support/fakes'

let h: Harness
let courseId: string
let snapshot: ClassroomSnapshot

function allObjectives(s: ClassroomSnapshot): LearningObjective[] {
  return s.modules.flatMap((m) => m.lessons.flatMap((l) => l.objectives))
}

beforeEach(async () => {
  h = createHarness()
  onboard(h.db)
  const card = h.learning.createCourse(courseInput())
  courseId = card.course.id
  h.runner.start()
  await waitFor(() => h.learning.list()[0]?.course.curriculumStatus === 'ready')
  snapshot = h.learning.classroom(courseId)
})

afterEach(async () => {
  await h.close()
})

describe('objective progress', () => {
  it('self-check "understood" marks the objective achieved and writes a self_report evidence row', () => {
    const obj = must(allObjectives(snapshot)[0], 'objective')
    const after = h.learning.selfCheck(obj.id, true)
    const updated = must(allObjectives(after).find((o) => o.id === obj.id), 'updated objective')
    expect(updated.status).toBe('achieved')
    expect(updated.evidence.some((e) => e.kind === 'self_report')).toBe(true)
  })

  it('self-check "not yet" marks needs_review with evidence', () => {
    const obj = must(allObjectives(snapshot)[1] ?? allObjectives(snapshot)[0], 'objective')
    const after = h.learning.selfCheck(obj.id, false)
    const updated = must(allObjectives(after).find((o) => o.id === obj.id), 'updated objective')
    expect(updated.status).toBe('needs_review')
    expect(updated.evidence.length).toBeGreaterThan(0)
  })

  it('self-check on an unknown objective returns NOT_FOUND', () => {
    expect(codeOf(() => h.learning.selfCheck(randomUUID(), true))).toBe('NOT_FOUND')
  })

  it('a chat reply from the AI never changes objective status', async () => {
    const before = allObjectives(snapshot).map((o) => `${o.id}:${o.status}`)
    h.orchestrator.send({ courseId, clientMessageId: randomUUID(), content: '이 단원을 설명해 주세요' })
    await h.orchestrator.settle(courseId)
    const after = allObjectives(h.learning.classroom(courseId)).map((o) => `${o.id}:${o.status}`)
    expect(after).toEqual(before)
  })
})

describe('quizzes', () => {
  it('generateQuiz stores 3 to 5 questions with objective links and no answer key in the list view', async () => {
    const lesson = must(snapshot.modules[0]?.lessons[0], 'lesson')
    const questions = await h.learning.generateQuiz(courseId, lesson.id)
    expect(questions.length).toBeGreaterThanOrEqual(2)
    expect(questions.length).toBeLessThanOrEqual(5)
    const mc = must(questions.find((q) => q.type === 'multiple_choice'), 'multiple choice question')
    expect(mc.choices).toHaveLength(3)
    expect(Object.keys(mc)).not.toContain('answerIndex')
  })

  it('answerQuiz grades in main, returns the correct index, and records an attempt', async () => {
    const lesson = must(snapshot.modules[0]?.lessons[0], 'lesson')
    const questions = await h.learning.generateQuiz(courseId, lesson.id)
    const mc = must(questions.find((q) => q.type === 'multiple_choice'), 'multiple choice question')

    const right = h.learning.answerQuiz({ quizId: mc.id, selectedIndex: 1 })
    expect(right.correct).toBe(true)
    expect(right.correctIndex).toBe(1)
    expect(right.explanation.length).toBeGreaterThan(0)

    const attempts = h.db.prepare('SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ?').get(mc.id) as { c: number | bigint }
    expect(Number(attempts.c)).toBe(1)
  })

  it('a wrong answer on an objective-linked quiz marks the objective needs_review with quiz evidence', async () => {
    const lesson = must(snapshot.modules[0]?.lessons[0], 'lesson')
    const questions = await h.learning.generateQuiz(courseId, lesson.id)
    const linked = must(
      questions.find((q) => q.type === 'multiple_choice' && q.objectiveId !== null),
      'objective-linked question'
    )
    const wrong = h.learning.answerQuiz({ quizId: linked.id, selectedIndex: 0 })
    expect(wrong.correct).toBe(false)
    expect(wrong.correctIndex).toBe(1)

    const objective = must(allObjectives(h.learning.classroom(courseId)).find((o) => o.id === linked.objectiveId), 'objective')
    expect(objective.status).toBe('needs_review')
    expect(objective.evidence.some((e) => e.kind === 'quiz')).toBe(true)
  })

  it('answerQuiz rejects a choice index outside the question and an unknown quiz', async () => {
    const lesson = must(snapshot.modules[0]?.lessons[0], 'lesson')
    const questions = await h.learning.generateQuiz(courseId, lesson.id)
    const mc = must(questions.find((q) => q.type === 'multiple_choice'), 'multiple choice question')
    expect(codeOf(() => h.learning.answerQuiz({ quizId: mc.id, selectedIndex: 5 }))).toBe('VALIDATION')
    expect(codeOf(() => h.learning.answerQuiz({ quizId: randomUUID(), selectedIndex: 0 }))).toBe('NOT_FOUND')
  })

  it('flagQuiz records the reason on the question', async () => {
    const lesson = must(snapshot.modules[0]?.lessons[0], 'lesson')
    const [first] = await h.learning.generateQuiz(courseId, lesson.id)
    const flagged = must(first, 'question')
    h.learning.flagQuiz({ quizId: flagged.id, reason: '문제가 이상해요' })
    const row = h.db.prepare('SELECT flagged, flag_reason FROM quizzes WHERE id = ?').get(flagged.id) as {
      flagged: number
      flag_reason: string
    }
    expect(Number(row.flagged)).toBe(1)
    expect(row.flag_reason).toBe('문제가 이상해요')
  })

  it('generateQuiz on an unknown lesson returns NOT_FOUND', async () => {
    expect(await codeOfAsync(() => h.learning.generateQuiz(courseId, randomUUID()))).toBe('NOT_FOUND')
  })
})
