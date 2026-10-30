import { describe, expect, it } from 'vitest'
import { chromeUserAgent, mobileUserAgent } from './user-agent'

describe('chromeUserAgent', () => {
  it('drops the app and Electron, keeping the platform and Chrome major', () => {
    const electron = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Antumi/0.21.1 Chrome/146.0.7680.65 Electron/44.4.3 Safari/537.36'
    expect(chromeUserAgent(electron, '146.0.7680.65')).toBe('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36')
  })

  it('keeps the Windows platform as it is', () => {
    const electron = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antumi/0.21.1 Chrome/146.0.7680.65 Electron/44.4.3 Safari/537.36'
    expect(chromeUserAgent(electron, '146.0.7680.65')).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36')
  })

  it('at least drops Electron from a string of another shape', () => {
    expect(chromeUserAgent('Something Electron/44.4.3 Safari/537.36', '146.0.1.2')).toBe('Something Safari/537.36')
  })
})

describe('mobileUserAgent', () => {
  it('says Android Chrome, with Mobile only for a phone', () => {
    expect(mobileUserAgent('146.0.7680.65', true)).toBe('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36')
    expect(mobileUserAgent('146.0.7680.65', false)).toBe('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36')
  })
})
