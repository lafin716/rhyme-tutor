/**
 * Executable resolution, spawn planning, argument/model validation and error mapping shared by CLI adapters.
 */
import { statSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import { MODEL_ALIAS_RE, type AppErrorCode } from '@shared/domain'
import { runProcess, type RunProcessResult } from './process'
import { ProviderError } from './types'

export type CliName = 'claude' | 'codex'

/** Where a CLI lives. `prefixArgs` is only used by tests (run a fixture script via node). */
export interface CliLocator {
  file: string
  prefixArgs: readonly string[]
}
export type CliLocate = (name: CliName) => CliLocator | null

export interface ResolveOptions {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  home?: string
}

/** Model alias allowed on the command line (see AGENTS/ARCHITECTURE: regex-validated). */
// First character must not be '-' so a model value can never be parsed as a CLI option.
/**
 * Windows .cmd/.bat shims go through cmd.exe, so args are restricted to a conservative charset.
 * Each arg is wrapped in double quotes before it reaches cmd.exe, so `"` itself is rejected and
 * a trailing backslash is rejected (it would escape the closing quote for the MSVCRT argv parser).
 */
// ( ) [ ] ' , ; are literal inside a double-quoted token under `cmd /d /s /c`, so they are allowed (e.g. "Program Files (x86)").
const WIN_ARG_RE = /^[A-Za-z0-9_\-.:/\\ =[\]()',;]*$/
const WIN_FORBIDDEN_RE = /[&|<>^%!]/
const WIN_TRAILING_BACKSLASH_RE = /\\$/

/**
 * Environment variables passed to the CLI children. Everything else is dropped so unrelated secrets
 * in the parent environment never reach the CLI. Values are passed through only; they are never read
 * or logged here. Provider auth/config names are the ones the CLIs document for API keys and config dirs.
 */
export const CHILD_ENV_ALLOWLIST: readonly string[] = [
  // Basic process and locale.
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  // Proxies. POSIX tools read both the upper- and lower-case spellings.
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'all_proxy',
  // Custom CA bundles (corporate TLS interception).
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'REQUESTS_CA_BUNDLE',
  // XDG config, data and cache directories.
  'XDG_CONFIG_HOME',
  'XDG_DATA_HOME',
  'XDG_CACHE_HOME',
  // Claude Code auth, config and provider selection (values passed through only).
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CONFIG_DIR',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'CLOUD_ML_REGION',
  'GOOGLE_APPLICATION_CREDENTIALS',
  // Codex auth and config.
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'CODEX_HOME',
  // AWS (Bedrock) region, profile, config and credentials. Listed explicitly; no prefix matching.
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

const CHILD_ENV_ALLOWLIST_SET: ReadonlySet<string> = new Set(CHILD_ENV_ALLOWLIST)
const CHILD_ENV_ALLOWLIST_UPPER: ReadonlySet<string> = new Set(CHILD_ENV_ALLOWLIST.map((n) => n.toUpperCase()))

function isAllowedEnvName(key: string, win: boolean): boolean {
  return win ? CHILD_ENV_ALLOWLIST_UPPER.has(key.toUpperCase()) : CHILD_ENV_ALLOWLIST_SET.has(key)
}

/**
 * Returns a new env object containing only allow-listed names (exact match).
 * Windows names match case-insensitively. Values are copied as-is and never read, logged or inspected.
 */
export function buildChildEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const win = platform === 'win32'
  const out: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue
    if (isAllowedEnvName(key, win)) out[key] = value
  }
  return out
}

/** Korean, user-facing messages. */
export const MESSAGES_KO = {
  authRequired: '로그인이 필요해요. 터미널에서 CLI에 로그인한 뒤 다시 시도해 주세요.',
  rateLimited: '사용량 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',
  failed: 'AI 응답을 받지 못했어요. 다시 시도해 주세요.',
  timeout: 'AI 응답 시간이 초과됐어요.',
  cancelled: '요청을 취소했어요.',
  notInstalled: 'CLI가 설치되어 있지 않아요.',
  badModel: '모델 이름 형식이 올바르지 않아요.',
  badArgs: 'CLI 인자에 허용되지 않는 문자가 있어요.'
} as const

/** Returns a validated model alias, or null for "CLI default". Throws VALIDATION on bad input. */
export function validateModelAlias(model: string | null | undefined): string | null {
  if (model === undefined || model === null || model === '') return null
  if (!MODEL_ALIAS_RE.test(model)) throw new ProviderError('VALIDATION', MESSAGES_KO.badModel)
  return model
}

/** Directories searched after PATH. */
export function candidateDirs(opts: ResolveOptions = {}): string[] {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const home = opts.home ?? homedir()
  const pathDirs = (env.PATH ?? '').split(delimiter).filter(Boolean)
  const extra =
    platform === 'win32'
      ? [...(env.APPDATA ? [join(env.APPDATA, 'npm')] : []), join(home, '.bun', 'bin'), join(home, '.volta', 'bin')]
      : [
          join(home, '.local', 'bin'),
          '/opt/homebrew/bin',
          '/usr/local/bin',
          join(home, '.npm-global', 'bin'),
          join(home, '.bun', 'bin'),
          join(home, '.volta', 'bin')
        ]
  return [...new Set([...pathDirs, ...extra])].filter((d) => isAbsolute(d))
}

function isRegularFile(p: string): boolean {
  try {
    return statSync(p).isFile() // follows symlinks
  } catch {
    return false
  }
}

/** Absolute path to an existing regular file for the CLI, or null. Windows prefers .exe over .cmd/.bat. */
export function resolveExecutable(name: CliName, opts: ResolveOptions = {}): string | null {
  const platform = opts.platform ?? process.platform
  const names = platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, `${name}.bat`] : [name]
  const dirs = candidateDirs(opts)
  for (const n of names) {
    for (const dir of dirs) {
      const full = join(dir, n)
      if (isAbsolute(full) && isRegularFile(full)) return full
    }
  }
  return null
}

