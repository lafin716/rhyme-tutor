import { describe, expect, it } from 'vitest'
import { buildTutorCharacter } from '../../../src/main/tutor/character'
import { buildContext, CONTEXT_BUDGET_CHARS, MAX_MESSAGE_CHARS, truncateMessage, type ContextInput } from '../../../src/main/tutor/context'

const tutor = buildTutorCharacter('kind-explainer', { id: 'course-1' }, null)

function input(overrides: Partial<ContextInput> = {}): ContextInput {
  return {
    tutor,
    course: { title: '대수 입문', goal: '일차방정식 풀기', level: 'beginner', pace: 'normal' },
    profile: null,
    lesson: { title: '개념 살펴보기', summary: '기본 개념을 정리해요.' },
    objectives: [{ description: '핵심 용어를 설명할 수 있다', status: 'not_started' }],
    memories: [],
    summary: null,
    quizStats: null,
    recentMessages: [],
    learnerText: null,
    skill: '학습자의 메시지에 답한다.',
    ...overrides
  }
}

describe('context builder', () => {
  it('keeps the learner text only in the prompt, never in the system block', () => {
    const secret = '비밀 질문 XYZ123'
    const built = buildContext(input({ learnerText: secret }))
    expect(built.prompt).toContain(secret)
    expect(built.prompt).toContain('[학습자 메시지]')
    expect(built.system).not.toContain(secret)
  })

  it('reports nothing trimmed when the content fits the budget', () => {
    const built = buildContext(input({ learnerText: '짧은 질문' }))
    expect(built.trimmed).toEqual([])
    expect(built.totalChars).toBeLessThanOrEqual(CONTEXT_BUDGET_CHARS)
  })

  it('trims recent messages first when the budget is exceeded', () => {
    const big = '가'.repeat(MAX_MESSAGE_CHARS)
    const recentMessages = Array.from({ length: 30 }, (_, i) => ({
      seq: 30 - i,
      role: (i % 2 === 0 ? 'learner' : 'tutor') as 'learner' | 'tutor',
      content: big
    }))
    const built = buildContext(input({ recentMessages, budgetChars: 6_000 }))
    expect(built.trimmed[0]).toBe('messages')
    expect(built.totalChars).toBeLessThanOrEqual(6_000 + MAX_MESSAGE_CHARS)
  })

  it('always keeps at least one objective, even under tight budgets', () => {
    const objectives = Array.from({ length: 6 }, (_, i) => ({ description: `목표 ${i} ${'나'.repeat(400)}`, status: 'not_started' as const }))
    const built = buildContext(input({ objectives, budgetChars: 500 }))
    expect(built.system).toContain('목표 0')
  })

  it('learner text is not counted as a trim target and survives trimming', () => {
    const recentMessages = Array.from({ length: 30 }, (_, i) => ({ seq: 30 - i, role: 'learner' as const, content: '나'.repeat(MAX_MESSAGE_CHARS) }))
    const built = buildContext(input({ recentMessages, learnerText: '마지막 질문입니다', budgetChars: 3_000 }))
    expect(built.prompt).toContain('마지막 질문입니다')
  })
})

describe('truncateMessage', () => {
  it('leaves short text unchanged', () => {
    expect(truncateMessage('짧아요', 10)).toBe('짧아요')
  })

  it('keeps the tail of long text with the omission mark', () => {
    const out = truncateMessage('a'.repeat(20) + 'END', 5)
    expect(out.endsWith('END')).toBe(true)
    expect(out.startsWith('…(중략)')).toBe(true)
  })
})
