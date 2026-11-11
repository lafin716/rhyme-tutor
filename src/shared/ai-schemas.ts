/**
 * Zod schemas for STRUCTURED AI output (leader-owned). AI responses are untrusted:
 * main extracts JSON, validates with these, and retries a bounded number of times.
 */
import { z } from 'zod'

const text = (max: number) => z.string().trim().min(1).max(max)

export const AiCurriculumSchema = z.object({
  modules: z
    .array(
      z.object({
        title: text(80),
        summary: text(300),
        lessons: z
          .array(
            z.object({
              title: text(80),
              summary: text(300),
              objectives: z.array(text(200)).min(1).max(5)
            })
          )
          .min(1)
          .max(6)
      })
    )
    .min(1)
    .max(8)
})
export type AiCurriculum = z.infer<typeof AiCurriculumSchema>

export const AiQuizSchema = z.object({
  questions: z
    .array(
      z.discriminatedUnion('type', [
        z.object({
          type: z.literal('multiple_choice'),
          question: text(400),
          choices: z.array(text(200)).min(3).max(5),
          answerIndex: z.number().int().min(0).max(4),
          explanation: text(800),
          /** 0-based index into the lesson's objectives, or null. */
          objectiveIndex: z.number().int().min(0).max(4).nullable()
        }),
        z.object({
          type: z.literal('ox'),
          question: text(400),
          answer: z.enum(['O', 'X']),
          explanation: text(800),
          objectiveIndex: z.number().int().min(0).max(4).nullable()
        })
      ])
    )
    .min(1)
    .max(5)
}).superRefine((value, ctx) => {
  value.questions.forEach((q, i) => {
    if (q.type === 'multiple_choice' && q.answerIndex >= q.choices.length) {
      ctx.addIssue({ code: 'custom', path: ['questions', i, 'answerIndex'], message: 'answerIndex out of range' })
    }
  })
})
export type AiQuiz = z.infer<typeof AiQuizSchema>

export const AiSessionSummarySchema = z.object({
  summary: text(1200),
  nextSteps: text(600),
  strengths: z.array(text(200)).max(5),
  difficulties: z.array(text(200)).max(5)
})
export type AiSessionSummary = z.infer<typeof AiSessionSummarySchema>

/**
 * Extracts the first JSON object from model text (handles ```json fences and surrounding prose).
 * Returns undefined if nothing parseable is found.
 */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw)
  const candidates = [fenced?.[1], raw]
  for (const c of candidates) {
    if (!c) continue
    const start = c.indexOf('{')
    const end = c.lastIndexOf('}')
    if (start === -1 || end <= start) continue
    try {
      return JSON.parse(c.slice(start, end + 1))
    } catch {
      // try next candidate
    }
  }
  return undefined
}