export interface SpawnPlan {
  file: string
  args: string[]
  windowsVerbatimArguments: boolean
}

/**
 * Builds the actual spawn target. On Windows, .cmd/.bat shims are run through ComSpec with /d /s /c
 * and verbatim arguments; everything else is spawned directly.
 */
export function buildSpawnPlan(exe: string, args: readonly string[], opts: ResolveOptions = {}): SpawnPlan {
  const platform = opts.platform ?? process.platform
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(exe)) {
    return { file: exe, args: [...args], windowsVerbatimArguments: false }
  }
  if (WIN_FORBIDDEN_RE.test(exe) || !WIN_ARG_RE.test(exe)) throw new ProviderError('VALIDATION', MESSAGES_KO.badArgs)
  for (const a of args) {
    if (!WIN_ARG_RE.test(a) || WIN_FORBIDDEN_RE.test(a) || WIN_TRAILING_BACKSLASH_RE.test(a)) {
      throw new ProviderError('VALIDATION', MESSAGES_KO.badArgs)
    }
  }
  // Every token is quoted so paths containing spaces stay one argument. The whole command line is then
  // wrapped in one more pair of quotes, which is the form `cmd /s /c` expects.
  const inner = [exe, ...args].map((t) => `"${t}"`).join(' ')
  const comspec = (opts.env ?? process.env).ComSpec || 'cmd.exe'
  return { file: comspec, args: ['/d', '/s', '/c', `"${inner}"`], windowsVerbatimArguments: true }
}

const AUTH_HINTS = ['not logged in', 'login', 'authenticate', '401', '/login']
const RATE_HINTS = ['rate limit', 'usage limit', '429', 'quota']

/** Maps CLI output text to a stable error code. Only used for non-zero exits and error events. */
export function classifyFailure(text: string): AppErrorCode {
  const t = text.toLowerCase()
  if (AUTH_HINTS.some((h) => t.includes(h))) return 'PROVIDER_AUTH_REQUIRED'
  if (RATE_HINTS.some((h) => t.includes(h))) return 'PROVIDER_RATE_LIMITED'
  return 'PROVIDER_FAILED'
}

export function messageFor(code: AppErrorCode): string {
  switch (code) {
    case 'PROVIDER_AUTH_REQUIRED':
      return MESSAGES_KO.authRequired
    case 'PROVIDER_RATE_LIMITED':
      return MESSAGES_KO.rateLimited
    case 'PROVIDER_TIMEOUT':
      return MESSAGES_KO.timeout
    case 'PROVIDER_CANCELLED':
      return MESSAGES_KO.cancelled
    case 'PROVIDER_NOT_INSTALLED':
      return MESSAGES_KO.notInstalled
    default:
      return MESSAGES_KO.failed
  }
}

/**
 * Converts a finished process run into a ProviderError, or null when the process itself ran to completion
 * with exit code 0 (the caller then validates the output). `extraText` is extra output text to classify
 * (e.g. an error message parsed from stdout).
 */
export function errorFromRun(res: RunProcessResult, extraText = ''): ProviderError | null {
  if (res.aborted) return new ProviderError('PROVIDER_CANCELLED', MESSAGES_KO.cancelled)
  if (res.timedOut) return new ProviderError('PROVIDER_TIMEOUT', MESSAGES_KO.timeout)
  if (res.spawnError) {
    const code = res.spawnError.code
    if (code === 'ENOENT' || code === 'EACCES') return new ProviderError('PROVIDER_NOT_INSTALLED', MESSAGES_KO.notInstalled)
    return new ProviderError('PROVIDER_FAILED', MESSAGES_KO.failed, `spawn:${code ?? 'unknown'}`)
  }
  if (res.code !== 0) {
    const code = classifyFailure(`${res.stderrTail}\n${res.stdoutTail}\n${extraText}`)
    return new ProviderError(code, messageFor(code), `exit=${res.code ?? 'null'} signal=${res.signal ?? 'none'}`)
  }
  return null
}

/** Default locator: PATH + well-known install dirs. */
export function defaultLocator(opts: ResolveOptions = {}): CliLocate {
  return (name) => {
    const file = resolveExecutable(name, opts)
    return file ? { file, prefixArgs: [] } : null
  }
}

/** Short official command (`--version`, `auth status`, ...) with no prompt. Never throws for CLI failures. */
export async function runQuick(
  loc: CliLocator,
  args: readonly string[],
  opts: ResolveOptions & { timeoutMs?: number } = {}
): Promise<RunProcessResult> {
  const env = opts.env ?? process.env
  const platform = opts.platform ?? process.platform
  const plan = buildSpawnPlan(loc.file, [...loc.prefixArgs, ...args], { ...opts, env, platform })
  return runProcess({
    file: plan.file,
    args: plan.args,
    cwd: tmpdir(),
    env,
    stdin: '',
    timeoutMs: opts.timeoutMs ?? 10_000,
    windowsVerbatimArguments: plan.windowsVerbatimArguments,
    platform
  })
}

/** Runs `fn` in a fresh per-call scratch directory that is removed afterwards (even on failure). */
export async function withScratchDir<T>(tempRoot: string, fn: (dir: string) => Promise<T>): Promise<T> {
  await mkdir(tempRoot, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(tempRoot, 'call-'))
  try {
    return await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
}
