import { createPrivateKey, createPublicKey } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { computerTunnelConfig, phoneTunnelConfig, relayKeys, relayServerScript, wireGuardKey, type RelayConfig } from './relay-config'

const config = (server = '8.159.153.95'): RelayConfig => ({ server, port: 51820, keys: relayKeys() })

describe('the relay tunnel\'s keys and configurations', () => {
  it('makes WireGuard keys: 32 bytes each, the public one X25519\'s of the private', () => {
    const key = wireGuardKey()
    expect(Buffer.from(key.privateKey, 'base64')).toHaveLength(32)
    expect(Buffer.from(key.publicKey, 'base64')).toHaveLength(32)
    const der = Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(key.privateKey, 'base64')])
    const derived = createPublicKey(createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })).export({ format: 'jwk' }).x
    expect(Buffer.from(derived ?? '', 'base64url').toString('base64')).toBe(key.publicKey)
  })

  it('gives the server only its own private key, and each side only the other\'s public one', () => {
    const relay = config()
    const script = relayServerScript(relay)
    expect(script).toContain(`PrivateKey = ${relay.keys.server.privateKey}`)
    expect(script).toContain(`PublicKey = ${relay.keys.computer.publicKey}`)
    expect(script).toContain(`PublicKey = ${relay.keys.phone.publicKey}`)
    expect(script).not.toContain(relay.keys.computer.privateKey)
    expect(script).not.toContain(relay.keys.phone.privateKey)
    expect(script).toContain('ListenPort = 51820')
    expect(script).toContain('ip_forward = 1')

    const phone = phoneTunnelConfig(relay)
    expect(phone).toContain(`PrivateKey = ${relay.keys.phone.privateKey}`)
    expect(phone).toContain(`PublicKey = ${relay.keys.server.publicKey}`)
    expect(phone).toContain('Endpoint = 8.159.153.95:51820')
    expect(phone).toContain('AllowedIPs = 10.77.0.0/24')
    expect(phone).not.toContain(relay.keys.server.privateKey)
    expect(phone).not.toContain(relay.keys.computer.privateKey)

    const computer = computerTunnelConfig(relay, 7820)
    expect(computer).toContain(`PrivateKey = ${relay.keys.computer.privateKey}`)
    expect(computer).toContain('[TCPServerTunnel]\nListenPort = 7820\nTarget = 127.0.0.1:7820')
    expect(computer).toContain('PersistentKeepalive = 25')
    expect(computer).not.toContain(relay.keys.server.privateKey)
  })

  it('shapes the tunnel just under the server\'s bandwidth when told it, and not otherwise', () => {
    const shaped = relayServerScript({ ...config(), bandwidth: 3 })
    expect(shaped).toContain('htb rate 2790kbit ceil 2790kbit')
    expect(shaped).toContain('fq_codel')
    expect(shaped).toContain('iproute-tc')
    expect(relayServerScript(config())).not.toContain('tc qdisc')
  })

  it('brackets an IPv6 server in the endpoint', () => {
    expect(phoneTunnelConfig(config('2001:db8::1'))).toContain('Endpoint = [2001:db8::1]:51820')
  })

  it('writes keys the server script\'s quoted here-documents carry as they are', () => {
    // Nothing a shell would expand inside the unquoted outer command.
    expect(relayServerScript(config())).toMatch(/^bash <<'ANTUMI_RELAY'\n[\s\S]*\nANTUMI_RELAY\n$/)
  })
})
