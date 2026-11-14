import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { MOBILE_BRIDGE_DEFAULT_PORT } from '@antumi/protocol'
import { bridgeInstallScript } from './bridge-install'
import { BRIDGE_DEFAULT_PORT } from './bridge-protocol'

describe('the bridge\'s install script', () => {
  it('has the bridge listen where phones are told it does', () => {
    expect(BRIDGE_DEFAULT_PORT).toBe(MOBILE_BRIDGE_DEFAULT_PORT)
  })

  it('carries the bundle intact, and runs it on the bridge\'s port under systemd', () => {
    const bundle = Buffer.from(`console.log(${JSON.stringify('x'.repeat(5000))})\n`)
    const script = bridgeInstallScript(bundle)
    const packed = /<<'BUNDLE' \| gunzip > [^\n]+\n([\s\S]*?)\nBUNDLE\n/.exec(script)?.[1] ?? ''
    expect(packed.split('\n').every((line) => line.length <= 76)).toBe(true)
    expect(gunzipSync(Buffer.from(packed.replace(/\n/g, ''), 'base64'))).toEqual(bundle)
    expect(script).toContain('--port 7830 --data /var/lib/antumi-bridge')
    expect(script).toContain('DynamicUser=yes')
    expect(script).toMatch(/^bash <<'ANTUMI_BRIDGE'\n[\s\S]*\nANTUMI_BRIDGE\n$/)
  })
})
