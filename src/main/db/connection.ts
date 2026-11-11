import { DatabaseSync } from 'node:sqlite'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { MIGRATIONS, type Migration } from './migrations'

export const LATEST_SCHEMA_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0)

export class DbVersionTooNewError extends Error {
  constructor(readonly dbVersion: number, readonly appVersion: number) {
    super(`DB schema version ${dbVersion} is newer than app supports (${appVersion})`)
    this.name = 'DbVersionTooNewError'
  }
}

export class MigrationError extends Error {
  constructor(readonly migrationVersion: number, cause: unknown) {
    super(`Migration ${migrationVersion} failed: ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'MigrationError'
  }
}

export interface OpenDatabaseOptions {
  /** Absolute path to tutor.db, or ':memory:' for tests. */
  filePath: string
  /** Busy timeout in ms (default 5000). */
  busyTimeoutMs?: number
  /** Migration list override (tests only). */
  migrations?: readonly Migration[]
  log?: (level: 'info' | 'warn' | 'error', message: string) => void
}

export interface OpenedDatabase {
  db: DatabaseSync
  /** Schema version after migration. */
  schemaVersion: number
  /** Path of the backup created before migrating, if any. */
  backupPath: string | null
}

/**
 * Opens the SQLite file, applies pragmas and runs pending migrations.
 * Throws DbVersionTooNewError when the file was written by a newer app build,
 * and MigrationError when a migration fails (its transaction is rolled back).
 */
export function openDatabase(opts: OpenDatabaseOptions): OpenedDatabase {
  const migrations = opts.migrations ?? MIGRATIONS
  const log = opts.log ?? (() => undefined)
  const filePath = opts.filePath

  if (filePath !== ':memory:') mkdirSync(dirname(filePath), { recursive: true })

  const db = new DatabaseSync(filePath, {
    enableForeignKeyConstraints: true,
    timeout: opts.busyTimeoutMs ?? 5000
  })

  try {
    db.exec('PRAGMA busy_timeout = ' + Math.floor(opts.busyTimeoutMs ?? 5000))
    if (filePath !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA foreign_keys = ON')
    db.exec('PRAGMA synchronous = NORMAL')

    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`)

    const current = currentVersion(db)
    const latest = migrations.reduce((max, m) => Math.max(max, m.version), 0)
    if (current > latest) throw new DbVersionTooNewError(current, latest)

    const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version)
    let backupPath: string | null = null
    if (pending.length > 0 && current > 0 && filePath !== ':memory:') {
      backupPath = backupBeforeMigrate(db, filePath, current)
      log('info', `DB backup created before migrating from v${current}`)
    }

    for (const m of pending) {
      applyMigration(db, m)
      log('info', `migration ${m.version} (${m.name}) applied`)
    }

    return { db, schemaVersion: currentVersion(db), backupPath }
  } catch (err) {
    try {
      db.close()
    } catch {
      /* already closed */
    }
    throw err
  }
}

function currentVersion(db: DatabaseSync): number {
  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations').get() as
    | { v: number | bigint }
    | undefined
  return Number(row?.v ?? 0)
}

function applyMigration(db: DatabaseSync, m: Migration): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
      m.version,
      m.name,
      new Date().toISOString()
    )
    db.exec('COMMIT')
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw new MigrationError(m.version, err)
  }
}

/** Copies the DB file (after a WAL checkpoint) to tutor.db.bak-<version>. Never overwrites an existing backup. */
function backupBeforeMigrate(db: DatabaseSync, filePath: string, fromVersion: number): string {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  let target = `${filePath}.bak-${fromVersion}`
  let n = 1
  while (existsSync(target)) {
    target = `${filePath}.bak-${fromVersion}-${n}`
    n += 1
  }
  copyFileSync(filePath, target)
  return target
}

/**
 * Runs fn inside BEGIN IMMEDIATE ... COMMIT. If a transaction is already open on this
 * connection, fn joins it (no nested BEGIN). Any throw rolls back and rethrows.
 */
export function withTx<T>(db: DatabaseSync, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    if (db.isTransaction) db.exec('ROLLBACK')
    throw err
  }
}
