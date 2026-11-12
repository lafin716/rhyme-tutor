import { useEffect, useState, type ReactNode } from 'react'
import type { WindowStateEvent } from '@shared/ipc'
import { cx } from '../lib/cx'

const platform = window.tutor.window.platform
const isMac = platform === 'darwin'

interface TitleBarProps {
  /** Matches the screen below so the bar blends in (pages with a header use surface, boot/fatal use canvas). */
  tone: 'surface' | 'canvas'
}

/**
 * In-app title bar for the frameless window. The whole bar is a drag region (double-click maximizes natively).
 * Windows/Linux get custom minimize/maximize/close buttons; macOS keeps the native traffic lights on the left.
 */
export function TitleBar({ tone }: TitleBarProps) {
  const [state, setState] = useState<WindowStateEvent>({ maximized: false, fullScreen: false })

  useEffect(() => {
    let alive = true
    void window.tutor.window
      .state()
      .then((r) => {
        if (alive && r.ok) setState(r.data)
      })
      .catch(() => undefined)
    const off = window.tutor.on.windowState(setState)
    return () => {
      alive = false
      off()
    }
  }, [])

  // Native full screen hides the macOS traffic lights; no inset needed then.
  const macInset = isMac && !state.fullScreen

  return (
    <div
      data-testid="title-bar"
      className={cx(
        'app-drag flex h-9 shrink-0 select-none items-center',
        tone === 'surface' ? 'bg-surface' : 'bg-canvas'
      )}
    >
      <div className={cx('flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-ink-3', macInset ? 'pl-20' : 'pl-4')}>
        <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />
        <span className="truncate">Rhyme Tutor</span>
      </div>
      {!isMac && (
        <div className="flex h-full shrink-0" role="group" aria-label="창 제어">
          <WindowButton label="최소화" testId="window-minimize" onClick={() => void window.tutor.window.minimize()}>
            <path d="M0 5.5h10" />
          </WindowButton>
          <WindowButton
            label={state.maximized ? '이전 크기로 복원' : '최대화'}
            testId="window-maximize"
            onClick={() => {
              void window.tutor.window.toggleMaximize().then((r) => {
                if (r.ok) setState((s) => ({ ...s, maximized: r.data }))
              })
            }}
          >
            {state.maximized ? (
              <>
                <rect x="0.5" y="2.5" width="7" height="7" />
                <path d="M2.5 2.5V0.5h7v7h-2" />
              </>
            ) : (
              <rect x="0.5" y="0.5" width="9" height="9" />
            )}
          </WindowButton>
          <WindowButton label="닫기" testId="window-close" danger onClick={() => void window.tutor.window.close()}>
            <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" />
          </WindowButton>
        </div>
      )}
    </div>
  )
}

interface WindowButtonProps {
  label: string
  testId: string
  danger?: boolean
  onClick: () => void
  children: ReactNode
}

function WindowButton({ label, testId, danger, onClick, children }: WindowButtonProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={label}
      title={label}
      data-testid={testId}
      onClick={onClick}
      onDoubleClick={(e) => e.stopPropagation()}
      className={cx(
        'inline-flex h-full w-[46px] items-center justify-center text-ink-2 transition-colors duration-100',
        danger ? 'hover:bg-[#c42b1c] hover:text-white active:bg-[#b22a1c]' : 'hover:bg-surface-2 hover:text-ink active:bg-line'
      )}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
        {children}
      </svg>
    </button>
  )
}
