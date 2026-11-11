/**
 * Real-CLI smoke test. Runs ONLY when TUTOR_REAL_CLI=1 is set, because it calls the installed
 * claude/codex binaries (and their model APIs). Never reads credential files; uses only the
 * CLIs' own detection commands plus one short `ping` prompt per provider.
 */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createClaudeCodeProvider } from '../../../src/main/providers/claude-code'
import { createCodexProvider } from '../../../src/main/providers/codex'
import type { AIProvider, CompletionRequest, ProviderLogger } from '../../../src/main/providers/types'

const enabled = process.env.TUTOR_REAL_CLI === '1'
const log: ProviderLogger = vi.fn() as unknown as ProviderLogger

async function smoke(name: string, provider: AIProvider): Promise<void> {
  const info = await provider.detect()
  console.info(`[smoke:${name}] installed=${info.installed} version=${info.version} authenticated=${info.authenticated}`)
  if (!info.installed || info.authenticated !== true) {
    console.info(`[smoke:${name}] skipped completion: ${info.installed ? 'not logged in' : 'not installed'}`)
    return
  }
  const started = Date.now()
  const req: CompletionRequest = {
    task: 'ping',
    system: 'Reply with exactly the word pong.',
    prompt: 'ping',
    model: null,
    timeoutMs: 90_000,
    signal: new AbortController().signal
  }
  const res = await provider.complete(req)
  console.info(`[smoke:${name}] latencyMs=${Date.now() - started} textLength=${res.text.length}`)
  expect(res.text.trim().length).toBeGreaterThan(0)
}

describe.skipIf(!enabled)('real CLI smoke (TUTOR_REAL_CLI=1)', () => {
  it('claude-code completes a ping', async () => {
    await smoke('claude-code', createClaudeCodeProvider({ tempRoot: join(tmpdir(), 'tutor-smoke'), log }))
  }, 120_000)

  it('codex completes a ping', async () => {
    await smoke('codex', createCodexProvider({ tempRoot: join(tmpdir(), 'tutor-smoke'), log }))
  }, 120_000)
})
