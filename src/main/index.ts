import { app, BrowserWindow, dialog, ipcMain, session, shell, type WebContents } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ChatStreamEvent } from '@shared/domain'
import { EVENTS, type CourseEvent, type JobEvent, type WindowStateEvent } from '@shared/ipc'
import { openDatabase, DbVersionTooNewError, MigrationError } from './db/connection'
import type { Db } from './db/util'
import { AiSlot } from './ai-slot'
import { CourseDeleteGate } from './course-gate'
import { createProviderRegistry } from './providers/registry'
import { createFileLogger } from './log/logger'
import { JobRunner, type RecoverySummary } from './jobs/runner'
import { LearningService } from './learning/service'
import { TutorOrchestrator } from './tutor/orchestrator'
import { createHandlers, type WindowControls } from './ipc/handlers'
import { registerIpc, type IpcInvokeEventLike } from './ipc/register'

const DB_FILE_NAME = 'tutor.db'
const INDEX_HTML = join(import.meta.dirname, '../renderer/index.html')
const PRELOAD = join(import.meta.dirname, '../preload/index.cjs')

// Optional data-dir override (used by E2E tests and local debugging).
if (process.env['TUTOR_USER_DATA_DIR']) app.setPath('userData', process.env['TUTOR_USER_DATA_DIR'])

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  void main()
}

let mainWindow: BrowserWindow | null = null
let shuttingDown = false

function rendererOrigin(): string | null {
  const dev = process.env['ELECTRON_RENDERER_URL']
  return dev ? new URL(dev).origin : null
}

/** Only the app's own page may invoke IPC. Dev: same origin as the Vite server. Prod: the packaged index.html. */
function isTrustedSender(event: IpcInvokeEventLike): boolean {
  const url = event.senderFrame?.url
  if (!url) return false
  const dev = rendererOrigin()
  if (dev) return new URL(url).origin === dev
  return url.startsWith(pathToFileURL(INDEX_HTML).href)
}

/** Top-level and frame navigations are limited to the app's own page (dev server origin or packaged index.html). */
function isAllowedNavigation(url: string): boolean {
  const allowed = rendererOrigin()
  return allowed ? new URL(url).origin === allowed : url.startsWith(pathToFileURL(INDEX_HTML).href)
}

function hardenWindow(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })
  win.webContents.on('will-frame-navigate', (details) => {
    if (!isAllowedNavigation(details.url)) details.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    // Seamless UI: no native title bar / menu bar. Windows & Linux draw their own min/max/close in the renderer
    // (TitleBar.tsx); macOS keeps the native traffic lights inset into the app's title bar area.
    ...(isMac ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 14, y: 12 } } : { frame: false }),
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  hardenWindow(win)
  win.once('ready-to-show', () => win.show())
  const pushState = (): void => sendTo(win.webContents, EVENTS.windowState, windowState(win))
  win.on('maximize', pushState)
  win.on('unmaximize', pushState)
  win.on('enter-full-screen', pushState)
  win.on('leave-full-screen', pushState)
  const dev = process.env['ELECTRON_RENDERER_URL']
  if (dev) void win.loadURL(dev)
  else void win.loadFile(INDEX_HTML)
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })
  return win
}

function windowState(win: BrowserWindow): WindowStateEvent {
  return { maximized: win.isMaximized(), fullScreen: win.isFullScreen() }
}

/** Title bar controls always act on the main window (there is only one). */
const windowControls: WindowControls = {
  minimize: () => mainWindow?.minimize(),
  toggleMaximize: () => {
    const win = mainWindow
    if (!win) return false
    if (win.isFullScreen()) win.setFullScreen(false)
    else if (win.isMaximized()) win.unmaximize()
    else win.maximize()
    return win.isMaximized()
  },
  close: () => mainWindow?.close(),
  state: () => (mainWindow ? windowState(mainWindow) : { maximized: false, fullScreen: false })
}

function sendTo(webContents: WebContents | undefined, channel: string, payload: unknown): void {
  if (!webContents || webContents.isDestroyed()) return
  webContents.send(channel, payload)
}

