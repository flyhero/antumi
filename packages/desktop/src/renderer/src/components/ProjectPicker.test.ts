import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  vi.stubGlobal('window', { antumi: undefined, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) })
  vi.stubGlobal('navigator', { userAgent: 'Mac', platform: 'MacIntel' })
})

const { projectLocation } = await import('./ProjectPicker')

describe('projectLocation', () => {
  const mac = { path: '/Users/ann', windows: false }

  it('names the folder holding a project, with core\'s home as ~', () => {
    expect(projectLocation('/Users/ann/ai-projects/antumi', mac)).toBe('~/ai-projects')
    expect(projectLocation('/Users/ann/antumi', mac)).toBe('~')
    expect(projectLocation('/home/ann/code/antumi/', { path: '/home/ann/', windows: false })).toBe('~/code')
  })

  it('leaves a folder outside home, or only sharing its prefix, as it is', () => {
    expect(projectLocation('/opt/src/antumi', mac)).toBe('/opt/src')
    expect(projectLocation('/Users/anna/code/antumi', mac)).toBe('/Users/anna/code')
    expect(projectLocation('/antumi', mac)).toBe('/')
  })

  it('keeps Windows paths whole, where ~ is not a folder anyone types', () => {
    const windows = { path: 'C:\\Users\\ann', windows: true }
    expect(projectLocation('C:\\Users\\ann\\code\\antumi', windows)).toBe('C:\\Users\\ann\\code')
    expect(projectLocation('D:\\antumi', windows)).toBe('D:\\')
    expect(projectLocation('\\\\wsl$\\Ubuntu\\home\\ann\\antumi', windows)).toBe('\\\\wsl$\\Ubuntu\\home\\ann')
  })

  it('shows the folder without ~ when core did not say where home is', () => {
    expect(projectLocation('/Users/ann/ai-projects/antumi')).toBe('/Users/ann/ai-projects')
  })
})
