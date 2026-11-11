import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildChildEnv,
  buildSpawnPlan,
  classifyFailure,
  errorFromRun,
  messageFor,
  resolveExecutable,
  validateModelAlias,
  withScratchDir
} from '../../../src/main/providers/resolve'
import { ProviderError } from '../../../src/main/providers/types'

describe('validateModelAlias', () => {
  it('returns null for empty/absent model (CLI default)', () => {
    expect(validateModelAlias(null)).toBeNull()
    expect(validateModelAlias(undefined)).toBeNull()
    expect(validateModelAlias('')).toBeNull()
  })

  it('accepts safe aliases', () => {
    expect(validateModelAlias('sonnet')).toBe('sonnet')
    expect(validateModelAlias('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
    expect(validateModelAlias('gpt-5.4')).toBe('gpt-5.4')
  })

  it.each(['a b', 'x;rm', '$(id)', '-flag', 'a'.repeat(65), 'é'])('rejects %s with VALIDATION', (bad) => {
    expect(() => validateModelAlias(bad)).toThrow(ProviderError)
    try {
      validateModelAlias(bad)
    } catch (e) {
      expect((e as ProviderError).code).toBe('VALIDATION')
    }
  })
})

describe('classifyFailure / messageFor', () => {
  it('maps auth hints', () => {
    expect(classifyFailure('Not logged in · Please run /login')).toBe('PROVIDER_AUTH_REQUIRED')
    expect(classifyFailure('HTTP 401 unauthorized')).toBe('PROVIDER_AUTH_REQUIRED')
  })

  it('maps rate hints', () => {
    expect(classifyFailure('Rate limit reached')).toBe('PROVIDER_RATE_LIMITED')
    expect(classifyFailure('429 Too Many Requests')).toBe('PROVIDER_RATE_LIMITED')
    expect(classifyFailure('usage limit hit')).toBe('PROVIDER_RATE_LIMITED')
  })

  it('defaults to PROVIDER_FAILED', () => {
    expect(classifyFailure('something odd')).toBe('PROVIDER_FAILED')
  })

  it('provides Korean messages for every mapped code', () => {
    expect(messageFor('PROVIDER_AUTH_REQUIRED')).toMatch(/로그인/)
    expect(messageFor('PROVIDER_TIMEOUT')).toMatch(/시간/)
    expect(messageFor('PROVIDER_CANCELLED')).toMatch(/취소/)
  })
})

describe('errorFromRun', () => {
  const base = {
    code: 0 as number | null,
    signal: null,
    stdoutTail: '',
    stderrTail: '',
    durationMs: 1,
    timedOut: false,
    aborted: false,
    spawnError: null
  }

  it('returns null for a clean exit', () => {
    expect(errorFromRun({ ...base })).toBeNull()
  })

  it('maps abort, timeout, and missing executable', () => {
    expect(errorFromRun({ ...base, aborted: true })?.code).toBe('PROVIDER_CANCELLED')
    expect(errorFromRun({ ...base, timedOut: true })?.code).toBe('PROVIDER_TIMEOUT')
    const enoent = Object.assign(new Error('x'), { code: 'ENOENT' })
    expect(errorFromRun({ ...base, spawnError: enoent })?.code).toBe('PROVIDER_NOT_INSTALLED')
    const other = Object.assign(new Error('x'), { code: 'EPERM' })
    expect(errorFromRun({ ...base, spawnError: other })?.code).toBe('PROVIDER_FAILED')
  })

  it('classifies non-zero exits by their output text', () => {
    expect(errorFromRun({ ...base, code: 1, stderrTail: 'please login' })?.code).toBe('PROVIDER_AUTH_REQUIRED')
    expect(errorFromRun({ ...base, code: 2, stdoutTail: 'nope' })?.code).toBe('PROVIDER_FAILED')
  })
})

describe('buildSpawnPlan', () => {
  it('passes through unchanged on POSIX', () => {
    const plan = buildSpawnPlan('/usr/bin/claude', ['-p', ''], { platform: 'darwin' })
    expect(plan).toEqual({ file: '/usr/bin/claude', args: ['-p', ''], windowsVerbatimArguments: false })
  })

  it('wraps .cmd shims on Windows through ComSpec with verbatim args', () => {
    const plan = buildSpawnPlan('C:\\npm\\codex.cmd', ['exec', '--json'], {
      platform: 'win32',
      env: { ComSpec: 'C:\\Windows\\system32\\cmd.exe' }
    })
    expect(plan.file).toBe('C:\\Windows\\system32\\cmd.exe')
    expect(plan.windowsVerbatimArguments).toBe(true)
    // Whole command line is one quoted string: every token quoted, outer quotes for `cmd /s /c`.
    const inner = '"C:\\npm\\codex.cmd" "exec" "--json"'
    expect(plan.args).toEqual(['/d', '/s', '/c', `"${inner}"`])
  })

  it('quotes each Windows shim argument so a path with spaces stays one argument', () => {
    const plan = buildSpawnPlan('C:\\npm\\codex.cmd', ['-C', 'C:\\Users\\Me Name\\Temp\\call-1', '--tools', ''], {
      platform: 'win32',
      env: {}
    })
    expect(plan.args[3]).toBe('""C:\\npm\\codex.cmd" "-C" "C:\\Users\\Me Name\\Temp\\call-1" "--tools" """')
  })

  it('rejects cmd metacharacters in Windows shim arguments', () => {
    expect(() =>
      buildSpawnPlan('C:\\npm\\codex.cmd', ['a&calc'], { platform: 'win32', env: {} })
    ).toThrow(ProviderError)
  })

  it('rejects double quotes in Windows shim arguments (they cannot be escaped safely here)', () => {
    expect(() => buildSpawnPlan('C:\\npm\\codex.cmd', ['a"b'], { platform: 'win32', env: {} })).toThrow(ProviderError)
    try {
      buildSpawnPlan('C:\\npm\\codex.cmd', ['a"b'], { platform: 'win32', env: {} })
    } catch (e) {
      expect((e as ProviderError).code).toBe('VALIDATION')
    }
  })

  it('rejects a trailing backslash in Windows shim arguments', () => {
    expect(() => buildSpawnPlan('C:\\npm\\codex.cmd', ['C:\\tmp\\'], { platform: 'win32', env: {} })).toThrow(ProviderError)
  })

  it('allows parentheses in Windows paths such as Program Files (x86)', () => {
    const plan = buildSpawnPlan('C:\\Program Files (x86)\\nodejs\\codex.cmd', ['-C', 'C:\\Users\\Me\\(tmp)'], {
      platform: 'win32',
      env: {}
    })
    expect(plan.args[3]).toBe('""C:\\Program Files (x86)\\nodejs\\codex.cmd" "-C" "C:\\Users\\Me\\(tmp)""')
  })

  it('allows apostrophes in Windows paths such as a user name with an apostrophe', () => {
    const plan = buildSpawnPlan('C:\\npm\\codex.cmd', ['-C', "C:\\Users\\O'Brien\\call-1"], { platform: 'win32', env: {} })
    expect(plan.args[3]).toBe(`""C:\\npm\\codex.cmd" "-C" "C:\\Users\\O'Brien\\call-1""`)
  })

  it.each(['a%PATH%', 'a^b', 'a|b', 'a<b', 'a>b', 'a!b', 'a&b'])('rejects cmd special characters in %s', (bad) => {
    expect(() => buildSpawnPlan('C:\\npm\\codex.cmd', [bad], { platform: 'win32', env: {} })).toThrow(ProviderError)
  })

  it('does not wrap a .exe on Windows', () => {
    const plan = buildSpawnPlan('C:\\bin\\claude.exe', ['-p'], { platform: 'win32', env: {} })
    expect(plan.file).toBe('C:\\bin\\claude.exe')
    expect(plan.windowsVerbatimArguments).toBe(false)
  })
})

describe('buildChildEnv', () => {
  const parent = {
    PATH: '/usr/bin',
    HOME: '/home/u',
    LANG: 'ko_KR.UTF-8',
    OPENAI_API_KEY: 'sk-test-openai',
    ANTHROPIC_API_KEY: 'sk-test-anthropic',
    CODEX_HOME: '/home/u/codex-home',
    TUTOR_LEAK_CANARY: 'canary-value',
    MY_PRIVATE_TOKEN: 'private-canary',
    GITHUB_TOKEN: 'gh-canary',
    UNDEFINED_VALUE: undefined
  }

  it('keeps only allow-listed names and their values', () => {
    const out = buildChildEnv(parent, 'darwin')
    expect(out).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/u',
      LANG: 'ko_KR.UTF-8',
      OPENAI_API_KEY: 'sk-test-openai',
      ANTHROPIC_API_KEY: 'sk-test-anthropic',
      CODEX_HOME: '/home/u/codex-home'
    })
  })

  it('drops unrelated variables, including secret-looking ones', () => {
    const out = buildChildEnv(parent, 'darwin')
    expect(out).not.toHaveProperty('TUTOR_LEAK_CANARY')
    expect(out).not.toHaveProperty('MY_PRIVATE_TOKEN')
    expect(out).not.toHaveProperty('GITHUB_TOKEN')
    expect(out).not.toHaveProperty('UNDEFINED_VALUE')
  })

  it('matches Windows names case-insensitively and keeps the original key spelling', () => {
    const out = buildChildEnv({ path: 'C:\\Windows', systemroot: 'C:\\Windows', Secret: 'x' }, 'win32')
    expect(out).toEqual({ path: 'C:\\Windows', systemroot: 'C:\\Windows' })
  })

  it('does not treat lowercase names as allowed on POSIX', () => {
    expect(buildChildEnv({ path: '/x' }, 'darwin')).toEqual({})
  })

  it('does not mutate the parent environment', () => {
    const copy = { ...parent }
    buildChildEnv(parent, 'darwin')
    expect(parent).toEqual(copy)
  })

  it('passes proxy variables in both upper- and lower-case on POSIX', () => {
    const out = buildChildEnv(
      { HTTP_PROXY: 'http://p:8080', https_proxy: 'http://p:8443', NO_PROXY: 'localhost', all_proxy: 'socks5://s' },
      'darwin'
    )
    expect(out).toEqual({
      HTTP_PROXY: 'http://p:8080',
      https_proxy: 'http://p:8443',
      NO_PROXY: 'localhost',
      all_proxy: 'socks5://s'
    })
  })

  it('passes TLS CA, XDG and provider auth/config names through', () => {
    const names = [
      'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'REQUESTS_CA_BUNDLE',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
      'XDG_CACHE_HOME',
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_USE_BEDROCK',
      'CLAUDE_CODE_USE_VERTEX',
      'ANTHROPIC_VERTEX_PROJECT_ID',
      'CLOUD_ML_REGION',
      'GOOGLE_APPLICATION_CREDENTIALS',
      'OPENAI_BASE_URL'
    ]
    const input: Record<string, string> = {}
    for (const n of names) input[n] = `value-of-${n}`
    expect(buildChildEnv(input, 'darwin')).toEqual(input)
  })

  it('passes the explicitly listed AWS names', () => {
    const names = [
      'AWS_REGION',
      'AWS_DEFAULT_REGION',
      'AWS_PROFILE',
      'AWS_CONFIG_FILE',
      'AWS_SHARED_CREDENTIALS_FILE',
      'AWS_ACCESS_KEY_ID',
      'AWS_SECRET_ACCESS_KEY',
      'AWS_SESSION_TOKEN',
      'AWS_BEARER_TOKEN_BEDROCK'
    ]
    const input: Record<string, string> = {}
    for (const n of names) input[n] = `value-of-${n}`
    expect(buildChildEnv(input, 'darwin')).toEqual(input)
  })

  it('drops an unlisted AWS_* name (no prefix matching)', () => {
    const out = buildChildEnv({ AWS_FOO_UNLISTED: 'x', AWS_REGION: 'ap-northeast-2' }, 'darwin')
    expect(out).toEqual({ AWS_REGION: 'ap-northeast-2' })
    expect(out).not.toHaveProperty('AWS_FOO_UNLISTED')
  })

  it('matches listed AWS names case-insensitively on Windows only', () => {
    expect(buildChildEnv({ aws_region: 'us-east-1' }, 'win32')).toEqual({ aws_region: 'us-east-1' })
    expect(buildChildEnv({ aws_region: 'us-east-1' }, 'darwin')).toEqual({})
  })

  it('still drops unlisted canaries next to the newly allowed names', () => {
    const out = buildChildEnv(
      { HTTPS_PROXY: 'http://p', TUTOR_LEAK_CANARY: 'canary-value', GITHUB_TOKEN: 'gh-canary', NOT_AWS_KEY: 'x' },
      'darwin'
    )
    expect(out).toEqual({ HTTPS_PROXY: 'http://p' })
  })
})

