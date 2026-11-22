import { z } from 'zod'

// A session config option (mode, model, reasoning level) as ACP lists it, its values flat or grouped.
// A model value may also say what it takes at once and what it costs, where its agent tells.
export const AcpOptionValue = z.looseObject({ value: z.string(), name: z.string(), description: z.string().nullish(), contextWindow: z.number().nullish(), costRate: z.string().nullish() })
export type AcpOptionValue = z.infer<typeof AcpOptionValue>
export const AcpConfig = z.looseObject({ id: z.string(), category: z.string().optional(), name: z.string(), currentValue: z.string(), options: z.array(z.union([AcpOptionValue, z.looseObject({ group: z.string(), options: z.array(AcpOptionValue) })])).catch([]) })
export type AcpConfig = z.infer<typeof AcpConfig>
// The options Antumi can read: a kind it does not know (a boolean switch) is left out, not the list.
export const AcpConfigs = z.array(z.unknown()).transform((options) => options.flatMap((option) => {
  const config = AcpConfig.safeParse(option)
  return config.success ? [config.data] : []
}))

export const valuesOf = (config: AcpConfig): AcpOptionValue[] => config.options.flatMap((option) => {
  const single = AcpOptionValue.safeParse(option)
  if (single.success) return [single.data]
  return z.looseObject({ options: z.array(AcpOptionValue) }).safeParse(option).data?.options ?? []
})

// A model an agent lists beyond its session config, with the config options (its reasoning
// levels) it takes.
export type AcpModel = { value: string; name: string; contextWindow?: number | null; costRate?: string | null; configOptions: AcpConfig[] }
