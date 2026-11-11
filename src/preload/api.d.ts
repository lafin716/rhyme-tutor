import type { TutorApi } from '../shared/ipc'

declare global {
  interface Window {
    tutor: TutorApi
  }
}

export {}
