import type { ModelProviderPresetId } from '@antumi/protocol'

// Who sells each plan, for the mark that tells the presets apart at a glance: a vendor's plans share
// its colour (--vendor-* in styles.css), and the mark is the letter its users know it by.
export type ProviderVendor = 'volcengine' | 'zhipu' | 'kimi' | 'minimax' | 'bailian' | 'deepseek'

export const PRESET_VENDOR: Record<ModelProviderPresetId, { vendor: ProviderVendor; mark: string }> = {
  'volcengine-agent-plan': { vendor: 'volcengine', mark: '火' },
  'volcengine-coding-plan': { vendor: 'volcengine', mark: '火' },
  'zhipu-glm-coding': { vendor: 'zhipu', mark: '智' },
  'zai-glm-coding': { vendor: 'zhipu', mark: 'Z' },
  'kimi-code': { vendor: 'kimi', mark: 'K' },
  'minimax-cn': { vendor: 'minimax', mark: 'M' },
  minimax: { vendor: 'minimax', mark: 'M' },
  'bailian-token-plan': { vendor: 'bailian', mark: '百' },
  deepseek: { vendor: 'deepseek', mark: 'D' }
}
