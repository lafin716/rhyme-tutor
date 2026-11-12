/**
 * Preload bridge. Exposes exactly `TutorApi` as `window.tutor`. Only `electron` and `@shared/ipc` are imported.
 * Arguments are passed through unchanged: main re-validates everything with Zod and always answers with a Result.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENTS, IPC, type CourseEvent, type JobEvent, type TutorApi, type WindowStateEvent, type Unsubscribe } from '@shared/ipc'

type ChatListener = Parameters<TutorApi['on']['chat']>[0]
type ChatEvent = Parameters<ChatListener>[0]

function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  return ipcRenderer.invoke(channel, ...args) as Promise<T>
}

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api: TutorApi = {
  app: {
    bootstrap: () => invoke(IPC.appBootstrap),
    openDataDir: () => invoke(IPC.appOpenDataDir),
    exportData: () => invoke(IPC.appExportData)
  },
  profile: {
    get: () => invoke(IPC.profileGet),
    save: (answers) => invoke(IPC.profileSave, answers)
  },
  settings: {
    get: () => invoke(IPC.settingsGet),
    update: (patch) => invoke(IPC.settingsUpdate, patch)
  },
  providers: {
    detect: () => invoke(IPC.providersDetect),
    select: (id) => invoke(IPC.providersSelect, id),
    test: (id) => invoke(IPC.providersTest, id)
  },
  courses: {
    list: () => invoke(IPC.coursesList),
    create: (input) => invoke(IPC.coursesCreate, input),
    update: (courseId, patch) => invoke(IPC.coursesUpdate, courseId, patch),
    delete: (courseId) => invoke(IPC.coursesDelete, courseId),
    retryCurriculum: (courseId) => invoke(IPC.coursesRetryCurriculum, courseId)
  },
  classroom: {
    get: (courseId) => invoke(IPC.classroomGet, courseId)
  },
  lessons: {
    select: (courseId, lessonId) => invoke(IPC.lessonsSelect, courseId, lessonId),
    complete: (courseId, lessonId) => invoke(IPC.lessonsComplete, courseId, lessonId)
  },
  objectives: {
    selfCheck: (objectiveId, understood) => invoke(IPC.objectivesSelfCheck, objectiveId, understood)
  },
  chat: {
    history: (courseId, beforeMessageId, limit) => invoke(IPC.chatHistory, courseId, beforeMessageId, limit),
    send: (input) => invoke(IPC.chatSend, input),
    startLesson: (courseId) => invoke(IPC.chatStartLesson, courseId),
    cancel: (courseId) => invoke(IPC.chatCancel, courseId),
    retry: (tutorMessageId) => invoke(IPC.chatRetry, tutorMessageId)
  },
  quiz: {
    generate: (courseId, lessonId) => invoke(IPC.quizGenerate, courseId, lessonId),
    answer: (input) => invoke(IPC.quizAnswer, input),
    flag: (input) => invoke(IPC.quizFlag, input)
  },
  jobs: {
    list: (courseId) => invoke(IPC.jobsList, courseId)
  },
  window: {
    platform: process.platform,
    minimize: () => invoke(IPC.windowMinimize),
    toggleMaximize: () => invoke(IPC.windowToggleMaximize),
    close: () => invoke(IPC.windowClose),
    state: () => invoke(IPC.windowState)
  },
  on: {
    chat: (listener) => subscribe<ChatEvent>(EVENTS.chat, listener),
    jobs: (listener) => subscribe<JobEvent>(EVENTS.jobs, listener),
    courses: (listener) => subscribe<CourseEvent>(EVENTS.courses, listener),
    windowState: (listener) => subscribe<WindowStateEvent>(EVENTS.windowState, listener)
  }
}

contextBridge.exposeInMainWorld('tutor', api)
