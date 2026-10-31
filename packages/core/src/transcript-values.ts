import { z } from 'zod'

const ObjectValue = z.record(z.string(), z.unknown())
export const object = (value: unknown): Record<string, unknown> => ObjectValue.safeParse(value).data ?? {}
export const array = (value: unknown): unknown[] => z.array(z.unknown()).safeParse(value).data ?? []
export const string = (value: unknown): string => typeof value === 'string' ? value : ''
export const number = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
export function json(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return null }
}
export function timestamp(value: unknown, fallback: number): number {
  return number(value) ?? (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? Date.parse(value) : fallback)
}
export function contentText(value: unknown): string {
  if (typeof value === 'string') return value
  const data = object(value)
  if (string(data.text)) return string(data.text)
  const parts = array(Array.isArray(value) ? value : data.parts)
  const text = parts.map((part) => {
    const item = object(part)
    return string(item.text) || string(item.content)
  }).filter(Boolean).join('\n')
  return text || (parts.some((part) => /image/.test(string(object(part).type)) || object(part).inlineData || object(part).inline_data) ? '[图片]' : '')
}
export function printed(value: unknown): string | null {
  if (value == null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}
