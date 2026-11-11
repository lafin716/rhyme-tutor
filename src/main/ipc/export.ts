/**
 * JSON export of all learner data (app:exportData). Table names are a fixed allow-list (never user input);
 * the target path comes from the main-side save dialog. No provider credentials are stored in the DB.
 */
import { writeFileSync } from 'node:fs'
import type { ExportResult } from '@shared/domain'
import type { Db } from '../db/util'
import { LATEST_SCHEMA_VERSION } from '../db/connection'

export const EXPORT_TABLES = [
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
] as const

export function buildExportDocument(db: Db, now: string): string {
  const tables: Record<string, unknown[]> = {}
  for (const table of EXPORT_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all() as unknown[]
  }
  return JSON.stringify({ exportedAt: now, schemaVersion: LATEST_SCHEMA_VERSION, tables }, null, 2)
}

/** Writes the export to `filePath` (must end with .json; appended when missing). */
export function writeExport(db: Db, filePath: string, now: string): ExportResult {
  const target = filePath.toLowerCase().endsWith('.json') ? filePath : `${filePath}.json`
  const json = buildExportDocument(db, now)
  writeFileSync(target, json, { encoding: 'utf8', mode: 0o600 })
  return { filePath: target, bytes: Buffer.byteLength(json, 'utf8') }
}
