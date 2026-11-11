import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLAUDE_BASE_ARGS,
  createClaudeCodeProvider,
  parseAuthStatus
} from '../../../src/main/providers/claude-code'
import type { CompletionRequest, ProviderLogger } from '../../../src/main/providers/types'

const FAKE = fileURLToPath(new URL('./fixtures/fake-claude.mjs', import.meta.url))
const locate = () => ({ file: process.execPath, prefixArgs: [FAKE] })
const locateLoggedOut = () => ({ file: process.execPath, prefixArgs: [FAKE, '--fake-logged-out'] })
const log: ProviderLogger = vi.fn() as unknown as ProviderLogger

function req(over: Partial<CompletionRequest> = {}): CompletionRequest {
  return {
    task: 'chat',
    system: '시스템 지침',
    prompt: '안녕하세요',
    model: null,
    timeoutMs: 10_000,
    signal: new AbortController().signal,
    ...over
  } as CompletionRequest
}

interface EchoReport {
  argv: string[]
  cwd: string
  envKeys: string[]
}

describe('claude-code adapter', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'claude-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('never passes the prompt or system text through argv (flags are fixed)', () => {
    expect(CLAUDE_BASE_ARGS).toContain('--tools')
    expect(CLAUDE_BASE_ARGS).toContain('--no-session-persistence')
    expect(CLAUDE_BASE_ARGS).not.toContain('안녕하세요')
  })

  describe('parseAuthStatus', () => {
    it('reads loggedIn from JSON', () => {
      expect(parseAuthStatus('{"loggedIn":true}', 0)).toBe(true)
      expect(parseAuthStatus('{"loggedIn":false}', 1)).toBe(false)
    })
    it('returns null for unknown output on exit 0, false on non-zero exit', () => {
      expect(parseAuthStatus('weird', 0)).toBeNull()
      expect(parseAuthStatus('weird', 1)).toBe(false)
    })
  })

  describe('detect', () => {
    it('reports installed, version, and authenticated', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      const info = await p.detect()
      expect(info.installed).toBe(true)
      expect(info.version).toBe('2.1.322')
      expect(info.authenticated).toBe(true)
      expect(info.ready).toBe(true)
      expect(info.experimental).toBe(true)
    })

    it('reports not-ready when logged out', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate: locateLoggedOut, platform: 'darwin' })
      const info = await p.detect()
      expect(info.authenticated).toBe(false)
      expect(info.ready).toBe(false)
    })

    it('reports not installed when no executable is located', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate: () => null, platform: 'darwin' })
      const info = await p.detect()
      expect(info.installed).toBe(false)
      expect(info.executablePath).toBeNull()
    })
  })

  describe('complete', () => {
    it('streams text deltas and returns the final result text', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      const deltas: string[] = []
      const res = await p.complete(req({ onDelta: (d) => deltas.push(d) }))
      expect(res.text).toBe('안녕하세요 테스트 응답입니다.')
      expect(deltas.join('')).toBe(res.text)
      expect(deltas.length).toBeGreaterThan(1)
    })

    it('maps a non-zero exit with login text to PROVIDER_AUTH_REQUIRED', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:auth' }))).rejects.toMatchObject({ code: 'PROVIDER_AUTH_REQUIRED' })
    })

    it('maps a generic non-zero exit to PROVIDER_FAILED', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:fail' }))).rejects.toMatchObject({ code: 'PROVIDER_FAILED' })
    })

    it('maps an is_error result to PROVIDER_RATE_LIMITED when the text says so', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:error_result' }))).rejects.toMatchObject({
        code: 'PROVIDER_RATE_LIMITED'
      })
    })

    it('times out and kills the child', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:hang', timeoutMs: 500 }))).rejects.toMatchObject({
        code: 'PROVIDER_TIMEOUT'
      })
    })

    it('reports PROVIDER_CANCELLED when aborted mid-call', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      const ac = new AbortController()
      const promise = p.complete(req({ prompt: 'FAKE:hang', signal: ac.signal, timeoutMs: 30_000 }))
      setTimeout(() => ac.abort(), 300)
      await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED' })
    })

    it('reports PROVIDER_NOT_INSTALLED when locate returns null', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate: () => null, platform: 'darwin' })
      await expect(p.complete(req())).rejects.toMatchObject({ code: 'PROVIDER_NOT_INSTALLED' })
    })

    it('rejects an unsafe model alias with VALIDATION before spawning', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ model: 'x; rm -rf /' }))).rejects.toMatchObject({ code: 'VALIDATION' })
    })

    it('runs in the per-call scratch dir, which is the child cwd (no project files or settings)', async () => {
      const p = createClaudeCodeProvider({ tempRoot, log, locate, platform: 'darwin' })
      const res = await p.complete(req({ prompt: 'FAKE:echo' }))
      const report = JSON.parse(res.text) as EchoReport
      expect(report.argv).toEqual(expect.arrayContaining(['-p', '--tools', '--setting-sources', 'project']))
      expect(report.argv).not.toContain('-C')
      // The scratch dir is removed after the call, so compare by name (macOS tmp paths are symlinked).
      const i = report.argv.indexOf('--system-prompt-file')
      const sysFile = report.argv[i + 1] ?? ''
      expect(sysFile.startsWith(tempRoot)).toBe(true)
      expect(basename(report.cwd)).toBe(basename(join(sysFile, '..')))
    })

    it('passes only allow-listed env names to the child, never values', async () => {
      const p = createClaudeCodeProvider({
        tempRoot,
        log,
        locate,
        env: {
          PATH: process.env.PATH ?? '/usr/bin',
          HOME: '/tmp/fake-home',
          ANTHROPIC_API_KEY: 'sk-test-value-anthropic',
          TUTOR_LEAK_CANARY: 'canary-value',
          GITHUB_TOKEN: 'gh-canary-value'
        },
        platform: 'darwin'
      })
      const res = await p.complete(req({ prompt: 'FAKE:echo' }))
      const report = JSON.parse(res.text) as EchoReport
      expect(report.envKeys).toContain('ANTHROPIC_API_KEY')
      expect(report.envKeys).not.toContain('TUTOR_LEAK_CANARY')
      expect(report.envKeys).not.toContain('GITHUB_TOKEN')
      expect(res.text).not.toContain('canary-value')
      expect(res.text).not.toContain('sk-test-value-anthropic')
    })

    it('never logs env values, prompts or output bodies', async () => {
      const spy = vi.fn() as unknown as ProviderLogger
      const p = createClaudeCodeProvider({
        tempRoot,
        log: spy,
        locate,
        env: { PATH: process.env.PATH ?? '/usr/bin', HOME: '/tmp/fake-home', ANTHROPIC_API_KEY: 'sk-logged-canary-anthropic' },
        platform: 'darwin'
      })
      await p.complete(req({ prompt: 'FAKE:echo 비밀 질문 본문' }))
      await p.detect()
      const logged = JSON.stringify((spy as unknown as { mock: { calls: unknown[] } }).mock.calls)
      expect(logged).not.toContain('sk-logged-canary-anthropic')
      expect(logged).not.toContain('비밀 질문 본문')
      expect(logged).not.toContain('FAKE:echo')
    })
  })
})
