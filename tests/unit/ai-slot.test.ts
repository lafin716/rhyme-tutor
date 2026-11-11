import { describe, expect, it } from 'vitest'
import { AiSlot, MAX_CONCURRENT_AI_CALLS } from '../../src/main/ai-slot'

describe('AiSlot', () => {
  it('allows one holder at a time and reports active and waiting counts', async () => {
    expect(MAX_CONCURRENT_AI_CALLS).toBe(1)
    const slot = new AiSlot()
    const release1 = await slot.acquire()
    expect(slot.active).toBe(1)

    let secondGranted = false
    const second = slot.acquire().then((rel) => {
      secondGranted = true
      return rel
    })
    expect(slot.waiting).toBe(1)
    await new Promise((r) => setTimeout(r, 5))
    expect(secondGranted).toBe(false)

    release1()
    const release2 = await second
    expect(secondGranted).toBe(true)
    expect(slot.active).toBe(1)
    expect(slot.waiting).toBe(0)
    release2()
    expect(slot.active).toBe(0)
  })

  it('grants queued callers in FIFO order', async () => {
    const slot = new AiSlot()
    const order: number[] = []
    const first = await slot.acquire()
    const waiters = [1, 2, 3].map((n) =>
      slot.acquire().then((rel) => {
        order.push(n)
        rel()
      })
    )
    first()
    await Promise.all(waiters)
    expect(order).toEqual([1, 2, 3])
  })

  it('aborting while queued rejects with PROVIDER_CANCELLED and frees the queue slot', async () => {
    const slot = new AiSlot()
    const holder = await slot.acquire()
    const controller = new AbortController()
    const queued = slot.acquire(controller.signal)
    expect(slot.waiting).toBe(1)
    controller.abort()
    await expect(queued).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED' })
    expect(slot.waiting).toBe(0)
    holder()
    expect(slot.active).toBe(0)
  })

  it('an already-aborted signal is rejected without taking the slot', async () => {
    const slot = new AiSlot()
    const controller = new AbortController()
    controller.abort()
    await expect(slot.acquire(controller.signal)).rejects.toMatchObject({ code: 'PROVIDER_CANCELLED' })
    expect(slot.active).toBe(0)
  })
})
