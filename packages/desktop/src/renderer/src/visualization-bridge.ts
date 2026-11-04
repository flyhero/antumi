import { z } from 'zod'

const Scalar = z.union([z.string().max(1000), z.number().finite(), z.boolean()])
const Control = z.object({ id: z.string().max(100), label: z.string().max(200), value: Scalar, unit: z.string().max(30).optional() }).and(z.discriminatedUnion('type', [
  z.object({ type: z.literal('range'), min: z.number().finite(), max: z.number().finite(), step: z.number().positive().optional() }),
  z.object({ type: z.literal('color') }),
  z.object({ type: z.literal('toggle') }),
  z.object({ type: z.literal('select'), options: z.array(z.object({ label: z.string().max(200), value: z.string().max(1000) })).max(12) })
]))
export const VisualizationPanel = z.object({ id: z.string().max(100), label: z.string().max(200), controls: z.array(Control).max(12) })
export type VisualizationPanel = z.infer<typeof VisualizationPanel>
export const VisualizationMessage = z.intersection(z.object({ antumiVisualization: z.string() }), z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('ready') }),
  z.object({ kind: z.literal('height'), height: z.number().finite().nonnegative().max(10_000) }),
  z.object({ kind: z.literal('controls'), panels: z.array(VisualizationPanel).max(12) }),
  z.object({ kind: z.literal('state'), id: z.number().int(), state: z.unknown() }),
  z.object({ kind: z.literal('followup'), id: z.number().int(), prompt: z.string().trim().min(1).max(20_000), title: z.string().max(250).optional() }),
  z.object({ kind: z.literal('display'), id: z.number().int(), mode: z.enum(['inline', 'fullscreen']) }),
  z.object({ kind: z.literal('error'), message: z.string().max(2000) })
]))

export function visualizationState(raw: unknown): unknown {
  try {
    const text = JSON.stringify(raw)
    if (!text || text.length > 16_384) return null
    const parsed = z.json().safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch { return null }
}
