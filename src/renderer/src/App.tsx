import { useEffect } from 'react'
import { useAppStore } from './store/app-store'
import type { Route } from './store/app-store'
import { applyTheme } from './lib/theme'
import { BootScreen } from './pages/BootScreen'
import { FatalScreen } from './pages/FatalScreen'
import { OnboardingPage } from './pages/OnboardingPage'
import { ProviderSetupPage } from './pages/ProviderSetupPage'
import { DashboardPage } from './pages/DashboardPage'
import { CreateCoursePage } from './pages/CreateCoursePage'
import { ClassroomPage } from './pages/ClassroomPage'
import { SettingsPage } from './pages/SettingsPage'
import { Toaster } from './components/Toaster'
import { TitleBar } from './components/TitleBar'
import { useTutorSubscriptions } from './lib/subscriptions'

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'onboarding':
      return <OnboardingPage mode="initial" />
    case 'provider':
      return <ProviderSetupPage />
    case 'dashboard':
      return <DashboardPage />
    case 'create':
      return <CreateCoursePage />
    case 'classroom':
      return <ClassroomPage courseId={route.courseId} />
    case 'settings':
      return <SettingsPage tab={route.tab} />
  }
}

export function App() {
  const phase = useAppStore((s) => s.phase)
  const route = useAppStore((s) => s.route)
  const theme = useAppStore((s) => s.settings.theme)
  const boot = useAppStore((s) => s.boot)

  useEffect(() => {
    void boot()
  }, [boot])

  // Theme: explicit choice applies immediately; "system" tracks the OS setting while the app runs.
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => applyTheme('system')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [theme])

  useTutorSubscriptions(phase === 'ready')

  return (
    <div className="flex h-full flex-col">
      <TitleBar tone={phase === 'ready' ? 'surface' : 'canvas'} />
      <div className="min-h-0 flex-1">
        {phase === 'booting' ? <BootScreen /> : phase === 'fatal' ? <FatalScreen /> : <RouteView route={route} />}
      </div>
      {phase === 'ready' && <Toaster />}
    </div>
  )
}
