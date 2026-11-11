import type { AppErrorCode, AppErrorPayload, Result } from '@shared/domain'

export type { AppErrorPayload, Result }

export function unexpectedError(err: unknown): AppErrorPayload {
  return {
    code: 'UNKNOWN',
    message: '예상하지 못한 문제가 생겼어요. 다시 시도해 주세요.',
    detail: err instanceof Error ? err.message : String(err),
    retryable: true
  }
}

/** Runs a TutorApi call and converts unexpected bridge exceptions into a Result failure. */
export async function run<T>(call: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await call()
  } catch (err) {
    return { ok: false, error: unexpectedError(err) }
  }
}

/** Local failure for states the renderer detects before calling main (e.g. missing course id). */
export function localFailure<T>(code: AppErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message, retryable: false } }
}
