import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { MobileBridge as MobileBridgeStatus, MobileBridgeState } from '@antumi/protocol'
import { bridgePhoneUrl } from './bridge-protocol'
import type { GatewayBridge } from './gateway'

// The bridge on the user's own server, as core keeps it (docs/MOBILE.md): its address, and this
// computer's id there with the secret that proves it, made once and kept beside the phone key. The
// gateway holds the link to it; core says where to and hears how it goes.

const StoredBridge = z.object({ address: z.string(), id: z.string(), secret: z.string() })

export class MobileBridgeSettings {
  private config: GatewayBridge | null
  private state: { state: MobileBridgeState; error: string | null } = { state: 'off', error: null }

  // `dir` is <home>/mobile.
  constructor(private readonly dir: string) {
    this.config = this.load()
  }

  gatewayConfig(): GatewayBridge | null {
    return this.config
  }

  // What phones are given to reach this computer through the bridge.
  phoneUrls(): string[] {
    return this.config ? [bridgePhoneUrl(this.config.address, this.config.id)] : []
  }

  status(): MobileBridgeStatus | null {
    return this.config ? { address: this.config.address, ...this.state } : null
  }

  setState(state: MobileBridgeState, error: string | null): void {
    this.state = { state, error }
  }

  // A new address keeps the id and secret: a bridge that knew this computer still does.
  async configure(address: string): Promise<void> {
    this.config = this.config
      ? { ...this.config, address }
      : { address, id: randomBytes(16).toString('base64url'), secret: randomBytes(32).toString('base64url') }
    this.state = { state: 'off', error: null }
    await mkdir(this.dir, { recursive: true, mode: 0o700 })
    await writeFile(this.file(), JSON.stringify(this.config), { mode: 0o600 })
  }

  async remove(): Promise<void> {
    this.config = null
    this.state = { state: 'off', error: null }
    await rm(this.file(), { force: true })
  }

  private load(): GatewayBridge | null {
    try {
      const parsed = StoredBridge.safeParse(JSON.parse(readFileSync(this.file(), 'utf8')))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private file(): string {
    return path.join(this.dir, 'bridge.json')
  }
}
