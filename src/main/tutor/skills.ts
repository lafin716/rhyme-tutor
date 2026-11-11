/**
 * AI task skills (BE-03). Each skill is an instruction block plus, for structured tasks, a Zod schema.
 * Structured output is untrusted: extractJson -> schema.safeParse; up to MAX_STRUCTURED_RETRIES corrective
 * retries, then INVALID_AI_OUTPUT.
 */
import type { z } from 'zod'
import { AiCurriculumSchema, AiQuizSchema, AiSessionSummarySchema, extractJson, type AiCurriculum, type AiQuiz, type AiSessionSummary } from '@shared/ai-schemas'
import type { AIProvider, CompletionRequest, CompletionTask } from '../providers/types'
import { ProviderError } from '../providers/types'

export const MAX_STRUCTURED_RETRIES = 2

export interface TextSkill {
  readonly id: 'explanation'
  readonly task: 'chat'
  readonly instruction: string
}

export interface StructuredSkill<T> {
  readonly id: 'curriculum' | 'quiz' | 'summary'
  readonly task: CompletionTask
  readonly instruction: string
  readonly schema: z.ZodType<T>
}

export const EXPLANATION_SKILL: TextSkill = {
  id: 'explanation',
  task: 'chat',
  instruction: [
    '학습자의 메시지에 한국어로 답한다.',
    '현재 단원과 목표를 기준으로 설명하고, 필요하면 짧은 확인 질문을 하나 덧붙인다.',
    '정답이나 학습 진도를 확정하지 않는다.'
  ].join('\n')
}

export const CURRICULUM_SKILL: StructuredSkill<AiCurriculum> = {
  id: 'curriculum',
  task: 'curriculum',
  schema: AiCurriculumSchema,
  instruction: [
    '학습 주제에 맞는 커리큘럼을 만든다. 모듈 1~8개, 모듈당 단원 1~6개, 단원당 학습 목표 1~5개.',
    '반드시 아래 JSON 객체 하나만 출력한다. 설명 문장이나 Markdown을 붙이지 않는다.',
    '{"modules":[{"title":"","summary":"","lessons":[{"title":"","summary":"","objectives":[""]}]}]}'
  ].join('\n')
}

export const QUIZ_SKILL: StructuredSkill<AiQuiz> = {
  id: 'quiz',
  task: 'quiz',
  schema: AiQuizSchema,
  instruction: [
    '현재 단원에서 학습자의 이해를 확인하는 퀴즈를 3~5문항 만든다.',
    'multiple_choice는 선택지 3~5개와 0부터 시작하는 answerIndex, ox는 answer를 "O" 또는 "X"로 쓴다.',
    'objectiveIndex는 단원 목표 번호(0부터)이거나 목표와 무관하면 null이다.',
    '반드시 아래 JSON 객체 하나만 출력한다.',
    '{"questions":[{"type":"multiple_choice","question":"","choices":["","",""],"answerIndex":0,"explanation":"","objectiveIndex":0}]}'
  ].join('\n')
}

export const SUMMARY_SKILL: StructuredSkill<AiSessionSummary> = {
  id: 'summary',
  task: 'summary',
  schema: AiSessionSummarySchema,
  instruction: [
    '방금 끝난 학습 세션을 요약한다. 확실하지 않은 내용은 추정이라고 쓴다.',
    '반드시 아래 JSON 객체 하나만 출력한다.',
    '{"summary":"","nextSteps":"","strengths":[],"difficulties":[]}'
  ].join('\n')
}

/**
 * Runs a structured task. On invalid output, appends a corrective instruction and retries (max 2 times).
 * Throws ProviderError('INVALID_AI_OUTPUT') when no attempt validates. Provider errors pass through unchanged.
 */
export async function completeStructured<T>(
  provider: AIProvider,
  skill: StructuredSkill<T>,
  base: Omit<CompletionRequest, 'task' | 'prompt'> & { prompt: string }
): Promise<T> {
  let prompt = base.prompt
  let lastDetail = 'no attempt'
  for (let attempt = 0; attempt <= MAX_STRUCTURED_RETRIES; attempt += 1) {
    const result = await provider.complete({ ...base, task: skill.task, prompt })
    const parsed = skill.schema.safeParse(extractJson(result.text))
    if (parsed.success) return parsed.data
    lastDetail = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    prompt = `${base.prompt}\n\n[이전 응답 오류] 형식이 맞지 않았어요. 설명 없이 JSON 객체 하나만 다시 출력하세요.`
  }
  throw new ProviderError('INVALID_AI_OUTPUT', 'AI 응답 형식이 맞지 않아요.', lastDetail)
}
