import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileLogger, sanitizeMeta } from '../../../src/main/log/logger'

const dirs: string[] = []

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'tutor-log-'))
  dirs.push(d)
  return d
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('sanitizeMeta', () => {
  it('drops prompt, content and learner text keys', () => {
    const out = sanitizeMeta({
      prompt: '비밀 프롬프트',
      content: '학습자 메시지',
      learnerText: '질문',
      system: '시스템',
      stdin: 'x',
      argv: ['a'],
      jobType: 'curriculum_generation',
      attempts: 2,
      retry: true
    })
    expect(out).toEqual({ jobType: 'curriculum_generation', attempts: 2, retry: true })
  })

  it('truncates long string values', () => {
    const out = sanitizeMeta({ code: 'x'.repeat(500) })
    expect((out?.code as string).length).toBeLessThanOrEqual(201)
  })

  it('returns undefined for missing meta', () => {
    expect(sanitizeMeta(undefined)).toBeUndefined()
  })
})

describe('createFileLogger', () => {
  it('writes JSON lines without the sensitive fields', () => {
    const dir = tmpDir()
    const log = createFileLogger({ dir, now: () => '2026-01-01T00:00:00.000Z' })
    log('info', 'job recovery complete', { requeuedJobs: 1, prompt: '비밀' })
    const line = readFileSync(join(dir, 'app.log'), 'utf8').trim()
    const parsed = JSON.parse(line) as Record<string, unknown>
    expect(parsed).toMatchObject({ level: 'info', message: 'job recovery complete', requeuedJobs: 1 })
    expect(line).not.toContain('비밀')
  })

  it('rotates at maxBytes and keeps three files', () => {
    const dir = tmpDir()
    const log = createFileLogger({ dir, maxBytes: 200, keepFiles: 3, now: () => 'T' })
    for (let i = 0; i < 60; i++) log('info', `entry ${i} ${'x'.repeat(40)}`)
    expect(existsSync(join(dir, 'app.log'))).toBe(true)
    expect(existsSync(join(dir, 'app.log.1'))).toBe(true)
    expect(existsSync(join(dir, 'app.log.2'))).toBe(true)
    expect(existsSync(join(dir, 'app.log.3'))).toBe(false)
  })
})
