/**
 * Deterministic in-process provider for development, tests and E2E. Never spawns a process.
 * Output is schema-valid JSON for structured tasks (see src/shared/ai-schemas.ts).
 *
 * Failure injection (checked in the user prompt). Markers are honoured only when
 * process.env.TUTOR_ENABLE_MOCK === '1' (E2E and dev), or when `markersEnabled` is passed explicitly:
 *   [[mock:fail]]      -> PROVIDER_FAILED
 *   [[mock:auth]]      -> PROVIDER_AUTH_REQUIRED
 *   [[mock:ratelimit]] -> PROVIDER_RATE_LIMITED
 *   [[mock:invalid]]   -> non-JSON text for structured tasks (chat is unaffected)
 *   [[mock:slow]]      -> 40 chunks at 250ms each (about 10s), for cancel/timeout testing
 * With markers disabled, the mock always returns its normal output for the task.
 */
import type { AiCurriculum, AiQuiz, AiSessionSummary } from '@shared/ai-schemas'
import type { ProviderCapabilities, ProviderInfo } from '@shared/domain'
import { MESSAGES_KO } from './resolve'
import {
  ProviderError,
  type AIProvider,
  type CompletionRequest,
  type CompletionResult,
  type CompletionTask,
  type ProviderLogger
} from './types'

export const MOCK_MARKERS = {
  fail: '[[mock:fail]]',
  auth: '[[mock:auth]]',
  ratelimit: '[[mock:ratelimit]]',
  invalid: '[[mock:invalid]]',
  slow: '[[mock:slow]]'
} as const

export const MOCK_DEFAULT_DELAY_MS = 15
export const MOCK_CHUNK_CHARS = 12
export const MOCK_SLOW_CHUNKS = 40
export const MOCK_SLOW_CHUNK_DELAY_MS = 250
export const MOCK_CAPABILITIES: ProviderCapabilities = { tokenStreaming: true, cancel: true, structuredOutput: true }

export interface MockProviderOptions {
  log: ProviderLogger
  mockDelayMs?: number
  /** Overrides the marker gate. Defaults to `process.env.TUTOR_ENABLE_MOCK === '1'`, checked per call. */
  markersEnabled?: boolean
}

const CURRICULUM: AiCurriculum = {
  modules: [
    {
      title: '기초 다지기',
      summary: '핵심 개념을 익혀요.',
      lessons: [
        {
          title: '개념 살펴보기',
          summary: '기본 개념을 정리해요.',
          objectives: ['핵심 용어를 설명할 수 있다', '기본 예시를 들 수 있다']
        },
        { title: '간단한 연습', summary: '짧은 연습 문제를 풀어요.', objectives: ['간단한 문제를 풀 수 있다'] }
      ]
    },
    {
      title: '응용하기',
      summary: '배운 내용을 활용해요.',
      lessons: [{ title: '응용 문제', summary: '조금 더 어려운 문제를 풀어요.', objectives: ['응용 문제에 접근할 수 있다'] }]
    }
  ]
}

const QUIZ: AiQuiz = {
  questions: [
    {
      type: 'multiple_choice',
      question: '다음 중 기본 개념으로 옳은 것은?',
      choices: ['보기 1', '보기 2', '보기 3'],
      answerIndex: 1,
      explanation: '두 번째 보기가 정답이에요.',
      objectiveIndex: 0
    },
    {
      type: 'ox',
      question: '이 문제는 테스트용 모의 응답으로 만들어졌다.',
      answer: 'O',
      explanation: '모의 제공자가 만든 문제예요.',
      objectiveIndex: null
    }
  ]
}

const SUMMARY: AiSessionSummary = {
  summary: '모의 학습 요약입니다. 질문을 꾸준히 이어가고 있어요.',
  nextSteps: '다음 레슨을 이어서 진행해요.',
  strengths: ['꾸준히 질문했어요.'],
  difficulties: []
}

