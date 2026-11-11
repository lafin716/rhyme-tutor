/**
 * Safe child-process runner for provider CLIs.
 *
 * Rules enforced here (see docs/ARCHITECTURE.md §2):
 * - spawn() only, shell:false, windowsHide. Arguments are passed as an array.
 * - Process tree is killed on timeout / abort: POSIX via a detached process group (SIGTERM, then SIGKILL after a
 *   grace period); Windows via `taskkill /T /F`.
 * - Resolves exactly once, after the child has ended (or after the hard kill deadline).
 * - Output tails are capped; stdout is line-buffered and streamed to a callback.
 */
import { spawn, type ChildProcessByStdio } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

export const TAIL_LIMIT_CHARS = 16 * 1024
export const KILL_GRACE_MS = 1500
/** After a natural exit, how long to wait for stdio to close before cleaning up leftovers. */
const EXIT_FALLBACK_MS = 1000
/** After SIGKILL, how long to wait for the close event before resolving anyway. */
const HARD_STOP_MS = 300
const MAX_PARTIAL_LINE_CHARS = 4 * 1024 * 1024

export interface RunProcessOptions {
  /** Absolute path (or a bare command resolvable by the OS). Never a shell string. */
  file: string
  /** Static arguments. User text must never appear here (use stdin). */
  args: readonly string[]
  cwd: string
  env: NodeJS.ProcessEnv
  /** Written to stdin, then stdin is closed. Omitted => stdin is closed immediately. */
  stdin?: string
  timeoutMs: number
  signal?: AbortSignal
  /** Called for every complete stdout line (without the trailing newline). */
  onStdoutLine?: (line: string) => void
  /** Only for `.cmd`/`.bat` shims on Windows; see resolve.ts `buildSpawnPlan`. */
  windowsVerbatimArguments?: boolean
  /** Injectable for tests. Defaults to process.platform. */
  platform?: NodeJS.Platform
}

export interface RunProcessResult {
  /** null when the process was killed by a signal or never started. */
  code: number | null
  signal: NodeJS.Signals | null
  stdoutTail: string
  stderrTail: string
  durationMs: number
  timedOut: boolean
  aborted: boolean
  /** Set when the process could not be started (e.g. ENOENT). */
  spawnError: NodeJS.ErrnoException | null
}

class TailBuffer {
  private value_ = ''
  constructor(private readonly max: number) {}
  push(chunk: string): void {
    this.value_ += chunk
    if (this.value_.length > this.max) this.value_ = this.value_.slice(this.value_.length - this.max)
  }
  get value(): string {
    return this.value_
  }
}

const noop = (): void => undefined

function toErrno(err: unknown): NodeJS.ErrnoException {
  return err instanceof Error ? (err as NodeJS.ErrnoException) : new Error(String(err))
}

