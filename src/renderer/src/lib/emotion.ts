import type { ChatMessage, Emotion } from '@shared/domain'

/** Emotion of the tutor character, derived from streaming state and the latest quiz outcome. */
export function deriveEmotion(messages: ChatMessage[], quizHint: Emotion | null): Emotion {
  const lastTutor = messages.findLast((m) => m.role === 'tutor' && m.kind === 'chat')
  if (lastTutor?.status === 'streaming') {
    return lastTutor.content.length === 0 ? 'thinking' : 'talking'
  }
  if (quizHint) return quizHint
  if (lastTutor?.status === 'error') return 'concerned'
  return 'idle'
}

export function isTutorBusy(messages: ChatMessage[]): boolean {
  return messages.some((m) => m.role === 'tutor' && m.status === 'streaming')
}
