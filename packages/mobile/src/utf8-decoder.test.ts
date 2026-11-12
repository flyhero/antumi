import { describe, expect, it } from 'vitest'
import { Utf8Decoder } from './utf8-decoder'

describe('Utf8Decoder', () => {
  it('decodes as the platform decoder does', () => {
    for (const text of ['hello', '会话在等你确认', 'emoji 😀 and ñ', '']) {
      const bytes = new TextEncoder().encode(text)
      expect(new Utf8Decoder('utf-8', { fatal: true }).decode(bytes)).toBe(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    }
  })

  it('throws on broken input when fatal, and replaces it otherwise', () => {
    for (const bytes of [[0xc3], [0xe4, 0xbd], [0xed, 0xa0, 0x80], [0xc0, 0x80], [0xf5, 0x80, 0x80, 0x80]]) {
      expect(() => new Utf8Decoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))).toThrow(TypeError)
      expect(() => new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))).toThrow(TypeError)
    }
    expect(new Utf8Decoder().decode(Uint8Array.from([0x61, 0xff, 0x62]))).toBe('a�b')
  })
})