export function runProcess(opts: RunProcessOptions): Promise<RunProcessResult> {
  const platform = opts.platform ?? process.platform
  const isWin = platform === 'win32'
  const started = Date.now()
  const stdoutTail = new TailBuffer(TAIL_LIMIT_CHARS)
  const stderrTail = new TailBuffer(TAIL_LIMIT_CHARS)

  return new Promise<RunProcessResult>((resolve) => {
    let settled = false
    let timedOut = false
    let aborted = false
    let killStarted = false
    let spawnError: NodeJS.ErrnoException | null = null
    let exitInfo: { code: number | null; signal: NodeJS.Signals | null } | null = null
    let child: ChildProcessByStdio<Writable, Readable, Readable> | null = null
    let lineBuf = ''
    let timeoutTimer: NodeJS.Timeout | undefined
    let killTimer: NodeJS.Timeout | undefined
    let exitTimer: NodeJS.Timeout | undefined
    let hardStopTimer: NodeJS.Timeout | undefined

    const emitLine = (raw: string): void => {
      if (!opts.onStdoutLine) return
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      try {
        opts.onStdoutLine(line)
      } catch {
        // A consumer bug must neither crash the runner nor leave the promise hanging.
      }
    }

    const onAbort = (): void => {
      aborted = true
      beginKill()
    }

    const finish = (): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutTimer)
      clearTimeout(killTimer)
      clearTimeout(exitTimer)
      clearTimeout(hardStopTimer)
      opts.signal?.removeEventListener('abort', onAbort)
      if (lineBuf) {
        const rest = lineBuf
        lineBuf = ''
        emitLine(rest)
      }
      resolve({
        code: exitInfo?.code ?? null,
        signal: exitInfo?.signal ?? null,
        stdoutTail: stdoutTail.value,
        stderrTail: stderrTail.value,
        durationMs: Date.now() - started,
        timedOut,
        aborted,
        spawnError
      })
    }

    /** Signals the whole tree. Errors (group already gone) are ignored. */
    const killTree = (sig: NodeJS.Signals): void => {
      const c = child
      if (!c) return
      const pid = c.pid
      if (isWin) {
        if (pid !== undefined) {
          try {
            const killer = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
              shell: false,
              windowsHide: true,
              stdio: 'ignore'
            })
            killer.on('error', noop)
          } catch {
            // fall through to child.kill below
          }
        }
        try {
          c.kill()
        } catch {
          // already gone
        }
        return
      }
      if (pid !== undefined) {
        try {
          process.kill(-pid, sig) // detached => pgid === pid
          return
        } catch {
          // group gone; fall back to the leader below
        }
      }
      try {
        c.kill(sig)
      } catch {
        // already gone
      }
    }

    const beginKill = (): void => {
      if (killStarted || settled) return
      killStarted = true
      killTree('SIGTERM')
      killTimer = setTimeout(() => {
        killTree('SIGKILL')
        hardStopTimer = setTimeout(finish, HARD_STOP_MS)
      }, KILL_GRACE_MS)
    }

    if (opts.signal?.aborted) {
      aborted = true
      finish()
      return
    }

    try {
      child = spawn(opts.file, [...opts.args], {
        cwd: opts.cwd,
        env: opts.env,
        shell: false,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        // POSIX: own process group so the whole tree can be signalled. Windows uses taskkill /T instead.
        detached: !isWin,
        windowsVerbatimArguments: opts.windowsVerbatimArguments ?? false
      })
    } catch (err) {
      spawnError = toErrno(err)
      finish()
      return
    }

    const c = child
    c.stdout.setEncoding('utf8')
    c.stderr.setEncoding('utf8')
    c.stdout.on('error', noop)
    c.stderr.on('error', noop)
    // EPIPE on stdin is expected when the CLI exits before reading its input.
    c.stdin.on('error', noop)

    c.stdout.on('data', (chunk: string) => {
      if (settled) return
      stdoutTail.push(chunk)
      lineBuf += chunk
      let idx = lineBuf.indexOf('\n')
      while (idx !== -1) {
        const line = lineBuf.slice(0, idx)
        lineBuf = lineBuf.slice(idx + 1)
        emitLine(line)
        idx = lineBuf.indexOf('\n')
      }
      if (lineBuf.length > MAX_PARTIAL_LINE_CHARS) lineBuf = '' // runaway line: drop rather than grow unbounded
    })

    c.stderr.on('data', (chunk: string) => {
      stderrTail.push(chunk)
    })

    c.on('error', (err: NodeJS.ErrnoException) => {
      if (c.pid === undefined) {
        // Could not start at all (ENOENT, EACCES, ...).
        spawnError = err
        finish()
      } else {
        stderrTail.push(`\n[process error] ${err.code ?? 'unknown'}`)
      }
    })

    c.on('exit', (code, signal) => {
      exitInfo = { code, signal }
      // Give stdio a moment to close; if a leftover (grandchild) keeps the pipes open, kill the group and finish.
      if (!exitTimer && !settled) {
        exitTimer = setTimeout(() => {
          killTree('SIGKILL')
          finish()
        }, EXIT_FALLBACK_MS)
      }
    })

    c.on('close', (code, signal) => {
      if (!exitInfo) exitInfo = { code, signal }
      finish()
    })

    if (opts.timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        timedOut = true
        beginKill()
      }, opts.timeoutMs)
    }

    opts.signal?.addEventListener('abort', onAbort, { once: true })

    c.stdin.end(opts.stdin ?? '', 'utf8')
  })
}
