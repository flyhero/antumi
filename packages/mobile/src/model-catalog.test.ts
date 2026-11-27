import { describe, expect, it, vi } from 'vitest'
import { requestModelCatalog } from './model-catalog'

describe('phone model discovery', () => {
  it('keeps the selected provider when it returns no models or is unavailable', async () => {
    const read = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('removed provider'))
    expect(await requestModelCatalog(read, 'claude', 'gateway')).toBeNull()
    expect(await requestModelCatalog(read, 'claude', 'gateway')).toBeNull()
    expect(read.mock.calls).toEqual([[{ agent: 'claude', modelProvider: 'gateway' }], [{ agent: 'claude', modelProvider: 'gateway' }]])
  })
  it('queries native models only when local configuration was selected', async () => {
    const catalog = { models: [{ id: 'native-model', label: 'Native', description: null, isDefault: true, efforts: [] }] }
    const read = vi.fn().mockResolvedValue(catalog)
    expect(await requestModelCatalog(read, 'claude', null)).toEqual(catalog)
    expect(read).toHaveBeenCalledWith({ agent: 'claude' })
  })
})
