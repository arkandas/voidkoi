import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { BodyTooLarge, readBody, readJson, saveBody } from './request'

/** A request whose body arrives in pieces, without a declared length. */
function streamed(parts: string[], headers: Record<string, string> = {}): Request {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part))
      controller.close()
    },
  })
  return new Request('http://localhost/x', { method: 'POST', body, headers, duplex: 'half' } as RequestInit)
}

describe('readBody', () => {
  it('reads a body within the limit', async () => {
    expect((await readBody(streamed(['ab', 'cd']), 4)).toString()).toBe('abcd')
  })

  it('refuses a declared length over the limit before reading', async () => {
    const request = new Request('http://localhost/x', { method: 'POST', body: 'abcdef', headers: { 'content-length': '6' } })
    await expect(readBody(request, 5)).rejects.toBeInstanceOf(BodyTooLarge)
  })

  it('stops a body without a length once it passes the limit', async () => {
    await expect(readBody(streamed(['abc', 'def']), 4)).rejects.toBeInstanceOf(BodyTooLarge)
  })
})

describe('readJson', () => {
  it('reads an object', async () => {
    expect(await readJson(streamed(['{"a":', '1}']))).toEqual({ a: 1 })
  })

  it('is null for anything but an object, or too much of it', async () => {
    expect(await readJson(streamed(['[1]']))).toBeNull()
    expect(await readJson(streamed(['not json']))).toBeNull()
    expect(await readJson(streamed(['{"a":"', 'x'.repeat(50), '"}']), 20)).toBeNull()
  })
})

describe('saveBody', () => {
  const dir = mkdtemp(join(tmpdir(), 'voidkoi-request-'))
  afterAll(async () => rm(await dir, { recursive: true, force: true }))

  it('writes the body to a new file and returns its size', async () => {
    const path = join(await dir, 'ok')
    expect(await saveBody(streamed(['hello ', 'world']), path, 100)).toBe(11)
    expect(await readFile(path, 'utf8')).toBe('hello world')
  })

  it('removes the partial file when the body runs past the limit', async () => {
    const path = join(await dir, 'big')
    await expect(saveBody(streamed(['12345', '67890']), path, 7)).rejects.toBeInstanceOf(BodyTooLarge)
    await expect(stat(path)).rejects.toThrow()
  })

  it('never overwrites a file that is there', async () => {
    const path = join(await dir, 'ok')
    await expect(saveBody(streamed(['x']), path, 100)).rejects.toThrow()
    expect(await readFile(path, 'utf8')).toBe('hello world')
  })
})
