import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CODEX_BASE_ARGS,
  composeCodexInput,
  createCodexProvider,
  parseLoginStatus
} from '../../../src/main/providers/codex'
import type { CompletionRequest, ProviderLogger } from '../../../src/main/providers/types'

const FAKE = fileURLToPath(new URL('./fixtures/fake-codex.mjs', import.meta.url))
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

describe('codex adapter', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'codex-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('uses read-only ephemeral exec with stdin prompt ("-")', () => {
    expect(CODEX_BASE_ARGS).toEqual(expect.arrayContaining(['exec', '--json', '--ephemeral', '-s', 'read-only']))
  })

  it('wraps system and user text in delimited sections', () => {
    const out = composeCodexInput('SYS', 'USER')
    expect(out).toContain('<system_instructions>\nSYS\n</system_instructions>')
    expect(out).toContain('<user_message>\nUSER\n</user_message>')
  })

  describe('parseLoginStatus', () => {
    it('true for exit 0 with "Logged in"', () => {
      expect(parseLoginStatus('Logged in using ChatGPT', 0)).toBe(true)
    })
    it('false for "not logged in" or non-zero exit', () => {
      expect(parseLoginStatus('Not logged in', 0)).toBe(false)
      expect(parseLoginStatus('anything', 1)).toBe(false)
    })
    it('null when exit 0 and no recognizable text', () => {
      expect(parseLoginStatus('???', 0)).toBeNull()
    })
  })

  describe('detect', () => {
    it('reports version and login state', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      const info = await p.detect()
      expect(info.installed).toBe(true)
      expect(info.version).toBe('0.164.0')
      expect(info.authenticated).toBe(true)
      expect(info.ready).toBe(true)
    })

    it('reports not-ready when logged out', async () => {
      const p = createCodexProvider({ tempRoot, log, locate: locateLoggedOut, platform: 'darwin' })
      const info = await p.detect()
      expect(info.authenticated).toBe(false)
      expect(info.ready).toBe(false)
    })

    it('reports not installed when no executable is located', async () => {
      const p = createCodexProvider({ tempRoot, log, locate: () => null, platform: 'darwin' })
      expect((await p.detect()).installed).toBe(false)
    })
  })

  describe('complete', () => {
    it('returns only agent_message text and ignores non-fatal error and reasoning items', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      const deltas: string[] = []
      const res = await p.complete(req({ onDelta: (d) => deltas.push(d) }))
      expect(res.text).toBe('코덱스 테스트 응답입니다.')
      // Codex does not token-stream: the whole message is delivered once.
      expect(deltas).toEqual(['코덱스 테스트 응답입니다.'])
    })

    it('maps turn.failed to PROVIDER_FAILED', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:fail' }))).rejects.toMatchObject({ code: 'PROVIDER_FAILED' })
    })

    it('maps a usage-limit turn.failed to PROVIDER_RATE_LIMITED', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:limit' }))).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMITED' })
    })

    it('times out a hanging call', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ prompt: 'FAKE:hang', timeoutMs: 500 }))).rejects.toMatchObject({
        code: 'PROVIDER_TIMEOUT'
      })
    })

    it('reports PROVIDER_CANCELLED when aborted mid-call', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      const ac = new AbortController()
      const promise = p.complete(req({ prompt: 'FAKE:hang', signal: ac.signal, timeoutMs: 30_000 }))
      setTimeout(() => ac.abort(), 300)
      await expect(promise).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED' })
    })

    it('rejects an unsafe model alias with VALIDATION', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      await expect(p.complete(req({ model: '$(id)' }))).rejects.toMatchObject({ code: 'VALIDATION' })
    })

    it('runs in the per-call scratch dir: -C points at it and it is the child cwd', async () => {
      const p = createCodexProvider({ tempRoot, log, locate, platform: 'darwin' })
      const res = await p.complete(req({ prompt: 'FAKE:echo' }))
      const report = JSON.parse(res.text) as EchoReport
      const i = report.argv.indexOf('-C')
      expect(i).toBeGreaterThan(-1)
      const dir = report.argv[i + 1] ?? ''
      expect(dir.startsWith(tempRoot)).toBe(true)
      // The scratch dir is removed after the call, so compare by name (macOS tmp paths are symlinked).
      expect(basename(report.cwd)).toBe(basename(dir))
      expect(report.argv).toEqual(expect.arrayContaining(['exec', '-s', 'read-only', '-']))
    })

    it('passes only allow-listed env names to the child, never values', async () => {
      const p = createCodexProvider({
        tempRoot,
        log,
        locate,
        env: {
          PATH: process.env.PATH ?? '/usr/bin',
          HOME: '/tmp/fake-home',
          OPENAI_API_KEY: 'sk-test-value-openai',
          TUTOR_LEAK_CANARY: 'canary-value',
          MY_PRIVATE_TOKEN: 'private-canary-value'
        },
        platform: 'darwin'
      })
      const res = await p.complete(req({ prompt: 'FAKE:echo' }))
      const report = JSON.parse(res.text) as EchoReport
      expect(report.envKeys).toContain('OPENAI_API_KEY')
      expect(report.envKeys).not.toContain('TUTOR_LEAK_CANARY')
      expect(report.envKeys).not.toContain('MY_PRIVATE_TOKEN')
      expect(res.text).not.toContain('canary-value')
      expect(res.text).not.toContain('sk-test-value-openai')
    })

    it('never logs env values, prompts or output bodies', async () => {
      const spy = vi.fn() as unknown as ProviderLogger
      const p = createCodexProvider({
        tempRoot,
        log: spy,
        locate,
        env: { PATH: process.env.PATH ?? '/usr/bin', HOME: '/tmp/fake-home', OPENAI_API_KEY: 'sk-logged-canary-openai' },
        platform: 'darwin'
      })
      await p.complete(req({ prompt: 'FAKE:echo 비밀 질문 본문' }))
      await p.detect()
      const logged = JSON.stringify((spy as unknown as { mock: { calls: unknown[] } }).mock.calls)
      expect(logged).not.toContain('sk-logged-canary-openai')
      expect(logged).not.toContain('비밀 질문 본문')
      expect(logged).not.toContain('FAKE:echo')
    })
  })
})
