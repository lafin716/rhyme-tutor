/**
 * File logger for the main process. JSON lines, rotated at ~2MB, three files kept (app.log, app.log.1, app.log.2).
 * Prompts, learner text, and AI output are never written: metadata keys that could carry them are dropped.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ProviderLogger } from '../providers/types'

export const LOG_MAX_BYTES = 2 * 1024 * 1024
export const LOG_KEEP_FILES = 3
export const LOG_FILE_NAME = 'app.log'

/** Keys whose values may contain learner or AI text. They are dropped, never logged. */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'prompt',
  'system',
  'content',
  'text',
  'message',
  'learnerText',
  'topicPrompt',
  'summary',
  'nextSteps',
  'sample',
  'payload',
  'payload_json',
  'stdin',
  'argv'
])

export function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.has(key)) continue
    if (value === null || typeof value === 'number' || typeof value === 'boolean') out[key] = value
    else if (typeof value === 'string') out[key] = value.length > 200 ? `${value.slice(0, 200)}…` : value
  }
  return out
}

export interface FileLoggerOptions {
  dir: string
  maxBytes?: number
  keepFiles?: number
  /** Injectable clock for tests. */
  now?: () => string
}

/** Rotates `app.log` into `app.log.1`, `app.log.2`, dropping the oldest. */
export function rotateIfNeeded(dir: string, maxBytes: number, keepFiles: number): void {
  const active = join(dir, LOG_FILE_NAME)
  if (!existsSync(active) || statSync(active).size < maxBytes) return
  const oldest = join(dir, `${LOG_FILE_NAME}.${keepFiles - 1}`)
  if (existsSync(oldest)) rmSync(oldest)
  for (let i = keepFiles - 2; i >= 1; i--) {
    const from = join(dir, `${LOG_FILE_NAME}.${i}`)
    if (existsSync(from)) renameSync(from, join(dir, `${LOG_FILE_NAME}.${i + 1}`))
  }
  renameSync(active, join(dir, `${LOG_FILE_NAME}.1`))
}

export function createFileLogger(opts: FileLoggerOptions): ProviderLogger {
  const maxBytes = opts.maxBytes ?? LOG_MAX_BYTES
  const keepFiles = opts.keepFiles ?? LOG_KEEP_FILES
  const now = opts.now ?? (() => new Date().toISOString())
  mkdirSync(opts.dir, { recursive: true })

  return (level, message, meta) => {
    try {
      rotateIfNeeded(opts.dir, maxBytes, keepFiles)
      const line = JSON.stringify({ t: now(), level, message, ...sanitizeMeta(meta) }) + '\n'
      appendFileSync(join(opts.dir, LOG_FILE_NAME), line, { encoding: 'utf8', mode: 0o600 })
    } catch {
      // Logging must never crash the app.
    }
  }
}
