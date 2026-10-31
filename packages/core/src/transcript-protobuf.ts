export type ProtoField = { field: number; value: number | Uint8Array }

// Only the wire format is shared; field numbers remain with the provider's reader.
export function protoFields(data: Uint8Array): ProtoField[] {
  const fields: ProtoField[] = []
  let offset = 0
  const varint = (): number => {
    let value = 0n
    for (let shift = 0n; shift < 70n && offset < data.length; shift += 7n) {
      const byte = data[offset++]!
      value |= BigInt(byte & 127) << shift
      if (!(byte & 128)) return Number(value)
    }
    throw new Error('truncated protobuf varint')
  }
  while (offset < data.length) {
    const tag = varint()
    const field = Math.floor(tag / 8)
    const wire = tag % 8
    if (!field || fields.length > 1_000_000) throw new Error('invalid protobuf field')
    if (wire === 0) fields.push({ field, value: varint() })
    else if (wire === 1 || wire === 2 || wire === 5) {
      const length = wire === 2 ? varint() : wire === 1 ? 8 : 4
      if (!Number.isSafeInteger(length) || length < 0 || offset + length > data.length) throw new Error('truncated protobuf field')
      fields.push({ field, value: data.subarray(offset, offset + length) })
      offset += length
    } else throw new Error('unsupported protobuf wire type')
  }
  return fields
}
export const protoBytes = (data: Uint8Array, field: number): Uint8Array | null => {
  const value = protoFields(data).find((each) => each.field === field)?.value
  return value instanceof Uint8Array ? value : null
}
export const protoAllBytes = (data: Uint8Array, field: number): Uint8Array[] => protoFields(data).flatMap((each) => each.field === field && each.value instanceof Uint8Array ? [each.value] : [])
export const protoText = (data: Uint8Array, field: number): string => {
  const bytes = protoBytes(data, field)
  return bytes ? Buffer.from(bytes).toString('utf8') : ''
}
export const protoNumber = (data: Uint8Array, field: number): number | null => {
  const value = protoFields(data).find((each) => each.field === field)?.value
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : null
}
export function protoPreview(data: Uint8Array): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [index, { field, value }] of protoFields(data).entries()) {
    if (index >= 50) { result.truncated = true; break }
    const key = `${field}:${index}`
    if (typeof value === 'number') result[key] = value
    else {
      const text = Buffer.from(value).toString('utf8')
      result[key] = /[\x00-\x08\x0e-\x1f\ufffd]/.test(text) ? { hex: Buffer.from(value.subarray(0, 2048)).toString('hex') } : text.slice(0, 20_000)
    }
  }
  return result
}