function recoveryNotices(summary: RecoverySummary): string[] {
  const notices: string[] = []
  if (summary.requeuedJobs > 0) notices.push(`중단된 백그라운드 작업 ${summary.requeuedJobs}개를 다시 대기열에 넣었어요.`)
  if (summary.recoveredMessages > 0) notices.push(`응답 중 종료된 메시지 ${summary.recoveredMessages}개를 복구했어요.`)
  if (summary.failedCurricula > 0) notices.push(`커리큘럼 생성이 중단된 코스 ${summary.failedCurricula}개가 있어요. 다시 시도해 주세요.`)
  return notices
}

async function main(): Promise<void> {
  await app.whenReady()

  const dataDir = app.getPath('userData')
  const logger = createFileLogger({ dir: join(dataDir, 'logs') })

  let opened: { db: Db; backupPath: string | null }
  try {
    opened = openDatabase({ filePath: join(dataDir, DB_FILE_NAME), log: logger })
  } catch (err) {
    const tooNew = err instanceof DbVersionTooNewError
    const migrationFailed = err instanceof MigrationError
    logger('error', 'database open failed', { reason: err instanceof Error ? err.name : 'unknown' })
    dialog.showErrorBox(
      '데이터베이스를 열 수 없어요',
      tooNew
        ? '이 데이터는 최신 버전의 앱에서 만들어졌어요. 최신 버전으로 업데이트한 뒤 다시 실행해 주세요.'
        : migrationFailed
          ? '데이터베이스 업그레이드에 실패했어요. 백업 파일이 데이터 폴더에 남아 있어요. 앱을 다시 실행해도 문제가 계속되면 데이터 폴더를 압축해 보내 주세요.'
          : '데이터베이스를 여는 중 오류가 발생했어요. 앱을 다시 실행해 주세요.'
    )
    app.exit(1)
    return
  }
  const db = opened.db

  const slot = new AiSlot()
  const providers = createProviderRegistry({
    tempRoot: join(dataDir, 'tmp'),
    log: logger,
    mockDelayMs: process.env['TUTOR_MOCK_DELAY_MS'] ? Number(process.env['TUTOR_MOCK_DELAY_MS']) : undefined
  })

  const gate = new CourseDeleteGate()
  const orchestrator = new TutorOrchestrator({
    db,
    providers,
    slot,
    emit: (event: ChatStreamEvent) => sendTo(mainWindow?.webContents, EVENTS.chat, event),
    log: logger,
    gate
  })

  const jobRunner = new JobRunner({
    db,
    providers,
    slot,
    log: logger,
    emit: (job) => {
      const wc = mainWindow?.webContents
      sendTo(wc, EVENTS.jobs, { type: 'job', job } satisfies JobEvent)
      if (job.type === 'curriculum_generation' && job.status === 'succeeded' && job.courseId) {
        sendTo(wc, EVENTS.courses, { type: 'course-updated', courseId: job.courseId } satisfies CourseEvent)
      }
    }
  })

  const learning = new LearningService({
    db,
    providers,
    slot,
    orchestrator,
    gate,
    abortJobs: (courseId) => jobRunner.abortCourse(courseId)
  })

  mainWindow = createWindow()

  const recovery = jobRunner.start()
  const notices = recoveryNotices(recovery)

  registerIpc(
    ipcMain,
    createHandlers({
      db,
      learning,
      orchestrator,
      providers,
      slot,
      appVersion: app.getVersion(),
      dataDir,
      notices,
      kickJobs: () => jobRunner.kick(),
      emitCourse: (event) => sendTo(mainWindow?.webContents, EVENTS.courses, event),
      openDataDir: async () => {
        const err = await shell.openPath(dataDir)
        if (err) throw new Error(err)
      },
      chooseExportPath: async (defaultName) => {
        const parent = mainWindow ?? undefined
        const result = parent
          ? await dialog.showSaveDialog(parent, { defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] })
          : await dialog.showSaveDialog({ defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] })
        return result.canceled || !result.filePath ? null : result.filePath
      },
      window: windowControls,
      now: () => new Date().toISOString(),
      log: logger
    }),
    { isTrustedSender, log: logger }
  )

  // Deny every permission request (camera, mic, notifications, etc.). The app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', (event) => {
    if (shuttingDown) return
    shuttingDown = true
    event.preventDefault()
    void (async () => {
      try {
        await orchestrator.shutdown()
        await jobRunner.stop()
        db.close()
      } catch (err) {
        logger('error', 'shutdown failed', { reason: err instanceof Error ? err.name : 'unknown' })
      } finally {
        app.quit()
      }
    })()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })
}
