/**
 * Claude Code adapter. Uses the non-interactive `claude -p` mode with stream-json output.
 * The prompt is written to stdin; the system prompt goes to a 0600 temp file (never argv).
 */
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProviderCapabilities, ProviderInfo } from '@shared/domain'
import { runProcess } from './process'
import {
  buildChildEnv,
  buildSpawnPlan,
  classifyFailure,
  defaultLocator,
  errorFromRun,
  messageFor,
  MESSAGES_KO,
  runQuick,
  validateModelAlias,
  withScratchDir,
  type CliLocate
} from './resolve'
import { ProviderError, type AIProvider, type CompletionRequest, type CompletionResult, type ProviderLogger } from './types'

export interface CliProviderDeps {
  /** App-owned scratch root for per-call directories. */
  tempRoot: string
  log: ProviderLogger
  /** Test seam: replaces executable lookup. Defaults to PATH + well-known dirs. */
  locate?: CliLocate
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export const CLAUDE_CAPABILITIES: ProviderCapabilities = { tokenStreaming: true, cancel: true, structuredOutput: true }

/** Fixed flags. Keep in sync with docs/ARCHITECTURE.md §3. `--tools ""` disables all built-in tools. */
export const CLAUDE_BASE_ARGS: readonly string[] = [
  '-p',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--tools',
  '',
  '--no-session-persistence',
  '--setting-sources',
  'project',
  '--strict-mcp-config',
  '--disable-slash-commands'
]

type Json = Record<string, unknown>

function isObj(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function parseLine(line: string): Json | null {
  const t = line.trim()
  if (!t.startsWith('{')) return null
  try {
    const v: unknown = JSON.parse(t)
    return isObj(v) ? v : null
  } catch {
    return null
  }
}

/** `stream_event` -> `content_block_delta` -> `text_delta`. Other events are ignored. */
function textDelta(ev: Json): string | null {
  const e = ev.event
  if (!isObj(e) || e.type !== 'content_block_delta') return null
  const d = e.delta
  if (!isObj(d) || d.type !== 'text_delta' || typeof d.text !== 'string') return null
  return d.text
}

export function createClaudeCodeProvider(deps: CliProviderDeps): AIProvider {
  const env = deps.env ?? process.env
  const platform = deps.platform ?? process.platform
  const locate = deps.locate ?? defaultLocator({ env, platform })
  // Only allow-listed variables reach the claude child (see CHILD_ENV_ALLOWLIST).
  const childEnv = buildChildEnv(env, platform)
  const log = deps.log
  const id = 'claude-code' as const
  const displayName = 'Claude Code'

  return {
    id,
    displayName,
    capabilities: CLAUDE_CAPABILITIES,

    async detect(): Promise<ProviderInfo> {
      const base = { id, displayName, experimental: true, capabilities: CLAUDE_CAPABILITIES }
      const loc = locate('claude')
      if (!loc) {
        return {
          ...base,
          installed: false,
          executablePath: null,
          version: null,
          authenticated: null,
          ready: false,
          message: 'Claude Code가 설치되어 있지 않아요. 설치한 뒤 터미널에서 claude를 실행해 로그인해 주세요.'
        }
      }
      let version: string | null = null
      let authenticated: boolean | null = null
      try {
        const v = await runQuick(loc, ['--version'], { env: childEnv, platform })
        const m = /\d+\.\d+\.\d+/.exec(v.stdoutTail)
        version = v.code === 0 && m ? m[0] : null
        const a = await runQuick(loc, ['auth', 'status'], { env: childEnv, platform })
        authenticated = parseAuthStatus(a.stdoutTail, a.code)
      } catch (err) {
        log('warn', 'claude-code detect failed', { reason: err instanceof Error ? err.name : 'unknown' })
      }
      const ready = authenticated !== false
      const message =
        authenticated === true
          ? '사용할 준비가 됐어요.'
          : authenticated === false
            ? '로그인이 필요해요. 터미널에서 claude를 실행해 로그인해 주세요.'
            : '로그인 상태를 확인하지 못했어요. 그래도 사용해 볼 수 있어요.'
      return {
        ...base,
        installed: true,
        executablePath: loc.file,
        version,
        authenticated,
        ready,
        message
      }
    },

    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const model = validateModelAlias(req.model)
      if (req.signal.aborted) throw new ProviderError('PROVIDER_CANCELLED', MESSAGES_KO.cancelled)
      const loc = locate('claude')
      if (!loc) throw new ProviderError('PROVIDER_NOT_INSTALLED', MESSAGES_KO.notInstalled)

      const started = Date.now()
      return withScratchDir(deps.tempRoot, async (dir) => {
        const sysFile = join(dir, 'system.txt')
        await writeFile(sysFile, req.system, { encoding: 'utf8', mode: 0o600 })
        const args = [...CLAUDE_BASE_ARGS, '--system-prompt-file', sysFile]
        if (model) args.push('--model', model)
        const plan = buildSpawnPlan(loc.file, [...loc.prefixArgs, ...args], { env: childEnv, platform })

        // Object holder: closures mutate these, and plain `let` would be narrowed to null by TypeScript.
        const acc: { deltas: string; resultText: string | null; resultError: string | null } = {
          deltas: '',
          resultText: null,
          resultError: null
        }
        const res = await runProcess({
          file: plan.file,
          args: plan.args,
          // cwd is the empty per-call scratch dir: no project files to read, and no project settings to load.
          cwd: dir,
          env: childEnv,
          stdin: req.prompt,
          timeoutMs: req.timeoutMs,
          signal: req.signal,
          windowsVerbatimArguments: plan.windowsVerbatimArguments,
          platform,
          onStdoutLine: (line) => {
            const ev = parseLine(line)
            if (!ev) return
            if (ev.type === 'stream_event') {
              const d = textDelta(ev)
              if (d) {
                acc.deltas += d
                req.onDelta?.(d)
              }
            } else if (ev.type === 'result') {
              if (typeof ev.result === 'string') acc.resultText = ev.result
              if (ev.is_error === true) acc.resultError = typeof ev.result === 'string' ? ev.result : 'error'
            }
          }
        })

        const runErr = errorFromRun(res, acc.resultError ?? '')
        if (runErr) {
          log('warn', 'claude-code call failed', { code: runErr.code })
          throw runErr
        }
        if (acc.resultError !== null) {
          const code = classifyFailure(acc.resultError)
          log('warn', 'claude-code returned error result', { code })
          throw new ProviderError(code, messageFor(code))
        }
        const text = (acc.resultText ?? acc.deltas).trim()
        if (!text) {
          log('warn', 'claude-code returned empty output')
          throw new ProviderError('PROVIDER_FAILED', MESSAGES_KO.failed, 'empty output')
        }
        if (acc.deltas === '' && req.onDelta) req.onDelta(text)
        const durationMs = Date.now() - started
        log('info', 'claude-code call ok', { durationMs, task: req.task })
        return { text, durationMs }
      })
    }
  }
}

/**
 * `claude auth status` prints JSON with `loggedIn`. Unknown shapes return null (cannot tell).
 */
export function parseAuthStatus(stdout: string, exitCode: number | null): boolean | null {
  try {
    const v: unknown = JSON.parse(stdout.trim())
    if (isObj(v) && typeof v.loggedIn === 'boolean') return v.loggedIn
  } catch {
    // not JSON
  }
  return exitCode === 0 ? null : false
}
