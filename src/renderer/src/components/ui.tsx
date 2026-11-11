import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cx } from '../lib/cx'
import { messageOf } from '../lib/errors'
import type { AppErrorPayload } from '@shared/domain'
import { Icon } from './icons'
import type { IconName } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

/**
 * Enabled and disabled looks are both fully specified (no opacity tricks) so disabled text keeps
 * readable contrast in light and dark themes. Hover styles only apply while enabled.
 */
const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-ink enabled:hover:bg-accent-strong disabled:border disabled:border-line disabled:bg-surface-2 disabled:text-ink-3',
  secondary:
    'border border-line bg-surface text-ink enabled:hover:bg-surface-2 disabled:bg-surface-2 disabled:text-ink-3',
  ghost: 'text-ink-2 enabled:hover:bg-surface-2 enabled:hover:text-ink disabled:text-ink-3',
  danger:
    'bg-danger text-white enabled:hover:opacity-90 dark:text-[#2a0907] disabled:bg-surface-2 disabled:text-ink-3'
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md'
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
        'disabled:cursor-not-allowed',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm',
        BUTTON_VARIANT[variant],
        className
      )}
      {...rest}
    />
  )
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string
  icon: IconName
}

/** Icon-only button. `label` becomes aria-label and the tooltip. */
export function IconButton({ label, icon, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 transition-colors',
        'hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  )
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-2xl border border-line bg-surface shadow-soft', className)}>{children}</section>
}

type BadgeTone = 'neutral' | 'accent' | 'success' | 'warn' | 'danger'
const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-2',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warn: 'bg-warn-soft text-warn',
  danger: 'bg-danger-soft text-danger'
}

export function Badge({ tone = 'neutral', children, testId }: { tone?: BadgeTone; children: ReactNode; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', BADGE_TONE[tone])}
    >
      {children}
    </span>
  )
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className="h-full rounded-full bg-accent transition-[width] duration-500 motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-ink-2" role="status">
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none"
      />
      {label ? <span className="text-sm">{label}</span> : <span className="sr-only">불러오는 중</span>}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('skeleton', className)} />
}

/** Inline error with optional retry. Uses main's Korean message, falling back to the code copy. */
export function ErrorNotice({
  error,
  onRetry,
  busy = false,
  testId
}: {
  error: AppErrorPayload
  onRetry?: () => void
  busy?: boolean
  testId?: string
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger"
    >
      <Icon name="alert" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{messageOf(error)}</p>
        {error.detail && <p className="mt-0.5 break-all text-xs opacity-70">{error.detail}</p>}
      </div>
      {onRetry && error.retryable && (
        <Button size="sm" variant="secondary" onClick={onRetry} disabled={busy}>
          다시 시도
        </Button>
      )}
    </div>
  )
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {body && <p className="max-w-md text-sm text-ink-2">{body}</p>}
      {children}
    </div>
  )
}

export function Toggle({
  pressed,
  onClick,
  children,
  testId
}: {
  pressed: boolean
  onClick: () => void
  children: ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      data-testid={testId}
      onClick={onClick}
      className={cx(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        pressed ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
      )}
    >
      {children}
    </button>
  )
}

export const inputClass =
  'w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus-visible:outline-accent'