const CHAT_REPLY = '좋은 질문이에요! 지금은 체험용 모의 응답이에요. 실제 AI 응답을 쓰려면 설정에서 제공자를 선택해 주세요.'

/** Full deterministic output for a task (before chunking). */
export function mockOutput(task: CompletionTask): string {
  switch (task) {
    case 'ping':
      return 'pong'
    case 'curriculum':
      return JSON.stringify(CURRICULUM, null, 2)
    case 'quiz':
      return JSON.stringify(QUIZ, null, 2)
    case 'summary':
      return JSON.stringify(SUMMARY, null, 2)
    case 'chat':
      return CHAT_REPLY
  }
}

function isStructured(task: CompletionTask): boolean {
  return task === 'curriculum' || task === 'quiz' || task === 'summary'
}

function cancelledError(): ProviderError {
  return new ProviderError('PROVIDER_CANCELLED', MESSAGES_KO.cancelled)
}

/** Resolves after `ms`, rejects with PROVIDER_CANCELLED if the signal aborts first. */
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(cancelledError())
      return
    }
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(cancelledError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Splits text into code-point-safe chunks of at most `size` code points. */
function chunk(text: string, size: number): string[] {
  const cps = Array.from(text)
  const out: string[] = []
  for (let i = 0; i < cps.length; i += size) out.push(cps.slice(i, i + size).join(''))
  return out
}

export function createMockProvider(opts: MockProviderOptions): AIProvider {
  const delayMs = opts.mockDelayMs ?? MOCK_DEFAULT_DELAY_MS
  const log = opts.log
  const id = 'mock' as const

  return {
    id,
    displayName: '체험용 모의 응답',
    capabilities: MOCK_CAPABILITIES,

    async detect(): Promise<ProviderInfo> {
      return {
        id,
        displayName: '체험용 모의 응답',
        experimental: false,
        installed: true,
        executablePath: null,
        version: 'mock',
        authenticated: true,
        ready: true,
        message: '체험용 모의 응답을 사용해요. 실제 AI 응답이 아니에요.',
        capabilities: MOCK_CAPABILITIES
      }
    },

    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const started = Date.now()
      const deadline = started + req.timeoutMs
      const p = req.prompt
      const markersOn = opts.markersEnabled ?? process.env.TUTOR_ENABLE_MOCK === '1'
      const has = (marker: string): boolean => markersOn && p.includes(marker)

      if (req.signal.aborted) throw cancelledError()
      if (has(MOCK_MARKERS.fail)) throw new ProviderError('PROVIDER_FAILED', MESSAGES_KO.failed, 'mock:fail')
      if (has(MOCK_MARKERS.auth)) {
        throw new ProviderError('PROVIDER_AUTH_REQUIRED', MESSAGES_KO.authRequired, 'mock:auth')
      }
      if (has(MOCK_MARKERS.ratelimit)) {
        throw new ProviderError('PROVIDER_RATE_LIMITED', MESSAGES_KO.rateLimited, 'mock:ratelimit')
      }

      const invalid = has(MOCK_MARKERS.invalid) && isStructured(req.task)
      const slow = has(MOCK_MARKERS.slow)
      const text = invalid ? '죄송해요, 이건 JSON이 아니에요. 형식 없이 응답합니다.' : mockOutput(req.task)

      const pieces = slow
        ? chunk(text, Math.max(1, Math.ceil(Array.from(text).length / MOCK_SLOW_CHUNKS)))
        : chunk(text, MOCK_CHUNK_CHARS)
      const stepMs = slow ? MOCK_SLOW_CHUNK_DELAY_MS : delayMs

      for (const piece of pieces) {
        const remaining = deadline - Date.now()
        if (remaining <= 0) throw new ProviderError('PROVIDER_TIMEOUT', MESSAGES_KO.timeout)
        await wait(Math.min(stepMs, remaining), req.signal)
        req.onDelta?.(piece)
      }

      const durationMs = Date.now() - started
      log('debug', 'mock call ok', { task: req.task, durationMs })
      return { text, durationMs }
    }
  }
}
