import { create } from 'zustand'
import { DEFAULT_SETTINGS } from '@shared/domain'
import type { AppErrorPayload, AppSettings, AppSettingsPatch, LearnerProfile, Result } from '@shared/domain'
import { run } from '../lib/result'

export type SettingsTab = 'provider' | 'learning' | 'app' | 'data'

export type Route =
  | { name: 'onboarding' }
  | { name: 'provider' }
  | { name: 'dashboard' }
  | { name: 'create' }
  | { name: 'classroom'; courseId: string }
  | { name: 'settings'; tab: SettingsTab }

export type ToastTone = 'info' | 'success' | 'error'
export interface Toast {
  id: number
  text: string
  tone: ToastTone
}

interface AppState {
  phase: 'booting' | 'ready' | 'fatal'
  fatal: AppErrorPayload | null
  version: string | null
  dataDir: string | null
  profile: LearnerProfile | null
  settings: AppSettings
  route: Route
  previous: Route | null
  toast: Toast | null
  boot: () => Promise<void>
  navigate: (route: Route) => void
  setProfile: (profile: LearnerProfile) => void
  setSettings: (settings: AppSettings) => void
  saveSettings: (patch: AppSettingsPatch) => Promise<Result<AppSettings>>
  notify: (text: string, tone?: ToastTone) => void
  dismissToast: (id: number) => void
}

let toastSeq = 0

export const useAppStore = create<AppState>((set, get) => ({
  phase: 'booting',
  fatal: null,
  version: null,
  dataDir: null,
  profile: null,
  settings: DEFAULT_SETTINGS,
  route: { name: 'dashboard' },
  previous: null,
  toast: null,

  async boot() {
    set({ phase: 'booting', fatal: null })
    const res = await run(() => window.tutor.app.bootstrap())
    if (!res.ok) {
      set({ phase: 'fatal', fatal: res.error })
      return
    }
    const boot = res.data
    set({
      phase: 'ready',
      version: boot.version,
      dataDir: boot.dataDir,
      profile: boot.profile,
      settings: boot.settings,
      route: boot.onboardingCompleted && boot.profile ? { name: 'dashboard' } : { name: 'onboarding' },
      previous: null
    })
    if (boot.notices.length > 0) get().notify(boot.notices.join(' '), 'info')
  },

  navigate(route) {
    const current = get().route
    // Keep the page we came from when moving between settings tabs.
    const previous = route.name === 'settings' && current.name === 'settings' ? get().previous : current
    set({ route, previous })
  },

  setProfile(profile) {
    set({ profile })
  },

  setSettings(settings) {
    set({ settings })
  },

  async saveSettings(patch) {
    const res = await run(() => window.tutor.settings.update(patch))
    if (res.ok) set({ settings: res.data })
    return res
  },

  notify(text, tone = 'info') {
    toastSeq += 1
    set({ toast: { id: toastSeq, text, tone } })
  },

  dismissToast(id) {
    if (get().toast?.id === id) set({ toast: null })
  }
}))
