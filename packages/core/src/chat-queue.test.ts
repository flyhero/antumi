import { describe, expect, it } from 'vitest'
import { ChatQueue } from './chat-queue'

const at = 1

describe('ChatQueue', () => {
  it('keeps messages in order and sends the first, then the next', () => {
    const queue = new ChatQueue()
    queue.apply({ dir: 'queue', at, text: 'first', ref: 'ref-1' })
    queue.apply({ dir: 'queue', at, text: 'second', ref: 'ref-2' })
    expect(queue.next()).toEqual({ text: 'first', images: [], ref: 'ref-1' })
    expect(queue.first).toEqual({ text: 'first', held: false, images: [] })
    queue.sent('ref-1')
    expect(queue.next()).toEqual({ text: 'second', images: [], ref: 'ref-2' })
    queue.sent('ref-2')
    expect(queue.view).toEqual([])
    expect(queue.first).toBeNull()
  })

  it('holds every message after a turn that did not complete, and releases one at a time', () => {
    const queue = new ChatQueue()
    queue.apply({ dir: 'queue', at, text: 'later', ref: 'ref-1' })
    queue.apply({ dir: 'queue', at, text: 'after', ref: 'ref-2' })
    queue.turnEnded('failed')
    expect(queue.next()).toBeNull()
    expect(queue.view.map((entry) => entry.held)).toEqual([true, true])
    queue.apply({ dir: 'queue', at, text: null, ref: 'ref-1', release: true })
    expect(queue.next()).toEqual({ text: 'later', images: [], ref: 'ref-1' })
    expect(queue.get('ref-2')).toMatchObject({ held: true })
  })

  it('drops one message by its ref, or all of them', () => {
    const queue = new ChatQueue()
    queue.apply({ dir: 'queue', at, text: 'a', ref: 'ref-1' })
    queue.apply({ dir: 'queue', at, text: 'b', ref: 'ref-2' })
    queue.apply({ dir: 'queue', at, text: null, ref: 'ref-1' })
    expect(queue.view.map((entry) => entry.text)).toEqual(['b'])
    queue.apply({ dir: 'queue', at, text: null })
    expect(queue.view).toEqual([])
  })

  it('restores a failed middle message before its successor without clearing later messages', () => {
    const queue = new ChatQueue()
    for (const ref of ['first', 'second', 'third']) queue.apply({ dir: 'queue', at, text: ref, ref })
    queue.sent('second')
    queue.apply({ dir: 'queue', at, text: 'second', ref: 'second', held: true, before: 'third' })
    expect(queue.view.map((entry) => entry.ref)).toEqual(['first', 'second', 'third'])
    for (const ref of ['first', 'third']) {
      queue.apply({ dir: 'queue', at, text: ref, ref, held: true })
      expect(queue.view.map((entry) => entry.ref)).toEqual(['first', 'second', 'third'])
    }
    expect(queue.view.every((entry) => entry.held)).toBe(true)
  })

  it('moves held messages without changing their content, attachments or release state', () => {
    const queue = new ChatQueue()
    const image = { id: `${'a'.repeat(64)}.png`, width: 4, height: 3 }
    queue.apply({ dir: 'queue', at, text: 'first', ref: 'first' })
    queue.apply({ dir: 'queue', at, text: 'look', ref: 'second', images: [image] })
    queue.turnEnded('failed')
    const original = queue.view
    queue.apply({ dir: 'queue', at, text: null, ref: 'second', move: 'up' })
    expect(queue.view).toEqual([original[1], original[0]])
    expect(queue.next()).toBeNull()
    queue.apply({ dir: 'queue', at, text: null, ref: 'second', move: 'up' })
    queue.apply({ dir: 'queue', at, text: null, ref: 'first', move: 'down' })
    queue.apply({ dir: 'queue', at, text: null, ref: 'missing', move: 'up' })
    expect(queue.view).toEqual([original[1], original[0]])
    queue.apply({ dir: 'queue', at, text: null, ref: 'second', move: 'down' })
    expect(queue.view).toEqual(original)
    queue.apply({ dir: 'queue', at, text: null, ref: 'second', release: true })
    expect(queue.next()).toMatchObject({ ref: 'second', images: [image] })
  })

  it('keeps the images a message waits with', () => {
    const queue = new ChatQueue()
    const image = { id: `${'a'.repeat(64)}.png`, width: 4, height: 3 }
    queue.apply({ dir: 'queue', at, text: 'look', ref: 'ref-1', images: [image] })
    expect(queue.next()).toEqual({ text: 'look', images: [image], ref: 'ref-1' })
    expect(queue.get(undefined)).toEqual({ text: 'look', held: false, images: [image], ref: 'ref-1' })
  })
})
