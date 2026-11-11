import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { runProcess } from '../../../src/main/providers/process'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))
const ECHO = join(FIXTURES, 'echo-stdin.mjs')
const HANG = join(FIXTURES, 'hang-with-child.mjs')

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function waitUntil(pred: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (pred()) return true
    await new Promise((r) => setTimeout(r, 50))
  }
  return pred()
}

describe('runProcess', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'proc-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('passes stdin verbatim and args as an array (no shell interpretation)', async () => {
    const res = await runProcess({
      file: process.execPath,
      args: [ECHO, 'a b', '$(echo hi)', ';rm -rf /'],
      cwd: dir,
      env: process.env,
      stdin: '한글 입력 $HOME `x`\n',
      timeoutMs: 10_000
    })
    expect(res.code).toBe(0)
    const parsed = JSON.parse(res.stdoutTail.trim()) as { argv: string[]; stdin: string }
    expect(parsed.argv).toEqual(['a b', '$(echo hi)', ';rm -rf /'])
    expect(parsed.stdin).toBe('한글 입력 $HOME `x`\n')
    expect(res.timedOut).toBe(false)
    expect(res.aborted).toBe(false)
  })

  it('streams complete stdout lines and strips a trailing CR', async () => {
    const lines: string[] = []
    await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stdout.write("one\\r\\ntwo\\nthree")'],
      cwd: dir,
      env: process.env,
      timeoutMs: 10_000,
      onStdoutLine: (l) => lines.push(l)
    })
    expect(lines).toEqual(['one', 'two', 'three'])
  })

  it('reports a non-zero exit code and stderr tail', async () => {
    const res = await runProcess({
      file: process.execPath,
      args: ['-e', 'process.stderr.write("bad"); process.exit(7)'],
      cwd: dir,
      env: process.env,
      timeoutMs: 10_000
    })
    expect(res.code).toBe(7)
    expect(res.stderrTail).toContain('bad')
  })

  it('reports spawnError with ENOENT for a missing executable', async () => {
    const res = await runProcess({
      file: join(dir, 'does-not-exist'),
      args: [],
      cwd: dir,
      env: process.env,
      timeoutMs: 10_000
    })
    expect(res.spawnError?.code).toBe('ENOENT')
    expect(res.code).toBeNull()
  })

  it('times out, kills the process tree (including grandchild), and marks timedOut', async () => {
    const pidFile = join(dir, 'pids.json')
    const res = await runProcess({
      file: process.execPath,
      args: [HANG, pidFile],
      cwd: dir,
      env: process.env,
      timeoutMs: 800,
      stdin: ''
    })
    expect(res.timedOut).toBe(true)
    expect(res.aborted).toBe(false)
    expect(existsSync(pidFile)).toBe(true)
    const { self, child } = JSON.parse(readFileSync(pidFile, 'utf8')) as { self: number; child: number }
    const gone = await waitUntil(() => !isAlive(self) && !isAlive(child), 3000)
    expect(gone).toBe(true)
  })

  it('aborts via AbortSignal and marks aborted (not timedOut)', async () => {
    const pidFile = join(dir, 'pids.json')
    const ac = new AbortController()
    const promise = runProcess({
      file: process.execPath,
      args: [HANG, pidFile],
      cwd: dir,
      env: process.env,
      timeoutMs: 30_000,
      signal: ac.signal
    })
    await waitUntil(() => existsSync(pidFile), 3000)
    ac.abort()
    const res = await promise
    expect(res.aborted).toBe(true)
    expect(res.timedOut).toBe(false)
  })

  it('resolves immediately when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const res = await runProcess({
      file: process.execPath,
      args: [ECHO],
      cwd: dir,
      env: process.env,
      timeoutMs: 10_000,
      signal: ac.signal
    })
    expect(res.aborted).toBe(true)
    expect(res.code).toBeNull()
  })

  it('caps the stdout tail to TAIL_LIMIT_CHARS', async () => {
    const { TAIL_LIMIT_CHARS } = await import('../../../src/main/providers/process')
    const res = await runProcess({
      file: process.execPath,
      args: ['-e', `process.stdout.write("x".repeat(${TAIL_LIMIT_CHARS + 5000}))`],
      cwd: dir,
      env: process.env,
      timeoutMs: 10_000
    })
    expect(res.stdoutTail.length).toBeLessThanOrEqual(TAIL_LIMIT_CHARS)
  })
})
