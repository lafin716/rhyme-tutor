import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderCapabilities, ProviderInfo } from '../../../src/shared/domain'
import { createProviderRegistry } from '../../../src/main/providers/registry'
import type { ProviderLogger } from '../../../src/main/providers/types'

// Fake the two CLI adapters so detectAll() never spawns a real claude/codex process.
const fakes = vi.hoisted(() => ({
  claude: (): Promise<unknown> => Promise.reject(new Error('unset')),
  codex: (): Promise<unknown> => Promise.reject(new Error('unset'))
}))

vi.mock('../../../src/main/providers/claude-code', () => ({
  createClaudeCodeProvider: () => ({
    id: 'claude-code',
    displayName: 'Claude Code',
    capabilities: { tokenStreaming: true, cancel: true, structuredOutput: true },
    detect: () => fakes.claude(),
    complete: () => Promise.reject(new Error('not used in registry tests'))
  })
}))

vi.mock('../../../src/main/providers/codex', () => ({
  createCodexProvider: () => ({
    id: 'codex',
    displayName: 'Codex',
    capabilities: { tokenStreaming: false, cancel: true, structuredOutput: true },
    detect: () => fakes.codex(),
    complete: () => Promise.reject(new Error('not used in registry tests'))
  })
}))

const CLAUDE_CAPS: ProviderCapabilities = { tokenStreaming: true, cancel: true, structuredOutput: true }
const CODEX_CAPS: ProviderCapabilities = { tokenStreaming: false, cancel: true, structuredOutput: true }

function info(id: 'claude-code' | 'codex', over: Partial<ProviderInfo> = {}): ProviderInfo {
  return {
    id,
    displayName: id === 'codex' ? 'Codex' : 'Claude Code',
    experimental: true,
    installed: true,
    executablePath: `/fake/${id}`,
    version: '1.0.0',
    authenticated: true,
    ready: true,
    message: '',
    capabilities: id === 'codex' ? CODEX_CAPS : CLAUDE_CAPS,
    ...over
  }
}

let log: ProviderLogger

function registry() {
  return createProviderRegistry({ tempRoot: '/tmp/tutor-registry-test-unused', log, mockDelayMs: 0 })
}

describe('provider registry detectAll()', () => {
  beforeEach(() => {
    log = vi.fn() as unknown as ProviderLogger
    fakes.claude = () => Promise.resolve(info('claude-code'))
    fakes.codex = () => Promise.resolve(info('codex'))
  })

  it('lists all three providers in fixed order when all are detected', async () => {
    const all = await registry().detectAll()
    expect(all.map((p) => p.id)).toEqual(['claude-code', 'codex', 'mock'])
    expect(all.every((p) => p.installed)).toBe(true)
    expect(all.find((p) => p.id === 'codex')?.ready).toBe(true)
  })

  it('reports one not-installed provider without hiding the others', async () => {
    fakes.codex = () =>
      Promise.resolve(info('codex', { installed: false, executablePath: null, version: null, authenticated: null, ready: false }))
    const all = await registry().detectAll()
    expect(all.map((p) => p.id)).toEqual(['claude-code', 'codex', 'mock'])
    expect(all.find((p) => p.id === 'codex')).toMatchObject({ installed: false, ready: false, executablePath: null })
    expect(all.find((p) => p.id === 'claude-code')).toMatchObject({ installed: true, ready: true })
    expect(all.find((p) => p.id === 'mock')).toMatchObject({ installed: true, ready: true })
  })

  // Mock is the "체험 모드" demo path and is always listed. TUTOR_ENABLE_MOCK gates only the failure markers.
  it('always lists mock; markers gated separately', async () => {
    vi.stubEnv('TUTOR_ENABLE_MOCK', '')
    try {
      const all = await registry().detectAll()
      expect(all.map((p) => p.id)).toContain('mock')
      expect(all.find((p) => p.id === 'mock')).toMatchObject({ installed: true, ready: true })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it('a rejecting detect() in one provider does not reject detectAll or hide the others', async () => {
    fakes.claude = () => Promise.reject(new Error('spawn EACCES /secret/path'))
    const all = await registry().detectAll()
    expect(all.map((p) => p.id)).toEqual(['claude-code', 'codex', 'mock'])
    expect(all.find((p) => p.id === 'claude-code')).toMatchObject({
      installed: false,
      ready: false,
      authenticated: null,
      experimental: true
    })
    expect(all.find((p) => p.id === 'codex')).toMatchObject({ installed: true, ready: true })
    expect(all.find((p) => p.id === 'mock')).toMatchObject({ installed: true, ready: true })
  })

  it('logs only the error name, not the message or path, when detect() throws', async () => {
    fakes.codex = () => Promise.reject(new TypeError('boom with /secret/path'))
    await registry().detectAll()
    const calls = (log as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const warn = calls.find((c) => c[1] === 'provider detect threw')
    expect(warn).toBeDefined()
    expect(warn?.[0]).toBe('warn')
    expect(warn?.[2]).toEqual({ id: 'codex', reason: 'TypeError' })
    expect(JSON.stringify(calls)).not.toContain('/secret/path')
  })
})
