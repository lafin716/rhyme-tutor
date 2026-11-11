import type { AIProvider, CompletionRequest } from '../../../src/main/providers/types'
import { MOCK_CAPABILITIES } from '../../../src/main/providers/mock'

export type ScriptedHandler = (req: CompletionRequest, call: number) => string | Promise<string>

/** Provider whose replies come from a script. Every request is recorded in `calls`. */
export function scriptedProvider(handler: ScriptedHandler): AIProvider & { calls: CompletionRequest[] } {
  const calls: CompletionRequest[] = []
  return {
    id: 'mock',
    displayName: '테스트 제공자',
    capabilities: MOCK_CAPABILITIES,
    calls,
    async detect() {
      return {
        id: 'mock',
        displayName: '테스트 제공자',
        experimental: false,
        installed: true,
        executablePath: null,
        version: 'test',
        authenticated: true,
        ready: true,
        message: 'test',
        capabilities: MOCK_CAPABILITIES
      }
    },
    async complete(req) {
      calls.push(req)
      const text = await handler(req, calls.length)
      return { text, durationMs: 0 }
    }
  }
}

/** Returns the `code` of a thrown error, or undefined when nothing was thrown. */
export function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}

export async function codeOfAsync(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}
