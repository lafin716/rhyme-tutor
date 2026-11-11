/**
 * Codex CLI adapter. Uses `codex exec --json` in read-only, ephemeral mode.
 * System instructions and the user prompt are both sent on stdin (never argv).
 * Codex does not token-stream here: the whole agent message is delivered once via onDelta.
 */
import type { ProviderCapabilities, ProviderInfo } from '@shared/domain'
import type { CliProviderDeps } from './claude-code'
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
  withScratchDir
} from './resolve'
import { ProviderError, type AIProvider, type CompletionRequest, type CompletionResult } from './types'

export const CODEX_CAPABILITIES: ProviderCapabilities = { tokenStreaming: false, cancel: true, structuredOutput: true }

/** Fixed flags. Keep in sync with docs/ARCHITECTURE.md §3. `-` makes codex read the prompt from stdin. */
export const CODEX_BASE_ARGS: readonly string[] = [
  'exec',
  '--json',
  '--skip-git-repo-check',
  '--ephemeral',
  '-s',
  'read-only'
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

/** Builds the stdin payload. System text is wrapped in a delimited section so it stays separate from the user turn. */
export function composeCodexInput(system: string, prompt: string): string {
  return `<system_instructions>\n${system}\n</system_instructions>\n\n<user_message>\n${prompt}\n</user_message>\n`
}

/** `codex login status`: exit 0 with "Logged in" => true; "not logged in" or non-zero => false; otherwise unknown. */
export function parseLoginStatus(output: string, exitCode: number | null): boolean | null {
  const t = output.toLowerCase()
  if (exitCode === 0 && t.includes('logged in') && !t.includes('not logged in')) return true
  if (t.includes('not logged in') || exitCode !== 0) return false
  return null
}

export function createCodexProvider(deps: CliProviderDeps): AIProvider {
  const env = deps.env ?? process.env
  const platform = deps.platform ?? process.platform
  const locate = deps.locate ?? defaultLocator({ env, platform })
  // Only allow-listed variables reach the codex child (see CHILD_ENV_ALLOWLIST).
  const childEnv = buildChildEnv(env, platform)
  const log = deps.log
  const id = 'codex' as const
  const displayName = 'Codex CLI'

  return {
    id,
    displayName,
    capabilities: CODEX_CAPABILITIES,

    async detect(): Promise<ProviderInfo> {
      const base = { id, displayName, experimental: true, capabilities: CODEX_CAPABILITIES }
      const loc = locate('codex')
      if (!loc) {
        return {
          ...base,
          installed: false,
          executablePath: null,
          version: null,
          authenticated: null,
          ready: false,
          message: 'Codex CLI가 설치되어 있지 않아요. 설치한 뒤 터미널에서 codex login으로 로그인해 주세요.'
        }
      }
      let version: string | null = null
      let authenticated: boolean | null = null
      try {
        const v = await runQuick(loc, ['--version'], { env: childEnv, platform })
        const m = /\d+\.\d+\.\d+/.exec(v.stdoutTail)
        version = v.code === 0 && m ? m[0] : null
        const s = await runQuick(loc, ['login', 'status'], { env: childEnv, platform })
        authenticated = parseLoginStatus(`${s.stdoutTail}\n${s.stderrTail}`, s.code)
      } catch (err) {
        log('warn', 'codex detect failed', { reason: err instanceof Error ? err.name : 'unknown' })
      }
      const message =
        authenticated === true
          ? '사용할 준비가 됐어요.'
          : authenticated === false
            ? '로그인이 필요해요. 터미널에서 codex login을 실행해 주세요.'
            : '로그인 상태를 확인하지 못했어요. 그래도 사용해 볼 수 있어요.'
      return {
        ...base,
        installed: true,
        executablePath: loc.file,
        version,
        authenticated,
        ready: authenticated !== false,
        message
      }
    },

    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const model = validateModelAlias(req.model)
      if (req.signal.aborted) throw new ProviderError('PROVIDER_CANCELLED', MESSAGES_KO.cancelled)
      const loc = locate('codex')
      if (!loc) throw new ProviderError('PROVIDER_NOT_INSTALLED', MESSAGES_KO.notInstalled)

      const started = Date.now()
      return withScratchDir(deps.tempRoot, async (dir) => {
        // `-C` pins codex's working root to the empty per-call scratch dir (also the child cwd).
        const args = [...CODEX_BASE_ARGS, '-C', dir]
        if (model) args.push('-m', model)
        args.push('-')
        const plan = buildSpawnPlan(loc.file, [...loc.prefixArgs, ...args], { env: childEnv, platform })

        // Object holder avoids TypeScript narrowing closure-assigned lets to null.
        const acc: { messages: string[]; fatal: string | null } = { messages: [], fatal: null }
        const res = await runProcess({
          file: plan.file,
          args: plan.args,
          cwd: dir,
          env: childEnv,
          stdin: composeCodexInput(req.system, req.prompt),
          timeoutMs: req.timeoutMs,
          signal: req.signal,
          windowsVerbatimArguments: plan.windowsVerbatimArguments,
          platform,
          onStdoutLine: (line) => {
            const ev = parseLine(line)
            if (!ev) return
            if (ev.type === 'item.completed' && isObj(ev.item)) {
              if (ev.item.type === 'agent_message' && typeof ev.item.text === 'string') acc.messages.push(ev.item.text)
              // Non-agent items (including non-fatal `error` items such as config warnings) are ignored.
            } else if (ev.type === 'turn.failed') {
              const msg = isObj(ev.error) && typeof ev.error.message === 'string' ? ev.error.message : 'turn failed'
              acc.fatal = msg
            }
            // Top-level `error` events are non-fatal (e.g. config warnings) and intentionally ignored.
          }
        })

        const runErr = errorFromRun(res, acc.fatal ?? '')
        if (runErr) {
          log('warn', 'codex call failed', { code: runErr.code })
          throw runErr
        }
        if (acc.fatal !== null) {
          const code = classifyFailure(acc.fatal)
          log('warn', 'codex turn failed', { code })
          throw new ProviderError(code, messageFor(code))
        }
        const text = acc.messages.join('\n\n').trim()
        if (!text) {
          log('warn', 'codex returned empty output')
          throw new ProviderError('PROVIDER_FAILED', MESSAGES_KO.failed, 'empty output')
        }
        req.onDelta?.(text)
        const durationMs = Date.now() - started
        log('info', 'codex call ok', { durationMs, task: req.task })
        return { text, durationMs }
      })
    }
  }
}