describe('resolveExecutable', () => {
  let root: string
  let bin: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'resolve-test-'))
    bin = join(root, 'bin')
    mkdirSync(bin)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('follows symlinks to regular files', () => {
    const target = join(root, 'real-claude')
    writeFileSync(target, '#!/bin/sh\n')
    chmodSync(target, 0o755)
    symlinkSync(target, join(bin, 'claude'))
    const found = resolveExecutable('claude', { env: { PATH: bin }, platform: 'darwin', home: root })
    expect(found).toBe(join(bin, 'claude'))
  })

  it('ignores directories that happen to share the name', () => {
    mkdirSync(join(bin, 'claude'))
    expect(resolveExecutable('claude', { env: { PATH: bin }, platform: 'darwin', home: root })).toBeNull()
  })

  it('ignores relative PATH entries', () => {
    writeFileSync(join(bin, 'claude'), '')
    expect(resolveExecutable('claude', { env: { PATH: 'relative/dir' }, platform: 'darwin', home: root })).toBeNull()
  })
})

describe('withScratchDir', () => {
  it('creates a per-call directory and removes it afterwards', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'scratch-test-'))
    try {
      let seen = ''
      await withScratchDir(tempRoot, async (dir) => {
        seen = dir
        writeFileSync(join(dir, 'x.txt'), 'x')
      })
      const { existsSync } = await import('node:fs')
      expect(seen.startsWith(tempRoot)).toBe(true)
      expect(existsSync(seen)).toBe(false)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })

  it('removes the directory even when fn throws', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'scratch-test-'))
    try {
      let seen = ''
      await expect(
        withScratchDir(tempRoot, async (dir) => {
          seen = dir
          throw new Error('boom')
        })
      ).rejects.toThrow('boom')
      const { existsSync } = await import('node:fs')
      expect(existsSync(seen)).toBe(false)
    } finally {
      rmSync(tempRoot, { recursive: true, force: true })
    }
  })
})
