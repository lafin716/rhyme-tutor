import { randomUUID } from 'node:crypto'
import type { DatabaseSync, StatementSync } from 'node:sqlite'
import type { AppErrorCode, AppErrorPayload } from '@shared/domain'

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(): string {
  return randomUUID()
}

/** Typed single-row read. Column names must match the row type exactly (snake_case). */
export function one<T>(stmt: StatementSync, ...params: (string | number | bigint | null)[]): T | undefined {
  return stmt.get(...params) as unknown as T | undefined
}

/** Typed multi-row read. */
export function many<T>(stmt: StatementSync, ...params: (string | number | bigint | null)[]): T[] {
  return stmt.all(...params) as unknown as T[]
}

/** Repository-level error that the IPC layer maps to a Result error envelope. */
export class RepoError extends Error {
  constructor(
    readonly code: AppErrorCode,
    message: string,
    readonly detail?: string
  ) {
    super(message)
    this.name = 'RepoError'
  }
}

/**
 * Converts raw SQLite exceptions into RepoError. Known trigger/constraint messages are
 * mapped to stable codes; everything else becomes DB_ERROR (no SQL text leaks to UI).
 */
export function mapDbError(err: unknown): RepoError {
  if (err instanceof RepoError) return err
  const raw = err instanceof Error ? err.message : String(err)
  if (raw.includes('COURSE_IMMUTABLE')) {
    return new RepoError('COURSE_IMMUTABLE', '강의 제목과 주제는 변경할 수 없어요.', 'courses_immutable_identity')
  }
  return new RepoError('DB_ERROR', '데이터베이스 작업 중 문제가 생겼어요.', raw.slice(0, 300))
}

export function toPayload(err: unknown): AppErrorPayload {
  const repo = mapDbError(err)
  return {
    code: repo.code,
    message: repo.message,
    detail: repo.detail,
    retryable: repo.code === 'DB_ERROR'
  }
}

export function toBool(n: number | bigint | null | undefined): boolean {
  return Number(n ?? 0) !== 0
}

export type Db = DatabaseSync
