/**
 * Context Builder (BE-03). Assembles system + prompt within CONTEXT_BUDGET_CHARS.
 * Trim order (TUTOR_ENGINE.md section 5): recent messages (5) first, then quiz stats (4), then objectives (3),
 * then memories (2). The latest summary (1) is never trimmed. Learner text only goes into `prompt`.
 */
import type { LearningMemory, LearningSummary } from '@shared/domain'
import { buildCoreSystem, joinSystem, type LessonObjectiveLine } from './prompts'
import type { TutorCharacter, Course, LearnerProfile, Lesson } from '@shared/domain'

export const CONTEXT_BUDGET_CHARS = 12_000
export const MAX_MEMORIES = 10
export const MAX_MESSAGE_CHARS = 1_500
export const TRUNCATION_MARK = '…(중략) '

export interface ContextMessage {
  seq: number
  role: 'tutor' | 'learner' | 'system'
  content: string
}

export interface QuizStats {
  total: number
  correct: number
  wrongObjectives: string[]
}

export interface ContextInput {
  tutor: TutorCharacter
  course: Pick<Course, 'title' | 'goal' | 'level' | 'pace'>
  profile: LearnerProfile | null
  lesson: Pick<Lesson, 'title' | 'summary'> | null
  objectives: LessonObjectiveLine[]
  memories: LearningMemory[]
  summary: LearningSummary | null
  quizStats: QuizStats | null
  /** Newest first, already filtered to seq > covered_until_seq. */
  recentMessages: ContextMessage[]
  /** The learner text for this turn (placed only in the prompt). */
  learnerText: string | null
  skill: string
  budgetChars?: number
}

export interface BuiltContext {
  system: string
  prompt: string
  /** Names of the sections that were reduced, in trim order. Empty when nothing was trimmed. */
  trimmed: Array<'messages' | 'quizStats' | 'objectives' | 'memories'>
  totalChars: number
}

/** Keeps the tail of an over-long message and prefixes the omission mark. */
export function truncateMessage(text: string, max: number = MAX_MESSAGE_CHARS): string {
  const cps = Array.from(text)
  if (cps.length <= max) return text
  return TRUNCATION_MARK + cps.slice(cps.length - max).join('')
}

function quizStatsSection(stats: QuizStats | null): string | undefined {
  if (!stats || stats.total === 0) return undefined
  const lines = ['[퀴즈 통계]', `최근 정답: ${stats.correct}/${stats.total}`]
  if (stats.wrongObjectives.length > 0) lines.push(`다시 볼 목표: ${stats.wrongObjectives.join(', ')}`)
  return lines.join('\n')
}

/** Input is newest-first; the transcript is written oldest-first. */
function transcript(newestFirst: ContextMessage[]): string {
  if (newestFirst.length === 0) return ''
  const lines = [...newestFirst].reverse().map((m) => {
    const who = m.role === 'learner' ? '학습자' : m.role === 'tutor' ? '선생님' : '안내'
    return `${who}: ${truncateMessage(m.content)}`
  })
  return ['[최근 대화]', ...lines].join('\n')
}

export function buildContext(input: ContextInput): BuiltContext {
  const budget = input.budgetChars ?? CONTEXT_BUDGET_CHARS
  const trimmed: BuiltContext['trimmed'] = []

  let memories = input.memories.slice(0, MAX_MEMORIES)
  let objectives = input.objectives
  let quizStats = input.quizStats
  let messages = [...input.recentMessages]

  const learner = input.learnerText ? `[학습자 메시지]\n${truncateMessage(input.learnerText)}` : ''

  const assemble = (): { system: string; prompt: string } => {
    const system = buildCoreSystem({
      tutor: input.tutor,
      course: input.course,
      profile: input.profile,
      lesson: input.lesson,
      objectives,
      memories,
      summary: input.summary,
      skill: input.skill
    })
    const quizPart = quizStatsSection(quizStats)
    const prompt = joinSystem([quizPart, transcript(messages), learner])
    return { system, prompt }
  }

  const measure = (): number => {
    const { system, prompt } = assemble()
    return system.length + prompt.length
  }

  // 5 -> 4 -> 3 -> 2: drop the lowest-priority material in the documented order until it fits.
  // Messages go first, one at a time from the oldest end (the newest message is kept).
  while (measure() > budget && messages.length > 0) {
    messages = messages.slice(0, -1)
    if (!trimmed.includes('messages')) trimmed.push('messages')
  }
  if (measure() > budget && quizStats) {
    quizStats = null
    trimmed.push('quizStats')
  }
  while (measure() > budget && objectives.length > 1) {
    objectives = objectives.slice(0, -1)
    if (!trimmed.includes('objectives')) trimmed.push('objectives')
  }
  while (measure() > budget && memories.length > 0) {
    memories = memories.slice(0, -1)
    if (!trimmed.includes('memories')) trimmed.push('memories')
  }

  const { system, prompt } = assemble()
  return { system, prompt, trimmed, totalChars: system.length + prompt.length }
}
