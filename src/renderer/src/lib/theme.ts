import type { Theme } from '@shared/domain'

/** Applies light/dark to <html>. "system" follows prefers-color-scheme. */
export function applyTheme(theme: Theme): void {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}
