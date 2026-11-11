import type { AppErrorCode, AppErrorPayload } from '@shared/domain'

/** Fallback Korean copy per stable error code. Main's `message` is preferred when present. */
export const ERROR_COPY: Record<AppErrorCode, string> = {
  PROVIDER_NOT_SELECTED: 'AI 연결을 먼저 선택해 주세요.',
  PROVIDER_NOT_INSTALLED: 'AI 도구가 설치되어 있지 않아요.',
  PROVIDER_AUTH_REQUIRED: 'AI 도구에 로그인이 필요해요.',
  PROVIDER_RATE_LIMITED: 'AI 요청이 많아 잠시 쉬어야 해요.',
  PROVIDER_TIMEOUT: 'AI 응답 시간이 초과됐어요.',
  PROVIDER_CANCELLED: '응답을 중단했어요.',
  PROVIDER_FAILED: 'AI가 응답을 완료하지 못했어요.',
  INVALID_AI_OUTPUT: 'AI 응답 형식이 올바르지 않았어요.',
  BUSY: '선생님이 다른 답변을 준비하고 있어요. 잠시 후 다시 시도해 주세요.',
  NOT_FOUND: '요청한 항목을 찾을 수 없어요.',
  VALIDATION: '입력값을 다시 확인해 주세요.',
  COURSE_IMMUTABLE: '이 항목은 변경할 수 없어요.',
  DB_ERROR: '데이터를 저장하지 못했어요.',
  UNKNOWN: '예상하지 못한 문제가 생겼어요.'
}

export function errorCopy(code: AppErrorCode | null): string {
  return code ? ERROR_COPY[code] : '응답을 완료하지 못했어요.'
}

export function messageOf(error: AppErrorPayload): string {
  return error.message.trim().length > 0 ? error.message : ERROR_COPY[error.code]
}
