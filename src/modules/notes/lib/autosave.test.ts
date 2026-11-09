import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Autosaver, type Draft, type SaveState } from './autosave'

class Gone extends Error {}

function setup(send: (id: number, draft: Draft) => Promise<Draft>) {
  const states: SaveState[] = []
  const saved: Array<[number, Draft]> = []
  const lost: number[] = []
  const saver = new Autosaver<Draft>({
    send,
    saved: (id, result) => saved.push([id, result]),
    lost: id => lost.push(id),
    isGone: error => error instanceof Gone,
    state: state => states.push(state),
    delay: 1000,
  })
  return { saver, states, saved, lost }
}

const draft = (content: string): Draft => ({ title: 'T', content })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('Autosaver', () => {
  it('saves once typing pauses, with the latest text', async () => {
    const send = vi.fn(async (_id: number, d: Draft) => d)
    const { saver, saved, states } = setup(send)
    saver.change(1, draft('a'))
    saver.change(1, draft('ab'))
    await vi.advanceTimersByTimeAsync(999)
    expect(send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(send).toHaveBeenCalledTimes(1)
    expect(saved).toEqual([[1, draft('ab')]])
    expect(states.at(-1)).toBe('saved')
    expect(saver.pending).toBe(false)
  })

  it('keeps typing that happens during a save, instead of marking it saved', async () => {
    let finish: (value: Draft) => void = () => {}
    const send = vi.fn((_id: number, d: Draft) => (d.content === 'a' ? new Promise<Draft>(resolve => (finish = resolve)) : Promise.resolve(d)))
    const { saver, saved } = setup(send)
    saver.change(1, draft('a'))
    await vi.advanceTimersByTimeAsync(1000)
    saver.change(1, draft('ab'))
    finish(draft('a'))
    await vi.advanceTimersByTimeAsync(0)
    expect(saver.draft(1)).toEqual(draft('ab'))
    expect(saver.pending).toBe(true)

    saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(saved.map(([, d]) => d.content)).toEqual(['a', 'ab'])
    expect(saver.pending).toBe(false)
  })

  it('sends one save at a time, so an older one never lands last', async () => {
    const order: string[] = []
    let finish: () => void = () => {}
    const send = vi.fn(async (id: number, d: Draft) => {
      order.push(`start ${id}`)
      if (id === 1) await new Promise<void>(resolve => (finish = resolve))
      order.push(`end ${id}`)
      return d
    })
    const { saver } = setup(send)
    saver.change(1, draft('one'))
    saver.flush()
    saver.change(2, draft('two'))
    saver.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start 1'])
    finish()
    await vi.advanceTimersByTimeAsync(0)
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })

  it('retries what fails, and lets another note through meanwhile', async () => {
    let failing = true
    const send = vi.fn(async (id: number, d: Draft) => {
      if (id === 1 && failing) throw new Error('offline')
      return d
    })
    const { saver, saved, states } = setup(send)
    saver.change(1, draft('one'))
    saver.change(2, draft('two'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(states).toContain('error')
    expect(saver.draft(1)).toEqual(draft('one'))

    await vi.advanceTimersByTimeAsync(2000)
    expect(saved.map(([id]) => id)).toEqual([2])

    failing = false
    await vi.advanceTimersByTimeAsync(4000)
    expect(saved.map(([id]) => id)).toEqual([2, 1])
    expect(states.at(-1)).toBe('saved')
  })

  it('drops the draft of a note that no longer exists', async () => {
    const send = vi.fn(async () => {
      throw new Gone()
    })
    const { saver, lost, states } = setup(send)
    saver.change(7, draft('x'))
    await vi.advanceTimersByTimeAsync(1000)
    expect(lost).toEqual([7])
    expect(saver.pending).toBe(false)
    expect(states.at(-1)).not.toBe('error')
  })
})
