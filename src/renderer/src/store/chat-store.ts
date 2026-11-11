import { create } from 'zustand'
import type { AppErrorPayload, ChatMessage, ChatStreamEvent, Result } from '@shared/domain'
import { localFailure, run } from '../lib/result'

const HISTORY_PAGE = 30

interface ChatState {
  courseId: string | null
  messages: ChatMessage[]
  hasMore: boolean
  loadingOlder: boolean
  /** Last chat-level failure (send/start/retry), shown inline above the composer. */
  error: AppErrorPayload | null
  hydrate: (courseId: string, messages: ChatMessage[], hasMore: boolean) => void
  applyEvent: (event: ChatStreamEvent) => void
  loadOlder: () => Promise<void>
  send: (
    content: string,
    clientMessageId: string
  ) => Promise<Result<{ learnerMessage: ChatMessage; tutorMessage: ChatMessage }>>
  startLesson: () => Promise<Result<{ tutorMessage: ChatMessage }>>
  cancel: () => Promise<Result<null>>
  retry: (tutorMessageId: string) => Promise<Result<{ tutorMessage: ChatMessage }>>
  clearError: () => void
}

/** Replace by id, or append when unknown. Events are authoritative for updates. */
function upsert(list: ChatMessage[], message: ChatMessage): ChatMessage[] {
  const index = list.findIndex((m) => m.id === message.id)
  if (index === -1) return [...list, message]
  const next = list.slice()
  next[index] = message
  return next
}

/** Append only messages we have not seen, so request results never overwrite newer streamed state. */
function addIfAbsent(list: ChatMessage[], messages: ChatMessage[]): ChatMessage[] {
  const known = new Set(list.map((m) => m.id))
  const fresh = messages.filter((m) => !known.has(m.id))
  return fresh.length === 0 ? list : [...list, ...fresh]
}

export const useChatStore = create<ChatState>((set, get) => ({
  courseId: null,
  messages: [],
  hasMore: false,
  loadingOlder: false,
  error: null,

  hydrate(courseId, messages, hasMore) {
    set({ courseId, messages, hasMore, loadingOlder: false, error: null })
  },

  applyEvent(event) {
    if (event.courseId !== get().courseId) return
    switch (event.type) {
      case 'started': {
        set((s) => {
          let messages = s.messages
          if (event.learnerMessage) messages = upsert(messages, event.learnerMessage)
          return { messages: upsert(messages, event.tutorMessage) }
        })
        return
      }
      case 'delta': {
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === event.messageId ? { ...m, content: m.content + event.delta, status: 'streaming' } : m
          )
        }))
        return
      }
      case 'completed':
      case 'cancelled':
      case 'failed': {
        set((s) => ({ messages: upsert(s.messages, event.message) }))
        return
      }
    }
  },

  async loadOlder() {
    const { courseId, messages, hasMore, loadingOlder } = get()
    const oldest = messages[0]
    if (!courseId || !oldest || !hasMore || loadingOlder) return
    set({ loadingOlder: true })
    const res = await run(() => window.tutor.chat.history(courseId, oldest.id, HISTORY_PAGE))
    if (get().courseId !== courseId) return
    if (!res.ok) {
      set({ loadingOlder: false, error: res.error })
      return
    }
    const known = new Set(get().messages.map((m) => m.id))
    const older = res.data.messages.filter((m) => !known.has(m.id))
    set((s) => ({ messages: [...older, ...s.messages], hasMore: res.data.hasMore, loadingOlder: false }))
  },

  async send(content, clientMessageId) {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.chat.send({ courseId, clientMessageId, content }))
    if (get().courseId !== courseId) return res
    if (res.ok) {
      set((s) => ({
        error: null,
        messages: addIfAbsent(s.messages, [res.data.learnerMessage, res.data.tutorMessage])
      }))
    } else {
      set({ error: res.error })
    }
    return res
  },

  async startLesson() {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.chat.startLesson(courseId))
    if (get().courseId !== courseId) return res
    if (res.ok) set((s) => ({ error: null, messages: addIfAbsent(s.messages, [res.data.tutorMessage]) }))
    else set({ error: res.error })
    return res
  },

  async cancel() {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.chat.cancel(courseId))
    if (!res.ok) set({ error: res.error })
    return res
  },

  async retry(tutorMessageId) {
    const courseId = get().courseId
    if (!courseId) return localFailure('NOT_FOUND', '수업 정보를 찾을 수 없어요.')
    const res = await run(() => window.tutor.chat.retry(tutorMessageId))
    if (get().courseId !== courseId) return res
    if (res.ok) {
      set((s) => {
        const existing = s.messages.find((m) => m.id === tutorMessageId)
        // Only reset a message that is still in a terminal failure state; events may have already advanced it.
        const reset = !existing || existing.status === 'error' || existing.status === 'cancelled'
        return { error: null, messages: reset ? upsert(s.messages, res.data.tutorMessage) : s.messages }
      })
    } else {
      set({ error: res.error })
    }
    return res
  },

  clearError() {
    set({ error: null })
  }
}))
