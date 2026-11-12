import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { IPC } from '@shared/ipc'
import { createHandlers } from '../../../src/main/ipc/handlers'
import { registerIpc, UNTRUSTED_SENDER_MESSAGE, type IpcInvokeEventLike } from '../../../src/main/ipc/register'
import { createHarness, courseInput, noopLog, onboard, type Harness } from '../support/harness'

type Listener = (event: IpcInvokeEventLike, ...args: unknown[]) => Promise<{ ok: boolean; data?: unknown; error?: { code: string; message: string } }>

function fakeIpcMain(): { listeners: Map<string, Listener>; ipcMain: { handle(ch: string, l: Listener): void } } {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    ipcMain: {
      handle(channel, listener) {
        listeners.set(channel, listener)
      }
    }
  }
}

const trusted: IpcInvokeEventLike = { senderFrame: { url: 'app://local/index.html' } }
const untrusted: IpcInvokeEventLike = { senderFrame: { url: 'https://evil.example/' } }

let h: Harness

beforeEach(() => {
  h = createHarness()
  onboard(h.db)
})

afterEach(async () => {
  await h.close()
})

function wire(isTrusted: (e: IpcInvokeEventLike) => boolean) {
  const fake = fakeIpcMain()
  const handlers = createHandlers({
    db: h.db,
    learning: h.learning,
    orchestrator: h.orchestrator,
    providers: h.providers,
    slot: h.slot,
    appVersion: '0.0.0-test',
    dataDir: h.dir,
    notices: [],
    kickJobs: () => undefined,
    emitCourse: () => undefined,
    openDataDir: async () => undefined,
    chooseExportPath: async () => null,
    window: {
      minimize: () => undefined,
      toggleMaximize: () => true,
      close: () => undefined,
      state: () => ({ maximized: false, fullScreen: false })
    },
    now: () => new Date().toISOString(),
    log: noopLog
  })
  const channels = registerIpc(fake.ipcMain, handlers, { isTrustedSender: isTrusted, log: noopLog })
  return { channels, listeners: fake.listeners }
}

describe('IPC registration', () => {
  it('registers every channel in the shared IPC table', () => {
    const { channels, listeners } = wire(() => true)
    expect(channels).toHaveLength(Object.values(IPC).length)
    expect(listeners.size).toBe(Object.values(IPC).length)
  })

  it('rejects calls from an untrusted sender without running the handler', async () => {
    const { listeners } = wire(() => false)
    const res = await listeners.get(IPC.coursesList)!(untrusted)
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('VALIDATION')
    expect(res.error?.message).toBe(UNTRUSTED_SENDER_MESSAGE)
  })

  it('answers trusted calls with a Result envelope', async () => {
    const { listeners } = wire((e) => e === trusted)
    const res = await listeners.get(IPC.coursesList)!(trusted)
    expect(res.ok).toBe(true)
    expect(Array.isArray(res.data)).toBe(true)
  })

  it('invalid arguments come back as VALIDATION, never as a thrown error', async () => {
    const { listeners } = wire(() => true)
    const bad = await listeners.get(IPC.coursesCreate)!(trusted, {})
    expect(bad.ok).toBe(false)
    expect(bad.error?.code).toBe('VALIDATION')

    const badSend = await listeners.get(IPC.chatSend)!(trusted, { courseId: 'x' })
    expect(badSend.ok).toBe(false)
    expect(badSend.error?.code).toBe('VALIDATION')
  })

  it('domain errors keep their code (quiz not found)', async () => {
    const { listeners } = wire(() => true)
    const res = await listeners.get(IPC.quizAnswer)!(trusted, { quizId: randomUUID(), selectedIndex: 0 })
    expect(res.ok).toBe(false)
    expect(res.error?.code).toBe('NOT_FOUND')
  })

  it('course creation through IPC returns the card', async () => {
    const { listeners } = wire(() => true)
    const res = await listeners.get(IPC.coursesCreate)!(trusted, courseInput())
    expect(res.ok).toBe(true)
  })
})
