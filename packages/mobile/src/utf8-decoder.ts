// A strict UTF-8 decoder in TextDecoder's shape, for a JS engine without one.
export class Utf8Decoder {
  readonly encoding = 'utf-8'
  readonly fatal: boolean
  readonly ignoreBOM = false

  constructor(_label = 'utf-8', options: { fatal?: boolean } = {}) {
    this.fatal = options.fatal ?? false
  }

  decode(input?: ArrayBuffer | ArrayBufferView): string {
    if (!input) return ''
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
    let out = ''
    for (let i = 0; i < bytes.length;) {
      const first = bytes[i]!
      const length = first < 0x80 ? 1 : first >= 0xf0 && first < 0xf5 ? 4 : first >= 0xe0 ? 3 : first >= 0xc2 && first < 0xe0 ? 2 : 0
      let point = length === 1 ? first : length === 2 ? first & 0x1f : length === 3 ? first & 0x0f : first & 0x07
      let valid = length > 0 && i + length <= bytes.length
      for (let k = 1; valid && k < length; k++) {
        const next = bytes[i + k]!
        if ((next & 0xc0) !== 0x80) valid = false
        point = (point << 6) | (next & 0x3f)
      }
      if (valid && ((length === 3 && (point < 0x800 || (point >= 0xd800 && point <= 0xdfff))) || (length === 4 && (point < 0x10000 || point > 0x10ffff)))) valid = false
      if (!valid) {
        if (this.fatal) throw new TypeError('invalid UTF-8')
        out += '�'
        i += 1
        continue
      }
      out += String.fromCodePoint(point)
      i += length
    }
    return out
  }
}
