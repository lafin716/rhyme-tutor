import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiCurriculumSchema, AiQuizSchema, AiSessionSummarySchema } from '../../../src/shared/ai-schemas'
import {
  MOCK_MARKERS,
  createMockProvider,
  mockOutput
} from '../../../src/main/providers/mock'
import { createProviderRegistry } from '../../../src/main/providers/registry'
import type { CompletionRequest, ProviderLogger } from '../../../src/main/providers/types'

const log: ProviderLogger = vi.fn() as unknown as ProviderLogger

function req(over: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    task: 'chat',
    system: 'sys',
    prompt: '질문입니다',
    model: null,
    timeoutMs: 10_000,
    signal: new AbortController().signal,
    ...over
  } as CompletionRequest
}

describe('mockOutput', () => {
  it('curriculum, quiz and summary are schema-valid JSON', () => {
    expect(() => AiCurriculumSchema.parse(JSON.parse(mockOutput('curriculum')))).not.toThrow()
    expect(() => AiQuizSchema.parse(JSON.parse(mockOutput('quiz')))).not.toThrow()
    expect(() => AiSessionSummarySchema.parse(JSON.parse(mockOutput('summary')))).not.toThrow()
  })

  it('quiz contains both multiple_choice and ox questions', () => {
    const quiz = AiQuizSchema.parse(JSON.parse(mockOutput('quiz')))
    const types = quiz.questions.map((q) => q.type)
    expect(types).toEqual(expect.arrayContaining(['multiple_choice', 'ox']))
  })

  it('ping returns pong and chat returns Korean text', () => {
    expect(mockOutput('ping')).toBe('pong')
    expect(mockOutput('chat')).toMatch(/[가-힣]/)
  })

  it('is deterministic', () => {
    expect(mockOutput('curriculum')).toBe(mockOutput('curriculum'))
  })
})

describe('mock provider', () => {
  const p = createMockProvider({ log, mockDelayMs: 0, markersEnabled: true })

  it('detects as ready without spawning anything', async () => {
    const info = await p.detect()
    expect(info.id).toBe('mock')
    expect(info.installed).toBe(true)
    expect(info.ready).toBe(true)
    expect(info.executablePath).toBeNull()
  })

  it('streams chunks whose concatenation equals the returned text', async () => {
    const deltas: string[] = []
    const res = await p.complete(req({ task: 'curriculum', prompt: '주제', onDelta: (d) => deltas.push(d) }))
    expect(deltas.length).toBeGreaterThan(1)
    expect(deltas.join('')).toBe(res.text)
    expect(() => AiCurriculumSchema.parse(JSON.parse(res.text))).not.toThrow()
  })

  it.each([
    [MOCK_MARKERS.fail, 'PROVIDER_FAILED'],
    [MOCK_MARKERS.auth, 'PROVIDER_AUTH_REQUIRED'],
    [MOCK_MARKERS.ratelimit, 'PROVIDER_RATE_LIMITED']
  ])('marker %s -> %s', async (marker, code) => {
    await expect(p.complete(req({ prompt: `hi ${marker}` }))).rejects.toMatchObject({ code })
  })

  it('[[mock:invalid]] yields non-JSON for structured tasks', async () => {
    const res = await p.complete(req({ task: 'quiz', prompt: MOCK_MARKERS.invalid }))
    expect(() => JSON.parse(res.text)).toThrow()
  })

  it('[[mock:invalid]] does not affect chat', async () => {
    const res = await p.complete(req({ task: 'chat', prompt: MOCK_MARKERS.invalid }))
    expect(res.text).toBe(mockOutput('chat'))
  })

  it('[[mock:slow]] can be cancelled mid-stream with PROVIDER_CANCELLED', async () => {
    const ac = new AbortController()
    const deltas: string[] = []
    const promise = p.complete(req({ prompt: MOCK_MARKERS.slow, signal: ac.signal, timeoutMs: 60_000, onDelta: (d) => deltas.push(d) }))
    setTimeout(() => ac.abort(), 400)
    await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED' })
    expect(deltas.length).toBeLessThan(40)
  })

  it('[[mock:slow]] times out when the deadline is shorter than the stream', async () => {
    await expect(p.complete(req({ prompt: MOCK_MARKERS.slow, timeoutMs: 100 }))).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT'
    })
  })

  it('an already-aborted signal rejects immediately', async () => {
    const ac = new AbortController()
    ac.abort()
    await expect(p.complete(req({ signal: ac.signal }))).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED' })
  })
})

describe('mock failure markers are gated', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('ignores markers when markersEnabled is false', async () => {
    const p = createMockProvider({ log, mockDelayMs: 0, markersEnabled: false })
    const res = await p.complete(req({ task: 'chat', prompt: `hi ${MOCK_MARKERS.fail}` }))
    expect(res.text).toBe(mockOutput('chat'))
  })

  it('ignores markers by default when TUTOR_ENABLE_MOCK is unset or not "1"', async () => {
    vi.stubEnv('TUTOR_ENABLE_MOCK', '0')
    const p = createMockProvider({ log, mockDelayMs: 0 })
    const res = await p.complete(req({ task: 'quiz', prompt: MOCK_MARKERS.invalid }))
    expect(res.text).toBe(mockOutput('quiz'))
    await expect(p.complete(req({ prompt: MOCK_MARKERS.auth }))).resolves.toMatchObject({ text: mockOutput('chat') })
  })

  it('honours markers when TUTOR_ENABLE_MOCK is "1" (checked per call)', async () => {
    const p = createMockProvider({ log, mockDelayMs: 0 })
    vi.stubEnv('TUTOR_ENABLE_MOCK', '1')
    await expect(p.complete(req({ prompt: MOCK_MARKERS.ratelimit }))).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED'
    })
    vi.stubEnv('TUTOR_ENABLE_MOCK', '0')
    await expect(p.complete(req({ prompt: MOCK_MARKERS.ratelimit }))).resolves.toMatchObject({
      text: mockOutput('chat')
    })
  })

  it('the mock provider itself stays available with markers off', async () => {
    const p = createMockProvider({ log, mockDelayMs: 0, markersEnabled: false })
    const info = await p.detect()
    expect(info.id).toBe('mock')
    expect(info.ready).toBe(true)
  })
})

describe('provider registry', () => {
  const reg = createProviderRegistry({ tempRoot: '/tmp/tutor-unit-test-unused', log, mockDelayMs: 0 })

  it('returns the mock provider by id', () => {
    expect(reg.get('mock').id).toBe('mock')
    expect(reg.get('claude-code').id).toBe('claude-code')
    expect(reg.get('codex').id).toBe('codex')
  })

  it('throws PROVIDER_NOT_SELECTED for an unknown id', () => {
    let code: unknown = null
    try {
      reg.get('nope' as never)
    } catch (e) {
      code = (e as { code?: unknown }).code
    }
    expect(code).toBe('PROVIDER_NOT_SELECTED')
  })
})
