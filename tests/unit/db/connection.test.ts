import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DbVersionTooNewError, LATEST_SCHEMA_VERSION, openDatabase } from '../../../src/main/db/connection'
import { noopLog } from '../support/harness'

const dirs: string[] = []

function tmpFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tutor-db-'))
  dirs.push(dir)
  return join(dir, 'test.db')
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('schema migrations', () => {
  it('opens a fresh file DB at the latest schema version with foreign keys on', () => {
    const { db, schemaVersion } = openDatabase({ filePath: tmpFile(), log: noopLog })
    expect(schemaVersion).toBe(LATEST_SCHEMA_VERSION)
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number | bigint }
    expect(Number(fk.foreign_keys)).toBe(1)
    db.close()
  })

  it('creates the domain tables', () => {
    const { db } = openDatabase({ filePath: tmpFile(), log: noopLog })
    const names = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name)
    )
    for (const t of [
      'user_profile',
      'app_settings',
      'courses',
      'tutor_characters',
      'curriculum_modules',
      'curriculum_lessons',
      'learning_objectives',
      'objective_evidence',
      'messages',
      'quizzes',
      'quiz_attempts',
      'learning_summaries',
      'learning_memories',
      'background_jobs'
    ]) {
      expect(names.has(t), t).toBe(true)
    }
    db.close()
  })

  it('refuses a database written by a newer app version', () => {
    const file = tmpFile()
    const first = openDatabase({ filePath: file, log: noopLog })
    first.db
      .prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(LATEST_SCHEMA_VERSION + 1, 'from_the_future', new Date().toISOString())
    first.db.close()
    expect(() => openDatabase({ filePath: file, log: noopLog })).toThrow(DbVersionTooNewError)
  })

  it('reopening an up-to-date database keeps its data', () => {
    const file = tmpFile()
    const first = openDatabase({ filePath: file, log: noopLog })
    first.db.close()
    const second = openDatabase({ filePath: file, log: noopLog })
    expect(second.schemaVersion).toBe(LATEST_SCHEMA_VERSION)
    second.db.close()
  })
})
