import { useEffect } from 'react'
import { useAppStore } from '../store/app-store'
import { cx } from '../lib/cx'

/** Info and success toasts auto-dismiss; errors stay until the learner closes them. */
const AUTO_DISMISS_MS = 3500

/**
 * Single-slot status toast, polite live region, anchored top-right so it never covers the chat composer
 * at the bottom of the classroom.
 */
export function Toaster() {
  const toast = useAppStore((s) => s.toast)
  const dismiss = useAppStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast || toast.tone === 'error') return
    const id = window.setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS)
    return () => window.clearTimeout(id)
  }, [toast, dismiss])

  if (!toast) return null
  const isError = toast.tone === 'error'
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      data-tone={toast.tone}
      className={cx(
        'fade-in fixed right-4 top-24 z-50 flex max-w-sm items-start gap-3 rounded-xl px-4 py-2.5 text-sm font-medium shadow-soft',
        isError ? 'bg-danger text-white dark:text-[#2a0907]' : 'bg-ink text-canvas'
      )}
    >
      <span className="min-w-0 flex-1">{toast.text}</span>
      {isError && (
        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          data-testid="toast-close"
          aria-label="알림 닫기"
          className="-my-1 -mr-2 rounded-md px-2 py-1 text-white/90 hover:bg-white/15 hover:text-white dark:text-[#2a0907] dark:hover:bg-black/10"
        >
          ✕
        </button>
      )}
    </div>
  )
}
