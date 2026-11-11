import { describe, expect, it } from 'vitest'
import { extractJson } from '@shared/ai-schemas'
import { completeStructured, CURRICULUM_SKILL, MAX_STRUCTURED_RETRIES, QUIZ_SKILL, SUMMARY_SKILL } from '../../../src/main/tutor/skills'
import { mockOutput } from '../../../src/main/providers/mock'
import { ProviderError } from '../../../src/main/providers/types'
import { mockProvider as makeMock } from '../support/harness'
import { scriptedProvider } from '../support/fakes'

const base = { system: 'sys', prompt: '프롬프트', timeoutMs: 5_000, signal: new AbortController().signal }

describe('extractJson', () => {
  it('reads JSON inside a Markdown code fence', () => {
    expect(extractJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
  })

  it('reads JSON wrapped in prose', () => {
    expect(extractJson('설명이에요. {"a": 2} 이상이에요.')).toEqual({ a: 2 })
  })
})

describe('completeStructured', () => {
  it('retries after invalid output and returns the first valid result', async () => {
    const valid = mockOutput('quiz')
    const provider = scriptedProvider((_req, call) => (call === 1 ? '형식이 아니에요' : valid))
    const quiz = await completeStructured(provider, QUIZ_SKILL, base)
    expect(quiz.questions.length).toBeGreaterThan(0)
    expect(provider.calls).toHaveLength(2)
    expect(provider.calls[1]?.prompt).toContain('[이전 응답 오류]')
  })

  it('throws INVALID_AI_OUTPUT after the retry budget is spent', async () => {
    const provider = scriptedProvider(() => '{"nope": true}')
    const err = await completeStructured(provider, SUMMARY_SKILL, base).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProviderError)
    expect((err as ProviderError).code).toBe('INVALID_AI_OUTPUT')
    expect(provider.calls).toHaveLength(MAX_STRUCTURED_RETRIES + 1)
  })

  it('passes provider errors through unchanged without retrying', async () => {
    const provider = scriptedProvider(() => {
      throw new ProviderError('PROVIDER_AUTH_REQUIRED', '인증이 필요해요.')
    })
    const err = await completeStructured(provider, CURRICULUM_SKILL, base).catch((e: unknown) => e)
    expect((err as ProviderError).code).toBe('PROVIDER_AUTH_REQUIRED')
    expect(provider.calls).toHaveLength(1)
  })

  it('mock curriculum output validates against CURRICULUM_SKILL', async () => {
    const result = await completeStructured(makeMock(), CURRICULUM_SKILL, base)
    expect(result.modules.length).toBeGreaterThan(0)
  })

  it('mock quiz output validates against QUIZ_SKILL', async () => {
    const result = await completeStructured(makeMock(), QUIZ_SKILL, base)
    expect(result.questions.length).toBeGreaterThan(0)
  })

  it('mock summary output validates against SUMMARY_SKILL', async () => {
    const result = await completeStructured(makeMock(), SUMMARY_SKILL, base)
    expect(result.summary.length).toBeGreaterThan(0)
  })

  it('mock raw outputs parse as JSON for every structured task', () => {
    expect(() => JSON.parse(mockOutput('curriculum'))).not.toThrow()
    expect(() => JSON.parse(mockOutput('quiz'))).not.toThrow()
    expect(() => JSON.parse(mockOutput('summary'))).not.toThrow()
  })
})
